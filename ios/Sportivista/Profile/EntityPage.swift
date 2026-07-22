//
//  EntityPage.swift
//  Sportivista
//
//  WP-170 — the ENTITY PAGE's pure core: «hva skjer med X?» answered in one
//  place, for one entity.
//
//  The go-to mapping (22.07) found this as the biggest remaining gap against
//  FotMob/VG Live: their core ritual is ONE page per team/athlete — next match,
//  last result, table position, news — and we did not have that object at all.
//  The answer was spread across Uka's agenda, the Nyheter board's four sections
//  and the event detail sheet.
//
//  This file is that object, and it is deliberately a COMPOSITION, not a new
//  data path. Every section is produced by machinery that already exists and is
//  already tested:
//
//    • KOMMENDE  — `FollowPresenter.nextEvents` (which is `FeedQuery.upcoming`
//                  under a single-rule lens). No new matching.
//    • RESULTAT  — `NewsBoard.resultRows` under a SINGLE-RULE `NewsLens`, so the
//                  rows, their per-sport DNA and — crucially — their
//                  `spoilerSensitive` flag are the SAME ones the Nyheter board
//                  and the WP-176 fulltidsvarsel compute. The spoiler shield is
//                  the existing `SpoilerShield`; this surface invents no second
//                  notion of "may I show an outcome".
//    • TABELL    — the WP-171 `StandingsTable` row type, filled by an ENTITY
//                  gate that is as honest as the event one: a table is shown
//                  ONLY when the entity is actually IN it. An OBOS club never
//                  gets the Premier League table.
//    • SISTE NYTT— `FollowPresenter.newsItems` (single-rule `NewsLens`).
//    • MER       — one deep link to the specialist, per VISJON v3 («ikke
//                  konkurrer på dybde, lenk til spesialisten»). Omitted, never
//                  faked, for a sport where we have no link we trust.
//
//  Everything here is Foundation-only and clock-injected, so EntityPageTests
//  drives every branch against the checked-in fixtures with no SwiftUI and no
//  running app — the same discipline as FollowPresenter/NewsBoard.
//

import Foundation

/// One KOMMENDE line on the entity page: the agenda's own answer (when · what ·
/// where), plus the full `Event` so a tap can open the SAME event detail sheet
/// the agenda opens.
struct EntityUpcomingRow: Identifiable {
    var id: String
    var title: String
    var sport: String
    /// «lør 25. · 18:00» for a single-day event, or the multi-day window as it
    /// already reads in the agenda.
    var whenLabel: String
    /// The first Norwegian channel, or an honest «–».
    var channelLabel: String
    var isMustSee: Bool
    /// The full event behind the row, when the cache still has it — a tap then
    /// opens the SAME detail sheet the agenda opens. `nil` degrades to a calm,
    /// non-tappable line rather than a dead-end tap.
    var event: Event?
}

/// A link OUT to the specialist for this sport. One row, at the bottom, never a
/// carousel — the entity page answers «hva skjer med X», it does not try to be
/// FotMob.
struct EntitySpecialistLink: Equatable {
    var label: String
    var url: URL
}

/// The whole page for one entity, in the FIXED section order the view renders:
/// anker · KOMMENDE · SISTE RESULTAT · TABELL · SISTE NYTT · MER.
struct EntityPage {
    var entity: Entity
    var upcoming: [EntityUpcomingRow]
    var results: [NewsResultRow]
    var table: StandingsTable?
    var news: [NewsItem]
    var specialist: EntitySpecialistLink?
    /// WP-30/WP-171 — does the user's spoiler policy cover THIS entity (or its
    /// sport)? The TABELL section is result-derived, so it hides behind the same
    /// «Vis tabell» reveal the event sheet uses when this is true. The per-result
    /// rows carry their own flag (`NewsResultRow.spoilerSensitive`), computed by
    /// the very same `SpoilerShield` — there is no second spoiler concept here.
    var spoilerSensitive: Bool = false

    /// Caps. Ro: this is ONE screen with a fixed set of sections, never an
    /// infinite scroll. Each section says the little it can stand behind.
    static let upcomingLimit = 3
    static let resultLimit = 3
    static let newsLimit = 4
    /// Rows a table shows before the entity's own row is appended — the WP-171
    /// value, so the event sheet and this page read identically.
    static let tableTopRows = StandingsTable.topRows

