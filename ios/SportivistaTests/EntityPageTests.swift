//
//  EntityPageTests.swift
//  SportivistaTests
//
//  WP-170 — the entity page's pure core («hva skjer med X?»). The package is a
//  COMPOSITION of machinery that already exists, so these tests aim at exactly
//  the two things composition can get wrong:
//
//    1. Does each section carry the RIGHT entity's content — and nothing else?
//    2. Does each section degrade HONESTLY when the data isn't there (omitted,
//       never an empty shell, never another entity's table)?
//
//  Plus the two invariants the surface must never lose: the spoiler shield is
//  the SAME `SpoilerShield` the rest of the app uses, and the specialist hand-off
//  is absent rather than guessed.
//
//  Driven by the checked-in standings/recent-results fixtures (the shape the
//  pipeline actually publishes) + hand-built feed rows — no app, no SwiftUI.
//

import XCTest

final class EntityPageTests: XCTestCase {

    private let now = AssistantTestSupport.iso("2026-07-24T09:00:00Z")

    // MARK: - Fixtures

    private lazy var standings: Standings = {
        // swiftlint:disable:next force_try
        try! SportivistaJSON.decoder.decode(Standings.self, from: Fixture.data("standings"))
    }()

    private lazy var results: RecentResults = {
        // swiftlint:disable:next force_try
        try! SportivistaJSON.decoder.decode(RecentResults.self, from: Fixture.data("recent-results"))
    }()

    private let england = Entity(id: "england", name: "England", aliases: [], sport: "football", type: "team")
    private let everton = Entity(id: "everton", name: "Everton", aliases: [], sport: "football", type: "team")
    private let obosClub = Entity(id: "fk-lyn-oslo", name: "Lyn", aliases: ["FK Lyn Oslo"], sport: "football", type: "team")
    private let hughes = Entity(id: "mackenzie-hughes", name: "Mackenzie Hughes", aliases: [], sport: "golf", type: "athlete")
    private let hamilton = Entity(id: "lewis-hamilton", name: "Lewis Hamilton", aliases: [], sport: "f1", type: "athlete")

    private func index() -> EntityIndex {
        EntityIndex([england, everton, obosClub, hughes, hamilton])
    }

    private func feedEvent(id: String, title: String, sport: String, haystack: String, entityIds: Set<String>, hours: Double) -> FeedQueryEvent {
        FeedQueryEvent(
            id: id, title: title, sport: sport, tournament: nil,
            time: now.addingTimeInterval(hours * 3600), endTime: nil,
            dayKey: "2026-07-25", timeLabel: "18:00", channelLabel: "TV 2",
            isMustSee: false, norwegian: false, haystack: haystack, entityIds: entityIds
        )
    }

    private func feed() -> FeedQuery {
        FeedQuery(now: now, events: [
            feedEvent(id: "e-eng", title: "England – Spania", sport: "football",
                      haystack: "England Spania VM-finalen", entityIds: ["england"], hours: 31),
            feedEvent(id: "e-lyn", title: "Lyn – Sandnes", sport: "football",
                      haystack: "Lyn Sandnes OBOS-ligaen", entityIds: ["fk-lyn-oslo"], hours: 40),
        ])
    }

    private func news() -> [NewsItem] {
        [
            NewsItem(id: "n1", title: "England klar for finale", link: "https://nrk.no/1",
                     source: "nrk-sport", sport: "football", entityIds: ["england"],
                     publishedAt: now.addingTimeInterval(-3600)),
            NewsItem(id: "n2", title: "Lyn henter spiss", link: "https://nrk.no/2",
                     source: "nrk-sport", sport: "football", entityIds: ["fk-lyn-oslo"],
                     publishedAt: now.addingTimeInterval(-7200)),
        ]
    }

    private func page(for entity: Entity, shield: SpoilerShield = SpoilerShield()) -> EntityPage {
        EntityPage.build(
            entity: entity,
            feed: feed(),
            index: index(),
            news: news(),
            results: results,
            standings: standings,
            shield: shield,
            now: now
        )
    }

    // MARK: - The page composes ONE entity's answer

    func test_build_carriesOnlyThisEntitysUpcomingAndNews() {
        let p = page(for: england)
        XCTAssertEqual(p.upcoming.map(\.id), ["e-eng"], "another team's fixture must not leak onto the page")
        XCTAssertEqual(p.news.map(\.id), ["n1"])
        XCTAssertFalse(p.isEmpty)
    }

    func test_build_resultsAreTheEntitysOwn() {
        let p = page(for: england)
        XCTAssertEqual(p.results.count, 1)
        XCTAssertEqual(p.results.first?.sport, "football")
        XCTAssertEqual(p.results.first?.score, "4–6")
        // The OBOS club played no fixture in recent-results → no RESULTAT section.
        XCTAssertTrue(page(for: obosClub).results.isEmpty)
    }

    func test_build_whenLabelReadsDayThenClock() {
        // 25 Jul is the day after the fixed Friday clock → "i morgen".
        XCTAssertEqual(page(for: england).upcoming.first?.whenLabel, "i morgen · 18:00")
    }

    func test_build_upcomingRowHasNoEventWhenTheCacheDoesnt() {
        // Nothing was passed in `eventsById`, so the row is a calm, non-tappable
        // line rather than a dead-end tap.
        XCTAssertNil(page(for: england).upcoming.first?.event)
    }

