//
//  MainFlowsUITests.swift
//  ZenjiUITests
//
//  WP-70 — end-to-end regression of the six main UX flows, driven against the
//  deterministic `ZENJI_DEMO=uitest` harness (mock assistant + seeded cache, no
//  network). Each test is short and asserts BEHAVIOUR through stable
//  accessibility identifiers / seeded fixture strings, never pixels (visual
//  pixel-perfection is visual-qa's job on web; real-FM eval is WP-69's).
//
//  Flows:
//   1. Onboarding — quick-picks + the conversation step.
//   2. Follow via the command line → diff → Bekreft → the row appears.
//   3. N rapid starter-pack toggles without a hang (guards WP-60 coalescing).
//   4. Event detail + «Hvorfor vises denne?».
//   5. Theme toggle (system → dark → light → system).
//   6. Reset flow (cancel, then carry through to re-onboarding).
//

import XCTest

final class MainFlowsUITests: ZenjiUITestCase {

	// MARK: - Flow 1 · Onboarding (quick-picks + conversation)

	func testOnboardingConversationThenQuickPicks() {
		let app = launchApp(state: "onboarding")

		// Welcome → start (the mock reads "available", so the build step is the
		// conversation path).
		assertExists(app.staticTexts["Velkommen"], "onboarding should open on the welcome step")
		app.buttons["Kom i gang"].tap()

		// Conversation step: say what you follow, confirm the diff, watch the
		// "Følger nå" list grow.
		assertExists(app.staticTexts["Fortell meg hva du følger"], "welcome should lead to the conversation step")
		let field = app.textFields["onboarding.field"]
		assertExists(field, "the onboarding command line should be present")
		field.tap()
		field.typeText(UITestFixture.followUtterance)
		app.buttons["onboarding.send"].tap()

		let confirm = app.buttons["Bekreft"].firstMatch
		assertExists(confirm, "a proposal diff should appear for the utterance")
		confirm.tap()
		assertExists(app.staticTexts[UITestFixture.biathlonEntityName], "the confirmed follow should show under «Følger nå»")

		// Fall back to the quick-picks step and tap a curated pack.
		app.buttons["Velg fra startpakker i stedet"].tap()
		assertExists(app.staticTexts["Velg det du bryr deg om"], "should land on the quick-picks step")
		let golf = app.buttons["starterpack.norske-golfere"]
		assertExists(golf, "the curated starter packs should render")
		golf.tap()
		assertExists(app.staticTexts["VALGT"], "tapping a pack should mark it valgt")

		// Finish → the agenda (the always-present command line is the tell we
		// left the overlay).
		app.buttons["Ferdig"].tap()
		assertExists(app.staticTexts["Klart"], "should reach the landing step")
		app.buttons["Til agendaen"].tap()
		assertExists(app.textFields["command.field"], "finishing onboarding should drop into the agenda")
	}

	// MARK: - Flow 2 · Follow via the command line

	func testFollowViaCommandLineSurfacesRow() {
		let app = launchApp(state: "agenda")

		// The seeded board shows the followed football row; the biathlon row is
		// deliberately NOT relevant yet.
		assertExists(app.staticTexts[UITestFixture.footballTitle], "the seeded followed football row should be on the board")
		XCTAssertFalse(app.staticTexts[UITestFixture.biathlonTitle].exists, "biathlon must not be on the board before following it")

		// Type the follow, confirm the diff.
		let field = app.textFields["command.field"]
		assertExists(field, "the command line should be present")
		field.tap()
		field.typeText(UITestFixture.followUtterance)
		app.buttons["command.send"].tap()

		let confirm = app.buttons["assistant.confirm"].firstMatch
		assertExists(confirm, "the assistant ark should raise a confirmable diff")
		confirm.tap()

		// Immediate consequence: the biathlon row now appears on the recompiled board.
		assertExists(app.staticTexts[UITestFixture.biathlonTitle], "confirming the follow should surface the biathlon row")
	}

	// MARK: - Flow 3 · Rapid starter-pack toggles (guards WP-60 coalescing)

