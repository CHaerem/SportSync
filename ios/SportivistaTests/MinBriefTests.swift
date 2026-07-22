//
//  MinBriefTests.swift
//  SportivistaTests
//
//  WP-174 — «Min brief»: the deterministic personal brief.
//
//  Two halves, mirroring the twin discipline (see MinBrief.swift header):
//    1. COMPOSER — decodes every shared golden vector in
//       tests/fixtures/brief-vectors/ (the SAME files tests/brief.test.js
//       replays, bundled via project.yml's folder reference) and asserts
//       `MinBrief.compose` reproduces `expected.brief` bit-for-bit. A drift
//       between the web and iOS composers fails one runner against the frozen
//       fasit.
//    2. SELECTION — drives MinBrief.build over seeded events/results/news to
//       prove the iOS context-builder produces the SAME brief structure the web
//       side produces for the parallel scenario, and that the spoiler shield
//       screens a followed result's outcome.
//

import XCTest

/// Anchors `Bundle(for:)` at the SportivistaTests bundle, where project.yml's
/// `../tests/fixtures/brief-vectors` folder reference lands as the bundled
/// subdirectory "brief-vectors".
private final class BriefVectorBundleMarker {}

final class MinBriefTests: XCTestCase {

	// MARK: - Fixture model (mirrors brief-vectors/README §"Fixture schema")

	struct Vector: Decodable {
		struct Expected: Decodable { let brief: String }
		let name: String
		let description: String
		let input: BriefContext
		let expected: Expected
	}

	private static let vectors: [(file: String, vector: Vector)] = {
		let bundle = Bundle(for: BriefVectorBundleMarker.self)
		let urls = (bundle.urls(forResourcesWithExtension: "json", subdirectory: "brief-vectors") ?? [])
			.sorted { $0.lastPathComponent < $1.lastPathComponent }
		precondition(!urls.isEmpty, "No brief-vector JSON found in the test bundle — check project.yml's ../tests/fixtures/brief-vectors folder reference.")
		let decoder = JSONDecoder()
		return urls.map { url in
			do {
				let vector = try decoder.decode(Vector.self, from: Data(contentsOf: url))
				return (url.lastPathComponent, vector)
			} catch {
				fatalError("Failed to decode brief-vector \(url.lastPathComponent): \(error)")
			}
		}
	}()

	// MARK: - 1 · Composer against the shared golden vectors

	func testComposer_reproducesEveryGoldenVector() {
		for (file, v) in Self.vectors {
			XCTAssertEqual(MinBrief.compose(v.input), v.expected.brief,
			               "brief-vector \(file) (\(v.name)) diverged from the frozen fasit")
		}
	}

	func testComposer_everyVectorWithinMaxLength() {
		for (file, v) in Self.vectors {
			XCTAssertLessThanOrEqual(MinBrief.compose(v.input).count, MinBrief.maxLen, "\(file) overflowed maxLen")
		}
	}

	func testComposer_emptyContextIsEmptyString() {
		XCTAssertEqual(MinBrief.compose(BriefContext(upcoming: [], results: [], newsCount: 0)), "")
	}

	// MARK: - 2 · Selection + build (iOS context, parallel to the web scenario)

	private let now = ISO8601DateFormatter().date(from: "2026-07-22T15:00:00Z")!  // Oslo 17:00 (July, UTC+2)
	private let lynTeam = Entity(id: "fk-lyn-oslo", name: "FK Lyn Oslo", aliases: ["Lyn"], sport: "football", type: "team")

	private func rule(_ entityId: String, _ name: String, sport: String) -> InterestRule {
		InterestRule(entityId: entityId, entityName: name, sport: sport, weight: 0.5, reason: "test", addedAt: now)
	}

	private var followLyn: InterestProfile {
		InterestProfile(rules: [rule("fk-lyn-oslo", "FK Lyn Oslo", sport: "football")])
	}

