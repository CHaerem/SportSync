//
//  EntityIdentityTests.swift
//  SportivistaTests
//
//  WP-185 — the per-entity row anchor. Three promises are pinned here, in the
//  order they matter: the RIGHT flag (a wrong one is worse than none), a
//  READABLE monogram (computed ink, not hardcoded white), and an honest
//  fall-through to the sport symbol whenever the registry knows nothing.
//
//  Mirrors tests/entity-avatar.test.js case for case — the two surfaces must
//  reach the same verdict for the same entity.
//

import XCTest

final class EntityIdentityTests: XCTestCase {

    // MARK: - Flags

    func testAlphaTwoBecomesRegionalIndicatorFlag() {
        XCTAssertEqual(EntityIdentityResolver.flagEmoji("NO"), "🇳🇴")
        XCTAssertEqual(EntityIdentityResolver.flagEmoji("de"), "🇩🇪")
        XCTAssertEqual(EntityIdentityResolver.flagEmoji("US"), "🇺🇸")
    }

    func testHomeNationsKeepTheirOwnFlags() {
        // England/Scotland/Wales are separate "countries" in sport — a Union Jack
        // on an England row would be wrong.
        XCTAssertEqual(EntityIdentityResolver.flagEmoji("GB-ENG"), "🏴󠁧󠁢󠁥󠁮󠁧󠁿")
        XCTAssertEqual(EntityIdentityResolver.flagEmoji("GB-SCT"), "🏴󠁧󠁢󠁳󠁣󠁴󠁿")
        XCTAssertEqual(EntityIdentityResolver.flagEmoji("GB-WLS"), "🏴󠁧󠁢󠁷󠁬󠁳󠁿")
        XCTAssertEqual(EntityIdentityResolver.flagEmoji("GB"), "🇬🇧")
    }

    func testUnknownCountryYieldsNoFlagRatherThanAWrongOne() {
        // Northern Ireland has no RGI emoji sequence; nothing beats a Union Jack.
        XCTAssertNil(EntityIdentityResolver.flagEmoji("GB-NIR"))
        XCTAssertNil(EntityIdentityResolver.flagEmoji("Norge"))
        XCTAssertNil(EntityIdentityResolver.flagEmoji(""))
        XCTAssertNil(EntityIdentityResolver.flagEmoji(nil))
    }

    // MARK: - Monogram

    func testMonogramInitialsFollowTheContactsRule() {
        XCTAssertEqual(EntityIdentityResolver.monogramInitials("Manchester City"), "MC")
        XCTAssertEqual(EntityIdentityResolver.monogramInitials("Aston Villa"), "AV")
        XCTAssertEqual(EntityIdentityResolver.monogramInitials("Rosenborg"), "R")
    }

    func testClubFormNoiseIsDroppedWhenARealWordSurvives() {
        XCTAssertEqual(EntityIdentityResolver.monogramInitials("AFC Bournemouth"), "B")
        XCTAssertEqual(EntityIdentityResolver.monogramInitials("Rosenborg BK"), "R")
        XCTAssertEqual(EntityIdentityResolver.monogramInitials("FC"), "F")   // nothing survives → keep it
    }

    func testMonogramIsNeverMoreThanTwoCharacters() {
        for name in ["Borussia Mönchengladbach", "Real Sociedad de Fútbol", "1. FC Köln"] {
            XCTAssertLessThanOrEqual(EntityIdentityResolver.monogramInitials(name).count, 2, name)
        }
    }

    func testHexParsingIsStrict() {
        XCTAssertEqual(EntityIdentityResolver.packedHex("#e20520"), 0xE20520)
        XCTAssertEqual(EntityIdentityResolver.packedHex("E20520"), 0xE20520)
        XCTAssertNil(EntityIdentityResolver.packedHex("#fff"))       // pipeline emits 6 digits
        XCTAssertNil(EntityIdentityResolver.packedHex("chartreuse"))
        XCTAssertNil(EntityIdentityResolver.packedHex(nil))
    }

    func testInkIsComputedNotHardcodedWhite() {
        XCTAssertTrue(EntityIdentityResolver.inkIsLight(primary: 0x0A0A0A, secondary: 0x0A0A0A))
        XCTAssertFalse(EntityIdentityResolver.inkIsLight(primary: 0xFFFFFF, secondary: 0xFFFFFF))
        // A split kit is judged on the MEAN — the initials straddle the diagonal.
        XCTAssertFalse(EntityIdentityResolver.inkIsLight(primary: 0xFFFFFF, secondary: 0x000000))
        XCTAssertTrue(EntityIdentityResolver.inkIsLight(primary: 0xE20520, secondary: 0x003399))
    }

    func testChosenInkAlwaysWinsTheContrastComparison() {
        for hex: UInt32 in [0xE20520, 0x99C5EA, 0xFFFFFF, 0x000000, 0x7F7F7F] {
            let light = EntityIdentityResolver.inkIsLight(primary: hex, secondary: hex)
            let l = EntityIdentityResolver.luminance(hex)
            let ratio = { (other: Double) in (max(l, other) + 0.05) / (min(l, other) + 0.05) }
            XCTAssertGreaterThanOrEqual(ratio(light ? 1.0 : 0.0), ratio(light ? 0.0 : 1.0), String(hex, radix: 16))
        }
    }

