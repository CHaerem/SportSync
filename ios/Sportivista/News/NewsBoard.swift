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
//    3. results   — followed teams' recent results, each carrying whether the
//                   spoiler shield must mask its score.
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
			headline: freshHeadline(featured, now: now),
			news: Array(matchedNews),
			results: footballResultRows(results.football, lens: lens, index: index, shield: shield),
			forward: forwardRows(events, lens: lens, index: index, now: now, max: maxForward)
		)
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

	// MARK: - RESULTAT (followed teams)

	/// Football results ABOUT a followed team, each stamped with whether its
	/// score must be masked (the spoiler shield, keyed off the resolved entity
	/// ids + sport). A result matches when a followed rule's entity name/alias
	/// word-boundary-hits a team name (reusing the resolver + TextMatch, not a
	/// new predicate); newest first.
	private static func footballResultRows(_ results: [FootballResult], lens: NewsLens, index: EntityIndex, shield: SpoilerShield) -> [NewsResultRow] {
		var rows: [NewsResultRow] = []
		for r in results {
			guard !r.homeTeam.isEmpty, !r.awayTeam.isEmpty else { continue }
			let matchedIds = followedTeamIds(home: r.homeTeam, away: r.awayTeam, lens: lens, index: index)
			guard !matchedIds.isEmpty else { continue }
			let sensitive = shield.isSpoilerSensitive(sport: "football", entityIds: matchedIds)
			rows.append(NewsResultRow(
				id: resultId(r),
				title: AgendaFormat.title(homeTeam: r.homeTeam, awayTeam: r.awayTeam, fallback: r.recapHeadline ?? ""),
				score: r.scoreLine,
				meta: r.league,
				date: r.date,
				spoilerSensitive: sensitive
			))
		}
		return rows.sorted { ($0.date ?? .distantPast) > ($1.date ?? .distantPast) }
	}

	/// The followed entity ids either team resolves to. Two signals, both reusing
	/// existing machinery: the resolver's served entity for the team NAME, and a
	/// sport-scoped name/alias hit for each followed rule (so an alias like "Lyn"
	/// on "FK Lyn Oslo" counts). Never invents a new fuzzy scheme.
	private static func followedTeamIds(home: String, away: String, lens: NewsLens, index: EntityIndex) -> Set<String> {
		var ids = Set<String>()
		for name in [home, away] {
			if let served = index.servedEntity(for: name), lens.followedEntityIds.contains(served.id) {
				ids.insert(served.id)
			}
		}
		let hay = "\(home) \(away)"
		for id in lens.followedEntityIds {
			guard let e = index.entity(id: id) else { continue }
			if !e.sport.isEmpty, TextMatch.normalize(e.sport) != "football" { continue }
			if ([e.name] + e.aliases).contains(where: { !$0.isEmpty && TextMatch.containsName(hay, $0) }) {
				ids.insert(id)
			}
		}
		return ids
	}

	private static func resultId(_ r: FootballResult) -> String {
		let stamp = r.date.map { String($0.timeIntervalSince1970) } ?? "?"
		return "result|\(r.homeTeam)|\(r.awayTeam)|\(stamp)"
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

/// SECTION 3 row — a followed team's recent result. `score` is nil when the
/// source carried no final score; `spoilerSensitive` drives the tap-to-reveal.
struct NewsResultRow: Identifiable, Equatable {
	var id: String
	var title: String
	var score: String?
	var meta: String?
	var date: Date?
	var spoilerSensitive: Bool
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
