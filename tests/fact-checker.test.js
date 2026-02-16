import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { factCheck, buildFactCheckHints, appendFactCheckHistory } from "../scripts/lib/fact-checker.js";

// --- Mock LLM ---

function mockLLM(response, providerName = "anthropic") {
	return {
		isAvailable: () => true,
		getProviderName: () => providerName,
		getUsage: () => ({ input: 100, output: 50, calls: 1, total: 150 }),
		completeJSON: vi.fn().mockResolvedValue(response),
	};
}

function unavailableLLM() {
	return {
		isAvailable: () => false,
		getProviderName: () => null,
		getUsage: () => ({ input: 0, output: 0, calls: 0, total: 0 }),
	};
}

function failingLLM() {
	return {
		isAvailable: () => true,
		getProviderName: () => "anthropic",
		getUsage: () => ({ input: 0, output: 0, calls: 0, total: 0 }),
		completeJSON: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
	};
}

// --- Test data ---

const sampleEvents = [
	{ sport: "football", title: "Arsenal vs Liverpool", time: "2026-02-16T20:00:00Z", venue: "Emirates Stadium", homeTeam: "Arsenal", awayTeam: "Liverpool", tournament: "Premier League" },
	{ sport: "golf", title: "Genesis Invitational", time: "2026-02-16T18:00:00Z", venue: "Riviera CC", tournament: "PGA Tour" },
	{ sport: "olympics", title: "Biathlon Mixed Relay", time: "2026-02-16T10:00:00Z", venue: "Anterselva", context: "olympics-2026" },
];

const sampleStandings = {
	football: { premierLeague: [{ position: 1, team: "Liverpool", points: 60 }, { position: 2, team: "Arsenal", points: 55 }] },
	golf: { pga: { name: "Genesis Invitational", leaderboard: [{ position: "1", player: "Viktor Hovland", score: "-10" }] } },
};

const sampleRss = { items: [{ sport: "football", title: "Arsenal prepare for Liverpool clash", source: "BBC" }] };

const sampleResults = {
	football: [{ homeTeam: "Arsenal", awayTeam: "Man City", homeScore: 2, awayScore: 1, date: "2026-02-14" }],
};

// --- buildFactCheckHints tests ---

describe("buildFactCheckHints()", () => {
	it("returns empty hints for null/empty history", () => {
		expect(buildFactCheckHints(null)).toEqual({ hints: [], metrics: {} });
		expect(buildFactCheckHints([])).toEqual({ hints: [], metrics: {} });
	});

	it("fires entity-error hint when rate > 0.1", () => {
		const history = [
			{ itemsChecked: 10, issuesFound: 2, categories: { "entity-error": 2 } },
		];
		const { hints } = buildFactCheckHints(history);
		expect(hints.some((h) => h.includes("wrong names/venues"))).toBe(true);
	});

	it("fires coherence hint when rate > 0.05", () => {
		const history = [
			{ itemsChecked: 10, issuesFound: 1, categories: { coherence: 1 } },
		];
		const { hints } = buildFactCheckHints(history);
		expect(hints.some((h) => h.includes("mixed events"))).toBe(true);
	});

	it("fires temporal hint when rate > 0.1", () => {
		const history = [
			{ itemsChecked: 10, issuesFound: 2, categories: { "temporal-anomaly": 2 } },
		];
		const { hints } = buildFactCheckHints(history);
		expect(hints.some((h) => h.includes("wrong dates/times"))).toBe(true);
	});

	it("fires hallucination hint when rate > 0.05", () => {
		const history = [
			{ itemsChecked: 10, issuesFound: 1, categories: { hallucination: 1 } },
		];
		const { hints } = buildFactCheckHints(history);
		expect(hints.some((h) => h.includes("data not provided"))).toBe(true);
	});

	it("analyzes only last 5 entries", () => {
		// 6 entries: first has high error rate, last 5 are clean
		const history = [
			{ itemsChecked: 10, issuesFound: 5, categories: { "entity-error": 5 } },
			{ itemsChecked: 10, issuesFound: 0, categories: {} },
			{ itemsChecked: 10, issuesFound: 0, categories: {} },
			{ itemsChecked: 10, issuesFound: 0, categories: {} },
			{ itemsChecked: 10, issuesFound: 0, categories: {} },
			{ itemsChecked: 10, issuesFound: 0, categories: {} },
		];
		const { hints } = buildFactCheckHints(history);
		expect(hints).toHaveLength(0);
	});

	it("returns metrics alongside hints", () => {
		const history = [
			{ itemsChecked: 20, issuesFound: 3, categories: { "entity-error": 2, coherence: 1 } },
		];
		const { metrics } = buildFactCheckHints(history);
		expect(metrics.entityErrorRate).toBe(0.1);
		expect(metrics.coherenceErrorRate).toBe(0.05);
		expect(metrics.totalItems).toBe(20);
		expect(metrics.totalIssues).toBe(3);
	});

	it("returns no hints when all rates below thresholds", () => {
		const history = [
			{ itemsChecked: 100, issuesFound: 1, categories: { "entity-error": 1 } },
		];
		const { hints } = buildFactCheckHints(history);
		expect(hints).toHaveLength(0);
	});
});

