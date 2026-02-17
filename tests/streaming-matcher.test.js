import { describe, it, expect } from "vitest";
import {
	normalizeTeamName,
	teamsMatch,
	computeMatchScore,
	matchTvkampenToEvents,
	mineAliasSuggestions,
	buildStreamingHints,
	TEAM_ALIASES,
} from "../scripts/lib/streaming-matcher.js";

// --- normalizeTeamName ---

describe("normalizeTeamName", () => {
	it("lowercases and strips accents", () => {
		expect(normalizeTeamName("Bodø/Glimt")).toBe("bodo glimt");
	});

	it("removes FC/FK/SK suffixes", () => {
		expect(normalizeTeamName("Molde FK")).toBe("molde");
		expect(normalizeTeamName("FC Barcelona")).toBe("barcelona");
		expect(normalizeTeamName("SK Brann")).toBe("brann");
	});

	it("collapses whitespace", () => {
		expect(normalizeTeamName("  Manchester   City  FC  ")).toBe("manchester city");
	});

	it("removes non-alphanumeric except spaces", () => {
		expect(normalizeTeamName("Atletico de Madrid")).toBe("atletico de madrid");
	});

	it("returns empty string for null/undefined", () => {
		expect(normalizeTeamName(null)).toBe("");
		expect(normalizeTeamName(undefined)).toBe("");
		expect(normalizeTeamName("")).toBe("");
	});

	it("handles AFC suffix", () => {
		expect(normalizeTeamName("AFC Bournemouth")).toBe("bournemouth");
	});
});

// --- teamsMatch ---

describe("teamsMatch", () => {
	it("matches identical names", () => {
		expect(teamsMatch("Arsenal", "Arsenal")).toBe(true);
	});

	it("matches case-insensitive", () => {
		expect(teamsMatch("arsenal", "ARSENAL")).toBe(true);
	});

	it("matches with different suffixes", () => {
		expect(teamsMatch("Molde FK", "Molde")).toBe(true);
		expect(teamsMatch("FC Barcelona", "Barcelona")).toBe(true);
	});

	it("matches via substring containment", () => {
		expect(teamsMatch("Manchester United", "Man United")).toBe(true);
	});

	it("matches via alias table", () => {
		expect(teamsMatch("Wolves", "Wolverhampton")).toBe(true);
		expect(teamsMatch("Spurs", "Tottenham Hotspur")).toBe(true);
		expect(teamsMatch("PSG", "Paris Saint-Germain")).toBe(true);
	});

	it("matches Bodø/Glimt variants", () => {
		expect(teamsMatch("Bodø/Glimt", "Bodo Glimt")).toBe(true);
		expect(teamsMatch("FK Bodø/Glimt", "Bodo Glimt")).toBe(true);
	});

	it("matches Norwegian clubs via aliases", () => {
		expect(teamsMatch("Lyn", "Lyn Oslo")).toBe(true);
		expect(teamsMatch("Vålerenga", "Valerenga IF")).toBe(true);
		expect(teamsMatch("Rosenborg BK", "RBK")).toBe(true);
	});

	it("rejects clearly different teams", () => {
		expect(teamsMatch("Arsenal", "Chelsea")).toBe(false);
		expect(teamsMatch("Liverpool", "Everton")).toBe(false);
	});

	it("rejects empty/null inputs", () => {
		expect(teamsMatch("", "Arsenal")).toBe(false);
		expect(teamsMatch(null, "Arsenal")).toBe(false);
	});

	it("handles short names cautiously", () => {
		// Two-letter names shouldn't match everything
		expect(teamsMatch("AB", "ABC")).toBe(false);
	});
});

// --- computeMatchScore ---

