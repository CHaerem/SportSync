//
//  AgendaReloadConcurrencyTests.swift
//  ZenjiTests
//
//  WP-60 — proves the two behavioural guarantees of moving the agenda reload
//  pipeline off the main actor:
//
//    1. COALESCING — a burst of N rapid `reloadFromCache` calls (the starter-
//       pack scenario: many `onProfileChanged` in one run-loop tick) collapses
//       into ≤2 recompiles (the in-flight one + a single trailing recompile
//       against the latest state), and the applied board reflects the LATEST
//       on-disk state ("siste vinner").
//    2. MAIN-THREAD GUARD — `MainThreadGuard` trips when the decode/compile
//       pipeline runs on the main thread, and stays silent when it runs off it.
//
//  The pure compile core (`buildSections`/`liveRows`) is exercised bit-for-bit
//  elsewhere (AgendaViewModelTests + the golden FeedVectorTests); this file is
//  strictly about WHERE and HOW OFTEN that core runs.
//

import XCTest

@MainActor
final class AgendaReloadConcurrencyTests: XCTestCase {

    private func iso(_ s: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)!
    }

    private func tempCacheWithFixtures() throws -> CacheStore {
        let cache = CacheStore(rootDirectory: FileManager.default.temporaryDirectory
            .appendingPathComponent("zenji-wp60-\(UUID().uuidString)", isDirectory: true))
        try cache.write(Fixture.data("events"), filename: "events.json")
        try cache.write(Fixture.data("interests"), filename: "interests.json")
        try cache.write(Fixture.data("entities"), filename: "entities.json")
        return cache
    }

    private func tempProfileStore() -> ProfileStore {
        ProfileStore(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("zenji-wp60-\(UUID().uuidString)", isDirectory: true))
    }

    private func makeVM(cache: CacheStore, profileStore: ProfileStore) -> AgendaViewModel {
        AgendaViewModel(dataStore: DataStore(cache: cache), profileStore: profileStore)
    }

    private let now = "2026-07-13T12:00:00Z"

    // MARK: - Coalescing

    func test_singleReload_isOneRecompile() async throws {
        let vm = makeVM(cache: try tempCacheWithFixtures(), profileStore: tempProfileStore())

        vm.reloadFromCache(now: iso(now))
        await vm.awaitReloadsQuiescent()

        XCTAssertEqual(vm.recompileCount, 1, "a single reload recompiles exactly once")
        XCTAssertFalse(vm.sections.isEmpty, "the real fixtures produce a board off-main")
    }

    func test_burstOfRapidReloads_coalescesToAtMostTwoRecompiles() async throws {
        let vm = makeVM(cache: try tempCacheWithFixtures(), profileStore: tempProfileStore())

        // A burst of requests fired synchronously in ONE run-loop tick — exactly
        // what N rapid starter-pack toggles produce via onProfileChanged. The
        // first starts the in-flight reload; the rest only mark "recompile once
        // more when done", so the whole burst is ≤2 compiles, never N.
        let before = vm.recompileCount
        for _ in 0..<8 { vm.reloadFromCache(now: iso(now)) }
        await vm.awaitReloadsQuiescent()

        XCTAssertLessThanOrEqual(vm.recompileCount - before, 2, "N rapid reloads ⇒ ≤2 recompiles")
        XCTAssertEqual(vm.recompileCount - before, 2, "a burst is exactly the in-flight compile + one trailing recompile")
    }

    func test_coalescedReload_reflectsLatestOnDiskState_lastWins() async throws {
        let profileStore = tempProfileStore()
        let vm = makeVM(cache: try tempCacheWithFixtures(), profileStore: profileStore)

        // Baseline: a non-empty profile is read on reload.
        try profileStore.save(InterestProfile(rules: [
            InterestRule(entityId: "casper-ruud", entityName: "Casper Ruud", sport: "tennis",
                         scope: nil, weight: 0.8, reason: "test", addedAt: Date()),
        ]))
        vm.reloadFromCache(now: iso(now))
        await vm.awaitReloadsQuiescent()
        XCTAssertFalse(vm.profileIsEmpty, "reload reads the saved (non-empty) profile")

        // Now rewrite the profile to empty in the MIDDLE of a coalesced burst.
        // The single trailing recompile reads the newest state, so the applied
        // board reflects the empty profile — the earlier state never wins.
        let before = vm.recompileCount
        vm.reloadFromCache(now: iso(now))                  // starts the in-flight reload
        try profileStore.save(InterestProfile(rules: []))  // latest state: empty
        vm.reloadFromCache(now: iso(now))                  // coalesced
        vm.reloadFromCache(now: iso(now))                  // coalesced
        await vm.awaitReloadsQuiescent()

        XCTAssertEqual(vm.recompileCount - before, 2, "the burst still coalesced to two recompiles")
        XCTAssertTrue(vm.profileIsEmpty, "the coalesced reload reflects the LATEST on-disk state")
    }

    // MARK: - Main-thread guard

    func test_guard_tripsWhenDecodeCompileRunsOnMainThread() throws {
        let dataStore = DataStore(cache: try tempCacheWithFixtures())
        let profileStore = tempProfileStore()

        // This test method runs on the main thread, so invoking the synchronous
        // pipeline directly here is exactly the regression the guard must catch.
        // `recordViolationsForTesting` swaps the trap for a recorder so we can
        // assert it fired without a (unsupported) death test.
        let violations = MainThreadGuard.recordViolationsForTesting {
            _ = AgendaViewModel.computeReloadSync(
                now: iso(now), dataStore: dataStore, profileStore: profileStore, cachedIndex: nil)
        }

        XCTAssertFalse(violations.isEmpty, "decode/compile on the main thread must trip the WP-60 guard")
    }

    func test_computeReload_runsOffMain_withoutTripping() async throws {
        let dataStore = DataStore(cache: try tempCacheWithFixtures())
        let profileStore = tempProfileStore()

        // Default guard mode TRAPS on a main-thread violation. `computeReload` is
        // nonisolated async, so awaiting it from this @MainActor test hops off the
        // main actor — reaching the assertions (no crash) proves it ran off-main
        // and produced a real board.
        let result = await AgendaViewModel.computeReload(
            now: iso(now), dataStore: dataStore, profileStore: profileStore, cachedIndex: nil)

        XCTAssertFalse(result.sections.isEmpty, "the off-main pipeline compiles the real fixtures into a board")
    }
}
