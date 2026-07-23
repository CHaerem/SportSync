//
//  NewsBoard.swift
//  Sportivista
//
//  WP-106 — the PURE builder for the four-section Nyheter board (spec
//  § Nyheter-v0 / DESIGN § Nyheter). A function of plain cached values (news,
//  featured, results, events, entities, profile, spoiler shield, now) with no
//  I/O and no clock read, so the whole board is unit-testable directly
//  (NewsLensTests / NewsBoardTests) — the view is a thin renderer over it.
//
//  The board is ENDELIG: exactly four sections, no unread counters, no
//  engagement mechanics.
//    1. headline  — the editorial brief's headline (featured.json), one line.
//    2. news      — lens-matched pointers (NewsLens), newest first, capped.
//    3. results   — recent results for what you follow, EVERY sport in
//                   recent-results.json (WP-171), each carrying whether the
//                   spoiler shield must mask its outcome + detail lines.
//    4. forward   — followed events beyond the near horizon (forvarsler).
//

import Foundation

struct NewsBoard: Equatable {
	var headline: String?
	var news: [NewsItem]
	var results: [NewsResultRow]
	var forward: [NewsForwardRow]

	static let empty = NewsBoard(headline: nil, news: [], results: [], forward: [])

	/// Events within this many days ahead belong to the agenda («Uka»); FREMOVER
	/// previews what's beyond it (draws, season starts). WP-124: raised 7 → 14 so
	/// the handoff aligns EXACTLY with Uka's 14-day display cap
	/// (AgendaViewModel.buildSections' `maxHorizon`) — the two views now partition
	/// the horizon with no systematic [7 d, 14 d] overlap (events in that week used
	/// to show in BOTH Uka and FREMOVER) and no gap (Uka's cap and this floor are
	/// the same boundary). Mirrors the web split (dashboard.js agenda 14 d + the
	/// «Fremover» disclosure ≥ 14 d). Owner decision 20.07.
	static let forwardHorizonDays: Double = 14

	static func build(
		news: [NewsItem],
		featured: FeaturedBrief?,
		results: RecentResults,
		events: [Event],
		entities: [Entity],
		profile: InterestProfile,
		shield: SpoilerShield,
		now: Date,
		maxNews: Int = 20,
		maxForward: Int = 8
	) -> NewsBoard {
		let index = EntityIndex(entities)
		let lens = NewsLens(profile: profile, index: index)

		// SECTION 2 — NYTT: lens-matched pointers, newest first.
		let matchedNews = news
			.filter { lens.matches($0) }
			.sorted { ($0.publishedAt ?? .distantPast) > ($1.publishedAt ?? .distantPast) }
			.prefix(maxNews)

		return NewsBoard(
			// WP-174: the DETERMINISTIC personal brief («I din verden i dag …»,
			// composed on-device from your feed) fills the brief slot when the
			// profile has follows; it falls back — gracefully, never an empty
			// «I din verden» — to the editorial headline when there is nothing
			// personal to say, and the whole branch is skipped for an EMPTY profile
			// so the slot shows the editorial line byte-for-byte as before.
			headline: brief(profile: profile, events: events, results: results, news: news,
			                lens: lens, index: index, shield: shield, now: now)
				?? freshHeadline(featured, now: now),
			news: Array(matchedNews),
			results: resultRows(results, lens: lens, index: index, shield: shield),
			forward: forwardRows(events, lens: lens, index: index, now: now, max: maxForward)
		)
	}

	// MARK: - Section 1 personal brief (WP-174)

	/// The deterministic personal brief for the brief slot, or nil when there is
	/// nothing personal to say. An EMPTY profile returns nil (the slot then shows
	/// the editorial headline byte-for-byte). Twin of the web hero — the
	/// COMPOSITION is `MinBrief.compose`, pinned bit-for-bit by the shared
	/// brief-vectors; only the SELECTION (context building) is platform-side.
	private static func brief(profile: InterestProfile, events: [Event], results: RecentResults,
	                          news: [NewsItem], lens: NewsLens, index: EntityIndex,
	                          shield: SpoilerShield, now: Date) -> String? {
		guard !profile.rules.isEmpty else { return nil }
		let context = MinBrief.build(events: events, results: results, news: news,
		                             lens: lens, index: index, shield: shield, now: now)
		let text = MinBrief.compose(context)
		return text.isEmpty ? nil : text
	}