describe("computeMatchScore", () => {
	const makeEvent = (home, away, time, tournament) => ({
		homeTeam: home,
		awayTeam: away,
		time,
		tournament: tournament || "Premier League",
		sport: "football",
	});

	const makeTvk = (home, away, time) => ({
		homeTeam: home,
		awayTeam: away,
		time,
		matchUrl: "https://www.tvkampen.com/kamp/test-123",
	});

	it("returns 0 for event with no time", () => {
		const event = makeEvent("Arsenal", "Liverpool", null);
		const tvk = makeTvk("Arsenal", "Liverpool", "20:00");
		expect(computeMatchScore(tvk, event, "2026-02-17")).toBe(0);
	});

	it("returns 0 when time difference exceeds 30 minutes", () => {
		const event = makeEvent("Arsenal", "Liverpool", "2026-02-17T20:00:00Z");
		const tvk = makeTvk("Arsenal", "Liverpool", "15:00");
		expect(computeMatchScore(tvk, event, "2026-02-17")).toBe(0);
	});

	it("scores high for perfect match (time + both teams)", () => {
		const event = makeEvent("Arsenal", "Liverpool", "2026-02-17T19:45:00Z");
		const tvk = makeTvk("Arsenal", "Liverpool", "20:45"); // CET = UTC+1
		const score = computeMatchScore(tvk, event, "2026-02-17");
		expect(score).toBeGreaterThanOrEqual(0.6);
	});

	it("scores partial for time + one team match", () => {
		const event = makeEvent("Arsenal", "Liverpool", "2026-02-17T19:45:00Z");
		const tvk = makeTvk("Arsenal", "Unknown FC", "20:45");
		const score = computeMatchScore(tvk, event, "2026-02-17");
		expect(score).toBeGreaterThanOrEqual(0.6);
	});

	it("gives base score for time-only match", () => {
		const event = makeEvent("Arsenal", "Liverpool", "2026-02-17T19:45:00Z");
		const tvk = makeTvk("Chelsea", "Newcastle", "20:45");
		const score = computeMatchScore(tvk, event, "2026-02-17");
		expect(score).toBe(0.3); // base only
	});

	it("handles swapped home/away", () => {
		const event = makeEvent("Arsenal", "Liverpool", "2026-02-17T19:45:00Z");
		const tvk = makeTvk("Liverpool", "Arsenal", "20:45");
		const score = computeMatchScore(tvk, event, "2026-02-17");
		expect(score).toBeGreaterThanOrEqual(0.6);
	});

	it("caps score at 1.0", () => {
		const event = makeEvent("Arsenal", "Liverpool", "2026-02-17T19:45:00Z");
		event.tournament = "premier league";
		const tvk = makeTvk("Arsenal", "Liverpool", "20:45");
		tvk.league = "Premier League";
		const score = computeMatchScore(tvk, event, "2026-02-17");
		expect(score).toBeLessThanOrEqual(1);
	});

	it("works without dateStr (time-of-day comparison)", () => {
		const event = makeEvent("Arsenal", "Liverpool", "2026-02-17T20:00:00Z");
		const tvk = makeTvk("Arsenal", "Liverpool", "21:00"); // CET = UTC+1 → matches 20:00 UTC
		const score = computeMatchScore(tvk, event);
		expect(score).toBeGreaterThanOrEqual(0.6);
	});
});

// --- matchTvkampenToEvents ---

describe("matchTvkampenToEvents", () => {
	const events = [
		{
			homeTeam: "Arsenal",
			awayTeam: "Liverpool",
			time: "2026-02-17T20:00:00Z",
			tournament: "Premier League",
			sport: "football",
		},
		{
			homeTeam: "Wolves",
			awayTeam: "Brighton",
			time: "2026-02-17T15:00:00Z",
			tournament: "Premier League",
			sport: "football",
		},
		{
			homeTeam: "Barcelona",
			awayTeam: "Real Madrid",
			time: "2026-02-17T20:00:00Z",
			tournament: "La Liga",
			sport: "football",
		},
	];

	it("matches correct pairs", () => {
		const tvkEntries = [
			{ homeTeam: "Arsenal", awayTeam: "Liverpool", time: "21:00", matchUrl: "url1" },
			{ homeTeam: "Wolves", awayTeam: "Brighton", time: "16:00", matchUrl: "url2" },
		];
		const result = matchTvkampenToEvents(tvkEntries, events, { dateStr: "2026-02-17" });
		expect(result).toHaveLength(2);
		expect(result[0].event.homeTeam).toBe("Arsenal");
		expect(result[1].event.homeTeam).toBe("Wolves");
	});

	it("respects minConfidence threshold", () => {
		const tvkEntries = [
			{ homeTeam: "Unknown", awayTeam: "Nobody", time: "21:00", matchUrl: "url1" },
		];
		const result = matchTvkampenToEvents(tvkEntries, events, { minConfidence: 0.6, dateStr: "2026-02-17" });
		// Time matches Arsenal but teams don't → 0.3 score < 0.6 threshold
		expect(result).toHaveLength(0);
	});

	it("prevents double-matching (one event per tvk entry)", () => {
		const tvkEntries = [
			{ homeTeam: "Arsenal", awayTeam: "Liverpool", time: "21:00", matchUrl: "url1" },
			{ homeTeam: "Arsenal", awayTeam: "Liverpool", time: "21:00", matchUrl: "url2" },
		];
		const result = matchTvkampenToEvents(tvkEntries, events, { dateStr: "2026-02-17" });
		// Second entry can't match the same event
		expect(result).toHaveLength(1);
	});

	it("returns empty array for no matches", () => {
		const tvkEntries = [
			{ homeTeam: "Fake FC", awayTeam: "Test United", time: "03:00", matchUrl: "url1" },
		];
		const result = matchTvkampenToEvents(tvkEntries, events, { dateStr: "2026-02-17" });
		expect(result).toEqual([]);
	});

	it("includes confidence score in result", () => {
		const tvkEntries = [
			{ homeTeam: "Arsenal", awayTeam: "Liverpool", time: "21:00", matchUrl: "url1" },
		];
		const result = matchTvkampenToEvents(tvkEntries, events, { dateStr: "2026-02-17" });
		expect(result[0].confidence).toBeGreaterThanOrEqual(0.6);
		expect(result[0].confidence).toBeLessThanOrEqual(1);
	});

	it("handles empty inputs", () => {
		expect(matchTvkampenToEvents([], events)).toEqual([]);
		expect(matchTvkampenToEvents([{ homeTeam: "A", awayTeam: "B", time: "12:00", matchUrl: "x" }], [])).toEqual([]);
	});
});

