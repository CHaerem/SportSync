//
//  ProfileSyncBackendTests.swift
//  SportivistaTests
//
//  WP-19 — the backend seam + coordinator, exercised against a mock (no iCloud):
//  offline-først (a failed pull preserves local, pushes nothing), LocalOnly is a
//  true no-op, and a real pull → merge → push round converges both sides and
//  pushes ONLY the delta. Plus the store round-trip: a sync merges a peer's rule
//  into what ProfileStore hands back.
//

import XCTest

final class ProfileSyncBackendTests: XCTestCase {

    private func t(_ offset: TimeInterval) -> Date { Date(timeIntervalSince1970: 1_700_000_000 + offset) }

    private func synced(_ id: String, at: TimeInterval, device: String, weight: Double = 0.5) -> SyncedRule {
        SyncedRule(rule: InterestRule(entityId: id, entityName: id, sport: "tennis", scope: nil,
                                      weight: weight, reason: "grunn", addedAt: t(0)),
                   modifiedAt: t(at), deviceID: device)
    }

    // MARK: - LocalOnly / disabled

    // The factory must NEVER crash and NEVER attempt CloudKit where the container
    // isn't provisioned (iOS-app-on-Mac). In the Simulator/CI build (no
    // `-D SPORTIVISTA_CLOUDKIT`) it is always LocalOnly; the guard for the CloudKit
    // build is asserted structurally: on Mac the factory must return a disabled
    // (local) backend rather than construct CloudKitProfileSync (which raises at
    // launch on the un-provisioned Mac run — the 20.07 DeviceDev-on-Mac crash-loop).
    func test_factory_neverCrashes_andIsLocalWhenSyncUnavailable() {
        let backend = ProfileSyncBackendFactory.make()
        if ProcessInfo.processInfo.isiOSAppOnMac {
            XCTAssertFalse(backend.isEnabled, "iOS-app-on-Mac must fall back to local-only, never CloudKit")
        }
        #if !SPORTIVISTA_CLOUDKIT
        XCTAssertFalse(backend.isEnabled, "the Simulator/CI build is always local-only")
        #endif
    }

    func test_localOnly_isNoop() async {
        let coordinator = ProfileSyncCoordinator(backend: LocalOnlyProfileSync())
        let local = ProfileSyncState(rules: [synced("a", at: 10, device: "A")])
        let result = await coordinator.sync(local: local)
        XCTAssertFalse(result.didSync)
        XCTAssertEqual(result.merged, local)
        XCTAssertEqual(result.pushed, 0)
    }

    func test_disabledBackend_skipsNetworkEntirely() async {
        let backend = MockProfileSyncBackend(isEnabled: false)
        let coordinator = ProfileSyncCoordinator(backend: backend)
        _ = await coordinator.sync(local: ProfileSyncState(rules: [synced("a", at: 10, device: "A")]))
        let pulls = await backend.pulls()
        XCTAssertEqual(pulls, 0, "a disabled backend is never pulled")
    }

    // MARK: - Offline-først

    func test_offline_pullThrows_preservesLocalAndPushesNothing() async {
        let backend = MockProfileSyncBackend(remote: ProfileSyncState(rules: [synced("b", at: 10, device: "B")]),
                                             failPull: true)
        let coordinator = ProfileSyncCoordinator(backend: backend)
        let local = ProfileSyncState(rules: [synced("a", at: 10, device: "A")])
        let result = await coordinator.sync(local: local)

        XCTAssertFalse(result.didSync, "a failed pull is offline, not a crash")
        XCTAssertEqual(result.merged, local, "local state is preserved verbatim")
        let pushes = await backend.recordedPushes()
        XCTAssertTrue(pushes.isEmpty, "nothing is pushed when we couldn't pull")
    }

    // MARK: - Full round-trip

    func test_pullMergePush_convergesAndPushesOnlyDelta() async {
        let backend = MockProfileSyncBackend(remote: ProfileSyncState(rules: [synced("b", at: 10, device: "B")]))
        let coordinator = ProfileSyncCoordinator(backend: backend)
        let local = ProfileSyncState(rules: [synced("a", at: 10, device: "A")])
        let result = await coordinator.sync(local: local)

        XCTAssertTrue(result.didSync)
        XCTAssertEqual(result.merged.rules.map(\.entityId), ["a", "b"], "both sides converge")

        let pushes = await backend.recordedPushes()
        XCTAssertEqual(pushes.count, 1)
        XCTAssertEqual(pushes.first?.rules.map(\.entityId), ["a"], "only the record the remote lacked was pushed")

        // The remote now holds both → a second sync is a clean no-push.
        let second = await coordinator.sync(local: result.merged)
        let pushesAfter = await backend.recordedPushes()
        XCTAssertEqual(pushesAfter.count, 1, "nothing new to push on the second round")
        XCTAssertEqual(second.pushed, 0)
    }

    func test_noPush_whenLocalHasNothingRemoteLacks() async {
        let backend = MockProfileSyncBackend(remote: ProfileSyncState(rules: [synced("b", at: 10, device: "B")]))
        let coordinator = ProfileSyncCoordinator(backend: backend)
        let result = await coordinator.sync(local: ProfileSyncState())   // empty local

        XCTAssertTrue(result.didSync)
        XCTAssertEqual(result.merged.rules.map(\.entityId), ["b"], "we adopt the remote's rule")
        let pushes = await backend.recordedPushes()
        XCTAssertTrue(pushes.isEmpty, "remote is already current → no push")
    }

    // MARK: - Store round-trip (a peer's rule lands in ProfileStore.load)

    func test_storeRoundTrip_mergesPeerRule() async throws {
        let store = ProfileStore(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("sportivista-sync-\(UUID().uuidString)"), deviceID: "LOCAL")
        try store.save(InterestProfile(rules: [
            InterestRule(entityId: "a", entityName: "A", sport: "tennis", scope: nil, weight: 0.5, reason: "min", addedAt: t(0))
        ]), now: t(50))

        let backend = MockProfileSyncBackend(remote: ProfileSyncState(rules: [synced("b", at: 60, device: "PEER")]))
        let coordinator = ProfileSyncCoordinator(backend: backend)
        let result = await coordinator.sync(local: store.loadSyncState())
        try store.saveSyncState(result.merged)

        XCTAssertEqual(store.load().rules.map(\.entityId), ["a", "b"], "the peer's rule is now local")
        let pushes = await backend.recordedPushes()
        XCTAssertEqual(pushes.first?.rules.map(\.entityId), ["a"], "and our rule was pushed up")
    }
}
