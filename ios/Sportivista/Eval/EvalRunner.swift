//
//  EvalRunner.swift
//  Sportivista
//
//  WP-69 — drives an `InterestAssistant` through the corpus and scores each
//  case. Depends ONLY on the `InterestAssistant` protocol (+ the pure grounding
//  / feed / profile pieces), so it runs identically against the deterministic
//  `MockInterestAssistant` in CI and the real `FoundationModelsInterestAssistant`
//  on device — the whole point of WP-69 (measure the SAME corpus two ways).
//
//  For a mutation case it runs the full pipeline the app runs — interpret →
//  MutationGrounder.ground → the id-set that would actually be applied — because
//  that grounded set is the honest "what changes" signal (a hallucinated id that
//  grounding rejects is correctly scored as nothing). For an answer case it
//  resolves the cited ids back against the feed, so a phantom id counts as a
//  phantom row rather than a real reference.
//

import Foundation

struct EvalRunner: Sendable {
    let assistant: any InterestAssistant
    let index: EntityIndex
    /// The agenda the answer arm queries. CI passes a feed compiled at the
    /// corpus `clock`; the device passes the live feed.
    let feed: FeedQuery

    /// Run + score one case.
    func run(_ c: EvalCase) async -> EvalCaseResult {
        let profile = seededProfile(for: c)
        let turn = await interpret(c.utterance, profile: profile)
        let actual = reduce(turn, kind: c.kind, profile: profile)
        return EvalScorer.score(c, actual: actual)
    }

    /// Run + score the whole corpus, in order (the real model is sequential and
    /// slow, so there's no gain in parallelising — and it keeps the on-device
    /// progress readout honest).
    func runAll(_ corpus: EvalCorpus) async -> [EvalCaseResult] {
        var out: [EvalCaseResult] = []
        out.reserveCapacity(corpus.cases.count)
        for c in corpus.cases {
            out.append(await run(c))
        }
        return out
    }

    // MARK: - Steps

    private func interpret(_ utterance: String, profile: InterestProfile) async -> AssistantTurn {
        do {
            return try await assistant.interpret(utterance: utterance, profile: profile, index: index, feed: feed)
        } catch {
            // Unavailable / generation-failed → no usable output. Scored as an
            // empty mutation set (or, for an answer case, empty prose): honest,
            // and never crashes the run.
            return .mutations([])
        }
    }

    private func reduce(_ turn: AssistantTurn, kind: EvalKind, profile: InterestProfile) -> EvalActual {
        switch (kind, turn) {
        case let (.mutation, .mutations(proposals)):
            let grounded = MutationGrounder.ground(proposals, index: index, profile: profile).grounded
            return .mutation(groundedEntityIds: grounded.map { $0.entity.id })
        case (.mutation, .answer), (.mutation, .command), (.mutation, .present):
            // The case wanted a change but the model answered / ran a command /
            // filtered the view — nothing grounds.
            return .mutation(groundedEntityIds: [])
        case let (.answer, .answer(answer)):
            let byId = Dictionary(feed.events.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            let resolved = answer.referencedEventIds.compactMap { byId[$0] }
            return .answer(
                text: answer.text,
                citedRowCount: answer.referencedEventIds.count,
                resolvedRowCount: resolved.count,
                resolvedRowSports: resolved.map { $0.sport }
            )
        case (.answer, .mutations), (.answer, .command), (.answer, .present):
            // The case asked a question but the model proposed changes / ran a
            // command / filtered the view — no answer text, no rows.
            return .answer(text: "", citedRowCount: 0, resolvedRowCount: 0, resolvedRowSports: [])
        case let (.command, .command(command)):
            // WP-66 — score the PARSED command's canonical token.
            return .command(token: command.evalToken)
        case (.command, .mutations), (.command, .answer), (.command, .present):
            // The case expected a command but the model routed elsewhere.
            return .command(token: "")
        case let (.present, .present(filter)):
            // WP-67 — score the PARSED presentation filter's structure.
            return .present(filter: filter)
        case (.present, .mutations), (.present, .answer), (.present, .command):
            // The case expected a presentation filter but the model routed
            // elsewhere (e.g. mis-read «vis …» as a follow — the WP-67 bug).
            return .present(filter: nil)
        }
    }

    /// Build the profile a case seeds before interpreting. Each seed rule is
    /// grounded straight to an add (unknown ids are skipped — a seed that can't
    /// resolve is a corpus problem, not a run failure).
    private func seededProfile(for c: EvalCase) -> InterestProfile {
        var profile = InterestProfile()
        for seed in c.seedProfile ?? [] {
            guard let entity = index.entity(id: seed.entityId) else { continue }
            profile = profile.applying(GroundedMutation(
                kind: .add, entity: entity, scope: seed.scope, weight: 0.5,
                reason: "eval-seed", previousRule: nil
            ))
        }
        return profile
    }
}

// MARK: - Report (the anonymised export shape)

/// The full, anonymised eval report — the exact JSON the device screen shares
/// via the share sheet. Deliberately carries NO device id / account / anything
/// personal: only the corpus version, a timestamp, which assistant ran, and the
/// per-case structured results (utterances come from the versioned corpus, not
/// the user). Same privacy posture as `MisunderstoodLogStore.exportPayload()`.
struct EvalReport: Codable, Sendable {
    var corpusVersion: Int
    var generatedAt: Date
    /// "mock" (CI) or "foundation-models" (device) — so a shared report is
    /// self-describing.
    var assistant: String
    /// Whether the assistant reported itself available when the run started.
    var available: Bool
    var totals: Totals
    var categories: [CategorySummary]
    var cases: [EvalCaseResult]

