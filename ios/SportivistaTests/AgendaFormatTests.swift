//
//  AgendaFormatTests.swift
//  SportivistaTests
//
//  WP-14 — focused, named-case tests for every AgendaFormat rule: the "når"/
//  "hva"/"hvor" row columns, the Norwegian day-section label, and the
//  collapsed-series summary line.
//

import XCTest

final class AgendaFormatTests: XCTestCase {

    private func iso(_ s: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)!
    }

    // MARK: - timeLabel ("når")

    func testTimeLabel_singleDayEvent_isHourMinute() {
        // 18:00Z in July is 20:00 Oslo (CEST, +2).
        XCTAssertEqual(AgendaFormat.timeLabel(time: iso("2026-07-25T18:00:00Z"), endTime: nil), "20:00")
    }

    func testTimeLabel_sameOsloDayEndTime_stillHourMinute() {
        // A football match with a same-day endTime must NOT be treated as a
        // "multi-day window" — only a genuinely different Oslo calendar day
        // triggers the window format.
        let time = iso("2026-07-25T18:00:00Z")
        let endTime = iso("2026-07-25T19:50:00Z")
        XCTAssertEqual(AgendaFormat.timeLabel(time: time, endTime: endTime), "20:00")
    }

    func testTimeLabel_multiDayEvent_showsWindow() {
        // The Open: 16–19 July. Norwegian CLDR's "MMM" pattern renders the
        // full month name for July ("juli", not an abbreviation) — verified
        // directly against DateFormatter, not assumed.
        let time = iso("2026-07-16T04:00:00Z")
        let endTime = iso("2026-07-19T20:00:00Z")
        XCTAssertEqual(AgendaFormat.timeLabel(time: time, endTime: endTime), "16.–19. juli")
    }

    func testTimeLabel_noTime_isHonestDash() {
        XCTAssertEqual(AgendaFormat.timeLabel(time: nil, endTime: nil), "–")
    }

    // MARK: - title ("hva")

    func testTitle_teamMatch_isHomeDashAway() {
        XCTAssertEqual(AgendaFormat.title(homeTeam: "Lyn", awayTeam: "Sogndal", fallback: "irrelevant"), "Lyn – Sogndal")
    }

    func testTitle_noTeams_fallsBackToEventTitle() {
        XCTAssertEqual(AgendaFormat.title(homeTeam: nil, awayTeam: nil, fallback: "Sjakk-NM 2026"), "Sjakk-NM 2026")
    }

    func testTitle_oneTeamMissing_fallsBackToEventTitle() {
        XCTAssertEqual(AgendaFormat.title(homeTeam: "Lyn", awayTeam: nil, fallback: "Lyn – Sogndal"), "Lyn – Sogndal")
    }

    // MARK: - title with head-to-head participants (WP-112 — the "VM-finale" hole)

    func testTitle_twoParticipantsGenericTitle_isMatchup() {
        // The VM-finale shape: participants Spania/Argentina under a generic
        // "VM-finalen 2026", no home/away teams → the matchup becomes the title.
        XCTAssertEqual(
            AgendaFormat.title(homeTeam: nil, awayTeam: nil, participants: [Participant(name: "Spania"), Participant(name: "Argentina")], fallback: "VM-finalen 2026"),
            "Spania – Argentina"
        )
    }

    func testTitle_teamsWinOverParticipants() {
        // Explicit home/away teams still take precedence over participants.
        XCTAssertEqual(
            AgendaFormat.title(homeTeam: "Lyn", awayTeam: "Sogndal", participants: [Participant(name: "A"), Participant(name: "B")], fallback: "irrelevant"),
            "Lyn – Sogndal"
        )
    }

    func testTitle_singleParticipant_keepsTitle() {
        // A lone participant (a cycling team entry) is NOT a head-to-head.
        XCTAssertEqual(
            AgendaFormat.title(homeTeam: nil, awayTeam: nil, participants: [Participant(name: "Uno-X Mobility")], fallback: "Arctic Race of Norway 2026"),
            "Arctic Race of Norway 2026"
        )
    }

    func testTitle_manyParticipants_keepsTitle_neverANameList() {
        // A four-team CS2 group stage (or a golf field) must never become a name
        // list — the many-participant case keeps the event's own title.
        let field = [Participant(name: "Team Vitality"), Participant(name: "Natus Vincere"), Participant(name: "FaZe Clan"), Participant(name: "Team Falcons")]
        XCTAssertEqual(
            AgendaFormat.title(homeTeam: nil, awayTeam: nil, participants: field, fallback: "Esports World Cup 2026 – CS2 (gruppespill)"),
            "Esports World Cup 2026 – CS2 (gruppespill)"
        )
    }

    func testTitle_titleAlreadyNamesBothSides_keepsTitle() {
        // A non-generic title that already carries both names is left alone (no
        // redundant re-write, keeps any extra framing the title adds).
        XCTAssertEqual(
            AgendaFormat.title(homeTeam: nil, awayTeam: nil, participants: [Participant(name: "Spania"), Participant(name: "Argentina")], fallback: "Spania mot Argentina (finale)"),
            "Spania mot Argentina (finale)"
        )
    }

    func testTitle_participantWithEmptyName_notTreatedAsMatchup() {
        // A malformed pair with an empty side is not a matchup → keep the title.
        XCTAssertEqual(
            AgendaFormat.title(homeTeam: nil, awayTeam: nil, participants: [Participant(name: "Spania"), Participant(name: "   ")], fallback: "VM-finalen 2026"),
            "VM-finalen 2026"
        )
    }

    func testMatchupTitle_directHelper() {
        XCTAssertEqual(AgendaFormat.matchupTitle(participants: [Participant(name: "Spania"), Participant(name: "Argentina")], title: "VM-finalen 2026"), "Spania – Argentina")
        XCTAssertNil(AgendaFormat.matchupTitle(participants: [Participant(name: "Spania")], title: "Noe"))
        XCTAssertNil(AgendaFormat.matchupTitle(participants: [], title: "Noe"))
    }

    // MARK: - aboutParagraphs (WP-127 — the "Om" wall, split calmly)
    // Mirrors the web dashboard-cards "«Om» readability" cases so the two
    // surfaces split identically (dashboard.js `aboutParagraphs`).

    func testAboutParagraphs_multiSentence_splitsIntoParagraphs() {
        let summary = "Første setning her. Andre setning her. Tredje setning kommer. Fjerde runder av."
        let paras = AgendaFormat.aboutParagraphs(summary)
        XCTAssertGreaterThan(paras.count, 1, "four sentences must not stay one wall")
        // Grouped into runs of two.
        XCTAssertEqual(paras.count, 2)
        XCTAssertEqual(paras[0], "Første setning her. Andre setning her.")
        XCTAssertEqual(paras[1], "Tredje setning kommer. Fjerde runder av.")
    }

    func testAboutParagraphs_doesNotSplitInsideAbbreviationsOrNumbers() {
        // "kl. 21.00" and "29. juli" must NOT be read as sentence boundaries —
        // two real sentences (≤2) collapse to one calm block.
        let summary = "Kampen vises på NRK1 (kl. 21.00 norsk tid). Løpet går 29. juli i Aalborg."
        let paras = AgendaFormat.aboutParagraphs(summary)
        XCTAssertEqual(paras.count, 1)
        XCTAssertTrue(paras[0].contains("kl. 21.00"))
        XCTAssertTrue(paras[0].contains("29. juli"))
    }

    func testAboutParagraphs_explicitBlankLines_splitFirst() {
        let summary = "Første avsnitt.\n\nAndre avsnitt her."
        let paras = AgendaFormat.aboutParagraphs(summary)
        XCTAssertEqual(paras, ["Første avsnitt.", "Andre avsnitt her."])
    }

    func testAboutParagraphs_collapsesWhitespaceWithinABlock() {
        let summary = "Ett  avsnitt   med\n  ekstra   mellomrom."
        let paras = AgendaFormat.aboutParagraphs(summary)
        XCTAssertEqual(paras, ["Ett avsnitt med ekstra mellomrom."])
    }

    func testAboutParagraphs_emptyOrNil_isEmpty() {
        XCTAssertEqual(AgendaFormat.aboutParagraphs(""), [])
        XCTAssertEqual(AgendaFormat.aboutParagraphs("   "), [])
        XCTAssertEqual(AgendaFormat.aboutParagraphs(nil), [])
    }

    // MARK: - metaLabel (the quiet second line, "ved behov")

    func testMetaLabel_tournamentDistinctFromTitle_isShown() {
        XCTAssertEqual(AgendaFormat.metaLabel(tournament: "Eliteserien", title: "Lyn – Sogndal"), "Eliteserien")
    }

    func testMetaLabel_tournamentAlreadyInTitle_isNil() {
        // "Sjakk-NM 2026 – eliteklassen" already names its tournament, so no
        // redundant second line.
        XCTAssertNil(AgendaFormat.metaLabel(tournament: "Sjakk-NM 2026", title: "Sjakk-NM 2026 – eliteklassen"))
    }

    func testMetaLabel_equalOrEmpty_isNil() {
        XCTAssertNil(AgendaFormat.metaLabel(tournament: "The Open", title: "The Open"))
        XCTAssertNil(AgendaFormat.metaLabel(tournament: "", title: "Noe"))
        XCTAssertNil(AgendaFormat.metaLabel(tournament: nil, title: "Noe"))
    }

    // MARK: - humanizeGolfMeta (WP-147 — plain-language golf status for the row)

    func testHumanizeGolfMeta_writesOutRound_dropsPlacement_keepsScore() {
        // "R2 · −4 · T8" → round written out, placement dropped, score kept.
        XCTAssertEqual(AgendaFormat.humanizeGolfMeta("R2 · −4 · T8", sport: "golf"), "Runde 2 · −4")
    }

    func testHumanizeGolfMeta_barePositionPlacementDropped() {
        // A leaderboard position without the "T" (leader/solo) is still placement.
        XCTAssertEqual(AgendaFormat.humanizeGolfMeta("R4 · +1 · 12", sport: "golf"), "Runde 4 · +1")
    }

    func testHumanizeGolfMeta_keepsEvenParAndPlainScoreTokens() {
        // "E" (even par) is a score, not a placement — kept verbatim.
        XCTAssertEqual(AgendaFormat.humanizeGolfMeta("R1 · E · T1", sport: "golf"), "Runde 1 · E")
    }

    func testHumanizeGolfMeta_namesPassThroughUnchanged() {
        // The untimed-degradation meta is a list of followed NAMES — never a status;
        // names match neither the round nor the placement pattern, so they survive.
        XCTAssertEqual(AgendaFormat.humanizeGolfMeta("Hovland · Reitan", sport: "golf"), "Hovland · Reitan")
    }

    func testHumanizeGolfMeta_nonGolfUntouched() {
        // Only golf is reshaped; any other sport's meta passes through verbatim.
        XCTAssertEqual(AgendaFormat.humanizeGolfMeta("R2 · −4 · T8", sport: "football"), "R2 · −4 · T8")
    }

    func testHumanizeGolfMeta_onlyPlacement_isNil() {
        // A meta that is nothing but placement collapses to nil, so the caller can
        // fall back to the neutral tournament meta rather than show a bare "T8".
        XCTAssertNil(AgendaFormat.humanizeGolfMeta("T8", sport: "golf"))
    }

    // MARK: - channelLabel ("hvor")

    func testChannelLabel_firstPlatform() {
        let streaming = [StreamingChannel(platform: "TV 2 Play", url: "https://play.tv2.no"), StreamingChannel(platform: "Viaplay", url: nil)]
        XCTAssertEqual(AgendaFormat.channelLabel(streaming), "TV 2 Play")
    }

    func testChannelLabel_empty_isHonestDash() {
        XCTAssertEqual(AgendaFormat.channelLabel([]), "–")
    }

    func testChannelLabel_platformNilOrEmpty_isHonestDash() {
        XCTAssertEqual(AgendaFormat.channelLabel([StreamingChannel(platform: nil, url: nil)]), "–")
        XCTAssertEqual(AgendaFormat.channelLabel([StreamingChannel(platform: "", url: nil)]), "–")
    }

    // MARK: - dayLabel (Norwegian, Europe/Oslo)

    func testDayLabel_today_isIDag() {
        XCTAssertEqual(AgendaFormat.dayLabel(key: "2026-07-13", todayKey: "2026-07-13", tomorrowKey: "2026-07-14"), "I DAG")
    }

    func testDayLabel_tomorrow_isIMorgen() {
        XCTAssertEqual(AgendaFormat.dayLabel(key: "2026-07-14", todayKey: "2026-07-13", tomorrowKey: "2026-07-14"), "I MORGEN")
    }

    func testDayLabel_otherDay_isNorwegianWeekdayAndDate() {
        // 2026-07-14 is a Tuesday ("tirsdag").
        XCTAssertEqual(AgendaFormat.dayLabel(key: "2026-07-14", todayKey: "2026-07-10", tomorrowKey: "2026-07-11"), "TIRSDAG 14. JULI")
    }

    // MARK: - seriesSummary (collapsed stage race)

    func testSeriesSummary_lastStageThisWeek_appendsQualifier() {
        // Monday 2026-07-13 → last stage Thursday same ISO week.
        let now = iso("2026-07-13T08:00:00Z")
        let lastStageEnd = iso("2026-07-16T15:00:00Z")
        XCTAssertEqual(
            AgendaFormat.seriesSummary(tournament: "Tour de France", stageCount: 5, lastStageEnd: lastStageEnd, now: now),
            "Tour de France — 5 etapper denne uka"
        )
    }

    func testSeriesSummary_lastStageWeeksAway_noQualifier() {
        let now = iso("2026-07-13T08:00:00Z")
        let lastStageEnd = iso("2026-07-26T13:00:00Z")
        XCTAssertEqual(
            AgendaFormat.seriesSummary(tournament: "Tour de France", stageCount: 21, lastStageEnd: lastStageEnd, now: now),
            "Tour de France — 21 etapper"
        )
    }

    func testSeriesSummary_noEndDate_noQualifier() {
        XCTAssertEqual(
            AgendaFormat.seriesSummary(tournament: "Giro", stageCount: 4, lastStageEnd: nil, now: iso("2026-07-13T08:00:00Z")),
            "Giro — 4 etapper"
        )
    }
}