// --- Cross-day matching ---

describe("computeMatchScore — cross-day matching", () => {
	it("uses tvkEntry.date instead of dateStr when available", () => {
		const event = {
			homeTeam: "Arsenal",
			awayTeam: "Liverpool",
			time: "2026-02-18T20:00:00Z",
			tournament: "Premier League",
		};
		// tvkEntry from tomorrow's page, but default dateStr is today
		const tvk = {
			homeTeam: "Arsenal",
			awayTeam: "Liverpool",
			time: "21:00",
			date: "2026-02-18", // per-entry date
			matchUrl: "url1",
		};
		// With wrong dateStr (today), the per-entry date should take priority
		const score = computeMatchScore(tvk, event, "2026-02-17");
		expect(score).toBeGreaterThanOrEqual(0.6);
	});

	it("falls back to dateStr when tvkEntry.date is absent", () => {
		const event = {
			homeTeam: "Arsenal",
			awayTeam: "Liverpool",
			time: "2026-02-17T20:00:00Z",
			tournament: "Premier League",
		};
		const tvk = {
			homeTeam: "Arsenal",
			awayTeam: "Liverpool",
			time: "21:00",
			matchUrl: "url1",
		};
		const score = computeMatchScore(tvk, event, "2026-02-17");
		expect(score).toBeGreaterThanOrEqual(0.6);
	});
});

describe("computeMatchScore — CET timezone", () => {
	it("handles CET offset: 21:00 CET matches 20:00 UTC", () => {
		const event = {
			homeTeam: "Arsenal",
			awayTeam: "Liverpool",
			time: "2026-02-17T20:00:00Z", // 20:00 UTC
			tournament: "Premier League",
		};
		const tvk = {
			homeTeam: "Arsenal",
			awayTeam: "Liverpool",
			time: "21:00", // 21:00 CET = 20:00 UTC
			matchUrl: "url1",
		};
		const score = computeMatchScore(tvk, event, "2026-02-17");
		expect(score).toBeGreaterThanOrEqual(0.6);
	});

	it("rejects time mismatch beyond 30 min with CET offset", () => {
		const event = {
			homeTeam: "Arsenal",
			awayTeam: "Liverpool",
			time: "2026-02-17T15:00:00Z", // 15:00 UTC
			tournament: "Premier League",
		};
		const tvk = {
			homeTeam: "Arsenal",
			awayTeam: "Liverpool",
			time: "21:00", // 21:00 CET = 20:00 UTC, 5h difference
			matchUrl: "url1",
		};
		const score = computeMatchScore(tvk, event, "2026-02-17");
		expect(score).toBe(0);
	});
});

// --- mineAliasSuggestions ---

