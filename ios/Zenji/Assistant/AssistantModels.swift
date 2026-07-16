//
//  AssistantModels.swift
//  Zenji
//
//  WP-16 — the FM-lekegrind's plain, FoundationModels-FREE value types. Every
//  type in this file is ordinary Swift (Codable/Equatable/Sendable) with no
//  dependency on the FoundationModels framework, so the whole conversation →
//  profile pipeline — entity grounding, diff-application, persistence — and
//  all of its unit tests run on the Simulator (and in CI) without ever needing
//  Apple Intelligence. Only `FoundationModelsInterestAssistant.swift` imports
//  FoundationModels; it converts its `@Generable` output into the
//  `ProposedMutation`s below, and the mock (`MockInterestAssistant`) produces
//  them directly.
//
//  The three layers a proposal passes through:
//
//    ProposedMutation   what the model claims (UNTRUSTED entityId + the raw
//                       phrase the user used) — from FM or the mock
//         │  MutationGrounder.ground(_:index:profile:)   ← the HARD RULE
//         ▼
//    GroundedMutation   entityId verified to exist in the entity index; carries
//                       the resolved Entity + the rule it would replace/remove
//    RejectedMutation   entityId NOT in the index → rejected, with a Norwegian
//                       explanation + nearest-match suggestions ("mente du …?")
//         │  user taps Bekreft
//         ▼
//    InterestProfile.applying(_:now:)                    ← the diff applied
//

import Foundation

/// What a single proposal does to the interest profile. The UI colours these:
/// `.add` green, `.update` amber, `.remove` red (the DIFF view).
enum MutationKind: String, Codable, Equatable, Sendable {
    /// Follow an entity (upsert — a new rule, or replaces an existing one).
    case add
    /// Change an existing rule's weight/scope (upsert if it doesn't exist yet).
    case update
    /// Stop following an entity (no-op if there is no such rule).
    case remove
}

/// The PERSPECTIVE a follow-rule is seen through (WP-16.1). The entity says
/// *what* is followed (a tournament, a team, a sport's headline event); the lens
/// says *how*. Without it, an utterance like "Følg Tour de France med fokus på
/// norske utøvere" simply could not be represented — the model had nowhere to
/// put "med fokus på norske", produced no mutation, and the UI collapsed that to
/// a bare "fant ingen endringer". The lens gives that intent a home.
///
///   • `.sportAsSuch`       the whole thing — every participant (the DEFAULT).
///   • `.throughNorwegians` focus on the Norwegian athletes/teams in the
///                          entity's events ("med fokus på norske utøvere").
///   • `.throughAthletes`   focus on specific athletes; carries their entity ids
///                          — GROUNDED against the index exactly like every other
///                          id (an athlete not in the index is dropped, and an
///                          empty result degrades back to `.sportAsSuch`).
enum Lens: Codable, Equatable, Sendable {
    case sportAsSuch
    case throughNorwegians
    case throughAthletes([LensAthlete])

    /// The neutral default — a rule with no explicit perspective.
    var isDefault: Bool { self == .sportAsSuch }

    /// Human-readable Norwegian label for the DIFF / "Hva jeg følger" list, e.g.
    /// "gjennom norske utøvere" or "gjennom Casper Ruud, Viktor Hovland".
    var label: String {
        switch self {
        case .sportAsSuch:
            return "hele sporten"
        case .throughNorwegians:
            return "gjennom norske utøvere"
        case let .throughAthletes(athletes):
            let names = athletes.map(\.name).joined(separator: ", ")
            return names.isEmpty ? "gjennom utvalgte utøvere" : "gjennom \(names)"
        }
    }
}

/// One athlete a `.throughAthletes` lens focuses on. `entityId` is the WP-05
/// stable id; `name` is cached for display (mirroring `InterestRule.entityName`)
/// so the DIFF/profile render without a second index lookup. In a RAW proposal
/// these ids are UNTRUSTED (the grounder re-checks them); in a grounded mutation
/// or a persisted rule every one has been verified to exist.
struct LensAthlete: Codable, Equatable, Sendable {
    var entityId: String
    var name: String

    init(entityId: String, name: String) {
        self.entityId = entityId
        self.name = name
    }
}

