//
//  NewsLensTests.swift
//  SportivistaTests
//
//  WP-106 — hostless tests for the Nyheter board's client-side lens (NewsLens)
//  and the Codable models it reads. Covers the two match signals (entityId ∩
//  followed, and a followed WHOLE-sport / category rule), the deliberate
//  non-match of a single-entity rule against its whole sport, sport-tag
//  normalisation, the empty-profile ⇒ nothing case, and — via DataStore against
//  a temp cache — that a missing or corrupt news.json is an empty section, never
//  a crash.
//

import XCTest

final class NewsLensTests: XCTestCase {

	// MARK: - Fixtures

	private func index(_ entities: [Entity]) -> EntityIndex { EntityIndex(entities) }

	private let lynTeam = Entity(id: "fk-lyn-oslo", name: "FK Lyn Oslo", aliases: ["Lyn"], sport: "football", type: "team")
	private let hovland = Entity(id: "viktor-hovland", name: "Viktor Hovland", aliases: ["Hovland"], sport: "golf", type: "athlete")
	private let langrenn = Entity(id: "sport-cross-country", name: "Langrenn", aliases: ["langrenn"], sport: "cross-country", type: "sport")
	private let vintersport = Entity(id: "category-winter-sports", name: "Vintersport", aliases: [], sport: "", type: "category")

	private func rule(_ entityId: String, _ name: String, sport: String) -> InterestRule {
		InterestRule(entityId: entityId, entityName: name, sport: sport, weight: 0.5, reason: "test", addedAt: Date())
	}

	private func newsItem(id: String = "n", sport: String, entityIds: [String] = []) -> NewsItem {
		NewsItem(id: id, title: "t", link: "https://x", source: "s", sport: sport, entityIds: entityIds, publishedAt: Date())
	}

	// MARK: - Signal 1: entityId ∩ followed

	func testMatches_byEntityId() {
		let lens = NewsLens(profile: InterestProfile(rules: [rule("fk-lyn-oslo", "FK Lyn Oslo", sport: "football")]), index: index([lynTeam]))
		XCTAssertTrue(lens.matches(newsItem(sport: "football", entityIds: ["fk-lyn-oslo"])))
		XCTAssertFalse(lens.matches(newsItem(sport: "football", entityIds: ["some-other-team"])),
		               "a football headline about an UNfollowed team must not match on sport alone")
	}

	// MARK: - Signal 2: followed whole-sport / category

	func testMatches_byWholeSportRule() {
		let lens = NewsLens(profile: InterestProfile(rules: [rule("sport-cross-country", "Langrenn", sport: "cross-country")]), index: index([langrenn]))
		XCTAssertTrue(lens.matches(newsItem(sport: "cross-country")), "a langrenn follow opens langrenn headlines")
		XCTAssertFalse(lens.matches(newsItem(sport: "football")))
	}

	func testMatches_byCategoryExpansion() {
		let lens = NewsLens(profile: InterestProfile(rules: [rule("category-winter-sports", "Vintersport", sport: "winter-sports")]), index: index([vintersport]))
		// winter-sports expands to biathlon/cross-country/alpine/… via SportVocabulary.
		XCTAssertTrue(lens.matches(newsItem(sport: "biathlon")))
		XCTAssertTrue(lens.matches(newsItem(sport: "alpine")))
		XCTAssertFalse(lens.matches(newsItem(sport: "football")))
	}

	func testAthleteRule_doesNotOpenWholeSport() {
		let lens = NewsLens(profile: InterestProfile(rules: [rule("viktor-hovland", "Viktor Hovland", sport: "golf")]), index: index([hovland]))
		XCTAssertFalse(lens.matches(newsItem(sport: "golf")), "following Hovland must NOT admit every golf headline")
		XCTAssertTrue(lens.matches(newsItem(sport: "golf", entityIds: ["viktor-hovland"])), "only golf headlines that name Hovland")
	}

	// MARK: - Sport-tag normalisation

	func testCanonicalSport_normalisesAliases() {
		XCTAssertEqual(NewsLens.canonicalSport("formula1"), "f1")
		XCTAssertEqual(NewsLens.canonicalSport("FOOTBALL"), "football")
		XCTAssertEqual(NewsLens.canonicalSport("general"), "general") // unknown → passthrough (lowercased)
	}

	func testMatches_sportAliasNormalised() {
		// news.js emits "formula1"; a followed f1 sport rule must still match it.
		let f1Sport = Entity(id: "sport-f1", name: "Formel 1", aliases: [], sport: "f1", type: "sport")
		let lens = NewsLens(profile: InterestProfile(rules: [rule("sport-f1", "Formel 1", sport: "f1")]), index: index([f1Sport]))
		XCTAssertTrue(lens.matches(newsItem(sport: "formula1")))
	}

