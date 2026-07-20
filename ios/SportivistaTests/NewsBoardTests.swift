//
//  NewsBoardTests.swift
//  SportivistaTests
//
//  WP-106 — hostless tests for NewsBoard.build, the pure four-section assembler.
//  Covers: NYTT lens-filtering + newest-first order + cap; RESULTAT scoped to a
//  followed team with the spoiler flag set from the shield; FREMOVER's near-
//  horizon exclusion (via isEventInWindow) + lens relevance; and the empty
//  board when nothing is followed.
//

import XCTest

final class NewsBoardTests: XCTestCase {

	private let now = ISO8601DateFormatter().date(from: "2026-07-19T12:00:00Z")!
	private let lynTeam = Entity(id: "fk-lyn-oslo", name: "FK Lyn Oslo", aliases: ["Lyn"], sport: "football", type: "team")
	private let langrenn = Entity(id: "sport-cross-country", name: "Langrenn", aliases: ["langrenn"], sport: "cross-country", type: "sport")

	private func rule(_ entityId: String, _ name: String, sport: String) -> InterestRule {
		InterestRule(entityId: entityId, entityName: name, sport: sport, weight: 0.5, reason: "test", addedAt: now)
	}

	private var followProfile: InterestProfile {
		InterestProfile(rules: [
			rule("fk-lyn-oslo", "FK Lyn Oslo", sport: "football"),
			rule("sport-cross-country", "Langrenn", sport: "cross-country"),
		])
	}

	private func iso(_ offsetDays: Double) -> String {
		ISO8601DateFormatter().string(from: now.addingTimeInterval(offsetDays * 86400))
	}

	private func item(_ id: String, sport: String, entityIds: [String] = [], published: Double) -> NewsItem {
		NewsItem(id: id, title: id, link: "https://x/\(id)", source: "nrk", sport: sport, entityIds: entityIds,
		         publishedAt: now.addingTimeInterval(published * 3600))
	}

	// MARK: - Section 1 (headline)

	func testHeadline_fromFeatured() {
		// WP-136: the brief now carries a `generatedAt` on the CURRENT Oslo day
		// (else it is day-gated out — see the day-gate tests below).
		let brief = FeaturedBrief(generatedAt: now, mode: "morning", blocks: [FeaturedBrief.Block(type: "headline", text: "Hei")])
		let board = NewsBoard.build(news: [], featured: brief, results: RecentResults(), events: [], entities: [], profile: followProfile, shield: SpoilerShield(), now: now)
		XCTAssertEqual(board.headline, "Hei")
	}

	// MARK: - Section 1 day-gate (WP-136)
	// The brief is shown ONLY on the Oslo calendar day of its `generatedAt`. Its
	// language is day-relative ("i kveld"/"i morgen"), so a brief that outlives its
	// Oslo day is a factual error (20.07: yesterday's "VM-finalen i kveld" still
	// showed the day after the final). `now` injected so the midnight boundary is
	// deterministic. Oslo is UTC+2 in July (CEST): Oslo midnight 2026-07-20 =
	// 2026-07-19T22:00:00Z.

	private func date(_ iso: String) -> Date { ISO8601DateFormatter().date(from: iso)! }

	private func headline(generatedAt iso: String?, now: Date) -> String? {
		let brief = FeaturedBrief(
			generatedAt: iso.map { date($0) }, mode: "morning",
			blocks: [FeaturedBrief.Block(type: "headline", text: "Finalen venter i kveld.")])
		return NewsBoard.build(news: [], featured: brief, results: RecentResults(), events: [], entities: [], profile: followProfile, shield: SpoilerShield(), now: now).headline
	}

	func testBrief_shownWhenGeneratedSameOsloDay() {
		let now = date("2026-07-20T06:00:00Z")                               // Oslo 08:00, 20 July
		XCTAssertEqual(headline(generatedAt: "2026-07-20T03:00:00Z", now: now), // Oslo 05:00, 20 July — today
		               "Finalen venter i kveld.")
	}

	func testBrief_hiddenWhenGeneratedYesterdayOslo() {
		let now = date("2026-07-20T06:00:00Z")                               // Oslo 08:00, 20 July
		// Yesterday's 15:00 evening brief, still cached the next morning — the 20.07 bug.
		XCTAssertNil(headline(generatedAt: "2026-07-19T13:00:00Z", now: now))  // Oslo 15:00, 19 July
	}

	func testBrief_droppedTheInstantOsloDayRolls() {
		// `now` just after Oslo midnight into 20 July; the brief is 1h old but from 19 July.
		let now = date("2026-07-19T22:30:00Z")                               // Oslo 00:30, 20 July
		XCTAssertNil(headline(generatedAt: "2026-07-19T21:30:00Z", now: now))  // Oslo 23:30, 19 July
	}

	func testBrief_keptWhenGeneratedJustAfterOsloMidnight() {
		let now = date("2026-07-19T22:30:00Z")                               // Oslo 00:30, 20 July
		XCTAssertEqual(headline(generatedAt: "2026-07-19T22:15:00Z", now: now), // Oslo 00:15, 20 July — today
		               "Finalen venter i kveld.")
	}

	func testBrief_hiddenWhenUndateable() {
		// No `generatedAt` — we won't stand behind a brief we can't date.
		XCTAssertNil(headline(generatedAt: nil, now: date("2026-07-20T06:00:00Z")))
	}

	// MARK: - Section 2 (NYTT)

