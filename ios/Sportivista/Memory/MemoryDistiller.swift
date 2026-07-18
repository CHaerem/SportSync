//
//  MemoryDistiller.swift
//  Sportivista
//
//  WP-30 — EPISODIC distillation. After an assistant conversation, a Foundation
//  Model distils a COMPACT structured note (`DistilledNote`) — NEVER a raw
//  transcript (the P350 rule): "Lærte: skal se Tour-etappen i opptak i kveld."
//  The note is then appended to `ProfileSyncState.episodic` (WP-19,
//  append-only).
//
//  Behind a protocol for the same portability/testability reason as
//  `InterestAssistant`: the real distiller is on-device Apple Intelligence
//  (`FoundationModelsMemoryDistiller`, the only file that imports the framework
//  and emits the `@Generable` note); `MockMemoryDistiller` is a deterministic
//  Norwegian keyword distiller the tests + CI drive without Apple Intelligence.
//

import Foundation

/// One assistant exchange to distil: what the user said and how the assistant
/// responded (an answer, or a short account of the mutations applied). Never the
/// full multi-turn transcript — just the latest exchange.
struct MemoryConversation: Equatable, Sendable {
    var userText: String
    var assistantText: String

    init(userText: String, assistantText: String = "") {
        self.userText = userText
        self.assistantText = assistantText
    }
}

protocol MemoryDistiller: Sendable {
    /// Distil one exchange into a compact note, or nil when there is nothing
    /// durable worth remembering. `index` grounds `entityRefs` to real ids/sports.
    func distill(_ conversation: MemoryConversation, index: EntityIndex, now: Date) async -> DistilledNote?
}

/// The freshness/expiry rule both distillers share. Lives OUTSIDE the
/// DEBUG-only mock below because the REAL path needs it too — the
/// FoundationModels assistant gives an `ephemeral` note the same end-of-day
/// expiry (see FoundationModelsInterestAssistant) — and a Release build must
/// contain no Mock* symbols (WP-48).
enum MemoryFreshness {

    /// End of the current Europe/Oslo calendar day — when an "i kveld" note stops
    /// being relevant.
    static func endOfOsloDay(_ now: Date) -> Date {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = FeedCompiler.osloTimeZone
        let start = cal.startOfDay(for: now)
        return cal.date(byAdding: .day, value: 1, to: start) ?? now.addingTimeInterval(86_400)
    }
}

#if DEBUG
/// The deterministic stand-in used by CI + previews (Apple Intelligence can't run
/// there). Small and rule-based — enough to prove the conversation→note path and
/// the freshness/expiry handling, not a general summariser:
///
///   • only records something when a durable, first-person signal is present
///     (a spoiler/recording preference, a stated knowledge level, or an explicit
///     "husk/lær" cue) — otherwise nil, so idle chatter never fills the log;
///   • grounds `entityRefs` with the SAME `EntityIndex.detectEntities` the mock
///     parser uses, plus any sport keyword;
///   • gives an "i kveld"/"i dag" note an end-of-Oslo-day expiry so it ages out.
struct MockMemoryDistiller: MemoryDistiller {

    func distill(_ conversation: MemoryConversation, index: EntityIndex, now: Date) async -> DistilledNote? {
        Self.distillSync(conversation, index: index, now: now)
    }

    /// Pure, synchronous core so tests can call it directly.
    static func distillSync(_ conversation: MemoryConversation, index: EntityIndex, now: Date) -> DistilledNote? {
        let text = conversation.userText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        let n = " " + TextMatch.normalize(text) + " "

        let kind = classify(n)
        guard let kind else { return nil }   // nothing durable → no note

        let refs = entityRefs(in: text, index: index)
        let expiresAt = mentionsToday(n) ? endOfOsloDay(now) : nil
        return DistilledNote(summary: summary(text, kind: kind), entityRefs: refs, kind: kind, expiresAt: expiresAt)
    }

    // MARK: - Classification

    private static func classify(_ n: String) -> MemoryKind? {
        if contains(n, [" opptak ", " spoiler ", " spoile ", " ikke royp ", " ikke rop ", " ikke avslor ", " unnga resultat "]) {
            return .spoilerPolicy
        }
        if contains(n, [" nybegynner ", " fersk ", " kan lite ", " forklar ", " nytt for meg ", " forsto ikke reglene "]) {
            return .knowledgeLevel
        }
        if contains(n, [" ikke varsle ", " ikke for ", " varsle meg ", " pushvarsel ", " ikke push "]) {
            return .notifyWindow
        }
        if contains(n, [" husk ", " lar ", " noter ", " ikke glem "]) {
            return .note
        }
        return nil
    }

    private static func contains(_ haystack: String, _ needles: [String]) -> Bool {
        needles.contains { haystack.contains($0) }
    }

    // MARK: - Summary + refs

    private static func summary(_ text: String, kind: MemoryKind) -> String {
        // One calm line — the user's own words, trimmed to one sentence, prefixed.
        let firstSentence = text.split(whereSeparator: { ".!?\n".contains($0) }).first.map(String.init) ?? text
        let clipped = firstSentence.trimmingCharacters(in: .whitespaces)
        return "Lærte: \(clipped)."
    }

    private static func entityRefs(in text: String, index: EntityIndex) -> [String] {
        var refs = index.detectEntities(in: text).map(\.id)
        if let sport = EntityIndex.sportKeyword(in: text) { refs.append(sport) }
        var seen = Set<String>()
        return refs.filter { seen.insert($0).inserted }
    }

    // MARK: - Expiry (freshness)

    private static func mentionsToday(_ n: String) -> Bool {
        contains(n, [" i kveld ", " kveld ", " i dag ", " idag ", " i natt "])
    }

    /// Forwarder to the shared rule above (WP-48 moved the implementation to
    /// `MemoryFreshness`), kept so the existing test/demo call sites read the
    /// same — the mock and the real distiller expire notes identically.
    static func endOfOsloDay(_ now: Date) -> Date { MemoryFreshness.endOfOsloDay(now) }
}
#endif
