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

    // WP-138 — the affinity lift within a group (safe: not feed-vector-covered).
    func test_sections_affinityLiftsEngagedEntity_emptyKeepsOriginalOrder() {
        let idx = EntityIndex([
            Entity(id: "a-1", name: "Aaa", sport: "tennis", type: "athlete"),
            Entity(id: "a-2", name: "Bbb", sport: "tennis", type: "athlete"),
            Entity(id: "a-3", name: "Ccc", sport: "tennis", type: "athlete"),
        ])
        let p = FollowPresenter(feed: feed(), index: idx, now: now)
        let rules = [rule("a-1", "Aaa", "tennis"), rule("a-2", "Bbb", "tennis"), rule("a-3", "Ccc", "tennis")]

        // Empty affinity → original order preserved byte-for-byte (stable tie-break).
        XCTAssertEqual(p.sections(for: rules).first?.rules.map(\.entityId), ["a-1", "a-2", "a-3"])

        // Engagement with a-3 (opened 5×) lifts it to the top; the rest keep order.
        let behavior = [BehaviorStat(key: "behavior|open|e:a-3", kind: .open, token: "a-3", isSport: false, total: 5)]
        let lifted = p.sections(for: rules, affinity: Affinity(behavior: behavior)).first?.rules.map(\.entityId)
        XCTAssertEqual(lifted, ["a-3", "a-1", "a-2"])
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
        // WP-164: the quiet state says «Fulgt — …», never a bare dead-end.
        XCTAssertEqual(
            presenter().rowSubtitle(for: rule("casper-ruud", "Casper Ruud", "tennis")),
            "Fulgt — ingen kommende events på tavla ennå"
        )
    }

    // MARK: - Lens-miss signal (WP-125)

    func test_matchState_scheduledWhenEventsExist() {
        XCTAssertEqual(presenter().matchState(for: rule("fk-lyn-oslo", "Lyn", "football")), .scheduled)
    }

    func test_matchState_knownEntityNothingScheduled_isIdle() {
        // Casper Ruud IS a known entity, just with nothing on the board right now.
        let p = presenter()
        XCTAssertEqual(p.matchState(for: rule("casper-ruud", "Casper Ruud", "tennis")), .idle)
        XCTAssertTrue(p.nameSuggestions(for: rule("casper-ruud", "Casper Ruud", "tennis")).isEmpty)
    }

    func test_matchState_wholeSportRuleNeverUnresolved() {
        // A whole-sport follow with nothing scheduled is idle, never «sjekk navnet».
        XCTAssertEqual(presenter().matchState(for: rule("sport-golf", "Golf", "golf")), .idle)
    }

    func test_matchState_unknownNameWithNews_staysIdle() {
        // An entity absent from the index but WITH matching news is a real follow,
        // just quiet on the agenda — «Fulgt — …», not «sjekk navnet».
        let news = [NewsItem(id: "n", title: "Nytt", link: "https://x/n", source: "nrk", sport: "esports", entityIds: ["mystery-x"])]
        let p = presenter(news: news)
        XCTAssertEqual(p.matchState(for: rule("mystery-x", "Mystery", "esports")), .idle)
    }

    func test_matchState_unknownName_isUnresolvedWithNearestNameSuggestion() {
        // A mistyped follow: the id resolves to nothing, no events, no news.
        let p = presenter()
        let typo = rule("caspar-ruud-typo", "Caspar Ruud", "tennis")
        XCTAssertEqual(p.matchState(for: typo), .unresolved)
        XCTAssertEqual(p.rowSubtitle(for: typo), "Ingen treff — sjekk navnet")
        // The suggestion reuses the index fuzzy (no new matching) → real Casper Ruud.
        XCTAssertEqual(p.nameSuggestions(for: typo).map(\.name), ["Casper Ruud"])
    }

    // MARK: - Soft-follow (WP-164 — «Følg likevel» waits honestly)

    func test_softFollow_isUnresolvedButWaitsHonestly() {
        // A deliberate name-follow of something the index doesn't know: still
        // `.unresolved` (nothing resolves), but the subtitle never blames the
        // name — the user chose it knowingly.
        let p = presenter()
        let soft = rule(InterestRule.softFollowId(for: "Storhamar"), "Storhamar", "")
        XCTAssertTrue(soft.isSoftFollow)
        XCTAssertEqual(p.matchState(for: soft), .unresolved)
        XCTAssertEqual(p.rowSubtitle(for: soft), "Fulgt — venter på dekning")
    }

    func test_softFollow_healsToScheduledWhenCoverageArrives() {
        // The moment an event name-matches, the soft rule behaves like any other
        // follow — no re-grounding needed (FeedQuery matches id-first, then name).
        let softFeed = FeedQuery(now: now, events: [
            event(id: "e-sh", title: "Storhamar – Sola", sport: "handball",
                  dayKey: "2026-07-25", timeLabel: "18:00", channel: "TV 2 Play",
                  haystack: "Storhamar Sola REMA 1000-ligaen", hoursFromNow: 30),
        ])
        let p = FollowPresenter(feed: softFeed, index: index(), now: now)
        let soft = rule(InterestRule.softFollowId(for: "Storhamar"), "Storhamar", "")
        XCTAssertEqual(p.matchState(for: soft), .scheduled)
        XCTAssertEqual(p.rowSubtitle(for: soft), "Neste: i morgen · Storhamar – Sola · TV 2 Play")
    }

    // MARK: - Season line (WP-164 — the honest off-season answer)

    private func trackedConfig() -> TrackedConfig {
        let json = """
        {
          "version": 1,
          "leagues": [
            {
              "id": "premier-league-2026-27",
              "name": "Premier League 2026/27",
              "sport": "football",
              "reason": "alwaysTrack.tournaments + interesse for generell oversikt. Sesongstart medio august 2026 — statiske ESPN-fetchere dekker kampene når terminlisten publiseres. Ingen konkrete events ennå.",
              "addedAt": "2026-07-02T00:00:00Z",
              "addedBy": "research-agent",
              "evidence": []
            }
          ],
          "athletes": [
            {
              "id": "casper-ruud",
              "name": "Casper Ruud",
              "sport": "tennis",
              "reason": "alwaysTrack.athletes — ingen turneringer på tavla akkurat nå.",
              "addedAt": "2026-07-02T00:00:00Z",
              "addedBy": "research-agent",
              "evidence": []
            }
          ],
          "tournaments": [],
          "notes": []
        }
        """
        // swiftlint:disable:next force_try
        return try! SportivistaJSON.decoder.decode(TrackedConfig.self, from: Data(json.utf8))
    }

    private func seasonIndex() -> EntityIndex {
        EntityIndex([
            Entity(id: "premier-league-2026-27", name: "Premier League 2026/27", aliases: ["Premier League"], sport: "football", type: "league"),
            Entity(id: "casper-ruud", name: "Casper Ruud", aliases: ["Ruud"], sport: "tennis", type: "athlete"),
        ])
    }

    func test_rowSubtitle_quietFollow_getsSeasonLineFromTracked() {
        // Premier League IS known, has no events — tracked.json's reason knows
        // the season window, so the row says so instead of a bare neutral line.
        let p = FollowPresenter(feed: FeedQuery(now: now), index: seasonIndex(), tracked: trackedConfig(), now: now)
        XCTAssertEqual(
            p.rowSubtitle(for: rule("premier-league-2026-27", "Premier League", "football")),
            "Fulgt — sesongstart medio august 2026"
        )
    }

    func test_rowSubtitle_quietFollow_degradesToNeutralWhenNoSeasonInfo() {
        // Casper Ruud's tracked reason has no season sentence → the neutral line.
        let p = FollowPresenter(feed: FeedQuery(now: now), index: seasonIndex(), tracked: trackedConfig(), now: now)
        XCTAssertEqual(
            p.rowSubtitle(for: rule("casper-ruud", "Casper Ruud", "tennis")),
            "Fulgt — ingen kommende events på tavla ennå"
        )
    }

    func test_seasonPhrase_extractsAndTrimsTheSeasonSentence() {
        XCTAssertEqual(
            FollowPresenter.seasonPhrase(in: "alwaysTrack.tournaments + interesse. Sesongstart medio august 2026 — statiske ESPN-fetchere dekker kampene. Ingen konkrete events ennå."),
            "sesongstart medio august 2026"
        )
        // A proper-noun lead keeps its capital.
        XCTAssertEqual(
            FollowPresenter.seasonPhrase(in: "Premier League starter medio august 2026."),
            "Premier League starter medio august 2026"
        )
        // No season sentence → nil (graceful degradation, never a half-sentence).
        XCTAssertNil(FollowPresenter.seasonPhrase(in: "alwaysTrack.teams — neste kamp er bekreftet mot fotball.no."))
        // A cue WITHOUT a month is not season info («Verstappen starter fra pole»).
        XCTAssertNil(FollowPresenter.seasonPhrase(in: "Verstappen starter fra pole i kveld."))
    }

    func test_seasonLine_neverForAMistypedFollow() {
        // A mistyped (non-soft) unresolved follow keeps «sjekk navnet» even when
        // a tracked entry happens to name-match loosely — the honest answer there
        // is still to check the name.
        let p = FollowPresenter(feed: FeedQuery(now: now), index: seasonIndex(), tracked: trackedConfig(), now: now)
        let typo = rule("premier-liga-typo", "Premier Liga", "football")
        XCTAssertEqual(p.matchState(for: typo), .unresolved)
        XCTAssertNil(p.seasonLine(for: typo))
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
