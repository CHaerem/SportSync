//
//  MastheadLiveDemoSeed.swift
//  Sportivista
//
//  WP-152 (PROTOTYPE) — DEBUG-only feel/screenshot harness for the masthead
//  colon LIVE signal. The header's amber «:» becomes the app's live signature:
//  it pulses calmly when something the user follows is live NOW, else it is the
//  static amber accent it is today (ContentView.header / MastheadColon).
//
//  The pulse is driven by the SAME existing live signal as the ▌ LIVE line
//  (`AgendaViewModel.currentLiveRows` / `liveNow`), so this seed only has to make
//  that non-empty deterministically. It writes ONE authoritatively-live event
//  (`status: "in"`, which `AgendaViewModel.liveState` treats as `.direkte`
//  regardless of the wall-clock hour — so the pulse reproduces at any time of
//  day, unlike a multi-day-window event that only reads live inside 08–22 Oslo)
//  plus a plain upcoming row for context, and a broad football follow.
//
//  Reuses the existing SPORTIVISTA_DEMO cache-seed mechanism (CacheStore + a
//  SyncState stamp), exactly like the other Demo seeds — no new harness. Never
//  compiled into a release build (`#if DEBUG`); lives in Sportivista/Demo/ (WP-48)
//  so only the app targets pick it up (not the widget/test bundles).
//

#if DEBUG
import Foundation

enum MastheadLiveDemoSeed {

	/// Seed the cache + a broad football profile, then the caller reloads the
	/// agenda. With `live: true` (the default) the board carries ONE
	/// authoritatively-live event so `liveNow` is non-empty and the colon pulses;
	/// with `live: false` the SAME board minus that row is the neutral control
	/// (nothing live ⇒ static colon) — so the two screenshots differ ONLY in the
	/// live signal, not the surrounding layout.
	static func seed(profileStore: ProfileStore, now: Date = Date(), live: Bool = true) {
		let cache = CacheStore()
		let iso = ISO8601DateFormatter()
		iso.formatOptions = [.withInternetDateTime]
		func at(_ offsetHours: Double) -> String { iso.string(from: now.addingTimeInterval(offsetHours * 3600)) }

		var events: [[String: Any]] = [
			// A plain upcoming row for context — NOT live (starts in six hours), so
			// the board reads normally beneath the masthead in BOTH states.
			[
				"sport": "football", "title": "Brann – Molde", "tournament": "Eliteserien",
				"time": at(6), "homeTeam": "Brann", "awayTeam": "Molde",
				"streaming": [["platform": "TV 2 Play"]],
			],
		]
		if live {
			// The LIVE row. An authoritative in-progress `status` makes it live no
			// matter the hour (liveState step 1), so the colon pulse is fully
			// deterministic for the screenshots. Started an hour ago, ends in an
			// hour, so it is also inside its [time, endTime] window as a backstop.
			events.insert([
				"sport": "football", "title": "Lyn – Sogndal", "tournament": "OBOS-ligaen",
				"time": at(-1), "endTime": at(1), "status": "in",
				"homeTeam": "Lyn", "awayTeam": "Sogndal",
				"streaming": [["platform": "TV 2 Play"]],
			], at: 0)
		}

		let interests: [String: Any] = [
			"followBroadly": ["football"],
			"alwaysTrack": ["athletes": [], "teams": [], "tournaments": []],
		]

		write(events, "events.json", cache)
		write(interests, "interests.json", cache)
		try? cache.writeSyncState(SyncState(etag: nil, appliedFiles: [:], lastSync: now))
	}

	private static func write(_ object: Any, _ filename: String, _ cache: CacheStore) {
		guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
		try? cache.write(data, filename: filename)
	}
}
#endif
