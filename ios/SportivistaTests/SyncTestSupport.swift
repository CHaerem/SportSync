//
//  SyncTestSupport.swift
//  SportivistaTests
//
//  WP-12: shared helpers for the sync tests. The guiding idea across all of
//  them is to reuse the REAL, checked-in SportivistaTests/Fixtures/{events,
//  entities,tracked,interests,manifest}.json as the mock server's responses —
//  the same fasit WP-11's decode tests already use — rather than inventing
//  separate, parallel test data. Where a test needs a scenario the frozen
//  fixture doesn't represent (a changed file, a corrupt download), it starts
//  from the real manifest fixture and surgically mutates just the one entry
//  that scenario needs, computing the replacement sha256 with the SAME
//  `Data.sha256Hex` SyncClient itself uses — so there is never a hand-typed
//  hash to keep in sync by hand. (WP-15 added `interests.json` to
//  `SyncClient.defaultFilesOfInterest` — NotificationPlanner needs the real
//  notify-config synced — so the baseline sync now fetches four files, not
//  three.)
//

import Foundation

enum SyncTestSupport {
    static let baseURL = URL(string: "https://mock.sportivista.test/data/")!

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    /// Decodes the real manifest fixture, replaces exactly one file's entry
    /// (computing its sha256/bytes from `newContent`), and re-encodes.
    /// Returns the new manifest's raw bytes alongside the content that must
    /// be stubbed as that file's own HTTP response for the manifest to be
    /// internally consistent.
    static func manifestFixture(replacing filename: String, with newContent: Data) throws -> Data {
        let baseManifest = try SportivistaJSON.decoder.decode(Manifest.self, from: Fixture.data("manifest"))
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

    /// Runs an initial, "everything is new" sync against the real manifest +
    /// events/entities/tracked/interests fixtures, on a fresh cache. This is
    /// the baseline every other scenario builds on (a changed manifest, a
    /// dropped connection, a corrupt download all assume something was
    /// already successfully synced once).
    @discardableResult
    static func performBaselineSync(cache: CacheStore, etag: String = "W/\"v1\"") async -> SyncResult {
        MockURLProtocol.reset()
        stubSuccessfulSync(
            manifestBody: Fixture.data("manifest"),
            etag: etag,
            fileBodies: [
                "events.json": Fixture.data("events"),
                "entities.json": Fixture.data("entities"),
                "tracked.json": Fixture.data("tracked"),
                "interests.json": Fixture.data("interests"),
            ]
        )
        let client = SyncClient(baseURL: baseURL, session: MockURLProtocol.mockedSession(), cache: cache)
        return await client.sync()
    }
}
