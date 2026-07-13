//
//  SyncClient.swift
//  Zenji
//
//  WP-12: polls docs/data/manifest.json (WP-03) with If-None-Match, decodes
//  it with the WP-11 Manifest model, diffs its per-file sha256 against what
//  this cache has actually applied (SyncState.appliedFiles — see that type's
//  doc for why this is not simply "the last manifest seen"), and fetches
//  ONLY the changed files that this client actually cares about.
//
//  `filesOfInterest` narrows the manifest's ~30 published files down to the
//  ones the iOS app consumes (events.json for the agenda, entities.json for
//  WP-05 entity ids, tracked.json for "what we track" transparency,
//  interests.json (WP-15) so NotificationPlanner has the real notify-config/
//  mustWatch entities to plan against) — the rest of the manifest (agent
//  logs, calibration, per-sport source files, …) is irrelevant to this
//  client and never fetched, changed or not.
//
//  A file whose downloaded bytes don't hash to what the manifest declared is
//  discarded outright: the old cached copy (if any) is kept, and — because
//  its OLD entry is carried forward into the new SyncState rather than the
//  manifest's new one — it is retried on the next sync instead of being
//  wrongly considered "already applied".
//
//  Network access goes through an injected `URLSession` (tests substitute a
//  session configured with a mock URLProtocol per URLSessionConfiguration),
//  so this type needs no networking abstraction layer of its own.
//

import Foundation

struct SyncClient: Sendable {
    static let defaultBaseURL = URL(string: "https://zenji.app/data/")!

    /// The published files this iOS client actually consumes. See the
    /// type-level doc above for why the rest of the manifest is ignored.
    static let defaultFilesOfInterest: Set<String> = ["events.json", "entities.json", "tracked.json", "interests.json"]

    private static let manifestFilename = "manifest.json"

    let baseURL: URL
    let session: URLSession
    let cache: CacheStore
    let filesOfInterest: Set<String>

    init(
        baseURL: URL = SyncClient.defaultBaseURL,
        session: URLSession = .shared,
        cache: CacheStore = CacheStore(),
        filesOfInterest: Set<String> = SyncClient.defaultFilesOfInterest
    ) {
        self.baseURL = baseURL
        self.session = session
        self.cache = cache
        self.filesOfInterest = filesOfInterest
    }

    @discardableResult
    func sync() async -> SyncResult {
        let previousState = cache.readSyncState() ?? .empty

        var manifestRequest = URLRequest(url: baseURL.appendingPathComponent(Self.manifestFilename))
        if let etag = previousState.etag {
            manifestRequest.setValue(etag, forHTTPHeaderField: "If-None-Match")
        }

        let manifestData: Data
        let manifestResponse: HTTPURLResponse
        do {
            let (data, response) = try await session.data(for: manifestRequest)
            guard let http = response as? HTTPURLResponse else {
                return .failure(.unexpectedResponse)
            }
            manifestData = data
            manifestResponse = http
        } catch {
            return .failure(.transport(error.localizedDescription))
        }

        if manifestResponse.statusCode == 304 {
            return .upToDate
        }
        guard manifestResponse.statusCode == 200 else {
            return .failure(.httpStatus(manifestResponse.statusCode))
        }

        let manifest: Manifest
        do {
            manifest = try ZenjiJSON.decoder.decode(Manifest.self, from: manifestData)
        } catch {
            return .failure(.invalidManifest)
        }

        let changedFilenames = manifest.files.keys
            .filter { filesOfInterest.contains($0) }
            .filter { previousState.appliedFiles[$0]?.sha256 != manifest.files[$0]?.sha256 }
            .sorted()

        var reconciledFiles = previousState.appliedFiles
        var actuallyChanged: [String] = []

        for filename in changedFilenames {
            guard let entry = manifest.files[filename] else { continue }
            guard let fileData = try? await fetchFile(filename), fileData.sha256Hex == entry.sha256 else {
                continue // network hiccup or hash mismatch: keep whatever's cached, retry next sync
            }
            guard (try? cache.write(fileData, filename: filename)) != nil else {
                continue // couldn't write to disk: same treatment, retry next sync
            }
            reconciledFiles[filename] = entry
            actuallyChanged.append(filename)
        }

        let newETag = manifestResponse.value(forHTTPHeaderField: "ETag") ?? previousState.etag
        let newState = SyncState(etag: newETag, appliedFiles: reconciledFiles, lastSync: Date())
        try? cache.writeSyncState(newState)

        return .changedFiles(actuallyChanged)
    }

    private func fetchFile(_ filename: String) async throws -> Data {
        let (data, response) = try await session.data(for: URLRequest(url: baseURL.appendingPathComponent(filename)))
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw SyncError.httpStatus((response as? HTTPURLResponse)?.statusCode ?? -1)
        }
        return data
    }
}
