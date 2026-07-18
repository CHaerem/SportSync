//
//  AgendaViewModelTests.swift
//  SportivistaTests
//
//  WP-14 — tests the PURE core of the agenda pipeline, `AgendaViewModel
//  .buildSections(events:interests:now:)`, against both hand-built `[Event]`
//  fixtures (via EventBuilder, for tightly-scoped single-rule checks) and the
//  real, checked-in events/interests fixtures (an end-to-end proof against
//  actual production data — same "reuse the real fixture" convention
//  EventDecodingTests/DataStoreTests already use).
//

import XCTest

final class AgendaViewModelTests: XCTestCase {

    private func iso(_ s: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)!
    }

    /// Flattens every section's items into one array, regardless of which
    /// day they landed under — most assertions below only care "does this
    /// row exist with these properties", not which section it's in.
    private func allItems(_ sections: [AgendaSection]) -> [AgendaItem] {
        sections.flatMap { $0.items }
    }

    // MARK: - Hand-built: day grouping with Norwegian labels

    func testBuildSections_groupsIntoTodayAndTomorrow_withNorwegianLabels() {
        let now = iso("2026-07-13T10:00:00Z") // Oslo noon, Monday 13 July
        let events = [
            EventBuilder.make(sport: "football", title: "Kamp i dag", time: "2026-07-13T18:00:00Z"),
            EventBuilder.make(sport: "football", title: "Kamp i morgen", time: "2026-07-14T18:00:00Z"),
        ]
        let interests = Interests(followBroadly: ["football"])

        let sections = AgendaViewModel.buildSections(events: events, interests: interests, now: now)

        XCTAssertEqual(sections.map { $0.label }, ["I DAG", "I MORGEN"])
        XCTAssertEqual(sections.map { $0.id }, ["2026-07-13", "2026-07-14"])
        XCTAssertEqual(sections[0].items.count, 1)
        XCTAssertEqual(sections[1].items.count, 1)
    }

    // MARK: - Hand-built: channel selection + honest "–" fallback

    func testBuildSections_channelLabel_firstStreamingPlatform() {
        let now = iso("2026-07-13T10:00:00Z")
        let events = [EventBuilder.make(
            sport: "chess", title: "Sjakk-NM", time: "2026-07-13T16:00:00Z",
            streaming: [["platform": "Direktesport", "url": "https://direktesport.no"], ["platform": "Lichess"]]
        )]
        let interests = Interests(followBroadly: ["chess"])

        let sections = AgendaViewModel.buildSections(events: events, interests: interests, now: now)
        guard case .event(let row) = allItems(sections).first else { return XCTFail("expected one event row") }
        XCTAssertEqual(row.channelLabel, "Direktesport")
    }

    func testBuildSections_noStreaming_isHonestDash() {
        let now = iso("2026-07-13T10:00:00Z")
        let events = [EventBuilder.make(sport: "chess", title: "Sjakk-NM", time: "2026-07-13T16:00:00Z")]
        let interests = Interests(followBroadly: ["chess"])

        let sections = AgendaViewModel.buildSections(events: events, interests: interests, now: now)
        guard case .event(let row) = allItems(sections).first else { return XCTFail("expected one event row") }
        XCTAssertEqual(row.channelLabel, "–")
    }

    // MARK: - Hand-built: must-see flag passthrough

    func testBuildSections_mustSeeFlag_reflectsFeedCompilerAnnotation() {
        let now = iso("2026-07-13T10:00:00Z")
        let events = [EventBuilder.make(
            sport: "football", title: "Lyn – Fram", time: "2026-07-13T18:00:00Z",
            homeTeam: "Lyn", awayTeam: "Fram"
        )]
        let interests = Interests(
            followBroadly: ["football"],
            alwaysTrack: Interests.AlwaysTrack(teams: [Interests.Entity(name: "Lyn", aliases: ["Lyn Oslo"], sport: "football")])
        )

        let sections = AgendaViewModel.buildSections(events: events, interests: interests, now: now)
        guard case .event(let row) = allItems(sections).first else { return XCTFail("expected one event row") }
        XCTAssertTrue(row.isMustSee, "tracked team Lyn should earn the accent")
        XCTAssertTrue(row.mustWatch, "tracked notify-team Lyn should also ring the bell")
    }

    func testBuildSections_untrackedEvent_isNotMustSee() {
        let now = iso("2026-07-13T10:00:00Z")
        let events = [EventBuilder.make(sport: "football", title: "Bodø/Glimt – Molde", time: "2026-07-13T18:00:00Z", homeTeam: "Bodø/Glimt", awayTeam: "Molde")]
        let interests = Interests(followBroadly: ["football"])

        let sections = AgendaViewModel.buildSections(events: events, interests: interests, now: now)
        guard case .event(let row) = allItems(sections).first else { return XCTFail("expected one event row") }
        XCTAssertFalse(row.isMustSee)
        XCTAssertFalse(row.mustWatch)
    }

    // MARK: - Hand-built: collapsed series summary text

    func testBuildSections_fourOrMoreStages_collapseIntoOneSeriesRow() {
        // WP-14.1: pinned v1 behaviour used past stages (1–4 July with "now"
        // = 10 July) — but DESIGN.md forbids passed days in the agenda, so
        // past stages now drop out entirely. Re-anchored to UPCOMING stages
        // (6–9 July, "now" = 3 July): still tests the ≥4 collapse, still a
        // different ISO week from the last stage so no "denne uka" qualifier.
        let now = iso("2026-07-03T06:00:00Z")
        let stages = (1...4).map { n in
            EventBuilder.make(
                sport: "cycling", title: "Etappe \(n)", time: "2026-07-0\(5 + n)T11:00:00Z",
                tournament: "Tour de Test", streaming: [["platform": "TV 2 Play"]]
            )
        }
        let interests = Interests(followBroadly: ["cycling"])

        let sections = AgendaViewModel.buildSections(events: stages, interests: interests, now: now)
        let items = allItems(sections)
        XCTAssertEqual(items.count, 1, "4 stages should collapse into exactly one row")
        guard case .series(let row) = items[0] else { return XCTFail("expected a series row") }
        XCTAssertEqual(row.stages.count, 4)
        XCTAssertEqual(row.summaryLabel, "Tour de Test — 4 etapper")
        XCTAssertEqual(row.tournament, "Tour de Test")
    }

    func testBuildSections_fewerThanFourStages_doNotCollapse() {
        // WP-14.1: re-anchored to UPCOMING stages (same reason as above —
        // past days no longer appear); "now" precedes the three stages.
        let now = iso("2026-07-01T06:00:00Z")
        let stages = (1...3).map { n in
            EventBuilder.make(sport: "cycling", title: "Etappe \(n)", time: "2026-07-0\(n)T11:00:00Z", tournament: "Tour de Test")
        }
        let interests = Interests(followBroadly: ["cycling"])

        let sections = AgendaViewModel.buildSections(events: stages, interests: interests, now: now)
        XCTAssertEqual(allItems(sections).count, 3, "fewer than 4 stages must stay as individual rows")
    }

    // MARK: - WP-14.1: DESIGN.md "Agendaens semantikk" — today first, never past

    func testBuildSections_todayFirst_neverShowsPastDays() {
        // A finished-yesterday event, a today event, and a future one. DESIGN.md
        // §1: the first section is I DAG, no passed day ever appears, and the
        // past event is gone (even though it is still inside FeedCompiler's
        // 14-day relevance retention window that the web results view needs).
        let now = iso("2026-07-14T10:00:00Z") // Tuesday, Oslo noon
        let events = [
            EventBuilder.make(sport: "football", title: "Ferdig i går", time: "2026-07-13T18:00:00Z"),
            EventBuilder.make(sport: "football", title: "I dag-kamp", time: "2026-07-14T18:00:00Z"),
            EventBuilder.make(sport: "football", title: "Om tre dager", time: "2026-07-17T18:00:00Z"),
        ]
        let interests = Interests(followBroadly: ["football"])

        let sections = AgendaViewModel.buildSections(events: events, interests: interests, now: now)

        XCTAssertEqual(sections.first?.label, "I DAG", "I DAG must be the first section, never a past day")
        XCTAssertFalse(sections.contains { $0.id < "2026-07-14" }, "no section may key to a passed day")
        let titles = allItems(sections).compactMap { item -> String? in
            if case .event(let row) = item { return row.title }
            return nil
        }
        XCTAssertFalse(titles.contains("Ferdig i går"), "a finished (past-day) event must not appear")
        XCTAssertTrue(titles.contains("I dag-kamp"))
        XCTAssertTrue(titles.contains("Om tre dager"))
    }

    func testBuildSections_ongoingMultiDayEvent_livesUnderTodayWithWindow() {
        // DESIGN.md §2: a multi-day event that STARTED before today but is
        // still running belongs under I DAG (not its past start day), with a
        // date WINDOW in the time column — not a misleading bare start time.
        let now = iso("2026-07-14T10:00:00Z")
        let event = EventBuilder.make(
            sport: "golf", title: "EFG Swiss Open Gstaad",
            time: "2026-07-13T08:30:00Z", endTime: "2026-07-20T03:59:00Z",
            streaming: [["platform": "TV 2 Play"]]
        )
        let interests = Interests(followBroadly: ["golf"])

        let sections = AgendaViewModel.buildSections(events: [event], interests: interests, now: now)

        XCTAssertEqual(sections.count, 1)
        XCTAssertEqual(sections[0].label, "I DAG", "an ongoing multi-day event bor under I DAG")
        guard case .event(let row) = sections[0].items.first else { return XCTFail("expected one event row") }
        XCTAssertEqual(row.timeLabel, "13.–20. juli", "the window replaces the clock in the time column")
    }

    func testBuildSections_multiDayWindow_livesOnlyInTimeColumn_notMergedIntoTitle() {
        // The "13.–20. juliEFG" no-space breach: the window belongs ONLY to
        // the time column; the title stays the clean event name. These are
        // distinct fields — never concatenated (the view lays them out in
        // separate columns, so there is no missing space to lose).
        let now = iso("2026-07-14T10:00:00Z")
        let event = EventBuilder.make(
            sport: "golf", title: "EFG Swiss Open Gstaad",
            time: "2026-07-13T08:30:00Z", endTime: "2026-07-20T03:59:00Z"
        )
        let interests = Interests(followBroadly: ["golf"])

        let sections = AgendaViewModel.buildSections(events: [event], interests: interests, now: now)
        guard case .event(let row) = allItems(sections).first else { return XCTFail("expected one event row") }
        XCTAssertEqual(row.timeLabel, "13.–20. juli")
        XCTAssertEqual(row.title, "EFG Swiss Open Gstaad", "the title must not carry the date window")
        XCTAssertFalse(row.title.contains("juli"), "no date text may leak into the title")
    }

    // MARK: - WP-14.1: the "live now" line (DESIGN.md §4)

    func testLiveRows_ongoingEvent_isLiveWithChannel() {
        let now = iso("2026-07-14T12:00:00Z")
        let events = [EventBuilder.make(
            sport: "cycling", title: "Etappe 10", time: "2026-07-14T10:30:00Z",
            endTime: "2026-07-14T15:00:00Z", tournament: "Tour", streaming: [["platform": "TV 2 Play"]]
        )]
        let interests = Interests(followBroadly: ["cycling"])

        let live = AgendaViewModel.liveRows(events: events, interests: interests, now: now)
        XCTAssertEqual(live.count, 1)
        XCTAssertEqual(live[0].title, "Etappe 10")
        XCTAssertEqual(live[0].channelLabel, "TV 2 Play")
    }

    func testLiveRows_futureAndFinishedEvents_excluded() {
        let now = iso("2026-07-14T12:00:00Z")
        let events = [
            EventBuilder.make(sport: "cycling", title: "Ferdig", time: "2026-07-14T08:00:00Z", endTime: "2026-07-14T10:00:00Z"),
            EventBuilder.make(sport: "cycling", title: "Senere i dag", time: "2026-07-14T18:00:00Z"),
        ]
        let interests = Interests(followBroadly: ["cycling"])

        XCTAssertTrue(AgendaViewModel.liveRows(events: events, interests: interests, now: now).isEmpty)
    }

    func testLiveRows_cappedAtTwo() {
        let now = iso("2026-07-14T12:00:00Z")
        let events = (1...3).map { n in
            EventBuilder.make(sport: "cycling", title: "Live \(n)", time: "2026-07-14T11:00:00Z", endTime: "2026-07-14T15:00:00Z", tournament: "T\(n)")
        }
        let interests = Interests(followBroadly: ["cycling"])

        XCTAssertEqual(AgendaViewModel.liveRows(events: events, interests: interests, now: now).count, 2, "the live line shows at most two")
    }

    // MARK: - End-to-end against the real, checked-in fixtures

    func testBuildSections_realFixtures_tourDeFranceCollapsesAndLynIsMustWatch() throws {
        let events = try SportivistaJSON.decoder.decode([Event].self, from: Fixture.data("events"))
        let interests = try SportivistaJSON.decoder.decode(Interests.self, from: Fixture.data("interests"))
        let now = iso("2026-07-13T12:00:00Z")

        let sections = AgendaViewModel.buildSections(events: events, interests: interests, now: now)
        let items = allItems(sections)

        let series = items.compactMap { item -> AgendaSeriesRow? in
            if case .series(let row) = item { return row }
            return nil
        }
        let tdf = try XCTUnwrap(series.first { $0.tournament.contains("Tour de France") })
        XCTAssertEqual(tdf.stages.count, 21, "all 21 fixture stages should fold into one row")
        XCTAssertTrue(tdf.summaryLabel.contains("21 etapper"))

        let eventRows = items.compactMap { item -> AgendaEventRow? in
            if case .event(let row) = item { return row }
            return nil
        }
        let lynSogndal = try XCTUnwrap(eventRows.first { $0.event.id == "e75db0882adf" }) // "Lyn – Sogndal", see EventDecodingTests
        XCTAssertTrue(lynSogndal.mustWatch, "Lyn is a tracked, notify-by-default team")
        XCTAssertEqual(lynSogndal.channelLabel, "TV 2 Play")
        XCTAssertEqual(lynSogndal.title, "Lyn – Sogndal")

        // "Birmingham City – Barcelona" has an empty `streaming` array in the
        // fixture — the honest "–" fallback must hold on real data too.
        let noChannelEvent = try XCTUnwrap(eventRows.first { $0.event.title == "Birmingham City – Barcelona" })
        XCTAssertEqual(noChannelEvent.channelLabel, "–")
    }
}