	// MARK: - Section 1 day-gate (brief freshness, WP-136)

	/// The editorial brief's headline, but ONLY while it is from the CURRENT Oslo
	/// calendar day. The brief's language is day-relative ("i kveld"/"i morgen"),
	/// so a brief that outlives its Oslo day is a factual error (19.07: yesterday's
	/// "VM-finalen i kveld" showed the day after the final). The exact guard the web
	/// hero uses (dashboard.js `featuredIsFresh`): a pure Oslo calendar-day compare
	/// via `FeedCompiler.osloDayKey` — no "N hours" heuristic, so the brief never
	/// survives its own day. A brief with no `generatedAt` is undateable ⇒ hidden
	/// (we won't stand behind a brief we can't date). Re-checked on EVERY board build
	/// with the caller's `now`, so a return to the foreground / a day rollover
	/// (ContentView rebuilds the board with a fresh `now`) drops yesterday's brief
	/// without any new download — a cheap date compare, no work on the main thread.
	private static func freshHeadline(_ featured: FeaturedBrief?, now: Date) -> String? {
		guard let featured, let headline = featured.headline,
		      let generatedAt = featured.generatedAt,
		      FeedCompiler.osloDayKey(generatedAt) == FeedCompiler.osloDayKey(now)
		else { return nil }
		return headline
	}

	// MARK: - RESULTAT (WP-171 — every sport, one row DNA)

	/// How many result rows the section SHOWS. Ro: the RESULTAT section must
	/// never become a result stream — everything beyond the cap is reachable in
	/// the view's «Vis alle» disclosure, never dropped. Mirrors the web's
	/// `SS_RESULT_CAP` (news-web.js).
	static let resultCap = 5

	/// Detail lines per row. Ro again: a 10-goal World Cup match would otherwise
	/// render eleven scorer lines and turn ONE row into a wall. Five is the
	/// honest floor — a golf row's top-3 PLUS both Norwegians must survive it.
	/// Mirrors the web's `SS_RESULT_DETAIL_CAP`.
	static let detailCap = 5

	/// Cap the detail lines, saying honestly how many were left out.
	static func capDetails(_ lines: [String]) -> [String] {
		let list = lines.filter { !$0.isEmpty }
		guard list.count > detailCap else { return list }
		return Array(list.prefix(detailCap)) + ["+\(list.count - detailCap) til"]
	}