// --- factCheck() tests ---

describe("factCheck()", () => {
	it("returns findings parsed from LLM response", async () => {
		const llm = mockLLM([
			{ severity: "error", category: "entity-error", item: "Event 1", message: "Wrong venue name", correction: "Correct venue" },
		]);
		const result = await factCheck({
			items: sampleEvents,
			itemType: "config-events",
			context: { events: sampleEvents, standings: sampleStandings },
			llm,
		});
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0].severity).toBe("error");
		expect(result.findings[0].category).toBe("entity-error");
		expect(result.itemsChecked).toBe(3);
		expect(result.issuesFound).toBe(1);
		expect(result.provider).toBe("anthropic");
	});

	it("returns empty findings when LLM says no issues", async () => {
		const llm = mockLLM([]);
		const result = await factCheck({
			items: sampleEvents,
			itemType: "featured-blocks",
			context: { events: sampleEvents },
			llm,
		});
		expect(result.findings).toHaveLength(0);
		expect(result.issuesFound).toBe(0);
	});

	it("falls back when no LLM available", async () => {
		const result = await factCheck({
			items: sampleEvents,
			itemType: "config-events",
			context: { events: sampleEvents },
			llm: unavailableLLM(),
		});
		expect(result.findings).toHaveLength(0);
		expect(result.provider).toBe("none");
	});

	it("falls back when no LLM provided", async () => {
		const result = await factCheck({
			items: sampleEvents,
			itemType: "config-events",
			context: { events: sampleEvents },
		});
		expect(result.findings).toHaveLength(0);
		expect(result.provider).toBe("none");
	});

	it("handles LLM returning malformed JSON gracefully", async () => {
		const llm = failingLLM();
		const result = await factCheck({
			items: sampleEvents,
			itemType: "config-events",
			context: { events: sampleEvents },
			llm,
		});
		expect(result.findings).toHaveLength(0);
		expect(result.itemsChecked).toBe(3);
	});

	it("caps items at MAX_ITEMS (30) for token efficiency", async () => {
		const manyItems = Array.from({ length: 50 }, (_, i) => ({
			title: `Event ${i}`,
			time: "2026-02-16T10:00:00Z",
			sport: "football",
		}));
		const llm = mockLLM([]);
		const result = await factCheck({
			items: manyItems,
			itemType: "config-events",
			context: { events: sampleEvents },
			llm,
		});
		expect(result.itemsChecked).toBe(30);
		// Verify the prompt was called with capped items
		const promptArg = llm.completeJSON.mock.calls[0][1];
		expect(promptArg).toContain("30 items");
	});

	it("tracks token usage via LLMClient", async () => {
		const llm = mockLLM([]);
		const result = await factCheck({
			items: sampleEvents,
			itemType: "config-events",
			context: { events: sampleEvents },
			llm,
		});
		expect(result.tokenUsage).toBeDefined();
		expect(result.tokenUsage.total).toBe(150);
	});

	it("works for both config-events and featured-blocks item types", async () => {
		const blocks = [
			{ type: "headline", text: "Olympics day!" },
			{ type: "event-line", text: "⚽ Arsenal vs Liverpool, 20:00" },
		];
		const llm = mockLLM([]);
		const result = await factCheck({
			items: blocks,
			itemType: "featured-blocks",
			context: { events: sampleEvents },
			llm,
		});
		expect(result.itemsChecked).toBe(2);
		const promptArg = llm.completeJSON.mock.calls[0][1];
		expect(promptArg).toContain("Featured blocks");
	});

	it("builds compact reference context from all data sources", async () => {
		const llm = mockLLM([]);
		await factCheck({
			items: sampleEvents,
			itemType: "config-events",
			context: { events: sampleEvents, standings: sampleStandings, rssDigest: sampleRss, recentResults: sampleResults },
			llm,
		});
		const promptArg = llm.completeJSON.mock.calls[0][1];
		expect(promptArg).toContain("Events (3 shown)");
		expect(promptArg).toContain("Standings");
		expect(promptArg).toContain("Recent headlines");
		expect(promptArg).toContain("Recent football results");
	});

	it("returns empty for empty items array", async () => {
		const llm = mockLLM([]);
		const result = await factCheck({
			items: [],
			itemType: "config-events",
			context: { events: sampleEvents },
			llm,
		});
		expect(result.findings).toHaveLength(0);
		expect(result.itemsChecked).toBe(0);
	});

	it("normalizes invalid severity/category values", async () => {
		const llm = mockLLM([
			{ severity: "critical", category: "unknown-type", item: "X", message: "Something bad" },
		]);
		const result = await factCheck({
			items: sampleEvents,
			itemType: "config-events",
			context: {},
			llm,
		});
		expect(result.findings[0].severity).toBe("warning");
		expect(result.findings[0].category).toBe("cross-data-inconsistency");
	});

	it("filters out findings with empty messages", async () => {
		const llm = mockLLM([
			{ severity: "error", category: "entity-error", item: "X", message: "" },
			{ severity: "error", category: "entity-error", item: "Y", message: "Real issue" },
		]);
		const result = await factCheck({
			items: sampleEvents,
			itemType: "config-events",
			context: {},
			llm,
		});
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0].message).toBe("Real issue");
	});
});

