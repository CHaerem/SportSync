//
//  NewsBoardUITests.swift
//  SportivistaUITests
//
//  WP-106 — UI smoke for the Nyheter board: switch the root segmented control
//  to «Nyheter» and confirm the board renders (the NYTT section header + the
//  quiet «Det du følger» link atop it). In its own file (not WP-104's
//  MainFlowsUITests) so parallel waves never touch the same file. Runs against
//  the deterministic uitest harness (a seeded FK Lyn Oslo follow, no network).
//

import XCTest

final class NewsBoardUITests: SportivistaUITestCase {

	func testSwitchToNyheterShowsBoard() {
		let app = launchApp(state: "agenda")

		// The root segmented control offers «Uka | Nyheter» as words.
		let nyheter = app.buttons["Nyheter"]
		assertExists(nyheter, "the root segmented control should offer a «Nyheter» segment")
		nyheter.tap()

		// The board's NYTT section header is always present (even when empty), and
		// the quiet «Det du følger» link sits atop it.
		assertExists(app.staticTexts["news.section.nytt"], "the Nyheter board should show its NYTT section header")
		assertExists(app.buttons["news.followedLink"], "the board should offer the «Det du følger» link")
	}

	// WP-115 — tapping a NYTT pointer opens the source in the IN-APP browser
	// (SFSafariViewController over the board), not external Safari. The uitest seed
	// stamps one NYTT pointer with the FK Lyn Oslo entity id so the lens admits it.
	func testTapNyttRowOpensInAppBrowser() {
		let app = launchApp(state: "agenda")

		app.buttons["Nyheter"].tap()
		assertExists(app.staticTexts["news.section.nytt"], "the Nyheter board should render")

		let row = app.buttons["news.item"].firstMatch
		assertExists(row, "the seeded NYTT pointer row should be present to tap")
		row.tap()

		// Two independent signals that it opened IN-APP and did not launch external
		// Safari: our marker on the presented SFSafariViewController's view, and the
		// app staying in the foreground (an external open would background the SUT).
		let browser = app.descendants(matching: .any).matching(identifier: "news.safari").firstMatch
		assertExists(browser, "tapping a NYTT row should present the in-app browser")
		XCTAssertEqual(app.state, .runningForeground, "the in-app browser keeps the user inside Sportivista")
	}
}
