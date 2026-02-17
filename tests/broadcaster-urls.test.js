import { describe, it, expect } from "vitest";
import {
	buildStreamingEntry,
	buildStreamingEntries,
	BROADCASTER_MAP,
} from "../scripts/lib/broadcaster-urls.js";

describe("buildStreamingEntry", () => {
	it("maps TV 2 Play to correct URL and type", () => {
		const entry = buildStreamingEntry("TV 2 Play");
		expect(entry.platform).toBe("TV 2 Play");
		expect(entry.url).toContain("play.tv2.no");
		expect(entry.type).toBe("streaming");
		expect(entry.source).toBe("tvkampen");
	});

	it("maps Viaplay correctly", () => {
		const entry = buildStreamingEntry("Viaplay");
		expect(entry.platform).toBe("Viaplay");
		expect(entry.url).toContain("viaplay.no");
		expect(entry.type).toBe("streaming");
	});

	it("maps Discovery+ correctly", () => {
		const entry = buildStreamingEntry("Discovery+");
		expect(entry.platform).toBe("Discovery+");
		expect(entry.url).toContain("discoveryplus.no");
		expect(entry.type).toBe("streaming");
	});

	it("maps NRK1 as free", () => {
		const entry = buildStreamingEntry("NRK1");
		expect(entry.platform).toBe("NRK1");
		expect(entry.url).toContain("tv.nrk.no");
		expect(entry.type).toBe("free");
	});

	it("maps DAZN correctly", () => {
		const entry = buildStreamingEntry("DAZN");
		expect(entry.platform).toBe("DAZN");
		expect(entry.url).toContain("dazn.com");
		expect(entry.type).toBe("streaming");
	});

	it("maps V Sport channels as tv type", () => {
		const entry = buildStreamingEntry("V Sport 1");
		expect(entry.platform).toBe("V Sport 1");
		expect(entry.type).toBe("tv");
	});

	it("maps Eurosport channels", () => {
		const entry = buildStreamingEntry("Eurosport 1");
		expect(entry.platform).toBe("Eurosport 1");
		expect(entry.url).toContain("discoveryplus.no");
		expect(entry.type).toBe("tv");
	});

	it("handles unknown broadcaster gracefully", () => {
		const entry = buildStreamingEntry("Unknown Channel");
		expect(entry.platform).toBe("Unknown Channel");
		expect(entry.url).toBe("");
		expect(entry.type).toBe("unknown");
		expect(entry.source).toBe("tvkampen");
	});

	it("handles case-insensitive lookup", () => {
		const entry = buildStreamingEntry("tv 2 play");
		expect(entry.platform).toBe("TV 2 Play");
	});

	it("maps MAX correctly", () => {
		const entry = buildStreamingEntry("MAX");
		expect(entry.platform).toBe("MAX");
		expect(entry.url).toContain("play.max.com");
		expect(entry.type).toBe("streaming");
	});
});

describe("buildStreamingEntries", () => {
	it("builds entries for multiple broadcasters", () => {
		const entries = buildStreamingEntries(["TV 2 Play", "TV 2 Sport 1", "Viaplay"]);
		expect(entries).toHaveLength(3);
		expect(entries[0].platform).toBe("TV 2 Play");
		expect(entries[1].platform).toBe("TV 2 Sport 1");
		expect(entries[2].platform).toBe("Viaplay");
	});

	it("deduplicates by platform name", () => {
		const entries = buildStreamingEntries(["TV 2 Play", "TV 2 Play", "tv 2 play"]);
		expect(entries).toHaveLength(1);
	});

	it("returns empty array for empty input", () => {
		expect(buildStreamingEntries([])).toEqual([]);
	});

	it("all entries have source: tvkampen", () => {
		const entries = buildStreamingEntries(["Viaplay", "Discovery+"]);
		for (const entry of entries) {
			expect(entry.source).toBe("tvkampen");
		}
	});
});

describe("BROADCASTER_MAP", () => {
	it("covers all major Norwegian broadcasters", () => {
		const keys = Object.keys(BROADCASTER_MAP);
		expect(keys).toContain("tv 2 play");
		expect(keys).toContain("viaplay");
		expect(keys).toContain("discovery+");
		expect(keys).toContain("nrk1");
		expect(keys).toContain("dazn");
		expect(keys).toContain("max");
	});

	it("has valid URL for every mapped entry", () => {
		for (const [key, value] of Object.entries(BROADCASTER_MAP)) {
			expect(value.baseUrl).toBeTruthy();
			expect(value.baseUrl).toMatch(/^https?:\/\//);
		}
	});

	it("has valid type for every mapped entry", () => {
		const validTypes = new Set(["streaming", "tv", "free"]);
		for (const value of Object.values(BROADCASTER_MAP)) {
			expect(validTypes.has(value.type)).toBe(true);
		}
	});
});
