//
//  WidgetTimelineBuilderTests.swift
//  SportivistaTests
//
//  WP-14 — the widget's timeline logic, tested as the pure function it is
//  (see WidgetTimelineBuilder.swift's header): no WidgetKit, no disk, no
//  network — just events + interests + "now" in, entries out.
//

import XCTest

final class WidgetTimelineBuilderTests: XCTestCase {

    private func iso(_ s: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)!
    }

    // MARK: - ticks(from:) — "resten av dagen (kl-slag)"

    func testTicks_firstEntryIsAlwaysNow() {
        let now = iso("2026-07-13T08:00:00Z")
        XCTAssertEqual(WidgetTimelineBuilder.ticks(from: now).first, now)
    }

    func testTicks_areStrictlyIncreasingAndNeverBeforeNow() {
        let now = iso("2026-07-13T08:00:00Z") // Oslo 10:00
        let ticks = WidgetTimelineBuilder.ticks(from: now)
        XCTAssertGreaterThan(ticks.count, 1, "several hourly ticks remain before the Oslo day ends")
        XCTAssertTrue(ticks.allSatisfy { $0 >= now })
        XCTAssertEqual(ticks, ticks.sorted())
        XCTAssertEqual(Set(ticks).count, ticks.count, "no duplicate ticks")
    }

    func testTicks_lastMinutesOfTheDay_onlyNowItself() {
        let now = iso("2026-07-13T21:45:00Z") // Oslo 23:45 (CEST, +2) — 15 min to midnight
        XCTAssertEqual(WidgetTimelineBuilder.ticks(from: now), [now], "no full hour remains before the Oslo day rolls over")
    }

    // MARK: - nextHighlight — prefers must-see, else nearest upcoming

    func testNextHighlight_prefersMustSeeOverEarlierPlainEvent() {
        let now = iso("2026-07-13T08:00:00Z")
        let plainEarlier = EventBuilder.make(sport: "football", title: "Uinteressant kamp", time: "2026-07-13T10:00:00Z", homeTeam: "A", awayTeam: "B")
        let mustSeeLater = EventBuilder.make(sport: "football", title: "Lyn – Fram", time: "2026-07-13T14:00:00Z", homeTeam: "Lyn", awayTeam: "Fram")
        let interests = Interests(
            followBroadly: ["football"],
            alwaysTrack: Interests.AlwaysTrack(teams: [Interests.Entity(name: "Lyn", sport: "football")])
        )
        let pairs = [plainEarlier, mustSeeLater].map { (feed: FeedEvent(from: $0), event: $0) }

        let hit = WidgetTimelineBuilder.nextHighlight(pairs: pairs, interests: interests, now: now)
        XCTAssertEqual(hit?.event.title, "Lyn – Fram")
    }

    func testNextHighlight_noMustSee_fallsBackToNearestUpcoming() {
        let now = iso("2026-07-13T08:00:00Z")
        let sooner = EventBuilder.make(sport: "chess", title: "Sjakk A", time: "2026-07-13T09:00:00Z")
        let later = EventBuilder.make(sport: "chess", title: "Sjakk B", time: "2026-07-13T12:00:00Z")
        let interests = Interests(followBroadly: ["chess"])
        let pairs = [later, sooner].map { (feed: FeedEvent(from: $0), event: $0) } // deliberately out of order

        let hit = WidgetTimelineBuilder.nextHighlight(pairs: pairs, interests: interests, now: now)
        XCTAssertEqual(hit?.event.title, "Sjakk A")
    }

    func testNextHighlight_finishedEvent_isExcluded() {
        let now = iso("2026-07-13T12:00:00Z")
        let finished = EventBuilder.make(sport: "chess", title: "Ferdig parti", time: "2026-07-13T08:00:00Z", endTime: "2026-07-13T10:00:00Z")
        let interests = Interests(followBroadly: ["chess"])
        let pairs = [(feed: FeedEvent(from: finished), event: finished)]

        XCTAssertNil(WidgetTimelineBuilder.nextHighlight(pairs: pairs, interests: interests, now: now))
    }

    func testNextHighlight_nothingRelevant_isNil() {
        let now = iso("2026-07-13T08:00:00Z")
        XCTAssertNil(WidgetTimelineBuilder.nextHighlight(pairs: [], interests: Interests(), now: now))
    }

    // MARK: - buildEntries — end to end

    func testBuildEntries_reflectsChannelFromSourceEvent() {
        let now = iso("2026-07-13T08:00:00Z")
        let event = EventBuilder.make(
            sport: "golf", title: "The Open", time: "2026-07-13T10:00:00Z",
            streaming: [["platform": "Viaplay", "url": "https://viaplay.no"]]
        )
        let interests = Interests(followBroadly: ["golf"])

        let entries = WidgetTimelineBuilder.buildEntries(events: [event], interests: interests, now: now)

        let first = try? XCTUnwrap(entries.first)
        XCTAssertEqual(first?.hasHighlight, true)
        XCTAssertEqual(first?.title, "The Open")
        XCTAssertEqual(first?.channelLabel, "Viaplay")
    }

    func testBuildEntries_headToHeadParticipants_highlightTitleIsTheMatchup() {
        // WP-112/127 — an event carrying two participants but no home/away teams
        // (the "VM-finale" shape: generic title "VM-finalen 2026", participants
        // Spania/Argentina) must surface in the widget highlight as the matchup,
        // NOT the generic title — the same AgendaFormat.title the agenda row uses.
        let now = iso("2026-07-13T08:00:00Z")
        let event = EventBuilder.make(
            sport: "football", title: "VM-finalen 2026", time: "2026-07-13T18:00:00Z",
            tournament: "FIFA World Cup", participants: ["Spania", "Argentina"], importance: 5
        )
        let interests = Interests(followBroadly: ["football"])

        let entries = WidgetTimelineBuilder.buildEntries(events: [event], interests: interests, now: now)

        XCTAssertEqual(entries.first?.hasHighlight, true)
        XCTAssertEqual(entries.first?.title, "Spania – Argentina")
    }

    func testBuildEntries_noRelevantEvents_producesEmptyHighlightEntry() {
        let now = iso("2026-07-13T08:00:00Z")
        let entries = WidgetTimelineBuilder.buildEntries(events: [], interests: Interests(), now: now)

        XCTAssertFalse(entries.isEmpty)
        XCTAssertTrue(entries.allSatisfy { !$0.hasHighlight })
        XCTAssertEqual(entries.first?.title, "Ingenting i dag")
    }

    // MARK: - WP-176: the «siste resultat»-linje (medium + accessory families)

    func testBuildEntries_withoutASnapshot_carryNoResultLine() {
        let now = iso("2026-07-13T08:00:00Z")
        let event = EventBuilder.make(sport: "football", title: "Lyn – Fram", time: "2026-07-13T14:00:00Z", homeTeam: "Lyn", awayTeam: "Fram")
        let entries = WidgetTimelineBuilder.buildEntries(events: [event], interests: Interests(followBroadly: ["football"]), now: now)

        XCTAssertTrue(entries.allSatisfy { $0.resultLine == nil && $0.resultMeta == nil },
                      "no snapshot ⇒ the widget shows no result line at all (the honest quiet state)")
    }

    func testBuildEntries_carryThePreRenderedResultLineOnEveryTick() {
        let now = iso("2026-07-13T08:00:00Z")
        let event = EventBuilder.make(sport: "football", title: "Lyn – Fram", time: "2026-07-13T14:00:00Z", homeTeam: "Lyn", awayTeam: "Fram")
        let snapshot = WidgetResultSnapshot(line: "Brann – Rosenborg 2–1", meta: "Eliteserien", generatedAt: now)

        let entries = WidgetTimelineBuilder.buildEntries(
            events: [event], interests: Interests(followBroadly: ["football"]), now: now, resultSnapshot: snapshot
        )

        XCTAssertTrue(entries.allSatisfy { $0.resultLine == "Brann – Rosenborg 2–1" && $0.resultMeta == "Eliteserien" })
    }

    func testBuildEntries_resultLineSurvivesTheEmptyHighlightState() {
        // «Ingenting i dag» + gårsdagens resultat is a legitimate, honest widget.
        let now = iso("2026-07-13T08:00:00Z")
        let snapshot = WidgetResultSnapshot(line: "Brann – Rosenborg 2–1", meta: nil, generatedAt: now)
        let entries = WidgetTimelineBuilder.buildEntries(events: [], interests: Interests(), now: now, resultSnapshot: snapshot)

        XCTAssertEqual(entries.first?.title, "Ingenting i dag")
        XCTAssertEqual(entries.first?.resultLine, "Brann – Rosenborg 2–1")
    }

    func testEmptySnapshot_isTreatedAsNoLine() {
        let now = iso("2026-07-13T08:00:00Z")
        let blank = WidgetResultSnapshot(line: "", meta: "Eliteserien", generatedAt: now)
        let entries = WidgetTimelineBuilder.buildEntries(events: [], interests: Interests(), now: now, resultSnapshot: blank)

        XCTAssertNil(entries.first?.resultLine)
        XCTAssertNil(entries.first?.resultMeta, "an empty line never drags its meta along")
    }

    func testWidgetResultSnapshot_roundTripsThroughTheCacheEncoding() throws {
        let now = iso("2026-07-13T08:00:00Z")
        let snapshot = WidgetResultSnapshot(line: "Lyn – Sogndal 2–1", meta: "OBOS-ligaen", generatedAt: now)
        let data = try SyncState.encoder.encode(snapshot)
        XCTAssertEqual(try SportivistaJSON.decoder.decode(WidgetResultSnapshot.self, from: data), snapshot)
    }
}
