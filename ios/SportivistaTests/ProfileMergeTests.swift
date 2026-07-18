//
//  ProfileMergeTests.swift
//  SportivistaTests
//
//  WP-19 acceptance — the merge is the deliverable's heart, so it is pinned
//  exhaustively and WITHOUT any iCloud: concurrent edits on two devices,
//  delete-vs-update conflict, tombstone respect (both directions + legitimate
//  revival), episodic append-union, counter sum/max, clock-skew tie-break, and
//  the three CRDT properties (commutative, idempotent, order-independent
//  convergence), plus exact push-set correctness.
//

import XCTest

final class ProfileMergeTests: XCTestCase {

    // MARK: - Fixtures

    private func t(_ offset: TimeInterval) -> Date { Date(timeIntervalSince1970: 1_700_000_000 + offset) }

    private func rule(_ id: String, weight: Double = 0.5, scope: String? = nil, reason: String = "grunn") -> InterestRule {
        InterestRule(entityId: id, entityName: id.capitalized, sport: "tennis",
                     scope: scope, weight: weight, reason: reason, addedAt: t(0))
    }

    private func synced(_ id: String, at: TimeInterval, device: String, deleted: Bool = false,
                        weight: Double = 0.5, scope: String? = nil) -> SyncedRule {
        SyncedRule(rule: rule(id, weight: weight, scope: scope), modifiedAt: t(at), deviceID: device, deleted: deleted)
    }

    private func note(_ id: String, at: TimeInterval, resolved: TimeInterval? = nil, text: String? = nil) -> EpisodicNote {
        EpisodicNote(id: id, kind: "misunderstood", createdAt: t(at),
                     note: text, resolvedAt: resolved.map(t))
    }

    // MARK: - Rules: concurrent edits + LWW

    func test_concurrentAddsOnTwoDevices_union() {
        let local = ProfileSyncState(rules: [synced("a", at: 10, device: "A")])
        let remote = ProfileSyncState(rules: [synced("b", at: 10, device: "B")])
        let out = ProfileMerge.merge(local: local, remote: remote)

        XCTAssertEqual(out.merged.rules.map(\.entityId), ["a", "b"])
        // The remote lacks "a" only → that is the whole push set.
        XCTAssertEqual(out.toPush.rules.map(\.entityId), ["a"])
    }

    func test_updateConflict_newerModifiedAtWins() {
        let local = ProfileSyncState(rules: [synced("a", at: 20, device: "A", weight: 0.9)])
        let remote = ProfileSyncState(rules: [synced("a", at: 10, device: "B", weight: 0.3)])
        let out = ProfileMerge.merge(local: local, remote: remote)

        XCTAssertEqual(out.merged.rules.count, 1)
        XCTAssertEqual(out.merged.rules.first?.rule.weight, 0.9, "newer modifiedAt wins")
        XCTAssertEqual(out.toPush.rules.map(\.entityId), ["a"], "remote is behind → push the winner")
    }

    func test_remoteNewer_notPushed() {
        let local = ProfileSyncState(rules: [synced("a", at: 10, device: "A", weight: 0.3)])
        let remote = ProfileSyncState(rules: [synced("a", at: 20, device: "B", weight: 0.9)])
        let out = ProfileMerge.merge(local: local, remote: remote)

        XCTAssertEqual(out.merged.rules.first?.rule.weight, 0.9)
        XCTAssertTrue(out.toPush.isEmpty, "remote already holds the winner → nothing to push")
    }

    // MARK: - Delete vs update + tombstones

    func test_deleteVsUpdate_newerDeleteWins_andIsRespected() {
        // Local deleted (newer), remote updated it (older) — the delete must win
        // and the tombstone must be kept (not dropped, not revived).
        let local = ProfileSyncState(rules: [synced("a", at: 30, device: "A", deleted: true)])
        let remote = ProfileSyncState(rules: [synced("a", at: 20, device: "B", weight: 0.9)])
        let out = ProfileMerge.merge(local: local, remote: remote)

        XCTAssertEqual(out.merged.rules.count, 1)
        XCTAssertTrue(out.merged.rules.first?.deleted == true, "tombstone survives the merge")
        XCTAssertTrue(out.merged.profile.isEmpty, "the live projection excludes the tombstone")
        XCTAssertEqual(out.toPush.rules.map(\.entityId), ["a"], "remote must learn the deletion")
    }

