import { describe, it, expect, vi } from "vitest";
import {
	parseListingPage,
	parseMatchPage,
	parseTeamsFromUrl,
	parseTeamsFromText,
	extractChannelsFromIcons,
	CHANNEL_CLASS_MAP,
	fetchSportListings,
	fetchMatchBroadcasters,
	fetchListingsWithBroadcasters,
} from "../scripts/lib/tvkampen-scraper.js";

// --- Helper: build realistic event block HTML ---

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

// --- parseTeamsFromText ---

describe("parseTeamsFromText", () => {
	it("parses 'Home - Away' format", () => {
		expect(parseTeamsFromText("Arsenal - Liverpool")).toEqual({ home: "Arsenal", away: "Liverpool" });
	});

	it("parses 'Home vs Away' format", () => {
		expect(parseTeamsFromText("Arsenal vs Liverpool")).toEqual({ home: "Arsenal", away: "Liverpool" });
	});

	it("parses Norwegian 'Home mot Away' format", () => {
		expect(parseTeamsFromText("Rosenborg mot Molde")).toEqual({ home: "Rosenborg", away: "Molde" });
	});

	it("handles multi-word team names", () => {
		expect(parseTeamsFromText("Manchester City - West Ham United")).toEqual({ home: "Manchester City", away: "West Ham United" });
	});

	it("returns null for text without separator", () => {
		expect(parseTeamsFromText("Just some random text")).toBeNull();
	});

	it("returns null for empty/null input", () => {
		expect(parseTeamsFromText("")).toBeNull();
		expect(parseTeamsFromText(null)).toBeNull();
	});

	it("strips HTML comments", () => {
		expect(parseTeamsFromText("Arsenal <!-- ad --> - <!-- ad --> Liverpool")).toEqual({ home: "Arsenal", away: "Liverpool" });
	});

	it("returns null for single-char team names", () => {
		expect(parseTeamsFromText("A - B")).toBeNull();
	});
});

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

	it("returns null for slugs without vs/mot", () => {
		expect(parseTeamsFromUrl("/kamp/arsenal-liverpool-123")).toBeNull();
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

// --- extractChannelsFromIcons ---

describe("extractChannelsFromIcons", () => {
	it("extracts known channels from CSS classes", () => {
		const html = `<div class="icons-channels-rt-123 icons-channels-viaplay icons-channels-tv2play"></div>`;
		const result = extractChannelsFromIcons(html);
		expect(result).toContain("Viaplay");
		expect(result).toContain("TV 2 Play");
	});

	it("extracts DAZN and MAX", () => {
		const html = `<div class="icons-channels-dazn icons-channels-max"></div>`;
		const result = extractChannelsFromIcons(html);
		expect(result).toContain("DAZN");
		expect(result).toContain("MAX");
	});

	it("extracts Eurosport variants", () => {
		const html = `<div class="icons-channels-eurosport icons-channels-eurosportnorge"></div>`;
		const result = extractChannelsFromIcons(html);
		expect(result).toContain("Eurosport 1");
		expect(result).toContain("Eurosport Norge");
	});

	it("skips numeric-only icon IDs", () => {
		const html = `<div class="icons-channels-12345 icons-channels-viaplay"></div>`;
		const result = extractChannelsFromIcons(html);
		expect(result).toEqual(["Viaplay"]);
	});

	it("skips 'default' class", () => {
		const html = `<div class="icons-channels-default icons-channels-tv2play"></div>`;
		const result = extractChannelsFromIcons(html);
		expect(result).toEqual(["TV 2 Play"]);
	});

	it("deduplicates channels", () => {
		const html = `
			<div class="icons-channels-viaplay"></div>
			<div class="icons-channels-viaplay"></div>
		`;
		const result = extractChannelsFromIcons(html);
		expect(result).toEqual(["Viaplay"]);
	});

	it("returns empty array when no icon classes", () => {
		const html = `<div class="some-other-class"></div>`;
		expect(extractChannelsFromIcons(html)).toEqual([]);
	});

	it("maps all entries in CHANNEL_CLASS_MAP", () => {
		for (const [key, expected] of Object.entries(CHANNEL_CLASS_MAP)) {
			const html = `<div class="icons-channels-${key}"></div>`;
			const result = extractChannelsFromIcons(html);
			expect(result).toContain(expected);
		}
	});
});

// --- parseListingPage ---

describe("parseListingPage", () => {
	it("extracts matches from event blocks (primary strategy)", () => {
		const html = makeListingHtml(
			makeEventBlock("1001", { home: "Arsenal", away: "Liverpool", time: "20:45", channelClasses: ["viaplay"] }),
			makeEventBlock("1002", { home: "Wolves", away: "Brighton", time: "18:30", channelClasses: ["tv2play"] }),
		);
		const result = parseListingPage(html);
		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			matchUrl: "https://www.tvkampen.com/kamp/arsenal-liverpool-1001",
			homeTeam: "Arsenal",
			awayTeam: "Liverpool",
			time: "20:45",
			league: "Premier League",
		});
		expect(result[0].broadcasters).toContain("Viaplay");
		expect(result[1]).toMatchObject({
			matchUrl: "https://www.tvkampen.com/kamp/wolves-brighton-1002",
			homeTeam: "Wolves",
			awayTeam: "Brighton",
			time: "18:30",
		});
		expect(result[1].broadcasters).toContain("TV 2 Play");
	});

	it("deduplicates by matchUrl", () => {
		const block = makeEventBlock("1001", { home: "Arsenal", away: "Liverpool" });
		const html = makeListingHtml(block, block);
		const result = parseListingPage(html);
		expect(result).toHaveLength(1);
	});

	it("extracts league name", () => {
		const html = makeListingHtml(
			makeEventBlock("2001", { home: "Benfica", away: "Real Madrid", league: "Champions League" }),
		);
		const result = parseListingPage(html);
		expect(result[0].league).toBe("Champions League");
	});

	it("extracts multiple channel icons from one block", () => {
		const html = makeListingHtml(
			makeEventBlock("3001", {
				home: "Benfica",
				away: "Real Madrid",
				channelClasses: ["tv2play", "viaplay", "eurosportnorge", "max"],
			}),
		);
		const result = parseListingPage(html);
		expect(result[0].broadcasters).toContain("TV 2 Play");
		expect(result[0].broadcasters).toContain("Viaplay");
		expect(result[0].broadcasters).toContain("Eurosport Norge");
		expect(result[0].broadcasters).toContain("MAX");
	});

	it("handles blocks with no channel icons", () => {
		const html = makeListingHtml(
			makeEventBlock("4001", { home: "Chelsea", away: "Newcastle", channelClasses: [] }),
		);
		const result = parseListingPage(html);
		expect(result[0].broadcasters).toEqual([]);
	});

	it("returns empty array for page with no event blocks", () => {
		const html = `<main><div><p>No matches today</p></div></main>`;
		expect(parseListingPage(html)).toEqual([]);
	});

	it("falls back to anchor tag parsing when no event blocks found", () => {
		const html = `
			<div>
				<a href="/kamp/arsenal-liverpool-123">Arsenal - Liverpool</a>
			</div>
		`;
		const result = parseListingPage(html);
		expect(result).toHaveLength(1);
		expect(result[0].homeTeam).toBe("Arsenal");
		expect(result[0].awayTeam).toBe("Liverpool");
		expect(result[0].matchUrl).toBe("https://www.tvkampen.com/kamp/arsenal-liverpool-123");
	});

	it("fallback skips links without team separator", () => {
		const html = `<a href="/kamp/some-random-page-123">Link text</a>`;
		expect(parseListingPage(html)).toEqual([]);
	});

	it("fallback deduplicates by URL", () => {
		const html = `
			<a href="/kamp/test-match-123">Test FC - Match FC</a>
			<a href="/kamp/test-match-123">Test FC - Match FC</a>
		`;
		const result = parseListingPage(html);
		expect(result).toHaveLength(1);
	});
});

