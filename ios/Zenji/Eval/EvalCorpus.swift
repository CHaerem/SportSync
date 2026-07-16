//
//  EvalCorpus.swift
//  Zenji
//
//  WP-69 — the versioned assistant eval corpus, decoded from
//  `ZenjiTests/Fixtures/eval-corpus.json`. Plain, FoundationModels-FREE value
//  types (Codable/Sendable), exactly like `AssistantModels`: the corpus + the
//  scorer are shared by BOTH the CI XCTest (which drives the deterministic
//  MockInterestAssistant) and the DEBUG on-device eval screen (which drives the
//  real FoundationModelsInterestAssistant). Only the harness around them
//  differs — the golden expectations and the scoring rubric are one code path.
//
//  The corpus scores STRUCTURE, never prose:
//    • mutation cases  → an entity id-SET the grounded result must equal.
//    • answer cases    → a rubric: must-reference-rows (count / sport),
//      must-contain-any, forbidden-claims, and no phantom (unresolvable) rows.
//
//  `knownGap` cases are EXPECTED to fail until the named work package lands: CI
//  skips them (marked), the device run reports them as known gaps rather than
//  failures. This is how a not-yet-shipped capability (e.g. WP-64 winter
//  entities, WP-65 bulk capture) is tracked as a target instead of a red test.
//

import Foundation

/// One versioned corpus: a schema `version`, the fixed `clock` the CI answer
/// arm is evaluated against (the on-device run uses the live feed + real time),
/// and the cases.
struct EvalCorpus: Codable, Sendable {
    var version: Int
    var description: String?
    /// The fixed `now` CI evaluates the answer arm against, ISO 8601. Ignored by
    /// the on-device run (which uses the live feed and the device clock).
    var clock: Date
    var cases: [EvalCase]

    /// Categories present, in first-seen order — drives the per-category
    /// pass-rate breakdown.
    var categories: [String] {
        var seen = Set<String>()
        return cases.compactMap { seen.insert($0.category).inserted ? $0.category : nil }
    }

    // MARK: - Decoding

    /// ISO 8601 dates (the `clock` field), matching the rest of the app's codecs.
    static func decode(_ data: Data) throws -> EvalCorpus {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(EvalCorpus.self, from: data)
    }

    /// Loads the corpus bundled as a resource (`eval-corpus.json`). The DEBUG
    /// eval screen calls this against `Bundle.main`; the CI test decodes the
    /// fixture data directly. Returns nil if the resource is missing or invalid
    /// (the screen shows an honest "fant ikke korpuset" state rather than
    /// crashing).
    static func bundled(in bundle: Bundle = .main, resource: String = "eval-corpus") -> EvalCorpus? {
        guard let url = bundle.url(forResource: resource, withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? decode(data)
    }
}

/// One eval case: an utterance plus its golden STRUCTURED expectation.
struct EvalCase: Codable, Sendable, Identifiable {
    var id: String
    /// Grouping for the per-category pass-rate ("canon", "multiPart", "winter",
    /// "question").
    var category: String
    var utterance: String
    /// Which arm the case exercises.
    var kind: EvalKind
    /// Optional profile to seed BEFORE interpreting (e.g. "slutt med tennis"
    /// needs a tennis rule to remove). Each entry is grounded straight to an
    /// add-rule via the index.
    var seedProfile: [SeedRule]?
    /// True when the case is EXPECTED to fail until `knownGapRef` ships. CI
    /// skips it (marked); the device run reports it as a known gap.
    var knownGap: Bool?
    /// The work package that closes the gap (e.g. "WP-64/65").
    var knownGapRef: String?
    /// Free-text rationale carried into the report for the reader.
    var note: String?
    var expect: EvalExpectation

    var isKnownGap: Bool { knownGap == true }
}

enum EvalKind: String, Codable, Sendable {
    case mutation
    case answer
    /// WP-66 — the command arm: the golden pins the parsed `AssistantCommand`'s
    /// canonical token (`AssistantCommand.evalToken`).
    case command
    /// WP-67 — the present arm: the golden pins the parsed `AgendaFilter`'s
    /// structure (sports set / entity-id set / date window, or a reset flag).
    case present
}

/// A rule to seed into the profile before interpreting. `scope` is optional
/// Norwegian text ("bare i Grand Slams"), mirroring `InterestRule`.
struct SeedRule: Codable, Sendable {
    var entityId: String
    var scope: String?
}

/// The golden expectation — exactly one arm is populated per `EvalCase.kind`.
struct EvalExpectation: Codable, Sendable {
    /// For `.mutation`: the entity id-SET the GROUNDED result must equal
    /// (order-independent). An empty array means "nothing should ground" (the
    /// honest-rejection cases).
    var mutationEntityIds: [String]?
    /// For `.answer`: the row/claim rubric.
    var answer: AnswerExpectation?
    /// For `.command` (WP-66): the expected `AssistantCommand.evalToken`. An
    /// enum-argument command pins the full `arm:value` ("theme:dark"); a
    /// free-text command may pin the ARM alone ("open", "forget"), which the
    /// scorer matches on the actual token's arm (a free-generating model can't
    /// be held to an exact phrase).
    var command: String?
    /// For `.present` (WP-67): the expected filter structure.
    var filter: FilterExpectation?

    /// Explicit initialiser so the existing (mutation/answer/command) call sites
    /// and the synthesised Codable both keep working while `filter` is added.
    init(mutationEntityIds: [String]? = nil, answer: AnswerExpectation? = nil, command: String? = nil, filter: FilterExpectation? = nil) {
        self.mutationEntityIds = mutationEntityIds
        self.answer = answer
        self.command = command
        self.filter = filter
    }
}

/// The present-arm rubric (WP-67). Every populated field is a check; a case
/// passes only if ALL its checks pass. Structural, never prose — so it holds for
/// the deterministic mock and a free-generating model alike.
struct FilterExpectation: Codable, Sendable {
    /// The exact set of canonical sport tags the filter must carry (order-free).
    var sports: [String]?
    /// The exact set of entity ids the filter must carry (order-free).
    var entityIds: [String]?
    /// The date window's rawValue ("today"/"tomorrow"/"this-week"/"this-weekend").
    var window: String?
    /// True ⇒ the filter must be EMPTY (the «vis alt igjen» reset).
    var reset: Bool?
}

/// The answer-arm rubric. Every populated field is a check; a case passes only
/// if ALL its checks pass. Deliberately structural — never an exact-text match
/// — so it holds for both the deterministic mock (fixture feed) and a
/// free-generating model (live feed).
struct AnswerExpectation: Codable, Sendable {
    /// The answer must resolve at least this many referenced agenda rows.
    var minReferencedRows: Int?
    /// At least one resolved referenced row must be one of these sports.
    var referencedSportsAnyOf: [String]?
    /// The answer text must contain at least one of these substrings
    /// (case-insensitive) — e.g. an "i kveld" question stays about tonight.
    var mustContainAny: [String]?
    /// The answer text must contain NONE of these (case-insensitive) — the
    /// no-fabrication / no-spoiler guard.
    var forbiddenClaims: [String]?
    /// Every cited event id must resolve to a real feed row (no phantom rows).
    /// Defaults to true when omitted.
    var requireNoPhantomRows: Bool?

    var enforceNoPhantomRows: Bool { requireNoPhantomRows ?? true }
}