	// MARK: - Empty / degenerate

	func testEmptyProfile_matchesNothing() {
		let lens = NewsLens(profile: InterestProfile(rules: []), index: index([]))
		XCTAssertTrue(lens.isEmpty)
		XCTAssertFalse(lens.matches(newsItem(sport: "football", entityIds: ["fk-lyn-oslo"])))
	}

	func testWholeSportFallback_whenIndexUnsynced() {
		// Entity index empty (unsynced) → fall back to the build-entities id prefix.
		let lens = NewsLens(profile: InterestProfile(rules: [rule("sport-cross-country", "Langrenn", sport: "cross-country")]), index: index([]))
		XCTAssertTrue(lens.matches(newsItem(sport: "cross-country")))
	}

	// MARK: - matchesEvent (FREMOVER lens over full events)

	func testMatchesEvent_byEntityIdSportAndName() {
		let idx = index([lynTeam, langrenn])
		let lens = NewsLens(profile: InterestProfile(rules: [
			rule("fk-lyn-oslo", "FK Lyn Oslo", sport: "football"),
			rule("sport-cross-country", "Langrenn", sport: "cross-country"),
		]), index: idx)

		let byId = EventBuilder.make(sport: "football", title: "Lyn – Bryne", time: "2026-08-01T17:00:00Z",
		                             homeTeam: "Lyn", awayTeam: "Bryne", homeTeamEntityId: "fk-lyn-oslo")
		XCTAssertTrue(lens.matchesEvent(byId, index: idx))

		let bySport = EventBuilder.make(sport: "cross-country", title: "Verdenscup: sesongåpning", time: "2026-11-01T10:00:00Z")
		XCTAssertTrue(lens.matchesEvent(bySport, index: idx))

		let byName = EventBuilder.make(sport: "football", title: "Sarpsborg – Lyn", time: "2026-08-10T17:00:00Z",
		                               homeTeam: "Sarpsborg", awayTeam: "Lyn") // alias "Lyn", no id stamped
		XCTAssertTrue(lens.matchesEvent(byName, index: idx))

		let unrelated = EventBuilder.make(sport: "tennis", title: "Wimbledon-finale", time: "2026-07-12T14:00:00Z")
		XCTAssertFalse(lens.matchesEvent(unrelated, index: idx))
	}

	// MARK: - Codable models (decode from fixtures)

	func testDecode_newsFeed() throws {
		let feed = try SportivistaJSON.decoder.decode(NewsFeed.self, from: Fixture.data("news"))
		XCTAssertEqual(feed.items.count, 1)
		XCTAssertEqual(feed.items.first?.entityIds, ["fk-lyn-oslo"])
		XCTAssertNotNil(feed.items.first?.publishedAt)
	}

	func testDecode_featuredHeadline() throws {
		let brief = try SportivistaJSON.decoder.decode(FeaturedBrief.self, from: Fixture.data("featured"))
		XCTAssertEqual(brief.mode, "evening")
		XCTAssertNotNil(brief.headline)
		XCTAssertTrue(brief.headline?.contains("VM-bronsefinale") ?? false)
	}

	func testDecode_recentResults() throws {
		let results = try SportivistaJSON.decoder.decode(RecentResults.self, from: Fixture.data("recent-results"))
		XCTAssertEqual(results.football.count, 1)
		XCTAssertEqual(results.football.first?.scoreLine, "4–6")
	}

	func testFeatured_noHeadlineBlock_isNil() throws {
		let json = Data(#"{"mode":"morning","blocks":[{"type":"other","text":"x"}]}"#.utf8)
		let brief = try SportivistaJSON.decoder.decode(FeaturedBrief.self, from: json)
		XCTAssertNil(brief.headline)
	}

	// MARK: - DataStore: missing / corrupt files never crash

	func testDataStore_missingFiles_returnEmpty() {
		let temp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
		defer { try? FileManager.default.removeItem(at: temp) }
		let store = DataStore(cache: CacheStore(rootDirectory: temp))
		XCTAssertTrue(store.loadNews().isEmpty)
		XCTAssertNil(store.loadFeatured())
		XCTAssertEqual(store.loadRecentResults(), RecentResults())
	}

	func testDataStore_corruptFiles_returnEmpty() throws {
		let temp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
		defer { try? FileManager.default.removeItem(at: temp) }
		let cache = CacheStore(rootDirectory: temp)
		try cache.write(Data("not json".utf8), filename: "news.json")
		try cache.write(Data("not json".utf8), filename: "featured.json")
		try cache.write(Data("{".utf8), filename: "recent-results.json")
		let store = DataStore(cache: cache)
		XCTAssertTrue(store.loadNews().isEmpty)
		XCTAssertNil(store.loadFeatured())
		XCTAssertEqual(store.loadRecentResults(), RecentResults())
	}
}
