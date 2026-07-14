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

    // MARK: - Ranked fuzzy resolver (WP-16.2 — the shared identity lookup)

    /// The outcome of resolving a free-text phrase to real entities. `candidates`
    /// is the ranked, score-descending shortlist (each ≥ `candidateFloor`);
    /// `served` is the single, confident, UNAMBIGUOUS winner (nil when nothing
    /// clears the bar or when two candidates are too close to separate).
    struct Resolution: Equatable, Sendable {
        var candidates: [ScoredEntity]
        var served: Entity?
        var isEmpty: Bool { candidates.isEmpty }
    }

    struct ScoredEntity: Equatable, Sendable {
        var entity: Entity
        var score: Int
    }

    // Thresholds. `candidateFloor`: minimum score to be offered as a "mente du"
    // suggestion. `autoUseFloor` + `leadMargin`: an AUTO-eligible top hit (exact
    // name/alias, exact initials, or a same-shape typo) at/above this score that
    // clearly leads the runner-up is SERVED directly — so "tour de france",
    // "tdf" and "Tour de Farnce" never reach the rejection path again. A merely
    // strong-but-partial match (a prefix like "Hovlan", a substring) is
    // suggestion-only, never auto-served.
    static let candidateFloor = 55
    static let autoUseFloor = 66
    static let leadMargin = 12

    /// Resolve a phrase to a ranked candidate list + (maybe) one served winner.
    /// Diacritic/case-folded (TextMatch), year-suffix-agnostic, alias-aware,
    /// prefix/contains, initials-aware, and edit-distance≤2 typo-tolerant. No
    /// Norwegian sport-word expansion — resolving an IDENTITY from "tennis" must
    /// not silently pick one tennis entity (that stays ambiguous / unresolved).
    func resolve(_ query: String, limit: Int = 5) -> Resolution {
        let q = TextMatch.normalize(query)
        guard !q.isEmpty else { return Resolution(candidates: [], served: nil) }
        let qTokens = q.split(separator: " ").map(String.init)

        var scored: [(entity: Entity, score: Int, auto: Bool)] = []
        for e in entities {
            if let m = Self.matchScore(for: e, queryNorm: q, queryTokens: qTokens), m.score >= Self.candidateFloor {
                scored.append((e, m.score, m.auto))
            }
        }
        let ranked = scored.sorted { lhs, rhs in
            if lhs.score != rhs.score { return lhs.score > rhs.score }
            return lhs.entity.name < rhs.entity.name
        }
        let candidates = ranked.prefix(limit).map { ScoredEntity(entity: $0.entity, score: $0.score) }

        var served: Entity?
        if let top = ranked.first, top.auto, top.score >= Self.autoUseFloor {
            let clearLead = ranked.count < 2 || (top.score - ranked[1].score) >= Self.leadMargin
            if clearLead { served = top.entity }
        }
        return Resolution(candidates: Array(candidates), served: served)
    }

    // MARK: - Tool-facing search

    /// Free-text search for the `searchEntities` tool — the resolver's ranked
    /// hits PLUS Norwegian sport-keyword expansion (a bare "tennis"/"sykkel"
    /// returns that sport's entities), so the model gets the same fuzzy quality
    /// (year/alias/initials/typo) the grounder does. Deterministic order so the
    /// tool output — and therefore the model's grounding — is reproducible.
    func search(_ query: String, limit: Int = 8) -> [Entity] {
        let q = TextMatch.normalize(query)
        guard !q.isEmpty else { return [] }

        var scoreById: [String: Int] = [:]
        for c in resolve(query, limit: entities.count).candidates {
            scoreById[c.entity.id] = c.score
        }
        if let sport = Self.sportKeyword(in: query) {
            for e in entities where e.sport == sport {
                scoreById[e.id] = max(scoreById[e.id] ?? 0, 50)
            }
        }
        return entities
            .filter { scoreById[$0.id] != nil }
            .sorted { lhs, rhs in
                let a = scoreById[lhs.id] ?? 0, b = scoreById[rhs.id] ?? 0
                if a != b { return a > b }
                return lhs.name < rhs.name
            }
            .prefix(limit)
            .map { $0 }
    }

    // MARK: - Fuzzy nearest (failed-grounding suggestions)

    /// Nearest real entities for a phrase that did NOT ground — the resolver's
    /// candidate list (identity-only, no sport expansion), so it never
    /// fabricates a sport-level suggestion. Empty when nothing is genuinely
    /// close (the correct answer for "cricket").
    func nearestMatches(to query: String, limit: Int = 3) -> [Entity] {
        resolve(query, limit: limit).candidates.map(\.entity)
    }

    // MARK: - Scoring one entity against a query

    /// Best (score, auto-eligible) for one entity, or nil if nothing matches.
    /// `auto` marks a HIGH-confidence identity match (exact name/alias/initials
    /// or a same-shape typo) that may be served without the user tapping; a
    /// partial match (prefix/substring/single-word fuzz) scores well but stays
    /// suggestion-only.
    static func matchScore(for e: Entity, queryNorm q: String, queryTokens qTokens: [String]) -> (score: Int, auto: Bool)? {
        var best = 0
        var bestAuto = false
        func consider(_ score: Int, _ auto: Bool) {
            if score > best { best = score; bestAuto = auto }
            else if score == best, auto, !bestAuto { bestAuto = true }
        }

        var terms = [e.name] + e.aliases
        terms.append(e.id.replacingOccurrences(of: "-", with: " "))
        for raw in terms {
            let tn = TextMatch.normalize(raw)
            let stripped = editionStripped(tn)
            for termNorm in Set([tn, stripped]) where !termNorm.isEmpty {
                if termNorm == q { consider(100, true); continue }
                if q.count >= 3, termNorm.count >= 3, (termNorm.hasPrefix(q) || q.hasPrefix(termNorm)) {
                    consider(88, false)
                }
                if TextMatch.containsName(raw, q) { consider(82, false) }
                if TextMatch.containsName(q, raw) { consider(78, false) }
                let tTokens = termNorm.split(separator: " ").map(String.init)
                if tTokens.count >= 2, qTokens.count == tTokens.count,
                   let d = tokenwiseDistance(qTokens, tTokens), d >= 1, d <= 2 {
                    consider(d == 1 ? 84 : 80, true)   // same-shape typo — auto
                }
                if q.count >= 3, (termNorm.contains(q) || q.contains(termNorm)) { consider(58, false) }
                let sim = similarity(q, termNorm)
                if sim >= 60 { consider(min(sim, 79), false) }
            }
        }
        for ini in e.initials where TextMatch.normalize(ini) == q { consider(96, true) }
        if let onFly = onTheFlyInitials(e), onFly == q { consider(72, false) }

        return best > 0 ? (best, bestAuto) : nil
    }

    /// Sum of per-token Levenshtein distances when the two token lists align
    /// 1:1; nil when they cannot be trusted as the same phrase (a differing
    /// pair too short to be a mere typo, or any single pair already > 2 apart).
    static func tokenwiseDistance(_ a: [String], _ b: [String]) -> Int? {
        guard a.count == b.count, !a.isEmpty else { return nil }
        var total = 0
        for (x, y) in zip(a, b) where x != y {
            if max(x.count, y.count) < 4 { return nil }   // too short to fuzz safely
            let d = levenshtein(Array(x), Array(y))
            if d > 2 { return nil }
            total += d
            if total > 2 { return nil }
        }
        return total
    }

    /// A normalized string with edition noise stripped: a trailing "(…)"
    /// annotation and any 4-digit year / "2026/27" season token, collapsed —
    /// so "tour de france 2026" ≡ "tour de france". Mirrors build-entities.js's
    /// `editionStrippedName` on the resolver side.
    static func editionStripped(_ norm: String) -> String {
        var s = norm.replacingOccurrences(of: "\\s*\\([^)]*\\)\\s*$", with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: "\\b(?:19|20)\\d{2}(?:\\s*/\\s*\\d{2})?\\b", with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: "\\s{2,}", with: " ", options: .regularExpression)
        return s.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    }

    /// The acronym a 3+-letter-word name would fold to ("tour de france" →
    /// "tdf"), computed on the fly (normalized). A softer, suggestion-tier
    /// signal than the STORED, collision-checked `initials` field: two entities
    /// sharing an acronym have it dropped from their stored data, but both still
    /// surface here as "mente du" candidates rather than one being mis-served.
    static func onTheFlyInitials(_ e: Entity) -> String? {
        let words = editionStripped(TextMatch.normalize(e.name))
            .split(separator: " ")
            .map(String.init)
            .filter { $0.first?.isLetter == true }
        guard words.count >= 3 else { return nil }
        return words.compactMap(\.first).map(String.init).joined()
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
    init(id: String, name: String, aliases: [String] = [], sport: String, type: String, initials: [String] = []) {
        self.id = id
        self.name = name
        self.aliases = aliases
        self.sport = sport
        self.type = type
        self.initials = initials
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
