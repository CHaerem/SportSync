//
//  SyncState.swift
//  Sportivista
//
//  WP-12: the small piece of bookkeeping SyncClient persists between runs —
//  the manifest ETag (sent back as If-None-Match) and a RECONCILED snapshot
//  of the manifest's per-file entries.
//
//  "Reconciled" matters: `appliedFiles` is not simply a copy of the last
//  server manifest. If a file's download failed a sha256 check (or a
//  transient network error), that file's OLD entry is carried forward here
//  instead of the new one the server reported — so the diff on the NEXT sync
//  still sees it as "changed" and retries it, rather than wrongly concluding
//  it was already applied. This is what makes SyncState.appliedFiles the
//  fasit for "what's actually on disk right now", not "what the server last
//  said".
//

import Foundation

struct SyncState: Codable, Equatable {
    var etag: String?
    /// Keyed by published filename, e.g. "events.json" — mirrors
    /// Manifest.files, but scoped to exactly the files this cache has
    /// actually applied successfully.
    var appliedFiles: [String: Manifest.FileEntry]
    var lastSync: Date?

    static let empty = SyncState(etag: nil, appliedFiles: [:], lastSync: nil)

    /// Dates round-trip through ISO 8601 without fractional seconds — the
    /// shared `SportivistaJSON.decoder` already accepts both shapes on read (see
    /// SportivistaJSON.swift), so writing only needs to pick one shape.
    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()
}
