// assistant-vocab.test.js — coherence gate for the SHARED assistant vocabulary.
// docs/config/assistant-vocab.json is read by the web (assistant.js) AND bundled
// into iOS (AssistantVocab.swift). This pins the web's baked-in fallback to the
// shared file, so a keyword added to the JSON without updating the fallback (or
// vice versa) fails CI. The iOS side is pinned by AgendaFilterTests running the
// BUNDLED file; a Swift assertion (AssistantVocabTests) pins its fallback too.

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

const vocab = JSON.parse(fs.readFileSync(
	path.resolve(process.cwd(), "docs", "config", "assistant-vocab.json"), "utf-8"));

let W;
beforeAll(() => {
	const sandbox = createClientSandbox();
	loadClientScript(sandbox, "shared-constants.js");
	loadClientScript(sandbox, "lens.js");
	loadClientScript(sandbox, "assistant.js");
	W = sandbox.window;
});

describe("assistant-vocab.json ↔ web baked-in fallback", () => {
	it("the web fallback matches the shared JSON field-for-field", () => {
		const d = W.ssAssistantVocab(null); // → SS_A_VOCAB_DEFAULTS
		expect(d.sportKeywords).toEqual(vocab.sportKeywords);
		expect(d.categories).toEqual(vocab.categories);
		expect(d.presentCues).toEqual(vocab.presentCues);
		expect(d.resetWords).toEqual(vocab.resetWords);
		expect(d.windowTokens).toEqual(vocab.windowTokens);
	});

	it("the assistant consumes a passed-in vocab (proves the wiring, not just the fallback)", () => {
		expect(W.ssASportKeywords({ sportKeywords: { pingpong: "tabletennis" } })).toEqual({ pingpong: "tabletennis" });
		const tokenSet = new Set(["søndag", "helga"]);
		expect(W.ssADetectWindow(tokenSet, { windowTokens: { "this-weekend": ["helga"] } })).toBe("this-weekend");
	});
});
