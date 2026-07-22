//
//  LiveScoreTests.swift
//  SportivistaTests
//
//  WP-172 — the live-score module, all network-free:
//    • LiveLeague — the polled league list (twin of SS_FOOTBALL_LEAGUES) + the
//      tournament→league mapping.
//    • LiveScorePlan — the per-league match-window gate (surface-pressure floor).
//    • ESPNScoreboard — parse a scoreboard blob + match it to board events.
//    • LiveScorePoller.pollOnce — the whole chain over a MOCK transport (no real
//      ESPN request ever fires) + LiveScoreStore's no-op-skipping apply.
//    • LiveScore — the row badge string + a11y label.
//

import XCTest

// MARK: - Shared helpers

private func iso(_ date: Date) -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f.string(from: date)
}

/// An ESPN soccer scoreboard blob for one in-progress / finished match.
private func scoreboardData(home: String, away: String, homeScore: Int, awayScore: Int,
                            clock: String, state: String) -> Data {
    let root: [String: Any] = [
        "events": [[
            "competitions": [[
                "status": ["type": ["state": state], "displayClock": clock],
                "competitors": [
                    ["homeAway": "home", "score": "\(homeScore)", "team": ["displayName": home]],
                    ["homeAway": "away", "score": "\(awayScore)", "team": ["displayName": away]],
                ],
            ]],
        ]],
    ]
    return try! JSONSerialization.data(withJSONObject: root)
}

/// A recording mock transport — every `pollOnce` request is captured, and only the
/// configured leagues answer. Nothing here touches the network. `pollOnce` awaits
/// each league sequentially, so the plain append is race-free (hence @unchecked
/// Sendable); the test reads `requested` only after the poll has fully completed.
private final class RecordingTransport: LiveScoreTransport, @unchecked Sendable {
    let responses: [String: Data]
    private(set) var requested: [String] = []

    init(responses: [String: Data] = [:]) { self.responses = responses }

    func scoreboard(leagueCode: String) async -> Data? {
        requested.append(leagueCode)
        return responses[leagueCode]
    }
}

// MARK: - LiveLeague

final class LiveLeagueTests: XCTestCase {
    func testCodesMirrorTheWebList() {
        // The same six as SS_FOOTBALL_LEAGUES (docs/js/shared-constants.js): the
        // sports-config football leagues minus esp.copa_del_rey. nor.1/nor.2 are the
        // WP-172 additions (a Lyn/Eliteserien match finally gets a live score).
        XCTAssertEqual(LiveLeague.all.map(\.code),
                       ["eng.1", "esp.1", "nor.1", "nor.2", "uefa.champions", "fifa.world"])
    }

    func testForEventMapsTournamentToLeague() {
        func league(_ tournament: String) -> String? {
            LiveLeague.forEvent(EventBuilder.make(sport: "football", title: "x", time: iso(Date()), tournament: tournament))?.code
        }
        XCTAssertEqual(league("Eliteserien"), "nor.1")
        XCTAssertEqual(league("Eliteserien 2026"), "nor.1")      // edition suffix
        XCTAssertEqual(league("OBOS-ligaen"), "nor.2")
        XCTAssertEqual(league("Champions League"), "uefa.champions") // shortened name ⊆ display name
        XCTAssertNil(league("NM Cupen"))                          // covered by research, no ESPN endpoint
        XCTAssertNil(league(""))
    }
}

// MARK: - LiveScorePlan (the gate)

final class LiveScorePlanTests: XCTestCase {
    private func football(_ tournament: String, kickoffHoursFromNow h: Double, now: Date) -> Event {
        EventBuilder.make(sport: "football", title: "x", time: iso(now.addingTimeInterval(h * 3600)), tournament: tournament)
    }

    func testPollsOnlyTheLeagueWithALiveMatch() {
        let now = Date()
        let events = [
            football("Eliteserien", kickoffHoursFromNow: -1, now: now), // live now
            football("Premier League", kickoffHoursFromNow: 6, now: now), // 6h out → skip
        ]
        XCTAssertEqual(LiveScorePlan.leaguesToPoll(events: events, now: now).map(\.code), ["nor.1"])
    }

