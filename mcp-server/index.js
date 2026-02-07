#!/usr/bin/env node
/**
 * SportSync MCP Server
 *
 * Exposes sports event data as MCP tools for Claude Desktop / Claude Code.
 * Reads from docs/data/events.json and scripts/config/user-context.json.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";

// Resolve paths relative to the repo root (parent of mcp-server/)
const REPO_ROOT = path.resolve(
	process.env.SPORTSYNC_ROOT || path.join(import.meta.dirname, "..")
);
const EVENTS_PATH = path.join(REPO_ROOT, "docs", "data", "events.json");
const USER_CONTEXT_PATH = path.join(
	REPO_ROOT,
	"scripts",
	"config",
	"user-context.json"
);
const META_PATH = path.join(REPO_ROOT, "docs", "data", "meta.json");

function loadJSON(filePath) {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf-8"));
	} catch {
		return null;
	}
}

function formatDate(isoString) {
	const d = new Date(isoString);
	return d.toLocaleString("en-NO", {
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "Europe/Oslo",
	});
}

function getRelativeDay(isoString) {
	const eventDate = new Date(isoString);
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const eventDay = new Date(
		eventDate.getFullYear(),
		eventDate.getMonth(),
		eventDate.getDate()
	);
	const diff = Math.round((eventDay - today) / 86400000);
	if (diff === 0) return "Today";
	if (diff === 1) return "Tomorrow";
	if (diff < 7) return `In ${diff} days`;
	return formatDate(isoString);
}

function sportEmoji(sport) {
	const map = {
		football: "⚽",
		golf: "⛳",
		tennis: "🎾",
		f1: "🏎️",
		formula1: "🏎️",
		chess: "♟️",
		esports: "🎮",
	};
	return map[sport] || "🏅";
}

function formatEventCompact(event) {
	const emoji = sportEmoji(event.sport);
	const time = formatDate(event.time);
	const importance = event.importance ? ` [${event.importance}/5]` : "";
	const summary = event.summary ? `\n   ${event.summary}` : "";
	const tags =
		event.tags && event.tags.length > 0
			? `\n   Tags: ${event.tags.join(", ")}`
			: "";
	const norwegian = event.norwegian ? " 🇳🇴" : "";

	let details = "";
	if (event.homeTeam && event.awayTeam) {
		details = `\n   ${event.homeTeam} vs ${event.awayTeam}`;
	}
	if (event.norwegianPlayers && event.norwegianPlayers.length > 0) {
		details += `\n   Norwegian players: ${event.norwegianPlayers.map((p) => p.name).join(", ")}`;
	}
	if (event.venue && event.venue !== "TBD") {
		details += `\n   Venue: ${event.venue}`;
	}
	if (event.streaming && event.streaming.length > 0) {
		details += `\n   Watch on: ${event.streaming.map((s) => s.platform).join(", ")}`;
	}

	return `${emoji} ${event.title}${norwegian}${importance}\n   ${time} | ${event.tournament}${details}${summary}${tags}`;
}

// --- Tool implementations ---

function queryEvents(args) {
	const events = loadJSON(EVENTS_PATH);
	if (!events || !Array.isArray(events)) return "No events data available.";

	let filtered = events;
	const now = new Date();

	// Filter by sport
	if (args.sport) {
		const sport = args.sport.toLowerCase();
		filtered = filtered.filter(
			(e) => e.sport === sport || e.sport === sport.replace("formula1", "f1")
		);
	}

	// Filter by date range
	if (args.date_range) {
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);
		const weekEnd = new Date(today);
		weekEnd.setDate(weekEnd.getDate() + 7);

		switch (args.date_range) {
			case "today":
				filtered = filtered.filter((e) => {
					const d = new Date(e.time);
					return d >= today && d < tomorrow;
				});
				break;
			case "tomorrow":
				filtered = filtered.filter((e) => {
					const d = new Date(e.time);
					const dayAfter = new Date(tomorrow);
					dayAfter.setDate(dayAfter.getDate() + 1);
					return d >= tomorrow && d < dayAfter;
				});
				break;
			case "week":
				filtered = filtered.filter((e) => {
					const d = new Date(e.time);
					return d >= today && d < weekEnd;
				});
				break;
		}
	}

	// Filter by norwegian relevance
	if (args.norwegian_only) {
		filtered = filtered.filter((e) => e.norwegian);
	}

	// Filter by team
	if (args.team) {
		const team = args.team.toLowerCase();
		filtered = filtered.filter(
			(e) =>
				(e.homeTeam && e.homeTeam.toLowerCase().includes(team)) ||
				(e.awayTeam && e.awayTeam.toLowerCase().includes(team)) ||
				e.title.toLowerCase().includes(team)
		);
	}

	// Filter by player
	if (args.player) {
		const player = args.player.toLowerCase();
		filtered = filtered.filter(
			(e) =>
				(e.norwegianPlayers &&
					e.norwegianPlayers.some((p) =>
						p.name.toLowerCase().includes(player)
					)) ||
				(e.participants &&
					e.participants.some((p) => p.toLowerCase().includes(player))) ||
				e.title.toLowerCase().includes(player)
		);
	}

	// Filter by minimum importance
	if (args.min_importance) {
		filtered = filtered.filter(
			(e) => e.importance && e.importance >= args.min_importance
		);
	}

	// Search by keyword
	if (args.search) {
		const search = args.search.toLowerCase();
		filtered = filtered.filter(
			(e) =>
				e.title.toLowerCase().includes(search) ||
				(e.tournament && e.tournament.toLowerCase().includes(search)) ||
				(e.venue && e.venue.toLowerCase().includes(search)) ||
				(e.summary && e.summary.toLowerCase().includes(search)) ||
				(e.tags && e.tags.some((t) => t.includes(search)))
		);
	}

	if (filtered.length === 0) return "No events match your query.";

	const header = `Found ${filtered.length} event${filtered.length === 1 ? "" : "s"}:\n`;
	return header + filtered.map(formatEventCompact).join("\n\n");
}

function getRecommendations(args) {
	const events = loadJSON(EVENTS_PATH);
	const userContext = loadJSON(USER_CONTEXT_PATH) || {};
	if (!events || !Array.isArray(events))
		return "No events data available.";

	const count = args.count || 5;
	const now = new Date();

	// Filter to upcoming events
	let upcoming = events.filter((e) => new Date(e.time) > now);

	// If date specified, filter to that day
	if (args.date) {
		const targetDate = new Date(args.date);
		const nextDay = new Date(targetDate);
		nextDay.setDate(nextDay.getDate() + 1);
		upcoming = upcoming.filter((e) => {
			const d = new Date(e.time);
			return d >= targetDate && d < nextDay;
		});
	}

	// Score each event
	const scored = upcoming.map((event) => {
		let score = event.importance || 2;

		// Boost favorites
		const favTeams = userContext.favoriteTeams || [];
		const favPlayers = userContext.favoritePlayers || [];
		const favOrgs = userContext.favoriteEsportsOrgs || [];

		if (event.homeTeam && favTeams.some((t) => event.homeTeam.includes(t)))
			score += 2;
		if (event.awayTeam && favTeams.some((t) => event.awayTeam.includes(t)))
			score += 2;
		if (
			event.norwegianPlayers &&
			event.norwegianPlayers.some((p) =>
				favPlayers.some((f) => p.name.includes(f))
			)
		)
			score += 2;
		if (event.title && favOrgs.some((o) => event.title.includes(o)))
			score += 2;

		// Boost by sport preference
		const sportPrefs = userContext.sportPreferences || {};
		if (sportPrefs[event.sport] === "high") score += 1;
		if (sportPrefs[event.sport] === "low") score -= 1;

		// Boost Norwegian events
		if (event.norwegian) score += 1;

		return { ...event, _score: score };
	});

	scored.sort((a, b) => b._score - a._score);
	const top = scored.slice(0, count);

	if (top.length === 0) return "No upcoming events found.";

	let result = `Top ${top.length} recommended events:\n\n`;
	result += top.map((e, i) => `${i + 1}. ${formatEventCompact(e)}`).join("\n\n");

	// Add user context summary
	const uTeams = userContext.favoriteTeams || [];
	const uPlayers = userContext.favoritePlayers || [];
	result += `\n\n---\nBased on your preferences: ${uTeams.length ? `Teams: ${uTeams.join(", ")}` : ""} ${uPlayers.length ? `| Players: ${uPlayers.join(", ")}` : ""}`;

	return result;
}

function getBriefing(args) {
	const events = loadJSON(EVENTS_PATH);
	const meta = loadJSON(META_PATH);
	const userContext = loadJSON(USER_CONTEXT_PATH) || {};
	if (!events || !Array.isArray(events))
		return "No events data available.";

	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const period = args.period || "week";

	let endDate;
	if (period === "today") {
		endDate = new Date(today);
		endDate.setDate(endDate.getDate() + 1);
	} else {
		endDate = new Date(today);
		endDate.setDate(endDate.getDate() + 7);
	}

	let upcoming = events.filter((e) => {
		const d = new Date(e.time);
		return d >= today && d < endDate;
	});

	if (args.focus === "norwegian") {
		upcoming = upcoming.filter((e) => e.norwegian);
	}

	if (upcoming.length === 0)
		return `No events found for ${period === "today" ? "today" : "this week"}${args.focus === "norwegian" ? " with Norwegian relevance" : ""}.`;

	// Group by sport
	const bySport = {};
	for (const event of upcoming) {
		if (!bySport[event.sport]) bySport[event.sport] = [];
		bySport[event.sport].push(event);
	}

	let briefing = `## SportSync ${period === "today" ? "Daily" : "Weekly"} Briefing${args.focus === "norwegian" ? " (Norwegian Focus)" : ""}\n`;
	if (meta && meta.lastUpdate) {
		briefing += `Data updated: ${formatDate(meta.lastUpdate)}\n`;
	}
	briefing += `\n`;

	// Highlights first
	const mustWatch = upcoming.filter((e) => e.importance && e.importance >= 4);
	if (mustWatch.length > 0) {
		briefing += `### Must-Watch Events\n`;
		briefing += mustWatch.map(formatEventCompact).join("\n\n");
		briefing += `\n\n`;
	}

	// Then by sport
	for (const [sport, sportEvents] of Object.entries(bySport)) {
		const emoji = sportEmoji(sport);
		briefing += `### ${emoji} ${sport.charAt(0).toUpperCase() + sport.slice(1)}\n`;
		briefing += sportEvents.map(formatEventCompact).join("\n\n");
		briefing += `\n\n`;
	}

	// User context
	briefing += `---\nYour favorites: ${(userContext.favoriteTeams || []).join(", ")} | ${(userContext.favoritePlayers || []).join(", ")}`;

	return briefing;
}

function getEventDetails(args) {
	const events = loadJSON(EVENTS_PATH);
	if (!events || !Array.isArray(events))
		return "No events data available.";

	const search = (args.search || "").toLowerCase();
	const match = events.find(
		(e) =>
			e.title.toLowerCase().includes(search) ||
			(e.homeTeam && e.homeTeam.toLowerCase().includes(search)) ||
			(e.awayTeam && e.awayTeam.toLowerCase().includes(search))
	);

	if (!match) return `No event found matching "${args.search}".`;

	let detail = `## ${match.title}\n\n`;
	detail += `**Sport:** ${sportEmoji(match.sport)} ${match.sport}\n`;
	detail += `**Tournament:** ${match.tournament}\n`;
	detail += `**Time:** ${formatDate(match.time)} (${getRelativeDay(match.time)})\n`;
	if (match.venue && match.venue !== "TBD") detail += `**Venue:** ${match.venue}\n`;
	if (match.status) detail += `**Status:** ${match.status}\n`;
	detail += `\n`;

	if (match.homeTeam && match.awayTeam) {
		detail += `**Match:** ${match.homeTeam} vs ${match.awayTeam}\n`;
	}

	if (match.norwegianPlayers && match.norwegianPlayers.length > 0) {
		detail += `\n**Norwegian Players:**\n`;
		for (const p of match.norwegianPlayers) {
			detail += `- ${p.name}`;
			if (p.teeTime) detail += ` — Tee time: ${p.teeTime}`;
			if (p.round) detail += ` (Round ${p.round})`;
			detail += `\n`;
		}
	}

	if (match.streaming && match.streaming.length > 0) {
		detail += `\n**Where to Watch:**\n`;
		for (const s of match.streaming) {
			detail += `- ${s.platform}${s.url ? `: ${s.url}` : ""}\n`;
		}
	}

	if (match.importance) {
		detail += `\n**AI Analysis:**\n`;
		detail += `- Importance: ${match.importance}/5\n`;
		if (match.importanceReason) detail += `- Reason: ${match.importanceReason}\n`;
		if (match.summary) detail += `- Summary: ${match.summary}\n`;
		if (match.norwegianRelevance)
			detail += `- Norwegian Relevance: ${match.norwegianRelevance}/5\n`;
		if (match.tags && match.tags.length > 0)
			detail += `- Tags: ${match.tags.join(", ")}\n`;
	}

	if (match.link) detail += `\n**Link:** ${match.link}\n`;

	return detail;
}

function getDashboardStatus() {
	const events = loadJSON(EVENTS_PATH);
	const meta = loadJSON(META_PATH);
	const userContext = loadJSON(USER_CONTEXT_PATH);

	let status = "## SportSync Dashboard Status\n\n";

	if (meta) {
		status += `**Last updated:** ${formatDate(meta.lastUpdate)}\n`;
		if (meta.nextUpdate) status += `**Next update:** ${formatDate(meta.nextUpdate)}\n`;
	}

	if (events && Array.isArray(events)) {
		status += `**Total events:** ${events.length}\n`;

		const bySport = {};
		for (const e of events) {
			bySport[e.sport] = (bySport[e.sport] || 0) + 1;
		}
		status += `**By sport:** ${Object.entries(bySport).map(([s, c]) => `${sportEmoji(s)} ${s}: ${c}`).join(", ")}\n`;

		const enriched = events.filter((e) => e.importance);
		status += `**Enriched:** ${enriched.length}/${events.length} events\n`;

		const norwegian = events.filter((e) => e.norwegian);
		status += `**Norwegian events:** ${norwegian.length}\n`;

		const dateRange = events.length > 0
			? `${formatDate(events[0].time)} — ${formatDate(events[events.length - 1].time)}`
			: "none";
		status += `**Date range:** ${dateRange}\n`;
	}

	if (userContext) {
		status += `\n**Your Preferences:**\n`;
		status += `- Teams: ${(userContext.favoriteTeams || []).join(", ") || "none"}\n`;
		status += `- Players: ${(userContext.favoritePlayers || []).join(", ") || "none"}\n`;
		status += `- Esports: ${(userContext.favoriteEsportsOrgs || []).join(", ") || "none"}\n`;
	}

	return status;
}

// --- MCP Server setup ---

const server = new Server(
	{ name: "sportsync", version: "1.0.0" },
	{ capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		{
			name: "query_events",
			description:
				"Search and filter upcoming sports events. Can filter by sport, date range, team, player, importance, or keyword. Returns formatted event list.",
			inputSchema: {
				type: "object",
				properties: {
					sport: {
						type: "string",
						description: "Filter by sport: football, golf, tennis, f1, chess, esports",
					},
					date_range: {
						type: "string",
						enum: ["today", "tomorrow", "week"],
						description: "Filter by time period",
					},
					team: {
						type: "string",
						description: "Filter by team name (partial match)",
					},
					player: {
						type: "string",
						description: "Filter by player name (partial match)",
					},
					norwegian_only: {
						type: "boolean",
						description: "Only show events with Norwegian relevance",
					},
					min_importance: {
						type: "number",
						description: "Minimum importance score (1-5, requires AI enrichment)",
					},
					search: {
						type: "string",
						description: "Free-text search across title, tournament, venue, tags",
					},
				},
			},
		},
		{
			name: "get_recommendations",
			description:
				"Get personalized event recommendations based on your preferences (favorite teams, players, sports). Scores events and returns the top picks.",
			inputSchema: {
				type: "object",
				properties: {
					count: {
						type: "number",
						description: "Number of recommendations (default 5)",
					},
					date: {
						type: "string",
						description: "ISO date to get recommendations for a specific day (e.g. 2025-08-22)",
					},
				},
			},
		},
		{
			name: "get_briefing",
			description:
				"Get a structured sports briefing for today or this week, grouped by sport with must-watch highlights.",
			inputSchema: {
				type: "object",
				properties: {
					period: {
						type: "string",
						enum: ["today", "week"],
						description: "Briefing period (default: week)",
					},
					focus: {
						type: "string",
						enum: ["all", "norwegian"],
						description: "Focus on all events or Norwegian-relevant only",
					},
				},
			},
		},
		{
			name: "get_event_details",
			description:
				"Get detailed information about a specific event including teams, players, streaming, venue, and AI analysis.",
			inputSchema: {
				type: "object",
				properties: {
					search: {
						type: "string",
						description: "Event title, team name, or keyword to find the event",
					},
				},
				required: ["search"],
			},
		},
		{
			name: "dashboard_status",
			description:
				"Get the current status of the SportSync dashboard: data freshness, event counts, enrichment status, and your preferences.",
			inputSchema: {
				type: "object",
				properties: {},
			},
		},
	],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;

	let result;
	switch (name) {
		case "query_events":
			result = queryEvents(args || {});
			break;
		case "get_recommendations":
			result = getRecommendations(args || {});
			break;
		case "get_briefing":
			result = getBriefing(args || {});
			break;
		case "get_event_details":
			result = getEventDetails(args || {});
			break;
		case "dashboard_status":
			result = getDashboardStatus();
			break;
		default:
			result = `Unknown tool: ${name}`;
	}

	return { content: [{ type: "text", text: result }] };
});

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
