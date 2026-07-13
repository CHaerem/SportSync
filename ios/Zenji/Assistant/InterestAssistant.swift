//
//  InterestAssistant.swift
//  Zenji
//
//  WP-16 — the model-layer protocol. The whole point of putting the model
//  behind this protocol is portability + testability (the same idea as the
//  rest of the app's pure-core/thin-shell split, and CLAUDE.md's "vendor
//  lock-in confined to one layer"): the UI and the grounding/diff/persistence
//  pipeline depend ONLY on this protocol, never on FoundationModels.
//
//    • FoundationModelsInterestAssistant — the real one, on-device Apple
//      Intelligence (FoundationModels). Only that file imports the framework.
//    • MockInterestAssistant — a deterministic Norwegian keyword parser used by
//      the tests (FM can't run in CI) and by SwiftUI previews.
//
//  `propose` returns RAW `ProposedMutation`s — deliberately BEFORE grounding.
//  Grounding (the hard rule) is the caller's job (AssistantViewModel →
//  MutationGrounder), so it is applied uniformly to real-model and mock output
//  alike and can be unit-tested in isolation.
//

import Foundation

protocol InterestAssistant: Sendable {
    /// Whether the model can actually be used right now. Cheap + synchronous so
    /// the UI can render an honest "unavailable" state before any request.
    func availability() -> AssistantAvailability

    /// Turns one Norwegian utterance into raw, ungrounded mutation proposals,
    /// given the current profile (for context — e.g. which rules a "slutt med
    /// tennis" would target) and the entity index (the model's searchEntities
    /// tool reads it; the mock matches against it directly).
    ///
    /// Throws `AssistantError.unavailable` if the model isn't usable, or
    /// `.generationFailed` if a usable model still couldn't produce output.
    func propose(utterance: String, profile: InterestProfile, index: EntityIndex) async throws -> [ProposedMutation]
}