    func test_staleUpdate_doesNotReviveDeletedRule() {
        // Remote holds a NEWER tombstone; local a stale live copy. The merged
        // profile must not contain "a".
        let local = ProfileSyncState(rules: [synced("a", at: 10, device: "A", weight: 0.9)])
        let remote = ProfileSyncState(rules: [synced("a", at: 40, device: "B", deleted: true)])
        let out = ProfileMerge.merge(local: local, remote: remote)

        XCTAssertTrue(out.merged.profile.isEmpty, "a stale live copy cannot resurrect a newer tombstone")
        XCTAssertTrue(out.toPush.isEmpty, "remote already has the winning tombstone")
    }

    func test_newerUpdate_legitimatelyRevivesTombstone() {
        // A genuinely newer re-follow SHOULD beat an older tombstone.
        let local = ProfileSyncState(rules: [synced("a", at: 50, device: "A", weight: 0.7)])
        let remote = ProfileSyncState(rules: [synced("a", at: 20, device: "B", deleted: true)])
        let out = ProfileMerge.merge(local: local, remote: remote)

        XCTAssertEqual(out.merged.profile.rules.map(\.entityId), ["a"], "newer re-follow wins over stale tombstone")
        XCTAssertEqual(out.toPush.rules.map(\.entityId), ["a"])
    }

    // MARK: - Clock-skew tie-break (equal modifiedAt)

    func test_clockSkewTie_higherDeviceIDWins_andSymmetric() {
        let a = ProfileSyncState(rules: [synced("x", at: 10, device: "A", weight: 0.1)])
        let b = ProfileSyncState(rules: [synced("x", at: 10, device: "B", weight: 0.2)])
        let ab = ProfileMerge.merge(local: a, remote: b)
        let ba = ProfileMerge.merge(local: b, remote: a)

        XCTAssertEqual(ab.merged.rules.first?.rule.weight, 0.2, "higher deviceID wins on an exact clock tie")
        XCTAssertEqual(ab.merged, ba.merged, "the tie-break is symmetric (commutative)")
    }

    func test_clockSkewTie_deleteWinsOverLiveEdit() {
        // Same instant, same non-decisive deviceID ordering aside: a tombstone is
        // the safer resolution on a true tie.
        let live = ProfileSyncState(rules: [synced("x", at: 10, device: "A", weight: 0.9)])
        let dead = ProfileSyncState(rules: [synced("x", at: 10, device: "A", deleted: true)])
        let out = ProfileMerge.merge(local: live, remote: dead)
        XCTAssertTrue(out.merged.rules.first?.deleted == true)
        XCTAssertEqual(out.merged, ProfileMerge.merge(local: dead, remote: live).merged, "symmetric")
    }

    // MARK: - Episodic: append-only union

    func test_episodic_appendUnion() {
        let local = ProfileSyncState(episodic: [note("n1", at: 1)])
        let remote = ProfileSyncState(episodic: [note("n2", at: 2)])
        let out = ProfileMerge.merge(local: local, remote: remote)

        XCTAssertEqual(out.merged.episodic.map(\.id), ["n1", "n2"], "both notes survive")
        XCTAssertEqual(out.toPush.episodic.map(\.id), ["n1"], "remote lacks n1 only")
    }

    func test_episodic_sameId_reconcilesDeterministically() {
        // Same note, resolved on one side + noted on the other → earliest
        // resolution + the present note, order-independent.
        let l = ProfileSyncState(episodic: [note("n", at: 1, resolved: 9, text: "mente Ruud")])
        let r = ProfileSyncState(episodic: [note("n", at: 1, resolved: 5, text: nil)])
        let lr = ProfileMerge.merge(local: l, remote: r).merged
        let rl = ProfileMerge.merge(local: r, remote: l).merged

        XCTAssertEqual(lr.episodic.count, 1)
        XCTAssertEqual(lr.episodic.first?.resolvedAt, t(5), "earliest resolution wins")
        XCTAssertEqual(lr.episodic.first?.note, "mente Ruud", "a present note beats an absent one")
        XCTAssertEqual(lr, rl, "reconcile is symmetric")
    }

    // MARK: - Counters: grow-only G-Counter (max per device, sum total)

    func test_counters_maxPerDevice_sumTotal() {
        let local = ProfileSyncState(counters: [Counter(key: "opens", perDevice: ["A": 3])])
        let remote = ProfileSyncState(counters: [Counter(key: "opens", perDevice: ["A": 1, "B": 5])])
        let out = ProfileMerge.merge(local: local, remote: remote)

        let merged = out.merged.counters.first { $0.key == "opens" }
        XCTAssertEqual(merged?.perDevice, ["A": 3, "B": 5], "each device's sub-count merges by max")
        XCTAssertEqual(merged?.total, 8, "the value is the sum across devices")
        XCTAssertEqual(out.toPush.counters.map(\.key), ["opens"], "remote's A is behind → push")
    }

