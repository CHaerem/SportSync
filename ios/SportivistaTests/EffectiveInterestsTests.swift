//
//  EffectiveInterestsTests.swift
//  SportivistaTests
//
//  WP-16.4 — the "umiddelbar konsekvens" mechanism: folding the local profile
//  into the interests the agenda compiles against, so a just-confirmed "Følg X"
//  changes the board on the next recompile. Proven purely (merge + buildSections
//  are pure), the disk plumbing in reloadFromCache being trivial pass-through.
//

import XCTest

final class EffectiveInterestsTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    private func profile(following id: String) -> InterestProfile {
        let entity = index.entity(id: id)!
        return InterestProfile().applying(GroundedMutation(
            kind: .add, entity: entity, scope: nil, weight: 0.5, reason: "test", previousRule: nil
        ))
    }

    // MARK: - merge

    func test_merge_bucketsByEntityType() {
        let merged = EffectiveInterests.merge(
            profile: profile(following: "casper-ruud"), into: Interests(), index: index
        )
        XCTAssertTrue(merged.alwaysTrack.athletes.contains { $0.name == "Casper Ruud" })

        let team = EffectiveInterests.merge(profile: profile(following: "fk-lyn-oslo"), into: Interests(), index: index)
        XCTAssertTrue(team.alwaysTrack.teams.contains { $0.name == "FK Lyn Oslo" })
        XCTAssertTrue(team.alwaysTrack.teams.contains { $0.aliases.contains("Lyn") }, "aliases carry over for matching")

        let tourn = EffectiveInterests.merge(profile: profile(following: "tour-de-france-2026"), into: Interests(), index: index)
        XCTAssertTrue(tourn.alwaysTrack.tournaments.contains { $0.name == "Tour de France 2026" })
    }

    func test_merge_emptyProfile_isIdentity() {
        let base = AssistantTestSupport.fixtureInterests()
        XCTAssertEqual(EffectiveInterests.merge(profile: InterestProfile(), into: base, index: index), base)
    }

    // MARK: - Immediate re-compilation (the visible half of move 4)

    func test_followingAnAthlete_bringsItsEventOntoTheBoard() {
        let now = AssistantTestSupport.iso("2026-07-14T09:00:00Z")
        // A tennis event (tennis is NOT in the default followBroadly) featuring
        // Casper Ruud — invisible until he's followed.
        let event = EventBuilder.make(
            sport: "tennis", title: "Casper Ruud – Jannik Sinner", time: "2026-07-14T18:00:00Z",
            homeTeam: "Casper Ruud", awayTeam: "Jannik Sinner", streaming: [["platform": "TV 2 Play"]]
        )

        let before = AgendaViewModel.buildSections(events: [event], interests: Interests(), now: now)
        XCTAssertTrue(titles(before).isEmpty, "an unfollowed tennis match is not on the board")

        let effective = EffectiveInterests.merge(profile: profile(following: "casper-ruud"), into: Interests(), index: index)
        let after = AgendaViewModel.buildSections(events: [event], interests: effective, now: now, index: index, followedIds: ["casper-ruud"])
        XCTAssertTrue(titles(after).contains("Casper Ruud – Jannik Sinner"),
                      "following Casper Ruud brings his match onto the board on recompile")
    }

    private func titles(_ sections: [AgendaSection]) -> [String] {
        sections.flatMap(\.items).compactMap { if case .event(let r) = $0 { return r.title } else { return nil } }
    }
}
