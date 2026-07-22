//
//  EntityServedParityTests.swift
//  SportivistaTests
//
//  WP-61 — the correctness gate for the matching-scaling optimization. The fast
//  `EntityIndex.servedEntity(for:)` (exact/initials maps + fuzzy fallback)
//  replaces `resolve(_).served` inside `followableEntities`, the O(events ×
//  entities) hot path. Its whole licence is that it must return the EXACT same
//  entity `resolve(_).served` would — the golden vectors and the fuzzy-resolver
//  suite are the judges of match SEMANTICS; this file is the judge that the
//  fast path did not change them.
//
//  We assert parity across (1) every name/alias/id/initials/edition-stripped
//  form of the real entities.json fixture — the exact-hit fast path — plus
//  adversarial typo/prefix/absent/empty queries that force the fuzzy FALLBACK,
//  and (2) hand-built collision indexes that exercise the fast path's "clear
//  lead" reasoning (two exact matches, an exact match shadowed by another
//  entity's initials, a lone exact match).
//

import XCTest

final class EntityServedParityTests: XCTestCase {

    /// Assert `servedEntity` matches `resolve().served` for every query, naming
    /// the offender on failure.
    private func assertParity(_ index: EntityIndex, _ queries: [String], _ context: String) {
        for q in queries {
            let fast = index.servedEntity(for: q)?.id
            let slow = index.resolve(q).served?.id
            XCTAssertEqual(fast, slow, "\(context): servedEntity(\"\(q)\")=\(fast ?? "nil") diverged from resolve().served=\(slow ?? "nil")")
        }
    }

    /// The surface forms that are EXACT-map keys — name, its edition-stripped
    /// form, spaced id, aliases, and case variants. Every one hits `servedEntity`'s
    /// O(1) exact fast path (no resolver fallback), so a full-fixture sweep of them
    /// stays cheap. Deliberately EXCLUDES `initials`: those are NOT in the exact
    /// map, so `servedEntity` defers them to the O(n) resolver — testing every
    /// entity's initials over the 3 661-entity fixture is what made the sweep slow.
    /// Initials parity is covered by the bounded sample + the initials-shadow
    /// collision test.
    private func exactMapForms(of e: Entity) -> [String] {
        [e.name,
         EntityIndex.editionStripped(TextMatch.normalize(e.name)),
         e.id.replacingOccurrences(of: "-", with: " "),
         e.name.uppercased(),
         e.name.lowercased()]
            + e.aliases
    }

    // MARK: - The real fixture: exact hits + fuzzy fallbacks

    // WP-161 REDESIGN. The original asserted `servedEntity == resolve().served`
    // across EVERY surface form of EVERY entity — ~7 forms × the fixture, each
    // calling the FULL O(entities) resolver. Fine at the 52-entity fixture; at the
    // 3 661-entity world registry that is O(entities²) and ran for **6 937 s
    // alone**. The parity guarantee is preserved without the quadratic scan, split
    // per the two paths `servedEntity` actually has:
    //   • the EXACT fast path (score 100/96) — proven identical to
    //     `resolve().served` BY CONSTRUCTION in `servedEntity`'s doc comment, and
    //     its collision DECISION logic (100–100 tie, 100-vs-96 initials shadow,
    //     lone hit) proven against the real resolver in the hand-built tests
    //     below. Over the whole fixture we cheaply assert it stays SELF-CONSISTENT
    //     (never serves an entity that does not hold the queried term).
    //   • the FUZZY fallback — exercised against the real resolver on the curated
    //     adversarial set (`test_parity_forFuzzyFallbackQueries`) AND a
    //     DETERMINISTIC, documented stride sample of the fixture, so a real
    //     fast-vs-slow divergence still fails CI.

    /// Full fixture, cheap (O(1) per form): a served result must be an entity that
    /// genuinely holds the queried surface form as an exact term; nil is legitimate
    /// only for a collision (a 100–100 tie or an initials shadow). Catches any
    /// gross fast-path bug across all 3 661 entities without a single resolver scan.
    func test_servedEntity_selfConsistent_acrossEveryFixtureSurfaceForm() {
        let index = AssistantTestSupport.liveIndex()
        for e in index.entities {
            for form in exactMapForms(of: e) where !TextMatch.normalize(form).isEmpty {
                guard let served = index.servedEntity(for: form) else { continue } // collision → nil is fine
                XCTAssertTrue(
                    holdsExactly(served, form),
                    "servedEntity(\"\(form)\") = \(served.id), which does not hold that exact term"
                )
            }
        }
    }