    func test_build_emptyPageForAnEntityWeKnowNothingAbout() {
        let unknown = Entity(id: "x", name: "Ukjent IL", aliases: [], sport: "handball", type: "team")
        let p = page(for: unknown)
        XCTAssertTrue(p.isEmpty)
        XCTAssertNil(p.table)
        XCTAssertNil(p.specialist)
    }

    // MARK: - TABELL: only the table that is actually the entity's

    func test_standingsTable_footballShowsTopPlusTheEntity() {
        let table = EntityPage.standingsTable(entity: everton, standings: standings)
        XCTAssertEqual(table?.title, "PREMIER LEAGUE")
        XCTAssertEqual(table?.rows.map(\.name),
                       ["Liverpool", "Arsenal", "Manchester City", "Chelsea", "Newcastle United", "Everton"])
        XCTAssertEqual(table?.rows.last?.rank, "14.")
        XCTAssertEqual(table?.rows.filter(\.highlighted).map(\.name), ["Everton"])
    }

    /// The WP-171 lesson applied to the entity: a club we publish no table for
    /// must not be handed the Premier League's.
    func test_standingsTable_clubOutsideEveryPublishedTable_isNil() {
        XCTAssertNil(EntityPage.standingsTable(entity: obosClub, standings: standings))
    }

    func test_standingsTable_golfKeepsTheEntityOnTheLeaderboard() {
        let table = EntityPage.standingsTable(entity: hughes, standings: standings)
        XCTAssertEqual(table?.title, "3M OPEN")
        XCTAssertEqual(table?.rows.first?.name, "Mackenzie Hughes")
        XCTAssertTrue(table?.rows.first?.highlighted == true)
    }

    func test_standingsTable_f1ShowsTheChampionshipWithTheDriverMarked() {
        let table = EntityPage.standingsTable(entity: hamilton, standings: standings)
        XCTAssertEqual(table?.title, "VM-STILLING")
        XCTAssertEqual(table?.rows.filter(\.highlighted).map(\.name), ["Lewis Hamilton"])
    }

    func test_standingsTable_noStandingsAtAll_isNil() {
        XCTAssertNil(EntityPage.standingsTable(entity: everton, standings: nil))
        XCTAssertNil(EntityPage.standingsTable(entity: everton, standings: Standings()))
    }

    // MARK: - Spoiler shield (the EXISTING one, not a second concept)

    func test_spoilerPolicyOnTheEntity_masksTableAndResults() {
        let shield = SpoilerShield(entityIds: ["england"])
        let p = page(for: england, shield: shield)
        XCTAssertTrue(p.spoilerSensitive, "the TABELL section must hide behind «Vis tabell»")
        XCTAssertTrue(p.results.allSatisfy(\.spoilerSensitive), "every result row carries the shield's verdict")
    }

    func test_spoilerPolicyOnTheSport_masksToo() {
        let p = page(for: england, shield: SpoilerShield(sports: ["football"]))
        XCTAssertTrue(p.spoilerSensitive)
    }

    func test_noSpoilerPolicy_showsPlainly() {
        let p = page(for: england)
        XCTAssertFalse(p.spoilerSensitive)
        XCTAssertTrue(p.results.allSatisfy { !$0.spoilerSensitive })
    }

    // MARK: - MER: linked, never guessed

    func test_specialistLink_footballGoesToFotMobWithAnEncodedName() {
        let link = EntityPage.specialistLink(sport: "football", name: "FK Lyn Oslo")
        XCTAssertEqual(link?.label, "FotMob")
        XCTAssertEqual(link?.url.absoluteString, "https://www.fotmob.com/search?term=FK%20Lyn%20Oslo")
    }

    func test_specialistLink_encodesCharactersThatWouldEscapeTheParameter() {
        let link = EntityPage.specialistLink(sport: "cycling", name: "A&B + C")
        XCTAssertEqual(link?.label, "ProCyclingStats")
        XCTAssertFalse(link?.url.absoluteString.contains("&B") == true)
    }

    func test_specialistLink_unknownSportHasNoLink() {
        XCTAssertNil(EntityPage.specialistLink(sport: "chess", name: "Magnus Carlsen"))
        XCTAssertNil(EntityPage.specialistLink(sport: "football", name: "   "))
    }

    func test_specialistLink_normalisesTheSportTag() {
        XCTAssertNil(EntityPage.specialistLink(sport: "formula1", name: "Lewis Hamilton"),
                     "f1 has no verified search endpoint yet — absent beats a guess")
    }

    // MARK: - Whole-sport follow keeps whole-sport semantics

    func test_build_wholeSportRule_showsThatSportsEvents() {
        let sportEntity = Entity(id: "sport-football", name: "Fotball", aliases: [], sport: "football", type: "sport")
        let rule = InterestRule(entityId: "sport-football", entityName: "Fotball", sport: "football",
                                weight: 0.5, reason: "test", addedAt: now)
        let p = EntityPage.build(
            entity: sportEntity, rule: rule,
            feed: feed(), index: EntityIndex([england, everton, obosClub, sportEntity]),
            news: news(), results: results, standings: standings, now: now
        )
        XCTAssertEqual(p.upcoming.map(\.id), ["e-eng", "e-lyn"], "a whole-sport follow opens the whole sport")
        XCTAssertEqual(p.news.count, 2)
    }
}
