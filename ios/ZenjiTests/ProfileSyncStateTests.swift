//
//  ProfileSyncStateTests.swift
//  ZenjiTests
//
//  WP-19 — the transport shape's own contracts: the live projection (tombstones
//  filtered, sorted exactly like InterestProfile.applying), write-time stamping
//  (only changes get a new modifiedAt/deviceID; removals become tombstones), and
//  the backward-compatible decode of a legacy flat WP-16…WP-18 profile.
//

import XCTest

final class ProfileSyncStateTests: XCTestCase {

    private func t(_ offset: TimeInterval) -> Date { Date(timeIntervalSince1970: 1_700_000_000 + offset) }

    private func rule(_ id: String, sport: String, name: String, weight: Double = 0.5) -> InterestRule {
        InterestRule(entityId: id, entityName: name, sport: sport, scope: nil, weight: weight, reason: "grunn", addedAt: t(0))
    }

    // MARK: - Live projection

    func test_projection_dropsTombstones_andSortsLikeInterestProfile() {
        let state = ProfileSyncState(rules: [
            SyncedRule(rule: rule("r", sport: "tennis", name: "Ruud"), modifiedAt: t(1), deviceID: "A"),
            SyncedRule(rule: rule("h", sport: "golf", name: "Hovland"), modifiedAt: t(1), deviceID: "A"),
            SyncedRule(rule: rule("x", sport: "chess", name: "Xavier"), modifiedAt: t(2), deviceID: "A", deleted: true),
        ])
        // Sorted by (sport, entityName): golf < tennis; the chess tombstone drops.
        XCTAssertEqual(state.profile.rules.map(\.entityId), ["h", "r"])
    }

    // MARK: - Stamping on write

    func test_updatingRules_stampsNewRules() {
        let next = ProfileSyncState().updatingRules(to: InterestProfile(rules: [rule("r", sport: "tennis", name: "Ruud")]),
                                                    now: t(100), deviceID: "DEV")
        XCTAssertEqual(next.rules.count, 1)
        XCTAssertEqual(next.rules.first?.modifiedAt, t(100))
        XCTAssertEqual(next.rules.first?.deviceID, "DEV")
        XCTAssertFalse(next.rules.first?.deleted ?? true)
    }

    func test_updatingRules_keepsUnchangedRuleStamp() {
        let base = ProfileSyncState().updatingRules(to: InterestProfile(rules: [rule("r", sport: "tennis", name: "Ruud")]),
                                                    now: t(100), deviceID: "DEV")
        // Save the SAME profile again at a later clock — the unchanged rule must
        // keep its original stamp (no churn for peers).
        let again = base.updatingRules(to: base.profile, now: t(200), deviceID: "DEV2")
        XCTAssertEqual(again.rules.first?.modifiedAt, t(100), "unchanged rule keeps its modifiedAt")
        XCTAssertEqual(again.rules.first?.deviceID, "DEV", "unchanged rule keeps its device stamp")
    }

    func test_updatingRules_reStampsChangedRule() {
        let base = ProfileSyncState().updatingRules(to: InterestProfile(rules: [rule("r", sport: "tennis", name: "Ruud", weight: 0.5)]),
                                                    now: t(100), deviceID: "DEV")
        let changed = base.updatingRules(to: InterestProfile(rules: [rule("r", sport: "tennis", name: "Ruud", weight: 0.9)]),
                                         now: t(200), deviceID: "DEV2")
        XCTAssertEqual(changed.rules.first?.modifiedAt, t(200), "a changed payload gets a fresh stamp")
        XCTAssertEqual(changed.rules.first?.rule.weight, 0.9)
    }

    func test_updatingRules_tombstonesRemovedRule() {
        let base = ProfileSyncState().updatingRules(to: InterestProfile(rules: [rule("r", sport: "tennis", name: "Ruud")]),
                                                    now: t(100), deviceID: "DEV")
        let removed = base.updatingRules(to: InterestProfile(rules: []), now: t(200), deviceID: "DEV")
        XCTAssertEqual(removed.rules.count, 1, "the tombstone is kept, not dropped")
        XCTAssertTrue(removed.rules.first?.deleted ?? false)
        XCTAssertEqual(removed.rules.first?.modifiedAt, t(200))
        XCTAssertTrue(removed.profile.isEmpty)
    }

    func test_updatingRules_existingTombstoneNotReStamped() {
        var state = ProfileSyncState().updatingRules(to: InterestProfile(rules: [rule("r", sport: "tennis", name: "Ruud")]),
                                                     now: t(100), deviceID: "DEV")
        state = state.updatingRules(to: InterestProfile(rules: []), now: t(200), deviceID: "DEV")   // tombstone @200
        state = state.updatingRules(to: InterestProfile(rules: []), now: t(300), deviceID: "DEV")   // still absent
        XCTAssertEqual(state.rules.first?.modifiedAt, t(200), "an already-tombstoned rule isn't re-stamped")
    }

    // MARK: - Backward-compatible decode

    func test_decodesLegacyFlatProfile() throws {
        // The WP-16…WP-18 on-disk shape: rules are flat InterestRules, no sync
        // metadata. They must upgrade transparently (modifiedAt = addedAt).
        let json = """
        { "rules": [ { "entityId": "magnus-carlsen", "entityName": "Magnus Carlsen",
          "sport": "chess", "weight": 0.5, "reason": "sjakk",
          "addedAt": "2026-01-01T00:00:00Z" } ] }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let state = try decoder.decode(ProfileSyncState.self, from: Data(json.utf8))

        XCTAssertEqual(state.rules.count, 1)
        XCTAssertEqual(state.rules.first?.deviceID, "")
        XCTAssertFalse(state.rules.first?.deleted ?? true)
        XCTAssertEqual(state.profile.rule(for: "magnus-carlsen")?.lens, .sportAsSuch)
    }

    // MARK: - Normalisation / dedup

    func test_deduplicated_isDeterministic() {
        let messy = ProfileSyncState(rules: [
            SyncedRule(rule: rule("a", sport: "tennis", name: "A", weight: 0.1), modifiedAt: t(1), deviceID: "X"),
            SyncedRule(rule: rule("a", sport: "tennis", name: "A", weight: 0.9), modifiedAt: t(2), deviceID: "X"),
        ])
        let deduped = messy.deduplicated()
        XCTAssertEqual(deduped.rules.count, 1)
        XCTAssertEqual(deduped.rules.first?.rule.weight, 0.9, "newer duplicate wins")
    }
}