    func testPollsNothingWhenNoMatchIsInWindow() {
        let now = Date()
        let events = [
            football("Eliteserien", kickoffHoursFromNow: -5, now: now), // finished long ago
            football("La Liga", kickoffHoursFromNow: 2, now: now),      // future
        ]
        XCTAssertTrue(LiveScorePlan.leaguesToPoll(events: events, now: now).isEmpty)
    }

    func testKeepsAJustFinishedMatchInWindow() {
        let now = Date()
        // 2.5h past kickoff — inside the 3h post-match tail, so the final score resolves.
        let events = [football("OBOS-ligaen", kickoffHoursFromNow: -2.5, now: now)]
        XCTAssertEqual(LiveScorePlan.leaguesToPoll(events: events, now: now).map(\.code), ["nor.2"])
    }

    func testDedupesTwoMatchesInOneLeague() {
        let now = Date()
        let events = [
            football("Eliteserien", kickoffHoursFromNow: -1, now: now),
            football("Eliteserien", kickoffHoursFromNow: -0.5, now: now),
        ]
        XCTAssertEqual(LiveScorePlan.leaguesToPoll(events: events, now: now).map(\.code), ["nor.1"])
    }

    func testIgnoresNonFootballLiveEvents() {
        let now = Date()
        let golf = EventBuilder.make(sport: "golf", title: "The Open", time: iso(now.addingTimeInterval(-3600)), tournament: "The Open")
        XCTAssertTrue(LiveScorePlan.leaguesToPoll(events: [golf], now: now).isEmpty)
    }
}

// MARK: - ESPNScoreboard (parse + match)

final class ESPNScoreboardTests: XCTestCase {
    func testParsesInAndPostSkipsPre() {
        let live = scoreboardData(home: "Lyn", away: "Sogndal", homeScore: 2, awayScore: 1, clock: "67'", state: "in")
        let parsed = ESPNScoreboard.parse(live)
        XCTAssertEqual(parsed, [.init(homeName: "Lyn", awayName: "Sogndal", home: 2, away: 1, clock: "67'", state: "in")])

        let pre = scoreboardData(home: "A", away: "B", homeScore: 0, awayScore: 0, clock: "", state: "pre")
        XCTAssertTrue(ESPNScoreboard.parse(pre).isEmpty)   // no score before kickoff
    }

    func testParseIsDefensiveAgainstJunk() {
        XCTAssertTrue(ESPNScoreboard.parse(Data("not json".utf8)).isEmpty)
        XCTAssertTrue(ESPNScoreboard.parse(try! JSONSerialization.data(withJSONObject: ["events": []])).isEmpty)
    }

    func testMatchesParsedToBoardEventByTeamNames() {
        let event = EventBuilder.make(sport: "football", title: "Lyn – Sogndal", time: iso(Date()),
                                      homeTeam: "Lyn", awayTeam: "Sogndal", tournament: "Eliteserien", id: "lyn1")
        let parsed = ESPNScoreboard.parse(scoreboardData(home: "FK Lyn Oslo", away: "Sogndal IL",
                                                          homeScore: 2, awayScore: 1, clock: "67'", state: "in"))
        let scores = ESPNScoreboard.liveScores(from: parsed, events: [event])
        XCTAssertEqual(scores["lyn1"], LiveScore(home: 2, away: 1, homeName: "FK Lyn Oslo",
                                                 awayName: "Sogndal IL", clock: "67'", state: "in"))
    }

    func testNoBoardEventNoScore() {
        let parsed = ESPNScoreboard.parse(scoreboardData(home: "Arsenal", away: "Chelsea",
                                                         homeScore: 1, awayScore: 0, clock: "20'", state: "in"))
        XCTAssertTrue(ESPNScoreboard.liveScores(from: parsed, events: []).isEmpty)
    }

