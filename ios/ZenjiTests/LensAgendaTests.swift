//
//  LensAgendaTests.swift
//  ZenjiTests
//
//  WP-18 — the lens layer INTEGRATED into the agenda pipeline
//  (`AgendaViewModel.buildSections`): a followed rule carrying a
//  `.throughNorwegians` / `.throughAthletes` lens turns a golf tournament into
//  athlete-centred rows, the tee time overriding the event time for the time
//  column, day-grouping AND sort. Also proves the two degradation guarantees:
//  a `.sportAsSuch` (default-lens) profile and an event the lens doesn't match
//  leave the agenda BYTE-IDENTICAL to the no-profile output.
//

import XCTest

final class LensAgendaTests: XCTestCase {

	private func iso(_ s: String) -> Date {
		let f = ISO8601DateFormatter()
		f.formatOptions = [.withInternetDateTime]
		return f.date(from: s)!
	}

	private func allEventRows(_ sections: [AgendaSection]) -> [AgendaEventRow] {
		sections.flatMap { $0.items }.compactMap { if case .event(let r) = $0 { return r } else { return nil } }
	}

	private func golfRule(entityName: String, sport: String = "golf", lens: Lens) -> InterestProfile {
		InterestProfile(rules: [InterestRule(
			entityId: entityName.lowercased().replacingOccurrences(of: " ", with: "-"),
			entityName: entityName, sport: sport, weight: 0.5,
			reason: "Test-regel", addedAt: iso("2026-07-01T00:00:00Z"), lens: lens
		)])
	}

	// The Open (Thu–Sun) with Hovland + Reitan, distinct tee times.
	private func openEvent() -> Event {
		EventBuilder.make(
			sport: "golf", title: "The Open", time: "2026-07-16T04:00:00Z",
			endTime: "2026-07-19T20:00:00Z", tournament: "PGA Tour",
			streaming: [["platform": "TV 2 Play"]], norwegian: true,
			norwegianPlayers: [
				["name": "Kristoffer Reitan", "teeTimeUTC": "2026-07-16T12:32:00Z", "entityId": "kristoffer-reitan"],
				["name": "Viktor Hovland", "teeTimeUTC": "2026-07-16T13:10:00Z", "entityId": "viktor-hovland"],
			]
		)
	}

	// MARK: - Two followed golfers → two athlete rows, each with its tee time

	func testThroughNorwegians_twoGolfers_twoRowsWithTeeTimeAsEffectiveTime() {
		let now = iso("2026-07-16T06:00:00Z") // Thu, Oslo 08:00 — the tournament is under way
		let interests = Interests(followBroadly: ["golf"])
		let profile = golfRule(entityName: "The Open", lens: .throughNorwegians)

		let sections = AgendaViewModel.buildSections(
			events: [openEvent()], interests: interests, now: now,
			index: EntityIndex([]), followedIds: [], profile: profile
		)
		let rows = allEventRows(sections)
		XCTAssertEqual(rows.count, 2, "the single golf event renders as two athlete rows")

		// Both tee off today (Oslo 14:32 / 15:10 on 16 July) → both under I DAG,
		// sorted by tee time. The tee time OVERRIDES the multi-day window in the
		// time column (P320).
		XCTAssertEqual(sections.count, 1)
		XCTAssertEqual(sections[0].label, "I DAG")
		XCTAssertEqual(rows[0].timeLabel, "14:32")
		XCTAssertTrue(rows[0].title.contains("Reitan teer av"))
		XCTAssertEqual(rows[1].timeLabel, "15:10")
		XCTAssertTrue(rows[1].title.contains("Hovland teer av"))

		// Lens rows inherit the event's accent/bell (item 2 of the brief): the
		// event is Norwegian golf, so it earns the must-see accent.
		XCTAssertTrue(rows[0].isMustSee)
		XCTAssertTrue(rows[1].isMustSee)
		// The channel (where-to-watch) is the event's, unchanged.
		XCTAssertEqual(rows[0].channelLabel, "TV 2 Play")
		// The detail sheet still sees the WHOLE event, not the lens title.
		XCTAssertEqual(rows[0].event.title, "The Open")
	}

	// MARK: - Tee time overrides the DAY, not just the display

	func testThroughNorwegians_teeTimeTomorrow_movesRowToItsOwnDay() {
		// now = Wed; the tournament starts today, but Reitan's stored tee time is
		// Thursday. His lens row must land under I MORGEN (its tee day), proving
		// the effective time overrides day-grouping too.
		let now = iso("2026-07-15T06:00:00Z") // Wed
		let event = EventBuilder.make(
			sport: "golf", title: "The Open", time: "2026-07-15T04:00:00Z",
			endTime: "2026-07-18T20:00:00Z", norwegian: true,
			norwegianPlayers: [["name": "Kristoffer Reitan", "teeTimeUTC": "2026-07-16T12:32:00Z", "entityId": "kristoffer-reitan"]]
		)
		let sections = AgendaViewModel.buildSections(
			events: [event], interests: Interests(followBroadly: ["golf"]), now: now,
			index: EntityIndex([]), followedIds: [], profile: golfRule(entityName: "The Open", lens: .throughNorwegians)
		)
		XCTAssertEqual(sections.count, 1)
		XCTAssertEqual(sections[0].id, "2026-07-16", "the row re-homes to the tee-time day")
		XCTAssertEqual(sections[0].label, "I MORGEN")
		XCTAssertEqual(allEventRows(sections).first?.timeLabel, "14:32")
	}

