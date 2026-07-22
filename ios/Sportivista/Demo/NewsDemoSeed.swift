//
//  NewsDemoSeed.swift
//  Sportivista
//
//  WP-106 — DEBUG-only screenshot harness for the Nyheter board (SPORTIVISTA_DEMO=
//  news). Live sync + Apple Intelligence aren't deterministic in the Simulator,
//  so this seeds a FIXED cache — news.json / featured.json / recent-results.json
//  / events.json / entities.json — plus a matching follow-profile (a team + a
//  whole-sport follow) into the SAME CacheStore/ProfileStore the board reads
//  from, so every one of the four sections renders with real content and no
//  network. Never compiled into a release build (`#if DEBUG`) and quarantined
//  in Sportivista/Demo/ (only the app targets' `path: Sportivista` picks it up;
//  the widget + test targets list their sources explicitly and exclude it).
//
//  All timestamps are anchored to `now`: the result sits yesterday, the news
//  pointers a few hours back, and the FREMOVER events well past the 7-day near
//  horizon (a season opener + a league fixture) so they land in that section.
//

#if DEBUG
import Foundation

enum NewsDemoSeed {

	static func seed(profileStore: ProfileStore, now: Date = Date()) {
		let cache = CacheStore()
		let iso = ISO8601DateFormatter()
		iso.formatOptions = [.withInternetDateTime]
		func at(hours: Double) -> String { iso.string(from: now.addingTimeInterval(hours * 3600)) }
		func at(days: Double) -> String { iso.string(from: now.addingTimeInterval(days * 86400)) }

		// SECTION 2 — NYTT: two matched (a Lyn headline by entityId, a langrenn
		// headline by followed whole-sport) + one unfollowed (F1) that the lens
		// filters out.
		let news: [String: Any] = [
			"items": [
				[
					"id": "n1", "title": "Lyn sikret opprykk med seiersmål på overtid",
					"link": "https://www.nrk.no/sport/lyn-opprykk", "source": "nrk-sport",
					"sport": "football", "entityIds": ["fk-lyn-oslo"], "publishedAt": at(hours: -3),
				],
				[
					"id": "n2", "title": "Klæbo klar for sesongåpningen i Ruka",
					"link": "https://www.nrk.no/sport/langrenn-ruka", "source": "nrk-sport",
					"sport": "cross-country", "entityIds": [], "publishedAt": at(hours: -8),
				],
				[
					"id": "n3", "title": "Verstappen om VM-kampen mot Norris",
					"link": "https://www.bbc.co.uk/sport/formula1", "source": "bbc-f1",
					"sport": "formula1", "entityIds": [], "publishedAt": at(hours: -5),
				],
			],
		]

		// SECTION 1 — I DIN VERDEN I DAG.
		let featured: [String: Any] = [
			"generatedAt": at(hours: -1), "mode": "morning",
			"blocks": [["type": "headline", "text": "Opprykksfest for Lyn — og langrennssesongen banker på"]],
		]

		// SECTION 3 — RESULTAT: followed results across EVERY sport the file
		// carries (WP-171) — football with goal scorers, a finished golf major, an
		// F1 race, a tennis match — so the screenshot shows the per-sport row DNA
		// and the interleave. No spoiler policy seeded, so they show plainly; the
		// masked path is unit-tested.
		let recentResults: [String: Any] = [
			"football": [
				[
					"homeTeam": "Lyn", "awayTeam": "Sogndal", "homeScore": 2, "awayScore": 1,
					"date": at(days: -1), "league": "OBOS-ligaen", "venue": "Bislett stadion, Oslo",
					"goalScorers": [
						["player": "Kristian Eriksen", "team": "Lyn", "minute": "8'"],
						["player": "Ola Nordmann", "team": "Sogndal", "minute": "51'"],
						["player": "Simen Juklerød", "team": "Lyn", "minute": "88'"],
					],
					"isFavorite": true,
				],
			],
			"golf": [
				"pga": [
					"tournamentName": "The Open", "status": "final", "completedRound": 4,
					"topPlayers": [
						["position": 1, "player": "Ryan Fox", "score": "-10"],
						["position": 2, "player": "Cameron Young", "score": "-9"],
						["position": 3, "player": "Sam Burns", "score": "-8"],
					],
					"norwegianPlayers": [["position": 121, "player": "Viktor Hovland", "score": "+4"]],
				],
			],
			"f1": [
				[
					"raceName": "Belgias Grand Prix", "type": "Race", "date": at(days: -2),
					"circuit": "Spa-Francorchamps",
					"topDrivers": [
						["position": 1, "driver": "Kimi Antonelli"],
						["position": 2, "driver": "Charles Leclerc"],
						["position": 3, "driver": "Max Verstappen"],
					],
				],
			],
			"tennis": [
				[
					"winner": "Casper Ruud", "loser": "Alexander Zverev", "score": "6-4, 7-5",
					"date": at(days: -3), "tournament": "ATP Hamburg", "round": "Semifinale",
				],
			],
		]

		// WP-171 — the event-detail TABELL surface reads standings.json; seed the
		// league table the Premier League fixture below opens on.
		let standings: [String: Any] = [
			"football": [
				"premierLeague": [
					["position": 1, "team": "Liverpool", "teamShort": "LIV", "played": 12, "points": 29, "gd": 18],
					["position": 2, "team": "Arsenal", "teamShort": "ARS", "played": 12, "points": 27, "gd": 14],
					["position": 3, "team": "Manchester City", "teamShort": "MCI", "played": 12, "points": 25, "gd": 12],
					["position": 4, "team": "Chelsea", "teamShort": "CHE", "played": 12, "points": 24, "gd": 9],
					["position": 5, "team": "Newcastle United", "teamShort": "NEW", "played": 12, "points": 22, "gd": 7],
					["position": 14, "team": "Everton", "teamShort": "EVE", "played": 12, "points": 13, "gd": -4],
				],
				"laLiga": [],
			],
			"f1": ["drivers": [
				["position": 1, "driver": "Kimi Antonelli", "team": "Mercedes", "points": 204],
				["position": 2, "driver": "Lewis Hamilton", "team": "Ferrari", "points": 159],
				["position": 3, "driver": "George Russell", "team": "Mercedes", "points": 154],
			]],
			"golf": [:],
		]

		// SECTION 4 — FREMOVER: two followed events beyond the 7-day horizon.
		let events: [[String: Any]] = [
			[
				"sport": "cross-country", "title": "Verdenscup langrenn: sesongåpning",
				"tournament": "FIS verdenscup", "time": at(days: 21),
				"venue": "Ruka, Finland", "source": "ai-research", "confidence": "high",
				"evidence": ["https://fis-ski.com", "https://nrk.no/sport"],
				"streaming": [["platform": "NRK"]],
			],
			[
				"sport": "football", "title": "Lyn – Bryne", "tournament": "OBOS-ligaen",
				"time": at(days: 12), "homeTeam": "Lyn", "awayTeam": "Bryne",
				"homeTeamEntityId": "fk-lyn-oslo",
				"streaming": [["platform": "TV 2 Play", "url": "https://play.tv2.no"]],
			],
			// WP-171: a near-term Premier League fixture, so the agenda has a row
			// whose detail sheet shows the TABELL section against the seeded table.
			[
				"sport": "football", "title": "Everton – Liverpool", "tournament": "Premier League",
				"time": at(days: 2), "homeTeam": "Everton", "awayTeam": "Liverpool",
				"venue": "Goodison Park",
				"streaming": [["platform": "Viaplay", "url": "https://viaplay.no"]],
			],
		]

		let entities: [[String: Any]] = [
			["id": "fk-lyn-oslo", "name": "FK Lyn Oslo", "aliases": ["Lyn"], "sport": "football", "type": "team"],
			["id": "sport-cross-country", "name": "Langrenn", "aliases": ["langrenn"], "sport": "cross-country", "type": "sport"],
			["id": "viktor-hovland", "name": "Viktor Hovland", "aliases": ["Hovland"], "sport": "golf", "type": "athlete"],
			["id": "sport-f1", "name": "Formel 1", "aliases": ["F1"], "sport": "f1", "type": "sport"],
			["id": "casper-ruud", "name": "Casper Ruud", "aliases": ["Ruud"], "sport": "tennis", "type": "athlete"],
			["id": "liverpool-fc", "name": "Liverpool", "aliases": ["Liverpool FC"], "sport": "football", "type": "team"],
		]

		write(news, "news.json", cache)
		write(featured, "featured.json", cache)
		write(recentResults, "recent-results.json", cache)
		write(standings, "standings.json", cache)
		write(events, "events.json", cache)
		write(entities, "entities.json", cache)
		try? cache.writeSyncState(SyncState(etag: nil, appliedFiles: [:], lastSync: now))

		let rules = [
			InterestRule(entityId: "fk-lyn-oslo", entityName: "FK Lyn Oslo", sport: "football",
			             weight: 0.7, reason: "Følger FK Lyn Oslo.", addedAt: now),
			InterestRule(entityId: "sport-cross-country", entityName: "Langrenn", sport: "cross-country",
			             weight: 0.6, reason: "Følger langrenn.", addedAt: now),
			// WP-171: the three follows that make the golf/F1/tennis results
			// relevant — an athlete, a whole sport, an athlete.
			InterestRule(entityId: "viktor-hovland", entityName: "Viktor Hovland", sport: "golf",
			             weight: 0.7, reason: "Følger Viktor Hovland.", addedAt: now),
			InterestRule(entityId: "sport-f1", entityName: "Formel 1", sport: "f1",
			             weight: 0.6, reason: "Følger Formel 1.", addedAt: now),
			InterestRule(entityId: "casper-ruud", entityName: "Casper Ruud", sport: "tennis",
			             weight: 0.6, reason: "Følger Casper Ruud.", addedAt: now),
			InterestRule(entityId: "liverpool-fc", entityName: "Liverpool", sport: "football",
			             weight: 0.6, reason: "Følger Liverpool.", addedAt: now),
		]
		try? profileStore.save(InterestProfile(rules: rules), now: now)
	}

	private static func write(_ object: Any, _ filename: String, _ cache: CacheStore) {
		guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
		try? cache.write(data, filename: filename)
	}
}
#endif
