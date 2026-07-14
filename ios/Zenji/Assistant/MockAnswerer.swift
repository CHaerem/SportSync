//
//  MockAnswerer.swift
//  Zenji
//
//  WP-16.4 — the deterministic stand-in for the FM model's ANSWER arm, the
//  Q&A counterpart to MockInterestParser's mutation arm. Apple Intelligence
//  can't run in CI/Simulator, so the intent router and the answer generator
//  are both plain, pure functions the tests drive directly:
//
//    • isQuestion(_:)  — routes an utterance to the answer arm vs. the mutation
//      arm. Conservative: only a "?" or a leading/embedded Norwegian
//      interrogative ("hva", "når", "hvem", "hvilke", "hvorfor", "hvor")
//      counts as a question, so every WP-16 mutation phrase ("Følg …", "Slutt
//      med …", "Prioriter …") still routes to mutations unchanged.
//    • answer(...)     — turns a question into a calm Norwegian answer over the
//      LOCAL FeedQuery: "i kveld"/"i dag" list, "neste <X>" lookup, or the next
//      few upcoming rows. Always references real rows (time · title · channel)
//      and returns their ids, mirroring what the tool-using FM is asked to do.
//
//  Not a general NLU — just enough to exercise the whole answer path against
//  the canonical questions ("hva bør jeg se i kveld?", "når går neste
//  TdF-etappe?") deterministically, exactly as MockInterestParser is for
//  mutations.
//

import Foundation

enum MockAnswerer {

    // MARK: - Intent routing

    private static let interrogatives: Set<String> = [
        "hva", "hvem", "hvilke", "hvilken", "hvilket", "hvorfor", "hvor", "nar", // "når" → "nar" after fold
    ]

    /// True when the utterance reads as a QUESTION (answer arm) rather than a
    /// command (mutation arm). Deliberately narrow — see the file header.
    static func isQuestion(_ utterance: String) -> Bool {
        if utterance.contains("?") { return true }
        let tokens = EntityIndex.tokens(utterance)
        guard let first = tokens.first else { return false }
        if interrogatives.contains(first) { return true }
        // An interrogative anywhere is still a question ("... og hva med i morgen").
        return tokens.contains { interrogatives.contains($0) }
    }

    // MARK: - Answer generation

    /// Turn a question into a calm answer over the local agenda. Never throws
    /// and never blank: an empty agenda yields an honest "jeg ser ingenting …"
    /// (which the view model shows as an answer, not a misunderstanding).
    /// WP-30: the answer then REFLECTS the personal memory (`reflectMemory`) — a
    /// knowledge-level fact makes it offer to explain fagtermer.
    static func answer(utterance: String, feed: FeedQuery, index: EntityIndex, memory: MemoryState = MemoryState()) -> AssistantAnswer {
        let base = baseAnswer(utterance: utterance, feed: feed, index: index)
        return reflectMemory(base, utterance: utterance, feed: feed, index: index, memory: memory)
    }

    private static func baseAnswer(utterance: String, feed: FeedQuery, index: EntityIndex) -> AssistantAnswer {
        let n = " " + TextMatch.normalize(utterance) + " "

        // 1) "i kveld" / "i dag" — the calendar questions.
        if n.contains(" kveld ") {
            return list(lead: "I kveld kan du se", hits: feed.tonight(), empty: "Jeg ser ingenting igjen i kveld i agendaen din.")
        }
        if n.contains(" i dag ") || n.contains(" idag ") {
            return list(lead: "I dag kan du se", hits: feed.today(), empty: "Jeg ser ingenting mer i dag i agendaen din.")
        }

        // 2) "neste <noe>" — the next matching event. Resolve the phrase to a
        //    real entity first (year/alias/typo-tolerant), so "neste TdF-etappe"
        //    and "neste Tour de France" both land on the tournament.
        if n.contains(" neste ") {
            if let entity = index.resolve(residual(utterance)).served ?? bestEntity(in: utterance, index: index),
               let hit = feed.next(matching: entity) {
                return single(lead: "Neste \(entity.name):", hit: hit)
            }
            if let hit = feed.upcoming().first {
                return single(lead: "Det neste på agendaen din er", hit: hit)
            }
            return AssistantAnswer(text: "Jeg finner ingenting kommende som passer i agendaen din.")
        }

        // 3) A named sport/entity anywhere → what's coming up for it.
        if let entity = bestEntity(in: utterance, index: index) {
            let hits = feed.search(entity.name, limit: 4)
            if !hits.isEmpty {
                return list(lead: "Kommende for \(entity.name):", hits: hits, empty: "")
            }
        }
        if let sport = EntityIndex.sportKeyword(in: utterance) {
            let hits = feed.search(sport, limit: 4)
            if !hits.isEmpty {
                return list(lead: "Kommende:", hits: hits, empty: "")
            }
        }

        // 4) Fallback — the next few upcoming rows.
        let upcoming = Array(feed.upcoming().prefix(3))
        return list(lead: "Det neste på agendaen din:", hits: upcoming,
                    empty: "Jeg ser ingenting kommende i agendaen din akkurat nå.")
    }

