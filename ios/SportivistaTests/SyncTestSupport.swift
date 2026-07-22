//
//  SyncTestSupport.swift
//  SportivistaTests
//
//  WP-12: shared helpers for the sync tests. The guiding idea across all of
//  them is to reuse the REAL, checked-in SportivistaTests/Fixtures/{events,
//  entities,tracked,featured,recent-results,news,manifest}.json as the mock
//  server's responses — the same fasit WP-11's decode tests already use —
//  rather than inventing separate, parallel test data. Where a test needs a
//  scenario the frozen fixture doesn't represent (a changed file, a corrupt
//  download), it starts from the CANONICAL manifest and surgically mutates just
//  the one entry that scenario needs, computing the replacement sha256 with the
//  SAME `Data.sha256Hex` SyncClient itself uses — so there is never a
//  hand-typed hash to keep in sync by hand.
//
//  WP-106: `SyncClient.defaultFilesOfInterest` gained the three Nyheter-board
//  files (news.json, featured.json, recent-results.json) and DROPPED the
//  now-unpublished interests.json. The real manifest fixture predates those
//  three fixtures, so its declared sha256 for featured/recent-results would not
//  match the CURRENT fixture bytes (and it has no news.json entry at all).
//  `canonicalManifestData()` therefore overrides exactly those three entries to
//  match the fixture bytes served below — keeping the full ~28-file manifest
//  (so the "scoped down from the whole manifest" proof stands) while guaranteeing
//  every file-of-interest hash is internally consistent.
//

import Foundation

enum SyncTestSupport {
    static let baseURL = URL(string: "https://mock.sportivista.test/data/")!

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    /// The Nyheter-board files added in WP-106, served as their checked-in
    /// fixtures. `canonicalManifestData` overrides the manifest's entries for
    /// these to match — the base fixture's featured/recent-results hashes are
    /// stale and it carries no news.json entry.
    /// WP-171 adds standings.json (the event-detail table surface) the same way:
    /// the base manifest lists it, but its declared hash predates this fixture.
    static let newFilesOfInterest: [String: Data] = [
        "featured.json": Fixture.data("featured"),
        "recent-results.json": Fixture.data("recent-results"),
        "news.json": Fixture.data("news"),
        "standings.json": Fixture.data("standings"),
    ]

    /// The full manifest fixture with the WP-106 file entries overridden to match
    /// the served fixtures. Every helper below builds on THIS (not the raw
    /// fixture), so "unchanged" files keep identical hashes across baseline and
    /// any single-file mutation — the scoping/diff assertions stay honest.
    static func canonicalManifestData() -> Data {
        // swiftlint:disable:next force_try
        let base = try! SportivistaJSON.decoder.decode(Manifest.self, from: Fixture.data("manifest"))
        var files = base.files
        // WP-132: entities.json also drifts from the base manifest's declared
        // hash (the fixture gains new entities over time), so refresh it from the
        // current fixture the same way as the WP-106 files below.
        let refreshed = newFilesOfInterest.merging(["entities.json": Fixture.data("entities")]) { _, new in new }
        for (filename, content) in refreshed {
            files[filename] = Manifest.FileEntry(bytes: content.count, sha256: content.sha256Hex, sourceLastUpdated: nil)
        }
        let manifest = Manifest(generatedAt: base.generatedAt, schemaVersion: base.schemaVersion, files: files)
        // swiftlint:disable:next force_try
        return try! encoder.encode(manifest)
    }

    /// Decodes the canonical manifest, replaces exactly one file's entry
    /// (computing its sha256/bytes from `newContent`), and re-encodes.
    static func manifestFixture(replacing filename: String, with newContent: Data) throws -> Data {
        let baseManifest = try SportivistaJSON.decoder.decode(Manifest.self, from: canonicalManifestData())
        var files = baseManifest.files
        files[filename] = Manifest.FileEntry(bytes: newContent.count, sha256: newContent.sha256Hex, sourceLastUpdated: nil)
        let manifest = Manifest(generatedAt: baseManifest.generatedAt, schemaVersion: baseManifest.schemaVersion, files: files)
        return try encoder.encode(manifest)
    }

    /// Stubs manifest.json (200, given ETag) plus one 200 response per
    /// filename in `fileBodies`, keyed by filename.
    static func stubSuccessfulSync(manifestBody: Data, etag: String, fileBodies: [String: Data]) {
        MockURLProtocol.stubs["manifest.json"] = { _ in
            MockURLProtocol.Stub(statusCode: 200, headers: ["ETag": etag], body: manifestBody)
        }
        for (filename, body) in fileBodies {
            MockURLProtocol.stubs[filename] = { _ in MockURLProtocol.Stub(statusCode: 200, body: body) }
        }
    }

    /// The files (of interest) a first, "everything is new" sync applies — the
    /// events/entities/tracked WP-11 fixtures plus the WP-106 Nyheter-board
    /// files. interests.json is deliberately NOT here: WP-106 dropped it from
    /// `defaultFilesOfInterest`, so it is never fetched even though the manifest
    /// still lists it.
    static let baselineFileBodies: [String: Data] = [
        "events.json": Fixture.data("events"),
        "entities.json": Fixture.data("entities"),
        "tracked.json": Fixture.data("tracked"),
        "featured.json": Fixture.data("featured"),
        "recent-results.json": Fixture.data("recent-results"),
        "news.json": Fixture.data("news"),
        "standings.json": Fixture.data("standings"),
    ]

    /// The filenames of `baselineFileBodies`, sorted — the expected
    /// `.changedFiles` payload of a baseline sync.
    static let baselineChangedFiles: [String] = baselineFileBodies.keys.sorted()

    /// Runs an initial, "everything is new" sync against the canonical manifest +
    /// the baseline fixtures, on a fresh cache. This is the baseline every other
    /// scenario builds on (a changed manifest, a dropped connection, a corrupt
    /// download all assume something was already successfully synced once).
    @discardableResult
    static func performBaselineSync(cache: CacheStore, etag: String = "W/\"v1\"") async -> SyncResult {
        MockURLProtocol.reset()
        stubSuccessfulSync(manifestBody: canonicalManifestData(), etag: etag, fileBodies: baselineFileBodies)
        let client = SyncClient(baseURL: baseURL, session: MockURLProtocol.mockedSession(), cache: cache)
        return await client.sync()
    }
}
