//
//  ProfileStore.swift
//  Zenji
//
//  WP-16 — local persistence for the interest profile. A single JSON file in
//  Application Support (the "enkleste robuste" option from the brief — no
//  SwiftData ceremony for one small user-owned document, and no App Group
//  needed, which matters for the free-account DeviceDev build where App Groups
//  are unavailable). Same robustness contract as WP-12's DataStore: `load()`
//  never throws — a missing or corrupt file is an empty profile, not a crash —
//  while `save(_:)` writes atomically so a crash mid-write can't corrupt it.
//
//  WP-19 — the file is now the mergeable `ProfileSyncState` (a backward-compatible
//  SUPERSET of the old flat `{ rules: [InterestRule] }`, which migrates on read).
//  Every `save` DIFFS the incoming live profile against what's on disk and stamps
//  ONLY what changed with `(now, deviceID)`, TOMBSTONING removed rules — so a
//  delete replicates cross-device instead of a peer reviving it, and a no-op save
//  causes no merge churn. The app's existing callers still see the same
//  `load() -> InterestProfile` / `save(_ profile:)` API (the sync metadata is
//  invisible to them); the coordinator + QR bridge use `loadSyncState()` /
//  `saveSyncState(_:)` for the full mergeable shape.
//
//  The directory is injectable (defaults to Application Support/ZenjiProfile)
//  so ProfileStoreTests can round-trip through a throwaway temp directory
//  instead of this process's real container.
//

import Foundation

struct ProfileStore: Sendable {
    static let filename = "interest-profile.json"

    let directoryURL: URL
    /// The device stamp written onto changed rules (see `SyncedRule.deviceID`).
    /// A stable per-install id by default; tests inject a fixed one.
    let deviceID: String

    /// Default location: `Application Support/ZenjiProfile/`. Falls back to the
    /// temporary directory if Application Support can't be resolved (never nil).
    init(fileManager: FileManager = .default) {
        let base = (try? fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
            ?? fileManager.temporaryDirectory
        self.init(directory: base.appendingPathComponent("ZenjiProfile", isDirectory: true))
    }

    /// Explicit-directory initializer — tests use this for an isolated,
    /// throwaway location. `deviceID` defaults to a stable id persisted in the
    /// same directory (so a temp store gets its own, and the real store keeps one
    /// across launches); pass an explicit id for deterministic merge tests.
    init(directory: URL, deviceID: String? = nil) {
        self.directoryURL = directory
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        self.deviceID = deviceID ?? DeviceIdentity.stableID(directory: directory)
    }

    private var fileURL: URL { directoryURL.appendingPathComponent(Self.filename) }

    // MARK: - InterestProfile API (unchanged surface for existing callers)

    /// Reads the persisted profile's LIVE view (tombstones filtered). Never
    /// throws — an absent or unreadable file is a fresh, empty profile.
    func load() -> InterestProfile {
        loadSyncState().profile
    }

    /// Persists `profile` as the live rule set. Diffs against what's on disk and
    /// stamps only changed/new rules and tombstones removed ones (WP-19). Throws
    /// only on a genuine write failure; the in-memory profile is unaffected.
    func save(_ profile: InterestProfile, now: Date = Date()) throws {
        let next = loadSyncState().updatingRules(to: profile, now: now, deviceID: deviceID)
        try saveSyncState(next)
    }

    // MARK: - Full mergeable state (WP-19 — coordinator + QR bridge)

    /// The complete `ProfileSyncState` on disk (rules with tombstones + stamps,
    /// plus any episodic/counter records). Never throws — a missing/corrupt file
    /// is an empty state.
    func loadSyncState() -> ProfileSyncState {
        guard let data = try? Data(contentsOf: fileURL) else { return ProfileSyncState() }
        return (try? Self.decoder.decode(ProfileSyncState.self, from: data)) ?? ProfileSyncState()
    }

    /// Persists the full mergeable state atomically. Normalised on the way out so
    /// the file is stable and diff-friendly.
    func saveSyncState(_ state: ProfileSyncState) throws {
        let data = try Self.encoder.encode(state.normalized())
        try data.write(to: fileURL, options: .atomic)
    }

    // MARK: - Codec (ISO 8601 dates, matching the rest of the app)

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        return e
    }()
}
