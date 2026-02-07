import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildUserPrompt } from "../scripts/lib/enrichment-prompts.js";

describe("buildSystemPrompt()", () => {
	it("includes user context in prompt", () => {
		const ctx = {
			location: "Norway",
			favoriteTeams: ["Barcelona", "Lyn"],
			favoritePlayers: ["Viktor Hovland"],
			favoriteEsportsOrgs: ["100 Thieves"],
			sportPreferences: { football: "high", golf: "high" },
		};
		const prompt = buildSystemPrompt(ctx);

		expect(prompt).toContain("Norway");
		expect(prompt).toContain("Barcelona");
		expect(prompt).toContain("Lyn");
		expect(prompt).toContain("Viktor Hovland");
		expect(prompt).toContain("100 Thieves");
	});

	it("handles empty user context", () => {
		const prompt = buildSystemPrompt({});
		expect(prompt).toContain("importance");
		expect(prompt).toContain("norwegianRelevance");
		expect(prompt).toContain("tags");
	});

	it("includes scoring guidance for all sports", () => {
		const prompt = buildSystemPrompt({});
		expect(prompt).toContain("Football");
		expect(prompt).toContain("Golf");
		expect(prompt).toContain("Tennis");
		expect(prompt).toContain("F1");
		expect(prompt).toContain("Chess");
		expect(prompt).toContain("Esports");
	});

	it("requests JSON output format", () => {
		const prompt = buildSystemPrompt({});
		expect(prompt).toContain("JSON");
		expect(prompt).toContain('"events"');
	});
});

describe("buildUserPrompt()", () => {
	it("serializes event batch into prompt", () => {
		const events = [
			{
				sport: "football",
				tournament: "Premier League",
				title: "Arsenal vs Chelsea",
				time: "2025-08-20T15:00:00Z",
				venue: "Emirates",
				homeTeam: "Arsenal",
				awayTeam: "Chelsea",
			},
		];
		const prompt = buildUserPrompt(events);

		expect(prompt).toContain("Arsenal vs Chelsea");
		expect(prompt).toContain("Premier League");
		expect(prompt).toContain("1 events");
	});

	it("limits participants to 10", () => {
		const events = [
			{
				sport: "golf",
				title: "Test",
				time: "2025-08-20T15:00:00Z",
				participants: Array.from({ length: 20 }, (_, i) => `Player ${i}`),
			},
		];
		const prompt = buildUserPrompt(events);
		const parsed = JSON.parse(prompt.split("\n\n")[1]);
		expect(parsed[0].participants).toHaveLength(10);
	});

	it("extracts Norwegian player names", () => {
		const events = [
			{
				sport: "golf",
				title: "Test",
				time: "2025-08-20T15:00:00Z",
				norwegianPlayers: [
					{ name: "Viktor Hovland", teeTime: "08:30" },
					{ name: "Kristoffer Reitan", teeTime: "09:00" },
				],
			},
		];
		const prompt = buildUserPrompt(events);
		expect(prompt).toContain("Viktor Hovland");
		expect(prompt).toContain("Kristoffer Reitan");
	});
});
