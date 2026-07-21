//
//  OnboardingCopyGroundingTests.swift
//  SportivistaTests
//
//  WP-164 (3) — the CI-vakt for the onboarding copy's promise: the converse
//  step advertises concrete example utterances («Liverpool», «sjakk når Carlsen
//  spiller»), and every CONCRETE entity name they name-drop must actually
//  ground against the entity index — otherwise the very first thing the copy
//  invites a user to say gets rejected. The copy renders from
//  `OnboardingExamples.converseIntro` and the guard replays
//  `OnboardingExamples.entityMentions` against the checked-in entities fixture,
//  so copy and guard can never drift apart.
//
//  The grounding basis is `EntityIndex.search` — the real assistant may only
//  use ids the `searchEntities` tool returns, so a followable search hit IS
//  what makes an example utterance groundable at runtime.
//

import XCTest

final class OnboardingCopyGroundingTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    /// Whether a mention can ground at runtime: a followable (non-sport,
    /// non-category) hit from the same search the FM tool exposes.
    private func grounds(_ mention: String) -> Bool {
        !index.search(mention).filter { $0.type != "sport" && $0.type != "category" }.isEmpty
    }

    func test_everyMentionAppearsInTheRenderedCopy() {
        for mention in OnboardingExamples.entityMentions {
            XCTAssertTrue(
                OnboardingExamples.converseIntro.contains(mention),
                "«\(mention)» is guarded but no longer in the copy — update OnboardingExamples.entityMentions"
            )
        }
    }

    func test_carlsenExample_groundsAgainstTheFixtureIndex() {
        XCTAssertTrue(grounds("Carlsen"), "the copy promises «sjakk når Carlsen spiller» — Carlsen must ground")
    }

    func test_liverpoolExample_groundsAgainstTheFixtureIndex() {
        XCTAssertTrue(grounds("Liverpool"), "the copy promises «Liverpool» — it must ground")
    }
}
