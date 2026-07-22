//
//  StandingsTableTests.swift
//  SportivistaTests
//
//  WP-171 — the event-detail TABELL surface, driven by the CHECKED-IN
//  standings.json fixture (the same fasit shape the pipeline publishes), not by
//  hand-built structs: the point of the package is that the app finally reads
//  the file it never synced, so the test reads the file too.
//
//  Covers: the Codable model over the real fixture, the per-sport table build
//  (PL table / golf leaderboard / F1 championship), the "both teams always
//  visible" rule that keeps a mid-table side in the picture, and the honest nil
//  when there is nothing to show.
//

import XCTest

final class StandingsTableTests: XCTestCase {

    private lazy var standings: Standings = {
        // swiftlint:disable:next force_try
        try! SportivistaJSON.decoder.decode(Standings.self, from: Fixture.data("standings"))
    }()

    // MARK: - Decoding the published shape

    func testDecodesTheFixture_everySport() {
        XCTAssertEqual(standings.football.premierLeague.count, 7)
        XCTAssertEqual(standings.football.premierLeague.first?.team, "Liverpool")
        XCTAssertEqual(standings.football.premierLeague.first?.points, 29)
        XCTAssertEqual(standings.football.laLiga.count, 2)
        XCTAssertEqual(standings.f1.drivers.first?.driver, "Kimi Antonelli")
        // A NULL tour (`dpWorld`) is dropped, never a decode failure.
        XCTAssertEqual(standings.golf.keys.sorted(), ["pga"])
        XCTAssertEqual(standings.golf["pga"]?.trackedPlayers.first?.player, "Kristoffer Ventura")
        XCTAssertFalse(standings.isEmpty)
    }

    func testEmptyStandings_isEmpty() {
        XCTAssertTrue(Standings().isEmpty)
    }

    // MARK: - Football

    func testFootball_showsTheTopPlusBothTeamsPlaying() {
        let event = EventBuilder.make(sport: "football", title: "Everton vs Liverpool", time: "2026-07-25T18:00:00Z",
                                      homeTeam: "Everton", awayTeam: "Liverpool", tournament: "Premier League")
        let table = StandingsTable.build(event: event, standings: standings)
        XCTAssertEqual(table?.title, "PREMIER LEAGUE")
        // Top 5 + Everton (14th) — the team the tap was about is never cut away.
        XCTAssertEqual(table?.rows.map(\.name), ["Liverpool", "Arsenal", "Manchester City", "Chelsea", "Newcastle United", "Everton"])
        XCTAssertEqual(table?.rows.last?.rank, "14.")
        XCTAssertEqual(table?.rows.last?.value, "13")
        XCTAssertEqual(table?.rows.filter(\.highlighted).map(\.name), ["Liverpool", "Everton"])
    }

    func testFootball_laLigaTournamentPicksTheSpanishTable() {
        let event = EventBuilder.make(sport: "football", title: "Real Madrid vs Barcelona", time: "2026-07-25T18:00:00Z",
                                      homeTeam: "Real Madrid", awayTeam: "Barcelona", tournament: "La Liga")
        let table = StandingsTable.build(event: event, standings: standings)
        XCTAssertEqual(table?.title, "LA LIGA")
        XCTAssertEqual(table?.rows.map(\.name), ["Real Madrid", "Barcelona"])
    }

    // MARK: - Golf

    func testGolf_leaderboardKeepsTheTrackedNorwegian() {
        let event = EventBuilder.make(sport: "golf", title: "3M Open", time: "2026-07-25T14:00:00Z", tournament: "3M Open")
        let table = StandingsTable.build(event: event, standings: standings)
        XCTAssertEqual(table?.title, "3M OPEN")
        XCTAssertEqual(table?.rows.map(\.name), ["Mackenzie Hughes", "Max Greyserman", "Chris Kirk", "Kristoffer Ventura"])
        XCTAssertEqual(table?.rows.last?.rank, "T42")   // positionDisplay wins over the raw position
        XCTAssertEqual(table?.rows.last?.highlighted, true)
    }

    func testGolf_noTableForAnotherTournament() {
        let event = EventBuilder.make(sport: "golf", title: "Ryder Cup", time: "2026-07-25T14:00:00Z", tournament: "Ryder Cup")
        XCTAssertNil(StandingsTable.build(event: event, standings: standings))
    }

    // MARK: - F1

    func testF1_showsTheDriversChampionshipTop() {
        let event = EventBuilder.make(sport: "f1", title: "Belgian Grand Prix", time: "2026-07-25T13:00:00Z", tournament: "Formula 1")
        let table = StandingsTable.build(event: event, standings: standings)
        XCTAssertEqual(table?.title, "VM-STILLING")
        XCTAssertEqual(table?.rows.count, StandingsTable.topRows)
        XCTAssertEqual(table?.rows.first?.name, "Kimi Antonelli")
        XCTAssertEqual(table?.rows.first?.value, "204")
    }

    // MARK: - Honest absence

    func testFootball_noTableWhenNeitherTeamIsInIt() {
        // An OBOS-ligaen fixture must NOT render the Premier League top five as
        // if it were its own table (the honest gate).
        let event = EventBuilder.make(sport: "football", title: "Lyn vs Bryne", time: "2026-07-25T18:00:00Z",
                                      homeTeam: "Lyn", awayTeam: "Bryne", tournament: "OBOS-ligaen")
        XCTAssertNil(StandingsTable.build(event: event, standings: standings))
    }

    func testNoTableForASportWithoutOne_orWithoutData() {
        let chess = EventBuilder.make(sport: "chess", title: "Norway Chess", time: "2026-07-25T13:00:00Z")
        XCTAssertNil(StandingsTable.build(event: chess, standings: standings))
        let football = EventBuilder.make(sport: "football", title: "X vs Y", time: "2026-07-25T13:00:00Z",
                                         homeTeam: "X", awayTeam: "Y", tournament: "Premier League")
        XCTAssertNil(StandingsTable.build(event: football, standings: nil), "never synced → no table, no crash")
        XCTAssertNil(StandingsTable.build(event: football, standings: Standings()))
    }
}
