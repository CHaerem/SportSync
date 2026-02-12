import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseFetcher } from "../scripts/lib/base-fetcher.js";

class TestFetcher extends BaseFetcher {
	constructor(config, mockData = []) {
		super(config);
		this.mockData = mockData;
	}

	async fetchFromSource(source) {
		if (source.fail) throw new Error(`Source ${source.api} failed`);
		return this.mockData;
	}

	transformToEvents(rawData) {
		return rawData;
	}
}

function makeEvent(overrides = {}) {
	return {
		title: "Test Match",
		time: new Date(Date.now() + 86400000).toISOString(),
		tournament: "Test League",
		venue: "Test Arena",
		...overrides,
	};
}

describe("BaseFetcher", () => {
	describe("constructor", () => {
		it("stores config and creates an APIClient", () => {
			const config = { sport: "football", source: "ESPN" };
			const fetcher = new BaseFetcher(config);
			expect(fetcher.config).toBe(config);
			expect(fetcher.apiClient).toBeDefined();
		});
	});

	describe("fetch()", () => {
		it("returns formatted response with events", async () => {
			const event = makeEvent();
			const fetcher = new TestFetcher(
				{ sport: "football", source: "ESPN", sources: [{ api: "espn" }] },
				[event]
			);

			const result = await fetcher.fetch();
			expect(result.lastUpdated).toBeTruthy();
			expect(result.source).toBe("ESPN");
			expect(result.tournaments).toHaveLength(1);
			expect(result.tournaments[0].name).toBe("Test League");
			expect(result.tournaments[0].events).toHaveLength(1);
		});

		it("returns empty response when all sources fail", async () => {
			const fetcher = new TestFetcher(
				{ sport: "football", sources: [{ api: "bad", fail: true }] },
				[]
			);

			const result = await fetcher.fetch();
			expect(result.tournaments).toHaveLength(0);
			expect(result.source).toBe("API");
		});

		it("catches errors in the pipeline and returns empty", async () => {
			const fetcher = new BaseFetcher({ sport: "football", sources: [] });
			// fetchFromAPIs returns [], transformToEvents throws
			const result = await fetcher.fetch();
			// Should not throw — catches internally and returns empty
			expect(result.tournaments).toEqual([]);
		});
	});

	describe("fetchFromAPIs()", () => {
		it("iterates all sources and collects results", async () => {
			const events = [makeEvent({ title: "Match 1" }), makeEvent({ title: "Match 2" })];
			const fetcher = new TestFetcher(
				{ sport: "football", sources: [{ api: "source1" }, { api: "source2" }] },
				events
			);

			const results = await fetcher.fetchFromAPIs();
			// Each source returns the same 2 events, so 4 total
			expect(results).toHaveLength(4);
		});

		it("returns empty array when no sources configured", async () => {
			const fetcher = new TestFetcher({ sport: "football" }, []);
			const results = await fetcher.fetchFromAPIs();
			expect(results).toHaveLength(0);
		});

		it("skips failing sources and continues", async () => {
			const event = makeEvent();
			const fetcher = new TestFetcher(
				{
					sport: "football",
					sources: [
						{ api: "bad", fail: true },
						{ api: "good" },
					],
				},
				[event]
			);

			const results = await fetcher.fetchFromAPIs();
			expect(results).toHaveLength(1);
		});

		it("accumulates errors without stopping", async () => {
			const fetcher = new TestFetcher(
				{
					sport: "football",
					sources: [
						{ api: "bad1", fail: true },
						{ api: "bad2", fail: true },
					],
				},
				[]
			);

			const results = await fetcher.fetchFromAPIs();
			expect(results).toHaveLength(0);
		});
	});

	describe("applyFilters()", () => {
		it("returns all events when no filters configured", () => {
			const fetcher = new TestFetcher({ sport: "football" });
			const events = [makeEvent(), makeEvent()];
			const result = fetcher.applyFilters(events);
			expect(result).toHaveLength(2);
		});

		it("limits events with maxEvents filter", () => {
			const fetcher = new TestFetcher({
				sport: "football",
				filters: { maxEvents: 1 },
			});
			const events = [makeEvent({ title: "A" }), makeEvent({ title: "B" })];
			const result = fetcher.applyFilters(events);
			expect(result).toHaveLength(1);
			expect(result[0].title).toBe("A");
		});

		it("filters by time range", () => {
			const fetcher = new TestFetcher({
				sport: "football",
				filters: { timeRange: 2 },
			});
			const events = [
				makeEvent({ time: new Date(Date.now() + 86400000).toISOString() }), // tomorrow
				makeEvent({ time: new Date(Date.now() + 86400000 * 5).toISOString() }), // 5 days
			];
			const result = fetcher.applyFilters(events);
			expect(result).toHaveLength(1);
		});

		it("filters past events by time range", () => {
			const fetcher = new TestFetcher({
				sport: "football",
				filters: { timeRange: 7 },
			});
			const events = [
				makeEvent({ time: new Date(Date.now() - 86400000).toISOString() }), // yesterday
				makeEvent({ time: new Date(Date.now() + 86400000).toISOString() }), // tomorrow
			];
			const result = fetcher.applyFilters(events);
			expect(result).toHaveLength(1);
		});
	});

	describe("normalizeEvents()", () => {
		it("sets sport from config", () => {
			const fetcher = new TestFetcher({ sport: "golf" });
			const events = [makeEvent()];
			const result = fetcher.normalizeEvents(events);
			expect(result[0].sport).toBe("golf");
		});

		it("defaults streaming to empty array", () => {
			const fetcher = new TestFetcher({ sport: "football" });
			const events = [makeEvent()];
			const result = fetcher.normalizeEvents(events);
			expect(result[0].streaming).toEqual([]);
		});

		it("preserves existing streaming data", () => {
			const fetcher = new TestFetcher({ sport: "football" });
			const streaming = [{ platform: "NRK", type: "tv" }];
			const events = [makeEvent({ streaming })];
			const result = fetcher.normalizeEvents(events);
			expect(result[0].streaming).toEqual(streaming);
		});

		it("defaults norwegian to false", () => {
			const fetcher = new TestFetcher({ sport: "football" });
			const events = [makeEvent()];
			const result = fetcher.normalizeEvents(events);
			expect(result[0].norwegian).toBe(false);
		});

		it("preserves norwegian=true", () => {
			const fetcher = new TestFetcher({ sport: "football" });
			const events = [makeEvent({ norwegian: true })];
			const result = fetcher.normalizeEvents(events);
			expect(result[0].norwegian).toBe(true);
		});

		it("normalizes time to UTC ISO string", () => {
			const fetcher = new TestFetcher({ sport: "football" });
			const events = [makeEvent({ time: "2026-02-12T10:00:00+01:00" })];
			const result = fetcher.normalizeEvents(events);
			expect(result[0].time).toBe("2026-02-12T09:00:00.000Z");
		});
	});

	describe("formatResponse()", () => {
		it("returns proper structure with lastUpdated and source", () => {
			const fetcher = new TestFetcher({ sport: "football", source: "ESPN API" });
			const result = fetcher.formatResponse([]);
			expect(result.lastUpdated).toBeTruthy();
			expect(result.source).toBe("ESPN API");
			expect(result.tournaments).toEqual([]);
		});

		it("defaults source to API", () => {
			const fetcher = new TestFetcher({ sport: "football" });
			const result = fetcher.formatResponse([]);
			expect(result.source).toBe("API");
		});

		it("groups events by tournament", () => {
			const fetcher = new TestFetcher({ sport: "football" });
			const events = [
				makeEvent({ tournament: "Premier League" }),
				makeEvent({ tournament: "La Liga" }),
				makeEvent({ tournament: "Premier League" }),
			];
			const result = fetcher.formatResponse(events);
			expect(result.tournaments).toHaveLength(2);
			expect(result.tournaments[0].name).toBe("Premier League");
			expect(result.tournaments[0].events).toHaveLength(2);
			expect(result.tournaments[1].name).toBe("La Liga");
			expect(result.tournaments[1].events).toHaveLength(1);
		});
	});

	describe("groupEventsByTournament()", () => {
		it("groups events correctly", () => {
			const fetcher = new TestFetcher({ sport: "football" });
			const events = [
				makeEvent({ tournament: "A" }),
				makeEvent({ tournament: "B" }),
				makeEvent({ tournament: "A" }),
			];
			const result = fetcher.groupEventsByTournament(events);
			expect(result).toHaveLength(2);
			expect(result[0].name).toBe("A");
			expect(result[0].events).toHaveLength(2);
		});

		it("falls back to meta for tournament name", () => {
			const fetcher = new TestFetcher({ sport: "football" });
			const events = [makeEvent({ tournament: undefined, meta: "PGA Tour" })];
			const result = fetcher.groupEventsByTournament(events);
			expect(result[0].name).toBe("PGA Tour");
		});

		it("uses Unknown for events without tournament or meta", () => {
			const fetcher = new TestFetcher({ sport: "football" });
			const events = [makeEvent({ tournament: undefined, meta: undefined })];
			const result = fetcher.groupEventsByTournament(events);
			expect(result[0].name).toBe("Unknown");
		});

		it("returns empty array for no events", () => {
			const fetcher = new TestFetcher({ sport: "football" });
			const result = fetcher.groupEventsByTournament([]);
			expect(result).toEqual([]);
		});
	});

	describe("hasNorwegianInterest()", () => {
		it("returns false when no norwegian config", () => {
			const fetcher = new TestFetcher({ sport: "football" });
			expect(fetcher.hasNorwegianInterest(makeEvent())).toBe(false);
		});

		it("detects Norwegian team in homeTeam", () => {
			const fetcher = new TestFetcher({
				sport: "football",
				norwegian: { teams: ["Lyn Oslo"] },
			});
			const event = makeEvent({ homeTeam: "Lyn Oslo" });
			expect(fetcher.hasNorwegianInterest(event)).toBe(true);
		});

		it("detects Norwegian team in awayTeam", () => {
			const fetcher = new TestFetcher({
				sport: "football",
				norwegian: { teams: ["Bodø/Glimt"] },
			});
			const event = makeEvent({ awayTeam: "Bodø/Glimt" });
			expect(fetcher.hasNorwegianInterest(event)).toBe(true);
		});

		it("detects Norwegian team in title (case-insensitive)", () => {
			const fetcher = new TestFetcher({
				sport: "football",
				norwegian: { teams: ["rosenborg"] },
			});
			const event = makeEvent({ title: "Rosenborg vs Celtic" });
			expect(fetcher.hasNorwegianInterest(event)).toBe(true);
		});

		it("detects Norwegian player in event data", () => {
			const fetcher = new TestFetcher({
				sport: "golf",
				norwegian: { players: ["Viktor Hovland"] },
			});
			const event = makeEvent({
				norwegianPlayers: [{ name: "Viktor Hovland" }],
			});
			expect(fetcher.hasNorwegianInterest(event)).toBe(true);
		});

		it("returns false when no match", () => {
			const fetcher = new TestFetcher({
				sport: "football",
				norwegian: { teams: ["Lyn Oslo"], players: ["Haaland"] },
			});
			const event = makeEvent({
				title: "Arsenal vs Chelsea",
				homeTeam: "Arsenal",
				awayTeam: "Chelsea",
			});
			expect(fetcher.hasNorwegianInterest(event)).toBe(false);
		});
	});

	describe("fetchFromSource() abstract method", () => {
		it("throws when not overridden", async () => {
			const fetcher = new BaseFetcher({ sport: "football" });
			await expect(fetcher.fetchFromSource({})).rejects.toThrow(
				"fetchFromSource must be implemented by subclass"
			);
		});
	});

	describe("transformToEvents() abstract method", () => {
		it("throws when not overridden", () => {
			const fetcher = new BaseFetcher({ sport: "football" });
			expect(() => fetcher.transformToEvents([])).toThrow(
				"transformToEvents must be implemented by subclass"
			);
		});
	});
});
