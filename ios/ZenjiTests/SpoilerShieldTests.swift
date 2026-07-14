//
//  SpoilerShieldTests.swift
//  ZenjiTests
//
//  WP-30 — spoiler protection masks the RIGHT sport/entity and NO other. The
//  shield is derived from `spoilerPolicy` memory facts (a pure presentation
//  layer); the agenda exposes a per-row `spoilerSafe` flag the detail sheet
//  respects. The five predicates / golden vectors are never touched.
//

import XCTest

final class SpoilerShieldTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    private func spoiler(entityId: String? = nil, sport: String? = nil) -> MemoryFact {
        MemoryFact(entityId: entityId, sport: sport, kind: .spoilerPolicy, value: "opptak", reason: "r", updatedAt: now)
    }

    // MARK: - Shield extraction

    func test_shield_extractsScopedSpoilerPolicies_ignoresGlobalAndOtherKinds() {
        let memory = MemoryState(facts: [
            spoiler(sport: "f1"),
            spoiler(entityId: "casper-ruud"),
            spoiler(),                                                   // global — ignored (never blanket-mask everything)
            MemoryFact(sport: "chess", kind: .knowledgeLevel, value: "nybegynner", reason: "r", updatedAt: now),
        ])
        let shield = SpoilerShield(memory: memory)
        XCTAssertEqual(shield.sports, ["f1"])
        XCTAssertEqual(shield.entityIds, ["casper-ruud"])
    }

    // MARK: - Sensitivity — right one, and NO other

    func test_isSensitive_matchesSportAndEntity_notOthers() {
        let shield = SpoilerShield(sports: ["f1"], entityIds: ["casper-ruud"])
        XCTAssertTrue(shield.isSpoilerSensitive(sport: "f1", entityIds: []))
        XCTAssertTrue(shield.isSpoilerSensitive(sport: "tennis", entityIds: ["casper-ruud"]))
        XCTAssertFalse(shield.isSpoilerSensitive(sport: "golf", entityIds: ["viktor-hovland"]),
                       "an unrelated sport+entity is never masked")
        XCTAssertFalse(shield.isSpoilerSensitive(sport: "tennis", entityIds: ["some-other"]),
                       "a followed sport with NO spoiler policy stays safe")
    }

    func test_emptyShield_masksNothing() {
        let shield = SpoilerShield()
        XCTAssertFalse(shield.isSpoilerSensitive(sport: "f1", entityIds: ["casper-ruud"]))
    }

    // MARK: - Agenda exposes spoilerSafe on the RIGHT row only

    func test_buildSections_masksOnlyTheSpoilerScopedRows() {
        let now = iso("2026-07-13T10:00:00Z")
        let events = [
            EventBuilder.make(sport: "f1", title: "GP-kvalifisering", time: "2026-07-13T18:00:00Z"),
            EventBuilder.make(sport: "tennis", title: "Tennisfinale", time: "2026-07-13T19:00:00Z"),
            EventBuilder.make(sport: "football", title: "Lyn - Bodø", time: "2026-07-13T20:00:00Z", homeTeamEntityId: "fk-lyn-oslo"),
        ]
        let interests = Interests(followBroadly: ["f1", "tennis", "football"])
        // Spoiler policy on F1 (sport) AND on FK Lyn Oslo (entity).
        let shield = SpoilerShield(sports: ["f1"], entityIds: ["fk-lyn-oslo"])

        let sections = AgendaViewModel.buildSections(events: events, interests: interests, now: now, shield: shield)
        let rows = sections.flatMap { $0.items }.compactMap { item -> AgendaEventRow? in
            if case .event(let row) = item { return row }
            return nil
        }
        func safe(_ title: String) -> Bool? { rows.first { $0.title == title }?.spoilerSafe }

        XCTAssertEqual(safe("GP-kvalifisering"), false, "the F1 (spoiler sport) row is masked")
        XCTAssertEqual(safe("Lyn - Bodø"), false, "the FK Lyn Oslo (spoiler entity) row is masked")
        XCTAssertEqual(safe("Tennisfinale"), true, "the tennis row — no spoiler policy — is NOT masked")
    }

    func test_buildSections_emptyShield_everythingSafe_noRegression() {
        let now = iso("2026-07-13T10:00:00Z")
        let events = [EventBuilder.make(sport: "f1", title: "GP", time: "2026-07-13T18:00:00Z")]
        let sections = AgendaViewModel.buildSections(events: events, interests: Interests(followBroadly: ["f1"]), now: now)
        let row = sections.flatMap { $0.items }.compactMap { item -> AgendaEventRow? in
            if case .event(let r) = item { return r }; return nil
        }.first
        XCTAssertEqual(row?.spoilerSafe, true, "with no memory shield every row is safe (byte-for-byte WP-18 behaviour)")
    }

    private func iso(_ s: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)!
    }
}