	func testNytt_filtersAndSortsNewestFirst() {
		let news = [
			item("old-lyn", sport: "football", entityIds: ["fk-lyn-oslo"], published: -10),
			item("new-langrenn", sport: "cross-country", published: -1),
			item("unfollowed-f1", sport: "formula1", published: -2),
		]
		let board = NewsBoard.build(news: news, featured: nil, results: RecentResults(), events: [], entities: [lynTeam, langrenn], profile: followProfile, shield: SpoilerShield(), now: now)
		XCTAssertEqual(board.news.map(\.id), ["new-langrenn", "old-lyn"], "unfollowed dropped; newest first")
	}

	func testNytt_capped() {
		let news = (0..<40).map { item("n\($0)", sport: "cross-country", published: Double(-$0)) }
		let board = NewsBoard.build(news: news, featured: nil, results: RecentResults(), events: [], entities: [langrenn], profile: followProfile, shield: SpoilerShield(), now: now, maxNews: 20)
		XCTAssertEqual(board.news.count, 20)
	}

	// MARK: - Section 3 (RESULTAT)

	func testResultat_scopedToFollowedTeam_withSpoilerFlag() {
		let results = RecentResults(football: [
			FootballResult(homeTeam: "Lyn", awayTeam: "Sogndal", homeScore: 2, awayScore: 1, date: now.addingTimeInterval(-86400), league: "OBOS-ligaen"),
			FootballResult(homeTeam: "Brann", awayTeam: "Molde", homeScore: 0, awayScore: 0, date: now.addingTimeInterval(-3600), league: "Eliteserien"),
		])
		// Spoiler shield on football → the followed result's score must be masked.
		let shield = SpoilerShield(sports: ["football"], entityIds: [])
		let board = NewsBoard.build(news: [], featured: nil, results: results, events: [], entities: [lynTeam], profile: followProfile, shield: shield, now: now)

		XCTAssertEqual(board.results.count, 1, "only the followed team's match is included")
		let row = try? XCTUnwrap(board.results.first)
		XCTAssertEqual(row?.score, "2–1")
		XCTAssertTrue(row?.spoilerSensitive ?? false)
		XCTAssertTrue(row?.title.contains("Lyn") ?? false)
	}

	func testResultat_noSpoilerPolicy_notSensitive() {
		let results = RecentResults(football: [
			FootballResult(homeTeam: "Lyn", awayTeam: "Sogndal", homeScore: 2, awayScore: 1, date: now, league: "OBOS-ligaen"),
		])
		let board = NewsBoard.build(news: [], featured: nil, results: results, events: [], entities: [lynTeam], profile: followProfile, shield: SpoilerShield(), now: now)
		XCTAssertEqual(board.results.first?.spoilerSensitive, false)
	}

	// MARK: - Section 4 (FREMOVER)

	func testFremover_excludesNearHorizon_keepsFarFollowed() {
		// WP-124: the near-horizon floor is now 14 d (forwardHorizonDays), aligned
		// with Uka's 14-day display cap so the two views partition the horizon.
		let near = EventBuilder.make(sport: "cross-country", title: "Nær langrenn", time: iso(3), id: "near")       // < 14d → Uka owns it
		let far = EventBuilder.make(sport: "cross-country", title: "Fjern langrenn", time: iso(30), id: "far")      // > 14d, followed
		let farUnfollowed = EventBuilder.make(sport: "tennis", title: "Fjern tennis", time: iso(30), id: "tennis")  // > 14d, NOT followed
		let board = NewsBoard.build(news: [], featured: nil, results: RecentResults(), events: [near, far, farUnfollowed], entities: [lynTeam, langrenn], profile: followProfile, shield: SpoilerShield(), now: now)

		XCTAssertEqual(board.forward.map(\.id), ["far"], "only the far-future FOLLOWED event is a forvarsel")
	}

	func testFremover_sortedByStart_andCapped() {
		// WP-124: fixture anchored beyond the 14-day floor (days 16–27) so all
		// events are genuinely forvarsler — the test still proves sort + cap.
		let events = (1...12).map { EventBuilder.make(sport: "cross-country", title: "E\($0)", time: iso(Double(15 + $0)), id: "e\($0)") }
		let board = NewsBoard.build(news: [], featured: nil, results: RecentResults(), events: events, entities: [langrenn], profile: followProfile, shield: SpoilerShield(), now: now, maxForward: 8)
		XCTAssertEqual(board.forward.count, 8)
		XCTAssertEqual(board.forward.first?.id, "e1", "earliest first")
	}

	// MARK: - Empty board

	func testEmptyProfile_producesEmptySections() {
		let news = [item("lyn", sport: "football", entityIds: ["fk-lyn-oslo"], published: -1)]
		let results = RecentResults(football: [FootballResult(homeTeam: "Lyn", awayTeam: "Sogndal", homeScore: 2, awayScore: 1, date: now, league: "OBOS")])
		let events = [EventBuilder.make(sport: "cross-country", title: "Far", time: iso(30), id: "far")]
		let board = NewsBoard.build(news: news, featured: nil, results: results, events: events, entities: [lynTeam, langrenn], profile: InterestProfile(rules: []), shield: SpoilerShield(), now: now)

		XCTAssertTrue(board.news.isEmpty)
		XCTAssertTrue(board.results.isEmpty)
		XCTAssertTrue(board.forward.isEmpty)
		XCTAssertNil(board.headline)
	}
}
