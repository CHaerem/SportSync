//
//  MockProfileSyncBackend.swift
//  SportivistaTests
//
//  WP-19 — a deterministic ProfileSyncBackend double, so the coordinator (and
//  the store round-trip) are tested end-to-end with no iCloud. An actor: the
//  recorded pushes are mutable state the coordinator touches across await hops,
//  and `label`/`isEnabled` are `nonisolated` so they satisfy the synchronous
//  protocol requirements. `push` folds the winners into the mock's remote, so a
//  later `pull` reflects convergence — exactly like a real store would.
//

import Foundation

actor MockProfileSyncBackend: ProfileSyncBackend {
    nonisolated let label = "Mock"
    nonisolated let isEnabled: Bool

    private var remote: ProfileSyncState
    private let failPull: Bool
    private(set) var pullCount = 0
    private(set) var pushes: [PushSet] = []
    private(set) var snapshots: [ProfileSyncState] = []

    init(remote: ProfileSyncState = ProfileSyncState(), isEnabled: Bool = true, failPull: Bool = false) {
        self.remote = remote
        self.isEnabled = isEnabled
        self.failPull = failPull
    }

    func pull() async throws -> ProfileSyncState {
        pullCount += 1
        if failPull { throw NSError(domain: "mock.offline", code: 1) }
        return remote
    }

    func push(_ pushSet: PushSet) async throws {
        pushes.append(pushSet)
        let incoming = ProfileSyncState(rules: pushSet.rules, episodic: pushSet.episodic,
                                        counters: pushSet.counters, facts: pushSet.facts)
        remote = ProfileMerge.merge(local: remote, remote: incoming).merged
    }

    /// Record the web-readable snapshot the coordinator publishes (the mock opts in
    /// so the snapshot wiring is unit-tested without CloudKit).
    func writeSnapshot(_ state: ProfileSyncState) async throws {
        snapshots.append(state)
    }

    // Test accessors (actor-isolated → awaited from the tests).
    func recordedPushes() -> [PushSet] { pushes }
    func recordedSnapshots() -> [ProfileSyncState] { snapshots }
    func currentRemote() -> ProfileSyncState { remote }
    func pulls() -> Int { pullCount }
}
