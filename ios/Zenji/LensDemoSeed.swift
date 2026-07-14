//
//  LensDemoSeed.swift
//  Zenji
//
//  WP-18 — DEBUG-only screenshot harness for the lens layer (P320). Apple
//  Intelligence and live sync aren't deterministic in the Simulator, so this
//  seeds a fixed golf agenda (a tournament with two Norwegian tee times, beside
//  an ordinary football row for contrast) into the SAME cache DataStore reads
//  from, plus a `.throughNorwegians` golf rule into the SAME profile the agenda
//  merges — so `ZENJI_DEMO=lens` captures athlete-centred golf rows without any
//  network. Never compiled into a release build (`#if DEBUG`), and lives at the
//  app-target root so neither the widget nor the test bundle pick it up.
//
//  All timestamps are anchored to `now` so the tee times land under I DAG with
//  clean Europe/Oslo clock labels whenever the screenshot is taken.
//

#if DEBUG
import Foundation

enum LensDemoSeed {

	/// Seed the cache + profile, then the caller reloads the agenda. `now`
	/// defaults to the real clock so the demo is always "today".
	static func seed(profileStore: ProfileStore, now: Date = Date()) {
		let cache = CacheStore()
		let iso = ISO8601DateFormatter()
		iso.formatOptions = [.withInternetDateTime]
		func at(_ offsetHours: Double) -> String { iso.string(from: now.addingTimeInterval(offsetHours * 3600)) }
		func at(days: Double) -> String { iso.string(from: now.addingTimeInterval(days * 86400)) }

		let events: [[String: Any]] = [
			[
				"sport": "golf", "title": "The Open", "tournament": "PGA Tour",
				"time": at(-2), "endTime": at(days: 3), "norwegian": true,
				"venue": "Royal Portrush",
				"streaming": [["platform": "TV 2 Play", "url": "https://play.tv2.no"]],
				"norwegianPlayers": [
					["name": "Kristoffer Reitan", "teeTimeUTC": at(1.5), "status": "R2 · −4 · T8", "entityId": "kristoffer-reitan"],
					["name": "Viktor Hovland", "teeTimeUTC": at(2.5), "status": "R2 · −1 · T21", "entityId": "viktor-hovland"],
				],
			],
			[
				"sport": "football", "title": "Lyn – Sogndal", "tournament": "OBOS-ligaen",
				"time": at(6), "homeTeam": "Lyn", "awayTeam": "Sogndal",
				"streaming": [["platform": "TV 2 Play"]],
			],
		]

		let entities: [[String: Any]] = [
			["id": "the-open", "name": "The Open", "aliases": ["The Open Championship"], "sport": "golf", "type": "tournament"],
			["id": "viktor-hovland", "name": "Viktor Hovland", "aliases": ["Hovland"], "sport": "golf", "type": "athlete"],
			["id": "kristoffer-reitan", "name": "Kristoffer Reitan", "aliases": ["Reitan"], "sport": "golf", "type": "athlete"],
		]

		let interests: [String: Any] = [
			"followBroadly": ["golf", "football"],
			"alwaysTrack": ["athletes": [], "teams": [], "tournaments": []],
		]

		write(events, "events.json", cache)
		write(entities, "entities.json", cache)
		write(interests, "interests.json", cache)
		try? cache.writeSyncState(SyncState(etag: nil, appliedFiles: [:], lastSync: now))

		let rule = InterestRule(
			entityId: "the-open", entityName: "The Open", sport: "golf", weight: 0.6,
			reason: "Følger The Open med fokus på de norske utøverne.",
			addedAt: now, lens: .throughNorwegians
		)
		try? profileStore.save(InterestProfile(rules: [rule]))
	}

	private static func write(_ object: Any, _ filename: String, _ cache: CacheStore) {
		guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
		try? cache.write(data, filename: filename)
	}
}
#endif
