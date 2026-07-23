//
//  BriefNotificationPlannerTests.swift
//  SportivistaTests
//
//  WP-181 — the daily brief ritual ping. Follows the NotificationPlanner test
//  pattern: the pure `plan(enabled:)` is asserted directly, and `reconcile` is
//  driven against a RecordingNotificationScheduler (no real
//  UNUserNotificationCenter, no OS permission prompt). Proves the three things
//  the acceptance calls for — planlegging, avmelding, and GENERISK tekst.
//

import XCTest

final class BriefNotificationPlannerTests: XCTestCase {

	// MARK: - Pure plan

	func test_plan_enabled_schedulesTheRepeatingPing() {
		let plan = BriefNotificationPlanner.plan(enabled: true)
		guard case .schedule(let request) = plan else { return XCTFail("enabled ⇒ schedule") }
		XCTAssertEqual(request.id, BriefNotificationPlanner.identifier)
		XCTAssertEqual(request.hour, 6)
		XCTAssertEqual(request.minute, 45, "fires 06:45 Oslo — after the 06:30 morning editorial (WP-173)")
		XCTAssertEqual(request.timeZoneIdentifier, "Europe/Oslo")
	}

	func test_plan_disabled_cancels() {
		XCTAssertEqual(BriefNotificationPlanner.plan(enabled: false), .cancel(id: BriefNotificationPlanner.identifier))
	}

	// MARK: - Generic, spoiler-free text (BINDING)

	func test_text_isFixedGenericAndCarriesNoResult() {
		let request = BriefNotificationPlanner.request
		XCTAssertEqual(request.title, "Morgenbriefen er klar")
		XCTAssertEqual(request.body, "Åpne når du vil.")
		// The whole point: the ping can never be a spoiler — no digits (a score),
		// no «–» / «vs» matchup, ever, in either line.
		let text = request.title + " " + request.body
		XCTAssertNil(text.rangeOfCharacter(from: .decimalDigits), "the ping text carries no numbers — never a score")
		XCTAssertFalse(text.contains("–"))
	}

	// MARK: - Reconcile (impure, against a recording scheduler)

	func test_reconcile_enabled_requestsPermissionThenSchedulesDaily() async {
		let scheduler = RecordingNotificationScheduler()
		let planner = BriefNotificationPlanner(scheduler: scheduler)

		await planner.reconcile(enabled: true)

		XCTAssertEqual(scheduler.authorizationRequestCount, 1, "enabling asks for permission (user-initiated)")
		XCTAssertEqual(scheduler.scheduledDailyRequests.map(\.id), [BriefNotificationPlanner.identifier])
		XCTAssertTrue(scheduler.cancelledIDs.isEmpty)
	}

	func test_reconcile_disabled_cancels_withoutPrompting() async {
		let scheduler = RecordingNotificationScheduler()
		let planner = BriefNotificationPlanner(scheduler: scheduler)

		await planner.reconcile(enabled: false)

		XCTAssertEqual(scheduler.authorizationRequestCount, 0, "turning it off never prompts")
		XCTAssertEqual(scheduler.cancelledIDs, [BriefNotificationPlanner.identifier])
		XCTAssertTrue(scheduler.scheduledDailyRequests.isEmpty)
	}

	func test_reconcile_enabled_butPermissionDenied_schedulesNothing() async {
		let scheduler = RecordingNotificationScheduler()
		scheduler.authorizationResult = false
		let planner = BriefNotificationPlanner(scheduler: scheduler)

		await planner.reconcile(enabled: true)

		XCTAssertEqual(scheduler.authorizationRequestCount, 1)
		XCTAssertTrue(scheduler.scheduledDailyRequests.isEmpty, "denied permission ⇒ no ping scheduled")
	}

	// MARK: - Preference (opt-in, per-device)

	func test_preference_defaultsOff_andRoundTrips() {
		let defaults = UserDefaults(suiteName: "wp181-\(UUID().uuidString)")!
		XCTAssertFalse(BriefAlertPreference.isEnabled(defaults), "AV som default (opt-in)")
		BriefAlertPreference.setEnabled(true, defaults)
		XCTAssertTrue(BriefAlertPreference.isEnabled(defaults))
		BriefAlertPreference.setEnabled(false, defaults)
		XCTAssertFalse(BriefAlertPreference.isEnabled(defaults))
	}
}
