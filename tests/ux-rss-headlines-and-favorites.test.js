// Tests for UX personalization batch:
//   Task A: RSS headlines in expanded event view
//   Task B: Favorite buttons for non-football sports
//
// Uses source-level analysis for dashboard.js integration checks
// and functional tests for the pure logic methods.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const dashboardSrc = readFileSync(
	join(import.meta.dirname, "../docs/js/dashboard.js"),
	"utf-8",
);
const indexHtml = readFileSync(
	join(import.meta.dirname, "../docs/index.html"),
	"utf-8",
);

// --- Task A: RSS headlines in expanded view ---

describe("RSS headlines in expanded view (Task A)", () => {
	it("defines _findRelatedHeadlines method", () => {
		expect(dashboardSrc).toContain("_findRelatedHeadlines(event)");
	});

	it("calls _findRelatedHeadlines inside renderExpanded", () => {
		// The renderExpanded method must call the headline finder
		expect(dashboardSrc).toMatch(
			/renderExpanded[\s\S]*?_findRelatedHeadlines\s*\(\s*event\s*\)/,
		);
	});

	it("renders exp-related-news section only when headlines exist", () => {
		// Must check length > 0 before rendering
		expect(dashboardSrc).toMatch(
			/relatedHeadlines\.length\s*>\s*0/,
		);
		expect(dashboardSrc).toContain("exp-related-news");
		expect(dashboardSrc).toContain("exp-related-news-header");
		expect(dashboardSrc).toContain("Related news");
	});

	it("renders headlines as links with target=_blank", () => {
		// The template literal has target="_blank" and class="exp-related-news-link" on the same line
		expect(dashboardSrc).toContain("exp-related-news-link");
		expect(dashboardSrc).toContain('target="_blank" rel="noopener noreferrer" class="exp-related-news-link"');
	});

	it("CSS styles the related news section with muted text", () => {
		expect(indexHtml).toMatch(
			/\.exp-related-news-header[^{]*\{[^}]*var\(--muted\)/s,
		);
		expect(indexHtml).toMatch(
			/\.exp-related-news-link[^{]*\{[^}]*font-size:\s*0\.6[0-9]*rem/s,
		);
	});

	it("limits to 2 headlines max", () => {
		// Must break early or slice to prevent showing too many
		expect(dashboardSrc).toMatch(/matches\.length\s*>=\s*2/);
	});

	it("searches rssDigest items using team and tournament keywords", () => {
		expect(dashboardSrc).toMatch(
			/_findRelatedHeadlines[\s\S]*?homeTeam[\s\S]*?awayTeam[\s\S]*?tournament/,
		);
	});

	it("includes player names in keyword search", () => {
		expect(dashboardSrc).toMatch(
			/_findRelatedHeadlines[\s\S]*?norwegianPlayers/,
		);
	});

	it("deduplicates headlines by link", () => {
		expect(dashboardSrc).toMatch(/seenLinks/);
	});
});

// --- Task A: Functional tests for _findRelatedHeadlines logic ---

describe("_findRelatedHeadlines functional tests", () => {
	// Create a minimal mock of the method logic for unit testing
	function findRelatedHeadlines(event, rssDigest) {
		if (!rssDigest?.items?.length) return [];
		const keywords = [];
		if (event.homeTeam) keywords.push(event.homeTeam.toLowerCase());
		if (event.awayTeam) keywords.push(event.awayTeam.toLowerCase());
		if (event.tournament) {
			const skip = new Set([
				"2026", "2025", "2024", "calendar", "season", "race",
				"weekend", "round", "grand", "prix", "tournaments",
				"championship", "world",
			]);
			const words = event.tournament
				.split(/[\s\-\/]+/)
				.filter((w) => w.length > 2 && !skip.has(w.toLowerCase()));
			words.forEach((w) => keywords.push(w.toLowerCase()));
		}
		if (event.norwegianPlayers?.length > 0) {
			event.norwegianPlayers.forEach((p) => {
				const name = typeof p === "string" ? p : p.name;
				if (name) {
					const parts = name
						.replace(/\s*\(.*?\)\s*/g, "")
						.trim()
						.split(/\s+/);
					if (parts.length > 1)
						keywords.push(parts[parts.length - 1].toLowerCase());
					keywords.push(
						name
							.replace(/\s*\(.*?\)\s*/g, "")
							.trim()
							.toLowerCase(),
					);
				}
			});
		}
		if (keywords.length === 0) return [];

		const matches = [];
		const seenLinks = new Set();
		for (const item of rssDigest.items) {
			if (matches.length >= 2) break;
			const haystack = (
				(item.title || "") +
				" " +
				(item.description || "")
			).toLowerCase();
			const matched = keywords.some(
				(kw) => kw.length > 2 && haystack.includes(kw),
			);
			if (matched && item.link && !seenLinks.has(item.link)) {
				seenLinks.add(item.link);
				matches.push(item);
			}
		}
		return matches;
	}

	const rssDigest = {
		items: [
			{
				title: "Arsenal beat Chelsea 2-1 in thrilling derby",
				link: "https://example.com/1",
				description: "Premier League clash",
			},
			{
				title: "Viktor Hovland shoots 66 at The Masters",
				link: "https://example.com/2",
				description: "Norwegian golfer impresses at Augusta",
			},
			{
				title: "Manchester United transfer news",
				link: "https://example.com/3",
				description: "Latest on signings",
			},
			{
				title: "IEM Rio CS2 results - NAVI dominates",
				link: "https://example.com/4",
				description: "Counter-Strike tournament update",
			},
			{
				title: "Cycling: Gran Camino stage results",
				link: "https://example.com/5",
				description: "Nordhagen in contention",
			},
		],
	};

	it("matches football event by team name", () => {
		const event = {
			sport: "football",
			homeTeam: "Arsenal",
			awayTeam: "Chelsea",
			tournament: "Premier League",
		};
		const results = findRelatedHeadlines(event, rssDigest);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].link).toBe("https://example.com/1");
	});

	it("matches golf event by player name", () => {
		const event = {
			sport: "golf",
			tournament: "PGA Tour",
			norwegianPlayers: [{ name: "Viktor Hovland" }],
		};
		const results = findRelatedHeadlines(event, rssDigest);
		expect(results.length).toBeGreaterThan(0);
		expect(results.some((r) => r.link === "https://example.com/2")).toBe(
			true,
		);
	});

	it("returns empty array when no RSS data", () => {
		const event = { sport: "football", homeTeam: "Arsenal" };
		expect(findRelatedHeadlines(event, null)).toEqual([]);
		expect(findRelatedHeadlines(event, { items: [] })).toEqual([]);
	});

	it("returns max 2 headlines", () => {
		const manyItems = {
			items: Array.from({ length: 10 }, (_, i) => ({
				title: `Arsenal news article ${i}`,
				link: `https://example.com/many-${i}`,
				description: "Arsenal related",
			})),
		};
		const event = { sport: "football", homeTeam: "Arsenal" };
		const results = findRelatedHeadlines(event, manyItems);
		expect(results.length).toBe(2);
	});

	it("deduplicates by link URL", () => {
		const dupeItems = {
			items: [
				{
					title: "Arsenal wins",
					link: "https://example.com/same",
					description: "",
				},
				{
					title: "Arsenal dominates",
					link: "https://example.com/same",
					description: "",
				},
				{
					title: "Arsenal scores",
					link: "https://example.com/other",
					description: "",
				},
			],
		};
		const event = { sport: "football", homeTeam: "Arsenal" };
		const results = findRelatedHeadlines(event, dupeItems);
		expect(results.length).toBe(2);
		expect(results[0].link).toBe("https://example.com/same");
		expect(results[1].link).toBe("https://example.com/other");
	});

	it("returns empty for event with no matchable keywords", () => {
		const event = { sport: "chess" };
		const results = findRelatedHeadlines(event, rssDigest);
		expect(results).toEqual([]);
	});

	it("skips generic tournament words", () => {
		const event = {
			sport: "f1",
			tournament: "Formula 1 World Championship 2026",
		};
		// "Formula" (>2 chars, not in skip list) should match, but the generic
		// words like "World", "Championship", "2026" are filtered out
		const results = findRelatedHeadlines(event, rssDigest);
		// No items mention "Formula" so should be empty
		expect(results).toEqual([]);
	});

	it("matches by last name from parenthesized player format", () => {
		const event = {
			sport: "esports",
			norwegianPlayers: [{ name: "rain (Havard Nygaard)" }],
		};
		// "rain" is only 4 chars and the cleaned name is "rain" — matches length > 2
		const rss = {
			items: [
				{
					title: "rain leads FaZe to victory",
					link: "https://example.com/rain",
					description: "",
				},
			],
		};
		const results = findRelatedHeadlines(event, rss);
		expect(results.length).toBe(1);
	});
});

