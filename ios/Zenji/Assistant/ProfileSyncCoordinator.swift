//
//  ProfileSyncCoordinator.swift
//  Zenji
//
//  WP-19 — one offline-first sync round, stitched from pure parts:
//
//      pull remote  →  ProfileMerge.merge(local, remote)  →  push only the
//      records the remote is behind on  →  hand the merged state back for the
//      caller to persist.
//
//  OFFLINE-FØRST is the whole contract: this NEVER throws and NEVER blocks the
//  UI on the network. A disabled backend (LocalOnly) or ANY failure (no account,
//  no network, a CloudKit error) returns the local state UNCHANGED — the phone
//  keeps working on exactly what it already had. It is a thin, deterministic
//  coordinator over `ProfileMerge` + a `ProfileSyncBackend`, so it is unit-tested
//  against a mock backend with no iCloud in sight.
//

import Foundation

struct ProfileSyncCoordinator: Sendable {
    let backend: any ProfileSyncBackend

    init(backend: any ProfileSyncBackend = LocalOnlyProfileSync()) {
        self.backend = backend
    }

    /// The outcome of a sync round — enough for a caller to persist and to show
    /// a calm status line, without leaking the merge internals.
    struct Result: Sendable {
        /// The converged state to persist locally.
        var merged: ProfileSyncState
        /// Whether a remote round-trip actually happened (false = offline / no-op).
        var didSync: Bool
        /// How many records were pushed up (0 when nothing was behind).
        var pushed: Int
    }

    /// Pull → merge → push. Returns `merged == local` (and `didSync == false`) on
    /// a disabled backend or any error — the caller can persist unconditionally.
    func sync(local: ProfileSyncState) async -> Result {
        guard backend.isEnabled else {
            return Result(merged: local, didSync: false, pushed: 0)
        }
        do {
            let remote = try await backend.pull()
            let outcome = ProfileMerge.merge(local: local, remote: remote)
            let pushCount = outcome.toPush.rules.count + outcome.toPush.episodic.count + outcome.toPush.counters.count
            if !outcome.toPush.isEmpty {
                try await backend.push(outcome.toPush)
            }
            return Result(merged: outcome.merged, didSync: true, pushed: pushCount)
        } catch {
            // Offline-først: keep local exactly as it was, never surface a
            // blocking error into the UI.
            return Result(merged: local, didSync: false, pushed: 0)
        }
    }
}
