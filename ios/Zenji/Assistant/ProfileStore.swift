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
//  The directory is injectable (defaults to Application Support/ZenjiProfile)
//  so ProfileStoreTests can round-trip through a throwaway temp directory
//  instead of this process's real container.
//

import Foundation

struct ProfileStore: Sendable {
    static let filename = "interest-profile.json"

    let directoryURL: URL

    /// Default location: `Application Support/ZenjiProfile/`. Falls back to the
    /// temporary directory if Application Support can't be resolved (never nil).
    init(fileManager: FileManager = .default) {
        let base = (try? fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
            ?? fileManager.temporaryDirectory
        self.init(directory: base.appendingPathComponent("ZenjiProfile", isDirectory: true))
    }

    /// Explicit-directory initializer — tests use this for an isolated,
    /// throwaway location.
    init(directory: URL) {
        self.directoryURL = directory
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private var fileURL: URL { directoryURL.appendingPathComponent(Self.filename) }

    /// Reads the persisted profile. Never throws — an absent or unreadable file
    /// is a fresh, empty profile.
    func load() -> InterestProfile {
        guard let data = try? Data(contentsOf: fileURL) else { return InterestProfile() }
        return (try? Self.decoder.decode(InterestProfile.self, from: data)) ?? InterestProfile()
    }

    /// Persists atomically. Throws only on a genuine write failure (disk full,
    /// permissions) — callers may surface that, but the in-memory profile is
    /// unaffected either way.
    func save(_ profile: InterestProfile) throws {
        let data = try Self.encoder.encode(profile)
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
