//
//  ResultAlertPreferenceTests.swift
//  SportivistaTests
//
//  WP-176 — the opt-in store. Driven through a throwaway UserDefaults suite so
//  the real `.standard` is never touched.
//

import XCTest

final class ResultAlertPreferenceTests: XCTestCase {

	private var defaults: UserDefaults!
	private let suiteName = "sportivista.tests.resultalerts"

	override func setUp() {
		super.setUp()
		UserDefaults().removePersistentDomain(forName: suiteName)
		defaults = UserDefaults(suiteName: suiteName)
	}

	override func tearDown() {
		UserDefaults().removePersistentDomain(forName: suiteName)
		defaults = nil
		super.tearDown()
	}

	func testDefaultIsOff_forEveryEntity() {
		XCTAssertTrue(ResultAlertPreference.optedInEntityIds(defaults).isEmpty)
		XCTAssertFalse(ResultAlertPreference.isEnabled(entityId: "fk-lyn-oslo", defaults))
	}

	func testOptInIsPerEntity_andReversible() {
		ResultAlertPreference.setEnabled(true, entityId: "fk-lyn-oslo", defaults)
		XCTAssertTrue(ResultAlertPreference.isEnabled(entityId: "fk-lyn-oslo", defaults))
		XCTAssertFalse(ResultAlertPreference.isEnabled(entityId: "sk-brann", defaults),
		               "turning one entity on must never turn on the rest")

		ResultAlertPreference.setEnabled(false, entityId: "fk-lyn-oslo", defaults)
		XCTAssertFalse(ResultAlertPreference.isEnabled(entityId: "fk-lyn-oslo", defaults))
	}

	func testStoredValueIsStable_noChurnFromSetOrdering() {
		ResultAlertPreference.setEnabled(true, entityId: "sk-brann", defaults)
		ResultAlertPreference.setEnabled(true, entityId: "fk-lyn-oslo", defaults)
		XCTAssertEqual(defaults.stringArray(forKey: ResultAlertPreference.optInKey), ["fk-lyn-oslo", "sk-brann"])
	}

	func testEmptyEntityIdIsIgnored() {
		ResultAlertPreference.setEnabled(true, entityId: "", defaults)
		XCTAssertTrue(ResultAlertPreference.optedInEntityIds(defaults).isEmpty)
	}

	// MARK: - Delivered ledger

	func testLedgerRecordsWithoutDuplicates() {
		ResultAlertPreference.markDelivered(["a", "b"], defaults)
		ResultAlertPreference.markDelivered(["b", "c"], defaults)
		XCTAssertEqual(ResultAlertPreference.deliveredIds(defaults), ["a", "b", "c"])
	}

	func testLedgerIsBounded_keepingTheNewest() {
		let ids = (0..<(ResultAlertPreference.ledgerLimit + 10)).map { "id-\($0)" }
		ResultAlertPreference.markDelivered(ids, defaults)
		let ledger = ResultAlertPreference.deliveredIds(defaults)
		XCTAssertEqual(ledger.count, ResultAlertPreference.ledgerLimit, "a ledger, not a history")
		XCTAssertEqual(ledger.last, ids.last)
		XCTAssertFalse(ledger.contains("id-0"))
	}

	func testMarkingNothingIsANoOp() {
		ResultAlertPreference.markDelivered([], defaults)
		XCTAssertTrue(ResultAlertPreference.deliveredIds(defaults).isEmpty)
	}
}
