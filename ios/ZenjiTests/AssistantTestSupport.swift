//
//  AssistantTestSupport.swift
//  ZenjiTests
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
    /// EntityIndex over the real, checked-in entities fixture.
    static func liveIndex() -> EntityIndex {
        // swiftlint:disable:next force_try
        let entities = try! ZenjiJSON.decoder.decode([Entity].self, from: Fixture.data("entities"))
        return EntityIndex(entities)
    }

    /// A ProfileStore in a fresh, unique temp directory.
    static func tempProfileStore() -> ProfileStore {
        ProfileStore(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("zenji-tests-\(UUID().uuidString)", isDirectory: true))
    }

    /// A MisunderstoodLogStore in a fresh, unique temp directory (WP-16.3) —
    /// same throwaway-temp-dir convention as `tempProfileStore()`.
    static func tempMisunderstoodLog() -> MisunderstoodLogStore {
        MisunderstoodLogStore(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("zenji-tests-\(UUID().uuidString)", isDirectory: true))
    }
}
