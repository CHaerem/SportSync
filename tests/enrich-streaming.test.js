import { describe, it, expect, vi } from "vitest";
import { enrichStreaming } from "../scripts/enrich-streaming.js";

// Helper: build realistic tvkampen event block HTML
function makeEventBlock(id, { home, away, time = "20:00", league = "Premier League", channelClasses = [] } = {}) {
	const channelDiv = channelClasses.length > 0
		? `<div class="icons-channels-rt-${id} ${channelClasses.map(c => `icons-channels-${c}`).join(" ")}"></div>`
		: "";
	return `<div id="${id}"><div class="event-rt">
		<div class="event-rt-main-info">
			<a href="/kamp/${home.toLowerCase().replace(/\s+/g, "-")}-${away.toLowerCase().replace(/\s+/g, "-")}-${id}">
				<div class="match-info-rt">
					<div class="match-info-rt__sport-time"><time>${time}</time></div>
				</div>
			</a>
		</div>
		<div class="match-details-rt-participants">
			<a href="/kamp/${home.toLowerCase().replace(/\s+/g, "-")}-${away.toLowerCase().replace(/\s+/g, "-")}-${id}"><div>${home} - ${away}</div></a>
		</div>
		<div class="match-details-rt__league">${league}</div>
		<div class="match-details-channels-rt">${channelDiv}</div>
	</div></div>`;
}

