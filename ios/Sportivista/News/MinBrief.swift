//
//  MinBrief.swift
//  Sportivista
//
//  WP-174 — «Min brief»: the deterministic, on-device personal brief («I din
//  verden i dag …») that fills the Nyheter board's brief slot when the profile
//  has follows. The editorial headline is DELIBERATELY catalog-wide (WP-96), so
//  it is the surface furthest from the go-to promise; per VISJON v3 the server
//  distils ONCE and the client COMPOSES the personal brief locally. No LLM (the
//  web-LLM spike found Norwegian quality at a browser-model's size the binding
//  constraint): the brief is DETERMINISTIC text composition.
//
//  TWIN DISCIPLINE (the core of this WP): `compose(_:)` is a bit-for-bit twin of
//  docs/js/brief.js `ssComposeBrief`, PINNED by the shared golden fixtures in
//  tests/fixtures/brief-vectors/ (à la the feed-vectors). Both platforms decode
//  the same {input:context, expected:brief} files (MinBriefTests / brief.test.js)
//  and must produce the SAME string. Only PARAMETERS/SELECTION differ per
//  platform (see tests/fixtures/brief-vectors/DIVERGENCES.md — the web has no
//  spoiler shield); the COMPOSITION is one algorithm.
//
//  `compose` takes a SEMANTIC `BriefContext` (already-selected upcoming events,
//  results, and a news count — each field a plain primitive), so the composition
//  decisions (frame, wording, spoiler phrasing, capping, max-length) are what the
//  fixtures freeze. `build(...)` assembles that context from the same cached
//  values NewsBoard.build already holds, reusing the already-twinned machinery
//  (NewsLens.matchesEvent, NewsBoard.resultRows, NewsLens.matches, SpoilerShield).
//
//  Pure and Foundation-only (no I/O, `now` passed in), so MinBriefTests drives
//  the whole flow with seeded values and no running app.
//

import Foundation

/// The SEMANTIC context the composer consumes — decoded directly from the shared
/// brief-vectors and built from cached data by `MinBrief.build`.
struct BriefContext: Decodable, Equatable {
	struct UpcomingItem: Decodable, Equatable {
		var title: String
		/// "today" | "tomorrow" | "later".
		var day: String
		/// Today AND Oslo start hour ≥ 18 (drives the «i kveld» frame).
		var evening: Bool
		/// Oslo "HH:mm", or "" for a multi-day event.
		var time: String
		/// Norwegian weekday ("lørdag"), used when `day == "later"`.
		var weekday: String
	}
	struct ResultItem: Decodable, Equatable {
		/// OUTCOME-NEUTRAL (never "winner – loser").
		var title: String
		/// The spoiler-carrying payload (score / winner).
		var outcome: String
		/// "score" (football) | "winner" (golf/F1/…).
		var kind: String
		/// A screened entity → the outcome is hidden.
		var spoiler: Bool
		/// "yesterday" | "today" | "earlier".
		var day: String
	}
	var upcoming: [UpcomingItem]
	var results: [ResultItem]
	var newsCount: Int
}

enum MinBrief {
	// MARK: - Composition tunables (twinned with brief.js)

	/// How many upcoming events / results the brief NAMES (ro — a line, not a list).
	static let maxUpcoming = 2
	static let maxResults = 2
	/// Only events starting within this window feed «i din verden i dag».
	static let horizonDays: Double = 7
	/// Hard ceiling on the whole brief (characters).
	static let maxLen = 220

	// MARK: - The pure composer (TWIN of ssComposeBrief)

	/// Compose the personal brief from a SEMANTIC context. Returns "" when there
	/// is nothing to say (the caller then falls back to the editorial line —
	/// graceful degradation, never an empty «I din verden»).
	static func compose(_ context: BriefContext) -> String {
		let up = Array(context.upcoming.prefix(maxUpcoming))
		let rs = Array(context.results.prefix(maxResults))
		let newsCount = max(0, context.newsCount)

		struct Segment { let kind: String; let text: String; let evening: Bool }
		var segments: [Segment] = []
		if !up.isEmpty {
			segments.append(Segment(kind: "upcoming",
			                        text: joinNo(up.map(upcomingFragment)),
			                        evening: up[0].day == "today" && up[0].evening))
		}
		if !rs.isEmpty {
			segments.append(Segment(kind: "results", text: joinNo(rs.map(resultFragment)), evening: false))
		}
		if newsCount > 0 {
			segments.append(Segment(kind: "news", text: newsFragment(newsCount), evening: false))
		}

		guard let first = segments.first else { return "" }

		let frame = (first.kind == "upcoming" && first.evening) ? "I din verden i kveld" : "I din verden i dag"
		var sentences = ["\(frame): \(first.text)."]
		for s in segments.dropFirst() { sentences.append("\(sentenceCase(s.text)).") }
		return clamp(sentences, max: maxLen)
	}