// --- Task B: Favorite buttons for non-football sports ---

describe("Favorite buttons for non-football sports (Task B)", () => {
	it("defines _extractTeamNames method", () => {
		expect(dashboardSrc).toContain("_extractTeamNames(event)");
	});

	it("calls _extractTeamNames in renderExpanded for non-football events", () => {
		expect(dashboardSrc).toMatch(
			/renderExpanded[\s\S]*?_extractTeamNames\s*\(\s*event\s*\)/,
		);
	});

	it("extracts teams from vs pattern in event title", () => {
		// Method should split on " - " and match "X vs Y"
		expect(dashboardSrc).toMatch(
			/_extractTeamNames[\s\S]*?vsMatch/,
		);
	});

	it("extracts esports participants as team names", () => {
		expect(dashboardSrc).toMatch(
			/_extractTeamNames[\s\S]*?esports[\s\S]*?participants/,
		);
	});

	it("extracts cycling team names from norwegianPlayers", () => {
		expect(dashboardSrc).toMatch(
			/_extractTeamNames[\s\S]*?cycling[\s\S]*?\.team/,
		);
	});

	it("renders team fav buttons with data-action=team for non-football", () => {
		// In the else branch (non-football), team buttons should use data-action="team"
		// and data-sport set to the event's sport
		expect(dashboardSrc).toMatch(
			/extractedTeams\.forEach[\s\S]*?data-action="team"[\s\S]*?data-sport="\$\{this\.esc\(event\.sport\)\}"/,
		);
	});

	it("renders both team and player buttons in same exp-fav-actions block", () => {
		// The else branch should render both types in one container
		expect(dashboardSrc).toMatch(
			/hasFavTeams\s*\|\|\s*hasPlayers/,
		);
	});
});

