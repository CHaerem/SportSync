//
//  DataStore.swift
//  Zenji
//
//  WP-12: read-only facade over CacheStore for the rest of the app — decodes
//  cached JSON through the shared ZenjiJSON.decoder (WP-11). Never throws:
//  a missing or corrupt cache file is not a crash, it's an empty list — the
//  UI shows "no data yet" instead of a bug. `lastSync` doubles as the "have
//  we ever synced" flag callers need, to tell "no events because offline on
//  first launch" apart from "no events because there genuinely are none
//  right now" (also a legitimate state, e.g. an off-season day).
//

import Foundation

struct DataStore: Sendable {
    private let cache: CacheStore

    init(cache: CacheStore = CacheStore()) {
        self.cache = cache
    }

    func loadEvents() -> [Event] {
        guard let data = cache.read("events.json") else { return [] }
        return (try? ZenjiJSON.decoder.decode([Event].self, from: data)) ?? []
    }

    func loadEntities() -> [Entity] {
        guard let data = cache.read("entities.json") else { return [] }
        return (try? ZenjiJSON.decoder.decode([Entity].self, from: data)) ?? []
    }

    func loadTracked() -> TrackedConfig? {
        guard let data = cache.read("tracked.json") else { return nil }
        return try? ZenjiJSON.decoder.decode(TrackedConfig.self, from: data)
    }

    /// `nil` means "never synced" — see the type-level doc above for why
    /// this is the flag callers should check, not an empty `loadEvents()`.
    var lastSync: Date? {
        cache.readSyncState()?.lastSync
    }
}
