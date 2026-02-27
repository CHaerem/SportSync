import { describe, it, expect } from "vitest";
import {
	buildTeamMatcher,
	eventInvolvesFocusTeam,
	resolveFocusTeams,
	filterEventsByFocusTeam,
} from "../scripts/lib/focus-team-filter.js";

describe("buildTeamMatcher()", () => {
	it("matches exact canonical name (case-insensitive)", () => {
		const matcher = buildTeamMatcher(["100 Thieves"]);
		expect(matcher("100 Thieves vs ENCE")).toBe(true);
		expect(matcher("100 thieves")).toBe(true);
		expect(matcher("Some random team")).toBe(false);
	});

	it("matches known aliases", () => {
		const matcher = buildTeamMatcher(["100 Thieves"]);
		expect(matcher("100T vs FaZe")).toBe(true);
		expect(matcher("hundred thieves")).toBe(true);
		expect(matcher("100thieves gaming")).toBe(true);
	});

	it("matches reverse alias lookup (alias input → canonical match)", () => {
		const matcher = buildTeamMatcher(["100T"]);
		// 100T is an alias for 100 Thieves, so it should also match the canonical name
		expect(matcher("100 Thieves")).toBe(true);
	});

	it("matches multiple teams", () => {
		const matcher = buildTeamMatcher(["100 Thieves", "FaZe Clan"]);
		expect(matcher("100 Thieves vs ENCE")).toBe(true);
		expect(matcher("FaZe vs Navi")).toBe(true);
		expect(matcher("G2 vs Liquid")).toBe(false);
	});

	it("returns false for empty/null teams", () => {
		const matcher = buildTeamMatcher([]);
		expect(matcher("100 Thieves")).toBe(false);

		const nullMatcher = buildTeamMatcher(null);
		expect(nullMatcher("anything")).toBe(false);
	});

	it("returns false for null/empty text", () => {
		const matcher = buildTeamMatcher(["100 Thieves"]);
		expect(matcher("")).toBe(false);
		expect(matcher(null)).toBe(false);
		expect(matcher(undefined)).toBe(false);
	});

	it("handles substring matching correctly", () => {
		const matcher = buildTeamMatcher(["Natus Vincere"]);
		expect(matcher("NaVi vs G2")).toBe(true);
		expect(matcher("Na'Vi wins")).toBe(true);
	});
});

describe("eventInvolvesFocusTeam()", () => {
	const matcher = buildTeamMatcher(["100 Thieves"]);

	it("matches via title field", () => {
		expect(eventInvolvesFocusTeam({ title: "100 Thieves vs ENCE" }, matcher)).toBe(true);
	});

	it("matches via team1 field", () => {
		expect(eventInvolvesFocusTeam({ team1: "100 Thieves", team2: "ENCE" }, matcher)).toBe(true);
	});

	it("matches via team2 field", () => {
		expect(eventInvolvesFocusTeam({ team1: "ENCE", team2: "100 Thieves" }, matcher)).toBe(true);
	});

	it("matches via homeTeam/awayTeam fields", () => {
		expect(eventInvolvesFocusTeam({ homeTeam: "100 Thieves" }, matcher)).toBe(true);
		expect(eventInvolvesFocusTeam({ awayTeam: "100T" }, matcher)).toBe(true);
	});

	it("matches via focusTeam field", () => {
		expect(eventInvolvesFocusTeam({ focusTeam: "100 Thieves" }, matcher)).toBe(true);
	});

	it("matches via participants array (strings)", () => {
		expect(eventInvolvesFocusTeam({ participants: ["ENCE", "100 Thieves", "G2"] }, matcher)).toBe(true);
	});

	it("matches via participants array (objects)", () => {
		expect(eventInvolvesFocusTeam({
			participants: [{ name: "ENCE" }, { name: "100 Thieves" }]
		}, matcher)).toBe(true);
	});

	it("returns false when no match", () => {
		expect(eventInvolvesFocusTeam({
			title: "G2 vs FaZe",
			team1: "G2",
			team2: "FaZe Clan",
		}, matcher)).toBe(false);
	});

	it("handles null/undefined event gracefully", () => {
		expect(eventInvolvesFocusTeam(null, matcher)).toBe(false);
		expect(eventInvolvesFocusTeam(undefined, matcher)).toBe(false);
	});
});