    // MARK: - CRDT properties

    private func sampleA() -> ProfileSyncState {
        ProfileSyncState(
            rules: [synced("a", at: 10, device: "A"), synced("b", at: 30, device: "A", weight: 0.8),
                    synced("d", at: 40, device: "A", deleted: true)],
            episodic: [note("n1", at: 1), note("shared", at: 2, resolved: 8)],
            counters: [Counter(key: "opens", perDevice: ["A": 4])]
        )
    }

    private func sampleB() -> ProfileSyncState {
        ProfileSyncState(
            rules: [synced("b", at: 20, device: "B", weight: 0.2), synced("c", at: 15, device: "B"),
                    synced("d", at: 25, device: "B")],
            episodic: [note("n2", at: 3), note("shared", at: 2, text: "notat")],
            counters: [Counter(key: "opens", perDevice: ["A": 1, "B": 9]), Counter(key: "follows", perDevice: ["B": 2])]
        )
    }

    func test_commutative() {
        let ab = ProfileMerge.merge(local: sampleA(), remote: sampleB()).merged
        let ba = ProfileMerge.merge(local: sampleB(), remote: sampleA()).merged
        XCTAssertEqual(ab, ba, "merge is commutative on the merged state")
    }

    func test_idempotent() {
        let a = sampleA()
        let out = ProfileMerge.merge(local: a, remote: a)
        XCTAssertEqual(out.merged, a.deduplicated(), "merging a state with itself is a no-op")
        XCTAssertTrue(out.toPush.isEmpty, "a self-merge pushes nothing")
    }

    func test_convergence_orderIndependent() {
        let a = sampleA(), b = sampleB()
        let c = ProfileSyncState(rules: [synced("b", at: 35, device: "C", weight: 0.55), synced("e", at: 5, device: "C")])

        // (a ⊔ b) ⊔ c  ==  a ⊔ (b ⊔ c)  ==  (c ⊔ a) ⊔ b
        let leftAssoc = ProfileMerge.merge(local: ProfileMerge.merge(local: a, remote: b).merged, remote: c).merged
        let rightAssoc = ProfileMerge.merge(local: a, remote: ProfileMerge.merge(local: b, remote: c).merged).merged
        let reordered = ProfileMerge.merge(local: ProfileMerge.merge(local: c, remote: a).merged, remote: b).merged

        XCTAssertEqual(leftAssoc, rightAssoc, "associative")
        XCTAssertEqual(leftAssoc, reordered, "order-independent convergence")
        // "b" was last written on C (t=35) → C's copy wins across the fold.
        XCTAssertEqual(leftAssoc.rules.first { $0.entityId == "b" }?.rule.weight, 0.55)
    }

    // MARK: - Push-set exactness

    func test_pushSet_isExactlyWhatRemoteLacksOrIsBehindOn() {
        let local = ProfileSyncState(rules: [
            synced("a", at: 10, device: "A"),           // remote missing → push
            synced("b", at: 30, device: "A", weight: 0.9), // local newer → push
        ])
        let remote = ProfileSyncState(rules: [
            synced("b", at: 10, device: "B", weight: 0.1), // older
            synced("c", at: 40, device: "B"),              // remote-only, remote current → no push
        ])
        let out = ProfileMerge.merge(local: local, remote: remote)

        XCTAssertEqual(out.merged.rules.map(\.entityId), ["a", "b", "c"])
        XCTAssertEqual(out.toPush.rules.map(\.entityId), ["a", "b"], "only records the remote is behind on")
    }

    // MARK: - Robustness

    func test_deduplicatesMalformedInputWithinAState() {
        // Two records for the same id in one state — deduped the same way as a
        // cross-device merge (newer wins), so the merge is total.
        let messy = ProfileSyncState(rules: [
            synced("a", at: 10, device: "A", weight: 0.1),
            synced("a", at: 20, device: "A", weight: 0.9),
        ])
        let out = ProfileMerge.merge(local: messy, remote: ProfileSyncState())
        XCTAssertEqual(out.merged.rules.count, 1)
        XCTAssertEqual(out.merged.rules.first?.rule.weight, 0.9)
    }
}
