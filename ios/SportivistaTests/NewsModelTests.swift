//
//  NewsModelTests.swift
//  SportivistaTests
//
//  WP-107 — proves the two behavioural guarantees of moving the Nyheter board
//  build off the main actor and up to a segment-surviving model:
//
//    1. NO REBUILD ON A PLAIN SWITCH — `rebuildIfStale` builds once (the first
//       appearance), then is a NO-OP on every further call until something marks
//       the board stale. That is what removes the per-switch lag: coming back to
//       Nyheter renders the cached `board` with zero disk-read/decode/compile.
//       `markStale` (a profile change / a completed sync) re-arms exactly one
//       rebuild; a burst coalesces ("siste vinner").
//    2. MAIN-THREAD GUARD — the build pipeline (cache read + JSON decode +
//       EntityIndex + NewsBoard.build) trips the shared `MainThreadGuard` when
//       forced on the main thread, and runs silently off it.
//
//  The board's CONTENT (lens filtering, sections, spoiler flags) is exercised
//  bit-for-bit by NewsBoardTests / NewsLensTests; this file is strictly about
//  WHERE and HOW OFTEN the build runs.
//

import XCTest

@MainActor
final class NewsModelTests: XCTestCase {

	private let now = ISO8601DateFormatter().date(from: "2026-07-19T12:00:00Z")!

	private func tempCacheWithFixtures() throws -> CacheStore {
		let cache = CacheStore(rootDirectory: FileManager.default.temporaryDirectory
			.appendingPathComponent("sportivista-wp107-\(UUID().uuidString)", isDirectory: true))
		try cache.write(Fixture.data("news"), filename: "news.json")
		try cache.write(Fixture.data("featured"), filename: "featured.json")
		try cache.write(Fixture.data("recent-results"), filename: "recent-results.json")
		try cache.write(Fixture.data("events"), filename: "events.json")
		try cache.write(Fixture.data("entities"), filename: "entities.json")
		return cache
	}

	private func tempProfileStore() -> ProfileStore {
		ProfileStore(directory: FileManager.default.temporaryDirectory
			.appendingPathComponent("sportivista-wp107-\(UUID().uuidString)", isDirectory: true))
	}

	private func makeModel(cache: CacheStore, profileStore: ProfileStore) -> NewsModel {
		NewsModel(dataStore: DataStore(cache: cache), profileStore: profileStore)
	}

	// MARK: - No rebuild on a plain tab switch

	func test_rebuildIfStale_buildsOnceThenNoOps() async throws {
		let model = makeModel(cache: try tempCacheWithFixtures(), profileStore: tempProfileStore())

		// First appearance: the board is stale (never built), so it builds once.
		model.rebuildIfStale(now: now)
		await model.awaitQuiescent()
		XCTAssertEqual(model.buildCount, 1, "the first appearance builds the board once")

		// Every further switch onto an unchanged board is a NO-OP — the fix for
		// the per-switch lag.
		for _ in 0..<5 { model.rebuildIfStale(now: now) }
		await model.awaitQuiescent()
		XCTAssertEqual(model.buildCount, 1, "switching back to Nyheter does NOT rebuild an up-to-date board")
	}

	func test_markStale_reArmsExactlyOneRebuild() async throws {
		let model = makeModel(cache: try tempCacheWithFixtures(), profileStore: tempProfileStore())

		model.rebuildIfStale(now: now)
		await model.awaitQuiescent()
		XCTAssertEqual(model.buildCount, 1)

		// A profile change / completed sync marks the board stale — the next
		// switch rebuilds exactly once, then goes quiet again.
		model.markStale()
		model.rebuildIfStale(now: now)
		await model.awaitQuiescent()
		XCTAssertEqual(model.buildCount, 2, "markStale re-arms one rebuild")

		model.rebuildIfStale(now: now)
		await model.awaitQuiescent()
		XCTAssertEqual(model.buildCount, 2, "and only one — a further switch is a no-op again")
	}

	func test_burstOfRebuilds_coalesces() async throws {
		let model = makeModel(cache: try tempCacheWithFixtures(), profileStore: tempProfileStore())

		// A burst fired in one run-loop tick (e.g. several onProfileChanged in a
		// starter-pack apply): the first starts the in-flight build, the rest only
		// mark "build once more when done" — so ≤2 builds, never N.
		for _ in 0..<8 { model.rebuild(now: now) }
		await model.awaitQuiescent()
		XCTAssertLessThanOrEqual(model.buildCount, 2, "a burst coalesces to at most two builds")
	}

