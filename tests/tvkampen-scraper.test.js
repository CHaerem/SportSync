import { describe, it, expect, vi } from "vitest";
import {
	parseListingPage,
	parseMatchPage,
	parseTeamsFromUrl,
	fetchSportListings,
	fetchMatchBroadcasters,
	fetchListingsWithBroadcasters,
} from "../scripts/lib/tvkampen-scraper.js";

// --- parseTeamsFromUrl ---

describe("parseTeamsFromUrl", () => {
	it("parses standard vs slug", () => {
		const result = parseTeamsFromUrl("/kamp/arsenal-vs-liverpool-12345");
		expect(result).toEqual({ home: "Arsenal", away: "Liverpool" });
	});

	it("parses Norwegian mot slug", () => {
		const result = parseTeamsFromUrl("/kamp/rosenborg-mot-molde-67890");
		expect(result).toEqual({ home: "Rosenborg", away: "Molde" });
	});

	it("handles multi-word team names", () => {
		const result = parseTeamsFromUrl("/kamp/manchester-city-vs-west-ham-united-11111");
		expect(result).toEqual({ home: "Manchester City", away: "West Ham United" });
	});

	it("returns null for invalid slugs", () => {
		expect(parseTeamsFromUrl("/kamp/no-separator-here-123")).toBeNull();
		expect(parseTeamsFromUrl("/other/path")).toBeNull();
	});

	it("handles full URL with query params", () => {
		const result = parseTeamsFromUrl("https://www.tvkampen.com/kamp/wolves-vs-arsenal-99999?ref=foo");
		expect(result).toEqual({ home: "Wolves", away: "Arsenal" });
	});

	it("capitalizes each word", () => {
		const result = parseTeamsFromUrl("/kamp/borussia-dortmund-vs-real-madrid-555");
		expect(result).toEqual({ home: "Borussia Dortmund", away: "Real Madrid" });
	});
});

// --- parseListingPage ---

describe("parseListingPage", () => {
	it("extracts matches from anchor links to /kamp/", () => {
		const html = `
			<div>
				<a href="/kamp/arsenal-vs-liverpool-123">
					<span>20:45</span> Arsenal - Liverpool
				</a>
				<a href="/kamp/wolves-vs-brighton-456">
					<span>18:30</span> Wolves - Brighton
				</a>
			</div>
		`;
		const result = parseListingPage(html);
		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			matchUrl: "https://www.tvkampen.com/kamp/arsenal-vs-liverpool-123",
			homeTeam: "Arsenal",
			awayTeam: "Liverpool",
			time: "20:45",
		});
		expect(result[1]).toMatchObject({
			matchUrl: "https://www.tvkampen.com/kamp/wolves-vs-brighton-456",
			homeTeam: "Wolves",
			awayTeam: "Brighton",
			time: "18:30",
		});
	});

	it("deduplicates by matchUrl", () => {
		const html = `
			<a href="/kamp/arsenal-vs-liverpool-123">20:45</a>
			<a href="/kamp/arsenal-vs-liverpool-123">20:45</a>
		`;
		const result = parseListingPage(html);
		expect(result).toHaveLength(1);
	});

	it("extracts matches from table rows", () => {
		const html = `
			<table>
				<tr><td><a href="/kamp/chelsea-vs-newcastle-789">21:00</a></td></tr>
			</table>
		`;
		const result = parseListingPage(html);
		expect(result).toHaveLength(1);
		expect(result[0].homeTeam).toBe("Chelsea");
		expect(result[0].awayTeam).toBe("Newcastle");
	});

	it("returns empty array for page with no match links", () => {
		const html = `<div><p>No matches today</p></div>`;
		expect(parseListingPage(html)).toEqual([]);
	});

	it("skips links without vs or mot separator", () => {
		const html = `<a href="/kamp/some-random-page-123">Link</a>`;
		expect(parseListingPage(html)).toEqual([]);
	});
});

// --- parseMatchPage ---

