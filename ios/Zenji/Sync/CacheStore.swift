//
//  CacheStore.swift
//  Zenji
//
//  WP-12: on-disk cache for synced data files. Prefers the `group.app.zenji`
//  App Group container (declared in Zenji.entitlements /
//  ZenjiWidget.entitlements, see ios/README.md) so the widget extension can
//  read the same cache once it needs to — and falls back automatically to
//  this process's own Application Support directory when the App Group
//  container genuinely isn't available (e.g. a real, properly-signed device
//  build before WP-17 wires up an actual provisioning profile). In practice
//  the Simulator resolves the App Group container readily even pre-WP-17 —
//  its sandboxd is lenient about app-group containers for unsigned Debug
//  builds — so don't assume "runs in the Simulator" implies "took the
//  fallback path"; CacheStoreTests exercises the fallback deterministically
//  via a fake FileManager instead of relying on that ambient behavior.
//
//  Files are written atomically and as-is — whatever bytes the server sent,
//  no transformation. `sync-state.json` (see SyncState.swift) is the one
//  piece of Zenji-owned bookkeeping alongside them.
//

import Foundation

final class CacheStore: @unchecked Sendable {
    private static let cacheDirectoryName = "ZenjiCache"
    private static let syncStateFilename = "sync-state.json"

    let directoryURL: URL
    private let fileManager: FileManager

    /// Used by the running app: resolves the App Group container if
    /// available, falling back to Application Support otherwise. See the
    /// type-level doc above for why the fallback is the path that actually
    /// runs today.
    convenience init(appGroupIdentifier: String = "group.app.zenji", fileManager: FileManager = .default) {
        let base: URL
        if let groupContainer = fileManager.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) {
            base = groupContainer
        } else {
            base = (try? fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
                ?? fileManager.temporaryDirectory
        }
        self.init(rootDirectory: base.appendingPathComponent(Self.cacheDirectoryName, isDirectory: true), fileManager: fileManager)
    }

    /// Explicit-directory initializer — bypasses the App Group lookup
    /// entirely. Tests use this to get a fresh, isolated cache per test
    /// rather than sharing whatever this process's real Application Support
    /// directory happens to hold from a previous run.
    init(rootDirectory: URL, fileManager: FileManager = .default) {
        self.directoryURL = rootDirectory
        self.fileManager = fileManager
        try? fileManager.createDirectory(at: rootDirectory, withIntermediateDirectories: true)
    }

    /// Raw bytes of a cached data file, or `nil` if it was never synced (or
    /// synced and then removed).
    func read(_ filename: String) -> Data? {
        try? Data(contentsOf: fileURL(for: filename))
    }

    /// Atomic write — either the whole file lands, or the previous one (if
    /// any) is left completely untouched. A crash or termination mid-write
    /// can never hand DataStore a half-written file.
    func write(_ data: Data, filename: String) throws {
        try data.write(to: fileURL(for: filename), options: .atomic)
    }

    func readSyncState() -> SyncState? {
        guard let data = try? Data(contentsOf: syncStateURL) else { return nil }
        return try? ZenjiJSON.decoder.decode(SyncState.self, from: data)
    }

    func writeSyncState(_ state: SyncState) throws {
        let data = try SyncState.encoder.encode(state)
        try data.write(to: syncStateURL, options: .atomic)
    }

    private func fileURL(for filename: String) -> URL {
        directoryURL.appendingPathComponent(filename)
    }

    private var syncStateURL: URL {
        directoryURL.appendingPathComponent(Self.syncStateFilename)
    }
}
