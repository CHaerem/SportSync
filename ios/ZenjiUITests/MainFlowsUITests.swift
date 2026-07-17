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
		assertExists(agendaRow(UITestFixture.footballTitle, in: app), "the seeded followed football row should be on the board")
		XCTAssertFalse(agendaRow(UITestFixture.biathlonTitle, in: app).exists, "biathlon must not be on the board before following it")

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
		assertExists(agendaRow(UITestFixture.biathlonTitle, in: app), "confirming the follow should surface the biathlon row")
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

		let row = agendaRow(UITestFixture.footballTitle, in: app)
		assertExists(row, "the followed football row should be tappable")
		row.tap()

		// The detail sheet's deterministic context action.
		let why = app.staticTexts["Hvorfor vises denne?"]
		assertExists(why, "the detail sheet should offer «Hvorfor vises denne?»")
		why.tap()
		// The disclosure sits at the foot of the sheet; on the .medium detent the
		// revealed reason lands below the fold, and the List is lazy so its cell
		// isn't realised until scrolled into view. Bring it on-screen, then assert.
		let reason = staticText(containing: "Fordi FK Lyn Oslo spiller", in: app)
		scrollUntilHittable(reason, in: app)
		assertExists(reason, "expanding it should show the deterministic reason")

		app.buttons["Lukk"].tap()
		assertExists(app.textFields["command.field"], "closing the sheet returns to the agenda")
	}

	// MARK: - Flow 5 · Theme cycle (WP-83 — moved from the header to Deg › Utseende)

	func testThemeToggleCyclesInDeg() {
		let app = launchApp(state: "agenda")

		// The theme override now lives in Deg (DESIGN-BASELINE § Tema), reached
		// via the gearshape in the nav bar — no longer a header glyph.
		app.buttons["nav.settings"].tap()

		let toggle = app.buttons["theme.toggle"]
		scrollUntilHittable(toggle, in: app)
		assertExists(toggle, "the Utseende row should be in Deg")
		// Seeded to start at system.
		waitForLabel(toggle, equals: "Tema: automatisk")
		toggle.tap()
		waitForLabel(toggle, equals: "Tema: mørk")
		toggle.tap()
		waitForLabel(toggle, equals: "Tema: lys")
		toggle.tap()
		waitForLabel(toggle, equals: "Tema: automatisk")
	}

	// MARK: - Flow 6 · Reset (WP-83 — reached from Deg › Nullstill)

	func testResetFlowCancelThenComplete() {
		let app = launchApp(state: "agenda")

		// Open Deg via the gearshape, then push the Nullstill screen.
		app.buttons["nav.settings"].tap()
		let resetEntry = app.buttons["deg.reset"]
		scrollUntilHittable(resetEntry, in: app)
		assertExists(resetEntry, "the Nullstill row should be in Deg")
		resetEntry.tap()

		let followedOnly = app.buttons["reset.followedOnly"]
		scrollUntilHittable(followedOnly, in: app)
		assertExists(followedOnly, "the «Nullstill det du følger» row should appear")

		// First: enter the confirm step, then CANCEL — nothing changes.
		followedOnly.tap()
		let cancel = app.buttons["reset.cancel"]
		assertExists(cancel, "the confirm step should offer Avbryt")
		cancel.tap()
		// Still no onboarding (cancelling reset must not start it).
		XCTAssertFalse(app.staticTexts["Velkommen"].exists, "cancelling reset must not start onboarding")

		// Then: carry it through — reset + re-onboard, no reinstall.
		let followedOnly2 = app.buttons["reset.followedOnly"]
		scrollUntilHittable(followedOnly2, in: app)
		assertExists(followedOnly2, "the reset row should still be available")
		followedOnly2.tap()
		let confirm = app.buttons["reset.confirm"]
		assertExists(confirm, "the confirm step should offer Nullstill")
		confirm.tap()

		assertExists(app.staticTexts["Velkommen"], "completing reset should raise onboarding again")
	}

	// MARK: - Flow 7 · Presentation filter (WP-67 — set via command line, then reset)

	func testPresentationFilterViaCommandLineThenReset() {
		let app = launchApp(state: "agenda")

		// The seeded board shows the followed football row.
		assertExists(agendaRow(UITestFixture.footballTitle, in: app), "the seeded football row should be on the board")

		// Filter the VIEW to golf — nothing on the seeded board is golf, so the
		// board empties to the honest "no matches" line while the profile is
		// untouched (this is a presentation filter, not a follow).
		let field = app.textFields["command.field"]
		assertExists(field, "the command line should be present")
		field.tap()
		field.typeText("vis golf")
		app.buttons["command.send"].tap()

		// The quiet filter line appears; the football row is filtered out.
		assertExists(app.staticTexts["agenda.filter.label"], "the filter line should appear over the agenda")
		assertExists(app.staticTexts["Ingen treff for filteret."], "the golf filter hides the football row")
		XCTAssertFalse(agendaRow(UITestFixture.footballTitle, in: app).exists, "the football row is hidden by the golf filter")

		// One-tap reset (the ✕) brings everything back.
		app.buttons["agenda.filter.reset"].tap()
		assertExists(agendaRow(UITestFixture.footballTitle, in: app), "resetting the filter restores the full board")
		XCTAssertFalse(app.staticTexts["agenda.filter.label"].exists, "the filter line is gone after reset")
	}

	// MARK: - Flow 8 · Command-line discoverability — focus shows context suggestions (WP-82)

	func testCommandLineFocusShowsContextSuggestions() {
		let app = launchApp(state: "agenda")

		// At rest, the suggestion row is NOT present — it appears only on focus.
		let suggestion = app.buttons["assistant.suggestion.0"]
		XCTAssertFalse(suggestion.exists, "context suggestions must not show before the line is focused")

		// Focusing the command line raises the calm context-suggestion row.
		let field = app.textFields["command.field"]
		assertExists(field, "the command line should be present")
		field.tap()
		assertExists(suggestion, "focusing the line should raise a context-suggestion pill")

		// Tapping a suggestion FILLS the line (it does not submit) — the value
		// lands in the field (read as the text field's `value`) so the user can
		// edit or send it. "lag" is an ASCII token of the first suggestion that
		// the placeholder does NOT contain, so the match is unambiguous.
		suggestion.tap()
		let value = (field.value as? String) ?? ""
		XCTAssertTrue(value.contains("lag"),
		              "tapping a suggestion should fill the command line with its text (got «\(value)»)")
	}

	// MARK: - Flow 9 · Command-line discoverability — typing shows live grounding hits (WP-82)

	func testCommandLineTypingShowsGroundingHits() {
		let app = launchApp(state: "agenda")

		// Type a prefix of a known entity (ASCII-only — typeText with æøå is flaky).
		let field = app.textFields["command.field"]
		assertExists(field, "the command line should be present")
		field.tap()
		field.typeText("ski")

		// A live grounding hit for the seeded biathlon tournament appears as a
		// tappable row — "velg, ikke stav".
		let hit = app.buttons["grounding.skiskyting-verdenscup"]
		assertExists(hit, "typing should surface a live grounding hit for the entity")

		// Selecting the hit runs the grounded follow flow: a confirmable diff
		// rises, and confirming it surfaces the biathlon row on the recompiled board.
		hit.tap()
		let confirm = app.buttons["assistant.confirm"].firstMatch
		assertExists(confirm, "selecting a grounding hit should raise a confirmable follow diff")
		confirm.tap()
		assertExists(app.staticTexts[UITestFixture.biathlonTitle],
		             "confirming the selected follow should surface the biathlon row")
	}

	// MARK: - Flow 10 · Navigation — open Deg via the gearshape, then back-swipe (WP-83)

	func testOpenDegViaGearThenBackSwipe() {
		let app = launchApp(state: "agenda")

		// The gearshape in the nav bar pushes the Deg screen.
		let gear = app.buttons["nav.settings"]
		assertExists(gear, "the gearshape settings button should be in the nav bar")
		gear.tap()
		assertExists(app.navigationBars["Deg"], "the gear should push the Deg screen")
		assertExists(app.buttons["deg.follows"], "Deg should re-home «Hva jeg følger»")

		// The native interactive pop gesture (tilbake-swipe) from the left edge
		// returns to the agenda — the always-present command line is the tell.
		let edge = app.coordinate(withNormalizedOffset: CGVector(dx: 0.0, dy: 0.5))
		let target = app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5))
		edge.press(forDuration: 0.05, thenDragTo: target)
		assertExists(app.textFields["command.field"], "back-swiping Deg returns to the agenda")
	}

	// MARK: - Flow 11 · Assistant result is a native sheet (WP-83)

	func testAssistantResultShowsAsSheet() {
		let app = launchApp(state: "agenda")

		// Type a follow and send — the result now rises as a native sheet whose
		// header reads «ASSISTENT», with a confirmable diff inside it.
		let field = app.textFields["command.field"]
		assertExists(field, "the command line should be present")
		field.tap()
		field.typeText(UITestFixture.followUtterance)
		app.buttons["command.send"].tap()

		assertExists(app.staticTexts["ASSISTENT"], "the result should present as a sheet titled ASSISTENT")
		let confirm = app.buttons["assistant.confirm"].firstMatch
		assertExists(confirm, "the sheet should carry a confirmable diff")

		// Dismissing the sheet (its «Lukk») returns to the agenda with the command
		// line still pinned beneath.
		app.buttons["Lukk"].tap()
		assertExists(app.textFields["command.field"], "closing the result sheet returns to the agenda")
	}
}
