//
//  Manifest.swift
//  Sportivista
//
//  WP-11: mirrors docs/data/manifest.json (WP-03) — the per-file bytes/
//  sha256 index the WP-12 SyncClient will poll to decide what changed,
//  without re-downloading every published data file on each check.
//

import Foundation

struct Manifest: Codable, Equatable {
    struct FileEntry: Codable, Equatable {
        var bytes: Int
        var sha256: String
        /// Mirrored from a data file's own `lastUpdated` field when it has
        /// one (meta.json, per-sport fetcher files, …) — informational
        /// only, never used for sync diffing. See build-manifest.js's own
        /// note: git doesn't preserve mtimes, so hash-diff is the real
        /// sync contract, not this field.
        var sourceLastUpdated: Date?
    }

    var generatedAt: Date
    var schemaVersion: Int
    /// Keyed by published filename, e.g. "events.json", "entities.json".
    var files: [String: FileEntry]
}
