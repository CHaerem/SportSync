// fetch-results.js: favorite tagging from interests.json + write-time validation.
import { describe, it, expect } from "vitest";
import { isFavoriteTeam, isFavoritePlayer, validateFootballResult } from "../scripts/fetch-results.js";

const ctx = { favoriteTeams: ["Barcelona", "Liverpool", "Lyn"], favoritePlayers: ["Casper Ruud", "Viktor Hovland"] };

describe("favorite tagging", () => {
	it("matches favorite teams case-insensitively and by substring", () => {
		expect(isFavoriteTeam("FC Barcelona", ctx)).toBe(true);
		expect(isFavoriteTeam("Liverpool", ctx)).toBe(true);
		expect(isFavoriteTeam("Real Madrid", ctx)).toBe(false);
	});

	it("matches favorite players", () => {
		expect(isFavoritePlayer("Casper Ruud", ctx)).toBe(true);
		expect(isFavoritePlayer("Novak Djokovic", ctx)).toBe(false);
	});

	it("handles empty context without crashing", () => {
		expect(isFavoriteTeam("Barcelona", {})).toBe(false);
	});
});

describe("validateFootballResult", () => {
	it("accepts a complete result", () => {
		const v = validateFootballResult({
			homeTeam: "Liverpool", awayTeam: "Arsenal",
			homeScore: 2, awayScore: 1,
			date: "2026-07-01T19:00Z", league: "Premier League",
		});
		expect(v.valid).toBe(true);
	});

	it("rejects results missing scores", () => {
		const v = validateFootballResult({ homeTeam: "A", awayTeam: "B", date: "2026-07-01T19:00Z" });
		expect(v.valid).toBe(false);
	});
});
