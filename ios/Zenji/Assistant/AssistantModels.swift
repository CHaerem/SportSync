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

    init(kind: MutationKind, entityId: String, entityQuery: String, scope: String? = nil, weight: Double? = nil, reason: String) {
        self.kind = kind
        self.entityId = entityId
        self.entityQuery = entityQuery
        self.scope = scope
        self.weight = weight
        self.reason = reason
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

    /// Stable, deterministic id (entity + kind) — no random UUID, so the type
    /// stays value-equal for tests and SwiftUI diffing.
    var id: String { "\(entity.id):\(kind.rawValue)" }
}

/// A proposal that failed the hard grounding rule: it referred to something not
/// in the index. Never applied — shown to the user as an honest explanation.
struct RejectedMutation: Equatable, Identifiable, Sendable {
    /// The phrase the user used that couldn't be grounded.
    var query: String
    /// Norwegian explanation, including "mente du …?" when there is a near miss.
    var explanation: String
    /// Nearest real entities (may be empty) — offered as tappable alternatives.
    var suggestions: [Entity]

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
