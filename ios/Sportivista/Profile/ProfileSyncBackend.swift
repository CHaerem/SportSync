//
//  ProfileSyncBackend.swift
//  Sportivista
//
//  WP-19 — the vendor-agnostic seam. Everything above this protocol (the merge,
//  the store, the QR bridge, the coordinator) is plain Swift with no idea WHERE
//  the remote state lives. Two implementations sit behind it:
//
//    • CloudKitProfileSync   the real thing — the USER'S OWN private CloudKit
//                            database (their iCloud quota, never our server),
//                            record-per-rule, PLAINTEXT (not E2E — a sports
//                            follow-list is low sensitivity, and plaintext is what
//                            lets the user's own web sign-in read it too). Compiles
//                            on the Simulator + in CI (the CloudKit SDK is present)
//                            but only RUNS where a paid account + the iCloud
//                            entitlement exist (WP-17).
//    • LocalOnlyProfileSync  a no-op fallback — what the free-account
//                            `SportivistaDeviceDev` build uses (no CloudKit entitlement
//                            on a free personal team), so the phone install keeps
//                            working with zero cross-device sync.
//
//  Swapping the provider is swapping the object that conforms here — nothing
//  else changes. Tests inject a deterministic mock (MockProfileSyncBackend).
//

import Foundation

/// A place the mergeable profile state can be pulled from and pushed to. Both
/// methods are async + throwing; the `ProfileSyncCoordinator` treats any throw
/// as "offline" and keeps local state untouched (offline-først).
protocol ProfileSyncBackend: Sendable {
    /// A calm, honest Norwegian label for the UI ("iCloud" / "Kun lokalt").
    var label: String { get }
    /// Whether cross-device sync actually happens here. `false` = the no-op
    /// fallback; the coordinator then short-circuits without a network call.
    var isEnabled: Bool { get }

    /// Fetch the complete remote state (an empty state if the remote has none).
    func pull() async throws -> ProfileSyncState
    /// Upsert exactly the records the remote is behind on (a merge's push set),
    /// tombstones included — deletions replicate as records, never as CloudKit
    /// record deletions, so a peer can't resurrect an unfollowed entity.
    func push(_ pushSet: PushSet) async throws

    /// Publish this device's FULL merged state as a single snapshot the WEB reads
    /// in one shot (a browser can't easily page the per-record types), a
    /// ProfileShareCodec payload in one record, recordName = this device. The CRDT
    /// guarantees the per-record and snapshot channels converge.
    /// Default: no-op — only CloudKitProfileSync overrides it.
    func writeSnapshot(_ state: ProfileSyncState) async throws
}

extension ProfileSyncBackend {
    /// Backends that don't sync (LocalOnly) or don't need a web-readable channel
    /// (the test mock, unless it opts in) get a no-op — the coordinator can call
    /// it unconditionally.
    func writeSnapshot(_ state: ProfileSyncState) async throws { /* no-op */ }
}

/// The no-op fallback. Cross-device sync is off; the profile stays purely local
/// (exactly the WP-16 behaviour). Used on the free-account device build and any
/// time CloudKit isn't wired.
struct LocalOnlyProfileSync: ProfileSyncBackend {
    var label: String { "Kun lokalt" }
    var isEnabled: Bool { false }

    func pull() async throws -> ProfileSyncState { ProfileSyncState() }
    func push(_ pushSet: PushSet) async throws { /* intentionally nothing */ }
}

/// Chooses the sync backend for the running build. Defaults to the no-op
/// LocalOnly fallback — the only backend the free-account device build and the
/// Simulator/CI ever use, so nothing here touches CloudKit at runtime unless a
/// paid-account build explicitly opts in by compiling with `-D SPORTIVISTA_CLOUDKIT`
/// (which also requires the iCloud entitlement — see CloudKitProfileSync). This
/// is the single prepared switch WP-17 flips.
enum ProfileSyncBackendFactory {
    static func make() -> any ProfileSyncBackend {
        #if SPORTIVISTA_CLOUDKIT
        // The iCloud entitlement is provisioned for the iOS DEVICE build — not for
        // the SAME binary running as an iOS-app-on-Mac ("Designed for iPad", e.g.
        // when the run destination is "My Mac" instead of the iPhone). There the
        // container isn't provisioned, so `CKContainer.default()` raises an uncaught
        // NSException at launch → SIGABRT crash-loop. Cross-device sync is a
        // nice-to-have, NEVER a launch requirement (LocalOnlyProfileSync is the
        // documented fallback), so degrade instead of crashing. The Simulator/CI
        // never compile this branch; the real paid-account iPhone build is unaffected.
        if ProcessInfo.processInfo.isiOSAppOnMac {
            return LocalOnlyProfileSync()
        }
        return CloudKitProfileSync()
        #else
        return LocalOnlyProfileSync()
        #endif
    }
}

/// A stable per-install identifier used to stamp `SyncedRule.deviceID`. NOT a
/// user identifier: a random UUID minted once and persisted next to the profile,
/// so it survives relaunches but reveals nothing about the person. Foundation
/// only (no UIKit / `identifierForVendor`), so it works identically on the
/// Simulator, in CI, and on the free-account device build.
enum DeviceIdentity {
    static let filename = "device-id"

    /// The id persisted in `directory`, minting + writing one on first read.
    /// Falls back to an ephemeral UUID if the directory can't be written (the
    /// merge still works; the stamp is just not stable that session).
    static func stableID(directory: URL) -> String {
        let url = directory.appendingPathComponent(filename)
        if let data = try? Data(contentsOf: url),
           let existing = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
           !existing.isEmpty {
            return existing
        }
        let fresh = UUID().uuidString
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? Data(fresh.utf8).write(to: url, options: .atomic)
        return fresh
    }
}
