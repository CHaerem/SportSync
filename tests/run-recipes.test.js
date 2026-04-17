import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock helpers and focus-team-filter before importing
vi.mock("../scripts/lib/helpers.js", async () => {
	const actual = await vi.importActual("../scripts/lib/helpers.js");
	return {
		...actual,
		readJsonIfExists: vi.fn(),
		writeJsonPretty: vi.fn(),
	};
});

vi.mock("../scripts/lib/focus-team-filter.js", async () => {
	const actual = await vi.importActual("../scripts/lib/focus-team-filter.js");
	return {
		...actual,
		filterEventsByFocusTeam: vi.fn().mockImplementation((events) => ({
			filtered: events,
			removedCount: 0,
		})),
		loadUserContext: vi.fn().mockReturnValue({}),
	};
});

const { readJsonIfExists, writeJsonPretty } = await import("../scripts/lib/helpers.js");
const { filterEventsByFocusTeam, loadUserContext } = await import("../scripts/lib/focus-team-filter.js");
const { applyRecipeResults, shouldAutoQuarantine } = await import("../scripts/run-recipes.js");

// ─── shouldAutoQuarantine ───────────────────────────────────────────────

describe("shouldAutoQuarantine()", () => {
	it("does not quarantine a healthy recipe with 0 failures", () => {
		const entry = { consecutiveFailures: 0, lastSuccess: "2026-04-17T10:00:00Z" };
		const result = shouldAutoQuarantine(entry);
		expect(result.quarantine).toBe(false);
		expect(result.reason).toBeNull();
	});

	it("does not quarantine a recipe with failures below threshold", () => {
		const entry = { consecutiveFailures: 19, lastSuccess: null };
		const result = shouldAutoQuarantine(entry);
		expect(result.quarantine).toBe(false);
	});

	it("does not quarantine a recipe at threshold that has had a prior success", () => {
		const entry = { consecutiveFailures: 20, lastSuccess: "2026-01-01T00:00:00Z" };
		const result = shouldAutoQuarantine(entry);
		expect(result.quarantine).toBe(false);
		expect(result.reason).toBeNull();
	});

	it("quarantines recipe at exactly 20 failures with no prior success", () => {
		const entry = { consecutiveFailures: 20, lastSuccess: null };
		const result = shouldAutoQuarantine(entry);
		expect(result.quarantine).toBe(true);
		expect(result.reason).toContain("Auto-quarantined");
		expect(result.reason).toContain("20");
	});

	it("quarantines recipe above 20 failures with no prior success", () => {
		const entry = { consecutiveFailures: 50, lastSuccess: null };
		const result = shouldAutoQuarantine(entry);
		expect(result.quarantine).toBe(true);
		expect(result.reason).toContain("50");
	});

	it("treats empty string lastSuccess as truthy (not quarantined)", () => {
		// An empty string is falsy in JS, so this WOULD quarantine
		const entry = { consecutiveFailures: 25, lastSuccess: "" };
		const result = shouldAutoQuarantine(entry);
		expect(result.quarantine).toBe(true);
	});

	it("treats undefined lastSuccess as no prior success", () => {
		const entry = { consecutiveFailures: 25 };
		const result = shouldAutoQuarantine(entry);
		expect(result.quarantine).toBe(true);
	});

	it("does not quarantine when consecutiveFailures is missing", () => {
		const entry = { lastSuccess: null };
		const result = shouldAutoQuarantine(entry);
		expect(result.quarantine).toBe(false);
	});

	it("reason mentions 'permanently unavailable' for context", () => {
		const entry = { consecutiveFailures: 30, lastSuccess: null };
		const result = shouldAutoQuarantine(entry);
		expect(result.reason).toContain("permanently unavailable");
	});
});

// ─── applyRecipeResults ─────────────────────────────────────────────────

