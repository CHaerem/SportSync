//
//  EvalCorpusTests.swift
//  ZenjiTests
//
//  WP-69 — the CI half of the eval harness. The SAME versioned corpus the
//  on-device screen runs through the real FoundationModelsInterestAssistant is
//  run here through the deterministic MockInterestAssistant and asserted. Apple
//  Intelligence can't run in CI, so this proves the corpus + scorer + runner
//  pipeline is sound and that the deterministic cases hold; the `knownGap`
//  cases are SKIPPED with a marker (they're targets for WP-64/65, not red
//  tests). The scorer itself is also unit-tested against synthetic output so
//  its rubric logic is covered independently of the mock.
//

import XCTest

final class EvalCorpusTests: XCTestCase {

    private func loadCorpus() throws -> EvalCorpus {
        try EvalCorpus.decode(Fixture.data("eval-corpus"))
    }

    // MARK: - Corpus shape (the acceptance floor)

    func test_corpus_isVersionedWithEnoughCases() throws {
        let corpus = try loadCorpus()
        XCTAssertGreaterThanOrEqual(corpus.version, 1)
        XCTAssertGreaterThanOrEqual(corpus.cases.count, 20, "the corpus must carry at least 20 cases (WP-69 acceptance)")
        // Every case id is unique.
        XCTAssertEqual(Set(corpus.cases.map(\.id)).count, corpus.cases.count, "case ids must be unique")
    }

    func test_corpus_coversTheRequiredCategories() throws {
        let corpus = try loadCorpus()
        let categories = Set(corpus.cases.map(\.category))
        for required in ["canon", "multiPart", "winter", "question"] {
            XCTAssertTrue(categories.contains(required), "corpus must cover the '\(required)' category")
        }
    }

    func test_corpus_knownGapCasesAreMarkedWithARef() throws {
        let corpus = try loadCorpus()
        let gaps = corpus.cases.filter(\.isKnownGap)
        XCTAssertFalse(gaps.isEmpty, "the corpus documents at least one known gap (the winter case)")
        for gap in gaps {
            XCTAssertNotNil(gap.knownGapRef, "known-gap case \(gap.id) must name the WP that closes it")
        }
        // The winter umbrella case is the canonical known gap.
        XCTAssertTrue(gaps.contains { $0.category == "winter" }, "the vintersport case must be a known gap until WP-64/65")
    }

    // MARK: - The mock run (deterministic cases asserted, gaps skipped)

    func test_mockRun_deterministicCasesPass_knownGapsSkipped() async throws {
        let corpus = try loadCorpus()
        let index = AssistantTestSupport.liveIndex()
        let feed = AssistantTestSupport.liveFeed(now: corpus.clock)
        let runner = EvalRunner(assistant: MockInterestAssistant(), index: index, feed: feed)

        var skipped: [String] = []
        for c in corpus.cases {
            let result = await runner.run(c)
            if c.isKnownGap {
                skipped.append("\(c.id) (\(c.knownGapRef ?? "?"))")
                continue
            }
            XCTAssertTrue(
                result.passed,
                "corpus case \(c.id) — «\(c.utterance)» — failed under the mock: " +
                result.checks.filter { !$0.passed }.map { "\($0.label): \($0.detail)" }.joined(separator: " · ")
            )
        }
        // Marker: the skipped known-gap cases are recorded, not silently ignored.
        XCTAssertFalse(skipped.isEmpty)
        print("WP-69 eval — skipped \(skipped.count) known-gap case(s): \(skipped.joined(separator: ", "))")
    }

    func test_mockRun_reportAggregates() async throws {
        let corpus = try loadCorpus()
        let index = AssistantTestSupport.liveIndex()
        let feed = AssistantTestSupport.liveFeed(now: corpus.clock)
        let runner = EvalRunner(assistant: MockInterestAssistant(), index: index, feed: feed)
        let results = await runner.runAll(corpus)
        let report = EvalReport.make(results: results, corpusVersion: corpus.version, assistant: "mock", available: true)

        XCTAssertEqual(report.totals.total, corpus.cases.count)
        XCTAssertEqual(report.totals.evaluated + report.totals.knownGap, corpus.cases.count)
        // Every deterministic (non-gap) case passes under the mock.
        XCTAssertEqual(report.totals.passed, report.totals.evaluated, "all evaluated cases pass under the mock")
        // The report is real, encodable JSON (the share payload) with no crash.
        XCTAssertFalse(report.jsonData().isEmpty)
    }

