//
//  EntityIndex.swift
//  Zenji
//
//  WP-16 — the grounding substrate. A read-only wrapper around the WP-05
//  entity list (docs/data/entities.json, loaded via DataStore.loadEntities())
//  that answers three questions the FM-lekegrind needs:
//
//    • entity(id:)          exact lookup — the HARD grounding gate. A mutation
//                           is accepted ONLY if its entityId resolves here.
//    • search(_:)           free-text search backing the model's searchEntities
//                           tool (name/alias/id/sport, with Norwegian sport-word
//                           expansion so "tennis"/"sykkel" find their entities).
//    • nearestMatches(to:)  fuzzy lookup for a FAILED grounding — the "mente du
//                           …?" suggestions. String-similarity only (no sport
//                           expansion), so a typo ("Hovlan") suggests "Hovland"
//                           but a genuinely-absent sport ("cricket") suggests
//                           nothing rather than a misleading near-match.
//
//  detectEntities(in:) is the MOCK's utterance→entity matcher (see
//  MockInterestAssistant); it is deliberately NOT part of grounding — grounding
//  only ever trusts an exact `entityId`.
//
//  All matching routes through TextMatch (WP-13) for diacritic-folded,
//  word-boundary comparison, so "Barça" ≡ "Barca" and "Lyn" ≠ "Brooklyn" here
//  exactly as everywhere else in the app.
//

import Foundation

struct EntityIndex: Sendable {
    let entities: [Entity]
    private let byId: [String: Entity]

