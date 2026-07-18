//
//  InterestAssistant.swift
//  Sportivista
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
//  `interpret` returns an `AssistantTurn` — either RAW `ProposedMutation`s
//  (deliberately BEFORE grounding; the hard grounding rule is the caller's job,
//  AssistantViewModel → MutationGrounder, applied uniformly to real-model and
//  mock output alike) OR an `AssistantAnswer` to a question about the agenda.
//  WP-16.4 added the answer arm alongside the WP-16 mutation arm; the model (or
//  the mock) decides which in a single call, so the command line is one entry
//  for both "change what I follow" and "what's on tonight".
//

import Foundation

protocol InterestAssistant: Sendable {
    /// Whether the model can actually be used right now. Cheap + synchronous so
    /// the UI can render an honest "unavailable" state before any request.
    func availability() -> AssistantAvailability

    /// Interpret one Norwegian utterance as either profile mutations OR an
    /// answer to a question, given the current profile (context — e.g. which
    /// rules a "slutt med tennis" targets), the entity index (the model's
    /// `searchEntities` tool reads it; the mock matches directly), and the
    /// local `feed` (the agenda the answer arm queries via `searchEvents`; the
    /// mutation arm ignores it).
    ///
    /// WP-30 adds `memory`: the personal-memory context, injected as a retrieval
    /// digest into the session instructions (so answers REFLECT what we know
    /// about you) and wired to the `saveMemory` tool (so the model can persist
    /// something it learns).
    ///
    /// Throws `AssistantError.unavailable` if the model isn't usable, or
    /// `.generationFailed` if a usable model still couldn't produce output.
    func interpret(utterance: String, profile: InterestProfile, index: EntityIndex, feed: FeedQuery, memory: MemoryContext) async throws -> AssistantTurn
}

extension InterestAssistant {
    /// Memory-free convenience — the WP-16.4 signature. Keeps every existing
    /// caller / test compiling unchanged; forwards an empty `MemoryContext`.
    func interpret(utterance: String, profile: InterestProfile, index: EntityIndex, feed: FeedQuery) async throws -> AssistantTurn {
        try await interpret(utterance: utterance, profile: profile, index: index, feed: feed, memory: MemoryContext())
    }
}
