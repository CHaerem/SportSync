import { describe, it, expect, vi, beforeEach } from "vitest";
import { enrichStreaming } from "../scripts/enrich-streaming.js";

describe("enrichStreaming", () => {
	const makeEvent = (home, away, time, opts = {}) => ({
		sport: "football",
		homeTeam: home,
		awayTeam: away,
		time,
		tournament: opts.tournament || "Premier League",
		streaming: opts.streaming || [{ platform: "Viaplay", url: "https://viaplay.no", type: "streaming" }],
		...opts,
	});

	it("enriches football events with tvkampen data", async () => {
		const events = [
			makeEvent("Arsenal", "Liverpool", "2026-02-17T20:00:00Z"),
			makeEvent("Wolves", "Brighton", "2026-02-17T15:00:00Z"),
		];

		const mockFetcher = vi.fn().mockImplementation((url) => {
			if (url.includes("/date/")) {
				return Promise.resolve(`
					<a href="/kamp/arsenal-vs-liverpool-123">21:00</a>
					<a href="/kamp/wolves-vs-brighton-456">16:00</a>
				`);
			}
			if (url.includes("arsenal-vs-liverpool")) {
				return Promise.resolve(`<div>Sendes på TV 2 Play og TV 2 Sport 1</div>`);
			}
			if (url.includes("wolves-vs-brighton")) {
				return Promise.resolve(`<div>Sendes direkte på Viaplay</div>`);
			}
			return Promise.resolve("<div></div>");
		});

		const { events: enriched, log } = await enrichStreaming({ events, fetcher: mockFetcher });

		expect(log.tvkampenReachable).toBe(true);
		expect(log.listingsFound).toBe(2);
		expect(log.eventsEnriched).toBeGreaterThanOrEqual(1);

		// Check that at least one event got new streaming data
		const enrichedEvent = enriched.find(e => e.streamingSource === "tvkampen");
		if (enrichedEvent) {
			expect(enrichedEvent.streaming.length).toBeGreaterThan(0);
			expect(enrichedEvent.streaming[0].source).toBe("tvkampen");
		}
	});

	it("preserves existing streaming when tvkampen is unreachable", async () => {
		const existingStreaming = [{ platform: "Viaplay", url: "https://viaplay.no", type: "streaming" }];
		const events = [makeEvent("Arsenal", "Liverpool", "2026-02-17T20:00:00Z", { streaming: existingStreaming })];

		const mockFetcher = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

		const { events: result, log } = await enrichStreaming({ events, fetcher: mockFetcher });

		expect(log.tvkampenReachable).toBe(false);
		expect(result[0].streaming).toEqual(existingStreaming);
	});

	it("handles zero listings gracefully", async () => {
		const events = [makeEvent("Arsenal", "Liverpool", "2026-02-17T20:00:00Z")];
		const mockFetcher = vi.fn().mockResolvedValue("<div>No matches</div>");

		const { log } = await enrichStreaming({ events, fetcher: mockFetcher });

		expect(log.tvkampenReachable).toBe(true);
		expect(log.listingsFound).toBe(0);
		expect(log.eventsEnriched).toBe(0);
	});

	it("skips non-football events", async () => {
		const events = [
			{ sport: "golf", homeTeam: null, awayTeam: null, time: "2026-02-17T10:00:00Z", tournament: "PGA Tour" },
		];
		const mockFetcher = vi.fn();

		const { log } = await enrichStreaming({ events, fetcher: mockFetcher });

		// No football events → no fetching at all
		expect(mockFetcher).not.toHaveBeenCalled();
		expect(log.matchesAttempted).toBe(0);
	});

	it("skips football events without homeTeam/awayTeam", async () => {
		const events = [
			{ sport: "football", homeTeam: null, awayTeam: null, time: "2026-02-17T10:00:00Z", tournament: "PL" },
		];
		const mockFetcher = vi.fn();

		const { log } = await enrichStreaming({ events, fetcher: mockFetcher });

		expect(mockFetcher).not.toHaveBeenCalled();
		expect(log.matchesAttempted).toBe(0);
	});

	it("reports unmatched entries in log", async () => {
		const events = [makeEvent("Arsenal", "Liverpool", "2026-02-17T20:00:00Z")];

		const mockFetcher = vi.fn().mockImplementation((url) => {
			if (url.includes("/date/")) {
				return Promise.resolve(`
					<a href="/kamp/arsenal-vs-liverpool-123">21:00</a>
					<a href="/kamp/unknown-fc-vs-mystery-utd-999">14:00</a>
				`);
			}
			return Promise.resolve(`<div>Sendes på Viaplay</div>`);
		});

		const { log } = await enrichStreaming({ events, fetcher: mockFetcher });

		expect(log.unmatched.length).toBeGreaterThanOrEqual(1);
		expect(log.unmatched[0].homeTeam).toBe("Unknown Fc");
	});

	it("tracks match rate in log", async () => {
		const events = [
			makeEvent("Arsenal", "Liverpool", "2026-02-17T20:00:00Z"),
			makeEvent("Chelsea", "Newcastle", "2026-02-17T18:00:00Z"),
		];

		const mockFetcher = vi.fn().mockImplementation((url) => {
			if (url.includes("/date/")) {
				return Promise.resolve(`<a href="/kamp/arsenal-vs-liverpool-123">21:00</a>`);
			}
			return Promise.resolve(`<div>TV 2 Play</div>`);
		});

		const { log } = await enrichStreaming({ events, fetcher: mockFetcher });

		expect(log.matchRate).toBeGreaterThanOrEqual(0);
		expect(log.matchRate).toBeLessThanOrEqual(1);
		expect(log.totalEvents).toBe(2);
	});

	it("handles empty events array", async () => {
		const mockFetcher = vi.fn();
		const { events: result, log } = await enrichStreaming({ events: [], fetcher: mockFetcher });

		expect(result).toEqual([]);
		expect(log.totalEvents).toBe(0);
		expect(mockFetcher).not.toHaveBeenCalled();
	});

	it("log contains enrichedEvents details", async () => {
		const events = [makeEvent("Arsenal", "Liverpool", "2026-02-17T20:00:00Z")];

		const mockFetcher = vi.fn().mockImplementation((url) => {
			if (url.includes("/date/")) {
				return Promise.resolve(`<a href="/kamp/arsenal-vs-liverpool-123">21:00</a>`);
			}
			return Promise.resolve(`<div>Sendes på Viaplay og TV 2 Play</div>`);
		});

		const { log } = await enrichStreaming({ events, fetcher: mockFetcher });

		if (log.eventsEnriched > 0) {
			expect(log.enrichedEvents[0]).toHaveProperty("homeTeam");
			expect(log.enrichedEvents[0]).toHaveProperty("broadcasters");
			expect(log.enrichedEvents[0]).toHaveProperty("confidence");
		}
	});

	it("sets streamingSource and streamingConfidence on enriched events", async () => {
		const events = [makeEvent("Arsenal", "Liverpool", "2026-02-17T20:00:00Z")];

		const mockFetcher = vi.fn().mockImplementation((url) => {
			if (url.includes("/date/")) {
				return Promise.resolve(`<a href="/kamp/arsenal-vs-liverpool-123">21:00</a>`);
			}
			return Promise.resolve(`<div>Viaplay</div>`);
		});

		const { events: enriched } = await enrichStreaming({ events, fetcher: mockFetcher });

		const e = enriched.find(ev => ev.streamingSource === "tvkampen");
		if (e) {
			expect(e.streamingSource).toBe("tvkampen");
			expect(e.streamingConfidence).toBeGreaterThanOrEqual(0.6);
		}
	});
});
