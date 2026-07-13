//
//  AgendaFormatTests.swift
//  ZenjiTests
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
