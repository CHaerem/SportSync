import { describe, it, expect } from "vitest";
import {
	validateESPNScoreboard,
	validateESPNStandings,
	validateLiveGolfEvents,
	validatePandaScoreResponse,
	validateFetcherOutput,
} from "../scripts/lib/response-validator.js";

describe("validateESPNScoreboard()", () => {
	it("passes valid ESPN scoreboard", () => {
		const data = {
			events: [{
				date: "2026-02-15T15:00Z",
				name: "Arsenal vs Liverpool",
				competitions: [{
					competitors: [
						{ team: { displayName: "Arsenal" }, homeAway: "home" },
						{ team: { displayName: "Liverpool" }, homeAway: "away" },
					],
				}],
			}],
		};
		const result = validateESPNScoreboard(data, "football");
		expect(result.valid).toBe(true);
		expect(result.events).toHaveLength(1);
		expect(result.warnings).toHaveLength(0);
	});

	it("returns empty array + warning when events key is missing", () => {
		const result = validateESPNScoreboard({}, "football");
		expect(result.valid).toBe(false);
		expect(result.events).toEqual([]);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain("missing_events");
	});

	it("returns empty + warning for null data", () => {
		const result = validateESPNScoreboard(null);
		expect(result.valid).toBe(false);
		expect(result.events).toEqual([]);
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	it("filters out events missing competitions", () => {
		const data = {
			events: [
				{ date: "2026-02-15T15:00Z", name: "Good", competitions: [{ competitors: [{ team: {} }] }] },
				{ date: "2026-02-15T15:00Z", name: "Bad", competitions: [] },
			],
		};
		const result = validateESPNScoreboard(data, "football");
		expect(result.valid).toBe(true);
		expect(result.events).toHaveLength(1);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain("missing_competitions");
	});

	it("filters out events missing date", () => {
		const data = {
			events: [
				{ name: "No date", competitions: [{ competitors: [{}] }] },
			],
		};
		const result = validateESPNScoreboard(data, "football");
		expect(result.events).toHaveLength(0);
		expect(result.warnings[0]).toContain("missing_date");
	});
});

describe("validateESPNStandings()", () => {
	it("passes valid standings data", () => {
		const data = {
			children: [{
				standings: {
					entries: [
						{ team: { displayName: "Arsenal" }, stats: [] },
					],
				},
			}],
		};
		const result = validateESPNStandings(data, "football");
		expect(result.valid).toBe(true);
		expect(result.entries).toHaveLength(1);
	});

	it("returns empty + warning for missing structure", () => {
		const result = validateESPNStandings({}, "football");
		expect(result.valid).toBe(false);
		expect(result.entries).toEqual([]);
		expect(result.warnings[0]).toContain("missing_entries");
	});

	it("handles empty entries array", () => {
		const data = { children: [{ standings: { entries: [] } }] };
		const result = validateESPNStandings(data, "football");
		expect(result.valid).toBe(true);
		expect(result.entries).toEqual([]);
		expect(result.warnings[0]).toContain("empty_entries");
	});
});

describe("validateLiveGolfEvents()", () => {
	it("passes valid LiveGolf events", () => {
		const data = [
			{ name: "Genesis", startDatetime: "2026-02-13T07:00:00Z", status: "Scheduled" },
		];
		const result = validateLiveGolfEvents(data);
		expect(result.valid).toBe(true);
		expect(result.events).toHaveLength(1);
	});

	it("returns empty + warning for non-array", () => {
		const result = validateLiveGolfEvents({ events: [] });
		expect(result.valid).toBe(false);
		expect(result.events).toEqual([]);
	});

	it("filters events missing startDatetime", () => {
		const data = [
			{ name: "Good", startDatetime: "2026-02-13T07:00:00Z" },
			{ name: "Bad" },
		];
		const result = validateLiveGolfEvents(data);
		expect(result.events).toHaveLength(1);
		expect(result.warnings).toHaveLength(1);
	});
});

describe("validatePandaScoreResponse()", () => {
	it("passes valid PandaScore array", () => {
		const data = [{ id: 1, name: "IEM Katowice" }];
		const result = validatePandaScoreResponse(data);
		expect(result.valid).toBe(true);
		expect(result.items).toHaveLength(1);
	});

	it("returns empty + warning for non-array", () => {
		const result = validatePandaScoreResponse("not an array");
		expect(result.valid).toBe(false);
		expect(result.items).toEqual([]);
	});

	it("filters null items", () => {
		const result = validatePandaScoreResponse([{ id: 1 }, null, undefined]);
		expect(result.items).toHaveLength(1);
		expect(result.warnings).toHaveLength(2);
	});
});

describe("validateFetcherOutput()", () => {
	it("passes valid fetcher output", () => {
		const data = {
			lastUpdated: "2026-02-11T10:00:00Z",
			source: "ESPN",
			tournaments: [{ name: "PL", events: [{ title: "Match" }] }],
		};
		const result = validateFetcherOutput(data, "football");
		expect(result.valid).toBe(true);
		expect(result.data.tournaments).toHaveLength(1);
		expect(result.warnings).toHaveLength(0);
	});

	it("catches missing tournaments array", () => {
		const data = { lastUpdated: "2026-02-11T10:00:00Z" };
		const result = validateFetcherOutput(data, "football");
		expect(result.valid).toBe(false);
		expect(result.data.tournaments).toEqual([]);
		expect(result.warnings[0]).toContain("missing_tournaments");
	});

	it("warns on missing lastUpdated", () => {
		const data = { tournaments: [{ name: "PL", events: [] }] };
		const result = validateFetcherOutput(data, "football");
		expect(result.valid).toBe(true);
		expect(result.warnings[0]).toContain("missing_timestamp");
	});

	it("filters tournaments missing name", () => {
		const data = {
			lastUpdated: "2026-02-11T10:00:00Z",
			tournaments: [
				{ name: "Good", events: [] },
				{ events: [] },
			],
		};
		const result = validateFetcherOutput(data, "football");
		expect(result.data.tournaments).toHaveLength(1);
		expect(result.warnings[0]).toContain("missing_name");
	});

	it("filters tournaments missing events array", () => {
		const data = {
			lastUpdated: "2026-02-11T10:00:00Z",
			tournaments: [{ name: "Bad" }],
		};
		const result = validateFetcherOutput(data, "football");
		expect(result.data.tournaments).toHaveLength(0);
	});

	it("handles null input", () => {
		const result = validateFetcherOutput(null, "football");
		expect(result.valid).toBe(false);
		expect(result.data).toBeNull();
	});
});
