import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetch globally before importing
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { F1Fetcher } = await import("../scripts/fetch/f1.js");

function makeESPNEvent(overrides = {}) {
	return {
		name: "Qatar Airways Australian Grand Prix",
		shortName: "AUS GP",
		date: new Date(Date.now() + 3 * 86400000).toISOString(),
		status: { type: { name: "STATUS_SCHEDULED" } },
		competitions: [
			{
				venue: { fullName: "Albert Park Circuit" },
				competitors: [
					{ homeAway: "home", team: { displayName: "Max Verstappen" } },
					{ homeAway: "away", team: { displayName: "Lewis Hamilton" } },
				],
				broadcasts: [{ market: "national", names: ["ESPN"] }],
			},
		],
		...overrides,
	};
}

describe("F1Fetcher", () => {
	let fetcher;

	beforeEach(() => {
		fetcher = new F1Fetcher();
		mockFetch.mockReset();
	});

	describe("constructor", () => {
		it("uses formula1 sport from config", () => {
			expect(fetcher.config.sport).toBe("formula1");
		});

		it("has ESPN source configured", () => {
			expect(fetcher.config.sources).toBeDefined();
			expect(fetcher.config.sources[0].api).toBe("espn");
		});
	});

	describe("transformESPNEvent()", () => {
		it("returns event with F1-specific meta", () => {
			const raw = makeESPNEvent();
			const result = fetcher.transformESPNEvent(raw);
			expect(result).toBeTruthy();
			const year = new Date().getFullYear();
			expect(result.meta).toBe(`Formula 1 ${year} - Race Weekend`);
		});

		it("sets norwegian to false for all F1 events", () => {
			const raw = makeESPNEvent();
			const result = fetcher.transformESPNEvent(raw);
			expect(result.norwegian).toBe(false);
		});

		it("preserves venue from ESPN data", () => {
			const raw = makeESPNEvent();
			const result = fetcher.transformESPNEvent(raw);
			expect(result.venue).toBe("Albert Park Circuit");
		});

		it("uses fallback venue when none provided", () => {
			const raw = makeESPNEvent({
				competitions: [{ competitors: [], broadcasts: [] }],
			});
			const result = fetcher.transformESPNEvent(raw);
			// Parent sets "TBD", then F1 override only replaces falsy venues
			// The venue will be "TBD" from the parent adapter
			expect(result.venue).toBeTruthy();
		});

		it("returns null for null input", () => {
			expect(fetcher.transformESPNEvent(null)).toBeNull();
		});

		it("returns null when no competitions", () => {
			expect(fetcher.transformESPNEvent({ name: "GP", date: "2026-01-01" })).toBeNull();
		});

		it("preserves event title", () => {
			const raw = makeESPNEvent({ name: "Monaco Grand Prix" });
			const result = fetcher.transformESPNEvent(raw);
			expect(result.title).toBe("Monaco Grand Prix");
		});

		it("preserves event time", () => {
			const time = "2026-03-15T14:00:00Z";
			const raw = makeESPNEvent({ date: time });
			const result = fetcher.transformESPNEvent(raw);
			expect(result.time).toBe(time);
		});

		it("extracts streaming/broadcast info", () => {
			const raw = makeESPNEvent();
			const result = fetcher.transformESPNEvent(raw);
			expect(result.streaming).toBeDefined();
			expect(Array.isArray(result.streaming)).toBe(true);
		});
	});

	describe("fetch()", () => {
		it("returns tournaments structure on success", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({
					events: [makeESPNEvent()],
				}),
			});

			const result = await fetcher.fetch();
			expect(result).toBeDefined();
			expect(result.tournaments).toBeDefined();
			expect(Array.isArray(result.tournaments)).toBe(true);
		});

		it("appends dates=<currentYear> to the ESPN F1 scoreboard URL", async () => {
			// Regression guard: without a dates param, ESPN's F1 scoreboard
			// silently returns only the single most-recent race (stale data).
			const calledUrls = [];
			fetcher.apiClient.fetchJSON = vi.fn(async (url) => {
				calledUrls.push(url);
				return { events: [] };
			});

			await fetcher.fetch();

			const year = new Date().getFullYear();
			const f1Calls = calledUrls.filter(u => /racing\/f1\/scoreboard/.test(u));
			expect(f1Calls.length).toBeGreaterThan(0);
			for (const url of f1Calls) {
				expect(url).toMatch(new RegExp(`[?&]dates=${year}`));
			}
		});

		it("returns multiple events when ESPN responds with a full season", async () => {
			// Regression guard for the 'only 1 event' stale-data bug:
			// the fetcher must pass through multiple future races.
			const now = Date.now();
			const makeRace = (offsetDays, name) =>
				makeESPNEvent({
					name,
					date: new Date(now + offsetDays * 86400000).toISOString(),
				});

			fetcher.apiClient.fetchJSON = vi.fn(async () => ({
				events: [
					makeRace(3, "Bahrain GP"),
					makeRace(10, "Saudi Arabian GP"),
					makeRace(17, "Japanese GP"),
					makeRace(24, "Chinese GP"),
				],
			}));

			const result = await fetcher.fetch();
			const total = result.tournaments.reduce(
				(sum, t) => sum + (t.events?.length || 0),
				0
			);
			expect(total).toBeGreaterThanOrEqual(2);
		});

		it("handles empty API response", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({ events: [] }),
			});

			const result = await fetcher.fetch();
			expect(result).toBeDefined();
			expect(result.tournaments).toBeDefined();
		});

		it("handles API error gracefully", async () => {
			mockFetch.mockRejectedValue(new Error("Network error"));

			const result = await fetcher.fetch();
			// Should not throw — BaseFetcher handles errors
			expect(result).toBeDefined();
		});
	});
});