/// The model's RAW proposal, BEFORE entity-grounding.
///
/// `entityId` is deliberately treated as untrusted: the model is instructed to
/// only ever use ids returned by the `searchEntities` tool, but grounding still
/// re-checks every id against the live index (defence-in-depth — a model can
/// hallucinate). `entityQuery` is the natural-language phrase the user actually
/// used ("Ruud", "tennis", "cricket"); it exists only so a failed lookup can
/// suggest the nearest real entity.
struct ProposedMutation: Equatable, Sendable {
    var kind: MutationKind
    var entityId: String
    var entityQuery: String
    /// Optional Norwegian scope, e.g. "bare i Grand Slams", "i juli".
    var scope: String?
    /// Relative weight 0…1; nil = "keep whatever the existing rule has, else
    /// the default".
    var weight: Double?
    /// Always-filled Norwegian rationale (the transparency contract).
    var reason: String
    /// The perspective the user wants this followed through. For a `.throughAthletes`
    /// lens the athlete ids here are UNTRUSTED (grounding re-checks them, exactly
    /// like `entityId`). Defaults to `.sportAsSuch` so existing callers and any
    /// utterance without a focus phrase are unaffected.
    var lens: Lens

    init(kind: MutationKind, entityId: String, entityQuery: String, scope: String? = nil, weight: Double? = nil, reason: String, lens: Lens = .sportAsSuch) {
        self.kind = kind
        self.entityId = entityId
        self.entityQuery = entityQuery
        self.scope = scope
        self.weight = weight
        self.reason = reason
        self.lens = lens
    }
}

/// A proposal whose `entityId` was verified against the index — safe to apply.
struct GroundedMutation: Equatable, Identifiable, Sendable {
    var kind: MutationKind
    var entity: Entity
    var scope: String?
    var weight: Double
    var reason: String
    /// The rule this would replace/remove, if one already exists — lets the
    /// DIFF view show a real before/after instead of guessing.
    var previousRule: InterestRule?
    /// The perspective this rule is followed through — GROUNDED (any
    /// `.throughAthletes` ids have been verified to exist). Defaults to
    /// `.sportAsSuch`, declared last so the synthesised memberwise initialiser
    /// stays backward-compatible with callers that omit it.
    var lens: Lens = .sportAsSuch

    /// Stable, deterministic id (entity + kind) — no random UUID, so the type
    /// stays value-equal for tests and SwiftUI diffing.
    var id: String { "\(entity.id):\(kind.rawValue)" }
}

/// A proposal that failed the hard grounding rule: it referred to something not
/// in the index (and could not be UNAMBIGUOUSLY resolved by the fuzzy resolver).
/// Never applied — shown to the user as an honest explanation with tappable
/// "mente du …?" suggestions.
struct RejectedMutation: Equatable, Identifiable, Sendable {
    /// The phrase the user used that couldn't be grounded.
    var query: String
    /// Norwegian explanation, including "mente du …?" when there is a near miss.
    var explanation: String
    /// Nearest real entities (may be empty) — offered as tappable alternatives.
    var suggestions: [Entity]
    /// The original raw proposal (its bogus/empty entityId and all). WP-16.2:
    /// tapping a suggestion re-grounds THIS proposal with the picked entity id
    /// substituted in — so the user's intent (add/remove, scope, weight, the
    /// «med fokus på norske» lens) survives the correction instead of being a
    /// dead button.
    var proposal: ProposedMutation

    var id: String { query }
}

/// The outcome of grounding a batch of proposals.
struct GroundingResult: Equatable, Sendable {
    var grounded: [GroundedMutation]
    var rejected: [RejectedMutation]

    init(grounded: [GroundedMutation] = [], rejected: [RejectedMutation] = []) {
        self.grounded = grounded
        self.rejected = rejected
    }

    var isEmpty: Bool { grounded.isEmpty && rejected.isEmpty }
}

/// The HARD UX RULE, made a value (WP-16.1): the assistant ALWAYS explains
/// itself. Whenever a submitted utterance produces no confirmable change, this
/// replaces the old dead-end "fant ingen endringer" note with an honest,
/// structured account the UI shows verbatim:
///
///   • `understood` — a short paraphrase of what the assistant took the
///     utterance to mean.
///   • `reason` — WHY nothing changed: the named things weren't in the index
///     (see the "mente du …?" suggestions), the entity data hasn't synced yet,
///     or the intent couldn't be expressed as a rule change at all ("jeg kan
///     ikke uttrykke X ennå" — the case that produced the original bug).
///
/// Both fields are always non-empty Norwegian text — the UI must never show a
/// blank or a bare "no changes".
struct AssistantExplanation: Codable, Equatable, Sendable {
    var understood: String
    var reason: String

