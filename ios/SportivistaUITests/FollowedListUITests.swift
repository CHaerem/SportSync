//
//  FollowedListUITests.swift
//  SportivistaUITests
//
//  WP-105 — UI smoke for the assistant-free 3b path: Deg › «Det du følger» opens
//  the plain list, and its «+» opens the Legg til-søk. In its own file (not the
//  WP-104-owned MainFlowsUITests) so the parallel waves never touch the same file.
//
//  WP-164 — the soft-follow acceptance flow: a search MISS never dead-ends;
//  «Følg likevel» creates a name-based rule that shows up in «Det du følger»
//  with the honest «venter på dekning» status.
//

import XCTest

final class FollowedListUITests: SportivistaUITestCase {

    func testOpenDetDuFolgerThenLeggTil() {
        let app = launchApp(state: "agenda")

        // gearshape → Deg → «Det du følger» (same entry the WP-83 nav test uses,
        // now renamed; the accessibility id `deg.follows` is unchanged).
        let gear = app.buttons["nav.settings"]
        assertExists(gear, "the gearshape settings button should be in the nav bar")
        gear.tap()

        let followsRow = app.buttons["deg.follows"]
        assertExists(followsRow, "Deg should home «Det du følger»")
        followsRow.tap()
        assertExists(app.navigationBars["Det du følger"], "the row pushes «Det du følger»")

        // The «+» opens the Legg til-søk (a plain search sheet, no assistant).
        let add = app.buttons["followed.add"]
        assertExists(add, "«Det du følger» offers a Legg til «+»")
        add.tap()
        assertExists(app.navigationBars["Legg til"], "«+» opens the Legg til-søk")
    }

    // WP-164 — søk-miss → «Følg likevel» → rad i «Det du følger» med ærlig status.
    // «Storhamar» is deliberately ASCII (typeText + æøå is flaky) and absent from
    // the seeded entities fixture, so the search genuinely misses.
    func testSearchMissOffersFollowAnyway_andRowWaitsHonestly() {
        let app = launchApp(state: "agenda")

        app.buttons["nav.settings"].tap()
        let followsRow = app.buttons["deg.follows"]
        assertExists(followsRow, "Deg should home «Det du følger»")
        followsRow.tap()
        let add = app.buttons["followed.add"]
        assertExists(add, "«Det du følger» offers a Legg til «+»")
        add.tap()
        assertExists(app.navigationBars["Legg til"], "«+» opens the Legg til-søk")

        // Type a name the index doesn't know.
        let search = app.searchFields.firstMatch
        assertExists(search, "the Legg til sheet has a search field")
        search.tap()
        search.typeText("Storhamar")

        // The miss never dead-ends: the soft-follow affordance appears.
        let followAnyway = app.buttons["addfollow.softfollow"]
        assertExists(followAnyway, "a search miss offers «Følg likevel»")
        attachScreenshot(app, name: "wp164-search-miss")
        followAnyway.tap()

        // The affordance flips to the honest followed read-out.
        assertExists(staticText(containing: "venter på dekning", in: app),
                     "after «Følg likevel» the sheet reads back the waiting follow")

        // Close the sheet — the new rule is a row in «Det du følger» with the
        // honest «Fulgt — venter på dekning» subtitle (never «sjekk navnet»).
        // iOS 26 renders the toolbar Lukk as a lowercase-labelled glyph while
        // the search is active, so match the label case-insensitively (and tap
        // once more if the first tap only ended the search).
        let close = app.buttons.matching(NSPredicate(format: "label ==[c] %@", "lukk")).firstMatch
        assertExists(close, "the Legg til sheet offers a close control")
        close.tap()
        if app.navigationBars["Legg til"].waitForExistence(timeout: 2) {
            let closeAgain = app.buttons.matching(NSPredicate(format: "label ==[c] %@", "lukk")).firstMatch
            if closeAgain.waitForExistence(timeout: 5) { closeAgain.tap() }
        }
        let row = app.buttons["followed.row.soft-storhamar"]
        assertExists(row, "the soft-follow is a row in «Det du følger»")
        XCTAssertTrue(row.label.contains("venter på dekning"),
                      "the row carries the honest waiting status, got: «\(row.label)»")
        attachScreenshot(app, name: "wp164-followed-row")
    }

    /// Evidence helper (regel 8: skjermbilder bor i PR-en, aldri i repoet) —
    /// keepAlways so the PNGs can be exported from the .xcresult afterwards.
    private func attachScreenshot(_ app: XCUIApplication, name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
