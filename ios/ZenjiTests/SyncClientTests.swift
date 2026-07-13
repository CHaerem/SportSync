//
//  SyncClientTests.swift
//  ZenjiTests
//
//  WP-12 acceptance: unit tests against a mock URLProtocol (injected via
//  URLSessionConfiguration — no real network access). Covers all five cases
//  from the WP-12 brief:
//
//  (a) 304 → no file requests beyond the manifest itself.
//  (b) a changed manifest → only the actually-changed files are fetched.
//  (c) a network error → the cache is left intact and DataStore keeps
//      serving the old content.
//  (d) the ETag is persisted and sent back on the next call.
//  (e) a corrupt download (sha256 mismatch against the manifest) is
//      discarded — the old file is kept.
//
//  Each test gets its own fresh, isolated cache directory (a temp dir, not
//  the App Group/Application Support fallback CacheStoreTests exercises
//  separately) so tests never see each other's state.
//

import XCTest

final class SyncClientTests: XCTestCase {
    private var tempDirectory: URL!
    private var cache: CacheStore!

    override func setUp() {
        super.setUp()
        tempDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        cache = CacheStore(rootDirectory: tempDirectory)
        MockURLProtocol.reset()
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDirectory)
        MockURLProtocol.reset()
        super.tearDown()
    }

    private func makeClient() -> SyncClient {
        SyncClient(baseURL: SyncTestSupport.baseURL, session: MockURLProtocol.mockedSession(), cache: cache)
    }

    // MARK: - Baseline: first-ever sync against the real, full manifest fixture

    /// The real manifest.json fixture lists ~28 published files; only four
    /// (events/entities/tracked/interests) are `SyncClient.defaultFilesOfInterest`.
    /// This proves the diff-and-fetch loop is scoped to those four, not the
    /// whole manifest, on a completely realistic payload.
    func testInitialSync_fetchesOnlyFilesOfInterest_fromRealManifest() async throws {
        let result = await SyncTestSupport.performBaselineSync(cache: cache)

        XCTAssertEqual(result, .changedFiles(["entities.json", "events.json", "interests.json", "tracked.json"]))

        let requestedFilenames = Set(MockURLProtocol.recordedRequests.compactMap { $0.url?.lastPathComponent })
        XCTAssertEqual(requestedFilenames, ["manifest.json", "events.json", "entities.json", "tracked.json", "interests.json"])
        XCTAssertEqual(MockURLProtocol.recordedRequests.count, 5, "no other manifest file should have been requested")

        XCTAssertEqual(cache.read("events.json"), Fixture.data("events"))
        XCTAssertEqual(cache.read("entities.json"), Fixture.data("entities"))
        XCTAssertEqual(cache.read("tracked.json"), Fixture.data("tracked"))
        XCTAssertEqual(cache.read("interests.json"), Fixture.data("interests"))

        let state = try XCTUnwrap(cache.readSyncState())
        XCTAssertEqual(state.etag, "W/\"v1\"")
        XCTAssertNotNil(state.lastSync)
        XCTAssertEqual(state.appliedFiles.count, 4)
    }

    // MARK: (a) 304 → no file requests at all beyond the manifest

    func test304NotModified_upToDate_issuesNoFileRequests() async throws {
        await SyncTestSupport.performBaselineSync(cache: cache)
        let stateAfterBaseline = try XCTUnwrap(cache.readSyncState())

        MockURLProtocol.reset()
        MockURLProtocol.stubs["manifest.json"] = { _ in MockURLProtocol.Stub(statusCode: 304) }

        let result = await makeClient().sync()

        XCTAssertEqual(result, .upToDate)
        XCTAssertEqual(MockURLProtocol.recordedRequests.count, 1, "a 304 must not trigger any data-file requests")
        XCTAssertEqual(MockURLProtocol.recordedRequests.first?.url?.lastPathComponent, "manifest.json")
        XCTAssertEqual(cache.readSyncState(), stateAfterBaseline, "state must be untouched on a 304")
    }

    // MARK: (b) changed manifest → only the changed file is fetched

    func testChangedManifest_fetchesOnlyTheChangedFile() async throws {
        await SyncTestSupport.performBaselineSync(cache: cache)

        let newEvents = Data("[]".utf8) // a legitimately different events.json
        let manifestV2 = try SyncTestSupport.manifestFixture(replacing: "events.json", with: newEvents)

        MockURLProtocol.reset()
        SyncTestSupport.stubSuccessfulSync(manifestBody: manifestV2, etag: "W/\"v2\"", fileBodies: ["events.json": newEvents])
        // Deliberately no stub for entities.json/tracked.json/interests.json —
        // if SyncClient wrongly re-fetched any (their hashes are unchanged
        // from the baseline), the request would still land in
        // recordedRequests below.

        let result = await makeClient().sync()

        XCTAssertEqual(result, .changedFiles(["events.json"]))
        let requestedFilenames = Set(MockURLProtocol.recordedRequests.compactMap { $0.url?.lastPathComponent })
        XCTAssertEqual(requestedFilenames, ["manifest.json", "events.json"])

        XCTAssertEqual(cache.read("events.json"), newEvents)
        XCTAssertEqual(cache.read("entities.json"), Fixture.data("entities"), "unchanged file must be left alone")
        XCTAssertEqual(cache.read("tracked.json"), Fixture.data("tracked"), "unchanged file must be left alone")
        XCTAssertEqual(cache.read("interests.json"), Fixture.data("interests"), "unchanged file must be left alone")

        let events = try ZenjiJSON.decoder.decode([Event].self, from: cache.read("events.json")!)
        XCTAssertTrue(events.isEmpty)
    }

    // MARK: (c) network error → cache intact, DataStore serves old content

    func testNetworkError_leavesCacheAndStateUntouched() async throws {
        await SyncTestSupport.performBaselineSync(cache: cache)
        let originalEvents = cache.read("events.json")
        let stateBeforeFailure = try XCTUnwrap(cache.readSyncState())

        MockURLProtocol.reset()
        MockURLProtocol.stubs["manifest.json"] = { _ in MockURLProtocol.Stub(error: URLError(.notConnectedToInternet)) }

        let result = await makeClient().sync()

        guard case .failure = result else {
            return XCTFail("expected .failure, got \(result)")
        }
        XCTAssertEqual(cache.read("events.json"), originalEvents)
        XCTAssertEqual(cache.readSyncState(), stateBeforeFailure)

        let dataStore = DataStore(cache: cache)
        XCTAssertEqual(dataStore.loadEvents().count, Fixture.rawArray("events").count, "DataStore must keep serving the old cached events")
    }

    // MARK: (d) ETag persists across a brand-new SyncClient instance

    func testETag_persistsAcrossClientInstancesAndIsSentOnTheNextManifestRequest() async throws {
        await SyncTestSupport.performBaselineSync(cache: cache, etag: "W/\"persisted-etag\"")

        MockURLProtocol.reset()
        MockURLProtocol.stubs["manifest.json"] = { _ in MockURLProtocol.Stub(statusCode: 304) }

        // A brand-new client sharing only the on-disk cache — proves the
        // ETag survived via CacheStore, not just in the first client's memory.
        let freshClient = SyncClient(baseURL: SyncTestSupport.baseURL, session: MockURLProtocol.mockedSession(), cache: cache)
        _ = await freshClient.sync()

        let manifestRequest = try XCTUnwrap(MockURLProtocol.recordedRequests.first)
        XCTAssertEqual(manifestRequest.value(forHTTPHeaderField: "If-None-Match"), "W/\"persisted-etag\"")
    }

    // MARK: (e) corrupt download (sha256 mismatch) is discarded, old file kept

    func testCorruptDownload_sha256Mismatch_discardedAndOldFileKept() async throws {
        await SyncTestSupport.performBaselineSync(cache: cache)
        let originalEvents = try XCTUnwrap(cache.read("events.json"))
        let originalEntry = try XCTUnwrap(cache.readSyncState()?.appliedFiles["events.json"])

        // The manifest legitimately claims events.json changed to `intended`…
        let intended = Data("[]".utf8)
        let manifestV2 = try SyncTestSupport.manifestFixture(replacing: "events.json", with: intended)
        // …but the server actually serves different, truncated/corrupt bytes.
        let corrupted = Data("not-what-the-manifest-declared".utf8)

        MockURLProtocol.reset()
        SyncTestSupport.stubSuccessfulSync(manifestBody: manifestV2, etag: "W/\"v3\"", fileBodies: ["events.json": corrupted])

        let result = await makeClient().sync()

        XCTAssertEqual(result, .changedFiles([]), "the only candidate file failed its hash check, so nothing was applied")
        XCTAssertEqual(cache.read("events.json"), originalEvents, "old file must be kept untouched")

        let state = try XCTUnwrap(cache.readSyncState())
        XCTAssertEqual(state.appliedFiles["events.json"], originalEntry, "old entry must be carried forward so the file is retried next sync")

        let dataStore = DataStore(cache: cache)
        XCTAssertEqual(dataStore.loadEvents().count, Fixture.rawArray("events").count, "DataStore must still serve the old, good content")
    }
}
