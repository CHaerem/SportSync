//
//  FollowPresenterTests.swift
//  SportivistaTests
//
//  WP-120 — the pure core behind the redesigned «Det du følger» surfaces. Proves
//  each rule gets its display GROUP, its next 1–3 events (by the lens's OWN
//  matching — entity for an athlete/team/tournament, sport for a whole-sport
//  rule), its lens-matched news, and the calm «Neste: … / Ikke satt opp ennå»
//  subtitle — all against hand-built values (no app, no SwiftUI). Also pins the
//  two FeedQuery helpers WP-120 added.
//

import XCTest

final class FollowPresenterTests: XCTestCase {

    // A fixed Friday-morning clock (11:00 Europe/Oslo on 24 Jul 2026): the two
    // fixture events fall on Saturday 25 → "i morgen".
    private let now = AssistantTestSupport.iso("2026-07-24T09:00:00Z")

    private func index() -> EntityIndex {
        EntityIndex([
            Entity(id: "fk-lyn-oslo", name: "Lyn", aliases: ["FK Lyn Oslo"], sport: "football", type: "team"),
            Entity(id: "casper-ruud", name: "Casper Ruud", aliases: ["Ruud"], sport: "tennis", type: "athlete"),
            Entity(id: "tour-de-france-2026", name: "Tour de France 2026", aliases: ["Tour de France", "TdF"], sport: "cycling", type: "tournament"),
            Entity(id: "sport-cycling", name: "Sykkel", aliases: [], sport: "cycling", type: "sport"),
        ])
    }

    private func event(
        id: String, title: String, sport: String, dayKey: String, timeLabel: String,
        channel: String, haystack: String, entityIds: Set<String> = [], hoursFromNow: Double
    ) -> FeedQueryEvent {
        FeedQueryEvent(
            id: id, title: title, sport: sport, tournament: nil,
            time: now.addingTimeInterval(hoursFromNow * 3600), endTime: nil,
            dayKey: dayKey, timeLabel: timeLabel, channelLabel: channel,
            isMustSee: false, norwegian: true, haystack: haystack, entityIds: entityIds
        )
    }

    private func feed() -> FeedQuery {
        FeedQuery(now: now, events: [
            event(id: "e-lyn", title: "Strømsgodset – Lyn", sport: "football",
                  dayKey: "2026-07-25", timeLabel: "18:00", channel: "TV 2",
                  haystack: "Strømsgodset Lyn Eliteserien", entityIds: ["fk-lyn-oslo"], hoursFromNow: 31),
            event(id: "e-tdf", title: "Etappe 12", sport: "cycling",
                  dayKey: "2026-07-25", timeLabel: "13:00", channel: "TV 2 Play",
                  haystack: "Etappe 12 Tour de France 2026", hoursFromNow: 26),
        ])
    }

    private func presenter(news: [NewsItem] = []) -> FollowPresenter {
        FollowPresenter(feed: feed(), index: index(), news: news, now: now)
    }

    private func rule(_ id: String, _ name: String, _ sport: String) -> InterestRule {
        InterestRule(entityId: id, entityName: name, sport: sport, weight: 0.5, reason: "test", addedAt: now)
    }

    // MARK: - Grouping by rule type

    func test_group_classifiesByEntityType() {
        let p = presenter()
        XCTAssertEqual(p.group(for: rule("fk-lyn-oslo", "Lyn", "football")), .team)
        XCTAssertEqual(p.group(for: rule("casper-ruud", "Casper Ruud", "tennis")), .athlete)
        XCTAssertEqual(p.group(for: rule("tour-de-france-2026", "Tour de France", "cycling")), .tournament)
        XCTAssertEqual(p.group(for: rule("sport-cycling", "Sykkel", "cycling")), .sport)
    }

    func test_group_fallsBackToIdConventionWhenIndexMisses() {
        let p = presenter()
        // Not in the index — inferred from the build-entities id prefix.
        XCTAssertEqual(p.group(for: rule("category-winter-sports", "Vintersport", "")), .category)
        XCTAssertEqual(p.group(for: rule("sport-golf", "Golf", "golf")), .sport)
        XCTAssertEqual(p.group(for: rule("mystery-x", "Ukjent", "chess")), .other)
    }

