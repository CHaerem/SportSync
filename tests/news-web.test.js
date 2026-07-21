// news-web.test.js — the Nyheter board's pure lens helpers (app-parity, WP-154).
// Mirrors NewsLens.swift: entityId hit OR followed whole-sport; empty profile is
// catalog-wide. The DOM rendering (renderNyheter/bindRootTabs) is a thin Dashboard
// prototype extension covered by the client render tests; here we pin the lens.

import { describe, it, expect } from "vitest";
import { ssNewsRelevant, ssCanonicalNewsSport } from "../docs/js/news-web.js";

describe("ssCanonicalNewsSport", () => {
	it("folds aliases and lowercases", () => {
		expect(ssCanonicalNewsSport("formula1")).toBe("f1");
		expect(ssCanonicalNewsSport("motorsport")).toBe("f1");
		expect(ssCanonicalNewsSport("soccer")).toBe("football");
		expect(ssCanonicalNewsSport("Football")).toBe("football");
		expect(ssCanonicalNewsSport(" Golf ")).toBe("golf");
	});
	it("is empty-safe", () => {
		expect(ssCanonicalNewsSport("")).toBe("");
		expect(ssCanonicalNewsSport(null)).toBe("");
		expect(ssCanonicalNewsSport(undefined)).toBe("");
	});
});

describe("ssNewsRelevant", () => {
	const item = (over) => ({ sport: "football", entityIds: [], ...over });

	it("empty/catalog-wide lens shows everything", () => {
		expect(ssNewsRelevant(item(), { catalogWide: true })).toBe(true);
		expect(ssNewsRelevant(item(), null)).toBe(true);
	});

	it("matches on an entityId the profile follows", () => {
		const lens = { entityIds: new Set(["viktor-hovland"]), sports: new Set() };
		expect(ssNewsRelevant(item({ sport: "golf", entityIds: ["viktor-hovland"] }), lens)).toBe(true);
		expect(ssNewsRelevant(item({ sport: "golf", entityIds: ["someone-else"] }), lens)).toBe(false);
	});

	it("matches on a followed WHOLE-sport (alias-normalised)", () => {
		const lens = { entityIds: new Set(), sports: new Set(["f1"]) };
		expect(ssNewsRelevant(item({ sport: "formula1", entityIds: [] }), lens)).toBe(true);
		expect(ssNewsRelevant(item({ sport: "golf", entityIds: [] }), lens)).toBe(false);
	});

	it("an athlete follow does NOT open the whole sport (id-scoped, mirrors NewsLens)", () => {
		// Following Hovland (an entity id, no sport rule) admits golf news that NAMES
		// him (stamped id), not every golf headline.
		const lens = { entityIds: new Set(["viktor-hovland"]), sports: new Set() };
		expect(ssNewsRelevant(item({ sport: "golf", entityIds: [] }), lens)).toBe(false);
	});
});
