//
//  FeedCompilerUnitTests.swift
//  ZenjiTests
//
//  WP-13 — unit tests for the parts of the FeedCompiler that the golden
//  vectors do NOT cover: the Europe/Oslo day grouping (explicitly out of
//  vector scope per the WP-13 brief — kept simple, tested here), plus
//  focused checks on the text-normalisation primitives (TextMatch) that the
//  vector suite exercises only indirectly. These guard the "dangerous"
//  diacritic/word-boundary port against regressions with named, minimal cases.
//

import XCTest

final class FeedCompilerUnitTests: XCTestCase {

    // MARK: - Date helper

    private func iso(_ s: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)!
    }

    // MARK: - TextMatch.normalize (server normalizeText port)

    func testNormalize_foldsDiacritics_andLowercases() {
        XCTAssertEqual(TextMatch.normalize("Barça"), "barca")
        XCTAssertEqual(TextMatch.normalize("Barca"), "barca")
        XCTAssertEqual(TextMatch.normalize("Vålerenga"), "valerenga")
        XCTAssertEqual(TextMatch.normalize("LILLESTRØM"), "lillestrøm") // ø has no NFD decomposition — stays, as in JS
        XCTAssertEqual(TextMatch.normalize(nil), "")
        XCTAssertEqual(TextMatch.normalize(""), "")
    }

    // MARK: - TextMatch.containsName (word-boundary, accent-insensitive)

    func testContainsName_wordBoundaryAndDiacritics() {
        XCTAssertTrue(TextMatch.containsName("Lyn Oslo", "Lyn"))
        XCTAssertTrue(TextMatch.containsName("Vålerenga – Lyn", "Lyn"))
        // The pinned false-positive the bell (word boundary) must AVOID —
        // "Brooklyn" contains "lyn" only as a substring.
        XCTAssertFalse(TextMatch.containsName("Brooklyn FC", "Lyn"))
        // Diacritic folding: "Barça" ≡ "Barca".
        XCTAssertTrue(TextMatch.containsName("FC Barça", "Barca"))
        XCTAssertTrue(TextMatch.containsName("Barcelona vs Sevilla", "Barcelona"))
        XCTAssertFalse(TextMatch.containsName("", "Lyn"))
        XCTAssertFalse(TextMatch.containsName("anything", ""))
    }

    // MARK: - osloDayKey (Europe/Oslo, summer = UTC+2)

    func testOsloDayKey_crossesMidnightInLocalTime() {
        // 21:30Z in July is 23:30 Oslo (CEST, +2) → still 13 July.
        XCTAssertEqual(FeedCompiler.osloDayKey(iso("2026-07-13T21:30:00Z")), "2026-07-13")
        // 22:30Z is 00:30 Oslo next day → 14 July.
        XCTAssertEqual(FeedCompiler.osloDayKey(iso("2026-07-13T22:30:00Z")), "2026-07-14")
    }

    // MARK: - compile: day grouping

    private var followFootballAndGolf: Interests {
        Interests(
            followBroadly: ["football", "golf"],
            alwaysTrack: Interests.AlwaysTrack(
                teams: [Interests.Entity(name: "Lyn", aliases: ["Lyn Oslo"], sport: "football")]
            )
        )
    }

    func testCompile_groupsByOsloDay_andSortsWithinDay() {
        let now = iso("2026-07-13T12:00:00Z") // Oslo 14:00, day 2026-07-13
        let events = [
            FeedEvent(id: "a", sport: "football", title: "Kamp A", time: iso("2026-07-13T18:00:00Z")),
            FeedEvent(id: "b", sport: "golf", title: "Runde", time: iso("2026-07-14T06:00:00Z")),
        ]
        let feed = FeedCompiler.compile(events: events, interests: followFootballAndGolf, now: now)

        XCTAssertEqual(feed.days.map { $0.key }, ["2026-07-13", "2026-07-14"])
        XCTAssertEqual(feed.days[0].items.count, 1)
        XCTAssertEqual(feed.days[1].items.count, 1)
    }

    func testCompile_multiDayStillRunning_movesUnderToday() {
        let now = iso("2026-07-13T12:00:00Z")
        let multiDay = FeedEvent(
            id: "open", sport: "golf", title: "The Open",
            time: iso("2026-07-10T06:00:00Z"), endTime: iso("2026-07-15T18:00:00Z")
        )
        let feed = FeedCompiler.compile(events: [multiDay], interests: followFootballAndGolf, now: now)

        // Started 10 July but still running → grouped under today (13 July),
        // not its past start day. Mirrors dashboard.js:352.
        XCTAssertEqual(feed.days.map { $0.key }, ["2026-07-13"])
    }

    // MARK: - compile: annotation (bell + accent) is attached to events

    func testCompile_annotatesBellAndAccentForTrackedTeam() {
        let now = iso("2026-07-13T12:00:00Z")
        let lyn = FeedEvent(
            id: "lyn", sport: "football", title: "Lyn – Fram",
            tournament: "OBOS-ligaen", time: iso("2026-07-13T15:00:00Z"),
            homeTeam: "Lyn", awayTeam: "Fram"
        )
        let feed = FeedCompiler.compile(events: [lyn], interests: followFootballAndGolf, now: now)
        let item = try? XCTUnwrap(feed.days.first?.items.first)
        guard case .event(_, let mustWatch, let mustSee) = item else {
            return XCTFail("expected a single annotated event row")
        }
        XCTAssertTrue(mustWatch, "tracked notify-team Lyn should arm the bell")
        XCTAssertTrue(mustSee, "tracked team Lyn should earn the accent")
    }
}