    func test_sections_dropsEmptyGroupsAndKeepsCanonicalOrder() {
        let sections = presenter().sections(for: [
            rule("sport-cycling", "Sykkel", "cycling"),
            rule("fk-lyn-oslo", "Lyn", "football"),
            rule("casper-ruud", "Casper Ruud", "tennis"),
        ])
        // athlete before team before sport; tournament/league/category absent.
        XCTAssertEqual(sections.map(\.group), [.athlete, .team, .sport])
        XCTAssertEqual(sections.map(\.group.header), ["UTØVERE", "LAG", "SPORTER"])
    }

    // MARK: - Next events (KOMMENDE + subtitle)

    func test_nextEvents_forTournament_matchesByHaystack() {
        let hits = presenter().nextEvents(for: rule("tour-de-france-2026", "Tour de France", "cycling"))
        XCTAssertEqual(hits.map(\.id), ["e-tdf"])
    }

    func test_nextEvents_forTeam_matchesByCarriedEntityId() {
        let hits = presenter().nextEvents(for: rule("fk-lyn-oslo", "Lyn", "football"))
        XCTAssertEqual(hits.map(\.id), ["e-lyn"])
    }

    func test_nextEvents_forWholeSportRule_matchesBySport() {
        // The sport rule has no name that appears in any haystack — it must match
        // by SPORT (cycling), the whole-sport lens, not by name.
        let hits = presenter().nextEvents(for: rule("sport-cycling", "Sykkel", "cycling"))
        XCTAssertEqual(hits.map(\.id), ["e-tdf"])
    }

    func test_rowSubtitle_namesTheNextEvent() {
        XCTAssertEqual(
            presenter().rowSubtitle(for: rule("fk-lyn-oslo", "Lyn", "football")),
            "Neste: i morgen · Strømsgodset – Lyn · TV 2"
        )
    }

    func test_rowSubtitle_honestGapWhenNothingScheduled() {
        XCTAssertEqual(
            presenter().rowSubtitle(for: rule("casper-ruud", "Casper Ruud", "tennis")),
            "Ikke satt opp ennå"
        )
    }

    // MARK: - News (SISTE NYTT)

    func test_newsItems_matchByEntityIdAndSport() {
        let news = [
            NewsItem(id: "n1", title: "Lyn vinner", link: "https://x/1", source: "nrk", sport: "football", entityIds: ["fk-lyn-oslo"]),
            NewsItem(id: "n2", title: "Sjakk-nytt", link: "https://x/2", source: "nrk", sport: "chess", entityIds: []),
            NewsItem(id: "n3", title: "Tour-etappe", link: "https://x/3", source: "nrk", sport: "cycling", entityIds: []),
        ]
        let p = presenter(news: news)
        // Team rule: only the entityId-stamped item.
        XCTAssertEqual(p.newsItems(for: rule("fk-lyn-oslo", "Lyn", "football")).map(\.id), ["n1"])
        // Whole-sport (cycling) rule: the sport-tagged item, by sport.
        XCTAssertEqual(p.newsItems(for: rule("sport-cycling", "Sykkel", "cycling")).map(\.id), ["n3"])
        // A tournament (entity-scoped, no stamped id) matches neither → empty.
        XCTAssertTrue(p.newsItems(for: rule("tour-de-france-2026", "Tour de France", "cycling")).isEmpty)
    }

    // MARK: - FeedQuery helpers (WP-120)

    func test_feedQuery_upcomingMatching_limitsAndOrders() {
        let tdf = index().entity(id: "tour-de-france-2026")!
        XCTAssertEqual(feed().upcoming(matching: tdf, limit: 3).map(\.id), ["e-tdf"])
    }

    func test_feedQuery_upcomingInSports_normalisesTags() {
        // "formula1" ≡ "f1"; here cycling matches the cycling event.
        XCTAssertEqual(feed().upcoming(inSports: ["cycling"], limit: 3).map(\.id), ["e-tdf"])
        XCTAssertTrue(feed().upcoming(inSports: [], limit: 3).isEmpty)
    }
}
