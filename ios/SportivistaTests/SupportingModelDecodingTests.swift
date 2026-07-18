//
//  SupportingModelDecodingTests.swift
//  SportivistaTests
//
//  WP-11 acceptance (c): manifest.json, entities.json and tracked.json all
//  decode against their fresh fixtures.
//

import XCTest

final class SupportingModelDecodingTests: XCTestCase {
    // MARK: Manifest (docs/data/manifest.json, WP-03)

    func testManifestDecodes() throws {
        let manifest = try SportivistaJSON.decoder.decode(Manifest.self, from: Fixture.data("manifest"))
        let raw = Fixture.rawObject("manifest")
        let rawFiles = try XCTUnwrap(raw["files"] as? [String: Any])

        XCTAssertEqual(manifest.schemaVersion, 1)
        XCTAssertEqual(manifest.files.count, rawFiles.count)

        let eventsEntry = try XCTUnwrap(manifest.files["events.json"])
        let rawEventsEntry = try XCTUnwrap(rawFiles["events.json"] as? [String: Any])
        XCTAssertEqual(eventsEntry.bytes, rawEventsEntry["bytes"] as? Int)
        XCTAssertEqual(eventsEntry.sha256, rawEventsEntry["sha256"] as? String)

        // A per-sport file mirrors the source's own lastUpdated as
        // sourceLastUpdated; manifest.json itself never carries one.
        let footballEntry = try XCTUnwrap(manifest.files["football.json"])
        XCTAssertNotNil(footballEntry.sourceLastUpdated)
        let calibrationEntry = try XCTUnwrap(manifest.files["calibration.json"])
        XCTAssertNil(calibrationEntry.sourceLastUpdated)
    }

    // MARK: Entities (docs/data/entities.json, WP-05)

    func testEntitiesDecode() throws {
        let entities = try SportivistaJSON.decoder.decode([Entity].self, from: Fixture.data("entities"))
        let raw = Fixture.rawArray("entities")
        XCTAssertEqual(entities.count, raw.count)

        let lyn = try XCTUnwrap(entities.first { $0.id == "fk-lyn-oslo" })
        XCTAssertEqual(lyn.name, "FK Lyn Oslo")
        XCTAssertEqual(lyn.sport, "football")
        XCTAssertEqual(lyn.type, "team")
        XCTAssertTrue(lyn.aliases.contains("Lyn"))

        let hovland = try XCTUnwrap(entities.first { $0.id == "viktor-hovland" })
        XCTAssertEqual(hovland.type, "athlete")
        XCTAssertEqual(hovland.sport, "golf")

        // Every decoded entity must have a non-empty id/name/sport/type —
        // proves the required fields never silently fell back to "".
        for entity in entities {
            XCTAssertFalse(entity.id.isEmpty)
            XCTAssertFalse(entity.name.isEmpty)
            XCTAssertFalse(entity.sport.isEmpty)
            XCTAssertFalse(entity.type.isEmpty)
        }
    }

    // MARK: TrackedConfig (scripts/config/tracked.json)

    func testTrackedConfigDecodes() throws {
        let tracked = try SportivistaJSON.decoder.decode(TrackedConfig.self, from: Fixture.data("tracked"))
        let raw = Fixture.rawObject("tracked")

        XCTAssertEqual(tracked.version, raw["version"] as? Int)
        XCTAssertEqual(tracked.leagues.count, (raw["leagues"] as? [Any])?.count)
        XCTAssertEqual(tracked.athletes.count, (raw["athletes"] as? [Any])?.count)
        XCTAssertEqual(tracked.tournaments.count, (raw["tournaments"] as? [Any])?.count)
        XCTAssertEqual(tracked.notes.count, (raw["notes"] as? [Any])?.count)

        let hovland = try XCTUnwrap(tracked.athletes.first { $0.id == "viktor-hovland" })
        XCTAssertEqual(hovland.sport, "golf")
        XCTAssertFalse(hovland.reason.isEmpty)
        XCTAssertTrue(hovland.evidence.contains { $0.hasPrefix("interests.json#") })
        XCTAssertEqual(hovland.priority, "high")

        // Most entries have no `expires` — proves the Optional path, not
        // just the default-array path exercised above.
        XCTAssertNil(hovland.expires)
    }
}
