//
//  FeedVectorTests.swift
//  SportivistaTests
//
//  WP-13 acceptance — the ONLY criterion for this package: the Swift
//  FeedCompiler reproduces EVERY expectation in EVERY golden feed-vector
//  bit-for-bit. These tests decode the SAME files the JS reference
//  (tests/feed-vectors.test.js) replays — referenced directly from the repo
//  root via project.yml (a bundled `feed-vectors` folder reference), never
//  copied — so the Swift port is proven against exactly the frozen fixtures,
//  with no possibility of a drifted copy.
//
//  Each vector is a self-contained { input, expected }. A vector declares only
//  the expectation keys it cares about; each key is asserted against the
//  matching FeedCompiler predicate as an UNORDERED id set (README §"Fixture
//  schema"). The four pinned server/client divergences (DIVERGENCES.md) are
//  part of the fixtures and are expected to pass here unchanged.
//
//  If a vector ever fails: DO NOT touch the fixture (it is frozen). The
//  failure message names the file + predicate; leave it red and escalate.
//

import XCTest

/// Anchors `Bundle(for:)` at the SportivistaTests bundle, where project.yml's
/// `../tests/fixtures/feed-vectors` folder reference lands as the bundled
/// subdirectory "feed-vectors".
private final class FeedVectorBundleMarker {}

final class FeedVectorTests: XCTestCase {

    // MARK: - Fixture model (mirrors README §"Fixture schema")

    struct Vector: Decodable {
        struct Window: Decodable {
            let start: Date
            let end: Date
        }
        struct Input: Decodable {
            let now: Date?
            let window: Window?
            let interests: Interests
            let events: [FeedEvent]
        }
        struct ExpectedSeries: Decodable {
            let isSeries: Bool
            let id: String
            let tournament: String?
            let stageCount: Int?
            let nextStageId: String?
        }
        struct Expected: Decodable {
            let relevant: [String]?
            let mustWatch: [String]?
            let mustSee: [String]?
            let inWindow: [String]?
            let series: [ExpectedSeries]?
        }
        let name: String
        let description: String
        let input: Input
        let expected: Expected
    }

    // MARK: - Loading

    private static let vectors: [(file: String, vector: Vector)] = {
        let bundle = Bundle(for: FeedVectorBundleMarker.self)
        let urls = (bundle.urls(forResourcesWithExtension: "json", subdirectory: "feed-vectors") ?? [])
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        precondition(!urls.isEmpty, "No feed-vector JSON found in the test bundle — check project.yml's ../tests/fixtures/feed-vectors folder reference.")
        return urls.map { url in
            do {
                let data = try Data(contentsOf: url)
                let vector = try SportivistaJSON.decoder.decode(Vector.self, from: data)
                return (url.lastPathComponent, vector)
            } catch {
                fatalError("Failed to decode feed-vector \(url.lastPathComponent): \(error)")
            }
        }
    }()

    // MARK: - Helpers

    /// Ids of `events` for which `predicate` holds, sorted (unordered compare).
    private func ids(_ events: [FeedEvent], where predicate: (FeedEvent) -> Bool) -> [String] {
        events.compactMap { predicate($0) ? $0.id : nil }.sorted()
    }

    private struct SeriesDescriptor: Equatable, Comparable {
        let isSeries: Bool
        let id: String
        let tournament: String?
        let stageCount: Int?
        let nextStageId: String?
        static func < (lhs: SeriesDescriptor, rhs: SeriesDescriptor) -> Bool { lhs.id < rhs.id }
    }

    // MARK: - Suite integrity (mirrors the JS "feed-vector suite integrity")