    // MARK: - Scorer unit tests (independent of the mock)

    func test_scorer_mutation_idSetMatch() {
        let c = EvalCase(id: "x", category: "canon", utterance: "u", kind: .mutation,
                         seedProfile: nil, knownGap: nil, knownGapRef: nil, note: nil,
                         expect: EvalExpectation(mutationEntityIds: ["a", "b"], answer: nil))
        XCTAssertTrue(EvalScorer.score(c, actual: .mutation(groundedEntityIds: ["b", "a"])).passed, "id-set is order-independent")
        XCTAssertFalse(EvalScorer.score(c, actual: .mutation(groundedEntityIds: ["a"])).passed, "a missing id fails")
        XCTAssertFalse(EvalScorer.score(c, actual: .mutation(groundedEntityIds: ["a", "b", "c"])).passed, "an extra id fails")
    }

    func test_scorer_mutation_emptyExpectationIsRejectionCase() {
        let c = EvalCase(id: "x", category: "canon", utterance: "u", kind: .mutation,
                         seedProfile: nil, knownGap: nil, knownGapRef: nil, note: nil,
                         expect: EvalExpectation(mutationEntityIds: [], answer: nil))
        XCTAssertTrue(EvalScorer.score(c, actual: .mutation(groundedEntityIds: [])).passed, "nothing grounded == expected empty set")
        XCTAssertFalse(EvalScorer.score(c, actual: .mutation(groundedEntityIds: ["a"])).passed)
    }

    func test_scorer_answer_phantomRowsFail() {
        let c = EvalCase(id: "q", category: "question", utterance: "u", kind: .answer,
                         seedProfile: nil, knownGap: nil, knownGapRef: nil, note: nil,
                         expect: EvalExpectation(mutationEntityIds: nil,
                                                 answer: AnswerExpectation(minReferencedRows: nil, referencedSportsAnyOf: nil, mustContainAny: nil, forbiddenClaims: nil, requireNoPhantomRows: true)))
        // Cited 2, resolved 1 → one phantom row → fail.
        XCTAssertFalse(EvalScorer.score(c, actual: .answer(text: "t", citedRowCount: 2, resolvedRowCount: 1, resolvedRowSports: ["cycling"])).passed)
        XCTAssertTrue(EvalScorer.score(c, actual: .answer(text: "t", citedRowCount: 1, resolvedRowCount: 1, resolvedRowSports: ["cycling"])).passed)
    }

    func test_scorer_answer_forbiddenClaimsAndSports() {
        let c = EvalCase(id: "q", category: "question", utterance: "u", kind: .answer,
                         seedProfile: nil, knownGap: nil, knownGapRef: nil, note: nil,
                         expect: EvalExpectation(mutationEntityIds: nil,
                                                 answer: AnswerExpectation(minReferencedRows: 1, referencedSportsAnyOf: ["cycling"], mustContainAny: nil, forbiddenClaims: ["vant"], requireNoPhantomRows: true)))
        XCTAssertTrue(EvalScorer.score(c, actual: .answer(text: "Kommende sykkelritt", citedRowCount: 1, resolvedRowCount: 1, resolvedRowSports: ["cycling"])).passed)
        XCTAssertFalse(EvalScorer.score(c, actual: .answer(text: "Norge VANT etappen", citedRowCount: 1, resolvedRowCount: 1, resolvedRowSports: ["cycling"])).passed, "a forbidden claim fails")
        XCTAssertFalse(EvalScorer.score(c, actual: .answer(text: "Kommende", citedRowCount: 1, resolvedRowCount: 1, resolvedRowSports: ["tennis"])).passed, "wrong sport fails")
    }
}