    init(understood: String, reason: String) {
        self.understood = understood
        self.reason = reason
    }

    /// Builds the honest account shown WHENEVER a submitted utterance produced no
    /// confirmable change (no grounded mutation). Pure — no clock, no I/O — so
    /// the always-explain contract is unit-tested directly. The four honest
    /// endings, in priority order:
    ///
    ///   1. the entity index hasn't synced yet → nothing could be looked up;
    ///   2. the model produced no proposal at all → the intent couldn't be
    ///      expressed as a rule change (the case that produced the original
    ///      "fant ingen endringer" bug);
    ///   3. every proposal named something not in the index → rejected, with the
    ///      "mente du …?" suggestions shown separately;
    ///   4. (defensive) proposals resolved but changed nothing net.
    ///
    /// `understood` always paraphrases the utterance so the UI never shows a bare
    /// blank; `reason` always says WHY, in Norwegian.
    static func make(
        utterance: String,
        proposals: [ProposedMutation],
        result: GroundingResult,
        hasEntities: Bool
    ) -> AssistantExplanation {
        let understood = understoodText(utterance: utterance, proposals: proposals)
        let reason: String
        if !hasEntities {
            reason = "Jeg har ikke lastet ned hva du kan følge ennå, så jeg fikk ikke slått opp noe. Prøv igjen om litt."
        } else if !result.rejected.isEmpty {
            let names = result.rejected.map { "«\($0.query)»" }.joined(separator: ", ")
            reason = "Jeg fant ikke \(names) i indeksen over det du kan følge, så jeg endret ingenting. Se forslagene under."
        } else if proposals.isEmpty {
            reason = "Jeg klarte ikke å uttrykke dette som en endring i en følge-regel ennå, så jeg lot profilen stå urørt. Prøv å skrive hvem eller hva du vil følge, f.eks. «Følg Tour de France med fokus på norske utøvere»."
        } else {
            reason = "Det du beskrev endrer ikke det du allerede følger, så jeg gjorde ingenting."
        }
        return AssistantExplanation(understood: understood, reason: reason)
    }

    /// A short Norwegian paraphrase of what the assistant took the utterance to
    /// mean — from the proposals when there are any, else an honest echo of the
    /// raw text so the field is never empty.
    private static func understoodText(utterance: String, proposals: [ProposedMutation]) -> String {
        guard !proposals.isEmpty else {
            let text = utterance.trimmingCharacters(in: .whitespacesAndNewlines)
            return "Jeg leste ytringen din som «\(text)», men fant ingen konkret utøver, lag eller turnering å endre."
        }
        var seen = Set<String>()
        let phrases = proposals.map(phrase(for:)).filter { seen.insert($0).inserted }
        return phrases.joined(separator: " ")
    }

    private static func phrase(for proposal: ProposedMutation) -> String {
        let q = proposal.entityQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        let subject = q.isEmpty ? "det du skrev" : "«\(q)»"
        switch proposal.kind {
        case .add: return "Du vil følge \(subject)."
        case .update: return "Du vil justere hvordan du følger \(subject)."
        case .remove: return "Du vil slutte å følge \(subject)."
        }
    }

    /// WP-65 — the per-clause accounting for a BULK utterance. When a long
    /// utterance names several interests ("golf, spesielt Hovland, all
    /// vintersport, Brann og litt F1"), the assistant must report EACH clause's
    /// fate: what landed (grounded) and what it couldn't place (rejected) — never
    /// a silent drop, and never a single collective "bom". This is the structured
    /// tally the calm "REGNSKAP" line renders ("la til golf, Hovland, F1 · fant
    /// ikke «Brann»"). Returns nil for a trivial (single-outcome) utterance, where
    /// the existing diff / "ikke funnet" / "ingen endring" sections already say
    /// everything — the tally is the accounting a MULTI-clause utterance needs.
    static func tally(grounded: [GroundedMutation], rejected: [RejectedMutation]) -> MutationTally? {
        let tally = MutationTally(
            added: grounded.filter { $0.kind == .add }.map { $0.entity.name },
            updated: grounded.filter { $0.kind == .update }.map { $0.entity.name },
            removed: grounded.filter { $0.kind == .remove }.map { $0.entity.name },
            notFound: rejected.map(\.query)
        )
        return tally.total > 1 ? tally : nil
    }
}

