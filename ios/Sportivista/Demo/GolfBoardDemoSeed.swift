//
//  GolfBoardDemoSeed.swift
//  Sportivista
//
//  WP-99 — DEBUG-only screenshot harness for the post-onboarding agenda
//  (`onboarding-landed` / `onboarding-landing`). Those modes used to lean on the
//  LIVE board (a network round-trip), so offline the agenda captured "Henter
//  data …" and the multi-day golf-row layout artifact the WP-98 catalog flagged
//  could not be reproduced deterministically. This seeds a fixed golf board —
//  two multi-day tournaments (a major + a secondary event, both spanning today)
//  plus one football row for contrast — into the SAME cache DataStore reads,
//  with a plain broad `golf` follow (NOT the `.throughNorwegians` lens, so the
//  tournaments render as single multi-day WINDOW rows — "13.–20. jul." in the
//  time column — exactly the shape that exercised the row layout).
//
//  Never compiled into a release build (`#if DEBUG`), and lives in
//  Sportivista/Demo/ (WP-48) so only the app targets pick it up.
//

#if DEBUG
import Foundation

enum GolfBoardDemoSeed {

	/// Seed the cache + a broad golf profile, then the caller reloads the agenda.
	static func seed(profileStore: ProfileStore, now: Date = Date()) {
		let cache = CacheStore()
		let iso = ISO8601DateFormatter()
		iso.formatOptions = [.withInternetDateTime]
		func at(_ offsetHours: Double) -> String { iso.string(from: now.addingTimeInterval(offsetHours * 3600)) }
		func at(days: Double) -> String { iso.string(from: now.addingTimeInterval(days * 86400)) }

		let events: [[String: Any]] = [
			[
				"sport": "golf", "title": "The Open Championship", "tournament": "PGA Tour",
				"time": at(-6), "endTime": at(days: 2), "norwegian": true,
				"venue": "Royal Portrush",
				"streaming": [["platform": "TV 2 Play", "url": "https://play.tv2.no"]],
			],
			[
				"sport": "golf", "title": "Corales Puntacana Championship", "tournament": "PGA Tour",
				"time": at(-3), "endTime": at(days: 1),
				"venue": "Puntacana Resort & Club",
				"streaming": [["platform": "Discovery+"]],
			],
			[
				"sport": "football", "title": "Lyn – Sogndal", "tournament": "OBOS-ligaen",
				"time": at(6), "homeTeam": "Lyn", "awayTeam": "Sogndal",
				"streaming": [["platform": "TV 2 Play"]],
			],
		]

		let interests: [String: Any] = [
			"followBroadly": ["golf", "football"],
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
