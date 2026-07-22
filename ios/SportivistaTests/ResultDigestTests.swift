//
//  ResultDigestTests.swift
//  SportivistaTests
//
//  WP-176 acceptance — the fulltidsvarsel flow, driven end-to-end with a SEEDED
//  result diff (two `recent-results.json` snapshots), plus the widget's
//  «siste resultat»-linje. Everything here is the pure planner, so no
//  UNUserNotificationCenter, no disk, no clock.
//
//  The rules being pinned (in the order the brief states them):
//    • OPT-IN per entity — a followed team with the switch OFF never alerts.
//    • SPOILERVERNET ER HELLIG — an entity/sport under a spoiler policy still
//      gets its alert (the user asked for it) but the text NEVER carries the
//      score, and the widget line disappears entirely.
//    • FÅ — one alert per finished contest, a hard cap, a recency window, and no
//      burst on the first (seeding) sync.
//

import XCTest

final class ResultDigestTests: XCTestCase {

	private let now = ISO8601DateFormatter().date(from: "2026-07-19T20:00:00Z")!
	private let lyn = Entity(id: "fk-lyn-oslo", name: "FK Lyn Oslo", aliases: ["Lyn"], sport: "football", type: "team")
	private let brann = Entity(id: "sk-brann", name: "SK Brann", aliases: ["Brann"], sport: "football", type: "team")

	private var profile: InterestProfile {
		InterestProfile(rules: [
			InterestRule(entityId: "fk-lyn-oslo", entityName: "FK Lyn Oslo", sport: "football", weight: 0.9, reason: "test", addedAt: now),
			InterestRule(entityId: "sk-brann", entityName: "SK Brann", sport: "football", weight: 0.5, reason: "test", addedAt: now),
		])
	}

	/// A finished Lyn match, `hoursAgo` before `now`.
	private func lynResult(hoursAgo: Double = 1, home: Int = 2, away: Int = 1) -> FootballResult {
		FootballResult(homeTeam: "Lyn", awayTeam: "Sogndal", homeScore: home, awayScore: away,
		               date: now.addingTimeInterval(-hoursAgo * 3600), league: "OBOS-ligaen")
	}

	private func brannResult(hoursAgo: Double = 2) -> FootballResult {
		FootballResult(homeTeam: "Brann", awayTeam: "Molde", homeScore: 3, awayScore: 0,
		               date: now.addingTimeInterval(-hoursAgo * 3600), league: "Eliteserien")
	}

	private func plan(
		previous: RecentResults,
		new: RecentResults,
		optedIn: Set<String>,
		shield: SpoilerShield = SpoilerShield(),
		delivered: Set<String> = [],
		now: Date? = nil
	) -> ResultDigest.Output {
		ResultDigest.plan(
			previousResults: previous, newResults: new,
			profile: profile, entities: [lyn, brann], shield: shield,
			optedIn: optedIn, alreadyDelivered: delivered, now: now ?? self.now
		)
	}

	/// A non-empty "before" snapshot, so the seeding guard doesn't swallow the diff.
	private var seededPrevious: RecentResults {
		RecentResults(football: [brannResult(hoursAgo: 30)])
	}

	// MARK: - The happy path: a followed, opted-in match finished

	func testNewFinishedResult_forOptedInEntity_producesOneCalmAlert() {
		let output = plan(
			previous: seededPrevious,
			new: RecentResults(football: [brannResult(hoursAgo: 30), lynResult()]),
			optedIn: ["fk-lyn-oslo"]
		)

		XCTAssertEqual(output.alerts.count, 1, "one alert per finished contest — never per goal")
		let alert = output.alerts[0]
		XCTAssertEqual(alert.title, "Fulltid: Lyn – Sogndal")
		XCTAssertEqual(alert.body, "2–1 · OBOS-ligaen")
		XCTAssertEqual(alert.fireDate, now, "a result alert fires promptly; it is not scheduled ahead")
	}

	// MARK: - (a) OPT-IN per entity

