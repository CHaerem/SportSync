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
//  RAPPORTERENDE + terskel-voktende: den ekte modellen er ikke-deterministisk,
//  så pass-tersklene er «målt minus margin» (skal fange en EKTE regresjon —
//  ødelagt prompt/grounding/kontekst-overflow — ikke jage varians). Rapporten
//  (samme JSON-format som enhets-skjermens delte rapport) printes mellom
//  REALFM-EVAL-REPORT-markørene og kan klippes rett ut av test-loggen.
//
//  BILLIG ITERASJON (WP-71): full kjøring (55 cases) tar ~25 min. To DEBUG-
//  miljøfiltre lar deg måle en delmengde på minutter:
//    TEST_RUNNER_ZENJI_EVAL_CATEGORY=canon,command   → bare de kategoriene
//    TEST_RUNNER_ZENJI_EVAL_CASE=canon-1,cmd-theme    → bare de case-id-ene
//  (xcodebuild speiler TEST_RUNNER_<X> til miljøvariabelen <X> i testprosessen,
//  samme mekanikk som TEST_RUNNER_ZENJI_REALFM_EVAL over.) Rapportformatet er
//  uendret. Terskel-assertene kjører KUN på hele korpuset — en filtrert kjøring
//  er for iterasjon og rapporterer bare, den vokter ikke.
//

import XCTest

final class RealFMEvalTests: XCTestCase {

	// WP-71 — regresjonsterskler mot den EKTE modellen, re-kalibrert til
	// 55-case-korpuset (v4) ETTER prompt-budsjetteringen (to-fase-genereringen)
	// som fikset kontekst-overflowen. Målt 16.07.2026 (iPhone 17-simulator,
	// AI-aktivert Mac): 32/55 evaluert bestått, NULL kontekst-overflow (var ~95),
	// per kategori canon 6/12, multiPart 8/13, winter 0/2, present 6/6,
	// question 2/5, command 7/12, help 3/5 (en canon-delkjøring ga 7/12 — modellen
	// er ikke-deterministisk). Tersklene er «målt minus margin» (~20 %), ikke målt
	// verdi: de skal fange en EKTE regresjon (ødelagt prompt/grounding, gjeninnført
	// kontekst-overflow), ikke jage varians. 25/55 (~45 %) holder samme gulv-
	// proporsjon som den gamle 15/32-terskelen (~47 %), godt under målt 58 %.
	private static let canonThreshold = 5      // målt 6–7, margin 1–2
	private static let totalThreshold = 25     // målt 32, margin 7 (~22 %)

	func test_realFM_corpusReport() async throws {
		// Opt-in: ~55 ekte genereringer tar ~25 min og er ikke-deterministiske,
		// så vanlige suite-kjøringer skal ikke betale for dem. Kjør med
		//   TEST_RUNNER_ZENJI_REALFM_EVAL=1 xcodebuild test … -only-testing:ZenjiTests/RealFMEvalTests
		let env = ProcessInfo.processInfo.environment
		guard env["ZENJI_REALFM_EVAL"] == "1" else {
			throw XCTSkip("Opt-in eval — sett TEST_RUNNER_ZENJI_REALFM_EVAL=1 for å kjøre mot ekte FM.")
		}
		// The raw on-device assistant — NOT wrapped in TimeoutInterestAssistant:
		// its deadline cancels the in-flight generation, and cancelling a
		// FoundationModels inference mid-flight crashes the runtime (no report
		// ever prints). The budgeted instructions (WP-71) keep generations well
		// under the 4096-token context, which is the real fix for the stalls.
		let assistant = FoundationModelsInterestAssistant()
		guard assistant.availability().isAvailable else {
			throw XCTSkip("Apple Intelligence ikke tilgjengelig her — kjør på AI-aktivert Mac (Simulator) eller fysisk enhet.")
		}

		let fullCorpus = try EvalCorpus.decode(Fixture.data("eval-corpus"))

		// WP-71 — optional DEBUG filters for cheap single-category / single-case
		// iteration. A filtered run reports only; it never asserts a threshold.
		let categoryFilter = Self.csvSet(env["ZENJI_EVAL_CATEGORY"])
		let caseFilter = Self.csvSet(env["ZENJI_EVAL_CASE"])
		let isFiltered = categoryFilter != nil || caseFilter != nil
		let cases = fullCorpus.cases.filter { c in
			(categoryFilter?.contains(c.category) ?? true) && (caseFilter?.contains(c.id) ?? true)
		}
		XCTAssertFalse(cases.isEmpty, "Filteret matchet ingen cases — sjekk ZENJI_EVAL_CATEGORY/ZENJI_EVAL_CASE.")
		let corpus = EvalCorpus(version: fullCorpus.version, description: fullCorpus.description, clock: fullCorpus.clock, cases: cases)
		if isFiltered {
			let cat = categoryFilter.map { $0.sorted().joined(separator: ",") } ?? "*"
			let ids = caseFilter.map { $0.sorted().joined(separator: ",") } ?? "*"
			print("REALFM-EVAL-FILTER category=\(cat) case=\(ids) → \(cases.count) case(s)")
		}

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

		// Hele (filtrerte) korpuset ble kjørt og scoret.
		XCTAssertEqual(results.count, corpus.cases.count)

		// En filtrert kjøring er for iterasjon — den rapporterer bare.
		guard !isFiltered else {
			print("REALFM-EVAL filtrert kjøring — hopper over terskel-assertene.")
			return
		}

		// WP-71 — regresjonsterskler på HELE korpuset. On-device-modellen er
		// IKKE-deterministisk (enkle ytringer bommer av og til), så tersklene er
		// «målt minus margin», ikke målt verdi. De skal fange en EKTE regresjon
		// (ødelagt prompt/grounding, kontekst-overflow), ikke jage varians.
		let canonPassed = report.categories.first { $0.category == "canon" }?.passed ?? 0
		XCTAssertGreaterThanOrEqual(canonPassed, Self.canonThreshold, "canon-regresjon mot ekte FM (terskel \(Self.canonThreshold))")
		XCTAssertGreaterThanOrEqual(report.totals.passed, Self.totalThreshold, "total regresjon mot ekte FM (terskel \(Self.totalThreshold))")
	}

	/// Parse a `TEST_RUNNER_…=a,b,c` env value into a trimmed, non-empty set, or
	/// nil when the variable is absent/blank (⇒ "no filter, keep everything").
	private static func csvSet(_ raw: String?) -> Set<String>? {
		guard let raw else { return nil }
		let parts = raw.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
		return parts.isEmpty ? nil : Set(parts)
	}
}
