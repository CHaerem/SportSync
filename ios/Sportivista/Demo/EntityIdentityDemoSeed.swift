//
//  EntityIdentityDemoSeed.swift
//  Sportivista
//
//  WP-185 — DEBUG-only screenshot harness for the entity-avatar ladder
//  (DESIGN.md § Entitets-avatar). Live sync isn't deterministic and the published
//  entities.json changes hourly, so this seeds ONE fixed board that shows all
//  three rungs side by side, offline, in whichever appearance the screenshot is
//  taken:
//
//    1. MONOGRAM — a club with two registered colours ("Rosenborg – Brann":
//       a WHITE-kitted club, so the computed ink must come out BLACK — the exact
//       case a hardcoded white ink would render invisible).
//    2. MONOGRAM — a second club with a strongly contrasting kit (Arsenal), so
//       the diagonal split and the light-ink branch are both on screen.
//    3. FLAG — an athlete row (Magnus Carlsen, "NO") and a NATIONAL team row
//       (Norge), proving a landslag flies the flag even though it also carries
//       kit colours.
//    4. SPORT GLYPH — a row whose entity we know nothing about, proving the
//       honest degradation (no empty hole, no invented colour).
//
//  Never compiled into a release build (`#if DEBUG`), and lives in
//  Sportivista/Demo/ (WP-48) so only the app targets pick it up.
//

#if DEBUG
import Foundation

enum EntityIdentityDemoSeed {

	static func seed(profileStore: ProfileStore, now: Date = Date()) {
		let cache = CacheStore()
		let iso = ISO8601DateFormatter()
		iso.formatOptions = [.withInternetDateTime]
		func at(_ offsetHours: Double) -> String { iso.string(from: now.addingTimeInterval(offsetHours * 3600)) }

		let events: [[String: Any]] = [
			[
				"sport": "football", "title": "Rosenborg – Brann", "tournament": "Eliteserien",
				"time": at(2), "homeTeam": "Rosenborg", "awayTeam": "Brann", "norwegian": true,
				"streaming": [["platform": "TV 2 Play"]],
			],
			[
				"sport": "football", "title": "Arsenal – Chelsea", "tournament": "Premier League",
				"time": at(4), "homeTeam": "Arsenal", "awayTeam": "Chelsea",
				"streaming": [["platform": "Viaplay"]],
			],
			[
				"sport": "football", "title": "Norge – Italia", "tournament": "VM-kvalifisering",
				"time": at(6), "homeTeam": "Norge", "awayTeam": "Italia", "norwegian": true,
				"streaming": [["platform": "TV 2 Play"]],
			],
			[
				"sport": "chess", "title": "Norway Chess runde 4", "tournament": "Norway Chess",
				"time": at(7), "norwegian": true,
				"participants": [["name": "Magnus Carlsen"], ["name": "Hikaru Nakamura"]],
				"streaming": [["platform": "chess24"]],
			],
			// The honest fallback: nothing in the index knows this club.
			[
				"sport": "handball", "title": "Ukjent IL – Fremmed HK", "tournament": "REMA 1000-ligaen",
				"time": at(8), "homeTeam": "Ukjent IL", "awayTeam": "Fremmed HK", "norwegian": true,
				"streaming": [["platform": "TV 2 Play"]],
			],
		]

		// A miniature entities.json carrying exactly the WP-185 identity metadata
		// the pipeline now publishes (registry → build-entities → entities.json).
		let entities: [[String: Any]] = [
			["id": "rosenborg", "name": "Rosenborg", "aliases": ["Rosenborg BK"], "sport": "football", "type": "team",
			 "colors": ["primary": "#ffffff", "secondary": "#000000"]],
			["id": "brann", "name": "Brann", "aliases": ["SK Brann"], "sport": "football", "type": "team",
			 "colors": ["primary": "#e30613", "secondary": "#00963f"]],
			["id": "arsenal", "name": "Arsenal", "aliases": ["Arsenal FC"], "sport": "football", "type": "team",
			 "colors": ["primary": "#e20520", "secondary": "#003399"]],
			["id": "norge", "name": "Norge", "aliases": ["Norway"], "sport": "football", "type": "team",
			 "country": "NO", "national": true, "colors": ["primary": "#c8102e"]],
			["id": "magnus-carlsen", "name": "Magnus Carlsen", "aliases": ["Carlsen"], "sport": "chess", "type": "athlete",
			 "country": "NO"],
		]

		let interests: [String: Any] = [
			"followBroadly": ["football", "chess", "handball"],
			"alwaysTrack": ["athletes": [], "teams": [], "tournaments": []],
		]

		write(events, "events.json", cache)
		write(entities, "entities.json", cache)
		write(interests, "interests.json", cache)
		try? cache.writeSyncState(SyncState(etag: nil, appliedFiles: [:], lastSync: now))
		try? profileStore.save(InterestProfile(rules: []))
	}

	private static func write(_ object: Any, _ filename: String, _ cache: CacheStore) {
		guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
		try? cache.write(data, filename: filename)
	}
}
#endif