// --- Integration scenarios ---

describe("factCheck() integration scenarios", () => {
	it("catches wrong venue when reference data has correct venue", async () => {
		const items = [
			{ title: "Arsenal vs Liverpool", venue: "Anfield", time: "2026-02-16T20:00:00Z", sport: "football" },
		];
		const llm = mockLLM([
			{ severity: "error", category: "entity-error", item: "Arsenal vs Liverpool", message: "Arsenal play at Emirates Stadium, not Anfield", correction: "Emirates Stadium" },
		]);
		const result = await factCheck({
			items,
			itemType: "config-events",
			context: { events: sampleEvents },
			llm,
		});
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0].message).toContain("Emirates Stadium");
	});

	it("catches athlete not in reference data (hallucination)", async () => {
		const items = [
			{ title: "Biathlon Sprint", norwegianPlayers: [{ name: "Fake Athlete" }], sport: "olympics" },
		];
		const llm = mockLLM([
			{ severity: "warning", category: "hallucination", item: "Biathlon Sprint", message: "Fake Athlete not found in any reference data" },
		]);
		const result = await factCheck({
			items,
			itemType: "config-events",
			context: { events: sampleEvents },
			llm,
		});
		expect(result.findings[0].category).toBe("hallucination");
	});

	it("catches CS2 event in Olympics section (coherence)", async () => {
		const blocks = [
			{ type: "section", id: "olympics-2026", title: "Winter Olympics 2026", items: [{ text: "CS2 Major Tournaments" }] },
		];
		const llm = mockLLM([
			{ severity: "error", category: "coherence", item: "olympics-2026", message: "CS2 is an esports event, not an Olympics event" },
		]);
		const result = await factCheck({
			items: blocks,
			itemType: "featured-blocks",
			context: { events: sampleEvents },
			llm,
		});
		expect(result.findings[0].category).toBe("coherence");
	});

	it("catches date inconsistency between config and events", async () => {
		const items = [
			{ title: "Arsenal vs Liverpool", time: "2026-03-20T20:00:00Z", sport: "football" },
		];
		const llm = mockLLM([
			{ severity: "error", category: "temporal-anomaly", item: "Arsenal vs Liverpool", message: "Events data shows this match on Feb 16, not Mar 20" },
		]);
		const result = await factCheck({
			items,
			itemType: "config-events",
			context: { events: sampleEvents },
			llm,
		});
		expect(result.findings[0].category).toBe("temporal-anomaly");
	});

	it("catches team not in standings/results", async () => {
		const items = [
			{ title: "Fake FC vs Ghost United", sport: "football", time: "2026-02-16T20:00:00Z" },
		];
		const llm = mockLLM([
			{ severity: "warning", category: "entity-error", item: "Fake FC vs Ghost United", message: "Neither team appears in standings or results" },
		]);
		const result = await factCheck({
			items,
			itemType: "config-events",
			context: { events: sampleEvents, standings: sampleStandings, recentResults: sampleResults },
			llm,
		});
		expect(result.findings[0].category).toBe("entity-error");
	});

	it("returns no findings for correct, consistent data", async () => {
		const llm = mockLLM([]);
		const result = await factCheck({
			items: sampleEvents,
			itemType: "config-events",
			context: { events: sampleEvents, standings: sampleStandings, rssDigest: sampleRss, recentResults: sampleResults },
			llm,
		});
		expect(result.findings).toHaveLength(0);
		expect(result.issuesFound).toBe(0);
	});
});