    func testSuiteIntegrity() {
        let vectors = Self.vectors
        XCTAssertGreaterThanOrEqual(vectors.count, 10, "WP-06 acceptance: at least 10 vectors ship")

        for (file, v) in vectors {
            let events = v.input.events
            let idList = events.map { $0.id }
            XCTAssertTrue(idList.allSatisfy { ($0?.isEmpty == false) }, "\(file): every event needs a non-empty id")
            let ids = idList.compactMap { $0 }
            XCTAssertEqual(Set(ids).count, ids.count, "\(file): duplicate event id")
            let known = Set(ids)
            for key in ["relevant", "mustWatch", "mustSee", "inWindow"] {
                let expectedIds: [String]
                switch key {
                case "relevant": expectedIds = v.expected.relevant ?? []
                case "mustWatch": expectedIds = v.expected.mustWatch ?? []
                case "mustSee": expectedIds = v.expected.mustSee ?? []
                default: expectedIds = v.expected.inWindow ?? []
                }
                for id in expectedIds {
                    XCTAssertTrue(known.contains(id), "\(file): expected.\(key) references unknown id \"\(id)\"")
                }
            }

            let hasAny = v.expected.relevant != nil || v.expected.mustWatch != nil
                || v.expected.mustSee != nil || v.expected.inWindow != nil || v.expected.series != nil
            XCTAssertTrue(hasAny, "\(file): no expectations")
        }
    }

    // MARK: - §relevant (SERVER isRelevant + 14-day cutoff)

    func testRelevant() throws {
        for (file, v) in Self.vectors where v.expected.relevant != nil {
            let now = try XCTUnwrap(v.input.now, "\(file): expected.relevant requires input.now")
            let actual = ids(v.input.events) { FeedCompiler.isRelevant($0, interests: v.input.interests, now: now) }
            XCTAssertEqual(actual, v.expected.relevant!.sorted(), "\(file): §relevant mismatch")
        }
    }

    // MARK: - §mustWatch (SERVER mustWatchEntity, sport-scoped)

    func testMustWatch() {
        for (file, v) in Self.vectors where v.expected.mustWatch != nil {
            let actual = ids(v.input.events) { FeedCompiler.mustWatch($0, interests: v.input.interests) }
            XCTAssertEqual(actual, v.expected.mustWatch!.sorted(), "\(file): §mustWatch mismatch")
        }
    }

    // MARK: - §mustSee (CLIENT isMustSee, naive substring — pinned)

    func testMustSee() {
        for (file, v) in Self.vectors where v.expected.mustSee != nil {
            let actual = ids(v.input.events) { FeedCompiler.isMustSee($0, interests: v.input.interests) }
            XCTAssertEqual(actual, v.expected.mustSee!.sorted(), "\(file): §mustSee mismatch")
        }
    }

    // MARK: - §inWindow (SERVER & CLIENT identical)

    func testInWindow() throws {
        for (file, v) in Self.vectors where v.expected.inWindow != nil {
            let window = try XCTUnwrap(v.input.window, "\(file): expected.inWindow requires input.window")
            let actual = ids(v.input.events) {
                FeedCompiler.isEventInWindow($0, start: window.start, end: window.end)
            }
            XCTAssertEqual(actual, v.expected.inWindow!.sorted(), "\(file): §inWindow mismatch")
        }
    }

    // MARK: - §series (CLIENT collapseSeries)

    func testSeries() throws {
        for (file, v) in Self.vectors where v.expected.series != nil {
            let now = try XCTUnwrap(v.input.now, "\(file): expected.series requires input.now")
            let actual = FeedCompiler.collapseSeries(v.input.events, now: now).map { item -> SeriesDescriptor in
                switch item {
                case .event(let e):
                    return SeriesDescriptor(isSeries: false, id: e.id ?? "", tournament: nil, stageCount: nil, nextStageId: nil)
                case .series(let s):
                    return SeriesDescriptor(isSeries: true, id: s.id, tournament: s.tournament, stageCount: s.stages.count, nextStageId: s.nextStage.id)
                }
            }.sorted()
            let expected = v.expected.series!.map {
                SeriesDescriptor(isSeries: $0.isSeries, id: $0.id, tournament: $0.tournament, stageCount: $0.stageCount, nextStageId: $0.nextStageId)
            }.sorted()
            XCTAssertEqual(actual, expected, "\(file): §series mismatch")
        }
    }
}