	/// Norwegian list join: "a" / "a og b" / "a, b og c".
	static func joinNo(_ list: [String]) -> String {
		let items = list.filter { !$0.isEmpty }
		if items.isEmpty { return "" }
		if items.count == 1 { return items[0] }
		return items.dropLast().joined(separator: ", ") + " og " + items[items.count - 1]
	}

	/// Capitalise the first character (Norwegian-safe single-char uppercase).
	static func sentenceCase(_ s: String) -> String {
		guard let first = s.first else { return s }
		return String(first).uppercased() + s.dropFirst()
	}

	/// One upcoming event → a calm fragment. The day frame is on the whole brief,
	/// so a today-fragment needs no day word — only its time.
	static func upcomingFragment(_ e: BriefContext.UpcomingItem) -> String {
		switch e.day {
		case "today": return e.time.isEmpty ? e.title : "\(e.title) \(e.time)"
		case "tomorrow": return e.time.isEmpty ? "\(e.title) i morgen" : "\(e.title) i morgen \(e.time)"
		default: return e.weekday.isEmpty ? e.title : "\(e.title) \(e.weekday)"
		}
	}

	/// One result → a calm fragment. SPOILER always wins: a screened entity's
	/// result is named WITHOUT its outcome. Otherwise a scoreline sport reads
	/// differently from a winner sport.
	static func resultFragment(_ r: BriefContext.ResultItem) -> String {
		let suffix = r.day == "yesterday" ? " i går" : (r.day == "today" ? " i dag" : "")
		if r.spoiler { return "resultatet fra \(r.title)\(suffix) venter på deg" }
		if r.kind == "score" { return "\(r.title) endte \(r.outcome)\(suffix)" }
		return "\(r.title) ble vunnet av \(r.outcome)\(suffix)"
	}

	/// The news clause: "N nyheter om det du følger".
	static func newsFragment(_ n: Int) -> String {
		return n == 1 ? "én nyhet om det du følger" : "\(n) nyheter om det du følger"
	}

	/// Enforce the max length: keep whole sentences from the front while they
	/// fit; if even the first alone overflows, word-boundary-truncate it + "…".
	static func clamp(_ sentences: [String], max: Int) -> String {
		var out = ""
		for sent in sentences {
			let candidate = out.isEmpty ? sent : out + " " + sent
			if candidate.count <= max { out = candidate } else { break }
		}
		if !out.isEmpty { return out }
		// The first sentence alone is too long — hard-truncate at a word boundary.
		let first = sentences[0]
		let cutEnd = first.index(first.startIndex, offsetBy: Swift.max(0, max - 1))
		var cut = String(first[first.startIndex..<cutEnd])
		if let lastSpace = cut.lastIndex(of: " "), lastSpace > cut.startIndex {
			cut = String(cut[cut.startIndex..<lastSpace])
		}
		while cut.last == " " { cut.removeLast() }
		return cut + "…"
	}

	// MARK: - Context building (SELECTION — parallel-by-rule with brief.js)

	/// Build the semantic context from the cached values NewsBoard.build already
	/// holds. Selection reuses the already-twinned machinery; the composer is what
	/// the shared fixtures pin.
	static func build(events: [Event], results: RecentResults, news: [NewsItem],
	                  lens: NewsLens, index: EntityIndex, shield: SpoilerShield, now: Date) -> BriefContext {
		BriefContext(
			upcoming: upcomingItems(events: events, lens: lens, index: index, now: now),
			results: resultItems(results: results, lens: lens, index: index, shield: shield, now: now),
			newsCount: news.filter { lens.matches($0) }.count
		)
	}

