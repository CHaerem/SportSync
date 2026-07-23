//
//  AgendaReloadConcurrencyTests.swift
//  SportivistaTests
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
            .appendingPathComponent("sportivista-wp60-\(UUID().uuidString)", isDirectory: true))
        try cache.write(Fixture.data("events"), filename: "events.json")
        try cache.write(Fixture.data("interests"), filename: "interests.json")
        try cache.write(Self.smallEntitiesData, filename: "entities.json")
        return cache
    }

    // WP-187 — a DELIBERATELY small entities fixture for THIS class only. What
    // these tests prove — WHERE the reload compute runs (off-main) and HOW OFTEN
    // (the ≤2-recompile coalescing + "siste vinner") — is entirely independent of
    // how many entities the index holds: the burst is fired synchronously while
    // the main actor is held, so it coalesces structurally (the `reloadTask != nil`
    // guard), never on a timing window, and the main-thread guard fires on WHERE
    // the code ran, not on what it computed. The shared `Fixture.data("entities")`
    // is the full 3 659-entity world register (~800 KB), and `EntityIndex.init`
    // compiles an `NSRegularExpression` per term over it — thousands of regex
    // compiles that made a SINGLE `computeReloadSync` take ~9 s in the simulator
    // (measured: `test_guard_trips…` at 9.2 s), ballooning to tens of seconds and
    // occasional simulator timeouts under the parallel-xcodebuild load these tests
    // run under (the noise WP-187 removes). That cost has nothing to do with the
    // concurrency guarantees under test, so it is not paid here. A handful of real
    // entities still exercises the same decode→index→compile pipeline off-main and
    // still compiles the events fixture into a non-empty board — the compile core
    // and the golden vectors are frozen bit-for-bit in AgendaViewModelTests /
    // FeedVectorTests, over the FULL data, exactly where dataset size matters.
    private static let smallEntitiesData: Data = {
        let entities = """
        [
          {"id":"lyn","name":"Lyn","aliases":["FK Lyn Oslo"],"sport":"football","type":"team"},
          {"id":"birmingham-city","name":"Birmingham City","aliases":[],"sport":"football","type":"team"},
          {"id":"england-national","name":"England","aliases":[],"sport":"football","type":"team","national":true,"country":"GB-ENG"},
          {"id":"tour-de-france","name":"Tour de France","aliases":["TdF"],"sport":"cycling","type":"tournament"},
          {"id":"wimbledon","name":"Wimbledon","aliases":[],"sport":"tennis","type":"tournament"},
          {"id":"casper-ruud","name":"Casper Ruud","aliases":[],"sport":"tennis","type":"athlete","country":"NO"},
          {"id":"sjakk-nm","name":"Sjakk-NM","aliases":["Landsturneringen"],"sport":"chess","type":"tournament"}
        ]
        """
        return Data(entities.utf8)
    }()

    private func tempProfileStore() -> ProfileStore {
        ProfileStore(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("sportivista-wp60-\(UUID().uuidString)", isDirectory: true))
    }

    private func makeVM(cache: CacheStore, profileStore: ProfileStore) -> AgendaViewModel {
        AgendaViewModel(dataStore: DataStore(cache: cache), profileStore: profileStore)
    }

    private let now = "2026-07-13T12:00:00Z"

    // MARK: - Coalescing

    /// The precondition every coalescing assertion below rests on: a burst fired
    /// from synchronous `@MainActor` code holds the main actor for its whole
    /// duration, so the reload `Task { @MainActor in … }` cannot have STARTED —
    /// let alone finished — while the burst is being fired. That is an actor
    /// guarantee, not a timing hope, and asserting it turns "the in-flight reload
    /// might already have finished under load" from an unstated assumption into a
    /// checked, self-describing one: if it ever breaks, this line fails and names
    /// the reason instead of leaving a bare `== 2` mismatch to interpret.
    private func assertBurstWasAtomic(_ vm: AgendaViewModel, since before: Int,
                                      file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(vm.recompileCount - before, 0,
                       "precondition: the burst held the main actor throughout, so no recompile has begun yet",
                       file: file, line: line)
    }

    func test_singleReload_isOneRecompile() async throws {
        let vm = makeVM(cache: try tempCacheWithFixtures(), profileStore: tempProfileStore())

        vm.reloadFromCache(now: iso(now))
        assertBurstWasAtomic(vm, since: 0)
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
        assertBurstWasAtomic(vm, since: before)
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
        assertBurstWasAtomic(vm, since: before)
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
        // assert it fired without a (unsupported) death test. The recorder is
        // installed on THIS thread only, so what comes back is what this body
        // caused — NewsModelTests' identical guard test cannot reset it (nor can
        // anything else in flight) between the call and the assertion.
        let violations = MainThreadGuard.recordViolationsForTesting {
            _ = AgendaViewModel.computeReloadSync(
                now: iso(now), dataStore: dataStore, profileStore: profileStore, cachedIndex: nil)
        }

        XCTAssertFalse(violations.isEmpty, "decode/compile on the main thread must trip the WP-60 guard")
        // …and it is OUR pipeline that tripped it, not some neighbouring one.
        XCTAssertTrue(violations.contains { $0.contains("AgendaViewModel reload") },
                      "the recorded violation is the agenda reload pipeline's own")
    }

    /// The recorder must be scoped to ONE `recordViolationsForTesting` call, so a
    /// second guard test (NewsModelTests has one) can neither see this one's
    /// violations nor clear them. Nesting is the sharpest form of that: the inner
    /// recorder captures only the inner violation, and the outer one is intact
    /// afterwards. The process-global recorder this replaced failed both halves.
    func test_guardRecorder_isScopedToOneRecordingCall() throws {
        var inner: [String] = []
        let outer = MainThreadGuard.recordViolationsForTesting {
            MainThreadGuard.assertOffMain("outer pipeline")
            inner = MainThreadGuard.recordViolationsForTesting {
                MainThreadGuard.assertOffMain("inner pipeline")
            }
            MainThreadGuard.assertOffMain("outer pipeline, after the nested recorder")
        }

        XCTAssertEqual(inner.count, 1, "the nested recorder sees only its own violation")
        XCTAssertTrue(inner[0].contains("inner pipeline"))
        XCTAssertEqual(outer.count, 2, "the outer recorder keeps its own violations across the nested one")
        XCTAssertTrue(outer.allSatisfy { $0.contains("outer pipeline") },
                      "and none of the inner recorder's leaked into it")
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
