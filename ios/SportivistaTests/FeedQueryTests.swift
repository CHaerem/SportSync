//
//  FeedQueryTests.swift
//  SportivistaTests
//
//  WP-16.4 — the LOCAL Q&A substrate. Proves FeedQuery reproduces the agenda
//  the user sees (same relevance filter, same when · what · where formatting)
//  and answers the questions the command line actually gets — all against the
//  real, checked-in events fixture, so an answer can never reference something
//  the board wouldn't.
//

import XCTest

final class FeedQueryTests: XCTestCase {

    // A fixed Oslo-morning clock on 14 July 2026 (matching the fixture window):
    // Etappe 10 (10:30Z) and VM-semifinale 1 (19:00Z) are still to come today.
    private let now = AssistantTestSupport.iso("2026-07-14T09:00:00Z")
    private func feed() -> FeedQuery { AssistantTestSupport.liveFeed(now: now) }

    func test_build_includesRelevantEventsInOrder() {
        let events = feed().events
        XCTAssertFalse(events.isEmpty)
        // Chronological (nil-time last).
        let times = events.compactMap { $0.time }
        XCTAssertEqual(times, times.sorted())
        // A followed event (football is in the default followBroadly) is present…
        XCTAssertTrue(events.contains { $0.id == "6a4d06a7d9f5" }, "VM-semifinale 1 is on the board")
        // …and reduced to the same when · what · where an agenda row shows.
        let semi = events.first { $0.id == "6a4d06a7d9f5" }
        XCTAssertEqual(semi?.channelLabel, "TV 2")
        XCTAssertEqual(semi?.timeLabel, "21:00", "19:00Z reads as 21:00 in Europe/Oslo")
    }

    func test_today_isTodaysUpcoming() {
        let today = feed().today()
        XCTAssertTrue(today.allSatisfy { $0.dayKey == "2026-07-14" })
        XCTAssertTrue(today.contains { $0.title == "VM-semifinale 1" })
        // A finished-earlier-today or past event must not appear.
        XCTAssertFalse(today.contains { ($0.time ?? .distantPast) < now })
    }

    func test_tonight_prefersTheEvening() {
        let tonight = feed().tonight()
        XCTAssertTrue(tonight.contains { $0.title == "VM-semifinale 1" }, "the 21:00 semifinal is tonight")
        XCTAssertFalse(tonight.contains { $0.title.contains("Etappe 10") },
                       "a 12:30 stage is not 'i kveld'")
    }

    func test_next_matchingTourDeFrance_isTheNextStage() {
        let index = AssistantTestSupport.liveIndex()
        let tdf = index.entity(id: "tour-de-france-2026")!
        let hit = feed().next(matching: tdf)
        XCTAssertEqual(hit?.id, "bfafa2ba58a1", "the next TdF stage after 09:00 is Etappe 10")
        XCTAssertEqual(hit?.channelLabel, "TV 2 Play")
        XCTAssertTrue(hit?.timeLabel.contains(":") ?? false, "a single-day stage shows a clock, not a window")
    }

    func test_search_bySport_returnsThatSportsUpcoming() {
        let hits = feed().search("fotball")
        XCTAssertFalse(hits.isEmpty)
        XCTAssertTrue(hits.allSatisfy { $0.sport == "football" })
    }

    func test_rowsForIds_resolvesAndDropsUnknown() {
        let f = feed()
        let rows = f.rows(forIds: ["6a4d06a7d9f5", "does-not-exist"], todayKey: "2026-07-14", tomorrowKey: "2026-07-15")
        XCTAssertEqual(rows.count, 1, "an unknown id is dropped, never a phantom row")
        XCTAssertEqual(rows.first?.title, "VM-semifinale 1")
        XCTAssertEqual(rows.first?.dayLabel, "I DAG")
        XCTAssertEqual(rows.first?.channelLabel, "TV 2")
    }
}
