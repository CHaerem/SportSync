//
//  ForwardCompatibilityTests.swift
//  ZenjiTests
//
//  WP-11 acceptance (d): JSON carrying an unknown extra field decodes fine
//  (the server can add a field tomorrow without breaking today's app).
//  WP-11 acceptance (e), direct form: both ISO 8601 date shapes in the
//  contract parse through the shared ZenjiJSON decoder strategy (in
//  isolation here; EventDecodingTests proves the same thing against real
//  fixture events).
//

import XCTest

final class ForwardCompatibilityTests: XCTestCase {
    // MARK: (d) Unknown fields are ignored

    func testEventDecodesWithUnknownTopLevelField() throws {
        let json = """
        {
            "sport": "football",
            "title": "Test United – Test City",
            "time": "2026-08-02T15:00:00Z",
            "aBrandNewFieldNoClientKnowsAboutYet": { "nested": ["still", "fine"] }
        }
        """.data(using: .utf8)!

        let event = try ZenjiJSON.decoder.decode(Event.self, from: json)
        XCTAssertEqual(event.sport, "football")
        XCTAssertEqual(event.title, "Test United – Test City")
        // Fields never present at all get their documented defaults.
        XCTAssertEqual(event.streaming, [])
        XCTAssertFalse(event.mustWatch)
        XCTAssertNil(event.id)
    }

    func testEntityArrayDecodesWithUnknownField() throws {
        let json = """
        [
            { "id": "x", "name": "X", "aliases": [], "sport": "football", "type": "team",
              "futureExtraField": 42 }
        ]
        """.data(using: .utf8)!

        let entities = try ZenjiJSON.decoder.decode([Entity].self, from: json)
        XCTAssertEqual(entities.count, 1)
        XCTAssertEqual(entities.first?.id, "x")
    }

    // MARK: (e) Both ISO 8601 date shapes parse, in isolation

    private struct DateHolder: Decodable {
        var value: Date
    }

    func testWithFractionalSecondsParses() throws {
        let json = #"{"value": "2026-07-16T04:00:00.000Z"}"#.data(using: .utf8)!
        let holder = try ZenjiJSON.decoder.decode(DateHolder.self, from: json)

        var expected = DateComponents()
        expected.year = 2026; expected.month = 7; expected.day = 16
        expected.hour = 4; expected.minute = 0; expected.second = 0
        let calendar = Calendar(identifier: .gregorian)
        var utc = calendar
        utc.timeZone = TimeZone(identifier: "UTC")!
        XCTAssertEqual(holder.value, utc.date(from: expected))
    }

    func testWithoutFractionalSecondsParses() throws {
        let json = #"{"value": "2026-08-02T15:00:00Z"}"#.data(using: .utf8)!
        let holder = try ZenjiJSON.decoder.decode(DateHolder.self, from: json)

        var expected = DateComponents()
        expected.year = 2026; expected.month = 8; expected.day = 2
        expected.hour = 15; expected.minute = 0; expected.second = 0
        let calendar = Calendar(identifier: .gregorian)
        var utc = calendar
        utc.timeZone = TimeZone(identifier: "UTC")!
        XCTAssertEqual(holder.value, utc.date(from: expected))
    }

    func testUnparsableDateStringThrows() {
        let json = #"{"value": "not-a-date"}"#.data(using: .utf8)!
        XCTAssertThrowsError(try ZenjiJSON.decoder.decode(DateHolder.self, from: json))
    }
}
