//
//  AssistantTestSupport.swift
//  SportivistaTests
//
//  WP-16 — shared helpers for the FM-lekegrind tests. The entity index is built
//  from the SAME checked-in `entities.json` fixture the WP-11 decode tests use
//  (real production entity ids: casper-ruud, fk-lyn-oslo, tour-de-france-2026,
//  …), so the parser/grounder are proven against real data, not invented ids.
//  ProfileStore always points at a throwaway temp directory so persistence
//  round-trips never touch this process's real Application Support.
//

import Foundation

enum AssistantTestSupport {
    /// EntityIndex over the real, checked-in entities fixture — built ONCE and
    /// shared (immutable, read-only in tests). WP-161 lesson: XCTest creates one
    /// test-case instance per test METHOD at discovery, so an instance-property
    /// `liveIndex()` used to rebuild the index hundreds of times; at world-
    /// registry scale (3 661 entities) that exceeded the runner's preparation
    /// timeout before a single test ran.
    private static let cachedLiveIndex: EntityIndex = {
        // swiftlint:disable:next force_try
        let entities = try! SportivistaJSON.decoder.decode([Entity].self, from: Fixture.data("entities"))
        return EntityIndex(entities)
    }()

    static func liveIndex() -> EntityIndex { cachedLiveIndex }

    /// A ProfileStore in a fresh, unique temp directory.
    static func tempProfileStore() -> ProfileStore {
        ProfileStore(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("sportivista-tests-\(UUID().uuidString)", isDirectory: true))
    }

    /// A MisunderstoodLogStore in a fresh, unique temp directory (WP-16.3) —
    /// same throwaway-temp-dir convention as `tempProfileStore()`.
    static func tempMisunderstoodLog() -> MisunderstoodLogStore {
        MisunderstoodLogStore(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("sportivista-tests-\(UUID().uuidString)", isDirectory: true))
    }

    /// A MemoryStore (WP-30) over a fresh throwaway ProfileStore — memory shares
    /// the profile file, so this also gives an isolated ProfileSyncState.
    static func tempMemoryStore(deviceID: String = "TEST-DEVICE") -> MemoryStore {
        let store = ProfileStore(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("sportivista-tests-\(UUID().uuidString)", isDirectory: true), deviceID: deviceID)
        return MemoryStore(profileStore: store)
    }

    // MARK: - WP-16.4 — the local agenda the answer arm queries

    /// The real, checked-in events fixture as `[Event]`.
    static func fixtureEvents() -> [Event] {
        // swiftlint:disable:next force_try
        try! SportivistaJSON.decoder.decode([Event].self, from: Fixture.data("events"))
    }

    /// The real, checked-in interests fixture.
    static func fixtureInterests() -> Interests {
        // swiftlint:disable:next force_try
        try! SportivistaJSON.decoder.decode(Interests.self, from: Fixture.data("interests"))
    }

    /// A FeedQuery over the real fixtures, compiled against `now` — the same
    /// agenda the app would show, for driving the Q&A tests deterministically.
    static func liveFeed(now: Date) -> FeedQuery {
        FeedQuery.build(events: fixtureEvents(), interests: fixtureInterests(), now: now)
    }

    /// Parse an ISO 8601 instant (internet date-time) for fixed test clocks.
    static func iso(_ s: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        // swiftlint:disable:next force_unwrapping
        return f.date(from: s)!
    }
}