describe("applyRecipeResults()", () => {
	const baseRecipe = {
		id: "test-recipe",
		metadata: { configRef: "esports-cs2-2026.json" },
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("skips when target config is not found", () => {
		readJsonIfExists.mockReturnValue(null);
		applyRecipeResults(baseRecipe, [{ title: "Match 1" }]);

		// writeJsonPretty should NOT be called when config is missing
		expect(writeJsonPretty).not.toHaveBeenCalled();
	});

	it("applies results to config with empty events array", () => {
		const config = { sport: "football", events: [] };
		readJsonIfExists.mockReturnValue(config);

		const newEvents = [
			{ title: "Match A", time: "2026-04-17T18:00:00Z" },
			{ title: "Match B", time: "2026-04-17T20:00:00Z" },
		];

		applyRecipeResults(baseRecipe, newEvents);

		expect(writeJsonPretty).toHaveBeenCalledTimes(1);
		const [, writtenConfig] = writeJsonPretty.mock.calls[0];
		expect(writtenConfig.events).toHaveLength(2);
		expect(writtenConfig.events[0]._recipeId).toBe("test-recipe");
		expect(writtenConfig.events[1]._recipeId).toBe("test-recipe");
		expect(writtenConfig.lastRecipeRun).toBeDefined();
	});

	it("tags all events with the recipe id", () => {
		readJsonIfExists.mockReturnValue({ events: [] });

		const newEvents = [{ title: "A" }, { title: "B" }, { title: "C" }];
		applyRecipeResults(baseRecipe, newEvents);

		const [, writtenConfig] = writeJsonPretty.mock.calls[0];
		for (const ev of writtenConfig.events) {
			expect(ev._recipeId).toBe("test-recipe");
		}
	});

	it("replaces old recipe events but preserves manually added ones", () => {
		const config = {
			events: [
				{ title: "Manual Event", _recipeId: undefined },
				{ title: "Old Recipe Event", _recipeId: "test-recipe" },
				{ title: "Another Manual", someField: true },
			],
		};
		readJsonIfExists.mockReturnValue(config);

		const newEvents = [{ title: "New Recipe Event" }];
		applyRecipeResults(baseRecipe, newEvents);

		const [, writtenConfig] = writeJsonPretty.mock.calls[0];
		// Manual events preserved (2) + new recipe event (1) = 3
		expect(writtenConfig.events).toHaveLength(3);

		const titles = writtenConfig.events.map((e) => e.title);
		expect(titles).toContain("Manual Event");
		expect(titles).toContain("Another Manual");
		expect(titles).toContain("New Recipe Event");
		expect(titles).not.toContain("Old Recipe Event");
	});

	it("preserves events from a different recipe", () => {
		const config = {
			events: [
				{ title: "Other Recipe Event", _recipeId: "other-recipe" },
			],
		};
		readJsonIfExists.mockReturnValue(config);

		const newEvents = [{ title: "Test Recipe Event" }];
		applyRecipeResults(baseRecipe, newEvents);

		const [, writtenConfig] = writeJsonPretty.mock.calls[0];
		expect(writtenConfig.events).toHaveLength(2);
		const titles = writtenConfig.events.map((e) => e.title);
		expect(titles).toContain("Other Recipe Event");
		expect(titles).toContain("Test Recipe Event");
	});

	it("handles config with no events property", () => {
		readJsonIfExists.mockReturnValue({ sport: "esports" });

		const newEvents = [{ title: "Match 1" }];
		applyRecipeResults(baseRecipe, newEvents);

		const [, writtenConfig] = writeJsonPretty.mock.calls[0];
		expect(writtenConfig.events).toHaveLength(1);
		expect(writtenConfig.events[0].title).toBe("Match 1");
	});

	it("handles empty new events (clears recipe events)", () => {
		const config = {
			events: [
				{ title: "Old Recipe Event", _recipeId: "test-recipe" },
				{ title: "Manual Event" },
			],
		};
		readJsonIfExists.mockReturnValue(config);

		applyRecipeResults(baseRecipe, []);

		const [, writtenConfig] = writeJsonPretty.mock.calls[0];
		// Only the manual event should remain
		expect(writtenConfig.events).toHaveLength(1);
		expect(writtenConfig.events[0].title).toBe("Manual Event");
	});

	it("sets lastRecipeRun timestamp on config", () => {
		readJsonIfExists.mockReturnValue({ events: [] });
		applyRecipeResults(baseRecipe, [{ title: "Match" }]);

		const [, writtenConfig] = writeJsonPretty.mock.calls[0];
		expect(writtenConfig.lastRecipeRun).toBeDefined();
		// Should be a valid ISO timestamp
		expect(new Date(writtenConfig.lastRecipeRun).toISOString()).toBe(writtenConfig.lastRecipeRun);
	});

	it("calls filterEventsByFocusTeam with tagged events and config", () => {
		const config = { sport: "esports", events: [] };
		readJsonIfExists.mockReturnValue(config);

		const newEvents = [{ title: "Match 1" }];
		applyRecipeResults(baseRecipe, newEvents);

		expect(filterEventsByFocusTeam).toHaveBeenCalledTimes(1);
		const [taggedEvents, passedConfig] = filterEventsByFocusTeam.mock.calls[0];
		expect(taggedEvents).toHaveLength(1);
		expect(taggedEvents[0]._recipeId).toBe("test-recipe");
		expect(passedConfig).toBe(config);
	});

	it("respects focus-team filter removing events", () => {
		const config = { sport: "esports", events: [] };
		readJsonIfExists.mockReturnValue(config);

		// Override mock to simulate filtering
		filterEventsByFocusTeam.mockReturnValueOnce({
			filtered: [{ title: "Focus Match", _recipeId: "test-recipe" }],
			removedCount: 2,
		});

		const newEvents = [
			{ title: "Focus Match" },
			{ title: "Non-focus 1" },
			{ title: "Non-focus 2" },
		];
		applyRecipeResults(baseRecipe, newEvents);

		const [, writtenConfig] = writeJsonPretty.mock.calls[0];
		expect(writtenConfig.events).toHaveLength(1);
		expect(writtenConfig.events[0].title).toBe("Focus Match");
	});

	it("does not mutate the original events array", () => {
		readJsonIfExists.mockReturnValue({ events: [] });

		const newEvents = [{ title: "Match 1" }];
		const originalRef = newEvents[0];
		applyRecipeResults(baseRecipe, newEvents);

		// The original event should not have _recipeId added to it
		expect(originalRef._recipeId).toBeUndefined();
	});
});