	/// Recent results ABOUT what the user follows — for EVERY sport in
	/// recent-results.json, not just football (WP-171: The Open's final
	/// leaderboard and the F1 podium were already in the file and never shown).
	///
	/// The sports have different result DNA (golf = leaderboard position/score,
	/// F1 = finishing order, tennis = sets), so rather than three special cases
	/// each is projected onto ONE row shape (`NewsResultRow`): a neutral title,
	/// the outcome (the spoiler-carrying payload), a quiet meta line, and the
	/// detail lines the data already carries. The same discipline
	/// `LensRenderer`/`AgendaFormat` apply to the agenda row.
	///
	/// Ordering is a per-sport round robin (`interleaveBySport`) so a busy
	/// football weekend can't push the golf/F1 answer out of the capped section.
	/// WP-176: no longer `private` — `ResultDigest` (the fulltidsvarsel + the
	/// widget's «siste resultat»-linje) projects the SAME rows through the SAME
	/// lens and the SAME spoiler shield, rather than growing a second, drifting
	/// notion of "a result about something you follow".
	static func resultRows(_ results: RecentResults, lens: NewsLens, index: EntityIndex, shield: SpoilerShield) -> [NewsResultRow] {
		var rows: [NewsResultRow] = []

		for r in results.football {
			guard !r.homeTeam.isEmpty, !r.awayTeam.isEmpty else { continue }
			guard let ids = followedIds(names: [r.homeTeam, r.awayTeam], sport: "football", lens: lens, index: index) else { continue }
			rows.append(NewsResultRow(
				id: "result|football|\(r.homeTeam)|\(r.awayTeam)|\(stampKey(r.date))",
				sport: "football",
				title: AgendaFormat.title(homeTeam: r.homeTeam, awayTeam: r.awayTeam, fallback: r.recapHeadline ?? ""),
				score: r.scoreLine,
				meta: r.league,
				details: capDetails(r.goalScorers.map(\.line)),
				date: r.date,
				spoilerSensitive: shield.isSpoilerSensitive(sport: "football", entityIds: ids),
				entityIds: ids
			))
		}

		for key in results.golf.keys.sorted() {
			guard let tour = results.golf[key], tour.isFinal, let winner = tour.topPlayers.first else { continue }
			let names = (tour.topPlayers + tour.norwegianPlayers).map(\.player).filter { !$0.isEmpty }
			guard let ids = followedIds(names: names, sport: "golf", lens: lens, index: index) else { continue }
			let details = (tour.topPlayers.prefix(3) + tour.norwegianPlayers)
				.map { positionLine(position: $0.position, name: $0.player, value: $0.score) }
				.filter { !$0.isEmpty }
			rows.append(NewsResultRow(
				id: "result|golf|\(key)|\(tour.tournamentName ?? "")",
				sport: "golf",
				title: tour.tournamentName ?? "Golfturnering",
				score: positionLine(position: nil, name: winner.player, value: winner.score),
				meta: [golfTourLabel(key), "sluttresultat"].joined(separator: " · "),
				details: capDetails(details),
				date: nil,
				spoilerSensitive: shield.isSpoilerSensitive(sport: "golf", entityIds: ids),
				entityIds: ids
			))
		}

		for r in results.f1 {
			guard let winner = r.topDrivers.first else { continue }
			let names = r.topDrivers.map(\.driver).filter { !$0.isEmpty }
			guard let ids = followedIds(names: names, sport: "f1", lens: lens, index: index) else { continue }
			rows.append(NewsResultRow(
				id: "result|f1|\(r.raceName)|\(stampKey(r.date))",
				sport: "f1",
				title: r.raceName.isEmpty ? "Grand Prix" : r.raceName,
				score: winner.driver,
				meta: [r.circuit, r.type].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "),
				details: capDetails(r.topDrivers.prefix(3).map { positionLine(position: $0.position, name: $0.driver, value: nil) }),
				date: r.date,
				spoilerSensitive: shield.isSpoilerSensitive(sport: "f1", entityIds: ids),
				entityIds: ids
			))
		}

		for r in results.tennis {
			guard !r.winner.isEmpty, !r.loser.isEmpty else { continue }
			guard let ids = followedIds(names: [r.winner, r.loser], sport: "tennis", lens: lens, index: index) else { continue }
			// Outcome-NEUTRAL title: the pair sorted alphabetically, never
			// "winner – loser" — otherwise the row spoils the match it is about
			// to mask.
			let pair = [r.winner, r.loser].sorted { $0.localizedStandardCompare($1) == .orderedAscending }
			rows.append(NewsResultRow(
				id: "result|tennis|\(r.winner)|\(r.loser)|\(stampKey(r.date))",
				sport: "tennis",
				title: "\(pair[0]) – \(pair[1])",
				score: [r.winner, r.score ?? ""].filter { !$0.isEmpty }.joined(separator: " "),
				meta: [r.tournament, r.round].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "),
				details: [],
				date: r.date,
				spoilerSensitive: shield.isSpoilerSensitive(sport: "tennis", entityIds: ids),
				entityIds: ids
			))
		}

		return interleaveBySport(rows)
	}

