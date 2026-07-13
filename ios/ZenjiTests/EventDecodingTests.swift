//
//  EventDecodingTests.swift
//  ZenjiTests
//
//  WP-11 acceptance (a): the whole events.json fixture decodes without
//  error and the decoded count matches the raw JSON array. WP-11
//  acceptance (b): a known event with id + entityId + streaming round-
//  trips its fields correctly. WP-11 acceptance (e): both ISO 8601 date
//  variants seen in the real contract parse (proven here via two real
//  fixture events; ZenjiJSONDateFormatTests.swift also proves it directly
//  against the shared decoder).
//

import XCTest

final class EventDecodingTests: XCTestCase {
    private lazy var events: [Event] = try! ZenjiJSON.decoder.decode([Event].self, from: Fixture.data("events"))

    // MARK: (a) Whole fixture decodes; count matches

    func testEventsFixtureDecodesWithoutErrorAndCountMatches() {
        let rawCount = Fixture.rawArray("events").count
        XCTAssertGreaterThan(rawCount, 0, "fixture should be a fresh, non-empty snapshot")
        XCTAssertEqual(events.count, rawCount, "every element of events.json must decode — none silently dropped")
    }

    // MARK: (b) A known event (id + entityId + streaming) round-trips

    /// "Lyn – Sogndal" (OBOS-ligaen): carries a stable id, a team-side
    /// WP-05 entityId (homeTeamEntityId), a streaming entry, the full
    /// ai-research contract (source/confidence/evidence/researchedAt), and
    /// — notably — NO "isFavorite" key in the raw JSON, which doubles as a
    /// proof that Event's default-false fallback actually fires rather than
    /// silently failing to decode.
    func testKnownEvent_lynSogndal_roundTripsFields() throws {
        let event = try XCTUnwrap(events.first { $0.id == "e75db0882adf" })

        XCTAssertEqual(event.sport, "football")
        XCTAssertEqual(event.title, "Lyn – Sogndal")
        XCTAssertEqual(event.tournament, "OBOS-ligaen")
        XCTAssertEqual(event.homeTeam, "Lyn")
        XCTAssertEqual(event.awayTeam, "Sogndal")
        XCTAssertEqual(event.homeTeamEntityId, "fk-lyn-oslo")
        XCTAssertNil(event.awayTeamEntityId)
        XCTAssertTrue(event.norwegian)
        XCTAssertTrue(event.mustWatch)
        // Not present in the raw JSON at all — proves the decodeIfPresent-with-
        // default path, not just "Optional decodes to nil".
        XCTAssertFalse(event.isFavorite)

        XCTAssertEqual(event.streaming.count, 1)
        XCTAssertEqual(event.streaming.first?.platform, "TV 2 Play")
        XCTAssertEqual(event.streaming.first?.url, "https://play.tv2.no/sport")

        XCTAssertEqual(event.source, "ai-research")
        XCTAssertEqual(event.confidence, "high")
        XCTAssertEqual(event.evidence.count, 3)
        XCTAssertTrue(event.evidence.contains("https://obosligaenkamper.com/lyn/"))

        // time has no fractional seconds: "2026-08-02T15:00:00Z".
        XCTAssertEqual(event.time, isoDate("2026-08-02T15:00:00Z"))
        XCTAssertNil(event.endTime)
        // researchedAt likewise whole-second: "2026-07-05T11:00:00Z".
        XCTAssertEqual(event.researchedAt, isoDate("2026-07-05T11:00:00Z"))
        XCTAssertNil(event.verifiedAt)
    }

    /// "The Open": exercises the fractional-seconds ISO variant on
    /// `time`/`endTime`, and entityId on `norwegianPlayers` (as opposed to
    /// the team-side entityId proven above).
    func testKnownEvent_theOpen_roundTripsFractionalSecondsAndPlayerEntityIds() throws {
        let event = try XCTUnwrap(events.first { $0.id == "f61c77e8786f" })

        XCTAssertEqual(event.sport, "golf")
        XCTAssertEqual(event.title, "The Open")
        XCTAssertEqual(event.streaming.first?.platform, "Viaplay")
        XCTAssertTrue(event.mustWatch)
        XCTAssertEqual(event.totalPlayers, 156)

        XCTAssertEqual(event.norwegianPlayers.count, 2)
        let hovland = try XCTUnwrap(event.norwegianPlayers.first { $0.name == "Viktor Hovland" })
        XCTAssertEqual(hovland.entityId, "viktor-hovland")
        let reitan = try XCTUnwrap(event.norwegianPlayers.first { $0.name == "Kristoffer Reitan" })
        XCTAssertEqual(reitan.entityId, "kristoffer-reitan")

        // Both time and endTime carry fractional seconds in the raw fixture.
        XCTAssertEqual(event.time, isoDateWithFraction("2026-07-16T04:00:00.000Z"))
        XCTAssertEqual(event.endTime, isoDateWithFraction("2026-07-19T20:00:00.000Z"))
    }

    // MARK: - Helpers

    private func isoDate(_ string: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: string)!
    }

    private func isoDateWithFraction(_ string: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: string)!
    }
}
