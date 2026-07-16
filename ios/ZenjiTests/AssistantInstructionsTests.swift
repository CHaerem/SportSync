//
//  AssistantInstructionsTests.swift
//  ZenjiTests
//
//  WP-71 — the prompt-budget tripwire. WP-66/67/68 each grew the on-device
//  assistant's system prompt until it (plus the @Generable schema and the tool
//  descriptions) overran the 4096-token context, and the real-FM eval collapsed
//  with ~95 «Context length of 4096 was exceeded». That was caught FIRST in a
//  25-minute device eval — far too late. These tests cap each phase's FIXED
//  prompt so the next package that inflates one fails HERE, in CI, in
//  milliseconds instead. See `AssistantInstructions` for the token-budget
//  assumption behind the character caps.
//
//  They also assert the split prompts still NAME every capability arm — the
//  budget must be met by tightening prose and splitting phases, never by
//  dropping an arm.
//

import XCTest

final class AssistantInstructionsTests: XCTestCase {

    /// The tool-less phase-1 classifier prompt must stay tiny.
    func test_classifier_staysUnderBudget() {
        XCTAssertLessThanOrEqual(
            AssistantInstructions.classifier.count, AssistantInstructions.classifierBudget,
            "Klassifiser-prompten er over budsjettet (\(AssistantInstructions.classifierBudget) tegn). Hold den terse (WP-71)."
        )
    }

    /// Every focused per-arm prompt (empty profile, no memory — the fixed part
    /// present on that arm's every generation) must stay under the arm budget.
    func test_eachArmPrompt_staysUnderBudget() {
        let empty = InterestProfile()
        let prompts: [(String, String)] = [
            ("mutations", AssistantInstructions.mutations(profile: empty)),
            ("answer", AssistantInstructions.answer(profile: empty)),
            ("command", AssistantInstructions.command),
            ("present", AssistantInstructions.present)
        ]
        for (name, prompt) in prompts {
            XCTAssertLessThanOrEqual(
                prompt.count, AssistantInstructions.armBudget,
                "\(name)-prompten er \(prompt.count) tegn — over arm-budsjettet på \(AssistantInstructions.armBudget). " +
                "Komprimér (ikke fjern kapabilitet), eller hev budsjettet KUN med en eval som viser at 4096-konteksten holder (WP-71)."
            )
        }
    }

    /// The memory-loaded arms grow by a bounded block — sanity-check they stay
    /// within a small margin so a future memory-block change can't silently
    /// reintroduce the overflow.
    func test_memoryLoadedArms_stayWithinMargin() {
        let empty = InterestProfile()
        let digest = "MINNE OM BRUKER: ser F1 på opptak (ikke røp resultat)."
        for prompt in [AssistantInstructions.mutations(profile: empty, digest: digest, canSaveMemory: true),
                       AssistantInstructions.answer(profile: empty, digest: digest, canSaveMemory: true)] {
            XCTAssertLessThanOrEqual(
                prompt.count, AssistantInstructions.armBudget + 700,
                "Arm-prompten med minne-blokk er \(prompt.count) tegn — for stor. Hold minne-/save-blokkene kompakte (WP-71)."
            )
        }
    }

    /// The compression + split must not have dropped a capability: the
    /// classifier must name all four arms, and each arm must still carry its
    /// distinctive rules/tools.
    func test_prompts_nameEveryCapability() {
        for arm in ["mutations", "answer", "command", "present"] {
            XCTAssertTrue(AssistantInstructions.classifier.contains(arm), "klassifikatoren må nevne arm «\(arm)»")
        }
        let mut = AssistantInstructions.mutations(profile: InterestProfile())
        for token in ["searchEntities", "lens", "lensAthleteIds"] {
            XCTAssertTrue(mut.contains(token), "mutasjons-prompten må nevne «\(token)»")
        }
        let ans = AssistantInstructions.answer(profile: InterestProfile())
        for token in ["searchEvents", "getHelp", "getProfile", "referencedEventIds"] {
            XCTAssertTrue(ans.contains(token), "svar-prompten må nevne «\(token)»")
        }
        for token in ["theme", "reset", "onboarding", "share", "memory", "forget", "notifications", "open"] {
            XCTAssertTrue(AssistantInstructions.command.contains(token), "kommando-prompten må nevne «\(token)»")
        }
        XCTAssertTrue(AssistantInstructions.present.contains("presentFilter"), "present-prompten må nevne feltet «presentFilter»")
    }
}