	/// Per-sport newest-first, then a round robin across sports (sports ordered
	/// by their own newest result) — every sport gets ONE answer before any sport
	/// gets a second. Twin of news-web.js `ssInterleaveBySport`.
	static func interleaveBySport(_ rows: [NewsResultRow]) -> [NewsResultRow] {
		var groups: [String: [NewsResultRow]] = [:]
		var firstSeen: [String] = []
		for row in rows {
			if groups[row.sport] == nil { firstSeen.append(row.sport) }
			groups[row.sport, default: []].append(row)
		}
		for sport in firstSeen {
			groups[sport] = groups[sport]?.sorted { ($0.date ?? .distantPast) > ($1.date ?? .distantPast) }
		}
		// Sort sports by their newest row, keeping first-seen order for ties
		// (a stable sort over the enumerated index).
		let order = firstSeen.enumerated().sorted { a, b in
			let da = groups[a.element]?.first?.date ?? .distantPast
			let db = groups[b.element]?.first?.date ?? .distantPast
			return da == db ? a.offset < b.offset : da > db
		}.map(\.element)

		var out: [NewsResultRow] = []
		var i = 0
		while true {
			var took = false
			for sport in order {
				guard let list = groups[sport], i < list.count else { continue }
				out.append(list[i])
				took = true
			}
			if !took { break }
			i += 1
		}
		return out
	}

	/// The followed entity ids these participant names resolve to, or `nil` when
	/// the result isn't about anything the user follows. Two signals, both
	/// reusing existing machinery: the resolver's served entity for a NAME, and a
	/// sport-scoped name/alias hit for each followed rule (so an alias like "Lyn"
	/// on "FK Lyn Oslo" counts). A followed WHOLE-sport admits the result even
	/// with no name hit (the ids are then whatever matched — possibly none, which
	/// still lets a sport-scoped spoiler policy mask it). Never a new fuzzy scheme.
	private static func followedIds(names: [String], sport: String, lens: NewsLens, index: EntityIndex) -> Set<String>? {
		var ids = Set<String>()
		for name in names where !name.isEmpty {
			if let served = index.servedEntity(for: name), lens.followedEntityIds.contains(served.id) {
				ids.insert(served.id)
			}
		}
		let hay = names.joined(separator: " ")
		for id in lens.followedEntityIds {
			guard let e = index.entity(id: id) else { continue }
			if !e.sport.isEmpty, TextMatch.normalize(e.sport) != TextMatch.normalize(sport) { continue }
			if ([e.name] + e.aliases).contains(where: { !$0.isEmpty && TextMatch.containsName(hay, $0) }) {
				ids.insert(id)
			}
		}
		if ids.isEmpty, !lens.followedSports.contains(NewsLens.canonicalSport(sport)) { return nil }
		return ids
	}

	/// "1. Ryan Fox -10" / "Ryan Fox -10" (no position) — the shared
	/// leaderboard/finishing-order line.
	private static func positionLine(position: Int?, name: String, value: String?) -> String {
		let who = name.trimmingCharacters(in: .whitespaces)
		guard !who.isEmpty else { return "" }
		let pos = position.map { "\($0). " } ?? ""
		let val = (value ?? "").trimmingCharacters(in: .whitespaces)
		return "\(pos)\(who)\(val.isEmpty ? "" : " \(val)")"
	}

	private static func golfTourLabel(_ key: String) -> String {
		switch key {
		case "pga": return "PGA Tour"
		case "dpWorld": return "DP World Tour"
		default: return key
		}
	}

	private static func stampKey(_ date: Date?) -> String {
		date.map { String($0.timeIntervalSince1970) } ?? "?"
	}

	// MARK: - FREMOVER (forvarsler beyond the near horizon)

