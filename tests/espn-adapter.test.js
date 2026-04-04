import { describe, it, expect, vi, beforeEach } from "vitest";
import { ESPNAdapter } from "../scripts/lib/adapters/espn-adapter.js";

// Create a testable subclass that stubs out the API client
class TestESPNAdapter extends ESPNAdapter {
	constructor(config, apiResponses = {}) {
		super(config);
		this._apiResponses = apiResponses;
		this._fetchedUrls = [];
		this.apiClient = {
			fetchJSON: vi.fn(async (url) => {
				this._fetchedUrls.push(url);
				if (this._apiResponses[url]) {
					const response = this._apiResponses[url];
					if (response instanceof Error) throw response;
					return response;
				}
				// Check for pattern-based responses (league code matching)
				for (const [pattern, response] of Object.entries(this._apiResponses)) {
					if (url.includes(pattern)) {
						if (response instanceof Error) throw response;
						return response;
					}
				}
				return { events: [] };
			}),
			delay: vi.fn(async () => {}),
		};
	}
}

const futureDate = new Date(Date.now() + 86400000).toISOString();

function makeESPNEvent(overrides = {}) {
	return {
		name: "Team A vs Team B",
		date: futureDate,
		competitions: [
			{
				venue: { fullName: "Test Stadium" },
				competitors: [
					{ homeAway: "home", team: { displayName: "Team A" } },
					{ homeAway: "away", team: { displayName: "Team B" } },
				],
			},
		],
		status: { type: { name: "STATUS_SCHEDULED" } },
		...overrides,
	};
}

