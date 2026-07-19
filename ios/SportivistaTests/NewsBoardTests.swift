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
		let brief = FeaturedBrief(mode: "morning", blocks: [FeaturedBrief.Block(type: "headline", text: "Hei")])
		let board = NewsBoard.build(news: [], featured: brief, results: RecentResults(), events: [], entities: [], profile: followProfile, shield: SpoilerShield(), now: now)
		XCTAssertEqual(board.headline, "Hei")
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
		let near = EventBuilder.make(sport: "cross-country", title: "Nær langrenn", time: iso(3), id: "near")       // < 7d
		let far = EventBuilder.make(sport: "cross-country", title: "Fjern langrenn", time: iso(30), id: "far")      // > 7d, followed
		let farUnfollowed = EventBuilder.make(sport: "tennis", title: "Fjern tennis", time: iso(30), id: "tennis")  // > 7d, NOT followed
		let board = NewsBoard.build(news: [], featured: nil, results: RecentResults(), events: [near, far, farUnfollowed], entities: [lynTeam, langrenn], profile: followProfile, shield: SpoilerShield(), now: now)

		XCTAssertEqual(board.forward.map(\.id), ["far"], "only the far-future FOLLOWED event is a forvarsel")
	}

	func testFremover_sortedByStart_andCapped() {
		let events = (1...12).map { EventBuilder.make(sport: "cross-country", title: "E\($0)", time: iso(Double(10 + $0)), id: "e\($0)") }
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
