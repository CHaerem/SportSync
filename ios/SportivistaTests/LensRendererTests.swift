//
//  LensRendererTests.swift
//  SportivistaTests
//
//  WP-18 — the pure lens-rendering layer (P320: event × deltakelse × linse).
//  Drives `LensRenderer.render` directly with hand-built golf events, proving:
//  each followed athlete's tee time becomes the row's effective time; an
//  athlete without a tee time keeps the event time and is surfaced by name; the
//  default lens and a lens with no matching participation both degrade
//  gracefully (nil → the caller keeps the ordinary row); and status is surfaced
//  verbatim, never parsed or invented.
//

import XCTest

final class LensRendererTests: XCTestCase {

	private func iso(_ s: String) -> Date {
		let f = ISO8601DateFormatter()
		f.formatOptions = [.withInternetDateTime]
		return f.date(from: s)!
	}

	// A multi-day golf tournament with two followed Norwegians, each with a
	// distinct tee time (12:32Z → 14:32 Oslo, 13:10Z → 15:10 Oslo).
	private func openWithTwoTeeTimes() -> Event {
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

	// MARK: - throughNorwegians with tee times → one row per athlete

	func testThroughNorwegians_twoTeeTimes_twoRowsEachWithOwnEffectiveTime() {
		let rows = LensRenderer.render(event: openWithTwoTeeTimes(), mode: .throughNorwegians, followedIds: [])
		let unwrapped = try! XCTUnwrap(rows)
		XCTAssertEqual(unwrapped.count, 2, "two distinct tee times → two lens rows")

		// Sorted by effective time: Reitan (12:32Z) before Hovland (13:10Z).
		XCTAssertEqual(unwrapped[0].athleteNames, ["Reitan"])
		XCTAssertEqual(unwrapped[0].effectiveTime, iso("2026-07-16T12:32:00Z"))
		XCTAssertTrue(unwrapped[0].title.contains("Reitan teer av"), "athlete-perspective title")
		XCTAssertTrue(unwrapped[0].title.contains("The Open"), "keeps the event name for recognition")

		XCTAssertEqual(unwrapped[1].athleteNames, ["Hovland"])
		XCTAssertEqual(unwrapped[1].effectiveTime, iso("2026-07-16T13:10:00Z"))

		// The two rows carry distinct, stable ids (so SwiftUI diffing works).
		XCTAssertNotEqual(unwrapped[0].idSuffix, unwrapped[1].idSuffix)
	}

	// MARK: - Athlete without a tee time → event time kept + name in meta

	func testThroughNorwegians_noTeeTime_keepsEventTimeAndNamesInMeta() {
		let event = EventBuilder.make(
			sport: "golf", title: "The Open", time: "2026-07-16T04:00:00Z",
			endTime: "2026-07-19T20:00:00Z", tournament: "PGA Tour", norwegian: true,
			norwegianPlayers: [["name": "Viktor Hovland", "entityId": "viktor-hovland"]]
		)
		let rows = try! XCTUnwrap(LensRenderer.render(event: event, mode: .throughNorwegians, followedIds: []))
		XCTAssertEqual(rows.count, 1)
		XCTAssertNil(rows[0].effectiveTime, "no tee time → NEVER a fabricated clock; the event time is kept")
		XCTAssertEqual(rows[0].title, "The Open", "the untimed degradation keeps the event's own title")
		XCTAssertEqual(rows[0].metaDetail, "Hovland", "the followed name is surfaced in the meta line")
	}

	func testThroughNorwegians_multipleUntimed_collapseToOneRowWithNamesInMeta() {
		let event = EventBuilder.make(
			sport: "golf", title: "The Open", time: "2026-07-16T04:00:00Z",
			endTime: "2026-07-19T20:00:00Z", norwegian: true,
			norwegianPlayers: [
				["name": "Viktor Hovland", "entityId": "viktor-hovland"],
				["name": "Kristoffer Reitan", "entityId": "kristoffer-reitan"],
			]
		)
		let rows = try! XCTUnwrap(LensRenderer.render(event: event, mode: .throughNorwegians, followedIds: []))
		XCTAssertEqual(rows.count, 1, "untimed athletes collapse into ONE calm row, not one per name")
		XCTAssertNil(rows[0].effectiveTime)
		XCTAssertEqual(rows[0].metaDetail, "Hovland · Reitan", "both names in the meta, surname-forward, alphabetised")
	}

	// MARK: - Status surfaced verbatim (never parsed / invented)

	func testTimedRow_statusSurfacedVerbatimInMeta() {
		let event = EventBuilder.make(
			sport: "golf", title: "Wyndham Championship", time: "2026-07-16T04:00:00Z",
			endTime: "2026-07-19T20:00:00Z", norwegian: true,
			norwegianPlayers: [[
				"name": "Kristoffer Reitan", "teeTimeUTC": "2026-07-16T12:32:00Z",
				"status": "R2 · −4 · T12", "entityId": "kristoffer-reitan",
			]]
		)
		let rows = try! XCTUnwrap(LensRenderer.render(event: event, mode: .throughNorwegians, followedIds: []))
		XCTAssertEqual(rows.count, 1)
		XCTAssertEqual(rows[0].metaDetail, "R2 · −4 · T12", "the player status is shown exactly as the data gave it")
	}

	// MARK: - throughAthletes focuses only the named athletes

	func testThroughAthletes_focusesOnlyTheChosenAthlete() {
		let mode = LensMode.throughAthletes(ids: ["kristoffer-reitan"], names: ["Kristoffer Reitan"])
		let rows = try! XCTUnwrap(LensRenderer.render(event: openWithTwoTeeTimes(), mode: mode, followedIds: []))
		XCTAssertEqual(rows.count, 1, "only the focused athlete produces a row")
		XCTAssertEqual(rows[0].athleteNames, ["Reitan"])
	}

	// MARK: - Graceful degradation

	func testDefaultLens_returnsNil() {
		XCTAssertNil(LensRenderer.render(event: openWithTwoTeeTimes(), mode: .sportAsSuch, followedIds: []),
					 "the default lens does not render — the ordinary row stands")
	}

	func testNoParticipationData_returnsNil() {
		// A football match has no per-athlete participation to render through —
		// a throughNorwegians lens must degrade gracefully (nil), never disturb it.
		let footy = EventBuilder.make(
			sport: "football", title: "Lyn – Fram", time: "2026-07-16T18:00:00Z",
			homeTeam: "Lyn", awayTeam: "Fram"
		)
		XCTAssertNil(LensRenderer.render(event: footy, mode: .throughNorwegians, followedIds: []))
	}

	func testThroughAthletes_noMatch_returnsNil() {
		let mode = LensMode.throughAthletes(ids: ["casper-ruud"], names: ["Casper Ruud"])
		XCTAssertNil(LensRenderer.render(event: openWithTwoTeeTimes(), mode: mode, followedIds: []),
					 "an athlete who isn't in the event yields no lens row")
	}

	// MARK: - Surname helper

	func testSurname_takesLastComponent() {
		XCTAssertEqual(LensRenderer.surname("Viktor Hovland"), "Hovland")
		XCTAssertEqual(LensRenderer.surname("Kristoffer Reitan"), "Reitan")
		XCTAssertEqual(LensRenderer.surname("Madonna"), "Madonna")
	}
}
