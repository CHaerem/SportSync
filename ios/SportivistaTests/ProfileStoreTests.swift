//
//  ProfileStoreTests.swift
//  SportivistaTests
//
//  WP-16 acceptance — persistence round-trip. Save → load returns an equal
//  profile; a missing or corrupt file yields an empty profile (never throws on
//  read, WP-12 DataStore's robustness contract); writes are atomic. All through
//  a throwaway temp directory, never this process's real Application Support.
//

import XCTest

final class ProfileStoreTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    private func sampleProfile() -> InterestProfile {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        return InterestProfile()
            .applying(GroundedMutation(kind: .add, entity: index.entity(id: "casper-ruud")!, scope: "bare i Grand Slams", weight: 0.6, reason: "fordi Ruud", previousRule: nil), now: now)
            .applying(GroundedMutation(kind: .add, entity: index.entity(id: "viktor-hovland")!, scope: nil, weight: 0.5, reason: "golf-favoritt", previousRule: nil), now: now)
    }

    func test_saveThenLoad_roundTripsEqual() throws {
        let store = AssistantTestSupport.tempProfileStore()
        let profile = sampleProfile()
        try store.save(profile)
        XCTAssertEqual(store.load(), profile)
    }

    func test_load_fromEmptyDirectory_isEmptyProfile() {
        let store = AssistantTestSupport.tempProfileStore()
        XCTAssertTrue(store.load().isEmpty)
    }

    func test_load_corruptFile_isEmptyProfile() throws {
        let store = AssistantTestSupport.tempProfileStore()
        let url = store.directoryURL.appendingPathComponent(ProfileStore.filename)
        try Data("{ not json".utf8).write(to: url)
        XCTAssertTrue(store.load().isEmpty, "corrupt cache must degrade to empty, not crash")
    }

    func test_save_overwritesPreviousProfile() throws {
        let store = AssistantTestSupport.tempProfileStore()
        try store.save(sampleProfile())

        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let replacement = InterestProfile().applying(
            GroundedMutation(kind: .add, entity: index.entity(id: "magnus-carlsen")!, scope: nil, weight: 0.5, reason: "sjakk", previousRule: nil),
            now: now
        )
        try store.save(replacement)
        XCTAssertEqual(store.load().rules.map(\.entityId), ["magnus-carlsen"])
    }

    func test_reasonSurvivesRoundTrip() throws {
        let store = AssistantTestSupport.tempProfileStore()
        try store.save(sampleProfile())
        let loaded = store.load()
        XCTAssertEqual(loaded.rule(for: "casper-ruud")?.reason, "fordi Ruud")
        XCTAssertFalse(loaded.rules.contains { $0.reason.isEmpty }, "every rule keeps its Norwegian reason")
    }

    // MARK: - Lens persistence (WP-16.1)

    func test_lensSurvivesRoundTrip() throws {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let profile = InterestProfile()
            .applying(GroundedMutation(kind: .add, entity: index.entity(id: "tour-de-france-2026")!,
                                       scope: nil, weight: 0.5, reason: "norsk fokus",
                                       previousRule: nil, lens: .throughNorwegians), now: now)
            .applying(GroundedMutation(kind: .add, entity: index.entity(id: "esports-world-cup-2026-chess")!,
                                       scope: nil, weight: 0.5, reason: "utvalgte",
                                       previousRule: nil,
                                       lens: .throughAthletes([LensAthlete(entityId: "magnus-carlsen", name: "Magnus Carlsen")])),
                      now: now)
        let store = AssistantTestSupport.tempProfileStore()
        try store.save(profile)
        let loaded = store.load()
        XCTAssertEqual(loaded, profile, "the lens (both cases) round-trips through JSON unchanged")
        XCTAssertEqual(loaded.rule(for: "tour-de-france-2026")?.lens, .throughNorwegians)
    }

    func test_papersOverPreLensProfile_defaultsToSportAsSuch() throws {
        // A profile written by WP-16 (before the lens existed) has no `lens` key.
        let store = AssistantTestSupport.tempProfileStore()
        let json = """
        { "rules": [ { "entityId": "magnus-carlsen", "entityName": "Magnus Carlsen",
          "sport": "chess", "weight": 0.5, "reason": "sjakk",
          "addedAt": "2026-01-01T00:00:00Z" } ] }
        """
        try Data(json.utf8).write(to: store.directoryURL.appendingPathComponent(ProfileStore.filename))
        XCTAssertEqual(store.load().rule(for: "magnus-carlsen")?.lens, .sportAsSuch,
                       "forward-compatible: a pre-lens rule defaults to the neutral lens")
    }

    // MARK: - WP-19 — sync stamping (modifiedAt + deviceID + tombstones)

    /// A ProfileStore in a throwaway temp dir with a FIXED device stamp, for
    /// deterministic sync assertions.
    private func stampedStore(_ deviceID: String) -> ProfileStore {
        ProfileStore(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("sportivista-tests-\(UUID().uuidString)", isDirectory: true), deviceID: deviceID)
    }

    private func addRuud(_ profile: InterestProfile, now: Date) -> InterestProfile {
        profile.applying(GroundedMutation(kind: .add, entity: index.entity(id: "casper-ruud")!,
                                          scope: nil, weight: 0.5, reason: "tennis", previousRule: nil), now: now)
    }

    func test_save_stampsModifiedAtAndDeviceID() throws {
        let store = stampedStore("DEVICE-1")
        let now = Date(timeIntervalSince1970: 1_700_000_500)
        try store.save(addRuud(InterestProfile(), now: now), now: now)

        let synced = store.loadSyncState().rules.first { $0.entityId == "casper-ruud" }
        XCTAssertEqual(synced?.modifiedAt, now)
        XCTAssertEqual(synced?.deviceID, "DEVICE-1")
        XCTAssertEqual(synced?.deleted, false)
    }

    func test_removingRule_leavesADurableTombstone() throws {
        let store = stampedStore("DEVICE-1")
        let now = Date(timeIntervalSince1970: 1_700_000_500)
        try store.save(addRuud(InterestProfile(), now: now), now: now)

        // Save an empty profile — the removed rule must persist as a tombstone,
        // so a peer's stale copy can't revive it on the next sync.
        let later = Date(timeIntervalSince1970: 1_700_000_900)
        try store.save(InterestProfile(), now: later)

        XCTAssertTrue(store.load().isEmpty, "the live view no longer shows it")
        let tombstone = store.loadSyncState().rules.first { $0.entityId == "casper-ruud" }
        XCTAssertEqual(tombstone?.deleted, true, "the deletion survives on disk as a tombstone")
        XCTAssertEqual(tombstone?.modifiedAt, later)
    }

    func test_resavingUnchangedProfile_doesNotBumpTheStamp() throws {
        let store = stampedStore("DEVICE-1")
        let first = Date(timeIntervalSince1970: 1_700_000_500)
        try store.save(addRuud(InterestProfile(), now: first), now: first)

        // Re-save the identical profile at a later clock — no real change, so no
        // new stamp (otherwise every launch would churn the merge for peers).
        try store.save(store.load(), now: Date(timeIntervalSince1970: 1_700_009_000))
        XCTAssertEqual(store.loadSyncState().rules.first { $0.entityId == "casper-ruud" }?.modifiedAt, first)
    }

    func test_syncState_roundTripsThroughDisk() throws {
        let store = stampedStore("DEVICE-1")
        let state = ProfileSyncState(
            rules: [SyncedRule(rule: index.entity(id: "casper-ruud").map {
                InterestRule(entityId: $0.id, entityName: $0.name, sport: $0.sport, scope: nil,
                             weight: 0.5, reason: "x", addedAt: Date(timeIntervalSince1970: 1_700_000_000))
            }!, modifiedAt: Date(timeIntervalSince1970: 1_700_000_100), deviceID: "DEVICE-1")],
            episodic: [EpisodicNote(id: "n1", kind: "misunderstood", createdAt: Date(timeIntervalSince1970: 1_700_000_050))],
            counters: [Counter(key: "opens", perDevice: ["DEVICE-1": 3])]
        )
        try store.saveSyncState(state)
        XCTAssertEqual(store.loadSyncState(), state.normalized(), "the full mergeable state round-trips")
    }
}