    /// True when we know NOTHING about this entity right now. The view then
    /// shows ONE honest line instead of four empty section shells.
    var isEmpty: Bool { upcoming.isEmpty && results.isEmpty && table == nil && news.isEmpty }

    // MARK: - Build

    /// Compose the page. `rule` is the follow rule when the page was reached
    /// from «Det du følger» (so a WHOLE-SPORT follow keeps its whole-sport
    /// semantics); from an event detail sheet there is no rule and a stand-in is
    /// derived from the entity itself.
    static func build(
        entity: Entity,
        rule: InterestRule? = nil,
        feed: FeedQuery,
        index: EntityIndex,
        eventsById: [String: Event] = [:],
        news: [NewsItem] = [],
        results: RecentResults = RecentResults(),
        standings: Standings? = nil,
        tracked: TrackedConfig? = nil,
        shield: SpoilerShield = SpoilerShield(),
        now: Date = Date()
    ) -> EntityPage {
        let effectiveRule = rule ?? standInRule(for: entity)
        let presenter = FollowPresenter(feed: feed, index: index, news: news, tracked: tracked, now: now)
        let upcomingRows = presenter.nextEvents(for: effectiveRule, limit: upcomingLimit)

        // The SINGLE-RULE lens: exactly the same lens the Nyheter board uses,
        // narrowed to this one entity — so a result is on this page for the same
        // reason (and with the same spoiler verdict) it would be on the board.
        let lens = NewsLens(profile: InterestProfile(rules: [effectiveRule]), index: index)
        let resultRows = lens.isEmpty
            ? []
            : Array(NewsBoard.resultRows(results, lens: lens, index: index, shield: shield).prefix(resultLimit))

        return EntityPage(
            entity: entity,
            upcoming: upcomingRows.map { row(for: $0, presenter: presenter, eventsById: eventsById) },
            results: resultRows,
            table: standingsTable(entity: entity, standings: standings),
            news: presenter.newsItems(for: effectiveRule, limit: newsLimit),
            specialist: specialistLink(sport: entity.sport.isEmpty ? effectiveRule.sport : entity.sport, name: entity.name),
            spoilerSensitive: shield.isSpoilerSensitive(
                sport: NewsLens.canonicalSport(entity.sport.isEmpty ? effectiveRule.sport : entity.sport),
                entityIds: [entity.id]
            )
        )
    }

    /// A stand-in follow rule for an entity we did NOT arrive at through a
    /// follow (the event-detail entry point). It carries only the identity —
    /// the matching downstream is entirely id/name based, exactly as for a real
    /// rule, so the two entry points produce the same page.
    static func standInRule(for entity: Entity) -> InterestRule {
        InterestRule(
            entityId: entity.id,
            entityName: entity.name,
            sport: entity.sport,
            weight: InterestProfile.defaultWeight,
            reason: "",
            addedAt: Date(timeIntervalSince1970: 0)
        )
    }

    /// Project a feed row onto the page's KOMMENDE line, attaching the full
    /// `Event` when the cache still carries it (so a tap opens the normal detail
    /// sheet).
    private static func row(for event: FeedQueryEvent, presenter: FollowPresenter, eventsById: [String: Event]) -> EntityUpcomingRow {
        EntityUpcomingRow(
            id: event.id,
            title: event.title,
            sport: event.sport,
            whenLabel: whenLabel(for: event, presenter: presenter),
            channelLabel: event.channelLabel,
            isMustSee: event.isMustSee,
            event: eventsById[event.id]
        )
    }

    /// «lør 25. · 18:00»; a multi-day window (already a date range) stands on
    /// its own. Same shape as the follow detail's KOMMENDE line — one voice.
    static func whenLabel(for event: FeedQueryEvent, presenter: FollowPresenter) -> String {
        if event.timeLabel.contains("–") { return event.timeLabel }
        return "\(presenter.shortDayLabel(dayKey: event.dayKey)) · \(event.timeLabel)"
    }

    // MARK: - TABELL (the honest entity gate)

