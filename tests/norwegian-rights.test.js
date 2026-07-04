// lib/norwegian-rights.js — followed events always resolve to Norwegian channels.
import { describe, it, expect } from "vitest";
import { norwegianRights, normalizeStreaming } from "../scripts/lib/norwegian-rights.js";

describe("norwegianRights", () => {
	it("World Cup football (no per-match data) → one tentative NRK / TV 2 label, never a foreign net", () => {
		const r = norwegianRights({ sport: "football", tournament: "FIFA World Cup 2026", title: "Norway vs Brazil" });
		expect(r.map((c) => c.platform)).toEqual(["NRK / TV 2"]); // shared rights, exact channel TBD
		expect(r[0].tentative).toBe(true);
		expect(JSON.stringify(r)).not.toMatch(/fox|espn/i);
	});
	it("F1 → Viaplay", () => {
		expect(norwegianRights({ sport: "f1", tournament: "Belgian Grand Prix" })[0].platform).toBe("Viaplay");
	});
	it("Premier League → TV 2 Play", () => {
		expect(norwegianRights({ sport: "football", tournament: "Premier League" })[0].platform).toBe("TV 2 Play");
	});
	it("unknown competition → no guess (empty)", () => {
		expect(norwegianRights({ sport: "football", tournament: "Some Friendly" })).toEqual([]);
	});
});

describe("normalizeStreaming", () => {
	it("overrides a foreign broadcaster (FOX) with Norwegian rights", () => {
		const s = normalizeStreaming({ sport: "football", tournament: "FIFA World Cup 2026", streaming: [{ platform: "FOX" }] });
		expect(s.map((c) => c.platform)).toEqual(["NRK / TV 2"]);
		expect(JSON.stringify(s)).not.toContain("FOX");
	});
	it("drops foreign nets when no rights mapping and keeps Norwegian ones", () => {
		const s = normalizeStreaming({ sport: "tennis", tournament: "Nordea Open", streaming: [{ platform: "Tennis Channel" }, { platform: "TV 2 Play" }] });
		expect(s.map((c) => c.platform)).toEqual(["TV 2 Play"]);
	});
	it("leaves esports free streams untouched", () => {
		const s = normalizeStreaming({ sport: "esports", streaming: [{ platform: "Twitch" }] });
		expect(s[0].platform).toBe("Twitch");
	});
});

import { resolveStreaming, matchTvListing } from "../scripts/lib/norwegian-rights.js";

describe("tvkampen real-listing integration", () => {
	const listings = [
		{ homeTeam: "Liverpool", awayTeam: "Arsenal", time: "18:30", broadcasters: ["TV 2 Play", "TV 2 Sport 1", "Coolbet"] },
		{ homeTeam: "Ranheim", awayTeam: "Stabæk", time: "19:00", broadcasters: ["TV 2 Play", "Viaplay"] },
	];
	it("matches a football event to its listing by team names (ignoring FC suffixes)", () => {
		const l = matchTvListing({ homeTeam: "Liverpool FC", awayTeam: "Arsenal FC" }, listings);
		expect(l?.homeTeam).toBe("Liverpool");
	});
	it("uses the real listing's Norwegian broadcasters, dropping betting sites", () => {
		const s = resolveStreaming({ sport: "football", homeTeam: "Liverpool FC", awayTeam: "Arsenal FC", tournament: "Premier League" }, listings);
		expect(s.map((c) => c.platform)).toEqual(["TV 2 Play", "TV 2 Sport 1"]); // Coolbet dropped
		expect(s[0].url).toContain("tv2.no");
	});
	it("falls back to the rights map when no listing matches", () => {
		const s = resolveStreaming({ sport: "football", homeTeam: "Bodø/Glimt", awayTeam: "Molde", tournament: "Eliteserien" }, listings);
		expect(s[0].platform).toBe("TV 2 Play"); // from map, not a listing
	});
	it("collapses NRK sub-channels and caps aggregator padding to two channels", () => {
		const padded = [{
			homeTeam: "Rosenborg", awayTeam: "Brann",
			broadcasters: ["NRK1", "NRK TV", "Viaplay", "Eurosport Norge", "MAX"],
		}];
		const s = resolveStreaming({ sport: "football", homeTeam: "Rosenborg", awayTeam: "Brann", tournament: "Eliteserien" }, padded);
		expect(s.map((c) => c.platform)).toEqual(["NRK", "Viaplay"]); // NRK1/NRK TV -> one NRK, trailing padding dropped
	});
	it("non-football ignores listings and uses the map", () => {
		const s = resolveStreaming({ sport: "f1", tournament: "Belgian Grand Prix" }, listings);
		expect(s[0].platform).toBe("Viaplay");
	});
});

describe("World Cup per-match channel resolution (English↔Norwegian nations)", () => {
	// tvkampen lists nations in Norwegian and pads with aggregators; ESPN emits
	// English nation names. Both bugs together made every WC match show NRK + TV 2.
	const wcListings = [
		{ homeTeam: "Canada", awayTeam: "Marokko", broadcasters: ["NRK1", "NRK TV", "Viaplay", "Eurosport Norge", "MAX"] },
		{ homeTeam: "England", awayTeam: "Mexico", broadcasters: ["TV 2 Play", "TV 2 Sport 1", "Viaplay", "MAX"] },
		{ homeTeam: "Paraguay", awayTeam: "Frankrike", broadcasters: ["Svt"] },
	];

	it("matches an English-named event to a Norwegian-named listing (Morocco↔Marokko)", () => {
		const s = resolveStreaming(
			{ sport: "football", tournament: "FIFA World Cup 2026", homeTeam: "Canada", awayTeam: "Morocco" },
			wcListings
		);
		expect(s.map((c) => c.platform)).toEqual(["NRK"]); // one true broadcaster, aggregators dropped
	});

	it("resolves a TV 2 WC match to a single TV 2 Play (drops NRK/aggregators absent)", () => {
		const s = resolveStreaming(
			{ sport: "football", tournament: "FIFA World Cup 2026", homeTeam: "England", awayTeam: "Mexico" },
			wcListings
		);
		expect(s.map((c) => c.platform)).toEqual(["TV 2 Play"]);
	});

	it("falls back to tentative NRK / TV 2 when the listing has no Norwegian rights holder", () => {
		const s = resolveStreaming(
			{ sport: "football", tournament: "FIFA World Cup 2026", homeTeam: "Paraguay", awayTeam: "France" },
			wcListings
		);
		expect(s.map((c) => c.platform)).toEqual(["NRK / TV 2"]);
		expect(s[0].tentative).toBe(true);
	});

	it("nation-vs-nation with no tournament label still resolves (never a foreign net)", () => {
		const s = resolveStreaming(
			{ sport: "football", tournament: "International", homeTeam: "Norway", awayTeam: "Brazil" },
			[]
		);
		expect(s.map((c) => c.platform)).toEqual(["NRK / TV 2"]);
	});
});
