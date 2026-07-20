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
    /// empty groups. Within a group, WP-138 applies a mild affinity LIFT: the
    /// entities you engage with most float up, with the profile's existing
    /// (sport, name) order as a STABLE tie-break — so an EMPTY affinity (a fresh
    /// user, or no signal) reproduces today's order byte-for-byte. This is a lift
    /// where the intra-group order was otherwise arbitrary (alphabetical), never a
    /// change to WHICH rules appear.
    func sections(for rules: [InterestRule], affinity: Affinity = Affinity(behavior: [])) -> [FollowSection] {
        var byGroup: [FollowGroup: [(rule: InterestRule, idx: Int)]] = [:]
        for (i, rule) in rules.enumerated() { byGroup[group(for: rule), default: []].append((rule, i)) }
        return FollowGroup.allCases.compactMap { g in
            guard let rs = byGroup[g], !rs.isEmpty else { return nil }
            let lifted = rs.sorted { a, b in
                let sa = affinity.score(entityId: a.rule.entityId, sport: a.rule.sport)
                let sb = affinity.score(entityId: b.rule.entityId, sport: b.rule.sport)
                if sa != sb { return sa > sb }
                return a.idx < b.idx            // stable → empty affinity keeps original order
            }
            return FollowSection(group: g, rules: lifted.map(\.rule))
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

    // MARK: - Match state (the WP-125 lens-miss signal)

    /// How a followed rule is currently doing against the board — the calm signal
    /// that makes a silently-dead follow visible without any telemetry:
    ///   • `.scheduled`  — ≥1 upcoming event → the «Neste: …» subtitle.
    ///   • `.idle`       — a real follow that just has nothing right now (a known
    ///                     entity, a whole-sport follow, or one still carrying
    ///                     news): «Ikke satt opp ennå».
    ///   • `.unresolved` — the followed NAME resolves to nothing we know AND has no
    ///                     news either — most likely a wrong/mistyped name:
    ///                     «Ingen treff — sjekk navnet», with nearest-name help in
    ///                     the detail.
    enum FollowMatchState: Equatable { case scheduled, idle, unresolved }

    /// Classify a rule (see `FollowMatchState`). A whole-sport / category follow is
    /// always a valid follow, so it is never `.unresolved`. Everything else is
    /// `.unresolved` only when its entityId is absent from the index (an unknown
    /// name) AND no lens-matched news carries it.
    func matchState(for rule: InterestRule) -> FollowMatchState {
        if !nextEvents(for: rule, limit: 1).isEmpty { return .scheduled }
        switch group(for: rule) {
        case .sport, .category:
            return .idle
        default:
            let known = index.entity(id: rule.entityId) != nil
            let hasNews = !newsItems(for: rule, limit: 1).isEmpty
            return (known || hasNews) ? .idle : .unresolved
        }
    }

    /// Nearest known names for an `.unresolved` follow — the index's OWN fuzzy
    /// resolver (`nearestMatches`, no new matching), so a mistyped follow can be
    /// checked against real entities. Empty for a resolved follow, or when nothing
    /// is genuinely close (the honest answer). The rule's own id is filtered out.
    func nameSuggestions(for rule: InterestRule, limit: Int = 3) -> [Entity] {
        guard matchState(for: rule) == .unresolved else { return [] }
        return index.nearestMatches(to: rule.entityName, limit: limit)
            .filter { $0.id != rule.entityId }
    }

    // MARK: - Row subtitle

    /// The calm per-entity subtitle: «Neste: lør 25. · Strømsgodset – Lyn · TV 2»
    /// (day · what · where) when scheduled; an honest «Ikke satt opp ennå» when a
    /// real follow is quiet; or «Ingen treff — sjekk navnet» when the name resolves
    /// to nothing (the WP-125 lens-miss signal). No technical words ever.
    func rowSubtitle(for rule: InterestRule) -> String {
        if let next = nextEvents(for: rule, limit: 1).first {
            var parts = ["Neste: \(shortDayLabel(dayKey: next.dayKey))", next.title]
            if next.channelLabel != "–" { parts.append(next.channelLabel) }
            return parts.joined(separator: " · ")
        }
        return matchState(for: rule) == .unresolved ? "Ingen treff — sjekk navnet" : "Ikke satt opp ennå"
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
