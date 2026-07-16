//
//  RealFMEvalTests.swift
//  ZenjiTests
//
//  Kjører eval-korpuset (WP-69) mot den EKTE FoundationModelsInterestAssistant
//  når maskinen som kjører testene har Apple Intelligence — Simulator proxyer
//  verts-Macens modell, så dette virker lokalt på en AI-aktivert Mac. På
//  CI-Macer uten Apple Intelligence skipper testen seg selv (XCTSkip), så
//  suiten forblir deterministisk grønn der.
//
//  RAPPORTERENDE, ikke asserterende: den ekte modellen er ikke-deterministisk,
//  så pass-terskler settes først når WP-65 har stabilisert bulk-fangsten.
//  Rapporten (samme JSON-format som enhets-skjermens delte rapport) printes
//  mellom REALFM-EVAL-REPORT-markørene og kan klippes rett ut av test-loggen.
//

import XCTest

final class RealFMEvalTests: XCTestCase {

	func test_realFM_corpusReport() async throws {
		// Opt-in: ~24 ekte genereringer tar 10+ min og er ikke-deterministiske,
		// så vanlige suite-kjøringer skal ikke betale for dem. Kjør med
		//   TEST_RUNNER_ZENJI_REALFM_EVAL=1 xcodebuild test … -only-testing:ZenjiTests/RealFMEvalTests
		guard ProcessInfo.processInfo.environment["ZENJI_REALFM_EVAL"] == "1" else {
			throw XCTSkip("Opt-in eval — sett TEST_RUNNER_ZENJI_REALFM_EVAL=1 for å kjøre mot ekte FM.")
		}
		let assistant = FoundationModelsInterestAssistant()
		guard assistant.availability().isAvailable else {
			throw XCTSkip("Apple Intelligence ikke tilgjengelig her — kjør på AI-aktivert Mac (Simulator) eller fysisk enhet.")
		}

		let corpus = try EvalCorpus.decode(Fixture.data("eval-corpus"))
		let index = AssistantTestSupport.liveIndex()
		let feed = AssistantTestSupport.liveFeed(now: corpus.clock)
		let runner = EvalRunner(assistant: assistant, index: index, feed: feed)

		let results = await runner.runAll(corpus)
		let report = EvalReport.make(
			results: results,
			corpusVersion: corpus.version,
			assistant: "foundation-models",
			available: true
		)

		let encoder = JSONEncoder()
		encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
		encoder.dateEncodingStrategy = .iso8601
		let json = String(data: try encoder.encode(report), encoding: .utf8) ?? "{}"
		print("REALFM-EVAL-REPORT-BEGIN")
		print(json)
		print("REALFM-EVAL-REPORT-END")

		for r in results where !r.passed {
			let failed = r.checks.filter { !$0.passed }
				.map { "\($0.label): \($0.detail)" }
				.joined(separator: " · ")
			print("REALFM-FAIL[\(r.knownGap ? "kjent-hull" : "eval")] \(r.caseId) («\(r.utterance)») — \(failed)")
		}

		// Eneste harde krav: hele korpuset ble kjørt og scoret.
		XCTAssertEqual(results.count, corpus.cases.count)
	}
}
