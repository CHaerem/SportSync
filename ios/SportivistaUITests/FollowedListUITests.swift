//
//  FollowedListUITests.swift
//  SportivistaUITests
//
//  WP-105 — UI smoke for the assistant-free 3b path: Deg › «Det du følger» opens
//  the plain list, and its «+» opens the Legg til-søk. In its own file (not the
//  WP-104-owned MainFlowsUITests) so the parallel waves never touch the same file.
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
}