    // MARK: - Memory reflection (WP-30)

    /// Fold the personal memory into an answer. Deterministic and pure (the
    /// mock's counterpart to the FM model reading the injected digest): if the
    /// user is a beginner in the sport the answer is ABOUT, append an offer to
    /// explain fagtermer, so the reply visibly changes with what we know.
    static func reflectMemory(_ base: AssistantAnswer, utterance: String, feed: FeedQuery, index: EntityIndex, memory: MemoryState) -> AssistantAnswer {
        guard !base.text.isEmpty, !memory.facts.isEmpty else { return base }
        let (sports, entityIds) = topics(utterance: utterance, referencedIds: base.referencedEventIds, feed: feed, index: index)

        let beginner = memory.facts.first { fact in
            fact.kind == .knowledgeLevel &&
            ((fact.sport.map(sports.contains) ?? false) || (fact.entityId.map(entityIds.contains) ?? false))
        }
        guard let beginner else { return base }
        let where_ = beginner.sport.map(SportVocabulary.display(for:)) ?? "dette"
        return AssistantAnswer(
            text: base.text + " Jeg forklarer fagtermer underveis siden du er fersk i \(where_).",
            referencedEventIds: base.referencedEventIds
        )
    }

    /// The sports + entity ids an answer is ABOUT: from the referenced agenda
    /// rows (authoritative) plus anything named in the utterance.
    private static func topics(utterance: String, referencedIds: [String], feed: FeedQuery, index: EntityIndex) -> (sports: Set<String>, entityIds: Set<String>) {
        var sports = Set<String>()
        var entityIds = Set<String>()
        let byId = Dictionary(feed.events.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        for id in referencedIds {
            if let e = byId[id] { sports.insert(e.sport); entityIds.formUnion(e.entityIds) }
        }
        for e in index.detectEntities(in: utterance) { sports.insert(e.sport); entityIds.insert(e.id) }
        if let sport = EntityIndex.sportKeyword(in: utterance) { sports.insert(sport) }
        return (sports, entityIds)
    }

    // MARK: - Composition

    private static func list(lead: String, hits: [FeedQueryEvent], empty: String) -> AssistantAnswer {
        guard !hits.isEmpty else { return AssistantAnswer(text: empty) }
        let parts = hits.map(phrase(for:))
        return AssistantAnswer(text: "\(lead) \(parts.joined(separator: ", ")).", referencedEventIds: hits.map(\.id))
    }

    private static func single(lead: String, hit: FeedQueryEvent) -> AssistantAnswer {
        AssistantAnswer(text: "\(lead) \(phrase(for: hit)).", referencedEventIds: [hit.id])
    }

    /// "<tittel> kl. HH:mm på <kanal>" (or "…, kanal ukjent" when the channel
    /// is the honest "–"). A multi-day window drops the "kl." (it's a span, not
    /// a clock).
    private static func phrase(for e: FeedQueryEvent) -> String {
        let clock = e.timeLabel.contains(":") ? "kl. \(e.timeLabel)" : e.timeLabel
        let base = "\(e.title) \(clock)"
        return e.channelLabel == "–" ? "\(base), kanal ukjent" : "\(base) på \(e.channelLabel)"
    }

    // MARK: - Entity extraction (reuse the mock parser's detector)

    private static func bestEntity(in utterance: String, index: EntityIndex) -> Entity? {
        index.detectEntities(in: utterance).first
    }

    /// The residual query for the resolver — drop obvious stopwords/verbs so
    /// "når går neste TdF-etappe" resolves on "tdf etappe" → the tournament.
    private static func residual(_ utterance: String) -> String {
        let drop: Set<String> = ["nar", "gar", "neste", "er", "det", "en", "et", "pa", "i", "kveld", "dag",
                                  "hva", "hvem", "hvilke", "hvilken", "hvilket", "hvorfor", "hvor",
                                  "bor", "jeg", "se", "kan", "skjer", "med", "og", "etappe", "etapper", "kamp", "runde"]
        return EntityIndex.tokens(utterance)
            .filter { !drop.contains($0) && !EntityIndex.isYear($0) }
            .joined(separator: " ")
    }
}
