//
//  AgendaViewModelTests.swift
//  ZenjiTests
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
        // Stages run 1–4 July (ISO week 27); "now" is 10 July (week 28) — a
        // different ISO week, so the summary carries no "denne uka"
        // qualifier (AgendaFormatTests covers that qualifier directly) while
        // still comfortably inside the 14-day relevance retention window.
        let now = iso("2026-07-10T08:00:00Z")
        let stages = (1...4).map { n in
            EventBuilder.make(
                sport: "cycling", title: "Etappe \(n)", time: "2026-07-0\(n)T11:00:00Z",
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
        let now = iso("2026-07-10T08:00:00Z")
        let stages = (1...3).map { n in
            EventBuilder.make(sport: "cycling", title: "Etappe \(n)", time: "2026-07-0\(n)T11:00:00Z", tournament: "Tour de Test")
        }
        let interests = Interests(followBroadly: ["cycling"])

        let sections = AgendaViewModel.buildSections(events: stages, interests: interests, now: now)
        XCTAssertEqual(allItems(sections).count, 3, "fewer than 4 stages must stay as individual rows")
    }

    // MARK: - End-to-end against the real, checked-in fixtures

    func testBuildSections_realFixtures_tourDeFranceCollapsesAndLynIsMustWatch() throws {
        let events = try ZenjiJSON.decoder.decode([Event].self, from: Fixture.data("events"))
        let interests = try ZenjiJSON.decoder.decode(Interests.self, from: Fixture.data("interests"))
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
