//
//  FollowPresenter.swift
//  Sportivista
//
//  WP-120 — the pure, testable core behind the «Det du følger» surfaces (the
//  redesigned FollowedListView + FollowDetailView). The owner finding (20.07):
//  the follow list was a name list whose subtitle read identically on every row
//  («varsler på») — dead information. Each row must instead answer «what does
//  following this GIVE me?». This value type answers that per rule:
//
//    • group(for:)        — which display group a rule belongs to
//                           (UTØVERE/LAG/TURNERINGER/LIGAER/SPORTER/KATEGORIER),
//                           so the list can section by rule TYPE.
//    • nextEvents(for:)    — the next 1–3 events for that rule (the row subtitle
//                           + the detail's KOMMENDE section), using the lens's
//                           OWN matching: a whole-sport rule matches by sport,
//                           an athlete/team/tournament rule by FeedQuery's
//                           entity match — never a new fuzzy scheme.
//    • newsItems(for:)     — the lens-matched news pointers about the rule
//                           (the detail's SISTE NYTT), via a single-rule NewsLens.
//    • rowSubtitle(for:)   — the calm «Neste: lør 25. · Strømsgodset – Lyn · TV 2»
//                           line, or an honest «Ikke satt opp ennå».
//
//  Foundation-only and clock-injected (`now` is passed), so FollowPresenterTests
//  drives every branch against the checked-in fixtures with no SwiftUI + no app.
//

import Foundation

/// The display group a follow rule falls into, ordered as the list renders them.
/// Mirrors the entity `type` vocabulary (athlete/team/tournament/league/sport/
/// category) so the sectioning is a true 1:1 with what the rule follows.
enum FollowGroup: Int, CaseIterable {
    case athlete, team, tournament, league, sport, category, other

    init(entityType: String) {
        switch entityType {
        case "athlete": self = .athlete
        case "team": self = .team
        case "tournament": self = .tournament
        case "league": self = .league
        case "sport": self = .sport
        case "category": self = .category
        default: self = .other
        }
    }

    /// The Norwegian section header (DESIGN § Gruppeoverskrift: uppercase).
    var header: String {
        switch self {
        case .athlete: return "UTØVERE"
        case .team: return "LAG"
        case .tournament: return "TURNERINGER"
        case .league: return "LIGAER"
        case .sport: return "SPORTER"
        case .category: return "KATEGORIER"
        case .other: return "ANNET"
        }
    }
}

/// One type-grouped section of the follow list (Identifiable off the group, so
/// SwiftUI's `ForEach` iterates it directly — a tuple isn't key-path-addressable).
struct FollowSection: Identifiable {
    let group: FollowGroup
    let rules: [InterestRule]
    var id: Int { group.rawValue }
}

struct FollowPresenter {
    let feed: FeedQuery
    let index: EntityIndex
    let news: [NewsItem]
    let now: Date

    init(feed: FeedQuery, index: EntityIndex, news: [NewsItem] = [], now: Date = Date()) {
        self.feed = feed
        self.index = index
        self.news = news
        self.now = now
    }

    // MARK: - Sectioning by rule type

    /// The rules grouped into their display groups, in canonical order, dropping
    /// empty groups. Order within a group is preserved (the profile is already
    /// sorted by (sport, name)).
    func sections(for rules: [InterestRule]) -> [FollowSection] {
        var byGroup: [FollowGroup: [InterestRule]] = [:]
        for rule in rules { byGroup[group(for: rule), default: []].append(rule) }
        return FollowGroup.allCases.compactMap { g in
            guard let rs = byGroup[g], !rs.isEmpty else { return nil }
            return FollowSection(group: g, rules: rs)
        }
    }

    /// The display group for a rule — the resolved entity's `type` when the index
    /// has it, else inferred from the build-entities id convention (`sport-…` /
    /// `category-…`), else `.other`.
    func group(for rule: InterestRule) -> FollowGroup {
        if let type = index.entity(id: rule.entityId)?.type {
            return FollowGroup(entityType: type)
        }
        if rule.entityId.hasPrefix("sport-") { return .sport }
        if rule.entityId.hasPrefix("category-") { return .category }
        return .other
    }

    // MARK: - Next events (KOMMENDE + the row subtitle)

    /// The next `limit` upcoming events for a rule, in agenda order. A whole-sport
    /// / category rule matches by sport; an athlete/team/tournament/league rule
    /// matches by the resolved entity (falling back to a rule-derived stand-in
    /// entity when the index hasn't synced). Reuses FeedQuery's existing matching.
    func nextEvents(for rule: InterestRule, limit: Int = 3) -> [FeedQueryEvent] {
        switch group(for: rule) {
        case .sport, .category:
            return feed.upcoming(inSports: followedSports(for: rule), limit: limit)
        default:
            return feed.upcoming(matching: entity(for: rule), limit: limit)
        }
    }

    // MARK: - News (SISTE NYTT)

    /// The lens-matched news pointers about a rule, newest first. Uses a
    /// single-rule NewsLens so the match is EXACTLY the Nyheter board's (an
    /// entityId hit, or — for a whole-sport rule — a sport hit); invents nothing.
    func newsItems(for rule: InterestRule, limit: Int = 3) -> [NewsItem] {
        let lens = NewsLens(profile: InterestProfile(rules: [rule]), index: index)
        guard !lens.isEmpty else { return [] }
        let matched = news
            .filter { lens.matches($0) }
            .sorted { ($0.publishedAt ?? .distantPast) > ($1.publishedAt ?? .distantPast) }
        return Array(matched.prefix(limit))
    }

    // MARK: - Row subtitle

    /// The calm per-entity subtitle: «Neste: lør 25. · Strømsgodset – Lyn · TV 2»
    /// (day · what · where), or an honest «Ikke satt opp ennå» when nothing is
    /// scheduled — replacing the old, identical-on-every-row «varsler på».
    func rowSubtitle(for rule: InterestRule) -> String {
        guard let next = nextEvents(for: rule, limit: 1).first else { return "Ikke satt opp ennå" }
        var parts = ["Neste: \(shortDayLabel(dayKey: next.dayKey))", next.title]
        if next.channelLabel != "–" { parts.append(next.channelLabel) }
        return parts.joined(separator: " · ")
    }

    // MARK: - Helpers

    /// The resolved entity for a rule, or a stand-in built from the rule's own
    /// cached fields when the index hasn't synced (so matching still works off the
    /// carried entityId + name).
    func entity(for rule: InterestRule) -> Entity {
        index.entity(id: rule.entityId)
            ?? Entity(id: rule.entityId, name: rule.entityName, aliases: [], sport: rule.sport, type: "")
    }

    /// The canonical sports a whole-sport / category rule opens — the SAME
    /// classification NewsLens uses (sport / umbrella category), via a single-rule
    /// lens so there is one source of truth for "what sports does this follow?".
    func followedSports(for rule: InterestRule) -> Set<String> {
        NewsLens(profile: InterestProfile(rules: [rule]), index: index).followedSports
    }

    /// «i dag» / «i morgen» / «lør 25.» for an Oslo day-key (never a clock — the
    /// subtitle answers "when", the day; the detail carries the exact time).
    func shortDayLabel(dayKey: String) -> String {
        if dayKey == FeedCompiler.osloDayKey(now) { return "i dag" }
        if dayKey == FeedCompiler.osloDayKey(now.addingTimeInterval(86_400)) { return "i morgen" }
        guard let date = Self.dayKeyFormatter.date(from: dayKey) else { return dayKey }
        return Self.shortDayFormatter.string(from: date)
    }

    private static let dayKeyFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let shortDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = "EEE d."
        return f
    }()
}
