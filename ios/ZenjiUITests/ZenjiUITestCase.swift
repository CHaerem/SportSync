//
//  ZenjiUITestCase.swift
//  ZenjiUITests
//
//  WP-70 — shared scaffolding for the XCUITest suite. Every flow launches the
//  app against the deterministic `ZENJI_DEMO=uitest` harness (UITestSeed in the
//  app target): a mock assistant + a seeded cache + no network, so the flows are
//  stable in the Simulator regardless of Apple Intelligence or live data.
//
//  Robustness rules (per the WP-70 brief): NO sleep-based waits — everything
//  hangs off `waitForExistence` / predicate expectations with a generous
//  timeout, because 3 other agents may be running xcodebuild on the same Mac and
//  slow simulator boots make UI tests especially load-sensitive. Flows are kept
//  short and deterministic.
//

import XCTest

/// Values the seed and the tests MUST agree on — imported here as plain
/// constants (the UI-test bundle can't `@testable import` the app) so a drift
/// between the seed's titles and the test's assertions is a compile-time-visible
/// single source of truth in one file.
enum UITestFixture {
	static let footballTitle = "Lyn mot Sogndal"
	static let biathlonTitle = "Skiskyting verdenscup: sprint"
	/// The whole-sport utterance the follow flow types. Deliberately ASCII-only
	/// ("skiskyting", not "følg skiskyting"): XCUITest `typeText` is flaky with
	/// non-ASCII (æ/ø/å) under the Simulator keyboard, and the mock parser grounds
	/// a bare sport/alias word to the same biathlon following as the verb phrase
	/// would — so the flow is identical in effect but keyboard-deterministic.
	static let followUtterance = "skiskyting"
	static let biathlonEntityName = "Skiskyting verdenscup"
}

class ZenjiUITestCase: XCTestCase {

	/// A single generous timeout for existence waits. Sized for a heavily loaded
	/// build machine (parallel xcodebuilds), not tuned tight — a UI test that
	/// fails must fail on BEHAVIOUR, never on a too-short deadline.
	let timeout: TimeInterval = 45

	override func setUp() {
		super.setUp()
		// A failing assertion should stop the flow immediately — a half-driven UI
		// produces misleading cascade failures otherwise.
		continueAfterFailure = false
	}

	/// Launch the app in a known state. `state` maps to `ZENJI_UITEST_STATE`:
	/// "onboarding" (clean slate → first-run overlay) or "agenda" (seeded board).
	func launchApp(state: String) -> XCUIApplication {
		let app = XCUIApplication()
		app.launchEnvironment["ZENJI_DEMO"] = "uitest"
		app.launchEnvironment["ZENJI_UITEST_STATE"] = state
		app.launch()
		return app
	}

	// MARK: - Wait helpers (no sleeps)

	/// Assert an element exists within `timeout`, with a readable failure message.
	@discardableResult
	func assertExists(_ element: XCUIElement, _ message: String, file: StaticString = #filePath, line: UInt = #line) -> Bool {
		let ok = element.waitForExistence(timeout: timeout)
		XCTAssertTrue(ok, message, file: file, line: line)
		return ok
	}

	/// Wait until an element's `label` equals `expected` (used for the theme
	/// toggle, whose accessibility label cycles). Predicate-based, no polling loop.
	func waitForLabel(_ element: XCUIElement, equals expected: String, file: StaticString = #filePath, line: UInt = #line) {
		let predicate = NSPredicate(format: "label == %@", expected)
		let exp = expectation(for: predicate, evaluatedWith: element)
		let result = XCTWaiter().wait(for: [exp], timeout: timeout)
		XCTAssertEqual(result, .completed, "Expected label «\(expected)», got «\(element.label)»", file: file, line: line)
	}

	/// The first staticText whose label CONTAINS `substring` — for labels that
	/// carry a variable tail (e.g. the "· varsler deg før start" suffix).
	func staticText(containing substring: String, in app: XCUIApplication) -> XCUIElement {
		app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", substring)).firstMatch
	}

	/// An agenda row, queried by the row Button's own accessibility label.
	/// WP-81 turned each agenda row into a `Button` (native pressed-state +
	/// button role), so its child Texts are combined into the button's label and
	/// are no longer exposed as separate `staticTexts`; the row is addressed by
	/// the (combined) button label that contains its title.
	func agendaRow(_ title: String, in app: XCUIApplication) -> XCUIElement {
		app.buttons.matching(NSPredicate(format: "label CONTAINS %@", title)).firstMatch
	}

	/// Scroll the app up until `element` is hittable (or a bounded number of
	/// swipes elapse). Reveals a foot-of-panel control without a sleep.
	func scrollUntilHittable(_ element: XCUIElement, in app: XCUIApplication, maxSwipes: Int = 6) {
		var swipes = 0
		while !element.isHittable && swipes < maxSwipes {
			app.swipeUp()
			swipes += 1
		}
	}
}
