//
//  AssistantVocabTests.swift
//  SportivistaTests
//
//  Coherence gate mirroring tests/assistant-vocab.test.js: the BUNDLED
//  assistant-vocab.json (AssistantVocab.shared) must equal the Swift `fallback`,
//  so the fallback can't silently drift from the shared file. If this fails, the
//  .json and AssistantVocab.fallback diverged — reconcile them.
//

import XCTest

final class AssistantVocabTests: XCTestCase {
    func test_bundledMatchesFallback() {
        let shared = AssistantVocab.shared
        let fb = AssistantVocab.fallback
        XCTAssertEqual(shared.sportKeywords, fb.sportKeywords, "sportKeywords drifted from the fallback")
        XCTAssertEqual(shared.categories.keywords, fb.categories.keywords)
        XCTAssertEqual(shared.categories.members, fb.categories.members)
        XCTAssertEqual(shared.categories.display, fb.categories.display)
        XCTAssertEqual(shared.presentCues, fb.presentCues)
        XCTAssertEqual(shared.resetWords, fb.resetWords)
        XCTAssertEqual(shared.windowTokens, fb.windowTokens)
    }

    func test_categoryExpansionAndWindowsResolve() {
        // A couple of sanity anchors that the vocab drives real behaviour.
        XCTAssertEqual(SportVocabulary.keywordToSport["counterstrike"], "esports")
        XCTAssertEqual(SportVocabulary.categoryToSports["winter-sports"]?.sorted(),
                       ["alpine", "biathlon", "cross-country", "nordic", "ski jumping"])
    }
}