    func testTeamMatchStripsAffixesAndAcceptsContainment() {
        XCTAssertTrue(ESPNScoreboard.teamMatch("Lyn", "FK Lyn Oslo"))
        XCTAssertTrue(ESPNScoreboard.teamMatch("Molde FK", "Molde"))
        XCTAssertFalse(ESPNScoreboard.teamMatch("Brann", "Bodø/Glimt"))
    }
}

// MARK: - LiveScorePoller.pollOnce (the whole chain, mocked transport)

final class LiveScorePollerTests: XCTestCase {
    func testPollsOnlyTheGatedLeagueAndEnrichesTheRow() async {
        let now = Date()
        let lyn = EventBuilder.make(sport: "football", title: "Lyn – Sogndal", time: iso(now.addingTimeInterval(-3600)),
                                    homeTeam: "Lyn", awayTeam: "Sogndal", tournament: "Eliteserien", id: "lyn1")
        let pl = EventBuilder.make(sport: "football", title: "Arsenal – Chelsea", time: iso(now.addingTimeInterval(6 * 3600)),
                                   homeTeam: "Arsenal", awayTeam: "Chelsea", tournament: "Premier League", id: "pl1")
        let transport = RecordingTransport(responses: [
            "nor.1": scoreboardData(home: "Lyn", away: "Sogndal", homeScore: 2, awayScore: 1, clock: "67'", state: "in"),
        ])

        let scores = await LiveScorePoller.pollOnce(events: [lyn, pl], now: now, transport: transport)

        // ONLY nor.1 was requested — never eng.1/esp.1/fifa.world (the old hardcoded set).
        XCTAssertEqual(transport.requested, ["nor.1"])
        XCTAssertEqual(scores["lyn1"], LiveScore(home: 2, away: 1, homeName: "Lyn", awayName: "Sogndal", clock: "67'", state: "in"))
    }

    func testPollsNoLeagueWhenNothingInWindow() async {
        let now = Date()
        let future = EventBuilder.make(sport: "football", title: "A – B", time: iso(now.addingTimeInterval(4 * 3600)),
                                       homeTeam: "A", awayTeam: "B", tournament: "La Liga", id: "f1")
        let transport = RecordingTransport()
        let scores = await LiveScorePoller.pollOnce(events: [future], now: now, transport: transport)
        XCTAssertTrue(transport.requested.isEmpty)  // zero ESPN requests when nothing is on
        XCTAssertTrue(scores.isEmpty)
    }

    @MainActor
    func testStoreApplySkipsNoOp() {
        let store = LiveScoreStore()
        store.apply(["a": LiveScore(home: 1, away: 0, homeName: "A", awayName: "B", clock: "10'", state: "in")])
        let first = store.scores
        store.apply(first) // identical ⇒ no-op (the guard); still the same content
        XCTAssertEqual(store.scores, first)
        store.clear()
        XCTAssertTrue(store.scores.isEmpty)
    }
}

// MARK: - LiveScore (the badge string)

final class LiveScoreValueTests: XCTestCase {
    func testDisplayLiveHasClockFinishedDoesNot() {
        let live = LiveScore(home: 2, away: 1, homeName: "Lyn", awayName: "Sogndal", clock: "67'", state: "in")
        XCTAssertEqual(live.display, "2–1 · 67'")
        XCTAssertTrue(live.isLive)

        let done = LiveScore(home: 2, away: 1, homeName: "Lyn", awayName: "Sogndal", clock: "", state: "post")
        XCTAssertEqual(done.display, "2–1")
        XCTAssertFalse(done.isLive)
    }

    func testAccessibilityLabel() {
        let live = LiveScore(home: 2, away: 1, homeName: "Lyn", awayName: "Sogndal", clock: "67'", state: "in")
        XCTAssertEqual(live.accessibilityLabel, "Lyn 2, Sogndal 1, 67'")
        let done = LiveScore(home: 2, away: 1, homeName: "Lyn", awayName: "Sogndal", clock: "", state: "post")
        XCTAssertEqual(done.accessibilityLabel, "Lyn 2, Sogndal 1, slutt")
    }
}
