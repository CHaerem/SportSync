//
//  EntityIndexTests.swift
//  SportivistaTests
//
//  WP-16 — the grounding substrate's primitives: exact lookup, tool-facing
//  search (with Norwegian sport-word expansion), fuzzy nearest-match (the
//  "mente du …?" source), and the mock's utterance→entity detection. Proven
//  against the real entities.json fixture.
//

import XCTest

final class EntityIndexTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    func test_exactLookup() {
        XCTAssertEqual(index.entity(id: "casper-ruud")?.name, "Casper Ruud")
        XCTAssertNil(index.entity(id: "no-such-id"))
    }

    func test_search_byNameAndAlias() {
        XCTAssertTrue(index.search("Ruud").contains { $0.id == "casper-ruud" })
        XCTAssertTrue(index.search("Hovland").contains { $0.id == "viktor-hovland" })
        XCTAssertTrue(index.search("Lyn").contains { $0.id == "fk-lyn-oslo" })
    }

    func test_search_expandsSportKeyword() {
        let tennis = index.search("tennis").map(\.id)
        XCTAssertTrue(tennis.contains("casper-ruud"))
        let sykkel = index.search("sykkel").map(\.id)
        XCTAssertTrue(sykkel.contains("tour-de-france"))
    }

    func test_nearestMatches_typo() {
        let near = index.nearestMatches(to: "Hovlan")
        XCTAssertEqual(near.first?.id, "viktor-hovland")
    }

    func test_nearestMatches_absentSport_isEmpty() {
        XCTAssertTrue(index.nearestMatches(to: "cricket").isEmpty)
    }

    func test_detectEntities_prefersHighestConfidenceTarget() {
        // "Lyn" (alias, whole-word) beats "OBOS-ligaen" (token overlap), which is
        // the scope, not the target.
        XCTAssertEqual(index.detectEntities(in: "Følg Lyn i OBOS-ligaen").map(\.id), ["fk-lyn-oslo"])
    }

    func test_detectEntities_yearSuffixedTournament() {
        XCTAssertEqual(index.detectEntities(in: "Følg Tour de France").map(\.id), ["tour-de-france"])
    }

    func test_detectEntities_noFalsePositiveOnParentheticalName() {
        // The athlete matches; the "(Karsten Warholm)"-qualified tournament does not.
        XCTAssertEqual(index.detectEntities(in: "Følg Karsten Warholm").map(\.id), ["karsten-warholm"])
    }

    func test_representativeEntity_prefersTournament() {
        XCTAssertEqual(
            index.representativeEntity(forSport: "cycling", preferredIn: InterestProfile())?.id,
            "tour-de-france"
        )
    }

    func test_representativeEntity_prefersProfileMember() {
        let profile = InterestProfile().applying(GroundedMutation(
            kind: .add, entity: index.entity(id: "uno-x-mobility")!, scope: nil, weight: 0.5, reason: "seed", previousRule: nil
        ))
        XCTAssertEqual(
            index.representativeEntity(forSport: "cycling", preferredIn: profile)?.id,
            "uno-x-mobility"
        )
    }

    // MARK: - WP-166: curated source priority over the tier2 long-tail

    func test_representativeEntity_curatedSourcePriority_flagshipBeatsLongTail() {
        // With the full long-tail in the index, "Arctic Race of Norway" is a real
        // tier2 cycling tournament that sorts BEFORE "Tour de France" by name — so
        // an alphabetical tie-break would flip the representative to it. Source
        // priority (build-entities' fold order) keeps the tracked flagship.
        XCTAssertNotNil(index.entity(id: "arctic-race-of-norway"),
                        "the tier2 long-tail tournament is present in the full index")
        XCTAssertEqual(
            index.representativeEntity(forSport: "cycling", preferredIn: InterestProfile())?.id,
            "tour-de-france",
            "the tracked flagship represents cycling, not the alphabetically-first tier2 entry"
        )
    }

    func test_representativeEntity_entityGatedSport_fallsBackToTrackedFlagship() {
        // chess is NOT in catalog.tier1, so the product publishes NO sport-chess
        // entity — a bare "sjakk" cannot ground to a whole-sport entity. The
        // representative then falls back to the sport's most-headline entity, and
        // source priority makes that the tracked/current tournament (grand-chess-
        // tour-saint-louis-2026) rather than an alphabetically-earlier tier2 one.
        XCTAssertNil(index.entity(id: "sport-chess"), "chess is entity-gated — no sport-level entity")
        let rep = index.representativeEntity(forSport: "chess", preferredIn: InterestProfile())
        XCTAssertEqual(rep?.id, "grand-chess-tour-saint-louis")
        XCTAssertEqual(rep?.type, "tournament")
    }

    func test_search_wholeSportKeyword_keepsFlagshipInTopN() {
        // A bare sport word expands EVERY entity of that sport to the same score;
        // an alphabetical tie-break floods the top-N with the earliest long-tail
        // and drops the flagship. Source priority keeps it in the default top-N…
        let sykkel = index.search("sykkel").map(\.id)
        XCTAssertTrue(sykkel.contains("tour-de-france"),
                      "the flagship survives the top-N of a large sport match set")
        // …and ranks the tracked flagship ahead of the tier2 long-tail entry.
        let ranked = index.search("sykkel", limit: 100).map(\.id)
        let tdf = try? XCTUnwrap(ranked.firstIndex(of: "tour-de-france"))
        let arctic = try? XCTUnwrap(ranked.firstIndex(of: "arctic-race-of-norway"))
        if let tdf, let arctic {
            XCTAssertLessThan(tdf, arctic, "the tracked flagship ranks ahead of the tier2 long-tail")
        }
    }

    func test_search_exactAndPrefixRankAheadOfSubstring() {
        // WP-166 (2): a prefix match beats a mere trailing-word/substring match.
        // "Masters" is a prefix of "Masters Tournament" (the golf major) but only
        // a trailing word in "Monte-Carlo Masters" — the prefix hit ranks first.
        let masters = index.search("masters").map(\.id)
        let major = masters.firstIndex(of: "masters-tournament")
        let wordHit = masters.firstIndex(of: "monte-carlo-masters")
        XCTAssertNotNil(major, "the prefix-matching golf major is in the results")
        if let major, let wordHit {
            XCTAssertLessThan(major, wordHit, "prefix match ranks ahead of a trailing-word match")
        }
    }

    func test_detectEntities_nowCoversLongTailClub() {
        // WP-160 folded the catalog long-tail in, so "Brann" is now a real,
        // covered team — detection SHOULD find it (older WP-65 tests used it as an
        // 'unknown' example; that is no longer correct). A club still outside
        // coverage ("Skeid") stays undetected.
        XCTAssertEqual(index.detectEntities(in: "Følg Brann").map(\.id), ["brann"])
        XCTAssertTrue(index.detectEntities(in: "Følg Skeid").isEmpty,
                      "a club outside coverage stays genuinely unknown")
    }

    func test_sportKeywordDetection() {
        XCTAssertEqual(EntityIndex.sportKeyword(in: "mer sykkel i juli"), "cycling")
        XCTAssertEqual(EntityIndex.sportKeyword(in: "slutt med tennis"), "tennis")
        XCTAssertNil(EntityIndex.sportKeyword(in: "følg cricket"))
    }

    // WP-64: winter sports + the umbrella category.
    func test_sportKeyword_winterSports() {
        XCTAssertEqual(EntityIndex.sportKeyword(in: "følg skiskyting"), "biathlon")
        XCTAssertEqual(EntityIndex.sportKeyword(in: "mer langrenn"), "cross-country")
        XCTAssertEqual(EntityIndex.sportKeyword(in: "alpint til vinteren"), "alpine")
        XCTAssertEqual(EntityIndex.sportKeyword(in: "følg skihopp"), "ski jumping")
    }

    func test_categoryKeyword_vintersport() {
        XCTAssertEqual(EntityIndex.categoryKeyword(in: "følg vintersport"), "winter-sports")
        XCTAssertEqual(EntityIndex.categoryKeyword(in: "alle vinteridretter"), "winter-sports")
        XCTAssertNil(EntityIndex.categoryKeyword(in: "følg fotball"))
    }

    func test_categoryEntity_lookup() {
        XCTAssertEqual(index.categoryEntity(for: "winter-sports")?.id, "category-winter-sports")
        XCTAssertNil(index.categoryEntity(for: "no-such-category"))
    }

    func test_detectEntities_ignoresSportAndCategoryEntities() {
        // A whole-sport / umbrella word is routed via the keyword paths, so it
        // must NOT surface as an explicit entity target here.
        XCTAssertTrue(index.detectEntities(in: "Følg vintersport").isEmpty)
        XCTAssertTrue(index.detectEntities(in: "Mer langrenn").isEmpty)
    }
}