	/// Lyn play tonight (Oslo 19:30), beat Sogndal 2–1 yesterday, and there is one
	/// matching news item — the same shape the web test drives.
	private func scenario(shield: SpoilerShield = SpoilerShield()) -> BriefContext {
		let index = EntityIndex([lynTeam])
		let lens = NewsLens(profile: followLyn, index: index)
		let events = [EventBuilder.make(
			sport: "football", title: "Lyn – Start", time: "2026-07-22T17:30:00Z",
			homeTeam: "Lyn", awayTeam: "Start", homeTeamEntityId: "fk-lyn-oslo"
		)]
		let results = RecentResults(football: [
			FootballResult(homeTeam: "Lyn", awayTeam: "Sogndal", homeScore: 2, awayScore: 1,
			               date: ISO8601DateFormatter().date(from: "2026-07-21T16:00:00Z")!, league: "OBOS-ligaen"),
		])
		let news = [NewsItem(id: "lyn1", title: "Lyn henter spiss", link: "https://vg.no/x", source: "VG",
		                     sport: "football", entityIds: ["fk-lyn-oslo"],
		                     publishedAt: ISO8601DateFormatter().date(from: "2026-07-22T10:00:00Z")!)]
		return MinBrief.build(events: events, results: results, news: news,
		                      lens: lens, index: index, shield: shield, now: now)
	}

	func testBuild_composesPersonalBriefFromFeed() {
		let brief = MinBrief.compose(scenario())
		XCTAssertEqual(brief, "I din verden i kveld: Lyn – Start 19:30. Lyn – Sogndal endte 2–1 i går. Én nyhet om det du følger.")
	}

	func testBuild_spoilerShieldHidesResultOutcome() {
		// A spoiler policy on football → the result is named WITHOUT its score, but
		// the upcoming fixture (a schedule, not a result) and the news count are
		// untouched.
		let brief = MinBrief.compose(scenario(shield: SpoilerShield(sports: ["football"], entityIds: [])))
		XCTAssertEqual(brief, "I din verden i kveld: Lyn – Start 19:30. Resultatet fra Lyn – Sogndal i går venter på deg. Én nyhet om det du følger.")
	}

	func testBuild_capsUpcomingAndResults() {
		let index = EntityIndex([lynTeam])
		let lens = NewsLens(profile: followLyn, index: index)
		let events = (0..<3).map {
			EventBuilder.make(sport: "football", title: "Lyn – Lag\($0)",
			                  time: "2026-07-2\(2 + $0)T17:00:00Z",
			                  homeTeam: "Lyn", awayTeam: "Lag\($0)", id: "e\($0)", homeTeamEntityId: "fk-lyn-oslo")
		}
		let ctx = MinBrief.build(events: events, results: RecentResults(), news: [],
		                         lens: lens, index: index, shield: SpoilerShield(), now: now)
		XCTAssertEqual(ctx.upcoming.count, 2, "capped at maxUpcoming")
		XCTAssertEqual(ctx.upcoming.first?.title, "Lyn – Lag0", "nearest first")
	}

	func testBuild_emptyProfileProducesEmptyContext() {
		let profile = InterestProfile(rules: [])
		let index = EntityIndex([lynTeam])
		let lens = NewsLens(profile: profile, index: index)
		let events = [EventBuilder.make(sport: "football", title: "Lyn – Start", time: "2026-07-22T17:30:00Z",
		                                homeTeam: "Lyn", awayTeam: "Start", homeTeamEntityId: "fk-lyn-oslo")]
		let ctx = MinBrief.build(events: events, results: RecentResults(), news: [],
		                         lens: lens, index: index, shield: SpoilerShield(), now: now)
		XCTAssertTrue(ctx.upcoming.isEmpty)
		XCTAssertTrue(ctx.results.isEmpty)
		XCTAssertEqual(ctx.newsCount, 0)
		XCTAssertEqual(MinBrief.compose(ctx), "")
	}
}
