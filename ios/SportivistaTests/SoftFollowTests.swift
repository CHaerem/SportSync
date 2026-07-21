//
//  SoftFollowTests.swift
//  SportivistaTests
//
//  WP-164 — soft-follow («Følg likevel»): a NAME outside the entity index can
//  still be followed. Proves the whole pure chain with no model and no app:
//
//    • the deterministic soft id (same name ⇒ same id on every device, so the
//      CRDT profile sync converges instead of duplicating);
//    • navneregel-KOMPILERING: the name rule folds into the effective interests
//      (athlete bucket) and pulls a name-matched event onto the board — the
//      downstream matching was already name-tolerant, soft-follow just uses it;
//    • the notify-default fix: an UNKNOWN entity type gets a NEUTRAL
//      notify:false instead of inheriting the athlete bucket's bell default,
//      while a known athlete keeps the bucket default;
//    • the view-model arm (mock, 0E-regelen): a grounder REJECTION offers the
//      soft-follow as an explicit user choice — the anti-hallucination gate is
//      untouched, the user's tap creates the rule and clears the rejection.
//

import XCTest

@MainActor
final class SoftFollowTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    private func makeVM(store: ProfileStore? = nil) -> AssistantViewModel {
        AssistantViewModel(
            assistant: MockInterestAssistant(behavior: .available),
            profileStore: store ?? AssistantTestSupport.tempProfileStore(),
            index: self.index,
            misunderstoodLog: AssistantTestSupport.tempMisunderstoodLog()
        )
    }

    // MARK: - The deterministic soft id

    func test_softFollowId_isDeterministicSlug() {
        XCTAssertEqual(InterestRule.softFollowId(for: "Liverpool"), "soft-liverpool")
        XCTAssertEqual(InterestRule.softFollowId(for: "Erling Haaland"), "soft-erling-haaland")
        // Diacritics normalise the same way TextMatch does everywhere else.
        XCTAssertEqual(InterestRule.softFollowId(for: "Vålerenga"), "soft-valerenga")
        // Same name, same id — whitespace/case never forks the CRDT.
        XCTAssertEqual(
            InterestRule.softFollowId(for: "  liverpool "),
            InterestRule.softFollowId(for: "Liverpool")
        )
    }

    func test_isSoftFollow_flagsOnlySoftIds() {
        let soft = InterestRule(entityId: "soft-liverpool", entityName: "Liverpool", sport: "", weight: 0.5, reason: "r", addedAt: Date())
        let real = InterestRule(entityId: "fk-lyn-oslo", entityName: "Lyn", sport: "football", weight: 0.5, reason: "r", addedAt: Date())
        XCTAssertTrue(soft.isSoftFollow)
        XCTAssertFalse(real.isSoftFollow)
    }

    // MARK: - The view-model apply path

    func test_softFollow_createsNameRule_throughTheOneApplyPath() {
        let store = AssistantTestSupport.tempProfileStore()
        let vm = makeVM(store: store)

        XCTAssertTrue(vm.softFollow(name: "Liverpool"))

        let rule = vm.profile.rule(for: "soft-liverpool")
        XCTAssertNotNil(rule)
        XCTAssertEqual(rule?.entityName, "Liverpool")
        XCTAssertTrue(rule?.isSoftFollow ?? false)
        XCTAssertFalse(rule?.reason.isEmpty ?? true, "the transparency contract: always a Norwegian reason")
        XCTAssertTrue(vm.isFollowing("soft-liverpool"))
        // Persisted through the same store the diff/confirm path uses.
        XCTAssertNotNil(store.load().rule(for: "soft-liverpool"))
        // Upsert semantics: soft-following the same name twice is one rule.
        XCTAssertTrue(vm.softFollow(name: "liverpool "))
        XCTAssertEqual(vm.profile.rules.filter(\.isSoftFollow).count, 1)
    }

    func test_softFollow_rejectsEmptyName() {
        let vm = makeVM()
        XCTAssertFalse(vm.softFollow(name: "   "))
        XCTAssertTrue(vm.profile.isEmpty)
    }

    // MARK: - Navneregel-kompilering (the downstream name tolerance, proven)

    private func softRule(_ name: String) -> InterestRule {
        InterestRule(
            entityId: InterestRule.softFollowId(for: name), entityName: name,
            sport: "", weight: 0.5, reason: "test", addedAt: Date()
        )
    }

    func test_merge_softRule_landsInAthleteBucket_withNeutralNotify() {
        let profile = InterestProfile(rules: [softRule("Liverpool")])
        let merged = EffectiveInterests.merge(profile: profile, into: Interests(), index: index)

        let entry = merged.alwaysTrack.athletes.first { $0.name == "Liverpool" }
        XCTAssertNotNil(entry, "an unknown-type name rule matches from the athlete bucket")
        XCTAssertEqual(entry?.notify, false,
                       "WP-164: an unknown type gets a NEUTRAL notify — never the bucket's bell default")
        // And therefore never arms the bell:
        XCTAssertFalse(FeedCompiler.notifyEntities(merged).contains { $0.name == "Liverpool" })
    }

    func test_merge_knownAthlete_keepsBucketNotifyDefault() {
        let entity = index.entity(id: "casper-ruud")!
        let profile = InterestProfile().applying(GroundedMutation(
            kind: .add, entity: entity, scope: nil, weight: 0.5, reason: "test", previousRule: nil
        ))
        let merged = EffectiveInterests.merge(profile: profile, into: Interests(), index: index)

        let entry = merged.alwaysTrack.athletes.first { $0.name == "Casper Ruud" }
        XCTAssertNil(entry?.notify, "a KNOWN athlete keeps the bucket default (nil ⇒ notify:true)")
        XCTAssertTrue(FeedCompiler.notifyEntities(merged).contains { $0.name == "Casper Ruud" })
    }

    func test_softFollow_bringsNameMatchedEventOntoTheBoard() {
        let now = AssistantTestSupport.iso("2026-07-21T09:00:00Z")
        // A handball match — handball is not followed broadly and «Storhamar» is
        // NOT in the entity index. Invisible before the soft-follow.
        let event = EventBuilder.make(
            sport: "handball", title: "Storhamar – Sola", time: "2026-07-21T18:00:00Z",
            homeTeam: "Storhamar", awayTeam: "Sola", id: "e-storhamar"
        )
        XCTAssertNil(index.entity(id: InterestRule.softFollowId(for: "Storhamar")))

        let before = FeedQuery.build(events: [event], interests: Interests(), now: now)
        XCTAssertTrue(before.events.isEmpty, "an unfollowed handball match is not on the board")

        let effective = EffectiveInterests.merge(
            profile: InterestProfile(rules: [softRule("Storhamar")]), into: Interests(), index: index
        )
        let after = FeedQuery.build(events: [event], interests: effective, now: now)
        XCTAssertEqual(after.events.map(\.title), ["Storhamar – Sola"],
                       "the name rule compiles into the effective interests and matches by name")
    }

    // MARK: - The rejection arm (mock — 0E-regelen)

    func test_softFollowFromRejection_createsRuleAndClearsRejection() async {
        let vm = makeVM()
        vm.utterance = "Følg quidditch"
        await vm.submit()
        XCTAssertEqual(vm.rejected.count, 1, "the unknown name is rejected — the gate is untouched")
        let rejection = vm.rejected[0]
        XCTAssertEqual(rejection.proposal.kind, .add)
        XCTAssertTrue(rejection.explanation.contains("likevel"),
                      "the rejection copy names the honest way out")

        XCTAssertTrue(vm.softFollow(from: rejection))

        XCTAssertTrue(vm.rejected.isEmpty, "the rejection is answered, not left dangling")
        let rule = vm.profile.rules.first { $0.isSoftFollow }
        XCTAssertNotNil(rule)
        XCTAssertEqual(rule?.entityName.lowercased(), "quidditch")
        // The stale «ingen endring»-account is replaced by an honest receipt.
        XCTAssertNil(vm.explanation, "«jeg endret ingenting» would now be untrue")
        XCTAssertTrue(vm.commandReceipt?.contains("venter på dekning") ?? false,
                      "a calm receipt says what happened instead")
    }

    func test_rejectionText_offersSoftFollowOnlyForAdd() {
        // A rejected FOLLOW names the way out …
        let add = MutationGrounder.rejectionText(query: "quidditch", suggestions: [], offerSoftFollow: true)
        XCTAssertTrue(add.contains("Fant ikke"))
        XCTAssertTrue(add.contains("likevel"))
        // … a rejected REMOVE (or the default) never suggests following.
        let remove = MutationGrounder.rejectionText(query: "quidditch", suggestions: [])
        XCTAssertTrue(remove.contains("Fant ikke"))
        XCTAssertFalse(remove.contains("likevel"))
    }

    func test_ground_rejectedRemove_doesNotOfferSoftFollow() {
        let proposal = ProposedMutation(kind: .remove, entityId: "", entityQuery: "quidditch", reason: "slutt")
        let result = MutationGrounder.ground([proposal], index: index, profile: InterestProfile())
        XCTAssertEqual(result.rejected.count, 1)
        XCTAssertFalse(result.rejected[0].explanation.contains("likevel"),
                       "only a rejected FOLLOW offers the soft-follow")
    }
}
