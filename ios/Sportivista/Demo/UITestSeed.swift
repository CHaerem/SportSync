//
//  UITestSeed.swift
//  Sportivista
//
//  WP-70 — the deterministic launch harness the XCUITest suite (SportivistaUITests)
//  drives the app against. It is the UI-test twin of LensDemoSeed/MemoryDemoSeed
//  (WP-18/WP-30): Apple Intelligence and live sync are non-deterministic in the
//  Simulator, so a UI test can't rely on the real network or the on-device
//  model. This seeds a FIXED cache (events + entities + interests + a synced
//  clock) into the SAME CacheStore the app reads from, resets the two
//  `@AppStorage` flags the flows depend on (onboarding-done, theme override),
//  and — for the "agenda" state — seeds a small follow-profile so the board is
//  already populated. ContentView backs the assistant with MockInterestAssistant
//  under any `SPORTIVISTA_DEMO` value (so no "Apple Intelligence off" banner), and
//  skips the network sync for `uitest` exactly as it does for `lens`.
//
//  Two launch states, chosen by the `SPORTIVISTA_UITEST_STATE` environment variable
//  (set by the test's launchEnvironment):
//    • "onboarding" — clears the profile + the onboarding-done flag, so the
//      first-run overlay shows naturally (the normal OnboardingGate decision,
//      NOT the screenshot-demo shortcut). Exercises the quick-picks + converse
//      flows against real starter packs and the mock conversation.
//    • "agenda" (default) — marks onboarding done and seeds a follow-profile
//      (FK Lyn Oslo), so the agenda is populated and the follow / detail /
//      theme / reset flows all start from a real board.
//
//  Never compiled into a release build (`#if DEBUG`), and lives in Sportivista/Demo/
//  (WP-48) — only the app targets' `path: Sportivista` picks that folder up; the
//  widget and test targets list their sources explicitly and exclude it, so the
//  harness quarantine is structural, not placement-folklore.
//
//  The seed is idempotent and re-runs on every launch (each XCUITest
//  `app.launch()` gets a fresh, known state regardless of what a prior test
//  left behind), so the suite has no cross-test ordering coupling.
//

#if DEBUG
import Foundation

enum UITestSeed {

	/// The `SPORTIVISTA_DEMO` value that selects this harness.
	static let demoMode = "uitest"

	/// Launch states, from `SPORTIVISTA_UITEST_STATE`.
	enum State: String {
		case onboarding
		case agenda
	}

	/// A distinctive title so the XCUITest can assert the row's presence by its
	/// staticText without guessing a synthesised id. Kept in one place so the
	/// test and the seed can never drift.
	static let biathlonEventTitle = "Skiskyting verdenscup: sprint"
	static let footballEventTitle = "Lyn mot Sogndal"

	/// Whether this launch requested the UI-test harness.
	static var isRequested: Bool {
		ProcessInfo.processInfo.environment["SPORTIVISTA_DEMO"] == demoMode
	}

	/// The requested launch state (defaults to `.agenda`).
	static var requestedState: State {
		State(rawValue: ProcessInfo.processInfo.environment["SPORTIVISTA_UITEST_STATE"] ?? "") ?? .agenda
	}

	/// Seed the cache + defaults for the requested state. Called at the very top
	/// of `ContentView.init` (before the onboarding decision + the view models
	/// read from disk), so the whole first frame is already deterministic.
	static func seedIfRequested(profileStore: ProfileStore, now: Date = Date()) {
		guard isRequested else { return }
		let state = requestedState

		seedCache(now: now)

		// The theme override starts at `system` every launch, so the theme-toggle
		// flow has a known starting glyph/label to cycle from.
		UserDefaults.standard.removeObject(forKey: ThemeOverride.storageKey)

		switch state {
		case .onboarding:
			// Clean slate → the first-run overlay shows via the normal gate.
			UserDefaults.standard.set(false, forKey: OnboardingGate.storageKey)
			try? profileStore.save(InterestProfile(rules: []), now: now)
		case .agenda:
			// Onboarding already done + a follow so the board is populated and the
			// biathlon event is the only thing the "følg skiskyting" flow adds.
			UserDefaults.standard.set(true, forKey: OnboardingGate.storageKey)
			let rule = InterestRule(
				entityId: "fk-lyn-oslo", entityName: "FK Lyn Oslo", sport: "football",
				weight: InterestProfile.defaultWeight,
				reason: "Du ba om å følge FK Lyn Oslo.", addedAt: now
			)
			try? profileStore.save(InterestProfile(rules: [rule]), now: now)
		}
	}

	// MARK: - Cache

	private static func seedCache(now: Date, cache: CacheStore = CacheStore()) {
		let iso = ISO8601DateFormatter()
		iso.formatOptions = [.withInternetDateTime]
		func at(hours: Double) -> String { iso.string(from: now.addingTimeInterval(hours * 3600)) }

		// A followed football row (visible in the "agenda" state via the FK Lyn
		// Oslo rule) and a biathlon row that is DELIBERATELY not relevant yet —
		// no followBroadly, not Norwegian, not AI-research — so it only appears
		// once the "følg skiskyting" flow adds a biathlon following.
		let events: [[String: Any]] = [
			[
				"sport": "football", "title": footballEventTitle, "tournament": "OBOS-ligaen",
				"time": at(hours: 6),
				"venue": "Bislett stadion, Oslo",
				"summary": "Seriekamp i OBOS-ligaen.",
				"streaming": [["platform": "TV 2 Play", "url": "https://play.tv2.no"]],
			],
			[
				"sport": "biathlon", "title": biathlonEventTitle, "tournament": "Skiskyting verdenscup",
				"time": at(hours: 30),
				"venue": "Holmenkollen, Oslo",
				"streaming": [["platform": "NRK"]],
			],
		]

		let entities: [[String: Any]] = [
			["id": "fk-lyn-oslo", "name": "FK Lyn Oslo", "aliases": ["Lyn"], "sport": "football", "type": "team"],
			// The representative biathlon entity "følg skiskyting" grounds to
			// (alias "skiskyting" so the mock parser resolves it directly), and the
			// tournament the seeded biathlon event belongs to.
			["id": "skiskyting-verdenscup", "name": "Skiskyting verdenscup", "aliases": ["skiskyting"], "sport": "biathlon", "type": "tournament"],
		]

		// followBroadly is EMPTY (honoured as-is, not the server default) so only
		// what the profile follows lands on the board.
		let interests: [String: Any] = [
			"followBroadly": [],
			"alwaysTrack": ["athletes": [], "teams": [], "tournaments": []],
		]

		write(events, "events.json", cache)
		write(entities, "entities.json", cache)
		write(interests, "interests.json", cache)
		try? cache.writeSyncState(SyncState(etag: nil, appliedFiles: [:], lastSync: now))
	}

	private static func write(_ object: Any, _ filename: String, _ cache: CacheStore) {
		guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
		try? cache.write(data, filename: filename)
	}
}
#endif