    /// The table this ENTITY is actually in — never «a» table for its sport.
    /// WP-171's lesson, applied to the entity: an OBOS-league club must not be
    /// shown the Premier League top five as if it were its own table, and a
    /// golfer who isn't in this week's field has no leaderboard. `nil` whenever
    /// the entity is not found in any table we publish (the view then omits the
    /// section entirely — never an empty shell).
    static func standingsTable(entity: Entity, standings: Standings?) -> StandingsTable? {
        guard let standings, !standings.isEmpty else { return nil }
        let terms = ([entity.name] + entity.aliases).filter { !$0.isEmpty }
        guard !terms.isEmpty else { return nil }
        let hit: (String) -> Bool = { name in
            guard !name.isEmpty else { return false }
            return terms.contains { TextMatch.containsName(name, $0) || TextMatch.containsName($0, name) }
        }

        switch TextMatch.normalize(entity.sport) {
        case "football":
            for (title, table) in [("PREMIER LEAGUE", standings.football.premierLeague), ("LA LIGA", standings.football.laLiga)] {
                guard table.contains(where: { hit($0.team) }) else { continue }
                var picked = Array(table.prefix(tableTopRows))
                for entry in table where hit(entry.team) && !picked.contains(where: { $0.position == entry.position }) {
                    picked.append(entry)
                }
                picked.sort { $0.position < $1.position }
                return StandingsTable(title: title, rows: picked.map { entry in
                    StandingsTableRow(
                        id: "table|\(entry.position)|\(entry.team)",
                        rank: "\(entry.position).",
                        name: entry.team,
                        value: "\(entry.points)",
                        highlighted: hit(entry.team)
                    )
                })
            }
            return nil

        case "golf":
            for key in standings.golf.keys.sorted() {
                guard let board = standings.golf[key], !board.leaderboard.isEmpty else { continue }
                let all = board.leaderboard + board.trackedPlayers
                guard all.contains(where: { hit($0.player) }) else { continue }
                var rows = board.leaderboard.prefix(tableTopRows).map { golfRow($0, highlighted: hit($0.player)) }
                for entry in all where hit(entry.player) && !rows.contains(where: { $0.name == entry.player }) {
                    rows.append(golfRow(entry, highlighted: true))
                }
                return StandingsTable(title: (board.name ?? "LEDERTAVLE").uppercased(), rows: rows)
            }
            return nil

        case "f1":
            let drivers = standings.f1.drivers
            guard drivers.contains(where: { hit($0.driver) }) else { return nil }
            var picked = Array(drivers.prefix(tableTopRows))
            for entry in drivers where hit(entry.driver) && !picked.contains(where: { $0.position == entry.position }) {
                picked.append(entry)
            }
            picked.sort { $0.position < $1.position }
            return StandingsTable(title: "VM-STILLING", rows: picked.map { d in
                StandingsTableRow(
                    id: "f1|\(d.driver)",
                    rank: "\(d.position).",
                    name: d.driver,
                    value: "\(d.points)",
                    highlighted: hit(d.driver)
                )
            })

        default:
            return nil
        }
    }

    private static func golfRow(_ entry: GolfStandingRow, highlighted: Bool) -> StandingsTableRow {
        StandingsTableRow(
            id: "golf|\(entry.player)",
            rank: entry.positionDisplay ?? entry.position.map { "\($0)." } ?? "–",
            name: entry.player,
            value: entry.score ?? "–",
            highlighted: highlighted
        )
    }

    // MARK: - MER (the deep link out)

    /// The specialist we hand the user off to for DEPTH — squad lists, xG, lap
    /// charts. VISJON v3: we do not compete on depth, we link to the one who
    /// owns it.
    ///
    /// Deliberately NARROW. A link that 404s or lands on a front page is worse
    /// than no link at all, so the map holds only search endpoints we are
    /// confident about, and every other sport simply has no MER section. Growing
    /// it is a one-line change once a URL has been verified by hand.
    static func specialistLink(sport: String, name: String) -> EntitySpecialistLink? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        guard let query = trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryValueAllowed) else { return nil }
        let template: (label: String, prefix: String)
        switch NewsLens.canonicalSport(sport) {
        case "football":
            template = ("FotMob", "https://www.fotmob.com/search?term=")
        case "cycling":
            template = ("ProCyclingStats", "https://www.procyclingstats.com/search.php?term=")
        case "esports":
            template = ("Liquipedia", "https://liquipedia.net/counterstrike/index.php?search=")
        default:
            return nil
        }
        guard let url = URL(string: template.prefix + query) else { return nil }
        return EntitySpecialistLink(label: template.label, url: url)
    }
}

private extension CharacterSet {
    /// Query-VALUE safe: `urlQueryAllowed` still permits `&`, `+` and `=`, which
    /// would break a name like "Brann & Co" out of its own parameter.
    static let urlQueryValueAllowed = CharacterSet.urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&+=?"))
}