	func testFollowedButNotOptedIn_producesNoAlert() {
		let output = plan(
			previous: seededPrevious,
			new: RecentResults(football: [brannResult(hoursAgo: 30), lynResult()]),
			optedIn: []
		)
		XCTAssertTrue(output.alerts.isEmpty, "fulltidsvarsel is OFF by default — following is not consent to be pinged")
	}

	func testOptInIsPerEntity_theOtherFollowedTeamStaysSilent() {
		let output = plan(
			previous: seededPrevious,
			new: RecentResults(football: [brannResult(hoursAgo: 30), lynResult(), brannResult(hoursAgo: 1)]),
			optedIn: ["fk-lyn-oslo"]
		)
		XCTAssertEqual(output.alerts.map(\.title), ["Fulltid: Lyn – Sogndal"])
	}

	// MARK: - (b) SPOILERVERNET

	func testSpoilerShieldedEntity_alertsWithoutRevealingTheScore() {
		let output = plan(
			previous: seededPrevious,
			new: RecentResults(football: [brannResult(hoursAgo: 30), lynResult()]),
			optedIn: ["fk-lyn-oslo"],
			shield: SpoilerShield(sports: [], entityIds: ["fk-lyn-oslo"])
		)

		XCTAssertEqual(output.alerts.count, 1)
		let body = output.alerts[0].body
		XCTAssertEqual(body, "Resultatet er klart. Åpne når du vil se det.")
		XCTAssertFalse(body.contains("2–1"), "a user with spoiler protection must never read the score on the lock screen")
		XCTAssertFalse(output.alerts[0].title.contains("2–1"))
	}

	func testSpoilerShieldedSport_removesTheWidgetLineEntirely() {
		let output = plan(
			previous: seededPrevious,
			new: RecentResults(football: [lynResult()]),
			optedIn: [],
			shield: SpoilerShield(sports: ["football"], entityIds: [])
		)
		XCTAssertFalse(output.snapshot.hasResult, "the home screen shows nothing rather than a shielded score")
	}

	// MARK: - (c) FÅ: dedupe, seeding, recency, cap

	func testResultAlreadyPresentBeforeTheSync_isNotAnAlert() {
		let existing = RecentResults(football: [brannResult(hoursAgo: 30), lynResult()])
		let output = plan(previous: existing, new: existing, optedIn: ["fk-lyn-oslo"])
		XCTAssertTrue(output.alerts.isEmpty, "only a NEW result is news")
	}

	func testAlreadyDeliveredResult_isNeverRepeated() {
		let new = RecentResults(football: [brannResult(hoursAgo: 30), lynResult()])
		let first = plan(previous: seededPrevious, new: new, optedIn: ["fk-lyn-oslo"])
		XCTAssertEqual(first.alerts.count, 1)

		// The same result re-appearing (an upstream hiccup dropped and re-added it)
		// must not buzz a second time — that is what the ledger is for.
		let second = plan(previous: seededPrevious, new: new, optedIn: ["fk-lyn-oslo"],
		                  delivered: Set(first.alerts.map(\.id)))
		XCTAssertTrue(second.alerts.isEmpty)
	}

	func testSeedingSync_emptyPreviousSnapshot_neverAlerts() {
		let output = plan(
			previous: RecentResults(),
			new: RecentResults(football: [lynResult(), brannResult()]),
			optedIn: ["fk-lyn-oslo", "sk-brann"]
		)
		XCTAssertTrue(output.alerts.isEmpty, "a fresh install must not open with a burst of notifications")
		XCTAssertTrue(output.snapshot.hasResult, "the widget line is still rendered — it is not a notification")
	}

	func testOldResult_outsideTheRecencyWindow_isHistoryNotNews() {
		let output = plan(
			previous: seededPrevious,
			new: RecentResults(football: [brannResult(hoursAgo: 30), lynResult(hoursAgo: 20)]),
			optedIn: ["fk-lyn-oslo"]
		)
		XCTAssertTrue(output.alerts.isEmpty)
	}