/// WP-65 — the per-clause accounting of a bulk utterance: which named interests
/// landed as a proposed change, and which couldn't be placed. Purely structural
/// + FoundationModels-free, so the "never a silent clause-drop" contract is
/// unit-tested directly. The UI renders `summary` as one calm line.
struct MutationTally: Codable, Equatable, Sendable {
    /// Display names of clauses that grounded as an add.
    var added: [String]
    /// …as a weight/scope update (prioriter / mer / mindre).
    var updated: [String]
    /// …as a remove (slutt / fjern).
    var removed: [String]
    /// The raw phrases that couldn't be grounded — reported honestly, with
    /// "mente du …?" suggestions shown separately in the diff.
    var notFound: [String]

    /// The number of clauses accounted for.
    var total: Int { added.count + updated.count + removed.count + notFound.count }

    /// A calm Norwegian one-liner: what landed · what didn't. Always names every
    /// clause, so a dropped one is impossible to hide.
    var summary: String {
        var parts: [String] = []
        if !added.isEmpty { parts.append("la til \(added.joined(separator: ", "))") }
        if !updated.isEmpty { parts.append("justerte \(updated.joined(separator: ", "))") }
        if !removed.isEmpty { parts.append("fjernet \(removed.joined(separator: ", "))") }
        if !notFound.isEmpty {
            let names = notFound.map { "«\($0)»" }.joined(separator: ", ")
            parts.append("fant ikke \(names)")
        }
        return parts.joined(separator: " · ")
    }
}

/// WP-16.4 — the top-level INTENT the command line routes on. One utterance is
/// either a request to CHANGE what's followed (mutations, exactly as WP-16) OR
/// a QUESTION about the agenda ("hva bør jeg se i kveld?", "når går neste
/// TdF-etappe?") the assistant answers from LOCAL data. The model decides which
/// in a single generation (`GeneratedTurn.intent`); the mock decides
/// deterministically (`MockAnswerer.isQuestion`). The grounding/diff pipeline is
/// unchanged for the mutation arm — this only adds the answer arm alongside it.
enum AssistantTurn: Equatable, Sendable {
    case mutations([ProposedMutation])
    case answer(AssistantAnswer)
}

/// A calm, Norwegian answer to a question about the agenda, plus the stable ids
/// of the rows it refers to. `referencedEventIds` are UNTRUSTED handles (the FM
/// is told to cite only ids the `searchEvents` tool returned; the mock fills
/// them from the same query layer) — the view model re-resolves them against
/// the feed it built, so a hallucinated id simply drops out rather than
/// rendering a phantom row. `text` already reads as prose ("I kveld kan du se
/// …"); the resolved rows are shown quietly beneath it as when · what · where.
struct AssistantAnswer: Codable, Equatable, Sendable {
    var text: String
    var referencedEventIds: [String]

    init(text: String, referencedEventIds: [String] = []) {
        self.text = text
        self.referencedEventIds = referencedEventIds
    }
}

/// The view-facing result of an answered question: the prose plus the agenda
/// rows it referenced, already resolved to displayable when · what · where by
/// the view model (via `FeedQuery`). Kept separate from `AssistantAnswer` (the
/// raw model output) so the UI never has to touch a bare, unresolved id.
struct AssistantAnswerResult: Equatable, Sendable {
    var text: String
    var rows: [AnswerRow]
}

/// One referenced agenda row in an answer — the same when · what · where an
/// agenda row answers, already formatted. `Identifiable` for SwiftUI lists.
struct AnswerRow: Identifiable, Equatable, Sendable {
    var id: String
    var dayLabel: String
    var timeLabel: String
    var title: String
    var channelLabel: String
}

/// Whether the on-device model can actually be used right now. Mirrors
/// `SystemLanguageModel.Availability` but is FM-free so the UI/tests can reason
/// about it without importing FoundationModels.
enum AssistantAvailability: Equatable, Sendable {
    case available
    /// Not usable — carries a calm, honest Norwegian message for the UI.
    case unavailable(message: String)

    var isAvailable: Bool { self == .available }

    var message: String? {
        if case let .unavailable(message) = self { return message }
        return nil
    }
}

/// Errors the assistant layer can surface. All carry Norwegian, user-facing
/// text (they are shown verbatim in the calm UI).
enum AssistantError: LocalizedError, Equatable {
    case unavailable(message: String)
    case generationFailed(message: String)

    var errorDescription: String? {
        switch self {
        case let .unavailable(message): return message
        case let .generationFailed(message): return message
        }
    }
}
