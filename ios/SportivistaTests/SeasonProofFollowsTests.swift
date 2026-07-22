//
//  SeasonProofFollowsTests.swift
//  SportivistaTests
//
//  WP-162 — a follow must never die silently at a season/edition change.
//
//  The failure this pins: an `InterestRule` FREEZES `entityId` + `entityName` at
//  follow time. With edition-stamped ids (`premier-league-2026-27`), next
//  season's bookkeeping published a NEW id — the old rule resolved to nothing,
//  and the frozen NAME ("Premier League 2026/27") word-boundary-matched nothing
//  in the new edition's title either. The follow vanished with no signal at all.
//
//  Three defences, one per layer, all tested here (the web twins live in
//  tests/season-proof-follows.test.js):
//    1. RESOLUTION — `EntityIndex.entity(id:)` resolves a FORMER id through the
//       published `altIds`, so an un-migrated rule keeps working immediately.
//    2. MATCHING   — `EffectiveInterests.seasonProof` adds the edition-stripped
//       name, so even an unresolvable (soft) rule matches the next edition.
//    3. MIGRATION  — `ProfileIdMigration` re-points rules onto the canonical id,
//       losslessly, idempotently and convergently across devices.
//

import XCTest

final class SeasonProofFollowsTests: XCTestCase {

    // The index as the server publishes it AFTER WP-162.
    private let index = EntityIndex([
        Entity(id: "premier-league", name: "Premier League", aliases: ["Premier League 2026/27", "EPL"],
               sport: "football", type: "tournament", edition: "2026/27", altIds: ["premier-league-2026-27"]),
        Entity(id: "tour-de-france", name: "Tour de France 2026", aliases: ["Tour de France"],
               sport: "cycling", type: "tournament", edition: "2026", altIds: ["tour-de-france-2026"]),
        Entity(id: "liverpool", name: "Liverpool", aliases: ["Liverpool FC"], sport: "football", type: "team"),
    ])

    private func rule(_ id: String, _ name: String, sport: String = "football") -> InterestRule {
        InterestRule(entityId: id, entityName: name, sport: sport, weight: 0.5,
                     reason: "Fulgt i 2026", addedAt: AssistantTestSupport.iso("2026-08-01T10:00:00Z"))
    }

    private func state(_ rules: [InterestRule], at iso: String = "2026-08-01T10:00:00Z", device: String = "dev-a") -> ProfileSyncState {
        ProfileSyncState().updatingRules(to: InterestProfile(rules: rules),
                                         now: AssistantTestSupport.iso(iso), deviceID: device)
    }

    // MARK: - 1. Resolution through altIds

    func test_formerEditionId_stillResolvesToTheCanonicalEntity() {
        let e = index.entity(id: "premier-league-2026-27")
        XCTAssertEqual(e?.id, "premier-league", "a rule frozen on last season's id resolves to the entity that now carries it")
        XCTAssertEqual(index.entity(id: "premier-league")?.id, "premier-league")
        XCTAssertNil(index.entity(id: "serie-a-2026-27"), "an unknown id still resolves to nothing (the grounding gate is intact)")
    }

    func test_aLivePrimaryIdIsNeverShadowedByAnAltId() {
        // "liverpool" is a live entity; even if some other record claimed it as a
        // former id, the live entity must win the lookup.
        let shadowed = EntityIndex([
            Entity(id: "liverpool", name: "Liverpool", sport: "football", type: "team"),
            Entity(id: "lfc-legacy", name: "LFC Legacy", sport: "football", type: "team", altIds: ["liverpool"]),
        ])
        XCTAssertEqual(shadowed.entity(id: "liverpool")?.name, "Liverpool")
    }

    // MARK: - 2. Matching survives the edition change

    func test_a2026Rule_matchesThe2027Edition() {
        // A tournament NOT in followBroadly's sports would be admitted by nothing
        // BUT this rule — so relevance is a true test of the matching path.
        let profile = InterestProfile(rules: [
            InterestRule(entityId: "ehf-champions-league-2026-27", entityName: "EHF Champions League 2026/27",
                         sport: "handball", weight: 0.5, reason: "Fulgt i 2026",
                         addedAt: AssistantTestSupport.iso("2026-08-01T10:00:00Z"))
        ])
        let interests = EffectiveInterests.merge(profile: profile, into: Interests(), index: index)
        let event = EventBuilder.make(
            sport: "handball", title: "Kolstad – Veszprém", time: "2027-09-10T18:00:00Z",
            tournament: "EHF Champions League 2027/28"
        )
        XCTAssertTrue(
            FeedCompiler.isRelevant(FeedEvent(from: event), interests: interests,
                                    now: AssistantTestSupport.iso("2027-09-10T00:00:00Z")),
            "a rule created against the 2026/27 edition still matches 2027/28"
        )
    }

    func test_seasonProof_isAdditive_andNeverWidensIntoAnotherEntity() {
        let terms = EffectiveInterests.seasonProof(name: "Tour de France Femmes 2026", aliases: [])
        XCTAssertTrue(terms.contains { TextMatch.normalize($0) == "tour de france femmes" })
        // Stripping the YEAR must never shorten the NAME: the women's race must
        // not start matching the men's.
        XCTAssertFalse(terms.contains { TextMatch.normalize($0) == "tour de france" })
        // A name with no edition token contributes nothing new.
        XCTAssertEqual(EffectiveInterests.seasonProof(name: "Liverpool", aliases: ["Liverpool FC"]), ["Liverpool FC"])
    }

    // MARK: - 3. Migration