describe("ESPNAdapter - fetchScoreboardWithLeagues partial failure tracking", () => {
	const baseConfig = {
		sport: "football",
		source: "ESPN",
		sources: [],
	};

	const makeSource = (leagues) => ({
		api: "espn",
		type: "scoreboard",
		baseUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer",
		leagues,
	});

	describe("all leagues succeed", () => {
		it("returns coverageRatio 1.0 and failedLeagues 0", async () => {
			const leagues = [
				{ name: "Premier League", code: "eng.1" },
				{ name: "La Liga", code: "esp.1" },
			];

			const adapter = new TestESPNAdapter(baseConfig, {
				"eng.1": { events: [makeESPNEvent()] },
				"esp.1": { events: [makeESPNEvent()] },
			});

			const source = makeSource(leagues);
			const result = await adapter.fetchScoreboardWithLeagues(source);

			// Array should have events
			expect(result.length).toBeGreaterThan(0);

			// Metadata on the instance
			expect(adapter._fetchMetadata.leagues).toEqual({
				totalLeagues: 2,
				failedLeagues: 0,
				failedLeagueNames: [],
				coverageRatio: 1.0,
			});

			// Backward-compatible _leagueMeta on the array
			expect(result._leagueMeta).toEqual({
				leaguesFetched: 2,
				leaguesFailed: 0,
				failedLeagues: [],
			});
		});
	});

	describe("some leagues fail", () => {
		it("returns correct ratio and failed names", async () => {
			const leagues = [
				{ name: "Premier League", code: "eng.1" },
				{ name: "La Liga", code: "esp.1" },
				{ name: "Serie A", code: "ita.1" },
			];

			// eng.1 succeeds, esp.1 throws on every date, ita.1 succeeds
			const adapter = new TestESPNAdapter(baseConfig, {});
			// Override fetchJSON to selectively fail
			adapter.apiClient.fetchJSON = vi.fn(async (url) => {
				if (url.includes("esp.1")) {
					throw new Error("API timeout");
				}
				if (url.includes("eng.1") || url.includes("ita.1")) {
					return { events: [makeESPNEvent()] };
				}
				return { events: [] };
			});

			const source = makeSource(leagues);
			const result = await adapter.fetchScoreboardWithLeagues(source);

			expect(adapter._fetchMetadata.leagues.totalLeagues).toBe(3);
			expect(adapter._fetchMetadata.leagues.failedLeagues).toBe(1);
			expect(adapter._fetchMetadata.leagues.failedLeagueNames).toEqual(["La Liga"]);
			expect(adapter._fetchMetadata.leagues.coverageRatio).toBeCloseTo(2 / 3);

			expect(result._leagueMeta.leaguesFetched).toBe(2);
			expect(result._leagueMeta.leaguesFailed).toBe(1);
		});

		it("tracks multiple failed leagues correctly", async () => {
			const leagues = [
				{ name: "Premier League", code: "eng.1" },
				{ name: "La Liga", code: "esp.1" },
				{ name: "Serie A", code: "ita.1" },
				{ name: "Bundesliga", code: "ger.1" },
			];

			const adapter = new TestESPNAdapter(baseConfig, {});
			adapter.apiClient.fetchJSON = vi.fn(async (url) => {
				if (url.includes("esp.1") || url.includes("ger.1")) {
					throw new Error("API error");
				}
				return { events: [makeESPNEvent()] };
			});

			const source = makeSource(leagues);
			await adapter.fetchScoreboardWithLeagues(source);

			expect(adapter._fetchMetadata.leagues.totalLeagues).toBe(4);
			expect(adapter._fetchMetadata.leagues.failedLeagues).toBe(2);
			expect(adapter._fetchMetadata.leagues.failedLeagueNames).toContain("La Liga");
			expect(adapter._fetchMetadata.leagues.failedLeagueNames).toContain("Bundesliga");
			expect(adapter._fetchMetadata.leagues.coverageRatio).toBeCloseTo(0.5);
		});
	});

	describe("all leagues fail", () => {
		it("returns coverageRatio 0 and all leagues listed as failed", async () => {
			const leagues = [
				{ name: "Premier League", code: "eng.1" },
				{ name: "La Liga", code: "esp.1" },
			];

			const adapter = new TestESPNAdapter(baseConfig, {});
			adapter.apiClient.fetchJSON = vi.fn(async () => {
				throw new Error("Network error");
			});

			const source = makeSource(leagues);
			const result = await adapter.fetchScoreboardWithLeagues(source);

			expect(result.length).toBe(0);
			expect(adapter._fetchMetadata.leagues).toEqual({
				totalLeagues: 2,
				failedLeagues: 2,
				failedLeagueNames: ["Premier League", "La Liga"],
				coverageRatio: 0,
			});
		});
	});

	describe("empty league list", () => {
		it("handles gracefully with coverageRatio 1.0", async () => {
			const adapter = new TestESPNAdapter(baseConfig, {});
			const source = makeSource([]);
			const result = await adapter.fetchScoreboardWithLeagues(source);

			expect(result.length).toBe(0);
			expect(adapter._fetchMetadata.leagues).toEqual({
				totalLeagues: 0,
				failedLeagues: 0,
				failedLeagueNames: [],
				coverageRatio: 1,
			});
		});
	});

	describe("metadata propagation to formatResponse", () => {
		it("includes _fetchMetadata in formatted response when leagues have partial failures", async () => {
			const leagues = [
				{ name: "Premier League", code: "eng.1" },
				{ name: "La Liga", code: "esp.1" },
			];

			const config = {
				...baseConfig,
				sources: [
					{
						api: "espn",
						type: "scoreboard",
						baseUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer",
						leagues,
					},
				],
			};

			const adapter = new TestESPNAdapter(config, {});
			adapter.apiClient.fetchJSON = vi.fn(async (url) => {
				if (url.includes("esp.1")) throw new Error("timeout");
				return { events: [makeESPNEvent()] };
			});

			const response = await adapter.fetch();

			expect(response._fetchMetadata).toBeDefined();
			expect(response._fetchMetadata.leagues.totalLeagues).toBe(2);
			expect(response._fetchMetadata.leagues.failedLeagues).toBe(1);
			expect(response._fetchMetadata.leagues.coverageRatio).toBeCloseTo(0.5);
		});

		it("omits _fetchMetadata when no metadata was collected", async () => {
			const config = {
				...baseConfig,
				sources: [
					{
						api: "espn",
						type: "scoreboard",
						url: "https://site.api.espn.com/test",
					},
				],
			};

			const adapter = new TestESPNAdapter(config, {
				"https://site.api.espn.com/test": { events: [] },
			});

			const response = await adapter.fetch();

			expect(response._fetchMetadata).toBeUndefined();
		});
	});

	describe("league partially fails for some days but succeeds for others", () => {
		it("counts the league as successful if any day succeeds", async () => {
			const leagues = [{ name: "Premier League", code: "eng.1" }];

			let callCount = 0;
			const adapter = new TestESPNAdapter(baseConfig, {});
			adapter.apiClient.fetchJSON = vi.fn(async () => {
				callCount++;
				// Fail on first call, succeed on second
				if (callCount === 1) throw new Error("transient");
				return { events: [makeESPNEvent()] };
			});

			const source = makeSource(leagues);
			await adapter.fetchScoreboardWithLeagues(source);

			// League should be counted as successful since at least one day worked
			expect(adapter._fetchMetadata.leagues.failedLeagues).toBe(0);
			expect(adapter._fetchMetadata.leagues.coverageRatio).toBe(1);
		});
	});
});
