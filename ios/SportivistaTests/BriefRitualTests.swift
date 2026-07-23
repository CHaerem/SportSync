//
//  BriefRitualTests.swift
//  SportivistaTests
//
//  WP-181 — the Oslo wall-clock boundary that names the brief ritual. Pins the
//  split at 15:00 Oslo and proves it is TIME-ZONE correct in both summer (CEST)
//  and winter (CET), so «Morgenbriefen»/«Kveldsbriefen» flip at the same
//  Norwegian moment the web twin (shared-constants.js `ssBriefRitualName`) does.
//

import XCTest

final class BriefRitualTests: XCTestCase {
	private let iso = ISO8601DateFormatter()
	private func at(_ s: String) -> Date { iso.date(from: s)! }

	func test_boundary_isFifteenOsloInSummer() {
		// July = CEST (UTC+2): 15:00 Oslo = 13:00Z.
		XCTAssertEqual(BriefRitual.phase(at: at("2026-07-20T10:00:00Z")), .morning) // Oslo 12:00
		XCTAssertEqual(BriefRitual.phase(at: at("2026-07-20T12:59:00Z")), .morning) // Oslo 14:59
		XCTAssertEqual(BriefRitual.phase(at: at("2026-07-20T13:00:00Z")), .evening) // Oslo 15:00
		XCTAssertEqual(BriefRitual.phase(at: at("2026-07-20T20:00:00Z")), .evening) // Oslo 22:00
	}

	func test_boundary_isFifteenOsloInWinter() {
		// January = CET (UTC+1): 15:00 Oslo = 14:00Z.
		XCTAssertEqual(BriefRitual.phase(at: at("2026-01-15T13:59:00Z")), .morning) // Oslo 14:59
		XCTAssertEqual(BriefRitual.phase(at: at("2026-01-15T14:00:00Z")), .evening) // Oslo 15:00
	}

	func test_names_areBestemtForm() {
		XCTAssertEqual(BriefRitual.name(at: at("2026-07-20T05:00:00Z")), "Morgenbriefen") // Oslo 07:00
		XCTAssertEqual(BriefRitual.name(at: at("2026-07-20T16:00:00Z")), "Kveldsbriefen") // Oslo 18:00
	}
}