    struct Totals: Codable, Sendable {
        var total: Int
        /// Passed among the non-known-gap cases.
        var passed: Int
        /// Cases evaluated (total − knownGap).
        var evaluated: Int
        var knownGap: Int
        /// Known-gap cases that unexpectedly PASSED (a gap closed — worth
        /// promoting out of `knownGap`).
        var knownGapPassed: Int
    }

    struct CategorySummary: Codable, Sendable, Identifiable {
        var category: String
        var total: Int
        var evaluated: Int
        var passed: Int
        var knownGap: Int
        var knownGapPassed: Int

        var id: String { category }
        /// Pass-rate over the EVALUATED (non-gap) cases, 0…1. Nil when a
        /// category is all known-gaps (no rate to show yet).
        var passRate: Double? { evaluated == 0 ? nil : Double(passed) / Double(evaluated) }
    }

    /// Build a report from scored results — pure, so both harnesses share it.
    static func make(results: [EvalCaseResult], corpusVersion: Int, assistant: String, available: Bool, now: Date = Date()) -> EvalReport {
        let evaluated = results.filter { !$0.knownGap }
        let gaps = results.filter { $0.knownGap }
        let totals = Totals(
            total: results.count,
            passed: evaluated.filter(\.passed).count,
            evaluated: evaluated.count,
            knownGap: gaps.count,
            knownGapPassed: gaps.filter(\.passed).count
        )
        var order: [String] = []
        var seen = Set<String>()
        for r in results where seen.insert(r.category).inserted { order.append(r.category) }
        let categories = order.map { cat -> CategorySummary in
            let inCat = results.filter { $0.category == cat }
            let ev = inCat.filter { !$0.knownGap }
            let gp = inCat.filter { $0.knownGap }
            return CategorySummary(
                category: cat,
                total: inCat.count,
                evaluated: ev.count,
                passed: ev.filter(\.passed).count,
                knownGap: gp.count,
                knownGapPassed: gp.filter(\.passed).count
            )
        }
        return EvalReport(
            corpusVersion: corpusVersion,
            generatedAt: now,
            assistant: assistant,
            available: available,
            totals: totals,
            categories: categories,
            cases: results
        )
    }

    /// Pretty-printed, stable-key JSON — the share-sheet payload.
    func jsonData() -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return (try? encoder.encode(self)) ?? Data("{}".utf8)
    }
}