describe("parseMatchPage", () => {
	it("extracts broadcasters from Vises på section", () => {
		const html = `
			<div>
				<h3>Vises på:</h3>
				<div>TV 2 Play, V Sport 1</div>
			</div>
		`;
		const result = parseMatchPage(html);
		expect(result).toContain("TV 2 Play");
		expect(result).toContain("V Sport 1");
	});

	it("extracts broadcasters from channel class elements", () => {
		const html = `
			<span class="channel-name">Viaplay</span>
			<span class="broadcaster-label">Discovery+</span>
		`;
		const result = parseMatchPage(html);
		expect(result).toContain("Viaplay");
		expect(result).toContain("Discovery+");
	});

	it("detects known broadcaster names in page text", () => {
		const html = `<p>Denne kampen sendes på TV 2 Sport 1 og TV 2 Play fra klokken 20:30.</p>`;
		const result = parseMatchPage(html);
		expect(result).toContain("TV 2 Sport 1");
		expect(result).toContain("TV 2 Play");
	});

	it("filters out betting sites", () => {
		const html = `
			<div>
				Vises på: </div><div>Viaplay, Bet365, Stake</div>
		`;
		const result = parseMatchPage(html);
		expect(result).toContain("Viaplay");
		expect(result).not.toContain("Bet365");
		expect(result).not.toContain("Stake");
	});

	it("returns empty array for page with no broadcaster info", () => {
		const html = `<div><p>Match details page with no streaming info</p></div>`;
		expect(parseMatchPage(html)).toEqual([]);
	});

	it("detects NRK channels", () => {
		const html = `<div>Sendes på NRK1 kl 19:00</div>`;
		const result = parseMatchPage(html);
		expect(result).toContain("NRK1");
	});

	it("detects MAX and DAZN", () => {
		const html = `<div>Stream live on DAZN or MAX</div>`;
		const result = parseMatchPage(html);
		expect(result).toContain("DAZN");
		expect(result).toContain("MAX");
	});
});

// --- fetchSportListings ---

describe("fetchSportListings", () => {
	it("calls fetcher with correct URL and parses result", async () => {
		const mockFetcher = vi.fn().mockResolvedValue(
			`<a href="/kamp/arsenal-vs-chelsea-111">20:00</a>`
		);
		const result = await fetchSportListings("fotball", "2026-02-17", mockFetcher);
		expect(mockFetcher).toHaveBeenCalledWith("https://www.tvkampen.com/fotball/date/2026-02-17");
		expect(result).toHaveLength(1);
		expect(result[0].homeTeam).toBe("Arsenal");
	});

	it("returns empty array on fetch error", async () => {
		const mockFetcher = vi.fn().mockRejectedValue(new Error("Network error"));
		const result = await fetchSportListings("fotball", "2026-02-17", mockFetcher);
		expect(result).toEqual([]);
	});
});

// --- fetchMatchBroadcasters ---

describe("fetchMatchBroadcasters", () => {
	it("fetches and parses match page", async () => {
		const mockFetcher = vi.fn().mockResolvedValue(
			`<div>Vises på:</div><div>TV 2 Play</div>`
		);
		const result = await fetchMatchBroadcasters("https://www.tvkampen.com/kamp/test-vs-test-1", mockFetcher);
		expect(result).toContain("TV 2 Play");
	});

	it("returns empty array on error", async () => {
		const mockFetcher = vi.fn().mockRejectedValue(new Error("404"));
		const result = await fetchMatchBroadcasters("https://www.tvkampen.com/kamp/bad-1", mockFetcher);
		expect(result).toEqual([]);
	});
});

// --- fetchListingsWithBroadcasters ---

describe("fetchListingsWithBroadcasters", () => {
	it("fetches listings and broadcaster data", async () => {
		let callCount = 0;
		const mockFetcher = vi.fn().mockImplementation((url) => {
			callCount++;
			if (url.includes("/date/")) {
				return Promise.resolve(`<a href="/kamp/wolves-vs-arsenal-999">18:30</a>`);
			}
			return Promise.resolve(`<div>Sendes på Viaplay kl 18:30</div>`);
		});

		const result = await fetchListingsWithBroadcasters("fotball", ["2026-02-17"], mockFetcher);
		expect(result).toHaveLength(1);
		expect(result[0].homeTeam).toBe("Wolves");
		expect(result[0].broadcasters).toContain("Viaplay");
	});

	it("deduplicates listings across dates", async () => {
		const mockFetcher = vi.fn().mockImplementation((url) => {
			if (url.includes("/date/")) {
				return Promise.resolve(`<a href="/kamp/wolves-vs-arsenal-999">18:30</a>`);
			}
			return Promise.resolve(`<div>Viaplay</div>`);
		});

		const result = await fetchListingsWithBroadcasters("fotball", ["2026-02-17", "2026-02-18"], mockFetcher);
		// Same match URL across both dates — should deduplicate to 1
		expect(result).toHaveLength(1);
	});

	it("handles empty listings gracefully", async () => {
		const mockFetcher = vi.fn().mockResolvedValue("<div>No matches</div>");
		const result = await fetchListingsWithBroadcasters("fotball", ["2026-02-17"], mockFetcher);
		expect(result).toEqual([]);
	});
});