    func test_migration_rePointsARuleOntoTheCanonicalId() {
        let before = state([rule("premier-league-2026-27", "Premier League 2026/27")])
        let migrated = ProfileIdMigration.migrate(before, index: index,
                                                  now: AssistantTestSupport.iso("2027-07-01T00:00:00Z"), deviceID: "dev-a")
        let live = migrated?.profile.rules ?? []
        XCTAssertEqual(live.map(\.entityId), ["premier-league"])
        XCTAssertEqual(live.first?.entityName, "Premier League")
        // Everything the USER owns is carried over verbatim.
        XCTAssertEqual(live.first?.reason, "Fulgt i 2026")
        XCTAssertEqual(live.first?.addedAt, AssistantTestSupport.iso("2026-08-01T10:00:00Z"))
        // The move REPLICATES: the old id is tombstoned, never silently absent.
        let tomb = migrated?.rules.first { $0.entityId == "premier-league-2026-27" }
        XCTAssertEqual(tomb?.deleted, true)
    }

    func test_migration_isIdempotent() {
        let before = state([rule("premier-league-2026-27", "Premier League 2026/27")])
        let once = ProfileIdMigration.migrate(before, index: index, now: AssistantTestSupport.iso("2027-07-01T00:00:00Z"), deviceID: "dev-a")!
        XCTAssertNil(ProfileIdMigration.migrate(once, index: index, now: AssistantTestSupport.iso("2027-07-02T00:00:00Z"), deviceID: "dev-a"))
    }

    func test_migration_isLossless_anUnresolvableRuleIsKeptExactlyAsItWas() {
        let soft = InterestRule(entityId: "soft-erling-haaland", entityName: "Erling Haaland", sport: "football",
                                weight: 0.5, reason: "Følg likevel", addedAt: AssistantTestSupport.iso("2026-08-01T10:00:00Z"))
        let before = state([rule("premier-league-2026-27", "Premier League 2026/27"), soft])
        let migrated = ProfileIdMigration.migrate(before, index: index, now: AssistantTestSupport.iso("2027-07-01T00:00:00Z"), deviceID: "dev-a")!
        let live = migrated.profile.rules
        XCTAssertEqual(live.count, 2, "NO rule ever disappears in a migration")
        XCTAssertEqual(live.first { $0.entityId == "soft-erling-haaland" }, soft)
    }

    func test_migration_doesNotDuplicateWhenTheCanonicalIdIsAlreadyFollowed() {
        let canonical = rule("premier-league", "Premier League")
        let before = state([rule("premier-league-2026-27", "Premier League 2026/27"), canonical])
        let migrated = ProfileIdMigration.migrate(before, index: index, now: AssistantTestSupport.iso("2027-07-01T00:00:00Z"), deviceID: "dev-a")!
        XCTAssertEqual(migrated.profile.rules.map(\.entityId), ["premier-league"])
        XCTAssertEqual(migrated.profile.rules.first, canonical, "the existing follow is kept untouched")
    }

    func test_migration_convergesAcrossDevices_insteadOfDuplicating() {
        // Device A migrates; device B still holds the pre-migration copy. The
        // CRDT keys on entityId, so without the tombstone this would merge into
        // TWO rules for one competition.
        let before = state([rule("premier-league-2026-27", "Premier League 2026/27")])
        let a = ProfileIdMigration.migrate(before, index: index, now: AssistantTestSupport.iso("2027-07-01T00:00:00Z"), deviceID: "dev-a")!
        let merged = ProfileMerge.merge(local: a, remote: before).merged
        XCTAssertEqual(merged.profile.rules.map(\.entityId), ["premier-league"])
        // …and the merge is order-independent.
        XCTAssertEqual(ProfileMerge.merge(local: before, remote: a).merged.profile.rules.map(\.entityId), ["premier-league"])
    }

    func test_migration_isANoOpWhenThereIsNothingToMove() {
        XCTAssertNil(ProfileIdMigration.migrate(state([rule("premier-league", "Premier League")]), index: index,
                                                now: AssistantTestSupport.iso("2027-07-01T00:00:00Z"), deviceID: "dev-a"))
        XCTAssertNil(ProfileIdMigration.migrate(ProfileSyncState(), index: index,
                                                now: AssistantTestSupport.iso("2027-07-01T00:00:00Z"), deviceID: "dev-a"))
        XCTAssertNil(ProfileIdMigration.migrate(state([rule("premier-league-2026-27", "Premier League 2026/27")]),
                                                index: EntityIndex([]),
                                                now: AssistantTestSupport.iso("2027-07-01T00:00:00Z"), deviceID: "dev-a"))
    }

    // MARK: - News lens

    func test_newsLens_matchesPointersStampedWithTheCanonicalId() {
        let profile = InterestProfile(rules: [rule("premier-league-2026-27", "Premier League 2026/27")])
        let lens = NewsLens(profile: profile, index: index)
        XCTAssertTrue(lens.followedEntityIds.contains("premier-league"))
        let item = NewsItem(id: "n1", title: "Liverpool vinner", link: "https://x", source: "NRK",
                            sport: "football", entityIds: ["premier-league"])
        XCTAssertTrue(lens.matches(item))
    }

    // MARK: - The published index itself

    func test_theLivePublishedIndex_hasNoDeadStarterPackIds() {
        // The shipped starter packs are grounded against the LIVE index by
        // tests/starter-packs.test.js; here we assert the invariant this WP
        // introduced: a competition entity that was renamed always keeps its old
        // id resolvable, so no user's frozen rule can point at nothing.
        let live = AssistantTestSupport.liveIndex()
        let renamed = live.entities.filter { !$0.altIds.isEmpty }
        XCTAssertFalse(renamed.isEmpty, "the published index carries canonical competition ids with their former ids")
        for e in renamed {
            for alt in e.altIds {
                XCTAssertEqual(live.entity(id: alt)?.id, e.id, "\(alt) must still resolve to \(e.id)")
            }
        }
    }
}
