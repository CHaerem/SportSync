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

	// MARK: - Section 1 ritual title (WP-181)

	func testBriefTitle_namesTheRitual_whenAHeadlineShows() {
		let brief = FeaturedBrief(generatedAt: now, mode: "morning", blocks: [FeaturedBrief.Block(type: "headline", text: "Hei")])
		// `now` = 2026-07-19T12:00:00Z = Oslo 14:00 (CEST) → morning.
		let morning = NewsBoard.build(news: [], featured: brief, results: RecentResults(), events: [], entities: [], profile: followProfile, shield: SpoilerShield(), now: now)
		XCTAssertEqual(morning.briefTitle, "Morgenbriefen")

		// Same headline, opened in the evening (Oslo 18:00) → Kveldsbriefen.
		let eveningNow = date("2026-07-19T16:00:00Z")
		let eveningBrief = FeaturedBrief(generatedAt: eveningNow, mode: "evening", blocks: [FeaturedBrief.Block(type: "headline", text: "Hei")])
		let evening = NewsBoard.build(news: [], featured: eveningBrief, results: RecentResults(), events: [], entities: [], profile: followProfile, shield: SpoilerShield(), now: eveningNow)
		XCTAssertEqual(evening.briefTitle, "Kveldsbriefen")
	}

	func testBriefTitle_nilWhenNoHeadline() {
		// No featured brief, no personal brief → no headline → no title (the whole
		// section is hidden), so the ritual name and the line vanish together.
		let board = NewsBoard.build(news: [], featured: nil, results: RecentResults(), events: [], entities: [], profile: followProfile, shield: SpoilerShield(), now: now)
		XCTAssertNil(board.headline)
		XCTAssertNil(board.briefTitle)
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

	// MARK: - Section 3 · WP-171 (every sport, goal scorers, interleave, cap)

	private let hovland = Entity(id: "viktor-hovland", name: "Viktor Hovland", aliases: ["Hovland"], sport: "golf", type: "athlete")
	private let f1Sport = Entity(id: "sport-f1", name: "Formel 1", aliases: ["F1"], sport: "f1", type: "sport")
	private let ruud = Entity(id: "casper-ruud", name: "Casper Ruud", aliases: ["Ruud"], sport: "tennis", type: "athlete")

	/// Football + a golf ATHLETE + F1 as a WHOLE sport + a tennis athlete — the
	/// three ways a result can be about you.
	private var multiSportProfile: InterestProfile {
		InterestProfile(rules: [
			rule("fk-lyn-oslo", "FK Lyn Oslo", sport: "football"),
			rule("viktor-hovland", "Viktor Hovland", sport: "golf"),
			rule("sport-f1", "Formel 1", sport: "f1"),
			rule("casper-ruud", "Casper Ruud", sport: "tennis"),
		])
	}

	private var multiSportResults: RecentResults {
		RecentResults(
			football: [FootballResult(
				homeTeam: "Lyn", awayTeam: "Sogndal", homeScore: 2, awayScore: 1,
				date: now.addingTimeInterval(-3600), league: "OBOS-ligaen",
				goalScorers: [
					GoalScorer(player: "Kristian Eriksen", team: "Lyn", minute: "8'"),
					GoalScorer(player: "Ola Nordmann", team: "Sogndal", minute: "77'"),
				]
			)],
			golf: [
				"pga": GolfTourResult(
					tournamentName: "The Open", status: "final", completedRound: 4,
					topPlayers: [
						GolfResultPlayer(position: 1, player: "Ryan Fox", score: "-10"),
						GolfResultPlayer(position: 2, player: "Cameron Young", score: "-9"),
						GolfResultPlayer(position: 3, player: "Sam Burns", score: "-8"),
						GolfResultPlayer(position: 4, player: "Scottie Scheffler", score: "-7"),
					],
					norwegianPlayers: [GolfResultPlayer(position: 121, player: "Viktor Hovland", score: "+4")]
				),
				// NOT final → not a result (an in-progress leaderboard belongs to Uka).
				"dpWorld": GolfTourResult(
					tournamentName: "BMW International", status: "in-progress",
					topPlayers: [GolfResultPlayer(position: 1, player: "Viktor Hovland", score: "-3")]
				),
			],
			tennis: [TennisResult(winner: "Casper Ruud", loser: "Alexander Zverev", score: "6-4, 7-5",
			                      date: now.addingTimeInterval(-7200), tournament: "ATP Hamburg", round: "Semifinale")],
			f1: [F1RaceResult(raceName: "Belgian Grand Prix", type: "Race", date: now.addingTimeInterval(-86400), circuit: "Spa",
			                  topDrivers: [
			                      F1ResultDriver(position: 1, driver: "Kimi Antonelli"),
			                      F1ResultDriver(position: 2, driver: "Charles Leclerc"),
			                      F1ResultDriver(position: 3, driver: "Max Verstappen"),
			                      F1ResultDriver(position: 4, driver: "Lewis Hamilton"),
			                  ])]
		)
	}

	private func multiSportBoard(shield: SpoilerShield = SpoilerShield()) -> NewsBoard {
		NewsBoard.build(news: [], featured: nil, results: multiSportResults, events: [],
		                entities: [lynTeam, hovland, f1Sport, ruud], profile: multiSportProfile,
		                shield: shield, now: now)
	}

	func testResultat_coversEverySportInTheFile_notJustFootball() {
		let board = multiSportBoard()
		XCTAssertEqual(Set(board.results.map(\.sport)), ["football", "golf", "f1", "tennis"],
		               "golf/F1/tennis results were already in recent-results.json and never shown (WP-171)")
	}

	func testResultat_footballRow_rendersGoalScorersWithMinute() {
		let row = multiSportBoard().results.first { $0.sport == "football" }
		XCTAssertEqual(row?.score, "2–1")
		XCTAssertEqual(row?.details, ["8' Kristian Eriksen (Lyn)", "77' Ola Nordmann (Sogndal)"])
	}

	func testResultat_detailLinesAreCapped_soAGoalFestIsNotAWall() {
		let scorers = (1...11).map { GoalScorer(player: "Spiller \($0)", team: "Sogndal", minute: "\($0)'") }
		let results = RecentResults(football: [FootballResult(homeTeam: "Lyn", awayTeam: "Sogndal", homeScore: 4, awayScore: 6,
		                                                     date: now, league: "OBOS-ligaen", goalScorers: scorers)])
		let board = NewsBoard.build(news: [], featured: nil, results: results, events: [], entities: [lynTeam],
		                            profile: followProfile, shield: SpoilerShield(), now: now)
		XCTAssertEqual(board.results.first?.details.count, NewsBoard.detailCap + 1)
		XCTAssertEqual(board.results.first?.details.last, "+6 til")
	}

	func testResultat_golfRow_onlyFinalTournament_withTopThreeAndNorwegians() {
		let golf = multiSportBoard().results.filter { $0.sport == "golf" }
		XCTAssertEqual(golf.count, 1, "the in-progress tour is not a result")
		XCTAssertEqual(golf.first?.title, "The Open")
		XCTAssertEqual(golf.first?.score, "Ryan Fox -10")
		XCTAssertEqual(golf.first?.meta, "PGA Tour · sluttresultat")
		XCTAssertEqual(golf.first?.details, ["1. Ryan Fox -10", "2. Cameron Young -9", "3. Sam Burns -8", "121. Viktor Hovland +4"])
	}

	func testResultat_f1Row_winnerIsTheOutcome_podiumIsTheDetail() {
		let f1 = multiSportBoard().results.first { $0.sport == "f1" }
		XCTAssertEqual(f1?.title, "Belgian Grand Prix")
		XCTAssertEqual(f1?.score, "Kimi Antonelli")
		XCTAssertEqual(f1?.details, ["1. Kimi Antonelli", "2. Charles Leclerc", "3. Max Verstappen"])
	}

	func testResultat_tennisTitleIsOutcomeNeutral() {
		let tennis = multiSportBoard().results.first { $0.sport == "tennis" }
		// Alphabetical pair — the row must not spoil who won before the shield does.
		XCTAssertEqual(tennis?.title, "Alexander Zverev – Casper Ruud")
		XCTAssertEqual(tennis?.score, "Casper Ruud 6-4, 7-5")
	}

	/// Spoilervernet er hellig: a sport-scoped policy must mask the row's WHOLE
	/// outcome — score AND the new detail lines (each one gives the result away).
	func testResultat_spoilerPolicyMarksTheRowSensitive_forAnySport() {
		let board = multiSportBoard(shield: SpoilerShield(sports: ["golf", "f1"], entityIds: []))
		XCTAssertEqual(board.results.first { $0.sport == "golf" }?.spoilerSensitive, true)
		XCTAssertEqual(board.results.first { $0.sport == "f1" }?.spoilerSensitive, true)
		XCTAssertEqual(board.results.first { $0.sport == "football" }?.spoilerSensitive, false)
	}

	func testResultat_interleavesSports_soEverySportGetsAnAnswerInsideTheCap() {
		var results = multiSportResults
		// A busy football weekend: five more matches, all newer than the rest.
		results.football += (1...5).map {
			FootballResult(homeTeam: "Lyn", awayTeam: "Klubb \($0)", homeScore: 1, awayScore: 0,
			               date: now.addingTimeInterval(Double(-$0) * 60), league: "OBOS-ligaen")
		}
		let board = NewsBoard.build(news: [], featured: nil, results: results, events: [],
		                            entities: [lynTeam, hovland, f1Sport, ruud], profile: multiSportProfile,
		                            shield: SpoilerShield(), now: now)
		let capped = board.results.prefix(NewsBoard.resultCap)
		XCTAssertEqual(Set(capped.map(\.sport)), ["football", "golf", "f1", "tennis"],
		               "golf/F1/tennis must survive the cap on a football-heavy day")
		XCTAssertEqual(board.results.count, 9, "nothing is dropped — the rest lives behind «Vis alle»")
	}

	func testResultat_unfollowedSportIsExcluded() {
		// A profile with ONLY the football team: golf/F1/tennis are not about them.
		let board = NewsBoard.build(news: [], featured: nil, results: multiSportResults, events: [],
		                            entities: [lynTeam, hovland, f1Sport, ruud], profile: followProfile,
		                            shield: SpoilerShield(), now: now)
		XCTAssertEqual(board.results.map(\.sport), ["football"])
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