	func testRecencyWindowBoundaries() {
		XCTAssertTrue(ResultDigest.isRecent(now.addingTimeInterval(-11 * 3600), now: now))
		XCTAssertFalse(ResultDigest.isRecent(now.addingTimeInterval(-13 * 3600), now: now))
		XCTAssertFalse(ResultDigest.isRecent(now.addingTimeInterval(3600), now: now), "a future kickoff is not a result")
		XCTAssertTrue(ResultDigest.isRecent(nil, now: now), "an undated result is judged by its id being new")
	}

	func testAlertsAreCapped_andNewestFirst() {
		let matches = (1...5).map { i in
			FootballResult(homeTeam: "Lyn", awayTeam: "Motstander \(i)", homeScore: i, awayScore: 0,
			               date: now.addingTimeInterval(-Double(i) * 3600), league: "OBOS-ligaen")
		}
		let output = plan(previous: seededPrevious, new: RecentResults(football: matches), optedIn: ["fk-lyn-oslo"])

		XCTAssertEqual(output.alerts.count, ResultDigest.maxAlerts, "a busy weekend must not become a buzz storm")
		XCTAssertEqual(output.alerts.map(\.title), [
			"Fulltid: Lyn – Motstander 1",
			"Fulltid: Lyn – Motstander 2",
			"Fulltid: Lyn – Motstander 3",
		])
	}

	func testMatchWithoutAScore_isNotAFinishedContest() {
		let noScore = FootballResult(homeTeam: "Lyn", awayTeam: "Sogndal", homeScore: nil, awayScore: nil,
		                             date: now.addingTimeInterval(-3600), league: "OBOS-ligaen")
		let output = plan(previous: seededPrevious, new: RecentResults(football: [noScore]), optedIn: ["fk-lyn-oslo"])
		XCTAssertTrue(output.alerts.isEmpty)
	}

	func testUnfollowedTeamsResult_isNeitherAlertNorWidgetLine() {
		let stranger = FootballResult(homeTeam: "Vålerenga", awayTeam: "Odd", homeScore: 1, awayScore: 1,
		                              date: now.addingTimeInterval(-3600), league: "Eliteserien")
		let output = plan(previous: seededPrevious, new: RecentResults(football: [stranger]), optedIn: ["fk-lyn-oslo"])
		XCTAssertTrue(output.alerts.isEmpty)
		XCTAssertFalse(output.snapshot.hasResult)
	}

	// MARK: - Sport-appropriate wording

	func testHeadlineWord_matchesTheSport() {
		XCTAssertEqual(ResultDigest.headline(sport: "football"), "Fulltid")
		XCTAssertEqual(ResultDigest.headline(sport: "tennis"), "Fulltid")
		XCTAssertEqual(ResultDigest.headline(sport: "golf"), "Ferdig", "a golf tournament has no «fulltid»")
		XCTAssertEqual(ResultDigest.headline(sport: "f1"), "Ferdig")
	}

	// MARK: - The widget's «siste resultat»-linje

	func testWidgetSnapshot_isTheNewestSafeResult() {
		let output = plan(
			previous: seededPrevious,
			new: RecentResults(football: [brannResult(hoursAgo: 5), lynResult(hoursAgo: 1)]),
			optedIn: []
		)
		XCTAssertEqual(output.snapshot.line, "Lyn – Sogndal 2–1")
		XCTAssertEqual(output.snapshot.meta, "OBOS-ligaen")
		XCTAssertEqual(output.snapshot.generatedAt, now)
	}

	func testWidgetSnapshot_isIndependentOfTheAlertOptIn() {
		// The widget mirrors what the app's own RESULTAT section already shows for
		// what you follow — the opt-in governs NOTIFICATIONS, not the board.
		let output = plan(previous: seededPrevious, new: RecentResults(football: [lynResult()]), optedIn: [])
		XCTAssertTrue(output.snapshot.hasResult)
	}

	func testWidgetSnapshot_emptyWhenNothingFollowedFinished() {
		let output = plan(previous: seededPrevious, new: RecentResults(), optedIn: ["fk-lyn-oslo"])
		XCTAssertEqual(output.snapshot, .empty)
	}
}