    // MARK: - The ladder

    private let club = Entity(id: "arsenal", name: "Arsenal", aliases: ["Arsenal FC"], sport: "football", type: "team",
                              colors: EntityColors(primary: "#e20520", secondary: "#003399"))
    private let national = Entity(id: "norge", name: "Norge", aliases: ["Norway"], sport: "football", type: "team",
                                  country: "NO", national: true, colors: EntityColors(primary: "#c8102e"))
    private let athlete = Entity(id: "magnus-carlsen", name: "Magnus Carlsen", sport: "chess", type: "athlete", country: "NO")
    /// The real trap: Wikidata stamps P17 on Norwegian handball CLUBS.
    private let clubWithCountry = Entity(id: "elverum", name: "Elverum Håndball", sport: "handball", type: "team", country: "NO")

    func testAthleteFliesAFlag() {
        XCTAssertEqual(EntityIdentityResolver.identity(for: athlete), .flag("🇳🇴"))
    }

    func testNationalTeamFliesAFlagEvenThoughItAlsoHasKitColours() {
        XCTAssertEqual(EntityIdentityResolver.identity(for: national), .flag("🇳🇴"))
    }

    func testClubWearsAMonogram() {
        XCTAssertEqual(
            EntityIdentityResolver.identity(for: club),
            .monogram(initials: "A", primary: 0xE20520, secondary: 0x003399, inkIsLight: true)
        )
    }

    func testAClubWithACountryButNoNationalFlagDoesNotFlyIt() {
        XCTAssertEqual(EntityIdentityResolver.identity(for: clubWithCountry), .none)
    }

    func testNoMetadataDegradesToTheSportGlyph() {
        XCTAssertEqual(EntityIdentityResolver.identity(for: Entity(id: "x", name: "Ukjent FK", sport: "football", type: "team")), .none)
        XCTAssertEqual(EntityIdentityResolver.identity(for: nil), .none)
    }

    // MARK: - The index

    private func index() -> EntityIdentityIndex {
        EntityIdentityIndex([club, national, athlete, clubWithCountry])
    }

    func testIndexOnlyHoldsEntitiesThatHaveAnAvatarToGive() {
        let idx = index()
        XCTAssertNotNil(idx.entity(id: "arsenal"))
        XCTAssertNil(idx.entity(id: "elverum"))          // country-only club → nothing to draw
        XCTAssertEqual(idx.entity(name: "Norway")?.id, "norge")  // aliases resolve too
        XCTAssertTrue(EntityIdentityIndex([]).isEmpty)
    }

    private func match(homeTeam: String? = nil, awayTeam: String? = nil, homeTeamEntityId: String? = nil,
                       players: [[String: Any]] = [], participants: [String] = []) -> Event {
        EventBuilder.make(sport: "football", title: "Kamp", time: "2026-07-22T18:00:00Z",
                          homeTeam: homeTeam, awayTeam: awayTeam ?? (homeTeam == nil ? nil : "Chelsea"),
                          norwegianPlayers: players, participants: participants,
                          homeTeamEntityId: homeTeamEntityId)
    }

    func testResolutionFallsThroughToTheAwaySide() {
        // "Universitatea Cluj – Brann": the home club is a stranger, the away club
        // is the reason the row is on a Norwegian fan's board at all.
        guard case .monogram(let initials, _, _, _) = index().identity(for: match(homeTeam: "Universitatea Cluj", awayTeam: "Arsenal")) else {
            return XCTFail("expected the away club to anchor the row")
        }
        XCTAssertEqual(initials, "A")
    }

    func testRowResolutionPrefersTheServerStampedIdOverTheName() {
        let event = match(homeTeam: "et ukjent navn", homeTeamEntityId: "arsenal")
        guard case .monogram(let initials, _, _, _) = index().identity(for: event) else {
            return XCTFail("expected the stamped id to win")
        }
        XCTAssertEqual(initials, "A")
    }

    func testRowResolutionFallsThroughHomeTeamThenPlayerThenParticipant() {
        if case .monogram = index().identity(for: match(homeTeam: "Arsenal FC")) {} else {
            XCTFail("home-team name should resolve")
        }
        let byPlayer = match(players: [["name": "Magnus Carlsen", "entityId": "magnus-carlsen"]])
        XCTAssertEqual(index().identity(for: byPlayer), .flag("🇳🇴"))

        let byParticipant = match(participants: ["Magnus Carlsen"])
        XCTAssertEqual(index().identity(for: byParticipant), .flag("🇳🇴"))
    }

    func testAnEmptyIndexIsAlwaysNone() {
        // The honest cold-start / unsynced case: the board keeps its sport glyphs.
        XCTAssertEqual(EntityIdentityIndex([]).identity(for: match(homeTeam: "Arsenal")), .none)
    }
}