	func testRapidStarterPackTogglesStayResponsive() {
		let app = launchApp(state: "onboarding")

		// Navigate to the quick-picks step.
		assertExists(app.staticTexts["Velkommen"], "onboarding should open on the welcome step")
		app.buttons["Kom i gang"].tap()
		assertExists(app.staticTexts["Fortell meg hva du følger"], "welcome should lead to the conversation step")
		app.buttons["Velg fra startpakker i stedet"].tap()
		assertExists(app.staticTexts["Velg det du bryr deg om"], "should land on the quick-picks step")

		// Fire five pack toggles back-to-back with no waits between them — each
		// fires onProfileChanged → an agenda recompile behind the overlay. WP-60
		// coalesces a burst to ≤2 recompiles; a regression here would jam the main
		// thread and the taps below would not all land. We assert the resulting
		// rule COUNT (a reasonable time-budget assertion, not flaky exactness):
		// the five packs total 10 rules, and the count only reaches 10 if every
		// tap was processed and the UI kept up.
		for packId in ["starterpack.norsk-fotball",
		               "starterpack.norske-golfere",
		               "starterpack.sjakk-carlsen",
		               "starterpack.norsk-sykkel",
		               "starterpack.friidrett"] {
			let pack = app.buttons[packId]
			assertExists(pack, "pack \(packId) should render")
			pack.tap()
		}

		assertExists(app.staticTexts["FØLGER NÅ (10)"], "all five packs should apply (10 rules) within the time budget")

		// Responsiveness proof: the UI is still live after the burst.
		app.buttons["Ferdig"].tap()
		assertExists(app.staticTexts["Klart"], "the app should stay responsive after the toggle burst")
	}

	// MARK: - Flow 4 · Event detail + «Hvorfor vises denne?»

	func testEventDetailWhyShown() {
		let app = launchApp(state: "agenda")

		let row = app.staticTexts[UITestFixture.footballTitle]
		assertExists(row, "the followed football row should be tappable")
		row.tap()

		// The detail sheet's deterministic context action.
		let why = app.staticTexts["Hvorfor vises denne?"]
		assertExists(why, "the detail sheet should offer «Hvorfor vises denne?»")
		why.tap()
		assertExists(staticText(containing: "Fordi FK Lyn Oslo spiller", in: app),
		             "expanding it should show the deterministic reason")

		app.buttons["Lukk"].tap()
		assertExists(app.textFields["command.field"], "closing the sheet returns to the agenda")
	}

	// MARK: - Flow 5 · Theme toggle

	func testThemeToggleCycles() {
		let app = launchApp(state: "agenda")

		let toggle = app.buttons["theme.toggle"]
		assertExists(toggle, "the theme toggle should be in the header")
		// Seeded to start at system.
		waitForLabel(toggle, equals: "Tema: automatisk")
		toggle.tap()
		waitForLabel(toggle, equals: "Tema: mørk")
		toggle.tap()
		waitForLabel(toggle, equals: "Tema: lys")
		toggle.tap()
		waitForLabel(toggle, equals: "Tema: automatisk")
	}

	// MARK: - Flow 6 · Reset (cancel, then carry through)

	func testResetFlowCancelThenComplete() {
		let app = launchApp(state: "agenda")

		// Open the assistant ark from the command line's sigil (no typing).
		app.buttons["command.browse"].tap()
		assertExists(app.staticTexts["ASSISTENT"], "the assistant ark should be up")

		// Reveal + open the NULLSTILL disclosure at the foot of the ark (its header
		// is a button labelled "NULLSTILL").
		let disclosure = app.buttons["NULLSTILL"]
		scrollUntilHittable(disclosure, in: app)
		assertExists(disclosure, "the reset disclosure should be reachable")
		disclosure.tap()

		let followedOnly = app.buttons["reset.followedOnly"]
		scrollUntilHittable(followedOnly, in: app)
		assertExists(followedOnly, "the «Nullstill det du følger» row should appear")

		// First: enter the confirm ark, then CANCEL — nothing changes.
		followedOnly.tap()
		let cancel = app.buttons["reset.cancel"]
		assertExists(cancel, "the confirm ark should offer Avbryt")
		cancel.tap()
		// Still on the board (onboarding did NOT trigger).
		XCTAssertFalse(app.staticTexts["Velkommen"].exists, "cancelling reset must not start onboarding")

		// Then: carry it through — reset + re-onboard, no reinstall.
		let followedOnly2 = app.buttons["reset.followedOnly"]
		scrollUntilHittable(followedOnly2, in: app)
		assertExists(followedOnly2, "the reset row should still be available")
		followedOnly2.tap()
		let confirm = app.buttons["reset.confirm"]
		assertExists(confirm, "the confirm ark should offer Nullstill")
		confirm.tap()

		assertExists(app.staticTexts["Velkommen"], "completing reset should raise onboarding again")
	}
}