describe("resolveFocusTeams()", () => {
	it("prefers config-level norwegianTeams", () => {
		const config = { norwegianTeams: ["100 Thieves"] };
		const userContext = { favoriteEsportsOrgs: ["FaZe Clan"] };
		expect(resolveFocusTeams(config, userContext)).toEqual(["100 Thieves"]);
	});

	it("falls back to user-context favoriteEsportsOrgs", () => {
		const config = {};
		const userContext = { favoriteEsportsOrgs: ["100 Thieves"] };
		expect(resolveFocusTeams(config, userContext)).toEqual(["100 Thieves"]);
	});

	it("deduplicates teams", () => {
		const config = { norwegianTeams: ["100 Thieves", "100 Thieves"] };
		expect(resolveFocusTeams(config, {})).toEqual(["100 Thieves"]);
	});

	it("returns empty array when no teams configured", () => {
		expect(resolveFocusTeams({}, {})).toEqual([]);
		expect(resolveFocusTeams(null, null)).toEqual([]);
	});
});

describe("filterEventsByFocusTeam()", () => {
	const esportsConfig = { sport: "esports", norwegianTeams: ["100 Thieves"] };
	const userContext = { favoriteEsportsOrgs: ["100 Thieves"] };

	it("filters out non-focus-team esports events", () => {
		const events = [
			{ title: "100 Thieves vs ENCE", team1: "100 Thieves", team2: "ENCE" },
			{ title: "G2 vs FaZe", team1: "G2", team2: "FaZe Clan" },
			{ title: "Liquid vs Spirit", team1: "Team Liquid", team2: "Spirit" },
		];
		const { filtered, removedCount } = filterEventsByFocusTeam(events, esportsConfig, userContext);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe("100 Thieves vs ENCE");
		expect(removedCount).toBe(2);
	});

	it("passes through non-esports events unchanged", () => {
		const footballConfig = { sport: "football" };
		const events = [
			{ title: "Arsenal vs Liverpool", team1: "Arsenal", team2: "Liverpool" },
		];
		const { filtered, removedCount } = filterEventsByFocusTeam(events, footballConfig, userContext);
		expect(filtered).toHaveLength(1);
		expect(removedCount).toBe(0);
	});

	it("passes through tournament-level events regardless of team", () => {
		const events = [
			{ title: "ESL Pro League S23", _isTournament: true },
			{ title: "G2 vs FaZe", team1: "G2", team2: "FaZe Clan" },
		];
		const { filtered, removedCount } = filterEventsByFocusTeam(events, esportsConfig, userContext);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe("ESL Pro League S23");
		expect(removedCount).toBe(1);
	});

	it("passes through events with no team references", () => {
		const events = [
			{}, // no team fields at all
			{ title: "G2 vs FaZe", team1: "G2", team2: "FaZe" },
		];
		const { filtered, removedCount } = filterEventsByFocusTeam(events, esportsConfig, userContext);
		expect(filtered).toHaveLength(1); // only the empty event passes through
		expect(removedCount).toBe(1);
	});

	it("passes everything through when no focus teams configured", () => {
		const noTeamConfig = { sport: "esports" };
		const noTeamContext = {};
		const events = [
			{ title: "G2 vs FaZe", team1: "G2", team2: "FaZe" },
		];
		const { filtered, removedCount } = filterEventsByFocusTeam(events, noTeamConfig, noTeamContext);
		expect(filtered).toHaveLength(1);
		expect(removedCount).toBe(0);
	});

	it("handles empty events array", () => {
		const { filtered, removedCount } = filterEventsByFocusTeam([], esportsConfig, userContext);
		expect(filtered).toEqual([]);
		expect(removedCount).toBe(0);
	});

	it("handles null events", () => {
		const { filtered, removedCount } = filterEventsByFocusTeam(null, esportsConfig, userContext);
		expect(filtered).toEqual([]);
		expect(removedCount).toBe(0);
	});

	it("uses alias matching for esports events", () => {
		const events = [
			{ title: "100T vs ENCE", team1: "100T", team2: "ENCE" },
		];
		const { filtered, removedCount } = filterEventsByFocusTeam(events, esportsConfig, userContext);
		expect(filtered).toHaveLength(1);
		expect(removedCount).toBe(0);
	});

	it("resolves teams from userContext when config has no norwegianTeams", () => {
		const bareConfig = { sport: "esports" };
		const events = [
			{ title: "100 Thieves vs ENCE", team1: "100 Thieves", team2: "ENCE" },
			{ title: "G2 vs FaZe", team1: "G2", team2: "FaZe" },
		];
		const { filtered, removedCount } = filterEventsByFocusTeam(events, bareConfig, userContext);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe("100 Thieves vs ENCE");
		expect(removedCount).toBe(1);
	});
});
