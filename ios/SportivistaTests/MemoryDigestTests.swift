//
//  MemoryDigestTests.swift
//  SportivistaTests
//
//  WP-30 — retrieval is PURE Swift (entity-match + freshness, deterministic, no
//  AI): the digest picks the right facts/notes for what's relevant now, ages out
//  expired episodic notes, keeps global facts, floats spoiler policies to the
//  front, and respects the ~500-token cap.
//

import XCTest

final class MemoryDigestTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    private func fact(_ kind: MemoryKind, entityId: String? = nil, sport: String? = nil, value: String = "v") -> MemoryFact {
        MemoryFact(entityId: entityId, sport: sport, kind: kind, value: value, reason: "r", updatedAt: now)
    }

    // MARK: - Relevance

    func test_includesGlobalFactsAlways() {
        let memory = MemoryState(facts: [fact(.notifyWindow, value: "ikke før 08:00")])
        let digest = MemoryDigest.build(memory: memory, relevantEntityIds: [], relevantSports: [], now: now)
        XCTAssertTrue(digest.contains("08:00"), "an unscoped (global) fact always applies")
    }

    func test_includesRelevantSportFact_excludesIrrelevant() {
        let memory = MemoryState(facts: [
            fact(.knowledgeLevel, sport: "chess", value: "nybegynner"),
            fact(.knowledgeLevel, sport: "golf", value: "ekspert"),
        ])
        let digest = MemoryDigest.build(memory: memory, relevantEntityIds: [], relevantSports: ["chess"], now: now)
        XCTAssertTrue(digest.contains("nybegynner"), "the relevant sport's fact is included")
        XCTAssertFalse(digest.contains("ekspert"), "a fact scoped to an irrelevant sport is skipped")
    }

    func test_includesRelevantEntityFact() {
        let memory = MemoryState(facts: [fact(.preference, entityId: "casper-ruud", value: "grus")])
        let digest = MemoryDigest.build(memory: memory, relevantEntityIds: ["casper-ruud"], relevantSports: [], now: now)
        XCTAssertTrue(digest.contains("grus"))
    }

    func test_emptyWhenNothingRelevant() {
        let memory = MemoryState(facts: [fact(.preference, sport: "golf")])
        XCTAssertEqual(MemoryDigest.build(memory: memory, relevantSports: ["tennis"], now: now), "",
                       "nothing relevant ⇒ empty block (no instruction change)")
    }

    // MARK: - Freshness

    func test_expiredEpisodicNoteIsExcluded_freshOneKept() {
        let fresh = EpisodicNote(distilled: DistilledNote(summary: "fersk i kveld", entityRefs: ["cycling"], expiresAt: now.addingTimeInterval(3600)), now: now)
        let stale = EpisodicNote(distilled: DistilledNote(summary: "gammel plan", entityRefs: ["cycling"], expiresAt: now.addingTimeInterval(-3600)), now: now.addingTimeInterval(-7200))
        let memory = MemoryState(episodic: [fresh, stale])
        let digest = MemoryDigest.build(memory: memory, relevantSports: ["cycling"], now: now)
        XCTAssertTrue(digest.contains("fersk i kveld"))
        XCTAssertFalse(digest.contains("gammel plan"), "an expired note ages out of the digest")
    }

    // MARK: - Ordering (spoiler-first) + cap

    func test_spoilerPolicyFloatsToFront() {
        let memory = MemoryState(facts: [
            fact(.note, sport: "f1", value: "et notat"),
            fact(.spoilerPolicy, sport: "f1", value: "opptak"),
        ])
        let digest = MemoryDigest.build(memory: memory, relevantSports: ["f1"], now: now)
        let spoilerIdx = try! XCTUnwrap(digest.range(of: "SPOILERVERN"))
        let noteIdx = try! XCTUnwrap(digest.range(of: "et notat"))
        XCTAssertTrue(spoilerIdx.lowerBound < noteIdx.lowerBound, "safety-critical spoiler line is never the one truncated away")
    }

    func test_respectsTokenCap() {
        let many = (0..<200).map { fact(.note, sport: "chess", value: "notat nummer \($0) med litt ekstra tekst for lengde") }
        let digest = MemoryDigest.build(memory: MemoryState(facts: many), relevantSports: ["chess"], now: now, tokenCap: 50)
        XCTAssertLessThanOrEqual(digest.count, 50 * MemoryDigest.charsPerToken + 200, "stays within the ~token budget (+ the header allowance)")
        XCTAssertTrue(digest.contains("Det du vet om brukeren"), "still starts with the header")
    }
}
