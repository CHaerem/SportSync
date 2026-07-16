//
//  EvalScorer.swift
//  Zenji
//
//  WP-69 — the PURE scorer: an `EvalCase` + the assistant's ACTUAL structured
//  output → an `EvalCaseResult` (a list of named pass/fail checks). No I/O, no
//  clock, no FoundationModels — so it is exercised directly by the CI XCTest
//  and reused verbatim by the on-device eval screen. The runner
//  (`EvalRunner`) is what actually drives an assistant to produce the
//  `EvalActual`; this file only judges.
//

import Foundation

/// What an assistant actually produced for one case, reduced to the bits the
/// rubric scores. The runner fills exactly the arm the case's `kind` needs.
struct EvalActual: Sendable {
    // Mutation arm — the id-set that survived grounding.
    var groundedEntityIds: [String]

    // Answer arm.
    /// The prose the assistant returned.
    var answerText: String
    /// The number of event ids the assistant CITED.
    var citedRowCount: Int
    /// Of those, how many resolved to a real feed row.
    var resolvedRowCount: Int
    /// The sports of the resolved referenced rows.
    var resolvedRowSports: [String]

    // Command arm (WP-66) — the parsed command's canonical token, or "" when the
    // model routed to a different arm.
    var commandToken: String

    static func mutation(groundedEntityIds: [String]) -> EvalActual {
        EvalActual(groundedEntityIds: groundedEntityIds, answerText: "", citedRowCount: 0, resolvedRowCount: 0, resolvedRowSports: [], commandToken: "")
    }

    static func answer(text: String, citedRowCount: Int, resolvedRowCount: Int, resolvedRowSports: [String]) -> EvalActual {
        EvalActual(groundedEntityIds: [], answerText: text, citedRowCount: citedRowCount, resolvedRowCount: resolvedRowCount, resolvedRowSports: resolvedRowSports, commandToken: "")
    }

    static func command(token: String) -> EvalActual {
        EvalActual(groundedEntityIds: [], answerText: "", citedRowCount: 0, resolvedRowCount: 0, resolvedRowSports: [], commandToken: token)
    }
}

/// One named check within a case (e.g. "id-sett", "ingen oppdiktede rader").
struct EvalCheck: Codable, Sendable, Identifiable {
    var label: String
    var passed: Bool
    /// Short Norwegian detail for the report/UI ("mangler: X · ekstra: Y").
    var detail: String

    var id: String { label }
}

/// The scored outcome for one case.
struct EvalCaseResult: Codable, Sendable, Identifiable {
    var caseId: String
    var category: String
    var utterance: String
    var kind: EvalKind
    var knownGap: Bool
    var knownGapRef: String?
    var checks: [EvalCheck]

    var id: String { caseId }
    /// A case passes when every check passes.
    var passed: Bool { checks.allSatisfy(\.passed) }
}

enum EvalScorer {

    /// Judge one case against the assistant's actual output. Never throws — a
    /// missing expectation for the declared kind becomes a single failed check
    /// (a corpus authoring error surfaces loudly instead of silently passing).
    static func score(_ c: EvalCase, actual: EvalActual) -> EvalCaseResult {
        let checks: [EvalCheck]
        switch c.kind {
        case .mutation:
            checks = scoreMutation(c, actual: actual)
        case .answer:
            checks = scoreAnswer(c, actual: actual)
        case .command:
            checks = scoreCommand(c, actual: actual)
        }
        return EvalCaseResult(
            caseId: c.id,
            category: c.category,
            utterance: c.utterance,
            kind: c.kind,
            knownGap: c.isKnownGap,
            knownGapRef: c.knownGapRef,
            checks: checks
        )
    }

    // MARK: - Mutation

    private static func scoreMutation(_ c: EvalCase, actual: EvalActual) -> [EvalCheck] {
        guard let expected = c.expect.mutationEntityIds else {
            return [EvalCheck(label: "id-sett", passed: false, detail: "Korpusfeil: mutation-case mangler mutationEntityIds.")]
        }
        let expectedSet = Set(expected)
        let actualSet = Set(actual.groundedEntityIds)
        let missing = expectedSet.subtracting(actualSet).sorted()
        let extra = actualSet.subtracting(expectedSet).sorted()
        let passed = missing.isEmpty && extra.isEmpty
        let detail: String
        if passed {
            detail = expectedSet.isEmpty ? "ingenting grunnfestet (korrekt)" : "grunnfestet: \(actualSet.sorted().joined(separator: ", "))"
        } else {
            var parts: [String] = []
            if !missing.isEmpty { parts.append("mangler: \(missing.joined(separator: ", "))") }
            if !extra.isEmpty { parts.append("ekstra: \(extra.joined(separator: ", "))") }
            detail = parts.joined(separator: " · ")
        }
        return [EvalCheck(label: "id-sett", passed: passed, detail: detail)]
    }