describe("mineAliasSuggestions", () => {
	it("detects near-miss team names", () => {
		// "Bayer 04 Leverkusen" vs "Bayer Leverkusen" — 2/3 word overlap but
		// neither is a substring of the other due to "04"
		const unmatched = [
			{ homeTeam: "Bayer 04 Leverkusen", awayTeam: "Sevilla" },
		];
		const events = [
			{ homeTeam: "Bayer Leverkusen", awayTeam: "Sevilla FC" },
		];
		const suggestions = mineAliasSuggestions(unmatched, events);
		expect(suggestions.length).toBeGreaterThanOrEqual(1);
		expect(suggestions.some(s => s.tvkName === "Bayer 04 Leverkusen")).toBe(true);
	});

	it("returns empty for no unmatched entries", () => {
		expect(mineAliasSuggestions([], [{ homeTeam: "A", awayTeam: "B" }])).toEqual([]);
		expect(mineAliasSuggestions(null, [{ homeTeam: "A", awayTeam: "B" }])).toEqual([]);
	});

	it("skips pairs that already match via teamsMatch", () => {
		const unmatched = [{ homeTeam: "Wolves", awayTeam: "Arsenal" }];
		const events = [{ homeTeam: "Wolverhampton", awayTeam: "Arsenal" }];
		const suggestions = mineAliasSuggestions(unmatched, events);
		// Wolves ↔ Wolverhampton already matches via alias table
		const wolfSuggestion = suggestions.find(s =>
			s.tvkName === "Wolves" && s.evtName === "Wolverhampton"
		);
		expect(wolfSuggestion).toBeUndefined();
	});
});

// --- buildStreamingHints ---

describe("buildStreamingHints", () => {
	it("returns empty for empty history", () => {
		expect(buildStreamingHints([])).toEqual([]);
		expect(buildStreamingHints(null)).toEqual([]);
	});

	it("detects declining match rate", () => {
		const history = [
			{ matchRate: 0.6, listingsFound: 20 },
			{ matchRate: 0.4, listingsFound: 20 },
			{ matchRate: 0.2, listingsFound: 20 },
		];
		const hints = buildStreamingHints(history);
		expect(hints.some(h => h.includes("declining"))).toBe(true);
	});

	it("returns no warning for stable/rising rate", () => {
		const history = [
			{ matchRate: 0.4, listingsFound: 20 },
			{ matchRate: 0.5, listingsFound: 20 },
			{ matchRate: 0.6, listingsFound: 20 },
		];
		const hints = buildStreamingHints(history);
		expect(hints.some(h => h.includes("declining"))).toBe(false);
	});

	it("detects zero-listings pattern", () => {
		const history = [
			{ matchRate: 0, listingsFound: 0 },
			{ matchRate: 0, listingsFound: 0 },
			{ matchRate: 0, listingsFound: 0 },
		];
		const hints = buildStreamingHints(history);
		expect(hints.some(h => h.includes("0 listings"))).toBe(true);
	});

	it("suggests aliases seen 3+ times", () => {
		const suggestion = { tvkName: "Foo FC", evtName: "Foo City" };
		const history = [
			{ matchRate: 0.5, listingsFound: 10, aliasSuggestions: [suggestion] },
			{ matchRate: 0.5, listingsFound: 10, aliasSuggestions: [suggestion] },
			{ matchRate: 0.5, listingsFound: 10, aliasSuggestions: [suggestion] },
		];
		const hints = buildStreamingHints(history);
		expect(hints.some(h => h.includes("ALIAS SUGGESTION"))).toBe(true);
	});
});

// --- TEAM_ALIASES ---

describe("TEAM_ALIASES", () => {
	it("contains common Norwegian clubs", () => {
		expect(TEAM_ALIASES).toHaveProperty("bodo glimt");
		expect(TEAM_ALIASES).toHaveProperty("lyn");
		expect(TEAM_ALIASES).toHaveProperty("rosenborg");
		expect(TEAM_ALIASES).toHaveProperty("valerenga");
	});

	it("contains common PL abbreviations", () => {
		expect(TEAM_ALIASES).toHaveProperty("man city");
		expect(TEAM_ALIASES).toHaveProperty("man united");
		expect(TEAM_ALIASES).toHaveProperty("spurs");
		expect(TEAM_ALIASES).toHaveProperty("wolves");
	});

	it("has bidirectional mappings for key aliases", () => {
		// Wolves ↔ Wolverhampton
		expect(TEAM_ALIASES["wolves"]).toContain("wolverhampton");
		expect(TEAM_ALIASES["wolverhampton"]).toContain("wolves");
	});
});
