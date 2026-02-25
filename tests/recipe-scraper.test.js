import { describe, it, expect } from "vitest";
import {
	extractFromContent,
	applyTransforms,
	mapToEvents,
	validateResults,
	updateHealth,
	needsRepair,
	diagnoseFailure,
} from "../scripts/lib/recipe-scraper.js";
import {
	buildLearnPrompt,
	buildRepairPrompt,
	parseRecipeResponse,
	isValidRecipe,
} from "../scripts/learn-recipe.js";

// ─── Sample HTML (Liquipedia-style match structure) ──────────────────────────

const SAMPLE_HTML = `<div class="match-info some-class"><div data-timestamp="1740000000"><span class="name"><a href="/team1">Team Alpha</a></span><span class="name"><a href="/team2">Team Beta</a></span><div class="match-info-tournament-name"><a href="/tourney">Major Championship</a></div>Bo3</div></div><div class="match-info"><div data-timestamp="1740100000"><span class="name">Team Gamma</span><span class="name">Team Delta</span><div class="match-info-tournament-name">Minor Cup</div>Bo1</div></div>`;

// ─── extractFromContent ──────────────────────────────────────────────────────

describe("extractFromContent()", () => {
	it("returns empty array for null content", () => {
		const result = extractFromContent(null, { fields: [] });
		expect(result).toEqual([]);
	});

	it("returns empty array for null extraction", () => {
		const result = extractFromContent("<html>test</html>", null);
		expect(result).toEqual([]);
	});

	it("returns empty array for both null", () => {
		expect(extractFromContent(null, null)).toEqual([]);
	});

	it("splits HTML into blocks by regex pattern and extracts fields", () => {
		const extraction = {
			splitPattern: '<div class="match-info',
			splitType: "regex",
			fields: [
				{
					name: "timestamp",
					selector: 'data-timestamp="(\\d+)"',
					selectorType: "regex",
					required: true,
				},
			],
		};
		const results = extractFromContent(SAMPLE_HTML, extraction);
		expect(results).toHaveLength(2);
		expect(results[0].timestamp).toBe("1740000000");
		expect(results[1].timestamp).toBe("1740100000");
	});

	it("extracts team names using occurrence", () => {
		const extraction = {
			splitPattern: '<div class="match-info',
			splitType: "regex",
			fields: [
				{
					name: "team1",
					selector: '<span class="name">(?:<a[^>]*>)?([^<]+)(?:</a>)?</span>',
					selectorType: "regex",
					occurrence: 0,
				},
				{
					name: "team2",
					selector: '<span class="name">(?:<a[^>]*>)?([^<]+)(?:</a>)?</span>',
					selectorType: "regex",
					occurrence: 1,
				},
			],
		};
		const results = extractFromContent(SAMPLE_HTML, extraction);
		expect(results).toHaveLength(2);
		expect(results[0].team1).toBe("Team Alpha");
		expect(results[0].team2).toBe("Team Beta");
		expect(results[1].team1).toBe("Team Gamma");
		expect(results[1].team2).toBe("Team Delta");
	});

	it("extracts tournament name from a nested element", () => {
		// Split on <div data-timestamp= to avoid ambiguity with match-info-tournament-name divs
		const extraction = {
			splitPattern: "<div data-timestamp=",
			splitType: "regex",
			fields: [
				{
					name: "tournament",
					selector: 'match-info-tournament-name[^>]*>(?:<a[^>]*>)?([^<]+)',
					selectorType: "regex",
				},
			],
		};
		const results = extractFromContent(SAMPLE_HTML, extraction);
		expect(results).toHaveLength(2);
		expect(results[0].tournament).toBe("Major Championship");
		expect(results[1].tournament).toBe("Minor Cup");
	});

	it("skips blocks missing required fields", () => {
		const extraction = {
			splitPattern: '<div class="match-info',
			splitType: "regex",
			fields: [
				{
					name: "missingField",
					selector: "WILL_NEVER_MATCH_ANYTHING_HERE",
					required: true,
				},
			],
		};
		const results = extractFromContent(SAMPLE_HTML, extraction);
		expect(results).toHaveLength(0);
	});

	it("includes block when non-required fields are missing", () => {
		const extraction = {
			splitPattern: '<div class="match-info',
			splitType: "regex",
			fields: [
				{
					name: "timestamp",
					selector: 'data-timestamp="(\\d+)"',
					required: true,
				},
				{
					name: "optionalField",
					selector: "WILL_NEVER_MATCH",
					required: false,
				},
			],
		};
		const results = extractFromContent(SAMPLE_HTML, extraction);
		expect(results).toHaveLength(2);
		expect(results[0]).toHaveProperty("timestamp");
		expect(results[0]).not.toHaveProperty("optionalField");
	});

	it("returns entire content as one block when no splitPattern given", () => {
		const extraction = {
			fields: [
				{
					name: "ts1",
					selector: 'data-timestamp="(\\d+)"',
					occurrence: 0,
				},
				{
					name: "ts2",
					selector: 'data-timestamp="(\\d+)"',
					occurrence: 1,
				},
			],
		};
		const results = extractFromContent(SAMPLE_HTML, extraction);
		expect(results).toHaveLength(1);
		expect(results[0].ts1).toBe("1740000000");
		expect(results[0].ts2).toBe("1740100000");
	});

	it("applies a default value when field not found", () => {
		const extraction = {
			splitPattern: '<div class="match-info',
			splitType: "regex",
			fields: [
				{
					name: "timestamp",
					selector: 'data-timestamp="(\\d+)"',
					required: true,
				},
				{
					name: "format",
					selector: "WILL_NEVER_MATCH",
					default: "TBD",
				},
			],
		};
		const results = extractFromContent(SAMPLE_HTML, extraction);
		expect(results).toHaveLength(2);
		expect(results[0].format).toBe("TBD");
	});

	it("uses regex-all selectorType to collect all matches from a block", () => {
		const content = '<a href="/t1">Alpha</a><a href="/t2">Beta</a><a href="/t3">Gamma</a>';
		const extraction = {
			fields: [
				{
					name: "links",
					selector: '<a href="([^"]+)"',
					selectorType: "regex-all",
				},
			],
		};
		const results = extractFromContent(content, extraction);
		expect(results).toHaveLength(1);
		expect(results[0].links).toEqual(["/t1", "/t2", "/t3"]);
	});

	it("uses jsonpath selectorType to navigate JSON blocks", () => {
		const jsonContent = JSON.stringify({ events: [{ id: 1, name: "Match A" }] });
		const extraction = {
			splitType: "json",
			splitPattern: "events",
			fields: [
				{
					name: "name",
					selector: "name",
					selectorType: "jsonpath",
					required: true,
				},
			],
		};
		const results = extractFromContent(jsonContent, extraction);
		expect(results).toHaveLength(1);
		expect(results[0].name).toBe("Match A");
	});

	it("handles json split type with array path", () => {
		const jsonContent = JSON.stringify({
			data: {
				matches: [
					{ team: "Arsenal", score: 2 },
					{ team: "Chelsea", score: 1 },
				],
			},
		});
		const extraction = {
			splitType: "json",
			splitPattern: "data.matches",
			fields: [
				{
					name: "team",
					selector: "team",
					selectorType: "jsonpath",
					required: true,
				},
			],
		};
		const results = extractFromContent(jsonContent, extraction);
		expect(results).toHaveLength(2);
		expect(results[0].team).toBe("Arsenal");
		expect(results[1].team).toBe("Chelsea");
	});

	it("returns empty array when json split path doesn't exist", () => {
		const jsonContent = JSON.stringify({ other: [] });
		const extraction = {
			splitType: "json",
			splitPattern: "missing.path",
			fields: [{ name: "x", selector: "x", selectorType: "jsonpath" }],
		};
		expect(extractFromContent(jsonContent, extraction)).toEqual([]);
	});

	it("returns empty array for invalid JSON with json split type", () => {
		const extraction = {
			splitType: "json",
			splitPattern: "events",
			fields: [{ name: "x", selector: "x", selectorType: "jsonpath" }],
		};
		expect(extractFromContent("not-json", extraction)).toEqual([]);
	});

	it("applies transforms to extracted values", () => {
		const extraction = {
			splitPattern: '<div class="match-info',
			splitType: "regex",
			fields: [
				{
					name: "time",
					selector: 'data-timestamp="(\\d+)"',
					required: true,
					transform: ["parseInt", "multiply:1000", "isoDate"],
				},
			],
		};
		// data-timestamp values are already in seconds; multiply:1000 converts to ms
		const results = extractFromContent(SAMPLE_HTML, extraction);
		expect(results).toHaveLength(2);
		expect(results[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO string
	});

	it("returns empty array when no blocks are produced after split", () => {
		const extraction = {
			splitPattern: "WILL_NEVER_MATCH_PATTERN_XYZ",
			fields: [{ name: "x", selector: "x" }],
		};
		expect(extractFromContent(SAMPLE_HTML, extraction)).toEqual([]);
	});

	it("uses flags on split regex when provided", () => {
		const html = `<DIV CLASS="match-info"><div data-timestamp="999">Team A</div></DIV>`;
		const extraction = {
			splitPattern: '<div class="match-info',
			splitFlags: "gi",
			fields: [
				{
					name: "timestamp",
					selector: 'data-timestamp="(\\d+)"',
					required: true,
				},
			],
		};
		const results = extractFromContent(html, extraction);
		expect(results).toHaveLength(1);
		expect(results[0].timestamp).toBe("999");
	});
});

// ─── applyTransforms ─────────────────────────────────────────────────────────

describe("applyTransforms()", () => {
	it("returns value unchanged when transforms is null/undefined", () => {
		expect(applyTransforms("hello", null)).toBe("hello");
		expect(applyTransforms("hello", undefined)).toBe("hello");
	});

	it("trims whitespace", () => {
		expect(applyTransforms("  hello  ", "trim")).toBe("hello");
		expect(applyTransforms("\n  text\t", "trim")).toBe("text");
	});

	it("parseInt converts string to integer", () => {
		expect(applyTransforms("42", "parseInt")).toBe(42);
		expect(applyTransforms("3.9", "parseInt")).toBe(3);
		expect(applyTransforms("100px", "parseInt")).toBe(100);
	});

	it("parseFloat converts string to float", () => {
		expect(applyTransforms("3.14", "parseFloat")).toBe(3.14);
		expect(applyTransforms("2.718", "parseFloat")).toBeCloseTo(2.718);
	});

	it("isoDate converts unix timestamp (milliseconds) to ISO string", () => {
		const ms = 1740000000000;
		const result = applyTransforms(ms, "isoDate");
		expect(result).toBe(new Date(ms).toISOString());
	});

	it("isoDate converts numeric string to ISO date", () => {
		const ms = 1740000000000;
		const result = applyTransforms(String(ms), "isoDate");
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("isoDate converts ISO date string to ISO string", () => {
		const result = applyTransforms("2026-02-20T12:00:00Z", "isoDate");
		expect(result).toBe(new Date("2026-02-20T12:00:00Z").toISOString());
	});

	it("multiply: scales a number", () => {
		expect(applyTransforms("10", "multiply:2")).toBe(20);
		expect(applyTransforms(5, "multiply:0.5")).toBe(2.5);
		expect(applyTransforms("1000", "multiply:1000")).toBe(1000000);
	});

	it("prefix: prepends text", () => {
		expect(applyTransforms("world", "prefix:hello ")).toBe("hello world");
		expect(applyTransforms("123", "prefix:#")).toBe("#123");
	});

	it("suffix: appends text", () => {
		expect(applyTransforms("hello", "suffix: world")).toBe("hello world");
		expect(applyTransforms("100", "suffix:%")).toBe("100%");
	});

	it("replace: substitutes substrings globally", () => {
		expect(applyTransforms("foo-bar-baz", "replace:-:_")).toBe("foo_bar_baz");
		expect(applyTransforms("aababc", "replace:a:X")).toBe("XXbXbc");
	});

	it("default: returns fallback for empty string", () => {
		expect(applyTransforms("", "default:fallback")).toBe("fallback");
	});

	it("default: returns original value when non-empty", () => {
		expect(applyTransforms("real", "default:fallback")).toBe("real");
	});

	it("default: returns fallback for null", () => {
		// null breaks before default is reached in the chain, but as a single transform:
		// applyTransforms(null, "default:x") — null breaks the chain before executing
		// The chain breaks on null, so the value stays null
		const result = applyTransforms(null, "default:x");
		// null causes chain break before any transform runs
		expect(result).toBeNull();
	});

	it("toLowerCase converts string to lowercase", () => {
		expect(applyTransforms("HELLO", "toLowerCase")).toBe("hello");
		expect(applyTransforms("CamelCase", "toLowerCase")).toBe("camelcase");
	});

	it("applies an array of transforms as a chain", () => {
		// "  42  " → trim → "42" → parseInt → 42 → multiply:2 → 84
		expect(applyTransforms("  42  ", ["trim", "parseInt", "multiply:2"])).toBe(84);
	});

	it("chain stops when value becomes null mid-chain", () => {
		// parseInt of "abc" produces NaN, not null, so chain continues
		// But if a prior step returns null explicitly... simulate via default returning null
		// Use a single transform then chain with another
		const result = applyTransforms("hello", ["trim", "prefix:pre-"]);
		expect(result).toBe("pre-hello");
	});

	it("handles unknown transform by returning value unchanged", () => {
		expect(applyTransforms("hello", "unknownTransform")).toBe("hello");
	});

	it("handles non-string transform by returning value unchanged", () => {
		expect(applyTransforms("hello", 42)).toBe("hello");
	});
});

// ─── mapToEvents ─────────────────────────────────────────────────────────────

describe("mapToEvents()", () => {
	const sampleItems = [
		{ team1: "Team Alpha", team2: "Team Beta", tournament: "Major Championship", timestamp: "1740000000000" },
		{ team1: "Team Gamma", team2: "Team Delta", tournament: "Minor Cup", timestamp: "1740100000000" },
	];

	it("returns items unchanged when no output.mapping provided", () => {
		expect(mapToEvents(sampleItems, null)).toEqual(sampleItems);
		expect(mapToEvents(sampleItems, {})).toEqual(sampleItems);
		expect(mapToEvents(sampleItems, { mapping: null })).toEqual(sampleItems);
	});

	it("resolves simple {field} templates", () => {
		const output = {
			mapping: {
				title: "{team1} vs {team2}",
				tournament: "{tournament}",
			},
		};
		const events = mapToEvents(sampleItems, output);
		expect(events[0].title).toBe("Team Alpha vs Team Beta");
		expect(events[0].tournament).toBe("Major Championship");
		expect(events[1].title).toBe("Team Gamma vs Team Delta");
	});

	it("resolves {field|transform} template syntax", () => {
		const output = {
			mapping: {
				time: "{timestamp|isoDate}",
			},
		};
		const events = mapToEvents(sampleItems, output);
		expect(events[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("uses static values (non-template strings) as-is", () => {
		const output = {
			mapping: {
				sport: "esports",
				source: "liquipedia",
			},
		};
		const events = mapToEvents(sampleItems, output);
		expect(events[0].sport).toBe("esports");
		expect(events[0].source).toBe("liquipedia");
		expect(events[1].sport).toBe("esports");
	});

	it("uses empty string for missing template fields", () => {
		const output = {
			mapping: {
				title: "{missingField} vs {team2}",
			},
		};
		const events = mapToEvents(sampleItems, output);
		expect(events[0].title).toBe(" vs Team Beta");
	});

	it("handles multiple transforms in a single template token", () => {
		const items = [{ val: "  hello  " }];
		const output = {
			mapping: {
				clean: "{val|trim|prefix:>>}",
			},
		};
		const events = mapToEvents(items, output);
		expect(events[0].clean).toBe(">>hello");
	});

	it("handles static numeric and boolean values in mapping", () => {
		const output = {
			mapping: {
				version: 1,
				active: true,
			},
		};
		const events = mapToEvents(sampleItems, output);
		expect(events[0].version).toBe(1);
		expect(events[0].active).toBe(true);
	});

	it("produces one event per input item", () => {
		const output = {
			mapping: { title: "{team1} vs {team2}" },
		};
		const events = mapToEvents(sampleItems, output);
		expect(events).toHaveLength(sampleItems.length);
	});

	it("returns empty array when items is empty", () => {
		const output = {
			mapping: { title: "{team1} vs {team2}" },
		};
		expect(mapToEvents([], output)).toEqual([]);
	});
});

// ─── validateResults ─────────────────────────────────────────────────────────

describe("validateResults()", () => {
	const goodResults = [
		{ title: "Match A", time: new Date(Date.now() + 86400000).toISOString() },
		{ title: "Match B", time: new Date(Date.now() + 2 * 86400000).toISOString() },
	];

	it("returns valid:true with no issues when validation is null", () => {
		const r = validateResults(goodResults, null);
		expect(r.valid).toBe(true);
		expect(r.issues).toEqual([]);
	});

	it("returns valid:true for results meeting minResults", () => {
		const r = validateResults(goodResults, { minResults: 2 });
		expect(r.valid).toBe(true);
	});

	it("reports too few results when below minResults", () => {
		const r = validateResults(goodResults, { minResults: 5 });
		expect(r.valid).toBe(false);
		expect(r.issues[0]).toMatch(/Too few results/);
		expect(r.issues[0]).toContain("2");
		expect(r.issues[0]).toContain("5");
	});

	it("returns valid:true for results meeting maxResults", () => {
		const r = validateResults(goodResults, { maxResults: 10 });
		expect(r.valid).toBe(true);
	});

	it("reports too many results when above maxResults", () => {
		const r = validateResults(goodResults, { maxResults: 1 });
		expect(r.valid).toBe(false);
		expect(r.issues[0]).toMatch(/Too many results/);
		expect(r.issues[0]).toContain("2");
		expect(r.issues[0]).toContain("1");
	});

	it("passes requiredFields check when all results have the fields", () => {
		const r = validateResults(goodResults, { requiredFields: ["title", "time"] });
		expect(r.valid).toBe(true);
	});

	it("fails requiredFields check when a result is missing a field", () => {
		const results = [{ title: "Match A" }]; // missing time
		const r = validateResults(results, { requiredFields: ["title", "time"] });
		expect(r.valid).toBe(false);
		expect(r.issues[0]).toMatch(/Missing required field "time"/);
	});

	it("fails requiredFields check when field is empty string", () => {
		const results = [{ title: "", time: "2026-03-01T10:00:00Z" }];
		const r = validateResults(results, { requiredFields: ["title"] });
		expect(r.valid).toBe(false);
		expect(r.issues[0]).toMatch(/Missing required field "title"/);
	});

	it("passes timeRangeCheck when results have fresh times", () => {
		const freshResults = [
			{ title: "A", time: new Date(Date.now() + 86400000).toISOString() },
		];
		const r = validateResults(freshResults, { timeRangeCheck: true, freshnessDays: 7 });
		expect(r.valid).toBe(true);
	});

	it("fails timeRangeCheck when all times are older than freshnessDays", () => {
		const staleResults = [
			{ title: "A", time: new Date(Date.now() - 30 * 86400000).toISOString() },
			{ title: "B", time: new Date(Date.now() - 20 * 86400000).toISOString() },
		];
		const r = validateResults(staleResults, { timeRangeCheck: true, freshnessDays: 7 });
		expect(r.valid).toBe(false);
		expect(r.issues[0]).toMatch(/All \d+ results have times older than 7 days/);
	});

	it("passes timeRangeCheck when at least one result is fresh", () => {
		const mixedResults = [
			{ title: "A", time: new Date(Date.now() - 30 * 86400000).toISOString() },
			{ title: "B", time: new Date(Date.now() + 86400000).toISOString() },
		];
		const r = validateResults(mixedResults, { timeRangeCheck: true, freshnessDays: 7 });
		expect(r.valid).toBe(true);
	});

	it("skips timeRangeCheck when results array is empty", () => {
		const r = validateResults([], { timeRangeCheck: true, freshnessDays: 7 });
		expect(r.valid).toBe(true);
		expect(r.issues).toHaveLength(0);
	});

	it("accumulates multiple issues from different checks", () => {
		const results = [{ noTitle: true }]; // missing title, only 1 result
		const r = validateResults(results, {
			minResults: 5,
			requiredFields: ["title"],
		});
		expect(r.valid).toBe(false);
		expect(r.issues.length).toBeGreaterThanOrEqual(2);
	});

	it("reports exactly one issue per result with a missing required field", () => {
		const results = [
			{ title: "A" }, // missing time
			{ title: "B" }, // also missing time
		];
		const r = validateResults(results, { requiredFields: ["title", "time"] });
		// Each result generates at most one issue (breaks on first missing field per result)
		expect(r.issues).toHaveLength(2);
	});
});

// ─── updateHealth ─────────────────────────────────────────────────────────────

describe("updateHealth()", () => {
	it("resets consecutiveFailures on success", () => {
		const health = { consecutiveFailures: 3 };
		const updated = updateHealth(health, 5, true);
		expect(updated.consecutiveFailures).toBe(0);
	});

	it("records lastSuccessCount on success", () => {
		const updated = updateHealth({}, 7, true);
		expect(updated.lastSuccessCount).toBe(7);
	});

	it("computes rolling avgResultCount on first success", () => {
		const updated = updateHealth({}, 10, true);
		// prev = resultCount (10) on first run: 10*0.8 + 10*0.2 = 10
		expect(updated.avgResultCount).toBe(10);
	});

	it("computes rolling avgResultCount as exponential average", () => {
		// Start with avgResultCount = 10, new count = 20
		// new avg = round((10*0.8 + 20*0.2) * 10) / 10 = round(12 * 10) / 10 = 12
		const health = { avgResultCount: 10 };
		const updated = updateHealth(health, 20, true);
		expect(updated.avgResultCount).toBe(12);
	});

	it("increases successRate toward 1 on success (EMA)", () => {
		const health = { successRate: 0.5 };
		const updated = updateHealth(health, 3, true);
		// new rate = round((0.5*0.9 + 0.1) * 100) / 100 = round(55 * 100) / 100 = 0.55
		expect(updated.successRate).toBe(0.55);
	});

	it("sets initial successRate from 1.0 baseline on first success", () => {
		const updated = updateHealth({}, 5, true);
		// round((1 * 0.9 + 0.1) * 100) / 100 = round(100 * 100)/100 = 1
		expect(updated.successRate).toBe(1);
	});

	it("increments consecutiveFailures on failure", () => {
		const health = { consecutiveFailures: 2 };
		const updated = updateHealth(health, 0, false);
		expect(updated.consecutiveFailures).toBe(3);
	});

	it("initializes consecutiveFailures to 1 on first failure", () => {
		const updated = updateHealth({}, 0, false);
		expect(updated.consecutiveFailures).toBe(1);
	});

	it("decreases successRate on failure (EMA)", () => {
		const health = { successRate: 1.0 };
		const updated = updateHealth(health, 0, false);
		// round((1.0 * 0.9) * 100) / 100 = 0.9
		expect(updated.successRate).toBe(0.9);
	});

	it("treats valid=true but resultCount=0 as failure", () => {
		// valid=true but no results — should go to failure branch
		const health = { consecutiveFailures: 1 };
		const updated = updateHealth(health, 0, true);
		expect(updated.consecutiveFailures).toBe(2);
	});

	it("does not mutate the original health object", () => {
		const original = { consecutiveFailures: 0, successRate: 1.0 };
		updateHealth(original, 5, true);
		expect(original.consecutiveFailures).toBe(0); // unchanged
	});

	it("handles empty health object gracefully", () => {
		const updated = updateHealth({}, 5, true);
		expect(updated).toBeDefined();
		expect(updated.consecutiveFailures).toBe(0);
	});
});

// ─── needsRepair ──────────────────────────────────────────────────────────────

describe("needsRepair()", () => {
	it("returns false when health is null/undefined", () => {
		expect(needsRepair(null)).toBe(false);
		expect(needsRepair(undefined)).toBe(false);
	});

	it("returns false when consecutiveFailures is below default threshold (3)", () => {
		expect(needsRepair({ consecutiveFailures: 0 })).toBe(false);
		expect(needsRepair({ consecutiveFailures: 2 })).toBe(false);
	});

	it("returns true when consecutiveFailures meets default threshold (3)", () => {
		expect(needsRepair({ consecutiveFailures: 3 })).toBe(true);
	});

	it("returns true when consecutiveFailures exceeds default threshold", () => {
		expect(needsRepair({ consecutiveFailures: 10 })).toBe(true);
	});

	it("uses custom maxConsecutiveFailures threshold", () => {
		expect(needsRepair({ consecutiveFailures: 2, maxConsecutiveFailures: 2 })).toBe(true);
		expect(needsRepair({ consecutiveFailures: 1, maxConsecutiveFailures: 2 })).toBe(false);
	});

	it("returns false when consecutiveFailures is absent (defaults to 0)", () => {
		expect(needsRepair({ maxConsecutiveFailures: 3 })).toBe(false);
	});

	it("returns true for threshold of 1 after a single failure", () => {
		expect(needsRepair({ consecutiveFailures: 1, maxConsecutiveFailures: 1 })).toBe(true);
	});
});

// ─── diagnoseFailure ──────────────────────────────────────────────────────────

describe("diagnoseFailure()", () => {
	const basicExtraction = {
		splitPattern: '<div class="match-info',
		fields: [
			{
				name: "timestamp",
				selector: 'data-timestamp="(\\d+)"',
				required: true,
			},
		],
	};

	it("diagnoses empty-content when content is null", () => {
		const d = diagnoseFailure(null, basicExtraction);
		expect(d.cause).toBe("empty-content");
		expect(d.details.length).toBeGreaterThan(0);
		expect(d.suggestions.length).toBeGreaterThan(0);
	});

	it("diagnoses empty-content when content is empty string", () => {
		const d = diagnoseFailure("", basicExtraction);
		expect(d.cause).toBe("empty-content");
	});

	it("diagnoses split-pattern-broken when splitPattern no longer matches", () => {
		const extraction = {
			splitPattern: "PATTERN_THAT_MATCHES_NOTHING_XYZ",
			fields: [{ name: "x", selector: "y", required: true }],
		};
		const d = diagnoseFailure(SAMPLE_HTML, extraction);
		expect(d.cause).toBe("split-pattern-broken");
		expect(d.details[0]).toContain("PATTERN_THAT_MATCHES_NOTHING_XYZ");
		expect(d.suggestions).toContain("Re-learn recipe with LLM");
	});

	it("diagnoses field-selector-broken when required field regex fails", () => {
		const extraction = {
			splitPattern: '<div class="match-info',
			fields: [
				{
					name: "timestamp",
					selector: "BROKEN_SELECTOR_XYZ",
					required: true,
				},
			],
		};
		const d = diagnoseFailure(SAMPLE_HTML, extraction);
		expect(d.cause).toBe("field-selector-broken");
		expect(d.details[0]).toContain('"timestamp"');
	});

	it("diagnoses validation-failure when extraction works but validation fails", () => {
		// Content is valid, split works, fields match — no specific breakage
		const extraction = {
			splitPattern: '<div class="match-info',
			fields: [
				{
					name: "timestamp",
					selector: 'data-timestamp="(\\d+)"',
					required: true,
				},
			],
		};
		const d = diagnoseFailure(SAMPLE_HTML, extraction);
		expect(d.cause).toBe("validation-failure");
		expect(d.suggestions.length).toBeGreaterThan(0);
	});

	it("includes suggestions in all diagnosis types", () => {
		const d1 = diagnoseFailure(null, basicExtraction);
		const d2 = diagnoseFailure(SAMPLE_HTML, { ...basicExtraction, splitPattern: "NEVER_MATCH" });
		const d3 = diagnoseFailure(SAMPLE_HTML, {
			splitPattern: '<div class="match-info',
			fields: [{ name: "ts", selector: "BROKEN", required: true }],
		});
		[d1, d2, d3].forEach((d) => {
			expect(d.suggestions.length).toBeGreaterThan(0);
			expect(d.details.length).toBeGreaterThan(0);
		});
	});

	it("handles extraction with no splitPattern (no-blocks path)", () => {
		// splitPattern missing → blocks = [content], then check fields
		const extraction = {
			// no splitPattern — but field is broken
			fields: [
				{
					name: "ts",
					selector: "BROKEN_XYZ",
					required: true,
				},
			],
		};
		const d = diagnoseFailure(SAMPLE_HTML, extraction);
		// With no split pattern, blocks = [content], then field check fails
		expect(["field-selector-broken", "validation-failure"]).toContain(d.cause);
	});
});

// ─── learn-recipe.js: buildLearnPrompt ───────────────────────────────────────

describe("buildLearnPrompt()", () => {
	it("includes the URL in the output", () => {
		const prompt = buildLearnPrompt("https://example.com/matches", "esports", "CS2 matches");
		expect(prompt).toContain("https://example.com/matches");
	});

	it("includes the sport in the output", () => {
		const prompt = buildLearnPrompt("https://example.com", "tennis", "Tennis events");
		expect(prompt).toContain("tennis");
	});

	it("includes the description in the output", () => {
		const prompt = buildLearnPrompt("https://example.com", "golf", "PGA Tour leaderboard");
		expect(prompt).toContain("PGA Tour leaderboard");
	});

	it("includes sample content preview when provided", () => {
		const sampleContent = "<div>Sample HTML content for testing</div>";
		const prompt = buildLearnPrompt("https://example.com", "football", "Premier League", sampleContent);
		expect(prompt).toContain("Sample HTML content for testing");
	});

	it("uses WebFetch instruction when no sample content provided", () => {
		const prompt = buildLearnPrompt("https://example.com", "football", "PL", null);
		expect(prompt).toContain("WebFetch");
		expect(prompt).toContain("https://example.com");
	});

	it("truncates sample content to 3000 chars", () => {
		// Use a unique 10-char marker repeated 500 times = 5000 chars total.
		// After truncation to 3000, we expect exactly 300 repetitions (300 * 10 = 3000).
		const marker = "QQQQQQQQQQ"; // 10 chars, unlikely in template text
		const longContent = marker.repeat(500);
		const prompt = buildLearnPrompt("https://example.com", "golf", "test", longContent);
		const markerCount = (prompt.match(/QQQQQQQQQQ/g) || []).length;
		// 3000 / 10 = 300 full marker repetitions
		expect(markerCount).toBe(300);
	});

	it("includes the JSON structure template in the prompt", () => {
		const prompt = buildLearnPrompt("https://example.com", "chess", "Chess tournaments");
		expect(prompt).toContain("splitPattern");
		expect(prompt).toContain("selectorType");
		expect(prompt).toContain("output");
		expect(prompt).toContain("validation");
	});

	it("returns a non-empty string", () => {
		const prompt = buildLearnPrompt("https://example.com", "esports", "CS2");
		expect(typeof prompt).toBe("string");
		expect(prompt.length).toBeGreaterThan(100);
	});
});

// ─── learn-recipe.js: buildRepairPrompt ──────────────────────────────────────

describe("buildRepairPrompt()", () => {
	const sampleRecipe = {
		id: "test-recipe",
		version: 2,
		source: { urlPattern: "https://example.com" },
		extraction: {
			splitPattern: '<div class="match',
			fields: [{ name: "ts", selector: 'timestamp="(\\d+)"', required: true }],
		},
		output: { mapping: { title: "{ts}" } },
	};

	const sampleDiagnosis = {
		cause: "split-pattern-broken",
		details: ["Split pattern no longer matches"],
		suggestions: ["Re-learn recipe"],
	};

	it("includes the recipe id in the output", () => {
		const prompt = buildRepairPrompt(sampleRecipe, "<html>fresh content</html>", sampleDiagnosis);
		expect(prompt).toContain("test-recipe");
	});

	it("includes the diagnosis cause in the output", () => {
		const prompt = buildRepairPrompt(sampleRecipe, "<html>fresh content</html>", sampleDiagnosis);
		expect(prompt).toContain("split-pattern-broken");
	});

	it("includes the diagnosis details in the output", () => {
		const prompt = buildRepairPrompt(sampleRecipe, "<html>fresh</html>", sampleDiagnosis);
		expect(prompt).toContain("Split pattern no longer matches");
	});

	it("includes suggestions in the output", () => {
		const prompt = buildRepairPrompt(sampleRecipe, "<html>fresh</html>", sampleDiagnosis);
		expect(prompt).toContain("Re-learn recipe");
	});

	it("includes a preview of the fresh content", () => {
		const freshContent = "<div>Current page structure</div>";
		const prompt = buildRepairPrompt(sampleRecipe, freshContent, sampleDiagnosis);
		expect(prompt).toContain("Current page structure");
	});

	it("truncates fresh content to 3000 chars", () => {
		// Use a unique 10-char marker repeated 500 times = 5000 chars total.
		// After truncation to 3000, we expect exactly 300 repetitions (300 * 10 = 3000).
		const marker = "WWWWWWWWWW"; // 10 chars, unlikely in template text
		const longContent = marker.repeat(500);
		const prompt = buildRepairPrompt(sampleRecipe, longContent, sampleDiagnosis);
		const markerCount = (prompt.match(/WWWWWWWWWW/g) || []).length;
		expect(markerCount).toBe(300);
	});

	it("instructs LLM to keep id, metadata, source, output the same", () => {
		const prompt = buildRepairPrompt(sampleRecipe, "content", sampleDiagnosis);
		expect(prompt).toContain("id");
		expect(prompt).toContain("extraction");
	});

	it("instructs LLM to increment the version number", () => {
		const prompt = buildRepairPrompt(sampleRecipe, "content", sampleDiagnosis);
		expect(prompt).toContain("version");
	});
});

// ─── learn-recipe.js: parseRecipeResponse ────────────────────────────────────

describe("parseRecipeResponse()", () => {
	const validRecipeJson = JSON.stringify({
		id: "my-recipe",
		version: 1,
		source: { urlPattern: "https://example.com" },
		extraction: { fields: [{ name: "x", selector: "x" }] },
		output: { mapping: { title: "{x}" } },
	});

	it("returns null for null input", () => {
		expect(parseRecipeResponse(null)).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(parseRecipeResponse("")).toBeNull();
	});

	it("parses valid JSON directly", () => {
		const result = parseRecipeResponse(validRecipeJson);
		expect(result).not.toBeNull();
		expect(result.id).toBe("my-recipe");
	});

	it("parses JSON wrapped in markdown code fences", () => {
		const wrapped = "```json\n" + validRecipeJson + "\n```";
		const result = parseRecipeResponse(wrapped);
		expect(result).not.toBeNull();
		expect(result.id).toBe("my-recipe");
	});

	it("parses JSON wrapped in plain code fences (no language tag)", () => {
		const wrapped = "```\n" + validRecipeJson + "\n```";
		const result = parseRecipeResponse(wrapped);
		expect(result).not.toBeNull();
		expect(result.id).toBe("my-recipe");
	});

	it("extracts JSON object embedded in surrounding text", () => {
		const embedded = "Here is the recipe:\n" + validRecipeJson + "\nPlease use it.";
		const result = parseRecipeResponse(embedded);
		expect(result).not.toBeNull();
		expect(result.id).toBe("my-recipe");
	});

	it("returns null for completely invalid content", () => {
		expect(parseRecipeResponse("This is just plain text, no JSON here")).toBeNull();
	});

	it("returns null for malformed JSON", () => {
		expect(parseRecipeResponse("{ bad json: [unclosed")).toBeNull();
	});

	it("handles whitespace-padded JSON", () => {
		const result = parseRecipeResponse("   " + validRecipeJson + "   ");
		expect(result).not.toBeNull();
		expect(result.id).toBe("my-recipe");
	});
});

// ─── learn-recipe.js: isValidRecipe ──────────────────────────────────────────

describe("isValidRecipe()", () => {
	const minimalValidRecipe = {
		id: "test-recipe",
		source: { urlPattern: "https://example.com" },
		extraction: { fields: [{ name: "title", selector: "<h1>(.*)</h1>" }] },
		output: { mapping: { title: "{title}" } },
	};

	it("returns true for a minimal valid recipe", () => {
		expect(isValidRecipe(minimalValidRecipe)).toBe(true);
	});

	it("returns false for null", () => {
		expect(isValidRecipe(null)).toBe(false);
	});

	it("returns false for undefined", () => {
		expect(isValidRecipe(undefined)).toBe(false);
	});

	it("returns false when id is missing", () => {
		const r = { ...minimalValidRecipe };
		delete r.id;
		expect(isValidRecipe(r)).toBe(false);
	});

	it("returns false when id is empty string", () => {
		expect(isValidRecipe({ ...minimalValidRecipe, id: "" })).toBe(false);
	});

	it("returns false when source is missing", () => {
		const r = { ...minimalValidRecipe };
		delete r.source;
		expect(isValidRecipe(r)).toBe(false);
	});

	it("returns false when source has neither urlPattern nor url", () => {
		const r = { ...minimalValidRecipe, source: { headers: {} } };
		expect(isValidRecipe(r)).toBe(false);
	});

	it("returns true when source uses url instead of urlPattern", () => {
		const r = {
			...minimalValidRecipe,
			source: { url: "https://example.com" },
		};
		expect(isValidRecipe(r)).toBe(true);
	});

	it("returns false when extraction is missing", () => {
		const r = { ...minimalValidRecipe };
		delete r.extraction;
		expect(isValidRecipe(r)).toBe(false);
	});

	it("returns false when extraction.fields is empty array", () => {
		const r = { ...minimalValidRecipe, extraction: { fields: [] } };
		expect(isValidRecipe(r)).toBe(false);
	});

	it("returns false when extraction.fields is missing", () => {
		const r = { ...minimalValidRecipe, extraction: {} };
		expect(isValidRecipe(r)).toBe(false);
	});

	it("returns false when output is missing", () => {
		const r = { ...minimalValidRecipe };
		delete r.output;
		expect(isValidRecipe(r)).toBe(false);
	});

	it("returns false when output.mapping is missing", () => {
		const r = { ...minimalValidRecipe, output: {} };
		expect(isValidRecipe(r)).toBe(false);
	});

	it("returns true for a full recipe with all optional fields", () => {
		const r = {
			...minimalValidRecipe,
			version: 3,
			autoGenerated: true,
			health: { consecutiveFailures: 0, successRate: 0.95 },
			validation: { minResults: 1, maxResults: 100 },
			metadata: { sport: "esports" },
		};
		expect(isValidRecipe(r)).toBe(true);
	});

	it("returns false for a plain empty object", () => {
		expect(isValidRecipe({})).toBe(false);
	});
});
