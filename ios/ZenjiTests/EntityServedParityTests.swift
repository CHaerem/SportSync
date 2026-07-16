//
//  EntityServedParityTests.swift
//  ZenjiTests
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

    // MARK: - The real fixture: exact hits + fuzzy fallbacks

    func test_parity_acrossEveryFixtureSurfaceForm() {
        let index = AssistantTestSupport.liveIndex()

        // Every stored surface form of every entity — these all drive the exact
        // fast path (score 100 for names/aliases/spaced-id, 96 for initials),
        // plus the edition-stripped form ("… 2026" → "…") that the map also keys.
        var queries: [String] = []
        for e in index.entities {
            queries.append(e.name)
            queries.append(EntityIndex.editionStripped(TextMatch.normalize(e.name)))
            queries.append(contentsOf: e.aliases)
            queries.append(e.id.replacingOccurrences(of: "-", with: " "))
            queries.append(contentsOf: e.initials)
            // Case / diacritic variants must fold to the same served entity.
            queries.append(e.name.uppercased())
            queries.append(e.name.lowercased())
        }
        assertParity(index, queries, "fixture surface forms")
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