	/// Events about something you follow, upcoming within the horizon, nearest
	/// first, capped — reduced to the composer's semantic UpcomingItem. Uses the
	/// SAME follow lens (NewsLens.matchesEvent) the FREMOVER section uses.
	static func upcomingItems(events: [Event], lens: NewsLens, index: EntityIndex, now: Date) -> [BriefContext.UpcomingItem] {
		let horizonEnd = now.addingTimeInterval(horizonDays * 86_400)
		let matched = events.filter { lens.matchesEvent($0, index: index) }
		let (feedEvents, lookup) = EventBridge.bridge(matched)
		let picked = feedEvents
			.filter { fe in
				guard let t = fe.time else { return false }
				return (fe.endTime ?? t) >= now && t <= horizonEnd
			}
			.sorted { ($0.time ?? .distantFuture) < ($1.time ?? .distantFuture) }
			.prefix(maxUpcoming)
		return picked.compactMap { fe -> BriefContext.UpcomingItem? in
			guard let id = fe.id, let event = lookup[id], let time = fe.time else { return nil }
			return upcomingItem(fe: fe, event: event, time: time, now: now)
		}
	}

	static func upcomingItem(fe: FeedEvent, event: Event, time: Date, now: Date) -> BriefContext.UpcomingItem {
		let todayKey = FeedCompiler.osloDayKey(now)
		let tomorrowKey = FeedCompiler.osloDayKey(now.addingTimeInterval(86_400))
		let isMultiday: Bool = {
			guard let end = fe.endTime else { return false }
			return FeedCompiler.osloDayKey(time) != FeedCompiler.osloDayKey(end)
		}()
		var startKey = FeedCompiler.osloDayKey(time)
		if startKey < todayKey { startKey = todayKey }  // an ongoing multi-day event lives under «i dag»

		var day = "later", evening = false, timeStr = "", weekday = ""
		if startKey == todayKey {
			day = "today"
			if !isMultiday { evening = osloHour(time) >= 18 }
		} else if startKey == tomorrowKey {
			day = "tomorrow"
		} else {
			day = "later"
			weekday = weekdayName(time)
		}
		timeStr = isMultiday ? "" : AgendaFormat.timeLabel(time: time, endTime: nil)
		let title = AgendaFormat.title(homeTeam: event.homeTeam, awayTeam: event.awayTeam,
		                               participants: event.participants, fallback: event.title)
		return BriefContext.UpcomingItem(title: title, day: day, evening: evening, time: timeStr, weekday: weekday)
	}

	/// Recent results about what you follow, newest first, capped — the SAME rows
	/// (NewsBoard.resultRows) the RESULTAT section shows, through the SAME spoiler
	/// shield. Only rows that render meaningfully (an outcome, or spoiler-screened)
	/// are kept.
	static func resultItems(results: RecentResults, lens: NewsLens, index: EntityIndex, shield: SpoilerShield, now: Date) -> [BriefContext.ResultItem] {
		let rows = NewsBoard.resultRows(results, lens: lens, index: index, shield: shield)
		let kept = rows.enumerated()
			.filter { (_, r) in (r.score?.isEmpty == false) || r.spoilerSensitive }
			.sorted { a, b in
				let da = a.element.date ?? .distantPast
				let db = b.element.date ?? .distantPast
				if da != db { return da > db }   // newest first
				return a.offset < b.offset       // stable
			}
			.prefix(maxResults)
		return kept.map { (_, r) in resultItem(r, now: now) }
	}

	static func resultItem(_ r: NewsResultRow, now: Date) -> BriefContext.ResultItem {
		var day = "earlier"
		if let date = r.date {
			let dk = FeedCompiler.osloDayKey(date)
			if dk == FeedCompiler.osloDayKey(now) { day = "today" }
			else if dk == FeedCompiler.osloDayKey(now.addingTimeInterval(-86_400)) { day = "yesterday" }
		}
		return BriefContext.ResultItem(
			title: r.title,
			outcome: r.score ?? "",
			kind: r.sport == "football" ? "score" : "winner",
			spoiler: r.spoilerSensitive,
			day: day
		)
	}

	// MARK: - Oslo-local helpers

	private static func osloHour(_ date: Date) -> Int {
		var cal = Calendar(identifier: .gregorian)
		cal.timeZone = FeedCompiler.osloTimeZone
		return cal.component(.hour, from: date)
	}

	private static let weekdayFormatter: DateFormatter = {
		let f = DateFormatter()
		f.locale = Locale(identifier: "nb_NO")
		f.timeZone = FeedCompiler.osloTimeZone
		f.dateFormat = "EEEE"
		return f
	}()

	private static func weekdayName(_ date: Date) -> String {
		weekdayFormatter.string(from: date)
	}
}