    init(_ entities: [Entity]) {
        self.entities = entities
        self.byId = Dictionary(entities.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    }

    // MARK: - Exact lookup (the grounding gate)

    func entity(id: String) -> Entity? { byId[id] }

    var isEmpty: Bool { entities.isEmpty }

    // MARK: - Tool-facing search

    /// Free-text search for the `searchEntities` tool. Ranks by name/alias/id
    /// containment, with Norwegian sport-keyword expansion (a bare "tennis" or
    /// "sykkel" returns that sport's entities). Deterministic order so the tool
    /// output — and therefore the model's grounding — is reproducible.
    func search(_ query: String, limit: Int = 8) -> [Entity] {
        let q = TextMatch.normalize(query)
        guard !q.isEmpty else { return [] }
        let sportFromQuery = Self.sportKeyword(in: query)

        var scored: [(Entity, Int)] = []
        for e in entities {
            var score = 0
            if e.id == q { score = 100 }
            for term in [e.name] + e.aliases {
                if TextMatch.containsName(query, term) { score = max(score, 75) }
                if TextMatch.containsName(term, query) { score = max(score, 70) }
                if TextMatch.normalize(term).contains(q) { score = max(score, 45) }
            }
            if let sport = sportFromQuery, e.sport == sport { score = max(score, 50) }
            if score > 0 { scored.append((e, score)) }
        }
        return scored
            .sorted { lhs, rhs in
                if lhs.1 != rhs.1 { return lhs.1 > rhs.1 }
                return lhs.0.name < rhs.0.name
            }
            .prefix(limit)
            .map { $0.0 }
    }

    // MARK: - Fuzzy nearest (failed-grounding suggestions)

    /// Nearest real entities for a phrase that did NOT ground — string
    /// similarity only, so it never fabricates a sport-level suggestion. Empty
    /// when nothing is genuinely close (the correct answer for "cricket").
    func nearestMatches(to query: String, limit: Int = 3) -> [Entity] {
        let q = TextMatch.normalize(query)
        guard !q.isEmpty else { return [] }

        var scored: [(Entity, Int)] = []
        for e in entities {
            var best = 0
            let terms = [e.name] + e.aliases + [e.id.replacingOccurrences(of: "-", with: " ")]
            for term in terms {
                best = max(best, Self.similarity(q, TextMatch.normalize(term)))
            }
            if best >= 55 { scored.append((e, best)) }
        }
        return scored
            .sorted { lhs, rhs in
                if lhs.1 != rhs.1 { return lhs.1 > rhs.1 }
                return lhs.0.name < rhs.0.name
            }
            .prefix(limit)
            .map { $0.0 }
    }

    // MARK: - Mock utterance detection (NOT grounding)

    /// Entities an utterance mentions, for the mock parser. Two signals:
    /// (3) the whole name/alias appears as words in the utterance
    /// (`containsName`), or (2) every significant token of the name (years and
    /// parenthetical qualifiers dropped) is present — so a year-suffixed
    /// tournament name like "Tour de France 2026" still matches "Tour de
    /// France". Only the highest-confidence tier is returned, so a scope phrase
    /// ("i OBOS-ligaen") never competes with the real target ("Lyn").
    func detectEntities(in utterance: String) -> [Entity] {
        let hayTokens = Set(Self.tokens(utterance))
        var scored: [(Entity, Int)] = []
        for e in entities {
            var score = 0
            for term in [e.name] + e.aliases {
                if TextMatch.containsName(utterance, term) { score = max(score, 3) }
                let sig = Set(Self.significantTokens(term))
                if !sig.isEmpty, sig.isSubset(of: hayTokens) { score = max(score, 2) }
            }
            if score > 0 { scored.append((e, score)) }
        }
        guard let best = scored.map(\.1).max() else { return [] }
        var seen = Set<String>()
        return scored
            .filter { $0.1 == best }
            .map { $0.0 }
            .filter { seen.insert($0.id).inserted }
            .sorted { $0.name < $1.name }
    }

    /// A representative entity for a whole-sport command ("mer sykkel", "slutt
    /// med tennis"). Prefers one already in the profile; otherwise the most
    /// "headline" entity of that sport (tournament > team > athlete > league).
    func representativeEntity(forSport sport: String, preferredIn profile: InterestProfile) -> Entity? {
        if let rule = profile.rules.first(where: { $0.sport == sport }), let e = entity(id: rule.entityId) {
            return e
        }
        let rank: [String: Int] = ["tournament": 0, "team": 1, "athlete": 2, "league": 3]
        return entities
            .filter { $0.sport == sport }
            .sorted { lhs, rhs in
                let a = rank[lhs.type] ?? 9, b = rank[rhs.type] ?? 9
                if a != b { return a < b }
                return lhs.name < rhs.name
            }
            .first
    }

    // MARK: - Tokenisation helpers

    /// Diacritic-folded, lower-cased alphanumeric tokens.
    static func tokens(_ s: String) -> [String] {
        TextMatch.normalize(s)
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
    }

    /// Tokens of a name with parenthetical qualifiers and 4-digit years dropped
    /// — the "meaningful" words to require for a token-overlap match.
    static func significantTokens(_ s: String) -> [String] {
        let noParens = s.replacingOccurrences(of: "\\([^)]*\\)", with: " ", options: .regularExpression)
        return tokens(noParens).filter { !isYear($0) }
    }

    static func isYear(_ t: String) -> Bool { t.count == 4 && t.allSatisfy(\.isNumber) }

    /// Canonical sport tag for a Norwegian/English keyword found in the query,
    /// if any (e.g. "sykkel" → "cycling", "sjakk" → "chess").
    static func sportKeyword(in query: String) -> String? {
        for token in tokens(query) {
            if let sport = SportVocabulary.keywordToSport[token] { return sport }
        }
        return nil
    }

    // MARK: - Similarity

    /// 0…100 similarity used only by `nearestMatches`. Cheap, deterministic:
    /// exact / prefix / substring shortcuts, else a length-normalised
    /// Levenshtein score.
    static func similarity(_ a: String, _ b: String) -> Int {
        if a.isEmpty || b.isEmpty { return 0 }
        if a == b { return 100 }
        if b.hasPrefix(a) || a.hasPrefix(b) { return 85 }
        if b.contains(a) || a.contains(b) { return 70 }
        let dist = levenshtein(Array(a), Array(b))
        let maxLen = max(a.count, b.count)
        let sim = 1.0 - Double(dist) / Double(maxLen)
        return Int((sim * 100).rounded())
    }

    private static func levenshtein(_ a: [Character], _ b: [Character]) -> Int {
        if a.isEmpty { return b.count }
        if b.isEmpty { return a.count }
        var prev = Array(0...b.count)
        var curr = [Int](repeating: 0, count: b.count + 1)
        for i in 1...a.count {
            curr[0] = i
            for j in 1...b.count {
                let cost = a[i - 1] == b[j - 1] ? 0 : 1
                curr[j] = min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
            }
            swap(&prev, &curr)
        }
        return prev[b.count]
    }
}

extension Entity {
    /// Memberwise initializer. `Entity` (WP-11) declares a custom `init(from:)`,
    /// which suppresses Swift's synthesised memberwise init — this restores a
    /// direct constructor so tests and previews can build entities without
    /// round-tripping through JSON.
    init(id: String, name: String, aliases: [String] = [], sport: String, type: String) {
        self.id = id
        self.name = name
        self.aliases = aliases
        self.sport = sport
        self.type = type
    }
}

/// Norwegian (and English) sport vocabulary — maps free-text keywords to the
/// canonical English sport tag entities carry, and back to a Norwegian display
/// word for the assistant's reasons.
enum SportVocabulary {
    static let keywordToSport: [String: String] = [
        "fotball": "football", "football": "football", "soccer": "football",
        "golf": "golf",
        "tennis": "tennis",
        "sjakk": "chess", "chess": "chess",
        "sykkel": "cycling", "sykling": "cycling", "landeveissykling": "cycling", "cycling": "cycling",
        "friidrett": "athletics", "athletics": "athletics", "løping": "athletics",
        "f1": "f1", "formel1": "f1", "formel": "f1", "formula1": "f1", "formula": "f1",
        "esport": "esports", "esports": "esports", "cs2": "esports", "cs": "esports", "counterstrike": "esports"
    ]

    static let sportDisplay: [String: String] = [
        "football": "fotball", "golf": "golf", "tennis": "tennis", "chess": "sjakk",
        "cycling": "sykkel", "athletics": "friidrett", "f1": "Formel 1", "esports": "CS2/esport"
    ]

    static func display(for sport: String) -> String { sportDisplay[sport] ?? sport }
}