// --- parseMatchPage ---

describe("parseMatchPage", () => {
	it("extracts from rt-match-channel-list__channel-text spans", () => {
		const html = `
			<div class="rt-match-channel-list">
				<span class="rt-match-channel-list__channel-text">TV 2 Play</span>
				<span class="rt-match-channel-list__channel-text">Viaplay</span>
			</div>
		`;
		const result = parseMatchPage(html);
		expect(result).toContain("TV 2 Play");
		expect(result).toContain("Viaplay");
	});

	it("extracts from icon CSS classes in channel list section", () => {
		const html = `
			<div class="rt-match-channel-list">
				<div class="icons-channels-dazn icons-channels-max"></div>
			</div>
		`;
		const result = parseMatchPage(html);
		expect(result).toContain("DAZN");
		expect(result).toContain("MAX");
	});

	it("detects known broadcaster names in page text", () => {
		const html = `<p>Denne kampen sendes på TV 2 Sport 1 og TV 2 Play fra klokken 20:30.</p>`;
		const result = parseMatchPage(html);
		expect(result).toContain("TV 2 Sport 1");
		expect(result).toContain("TV 2 Play");
	});

	it("filters out betting sites", () => {
		const html = `
			<div class="rt-match-channel-list">
				<span class="rt-match-channel-list__channel-text">Viaplay</span>
				<span class="rt-match-channel-list__channel-text">Bet365</span>
				<span class="rt-match-channel-list__channel-text">Stake</span>
			</div>
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

	it("detects MAX and DAZN in text", () => {
		const html = `<div>Stream live on DAZN or MAX</div>`;
		const result = parseMatchPage(html);
		expect(result).toContain("DAZN");
		expect(result).toContain("MAX");
	});

	it("extracts from aria-label on channel items", () => {
		const html = `
			<div class="rt-match-channel-list__item" aria-label="TV 2 Play (NO)"></div>
		`;
		const result = parseMatchPage(html);
		expect(result).toContain("TV 2 Play");
	});

	it("deduplicates across extraction methods", () => {
		const html = `
			<div class="rt-match-channel-list">
				<span class="rt-match-channel-list__channel-text">Viaplay</span>
				<div class="icons-channels-viaplay"></div>
			</div>
			<p>Se kampen på Viaplay.</p>
		`;
		const result = parseMatchPage(html);
		const viaplayCount = result.filter(b => b === "Viaplay").length;
		expect(viaplayCount).toBe(1);
	});
});

// --- fetchSportListings ---

describe("fetchSportListings", () => {
	it("calls fetcher with correct URL and parses result", async () => {
		const html = makeListingHtml(
			makeEventBlock("5001", { home: "Arsenal", away: "Chelsea", time: "20:00", channelClasses: ["viaplay"] }),
		);
		const mockFetcher = vi.fn().mockResolvedValue(html);
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
			`<div class="rt-match-channel-list">
				<span class="rt-match-channel-list__channel-text">TV 2 Play</span>
			</div>`
		);
		const result = await fetchMatchBroadcasters("https://www.tvkampen.com/kamp/test-test-1", mockFetcher);
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
	it("fetches listings with channel icons from listing page", async () => {
		const listingHtml = makeListingHtml(
			makeEventBlock("6001", { home: "Wolves", away: "Arsenal", time: "18:30", channelClasses: ["viaplay"] }),
		);
		const mockFetcher = vi.fn().mockImplementation((url) => {
			if (url.includes("/date/")) {
				return Promise.resolve(listingHtml);
			}
			return Promise.resolve("<div></div>");
		});

		const result = await fetchListingsWithBroadcasters("fotball", ["2026-02-17"], mockFetcher);
		expect(result).toHaveLength(1);
		expect(result[0].homeTeam).toBe("Wolves");
		expect(result[0].broadcasters).toContain("Viaplay");
	});

	it("fetches match page for entries without icon channels", async () => {
		const listingHtml = makeListingHtml(
			makeEventBlock("7001", { home: "Wolves", away: "Arsenal", time: "18:30", channelClasses: [] }),
		);
		const mockFetcher = vi.fn().mockImplementation((url) => {
			if (url.includes("/date/")) {
				return Promise.resolve(listingHtml);
			}
			return Promise.resolve(`<div>Sendes på Viaplay kl 18:30</div>`);
		});

		const result = await fetchListingsWithBroadcasters("fotball", ["2026-02-17"], mockFetcher);
		expect(result).toHaveLength(1);
		expect(result[0].broadcasters).toContain("Viaplay");
	});

	it("deduplicates listings across dates", async () => {
		const listingHtml = makeListingHtml(
			makeEventBlock("8001", { home: "Wolves", away: "Arsenal", time: "18:30", channelClasses: ["viaplay"] }),
		);
		const mockFetcher = vi.fn().mockImplementation((url) => {
			if (url.includes("/date/")) {
				return Promise.resolve(listingHtml);
			}
			return Promise.resolve("<div></div>");
		});

		const result = await fetchListingsWithBroadcasters("fotball", ["2026-02-17", "2026-02-18"], mockFetcher);
		expect(result).toHaveLength(1);
	});

	it("handles empty listings gracefully", async () => {
		const mockFetcher = vi.fn().mockResolvedValue("<main><div>No matches</div></main>");
		const result = await fetchListingsWithBroadcasters("fotball", ["2026-02-17"], mockFetcher);
		expect(result).toEqual([]);
	});

	it("first date error propagates for reachability detection", async () => {
		const mockFetcher = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
		await expect(
			fetchListingsWithBroadcasters("fotball", ["2026-02-17"], mockFetcher)
		).rejects.toThrow("ECONNREFUSED");
	});
});