	/// Followed events whose window overlaps [now + horizon, far-future) — the
	/// forvarsler the agenda's near view doesn't foreground. Uses
	/// `FeedCompiler.isEventInWindow` (never a manual `time >= x` filter, per the
	/// CLAUDE.md convention, so multi-day events survive) and the lens for
	/// personal relevance; sorted by start.
	private static func forwardRows(_ events: [Event], lens: NewsLens, index: EntityIndex, now: Date, max: Int) -> [NewsForwardRow] {
		guard !lens.isEmpty else { return [] }
		let horizonStart = now.addingTimeInterval(forwardHorizonDays * 86_400)
		let farFuture = now.addingTimeInterval(400 * 86_400)
		let matched = events.filter { lens.matchesEvent($0, index: index) }
		let (feedEvents, lookup) = EventBridge.bridge(matched)
		let rows = feedEvents
			.filter { FeedCompiler.isEventInWindow($0, start: horizonStart, end: farFuture) }
			.compactMap { fe -> (sort: Date, row: NewsForwardRow)? in
				guard let id = fe.id, let event = lookup[id], let time = fe.time else { return nil }
				let title = AgendaFormat.title(homeTeam: event.homeTeam, awayTeam: event.awayTeam, fallback: event.title)
				return (time, NewsForwardRow(
					id: id,
					dateLabel: forwardDateLabel(time: time, endTime: event.endTime),
					title: title,
					meta: AgendaFormat.metaLabel(tournament: event.tournament, title: title),
					channel: AgendaFormat.channelLabel(event.streaming),
					isAIResearch: event.source == "ai-research"
				))
			}
			.sorted { $0.sort < $1.sort }
			.prefix(max)
			.map(\.row)
		return Array(rows)
	}

	// MARK: - Forward date label ("20. jul" / "20.–27. jul")

	private static let dayMonth: DateFormatter = {
		let f = DateFormatter()
		f.locale = Locale(identifier: "nb_NO")
		f.timeZone = FeedCompiler.osloTimeZone
		f.dateFormat = "d. MMM"
		return f
	}()

	private static let dayOnly: DateFormatter = {
		let f = DateFormatter()
		f.locale = Locale(identifier: "nb_NO")
		f.timeZone = FeedCompiler.osloTimeZone
		f.dateFormat = "d."
		return f
	}()

	/// A DATE label for a forvarsel (never a clock — a season start weeks out is
	/// answered by "when", i.e. the day, not the hour). A multi-day span reads
	/// "20.–27. jul".
	static func forwardDateLabel(time: Date, endTime: Date?) -> String {
		guard let end = endTime, FeedCompiler.osloDayKey(time) != FeedCompiler.osloDayKey(end) else {
			return dayMonth.string(from: time)
		}
		return "\(dayOnly.string(from: time))–\(dayMonth.string(from: end))"
	}
}

/// SECTION 3 row — one recent result about something the user follows, in the
/// per-sport DNA every sport is projected onto (WP-171). `title` is deliberately
/// outcome-NEUTRAL (who/what played); `score` is the outcome payload and
/// `details` the outcome-revealing extra lines (goal scorers with minute, the
/// golf top-3 + Norwegians, the F1 podium) — so `spoilerSensitive` masks BOTH
/// behind the same «Vis resultat». `score` is nil when the source carried no
/// final outcome.
struct NewsResultRow: Identifiable, Equatable {
	var id: String
	/// Canonical sport tag ("football"/"golf"/"f1"/"tennis") — drives the
	/// per-sport interleave (and nothing visual).
	var sport: String
	var title: String
	var score: String?
	var meta: String?
	/// Extra outcome-revealing lines. Empty for a sport/row that has none.
	var details: [String] = []
	var date: Date?
	var spoilerSensitive: Bool
	/// WP-176: the FOLLOWED entity ids this result resolved to (possibly empty
	/// when it only matched a whole-sport follow). The board itself doesn't
	/// render them — `ResultDigest` needs them to decide whether the user opted
	/// this specific entity into a fulltidsvarsel, which is a per-ENTITY choice.
	var entityIds: Set<String> = []
}

/// SECTION 4 row — a forvarsel. Non-interactive: a calm date + what + where line
/// (the board sends its live traffic OUT via NYTT, not from here).
struct NewsForwardRow: Identifiable, Equatable {
	var id: String
	var dateLabel: String
	var title: String
	var meta: String?
	var channel: String
	var isAIResearch: Bool
}