    // MARK: - Answer

    private static func scoreAnswer(_ c: EvalCase, actual: EvalActual) -> [EvalCheck] {
        guard let exp = c.expect.answer else {
            return [EvalCheck(label: "svar", passed: false, detail: "Korpusfeil: answer-case mangler answer-forventning.")]
        }
        var checks: [EvalCheck] = []
        let text = actual.answerText
        let haystack = text.lowercased()

        if exp.enforceNoPhantomRows {
            let phantom = actual.citedRowCount - actual.resolvedRowCount
            checks.append(EvalCheck(
                label: "ingen oppdiktede rader",
                passed: phantom <= 0,
                detail: phantom <= 0 ? "alle \(actual.citedRowCount) refererte rader finnes" : "\(phantom) refererte rad-id-er finnes ikke i agendaen"
            ))
        }
        if let minRows = exp.minReferencedRows {
            checks.append(EvalCheck(
                label: "må-referere-rader (≥\(minRows))",
                passed: actual.resolvedRowCount >= minRows,
                detail: "refererte \(actual.resolvedRowCount) rad(er)"
            ))
        }
        if let sports = exp.referencedSportsAnyOf, !sports.isEmpty {
            let hit = actual.resolvedRowSports.first { sports.contains($0) }
            checks.append(EvalCheck(
                label: "rad-idrett ∈ {\(sports.joined(separator: ", "))}",
                passed: hit != nil,
                detail: hit.map { "traff \($0)" } ?? "ingen refererte rader i forventede idretter (fikk: \(uniqueJoined(actual.resolvedRowSports)))"
            ))
        }
        if let musts = exp.mustContainAny, !musts.isEmpty {
            let hit = musts.first { haystack.contains($0.lowercased()) }
            checks.append(EvalCheck(
                label: "må-inneholde-én-av",
                passed: hit != nil,
                detail: hit.map { "inneholder «\($0)»" } ?? "manglet alle av: \(musts.joined(separator: ", "))"
            ))
        }
        if let forbidden = exp.forbiddenClaims, !forbidden.isEmpty {
            let violated = forbidden.filter { haystack.contains($0.lowercased()) }
            checks.append(EvalCheck(
                label: "forbudte-påstander",
                passed: violated.isEmpty,
                detail: violated.isEmpty ? "ingen forbudte påstander" : "inneholdt: \(violated.joined(separator: ", "))"
            ))
        }
        // A rubric that specified no checks at all is a corpus authoring error.
        if checks.isEmpty {
            checks.append(EvalCheck(label: "svar", passed: false, detail: "Korpusfeil: answer-rubrikk uten noen sjekker."))
        }
        return checks
    }

    // MARK: - Command (WP-66)

    private static func scoreCommand(_ c: EvalCase, actual: EvalActual) -> [EvalCheck] {
        guard let expected = c.expect.command, !expected.isEmpty else {
            return [EvalCheck(label: "kommando", passed: false, detail: "Korpusfeil: command-case mangler command-forventning.")]
        }
        let token = actual.commandToken
        let expectedArm = arm(of: expected)
        let actualArm = arm(of: token)
        // Exact when the golden pins an argument (contains ':'); else ARM-only —
        // a free-text command (open/forget) is scored on its arm, since a
        // free-generating model can't be held to an exact phrase.
        let armOnly = (expected == expectedArm)
        let passed = armOnly ? (actualArm == expectedArm) : (token == expected)
        let detail: String
        if passed {
            detail = "kommando: \(token.isEmpty ? "(ingen)" : token)"
        } else {
            detail = "forventet \(expected), fikk \(token.isEmpty ? "(ingen kommando)" : token)"
        }
        return [EvalCheck(label: "kommando", passed: passed, detail: detail)]
    }

    /// The arm (the part before ':') of a command token — "theme:dark" → "theme".
    private static func arm(of token: String) -> String {
        token.split(separator: ":", maxSplits: 1).first.map(String.init) ?? token
    }

    private static func uniqueJoined(_ xs: [String]) -> String {
        var seen = Set<String>()
        let unique = xs.filter { seen.insert($0).inserted }
        return unique.isEmpty ? "ingen" : unique.joined(separator: ", ")
    }
}
