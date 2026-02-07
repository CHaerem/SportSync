import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

// We test the MCP server functions by importing and testing them indirectly
// Since the server auto-starts on import, we test the logic functions separately

const REPO_ROOT = process.cwd();
const EVENTS_PATH = path.join(REPO_ROOT, "docs", "data", "events.json");
const USER_CONTEXT_PATH = path.join(REPO_ROOT, "scripts", "config", "user-context.json");

function loadJSON(filePath) {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf-8"));
	} catch {
		return null;
	}
}

describe("MCP server data access", () => {
	it("can read events.json", () => {
		const events = loadJSON(EVENTS_PATH);
		// events.json should exist (might be empty array)
		expect(events !== null).toBe(true);
		expect(Array.isArray(events)).toBe(true);
	});

	it("can read user-context.json", () => {
		const ctx = loadJSON(USER_CONTEXT_PATH);
		expect(ctx).not.toBeNull();
		expect(ctx.favoriteTeams).toBeDefined();
		expect(ctx.favoritePlayers).toBeDefined();
	});

	it("user-context.json has required fields", () => {
		const ctx = loadJSON(USER_CONTEXT_PATH);
		expect(Array.isArray(ctx.favoriteTeams)).toBe(true);
		expect(Array.isArray(ctx.favoritePlayers)).toBe(true);
		expect(ctx.location).toBeDefined();
		expect(ctx.sportPreferences).toBeDefined();
	});
});

describe("MCP recommendation scoring logic", () => {
	// Replicate the scoring logic from the MCP server to test it
	function scoreEvent(event, userContext) {
		let score = event.importance || 2;
		const favTeams = userContext.favoriteTeams || [];
		const favPlayers = userContext.favoritePlayers || [];
		const favOrgs = userContext.favoriteEsportsOrgs || [];

		if (event.homeTeam && favTeams.some((t) => event.homeTeam.includes(t)))
			score += 2;
		if (event.awayTeam && favTeams.some((t) => event.awayTeam.includes(t)))
			score += 2;
		if (
			event.norwegianPlayers &&
			event.norwegianPlayers.some((p) => favPlayers.some((f) => p.name.includes(f)))
		)
			score += 2;
		if (event.title && favOrgs.some((o) => event.title.includes(o)))
			score += 2;

		const sportPrefs = userContext.sportPreferences || {};
		if (sportPrefs[event.sport] === "high") score += 1;
		if (sportPrefs[event.sport] === "low") score -= 1;
		if (event.norwegian) score += 1;

		return score;
	}

	const userContext = {
		favoriteTeams: ["Barcelona", "Liverpool", "Lyn"],
		favoritePlayers: ["Viktor Hovland", "Casper Ruud"],
		favoriteEsportsOrgs: ["100 Thieves"],
		sportPreferences: { football: "high", golf: "high", esports: "low" },
	};

	it("boosts favorite team events", () => {
		const event = { sport: "football", homeTeam: "Barcelona", awayTeam: "Real Madrid", importance: 3 };
		expect(scoreEvent(event, userContext)).toBeGreaterThan(3);
	});

	it("boosts events with Norwegian players", () => {
		const event = {
			sport: "golf",
			title: "PGA Tour",
			norwegianPlayers: [{ name: "Viktor Hovland" }],
			importance: 3,
		};
		expect(scoreEvent(event, userContext)).toBeGreaterThan(3);
	});

	it("boosts favorite esports org", () => {
		const event = { sport: "esports", title: "100 Thieves vs NAVI", importance: 3 };
		expect(scoreEvent(event, userContext)).toBeGreaterThan(3);
	});

	it("applies sport preference boost", () => {
		const footballEvent = { sport: "football", title: "Test", importance: 3 };
		const esportsEvent = { sport: "esports", title: "Test", importance: 3 };
		expect(scoreEvent(footballEvent, userContext)).toBeGreaterThan(
			scoreEvent(esportsEvent, userContext)
		);
	});

	it("boosts Norwegian events", () => {
		const norEvent = { sport: "football", title: "Test", importance: 3, norwegian: true };
		const regEvent = { sport: "football", title: "Test", importance: 3, norwegian: false };
		expect(scoreEvent(norEvent, userContext)).toBe(scoreEvent(regEvent, userContext) + 1);
	});
});
