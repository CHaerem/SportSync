//
//  NewsModel.swift
//  Sportivista
//
//  WP-107 — the Nyheter board's LIVING model, owned once by ContentView so it
//  SURVIVES root-segment switches («Uka ⇄ Nyheter»). Before WP-107 the board
//  was `@State` inside NewsView, so every switch tore the view (and its state)
//  down and `.task` rebuilt the whole board — five disk reads + JSON decodes +
//  an EntityIndex build + NewsBoard.build — SYNCHRONOUSLY on the main actor,
//  every single time. That was the "merkbar lag hver gang man bytter til
//  Nyheter" the owner saw on build 6.
//
//  This model fixes both halves of that:
//    1. It lives at ContentView scope, so `board` persists across switches —
//       NewsView renders the previous board immediately (never a blank/hitch).
//    2. The heavy build runs OFF the main actor (`computeBoard` is
//       `nonisolated async`, guarded by the shared `MainThreadGuard`), and only
//       when the board is actually STALE — a profile change or a completed sync
//       marks it stale; a plain tab switch does NOT rebuild.
//
//  Same coalescing shape as AgendaViewModel (WP-60): one compute at a time, a
//  request that lands mid-compute schedules exactly one trailing rebuild against
//  the latest state ("siste vinner"). The board it produces is byte-for-byte the
//  same `NewsBoard.build` output — no matching/lens change, so the NewsBoard /
//  NewsLens golden tests stay valid.
//

import Foundation
import Observation

@MainActor
@Observable
final class NewsModel {
	/// The four-section board the view renders. Persists across segment switches
	/// (this model outlives NewsView), so a switch back to Nyheter shows the last
	/// board instantly instead of `.empty` while a rebuild runs.
	private(set) var board: NewsBoard = .empty

	private let dataStore: DataStore
	private let profileStore: ProfileStore

	/// True until the first build, then flipped back to true only by `markStale`
	/// (a profile change / a completed sync). `rebuildIfStale` — the tab-switch
	/// entry point — is a no-op while this is false, which is what removes the
	/// per-switch work.
	private var needsRebuild = true
	/// The single in-flight build; coalesces a burst into one trailing rebuild.
	private var buildTask: Task<Void, Never>?
	/// The `now` of the most recent request that arrived mid-build ("siste vinner").
	private var pendingNow: Date?

	#if DEBUG
	/// How many times the compute pipeline actually ran — the proof that a plain
	/// tab switch does NOT rebuild (NewsModelTests reads this).
	private(set) var buildCount = 0
	#endif

	init(dataStore: DataStore = DataStore(), profileStore: ProfileStore = ProfileStore()) {
		self.dataStore = dataStore
		self.profileStore = profileStore
	}

	// MARK: - Triggers

	/// Mark the board out of date. Called when the follow-profile changes or a
	/// sync brought fresh news/results/events — the two things that can change the
	/// board's content. The next `rebuildIfStale` (or an explicit `rebuild`) picks
	/// it up.
	func markStale() { needsRebuild = true }

	/// The tab-switch entry point (`NewsView.task`). Rebuilds ONLY when the board
	/// is stale — the first appearance, or after `markStale`. A plain switch onto
	/// an already-current board is a no-op, so switching tabs never re-runs the
	/// disk-read/decode/compile that caused the lag.
	func rebuildIfStale(now: Date = Date()) {
		guard needsRebuild else { return }
		rebuild(now: now)
	}

	/// Force a rebuild now, off the main actor. Used when the profile changed or a
	/// sync completed (ContentView drives these), so the board is ready before the
	/// user ever switches to Nyheter. Clears the stale flag and coalesces.
	func rebuild(now: Date = Date()) {
		needsRebuild = false
		guard buildTask == nil else {
			pendingNow = now
			return
		}
		startBuild(now: now)
	}

	/// Await any in-flight (coalesced) build — tests use this to wait until the
	/// board has actually been recomputed and applied.
	func awaitQuiescent() async {
		while let task = buildTask { await task.value }
	}

	// MARK: - Coalescing loop (mirrors AgendaViewModel.startReload)

	private func startBuild(now: Date) {
		buildTask = Task { @MainActor in
			var current = now
			while true {
				#if DEBUG
				self.buildCount &+= 1
				#endif
				let result = await Self.computeBoard(dataStore: self.dataStore, profileStore: self.profileStore, now: current)
				if let next = self.pendingNow {
					self.pendingNow = nil
					current = next
					continue
				}
				self.board = result
				break
			}
			self.buildTask = nil
		}
	}

	// MARK: - Off-main build

	/// The off-main entry: `nonisolated async` so awaiting it from the main actor
	/// runs the body on the cooperative pool and transfers the fresh board back.
	nonisolated static func computeBoard(dataStore: DataStore, profileStore: ProfileStore, now: Date) async -> sending NewsBoard {
		computeBoardSync(dataStore: dataStore, profileStore: profileStore, now: now)
	}

	/// The five cache reads + decodes + EntityIndex build + NewsBoard.build — the
	/// exact work NewsView.rebuild used to do on the main actor. WP-107 keeps it
	/// OFF the main actor; the shared `MainThreadGuard` (WP-60) trips in DEBUG if a
	/// regression ever runs it on main. Reads the profile + spoiler shield from the
	/// SAME on-disk sync-state NewsView.rebuild read, so the board is identical.
	nonisolated static func computeBoardSync(dataStore: DataStore, profileStore: ProfileStore, now: Date) -> sending NewsBoard {
		MainThreadGuard.assertOffMain("NewsModel build (cache read + JSON decode + NewsBoard.build)")
		let syncState = profileStore.loadSyncState()
		return NewsBoard.build(
			news: dataStore.loadNews(),
			featured: dataStore.loadFeatured(),
			results: dataStore.loadRecentResults(),
			events: dataStore.loadEvents(),
			entities: dataStore.loadEntities(),
			profile: syncState.profile,
			shield: SpoilerShield(memory: MemoryState(from: syncState)),
			now: now
		)
	}
}