	// MARK: - WP-136 — day-gated brief re-evaluates on a fresh-`now` rebuild

	/// The foreground / day-rollover path (ContentView calls `news.rebuild()` on a
	/// return from background): the SAME cached brief must disappear once the Oslo
	/// day has rolled — a fresh-`now` rebuild re-checks the day-gate, no new sync,
	/// and the whole build stays on the WP-107 off-main coalescing path.
	func test_rebuild_reEvaluatesBriefDayGate_onNewNow() async throws {
		let cache = CacheStore(rootDirectory: FileManager.default.temporaryDirectory
			.appendingPathComponent("sportivista-wp136-\(UUID().uuidString)", isDirectory: true))
		// A brief generated 05:00 Oslo on 20 July (2026-07-20T03:00:00Z, CEST = UTC+2).
		let featured = #"{"generatedAt":"2026-07-20T03:00:00Z","mode":"morning","blocks":[{"type":"headline","text":"Dagens brief."}]}"#
		try cache.write(Data(featured.utf8), filename: "featured.json")
		let model = makeModel(cache: cache, profileStore: tempProfileStore())
		let iso = ISO8601DateFormatter()

		// Opened the SAME Oslo day (08:00, 20 July) → the brief shows.
		model.rebuild(now: iso.date(from: "2026-07-20T06:00:00Z")!)
		await model.awaitQuiescent()
		XCTAssertEqual(model.board.headline, "Dagens brief.", "shown on its own Oslo day")

		// Reopened the NEXT Oslo day (08:00, 21 July) with the SAME cached brief —
		// a fresh-`now` rebuild (the foreground path) must drop it, no re-sync.
		model.rebuild(now: iso.date(from: "2026-07-21T06:00:00Z")!)
		await model.awaitQuiescent()
		XCTAssertNil(model.board.headline, "the brief disappears once the Oslo day has rolled")
	}

	// MARK: - Off-main guarantee

	func test_guard_tripsWhenBuildRunsOnMainThread() throws {
		let dataStore = DataStore(cache: try tempCacheWithFixtures())
		let profileStore = tempProfileStore()

		// This test runs on the main thread, so calling the synchronous core here
		// is exactly the regression the guard must catch.
		let violations = MainThreadGuard.recordViolationsForTesting {
			_ = NewsModel.computeBoardSync(dataStore: dataStore, profileStore: profileStore,
			                               briefWriter: RecordingWidgetBriefSnapshotWriter(), now: now)
		}
		XCTAssertFalse(violations.isEmpty, "the Nyheter build on the main thread must trip the WP-107 guard")
	}

	func test_computeBoard_runsOffMain_withoutTripping() async throws {
		let dataStore = DataStore(cache: try tempCacheWithFixtures())
		let profileStore = tempProfileStore()

		// The default guard mode TRAPS on a main-thread violation. `computeBoard`
		// is nonisolated async, so awaiting it from this @MainActor test hops off
		// the main actor — reaching the assertion (no crash) proves it ran off-main.
		let board = await NewsModel.computeBoard(dataStore: dataStore, profileStore: profileStore,
		                                         briefWriter: RecordingWidgetBriefSnapshotWriter(), now: now)
		_ = board // content is covered by NewsBoardTests; here we only prove it ran.
	}

	// MARK: - WP-181 — the app mirrors the brief to the widget cache

	func test_computeBoard_writesTheBriefToTheWidgetSnapshot() async throws {
		let dataStore = DataStore(cache: try tempCacheWithFixtures())
		let profileStore = tempProfileStore()
		let briefWriter = RecordingWidgetBriefSnapshotWriter()

		// Use the async entry (hops off the main actor) so the WP-107 guard doesn't
		// trap; the write goes through the recording writer off-main.
		let board = await NewsModel.computeBoard(dataStore: dataStore, profileStore: profileStore,
		                                         briefWriter: briefWriter, now: now)

		// Whatever the brief slot shows (headline), the widget copy mirrors it — so
		// the widget can never drift from the app's own Nyheter board.
		XCTAssertEqual(briefWriter.last?.line, board.headline,
		               "the widget brief snapshot mirrors the board's headline")
		if board.headline != nil {
			XCTAssertEqual(briefWriter.last?.generatedAt, now, "a written brief is stamped with the build now")
		} else {
			XCTAssertNil(briefWriter.last?.generatedAt, "no brief ⇒ an empty snapshot clears any stale line")
		}
	}
}
