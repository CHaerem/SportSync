//
//  SportSymbolTests.swift
//  SportivistaTests
//
//  WP-108 — guard the canonical sport→SF Symbol registry (SportSymbol). The
//  load-bearing test: `Image(systemName:)` against an unknown name renders an
//  EMPTY image silently, so a typo in the table would ship an invisible glyph
//  with no compile error. Here we instantiate `UIImage(systemName:)` for every
//  name the registry can emit (the whole table + the assistant + fallback
//  roles) and assert each resolves — this is what makes the choices in
//  SportSymbol.swift verifiable on iOS.
//
//  Also pins the contract the views rely on: canonical sports map to their
//  documented glyph, aliases fold in, and unknown tags fall back to `calendar`
//  (never crash, never blank).
//

import XCTest
import UIKit

final class SportSymbolTests: XCTestCase {

    /// Every symbol the registry can emit must exist on this iOS — an unknown
    /// `systemName` yields a nil `UIImage`, which would render as nothing.
    func testEverySymbolExistsOnThisOS() {
        for name in SportSymbol.allSymbolNames {
            XCTAssertNotNil(
                UIImage(systemName: name),
                "SF Symbol \"\(name)\" does not exist on this iOS — it would render as an empty glyph"
            )
        }
    }

    /// The assistant + fallback roles are real symbols too (covered by the set
    /// above, asserted explicitly so a regression names them).
    func testAssistantAndFallbackSymbolsExist() {
        XCTAssertNotNil(UIImage(systemName: SportSymbol.assistant))
        XCTAssertNotNil(UIImage(systemName: SportSymbol.fallback))
    }

    /// The documented per-sport choices (the ones called out in the file header
    /// / DESIGN § Radens anatomi).
    func testCanonicalSportMappings() {
        XCTAssertEqual(SportSymbol.name(for: "football"), "soccerball")
        XCTAssertEqual(SportSymbol.name(for: "golf"), "figure.golf")
        XCTAssertEqual(SportSymbol.name(for: "tennis"), "tennisball")
        XCTAssertEqual(SportSymbol.name(for: "cycling"), "figure.outdoor.cycle")
        XCTAssertEqual(SportSymbol.name(for: "f1"), "flag.checkered")
        XCTAssertEqual(SportSymbol.name(for: "esports"), "gamecontroller")
        XCTAssertEqual(SportSymbol.name(for: "cross-country"), "figure.skiing.crosscountry")
        XCTAssertEqual(SportSymbol.name(for: "alpine"), "figure.skiing.downhill")
        // Documented, no-dedicated-glyph choices:
        XCTAssertEqual(SportSymbol.name(for: "biathlon"), "target")
        XCTAssertEqual(SportSymbol.name(for: "chess"), "crown")
        XCTAssertEqual(SportSymbol.name(for: "ski jumping"), "snowflake")
        XCTAssertEqual(SportSymbol.name(for: "nordic"), "snowflake")
    }

    /// Case- and whitespace-insensitive, and known aliases fold in.
    func testLookupIsRobust() {
        XCTAssertEqual(SportSymbol.name(for: "Football"), "soccerball")
        XCTAssertEqual(SportSymbol.name(for: "  golf  "), "figure.golf")
        XCTAssertEqual(SportSymbol.name(for: "soccer"), "soccerball")
        XCTAssertEqual(SportSymbol.name(for: "formula1"), "flag.checkered")
    }

    /// An unknown sport tag falls back to the neutral calendar mark — never a
    /// blank glyph.
    func testUnknownSportFallsBack() {
        XCTAssertEqual(SportSymbol.name(for: "kabaddi"), SportSymbol.fallback)
        XCTAssertEqual(SportSymbol.name(for: ""), SportSymbol.fallback)
    }

    /// Coverage guard: every sport the app can display a name for
    /// (SportVocabulary.sportDisplay — what the agenda/Nyheter rows actually show)
    /// resolves to a REAL, non-fallback glyph. If a new covered sport is added to
    /// the vocabulary without a symbol, this fails so the table is kept in sync.
    func testEveryDisplayedSportHasADedicatedSymbol() {
        for sport in SportVocabulary.sportDisplay.keys {
            let symbol = SportSymbol.name(for: sport)
            XCTAssertNotEqual(
                symbol, SportSymbol.fallback,
                "Covered sport \"\(sport)\" has no dedicated symbol in SportSymbol.table — it would show the generic calendar fallback"
            )
            XCTAssertNotNil(UIImage(systemName: symbol), "symbol \"\(symbol)\" for \"\(sport)\" must exist")
        }
    }
}
