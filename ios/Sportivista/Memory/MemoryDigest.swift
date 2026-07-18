//
//  MemoryDigest.swift
//  Sportivista
//
//  WP-30 — RETRIEVAL. Foundation Models is stateless: "memory" is persisted data
//  (MemoryStore) plus SMART INSERTION into the session. This is the insertion
//  side, and it is deliberately PURE SWIFT — entity-match + freshness, no AI in
//  retrieval, so what the model is told is deterministic and testable.
//
//  `build(...)` turns the live `MemoryState` into a compact Norwegian block
//  (~500-token cap) that the assistant injects into the `LanguageModelSession`
//  instructions for BOTH the answer/mutation call and the `saveMemory` tool. So
//  a Q&A answer can now REFLECT what we know about you — explain fagtermer when
//  you're a beginner, keep quiet about outcomes when you have a spoiler policy,
//  honour your notify window.
//
//  Selection (deterministic):
//    • GLOBAL facts (no entity, no sport) always apply → always included.
//    • A fact/note scoped to one of `relevantEntityIds` or `relevantSports` is
//      included; anything scoped to something NOT relevant right now is skipped
//      (the digest stays about what's in front of the user).
//    • Episodic notes must be FRESH (unexpired at `now`); newest first.
//    • Ordered facts-before-notes, spoiler policies FIRST (the safety-critical
//      ones must never be the line that gets truncated away), then capped to the
//      character budget (~4 chars/token).
//

import Foundation

enum MemoryDigest {
    /// Rough chars-per-token used to turn the token cap into a character budget.
    static let charsPerToken = 4

    /// Build the injected memory block, or "" when nothing relevant is remembered
    /// (the caller appends nothing, so an empty memory changes no instruction).
    static func build(
        memory: MemoryState,
        relevantEntityIds: Set<String> = [],
        relevantSports: Set<String> = [],
        now: Date = Date(),
        tokenCap: Int = 500
    ) -> String {
        let facts = relevantFacts(memory.facts, entityIds: relevantEntityIds, sports: relevantSports)
        let notes = relevantNotes(memory.episodic, entityIds: relevantEntityIds, sports: relevantSports, now: now)
        guard !facts.isEmpty || !notes.isEmpty else { return "" }

        let budget = tokenCap * charsPerToken
        var lines: [String] = ["Det du vet om brukeren (personlig kontekst — bruk det til å svare personlig, aldri les det opp):"]
        var used = lines[0].count

        func appendWithinBudget(_ line: String) {
            // +1 for the newline. Always allow the first content line so the block
            // is never just a header.
            if used + line.count + 1 <= budget || lines.count == 1 {
                lines.append(line)
                used += line.count + 1
            }
        }

        for fact in facts { appendWithinBudget("- " + factLine(fact)) }
        if !notes.isEmpty {
            appendWithinBudget("Nylig lært:")
            for note in notes { appendWithinBudget("- " + noteLine(note)) }
        }
        return lines.joined(separator: "\n")
    }

    // MARK: - Selection

    /// Facts that apply right now: global facts (unscoped) always, plus any scoped
    /// to a relevant entity/sport. Spoiler policies float to the front so a tight
    /// budget can never drop them.
    static func relevantFacts(_ facts: [MemoryFact], entityIds: Set<String>, sports: Set<String>) -> [MemoryFact] {
        facts
            .filter { fact in
                let global = fact.entityId == nil && fact.sport == nil
                let entityHit = fact.entityId.map(entityIds.contains) ?? false
                let sportHit = fact.sport.map(sports.contains) ?? false
                return global || entityHit || sportHit
            }
            .sorted { lhs, rhs in
                // spoilerPolicy first (safety-critical), then a stable order.
                let lp = lhs.kind == .spoilerPolicy ? 0 : 1
                let rp = rhs.kind == .spoilerPolicy ? 0 : 1
                if lp != rp { return lp < rp }
                if lhs.kind != rhs.kind { return lhs.kind.rawValue < rhs.kind.rawValue }
                return lhs.updatedAt > rhs.updatedAt
            }
    }

    /// Fresh episodic notes relevant now: unexpired at `now`, about a relevant
    /// entity/sport (a note with NO refs is treated as globally relevant),
    /// newest first.
    static func relevantNotes(_ notes: [EpisodicNote], entityIds: Set<String>, sports: Set<String>, now: Date) -> [EpisodicNote] {
        notes
            .filter { $0.isMemory && $0.isFresh(at: now) }
            .filter { note in
                let refs = note.entityRefs
                if refs.isEmpty { return true }
                return refs.contains { entityIds.contains($0) || sports.contains($0) }
            }
            .sorted { $0.createdAt > $1.createdAt }
    }

    // MARK: - Rendering

    static func factLine(_ fact: MemoryFact) -> String {
        let scope: String
        if let sport = fact.sport { scope = SportVocabulary.display(for: sport) }
        else if let entityId = fact.entityId { scope = entityId }
        else { scope = "generelt" }
        switch fact.kind {
        case .knowledgeLevel:
            return "\(scope): kunnskapsnivå «\(fact.value)» — tilpass forklaringen (forklar fagtermer for en nybegynner)."
        case .spoilerPolicy:
            return "\(scope): SPOILERVERN på (\(fact.value)) — avslør ALDRI resultat, vinner eller stilling."
        case .notifyWindow:
            return "Varselsvindu: \(fact.value)."
        case .preference:
            return "\(scope): preferanse — \(fact.value)."
        case .note:
            return "\(scope): \(fact.value)."
        }
    }

    static func noteLine(_ note: EpisodicNote) -> String {
        note.summary
    }
}