	// MARK: - Untimed golfer → event window kept, name in meta

	func testThroughNorwegians_noTeeTimes_keepsWindowAndNamesInMeta() {
		let now = iso("2026-07-16T06:00:00Z")
		let event = EventBuilder.make(
			sport: "golf", title: "The Open", time: "2026-07-16T04:00:00Z",
			endTime: "2026-07-19T20:00:00Z", norwegian: true,
			norwegianPlayers: [
				["name": "Viktor Hovland", "entityId": "viktor-hovland"],
				["name": "Kristoffer Reitan", "entityId": "kristoffer-reitan"],
			]
		)
		let sections = AgendaViewModel.buildSections(
			events: [event], interests: Interests(followBroadly: ["golf"]), now: now,
			index: EntityIndex([]), followedIds: [], profile: golfRule(entityName: "The Open", lens: .throughNorwegians)
		)
		let rows = allEventRows(sections)
		XCTAssertEqual(rows.count, 1, "untimed golfers collapse to one calm row")
		XCTAssertEqual(rows[0].timeLabel, "16.–19. juli", "the event window is kept — no fabricated tee time")
		XCTAssertEqual(rows[0].title, "The Open")
		XCTAssertEqual(rows[0].metaLabel, "Hovland · Reitan", "the followed names are surfaced in the meta")
	}

	// MARK: - throughAthletes narrows to the chosen athlete

	func testThroughAthletes_rendersOnlyTheFocusedAthlete() {
		let now = iso("2026-07-16T06:00:00Z")
		let profile = InterestProfile(rules: [InterestRule(
			entityId: "the-open", entityName: "The Open", sport: "golf", weight: 0.5,
			reason: "Test", addedAt: iso("2026-07-01T00:00:00Z"),
			lens: .throughAthletes([LensAthlete(entityId: "viktor-hovland", name: "Viktor Hovland")])
		)])
		let sections = AgendaViewModel.buildSections(
			events: [openEvent()], interests: Interests(followBroadly: ["golf"]), now: now,
			index: EntityIndex([]), followedIds: [], profile: profile
		)
		let rows = allEventRows(sections)
		XCTAssertEqual(rows.count, 1)
		XCTAssertTrue(rows[0].title.contains("Hovland teer av"))
		XCTAssertFalse(rows.contains { $0.title.contains("Reitan") })
	}

	// MARK: - Graceful degradation: default lens is byte-identical to no profile

	func testDefaultLensProfile_isIdenticalToNoProfile() {
		let now = iso("2026-07-16T06:00:00Z")
		let events = [openEvent()]
		let interests = Interests(followBroadly: ["golf"])

		let baseline = AgendaViewModel.buildSections(events: events, interests: interests, now: now)
		let withDefaultLens = AgendaViewModel.buildSections(
			events: events, interests: interests, now: now,
			index: EntityIndex([]), followedIds: [],
			profile: golfRule(entityName: "The Open", lens: .sportAsSuch)
		)
		XCTAssertEqual(withDefaultLens, baseline, "a .sportAsSuch (default) lens must not change rendering")
	}

	// MARK: - Graceful degradation: a lens on another sport leaves this one alone

	func testLensOnAnotherSport_leavesUnmatchedEventsIdentical() {
		let now = iso("2026-07-16T06:00:00Z")
		let footy = EventBuilder.make(
			sport: "football", title: "Lyn – Fram", time: "2026-07-16T18:00:00Z",
			homeTeam: "Lyn", awayTeam: "Fram", streaming: [["platform": "TV 2 Play"]]
		)
		let interests = Interests(followBroadly: ["football"])

		let baseline = AgendaViewModel.buildSections(events: [footy], interests: interests, now: now)
		let withGolfLens = AgendaViewModel.buildSections(
			events: [footy], interests: interests, now: now,
			index: EntityIndex([]), followedIds: [],
			profile: golfRule(entityName: "The Open", lens: .throughNorwegians)
		)
		XCTAssertEqual(withGolfLens, baseline, "a golf lens must not touch a football row")
	}

	// MARK: - A sport with no per-athlete timing degrades (no lens rows, no crash)

	func testNonGolfEventUnderNorwegianLens_staysAnOrdinaryRow() {
		let now = iso("2026-07-16T06:00:00Z")
		// A chess event tracked as Norwegian, with a throughNorwegians lens whose
		// rule matches by name — but there is no per-athlete tee-time data, so it
		// must stay exactly one ordinary row (graceful degradation).
		let chess = EventBuilder.make(
			sport: "chess", title: "Sjakk-NM 2026", time: "2026-07-16T16:00:00Z",
			norwegian: true
		)
		let sections = AgendaViewModel.buildSections(
			events: [chess], interests: Interests(followBroadly: ["chess"]), now: now,
			index: EntityIndex([]), followedIds: [],
			profile: golfRule(entityName: "Sjakk-NM 2026", sport: "chess", lens: .throughNorwegians)
		)
		let rows = allEventRows(sections)
		XCTAssertEqual(rows.count, 1)
		XCTAssertEqual(rows[0].title, "Sjakk-NM 2026", "no participation data → the ordinary row is untouched")
	}
}