    /// The real fast-vs-slow parity, on a DETERMINISTIC stride sample spanning the
    /// whole fixture (every `stride`-th entity, so all sports/sources/sizes are
    /// represented and the set is reproducible run-to-run). Each `resolve` call is
    /// the full O(entities) scan (~0.3 s at 3 661 entities), so the query count is
    /// deliberately bounded (~30 entities × a few form-types) — the full-fixture
    /// EXACT coverage lives in the cheap self-consistency test above; this sample's
    /// job is only to catch a genuine fast-vs-slow scoring DIVERGENCE, which is
    /// uniform across forms, on a representative spread.
    func test_parity_onDeterministicFixtureSample() {
        let index = AssistantTestSupport.liveIndex()
        let all = index.entities
        let stride = Swift.max(1, all.count / 30)   // ~30 entities across the index
        var queries: [String] = []
        for i in Swift.stride(from: 0, to: all.count, by: stride) {
            let e = all[i]
            // One of each form TYPE the fast path keys on (not every variant — the
            // case/edition folds are proven exhaustively in the self-consistency
            // test): name, spaced-id, first alias, first initials.
            queries.append(e.name)
            queries.append(e.id.replacingOccurrences(of: "-", with: " "))
            if let alias = e.aliases.first { queries.append(alias) }
            if let ini = e.initials.first { queries.append(ini) }
        }
        assertParity(index, queries, "deterministic surface-form sample (stride \(stride))")
    }

    /// True iff `query` normalizes to a stored exact term of `e` (name / alias /
    /// spaced-id / edition-stripped form / initials) — the forms `servedEntity`'s
    /// exact maps are keyed by. Mirrors the index's own keying, so it needs no
    /// resolver call.
    private func holdsExactly(_ e: Entity, _ query: String) -> Bool {
        let q = TextMatch.normalize(query)
        guard !q.isEmpty else { return false }
        var forms = Set<String>()
        for raw in [e.name] + e.aliases + [e.id.replacingOccurrences(of: "-", with: " ")] {
            let n = TextMatch.normalize(raw)
            forms.insert(n)
            forms.insert(EntityIndex.editionStripped(n))
        }
        for ini in e.initials { forms.insert(TextMatch.normalize(ini)) }
        return forms.contains(q)
    }

    func test_parity_forFuzzyFallbackQueries() {
        let index = AssistantTestSupport.liveIndex()
        // None of these exact-match a stored term, so `servedEntity` must defer
        // to the full resolver: typos (served via same-shape distance), acronyms,
        // prefixes (suggestion-only, never served), genuinely-absent, and empty.
        let queries = [
            "Tour de Farnce",   // typo → served
            "tour de france",   // yearless → served via year-strip alias
            "tdf",              // initials → served
            "Hovlan",           // prefix → suggestion only, NOT served
            "Ruu",              // prefix
            "cricket",          // absent
            "",                 // empty
            "   ",              // whitespace only
            "Casper",           // single token of a two-token name
            "Oslo",             // partial / substring
        ]
        assertParity(index, queries, "fuzzy fallback")
    }

    // MARK: - Hand-built collisions: the fast path's "clear lead" logic

    func test_parity_twoExactMatches_bothScore100_notServed() {
        // Two entities normalize to the SAME name → a 100–100 tie → resolve()
        // serves neither. The fast path must reach the same nil, not pick one.
        let index = EntityIndex([
            Entity(id: "united-a", name: "United", sport: "football", type: "team"),
            Entity(id: "united-b", name: "United", sport: "football", type: "team"),
        ])
        XCTAssertNil(index.servedEntity(for: "United"))
        assertParity(index, ["United", "united"], "twin exact")
    }

    func test_parity_exactMatchShadowedByAnotherEntitysInitials() {
        // "tif" is BOTH an exact (spaced-id / name) hit for one entity AND the
        // stored initials of another → 100 vs 96 → lead 4 < 12 → resolve() serves
        // neither. The fast path's initials-shadow check must agree.
        let index = EntityIndex([
            Entity(id: "tif", name: "TIF", sport: "football", type: "team"),
            Entity(id: "tromso-il", name: "Tromsø Idrettslag", sport: "football", type: "team", initials: ["TIF"]),
        ])
        XCTAssertNil(index.servedEntity(for: "TIF"))
        assertParity(index, ["TIF", "tif"], "exact shadowed by initials")
    }

    func test_parity_loneExactMatch_isServed() {
        let index = EntityIndex([
            Entity(id: "fk-lyn-oslo", name: "FK Lyn Oslo", aliases: ["Lyn"], sport: "football", type: "team"),
            Entity(id: "casper-ruud", name: "Casper Ruud", sport: "tennis", type: "athlete"),
        ])
        XCTAssertEqual(index.servedEntity(for: "Lyn")?.id, "fk-lyn-oslo")
        XCTAssertEqual(index.servedEntity(for: "FK Lyn Oslo")?.id, "fk-lyn-oslo")
        assertParity(index, ["Lyn", "FK Lyn Oslo", "Casper Ruud", "lyn oslo", "Ly"], "lone exact")
    }

    func test_parity_emptyIndex() {
        let index = EntityIndex([])
        assertParity(index, ["anything", "", "Lyn"], "empty index")
    }
}
