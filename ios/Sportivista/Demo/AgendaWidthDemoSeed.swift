//
//  AgendaWidthDemoSeed.swift
//  Sportivista
//
//  WP-135 — DEBUG-only screenshot harness for the agenda ROW-WIDTH bug class
//  (owner screenshot 20.07, STANDARD text size): a wide matchup title
//  ("100 Thieves – Ninjas in Pyjamas") pushed the fixed-size time column off the
//  LEFT cell edge, clipping the clock ("15:00" → ":00"), instead of the title
//  wrapping to two lines. A neighbouring row with a SHORT title ("100 Thieves –
//  Falcons") showed its time in full — proving the row layout, not the data, was
//  at fault (participants are empty on these events; the title comes straight
//  through AgendaFormat).
//
//  This seeds a fixed board that exercises the three invariants of DESIGN.md
//  § Radens anatomi at once, so the whole class has deterministic, offline
//  coverage in the screenshot catalogue:
//    1. a WIDE-title clock row (the reported clip) — time must stay whole, title
//       must wrap to ≤2 lines;
//    2. a SHORT-title clock row (the control) — must render pixel-identically;
//    3. a multi-day golf WINDOW row (a "d.–d. MMM" date span in the time column)
//       — must still reserve and show its full width (the WP-99 reason the clock
//       column was fixed-size, and why WINDOWS keep `.fixedSize`).
//
//  Never compiled into a release build (`#if DEBUG`), and lives in
//  Sportivista/Demo/ (WP-48) so only the app targets pick it up.
//

#if DEBUG
import Foundation

enum AgendaWidthDemoSeed {

	/// Seed the cache + a broad esports/golf/football profile, then the caller
	/// reloads the agenda.
	static func seed(profileStore: ProfileStore, now: Date = Date()) {
		let cache = CacheStore()
		let iso = ISO8601DateFormatter()
		iso.formatOptions = [.withInternetDateTime]
		func at(_ offsetHours: Double) -> String { iso.string(from: now.addingTimeInterval(offsetHours * 3600)) }
		func at(days: Double) -> String { iso.string(from: now.addingTimeInterval(days * 86400)) }

		let events: [[String: Any]] = [
			// The reported clip: a wide matchup title at a CLOCK time. Participants
			// are deliberately EMPTY (matching the real data) so the title flows
			// through AgendaFormat unchanged — the row layout is the whole subject.
			// After WP-135 the time stays whole and the title wraps to two lines.
			[
				"sport": "esports", "title": "100 Thieves – Ninjas in Pyjamas",
				"tournament": "StarSeries Fall EU-kvalik",
				"time": at(2), "norwegian": false,
				"streaming": [["platform": "Twitch"]],
			],
			// The control: a short title at a clock time — its time always showed
			// in full, so this row must stay pixel-identical across the fix.
			[
				"sport": "esports", "title": "100 Thieves – Falcons",
				"tournament": "BLAST Bounty S2",
				"time": at(4), "norwegian": false,
				"streaming": [["platform": "Twitch"]],
			],
			// An even wider title, to prove the wrap holds well past the reported
			// width (belt-and-suspenders — the clip must never return at any width).
			[
				"sport": "football", "title": "Vålerenga Fotball – Rosenborg Ballklub",
				"tournament": "Eliteserien",
				"time": at(6), "homeTeam": "Vålerenga Fotball", "awayTeam": "Rosenborg Ballklub",
				"streaming": [["platform": "TV 2 Play"]],
			],
			// The WP-99 multi-day WINDOW row — must keep reserving its full width
			// and never wrap/clip; the time column's fixed reservation exists FOR
			// this shape, and the fix must not regress it.
			[
				"sport": "golf", "title": "The Open Championship", "tournament": "PGA Tour",
				"time": at(-6), "endTime": at(days: 3), "norwegian": true,
				"venue": "Royal Portrush",
				"streaming": [["platform": "TV 2 Play", "url": "https://play.tv2.no"]],
			],
		]

		let interests: [String: Any] = [
			"followBroadly": ["esports", "football", "golf"],
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
