//
//  AssistantTimeoutTests.swift
//  SportivistaTests
//
//  WP-62 — the FM-generation deadline. Apple Intelligence never runs in CI, so
//  the timeout CONTRACT is proven here against a fake `InterestAssistant` that
//  simply sleeps longer than the deadline: the same `TimeoutInterestAssistant`
//  the shipping app wraps `FoundationModelsInterestAssistant` in. These pin:
//    • a slow generation is cut off and surfaced as the calm "tok for lang tid"
//      message through the existing `.generationFailed` explanation flow;
//    • a result that beats the deadline passes straight through;
//    • cancellation ("Avbryt") propagates as `CancellationError`, NOT as the
//      timeout message — so the view model's `Task.isCancelled` guard swallows it.
//

import XCTest

final class AssistantTimeoutTests: XCTestCase {

    /// A fake assistant that sleeps for `duration` before returning — stands in
    /// for a slow / stuck on-device generation.
    private struct SleepingAssistant: InterestAssistant {
        let duration: Duration
        func availability() -> AssistantAvailability { .available }
        func interpret(utterance: String, profile: InterestProfile, index: EntityIndex, feed: FeedQuery, memory: MemoryContext) async throws -> AssistantTurn {
            try await Task.sleep(for: duration)
            return .answer(AssistantAnswer(text: "ferdig"))
        }
    }

    private func interpret(_ sut: TimeoutInterestAssistant) async throws -> AssistantTurn {
        try await sut.interpret(
            utterance: "hva skjer i kveld?",
            profile: InterestProfile(),
            index: EntityIndex([]),
            feed: FeedQuery(now: Date()),
            memory: MemoryContext()
        )
    }

    // MARK: - The decorator

    func test_slowGeneration_timesOutWithCalmGenerationFailure() async {
        let sut = TimeoutInterestAssistant(wrapping: SleepingAssistant(duration: .seconds(10)), timeout: 0.05)
        do {
            _ = try await interpret(sut)
            XCTFail("expected the deadline to fire")
        } catch let error as AssistantError {
            // The calm "tok for lang tid" message, via `.generationFailed` (the
            // outcome AssistantViewModel logs + shows), never `.unavailable`.
            XCTAssertEqual(error, .generationFailed(message: TimeoutInterestAssistant.timedOutMessage))
        } catch {
            XCTFail("expected AssistantError, got \(error)")
        }
    }

    func test_fastGeneration_passesThroughUnchanged() async throws {
        let sut = TimeoutInterestAssistant(wrapping: SleepingAssistant(duration: .zero), timeout: 5)
        let turn = try await interpret(sut)
        guard case let .answer(answer) = turn else {
            return XCTFail("expected an answer, got \(turn)")
        }
        XCTAssertEqual(answer.text, "ferdig")
    }

    func test_availability_passesThroughToWrapped() {
        let sut = TimeoutInterestAssistant(wrapping: SleepingAssistant(duration: .zero))
        XCTAssertEqual(sut.availability(), .available)
    }

    func test_cancellation_isNotReportedAsTimeout() async {
        let sut = TimeoutInterestAssistant(wrapping: SleepingAssistant(duration: .seconds(10)), timeout: 10)
        // Capture only the (Sendable) `sut` in the child task — never `self`.
        let task = Task { () -> Error? in
            do {
                _ = try await sut.interpret(
                    utterance: "hva skjer i kveld?",
                    profile: InterestProfile(),
                    index: EntityIndex([]),
                    feed: FeedQuery(now: Date()),
                    memory: MemoryContext()
                )
                return nil
            } catch {
                return error
            }
        }
        task.cancel()
        let error = await task.value
        XCTAssertTrue(error is CancellationError, "expected cancellation, got \(String(describing: error))")
    }

    // MARK: - The primitive

    func test_withTimeout_returnsValueBeforeDeadline() async throws {
        let value = try await withTimeout(seconds: 5) { 42 }
        XCTAssertEqual(value, 42)
    }

    func test_withTimeout_throwsTimeoutErrorPastDeadline() async {
        do {
            _ = try await withTimeout(seconds: 0.05) {
                try await Task.sleep(for: .seconds(10))
                return 1
            }
            XCTFail("expected TimeoutError")
        } catch {
            XCTAssertTrue(error is TimeoutError, "expected TimeoutError, got \(error)")
        }
    }
}