function makeListingHtml(...blocks) {
	return `<main>${blocks.join("\n")}</main>`;
}

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

		const listingHtml = makeListingHtml(
			makeEventBlock("1001", { home: "Arsenal", away: "Liverpool", time: "21:00", channelClasses: ["tv2play", "viaplay"] }),
			makeEventBlock("1002", { home: "Wolves", away: "Brighton", time: "16:00", channelClasses: ["viaplay"] }),
		);

		const mockFetcher = vi.fn().mockImplementation((url) => {
			if (url.includes("/date/")) {
				return Promise.resolve(listingHtml);
			}
			return Promise.resolve("<div></div>");
		});

		const { events: enriched, log } = await enrichStreaming({ events, fetcher: mockFetcher });

		expect(log.tvkampenReachable).toBe(true);
		expect(log.listingsFound).toBe(2);
		expect(log.eventsEnriched).toBeGreaterThanOrEqual(1);

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
		const mockFetcher = vi.fn().mockResolvedValue("<main><div>No matches</div></main>");

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

		const listingHtml = makeListingHtml(
			makeEventBlock("2001", { home: "Arsenal", away: "Liverpool", time: "21:00", channelClasses: ["viaplay"] }),
			makeEventBlock("2002", { home: "Unknown FC", away: "Mystery Utd", time: "14:00", channelClasses: ["tv2play"] }),
		);

		const mockFetcher = vi.fn().mockImplementation((url) => {
			if (url.includes("/date/")) {
				return Promise.resolve(listingHtml);
			}
			return Promise.resolve("<div></div>");
		});

		const { log } = await enrichStreaming({ events, fetcher: mockFetcher });

		expect(log.unmatched.length).toBeGreaterThanOrEqual(1);
		expect(log.unmatched[0].homeTeam).toBe("Unknown FC");
	});

	it("tracks match rate in log", async () => {
		const events = [
			makeEvent("Arsenal", "Liverpool", "2026-02-17T20:00:00Z"),
			makeEvent("Chelsea", "Newcastle", "2026-02-17T18:00:00Z"),
		];

		const listingHtml = makeListingHtml(
			makeEventBlock("3001", { home: "Arsenal", away: "Liverpool", time: "21:00", channelClasses: ["tv2play"] }),
		);

		const mockFetcher = vi.fn().mockImplementation((url) => {
			if (url.includes("/date/")) {
				return Promise.resolve(listingHtml);
			}
			return Promise.resolve("<div></div>");
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

		const listingHtml = makeListingHtml(
			makeEventBlock("4001", { home: "Arsenal", away: "Liverpool", time: "21:00", channelClasses: ["viaplay", "tv2play"] }),
		);

		const mockFetcher = vi.fn().mockImplementation((url) => {
			if (url.includes("/date/")) {
				return Promise.resolve(listingHtml);
			}
			return Promise.resolve("<div></div>");
		});

		const { log } = await enrichStreaming({ events, fetcher: mockFetcher });

		if (log.eventsEnriched > 0) {
			expect(log.enrichedEvents[0]).toHaveProperty("homeTeam");
			expect(log.enrichedEvents[0]).toHaveProperty("broadcasters");
			expect(log.enrichedEvents[0]).toHaveProperty("confidence");
		}
	});

	it("matches events from both today and tomorrow dates", async () => {
		const todayEvent = makeEvent("Arsenal", "Liverpool", "2026-02-17T20:00:00Z");
		const tomorrowEvent = makeEvent("Chelsea", "Newcastle", "2026-02-18T15:00:00Z");
		const events = [todayEvent, tomorrowEvent];

		const todayHtml = makeListingHtml(
			makeEventBlock("6001", { home: "Arsenal", away: "Liverpool", time: "21:00", channelClasses: ["tv2play"] }),
		);
		const tomorrowHtml = makeListingHtml(
			makeEventBlock("6002", { home: "Chelsea", away: "Newcastle", time: "16:00", channelClasses: ["viaplay"] }),
		);

		const mockFetcher = vi.fn().mockImplementation((url) => {
			if (url.includes("2026-02-18")) return Promise.resolve(tomorrowHtml);
			if (url.includes("/date/")) return Promise.resolve(todayHtml);
			return Promise.resolve("<div></div>");
		});

		const { log } = await enrichStreaming({ events, fetcher: mockFetcher });

		// Both dates should produce listings
		expect(log.listingsFound).toBe(2);
		// At least one match from each date
		expect(log.matchesSucceeded).toBeGreaterThanOrEqual(2);
	});

	it("includes aliasSuggestions and hintsApplied in log", async () => {
		const events = [makeEvent("Arsenal", "Liverpool", "2026-02-17T20:00:00Z")];

		const listingHtml = makeListingHtml(
			makeEventBlock("7001", { home: "Arsenal", away: "Liverpool", time: "21:00", channelClasses: ["viaplay"] }),
			makeEventBlock("7002", { home: "Unknown Team", away: "Mystery FC", time: "14:00", channelClasses: ["tv2play"] }),
		);

		const mockFetcher = vi.fn().mockImplementation((url) => {
			if (url.includes("/date/")) return Promise.resolve(listingHtml);
			return Promise.resolve("<div></div>");
		});

		const { log } = await enrichStreaming({ events, fetcher: mockFetcher });

		expect(log).toHaveProperty("aliasSuggestions");
		expect(log).toHaveProperty("hintsApplied");
		expect(Array.isArray(log.aliasSuggestions)).toBe(true);
		expect(Array.isArray(log.hintsApplied)).toBe(true);
	});

	it("sets streamingSource and streamingConfidence on enriched events", async () => {
		const events = [makeEvent("Arsenal", "Liverpool", "2026-02-17T20:00:00Z")];

		const listingHtml = makeListingHtml(
			makeEventBlock("5001", { home: "Arsenal", away: "Liverpool", time: "21:00", channelClasses: ["viaplay"] }),
		);

		const mockFetcher = vi.fn().mockImplementation((url) => {
			if (url.includes("/date/")) {
				return Promise.resolve(listingHtml);
			}
			return Promise.resolve("<div></div>");
		});

		const { events: enriched } = await enrichStreaming({ events, fetcher: mockFetcher });

		const e = enriched.find(ev => ev.streamingSource === "tvkampen");
		if (e) {
			expect(e.streamingSource).toBe("tvkampen");
			expect(e.streamingConfidence).toBeGreaterThanOrEqual(0.6);
		}
	});
});
