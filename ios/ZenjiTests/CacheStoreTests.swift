//
//  CacheStoreTests.swift
//  ZenjiTests
//
//  WP-12: CacheStore in isolation — atomic read/write round-trips, the
//  sync-state round-trip, and the App Group → Application Support fallback.
//
//  The fallback is exercised via a fake FileManager rather than the real
//  environment: on the Simulator, `containerURL(forSecurityApplicationGroupIdentifier:)`
//  can succeed even for a hostless bundle with no entitlements file at all
//  (observed directly while writing this test — the Simulator's sandboxd is
//  lenient about app-group containers for unsigned Debug builds), so relying
//  on "this test target has no entitlements" to reliably hit the fallback
//  branch would be flaky across environments. Overriding the one FileManager
//  method gives a deterministic test instead.
//

import XCTest

/// Deterministically simulates "no App Group container available" for
/// CacheStore's fallback test — see the file-level doc above for why the
/// real Simulator environment isn't reliable enough to exercise this branch.
private final class NoAppGroupFileManager: FileManager {
    override func containerURL(forSecurityApplicationGroupIdentifier groupIdentifier: String) -> URL? {
        nil
    }
}

final class CacheStoreTests: XCTestCase {
    // MARK: Explicit-directory init (what SyncClientTests/DataStoreTests use)

    func testWriteThenRead_roundTripsBytesExactly() throws {
        let dir = makeTempDirectory()
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = CacheStore(rootDirectory: dir)

        let payload = Data("{\"hello\":\"world\"}".utf8)
        try store.write(payload, filename: "events.json")

        XCTAssertEqual(store.read("events.json"), payload)
    }

    func testRead_missingFile_returnsNilRatherThanThrowing() {
        let dir = makeTempDirectory()
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = CacheStore(rootDirectory: dir)

        XCTAssertNil(store.read("events.json"))
    }

    func testSyncState_roundTripsThroughDisk() throws {
        let dir = makeTempDirectory()
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = CacheStore(rootDirectory: dir)

        XCTAssertNil(store.readSyncState(), "no state written yet")

        let state = SyncState(
            etag: "W/\"abc\"",
            appliedFiles: ["events.json": Manifest.FileEntry(bytes: 42, sha256: "deadbeef", sourceLastUpdated: nil)],
            lastSync: Date(timeIntervalSince1970: 1_752_000_000)
        )
        try store.writeSyncState(state)

        XCTAssertEqual(store.readSyncState(), state)
    }

    func testInit_createsTheDirectoryIfMissing() {
        let dir = makeTempDirectory()
        defer { try? FileManager.default.removeItem(at: dir) }
        var isDirectory: ObjCBool = false
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.path, isDirectory: &isDirectory), "sanity: shouldn't exist yet")

        _ = CacheStore(rootDirectory: dir)

        XCTAssertTrue(FileManager.default.fileExists(atPath: dir.path, isDirectory: &isDirectory))
        XCTAssertTrue(isDirectory.boolValue)
    }

    // MARK: App Group → Application Support fallback

    /// When the App Group container genuinely isn't available (WP-12's
    /// "simulator/tester" case), CacheStore must fall back to Application
    /// Support rather than fail — and the fallback directory must actually
    /// be usable, not just a plausible-looking path.
    func testInit_whenAppGroupContainerIsUnavailable_fallsBackToApplicationSupport() throws {
        let store = CacheStore(appGroupIdentifier: "group.app.zenji", fileManager: NoAppGroupFileManager())
        defer { try? FileManager.default.removeItem(at: store.directoryURL) }

        XCTAssertTrue(
            store.directoryURL.path.contains("Application Support"),
            "expected the Application Support fallback, got \(store.directoryURL.path)"
        )

        let payload = Data("fallback-cache-works".utf8)
        try store.write(payload, filename: "events.json")
        XCTAssertEqual(store.read("events.json"), payload)
    }

    /// The default initializer (real FileManager, no overrides) must produce
    /// a usable cache directory either way — whichever container the host
    /// environment actually grants it (App Group or the fallback).
    func testDefaultInit_producesAUsableDirectory() throws {
        let store = CacheStore()
        defer { try? FileManager.default.removeItem(at: store.directoryURL) }

        let payload = Data("default-init-cache-works".utf8)
        try store.write(payload, filename: "events.json")
        XCTAssertEqual(store.read("events.json"), payload)
    }

    // MARK: - Helpers

    private func makeTempDirectory() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    }
}
