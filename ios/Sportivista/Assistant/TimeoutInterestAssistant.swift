//
//  TimeoutInterestAssistant.swift
//  Sportivista
//
//  WP-62 — a deadline around model generation. On-device Apple Intelligence
//  (`FoundationModelsInterestAssistant.interpret` → `session.respond`) has no
//  built-in frist: a slow or stuck generation would leave the command line
//  blinking "tenker …" indefinitely. This wraps ANY `InterestAssistant` in a
//  Task-race against a deadline and, on timeout, surfaces a calm Norwegian "tok
//  for lang tid" message through the SAME `.generationFailed` explanation flow a
//  real generation failure uses (AssistantViewModel logs it + shows it verbatim).
//
//  It is deliberately FM-free — the whole point is that the timeout CONTRACT is
//  CI-testable with a fake assistant that sleeps, even though Apple Intelligence
//  itself never runs in CI. The shipping app wraps the real FM assistant in this
//  (AssistantViewModel's convenience init); tests inject the fast mock directly,
//  so the deadline never bites there.
//
//  Cancellation is preserved: when the enclosing interpret task is cancelled
//  (the command line's "Avbryt"), the race's children are cancelled and the
//  cancellation propagates — it is NOT mapped to the timeout message, so the
//  view model's `Task.isCancelled` guard swallows it exactly as before.
//

import Foundation

/// Thrown by `withTimeout` when the operation didn't finish before the deadline.
struct TimeoutError: Error, Equatable {}

/// Race an async operation against a deadline. Returns the operation's result if
/// it finishes first; throws `TimeoutError` if the deadline wins. Cooperative
/// cancellation of the surrounding task cancels both children and rethrows the
/// underlying `CancellationError` (never a `TimeoutError`).
func withTimeout<T: Sendable>(
    seconds: TimeInterval,
    operation: @escaping @Sendable () async throws -> T
) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask { try await operation() }
        group.addTask {
            try await Task.sleep(nanoseconds: UInt64(max(seconds, 0) * 1_000_000_000))
            throw TimeoutError()
        }
        defer { group.cancelAll() }
        // The first child to finish (or throw) wins; the other is cancelled.
        guard let result = try await group.next() else { throw TimeoutError() }
        return result
    }
}

/// An `InterestAssistant` decorator that bounds the wrapped assistant's
/// `interpret` with a deadline. `availability()` passes straight through.
struct TimeoutInterestAssistant: InterestAssistant {
    let wrapped: any InterestAssistant
    let timeout: TimeInterval

    /// A generous default — on-device generation with tool calls can take a
    /// while; the deadline exists to catch a stuck run, not to rush a slow one.
    static let defaultTimeout: TimeInterval = 30

    /// The calm Norwegian message shown when generation overruns the deadline.
    static let timedOutMessage = "Det tok for lang tid å svare. Prøv igjen, eller si det litt enklere."

    init(wrapping wrapped: any InterestAssistant, timeout: TimeInterval = defaultTimeout) {
        self.wrapped = wrapped
        self.timeout = timeout
    }

    func availability() -> AssistantAvailability { wrapped.availability() }

    func interpret(utterance: String, profile: InterestProfile, index: EntityIndex, feed: FeedQuery, memory: MemoryContext) async throws -> AssistantTurn {
        do {
            return try await withTimeout(seconds: timeout) {
                try await wrapped.interpret(utterance: utterance, profile: profile, index: index, feed: feed, memory: memory)
            }
        } catch is TimeoutError {
            // Route through the existing explanation flow: `.generationFailed`
            // is shown verbatim AND logged as an "inexpressible" outcome, unlike
            // `.unavailable` (a device-state gate that is never logged).
            throw AssistantError.generationFailed(message: Self.timedOutMessage)
        }
    }
}