// --- History management ---

describe("appendFactCheckHistory()", () => {
	let tmpDir;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("appends summary to history array", () => {
		const historyPath = path.join(tmpDir, "fact-check-history.json");
		const result = {
			findings: [{ category: "entity-error", severity: "error", item: "X", message: "Wrong" }],
			itemsChecked: 5,
			issuesFound: 1,
			provider: "anthropic",
			itemType: "config-events",
		};
		const history = appendFactCheckHistory(historyPath, result);
		expect(history).toHaveLength(1);
		expect(history[0].itemsChecked).toBe(5);
		expect(history[0].issuesFound).toBe(1);
		expect(history[0].categories["entity-error"]).toBe(1);
		expect(history[0].timestamp).toBeDefined();
	});

	it("caps history at 50 entries", () => {
		const historyPath = path.join(tmpDir, "fact-check-history.json");
		// Write 50 entries first
		const initial = Array.from({ length: 50 }, (_, i) => ({
			timestamp: `2026-01-${String(i + 1).padStart(2, "0")}`,
			itemsChecked: 10,
			issuesFound: 0,
			categories: {},
			provider: "anthropic",
			itemType: "config-events",
		}));
		fs.writeFileSync(historyPath, JSON.stringify(initial));

		const result = { findings: [], itemsChecked: 10, issuesFound: 0, provider: "anthropic", itemType: "config-events" };
		const history = appendFactCheckHistory(historyPath, result);
		expect(history).toHaveLength(50);
		// The first entry should have been shifted out
		expect(history[0].timestamp).toBe("2026-01-02");
	});

	it("computes per-category counts correctly", () => {
		const historyPath = path.join(tmpDir, "fact-check-history.json");
		const result = {
			findings: [
				{ category: "entity-error", severity: "error", item: "A", message: "Wrong" },
				{ category: "entity-error", severity: "warning", item: "B", message: "Also wrong" },
				{ category: "coherence", severity: "error", item: "C", message: "Mixed" },
			],
			itemsChecked: 10,
			issuesFound: 3,
			provider: "openai",
			itemType: "featured-blocks",
		};
		const history = appendFactCheckHistory(historyPath, result);
		expect(history[0].categories["entity-error"]).toBe(2);
		expect(history[0].categories.coherence).toBe(1);
		expect(history[0].itemType).toBe("featured-blocks");
	});

	it("handles missing/empty history file", () => {
		const historyPath = path.join(tmpDir, "nonexistent.json");
		const result = { findings: [], itemsChecked: 5, issuesFound: 0, provider: "anthropic", itemType: "config-events" };
		const history = appendFactCheckHistory(historyPath, result);
		expect(history).toHaveLength(1);
	});

	it("preserves existing history entries", () => {
		const historyPath = path.join(tmpDir, "fact-check-history.json");
		fs.writeFileSync(historyPath, JSON.stringify([{ timestamp: "old", itemsChecked: 1 }]));
		const result = { findings: [], itemsChecked: 5, issuesFound: 0, provider: "anthropic", itemType: "config-events" };
		const history = appendFactCheckHistory(historyPath, result);
		expect(history).toHaveLength(2);
		expect(history[0].timestamp).toBe("old");
	});
});
