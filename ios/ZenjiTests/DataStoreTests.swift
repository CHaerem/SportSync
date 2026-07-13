//
//  DataStoreTests.swift
//  ZenjiTests
//
//  WP-12: DataStore never throws, decodes what SyncClient has cached, and
//  its `lastSync` doubles as the "have we ever synced" flag.
//

import XCTest

final class DataStoreTests: XCTestCase {
    private var tempDirectory: URL!
    private var cache: CacheStore!

    override func setUp() {
        super.setUp()
        tempDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        cache = CacheStore(rootDirectory: tempDirectory)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDirectory)
        super.tearDown()
    }

    func testLoadEvents_emptyCache_returnsEmptyArrayNotThrow() {
        let dataStore = DataStore(cache: cache)
        XCTAssertEqual(dataStore.loadEvents(), [])
    }

    func testLoadEntities_emptyCache_returnsEmptyArrayNotThrow() {
        let dataStore = DataStore(cache: cache)
        XCTAssertEqual(dataStore.loadEntities(), [])
    }

    func testLoadTracked_emptyCache_returnsNilNotThrow() {
        let dataStore = DataStore(cache: cache)
        XCTAssertNil(dataStore.loadTracked())
    }

    func testLastSync_noStateWritten_isNil() {
        let dataStore = DataStore(cache: cache)
        XCTAssertNil(dataStore.lastSync, "nil is the 'never synced' flag callers rely on")
    }

    func testLoadEvents_decodesWhatSyncClientCached() throws {
        try cache.write(Fixture.data("events"), filename: "events.json")

        let dataStore = DataStore(cache: cache)
        let events = dataStore.loadEvents()

        XCTAssertEqual(events.count, Fixture.rawArray("events").count)
    }

    func testLoadEntities_decodesWhatSyncClientCached() throws {
        try cache.write(Fixture.data("entities"), filename: "entities.json")

        let dataStore = DataStore(cache: cache)
        XCTAssertEqual(dataStore.loadEntities().count, Fixture.rawArray("entities").count)
    }

    func testLoadTracked_decodesWhatSyncClientCached() throws {
        try cache.write(Fixture.data("tracked"), filename: "tracked.json")

        let dataStore = DataStore(cache: cache)
        let tracked = try XCTUnwrap(dataStore.loadTracked())
        XCTAssertTrue(tracked.athletes.contains { $0.id == "viktor-hovland" })
    }

    func testLoadEvents_corruptCacheFile_returnsEmptyArrayNotThrow() throws {
        try cache.write(Data("not valid json at all".utf8), filename: "events.json")

        let dataStore = DataStore(cache: cache)
        XCTAssertEqual(dataStore.loadEvents(), [])
    }

    func testLastSync_reflectsWrittenState() throws {
        let lastSync = Date(timeIntervalSince1970: 1_752_000_000)
        try cache.writeSyncState(SyncState(etag: nil, appliedFiles: [:], lastSync: lastSync))

        let dataStore = DataStore(cache: cache)
        XCTAssertEqual(dataStore.lastSync, lastSync)
    }
}