// --- Task B: Functional tests for _extractTeamNames ---

describe("_extractTeamNames functional tests", () => {
	function extractTeamNames(event) {
		const teams = [];
		const sport = event.sport;
		if (event.title) {
			const segments = event.title.split(/\s+[-\u2013\u2014]\s+/);
			const last = segments[segments.length - 1];
			const vsMatch = last.match(/^(.+?)\s+vs\.?\s+(.+?)$/i);
			if (vsMatch) {
				teams.push(vsMatch[1].trim(), vsMatch[2].trim());
			}
		}
		if (sport === "esports" && event.participants?.length > 0) {
			event.participants.forEach((p) => {
				const name = typeof p === "string" ? p : p.name;
				if (name && !teams.includes(name)) teams.push(name);
			});
		}
		if (sport === "cycling" && event.norwegianPlayers?.length > 0) {
			event.norwegianPlayers.forEach((p) => {
				if (typeof p === "object" && p.team && !teams.includes(p.team)) {
					teams.push(p.team);
				}
			});
		}
		return teams;
	}

	it("extracts teams from 'Team A vs Team B' title", () => {
		const event = {
			sport: "esports",
			title: "IEM Rio - NAVI vs FaZe",
		};
		const teams = extractTeamNames(event);
		expect(teams).toContain("NAVI");
		expect(teams).toContain("FaZe");
	});

	it("extracts esports participants", () => {
		const event = {
			sport: "esports",
			title: "IEM Rio 2026",
			participants: ["NAVI", "FaZe", "Vitality"],
		};
		const teams = extractTeamNames(event);
		expect(teams).toEqual(["NAVI", "FaZe", "Vitality"]);
	});

	it("does not duplicate teams from both title and participants", () => {
		const event = {
			sport: "esports",
			title: "IEM Rio - NAVI vs FaZe",
			participants: ["NAVI", "FaZe", "Vitality"],
		};
		const teams = extractTeamNames(event);
		// NAVI and FaZe from title, Vitality from participants
		expect(teams.filter((t) => t === "NAVI").length).toBe(1);
		expect(teams.filter((t) => t === "FaZe").length).toBe(1);
		expect(teams).toContain("Vitality");
	});

	it("extracts cycling team names from player objects", () => {
		const event = {
			sport: "cycling",
			title: "Giro d'Italia 2026",
			norwegianPlayers: [
				{ name: "Tobias Halland Johannessen", team: "Visma-Lease a Bike" },
				{ name: "Jonas Iversby Hvideberg", team: "Jayco-AlUla" },
			],
		};
		const teams = extractTeamNames(event);
		expect(teams).toContain("Visma-Lease a Bike");
		expect(teams).toContain("Jayco-AlUla");
	});

	it("deduplicates cycling teams", () => {
		const event = {
			sport: "cycling",
			norwegianPlayers: [
				{ name: "Rider A", team: "Visma" },
				{ name: "Rider B", team: "Visma" },
			],
		};
		const teams = extractTeamNames(event);
		expect(teams.filter((t) => t === "Visma").length).toBe(1);
	});

	it("returns empty for event with no team data", () => {
		const event = { sport: "chess", title: "Candidates Tournament" };
		expect(extractTeamNames(event)).toEqual([]);
	});

	it("returns empty for F1 event without vs in title", () => {
		const event = {
			sport: "f1",
			title: "Bahrain Grand Prix 2026",
		};
		expect(extractTeamNames(event)).toEqual([]);
	});

	it("handles string participants in esports", () => {
		const event = {
			sport: "esports",
			participants: [{ name: "G2" }, "Cloud9"],
		};
		const teams = extractTeamNames(event);
		expect(teams).toContain("G2");
		expect(teams).toContain("Cloud9");
	});
});
