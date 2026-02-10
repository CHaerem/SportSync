#!/usr/bin/env node
/**
 * Generates featured.json with AI-curated editorial content:
 * - brief: 2-3 editorial lines summarizing the day
 * - sections: dynamic featured content (Olympics, World Cup, CL, etc.)
 * - radar: 2-3 "on the radar" sentences about potential events
 *
 * Auth (checked in order):
 *   1. CLAUDE_CODE_OAUTH_TOKEN — uses Claude CLI (Max subscription)
 *   2. ANTHROPIC_API_KEY — direct Anthropic API
 *   3. OPENAI_API_KEY — direct OpenAI API
 *   4. Fallback — template-based brief (no AI)
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { readJsonIfExists, rootDataPath, writeJsonPretty } from "./lib/helpers.js";
import { LLMClient } from "./lib/llm-client.js";

const FEATURED_SCHEMA = {
	brief: ["string — 2-3 crisp editorial lines, max 15 words each"],
	sections: [
		{
			id: "string — kebab-case identifier like olympics-2026",
			title: "string — display title",
			emoji: "string — relevant emoji",
			style: "highlight | default",
			items: [
				{
					text: "string — the content line",
					type: "stat | event | text",
				},
			],
			expandLabel: "string or null — label for expand button",
			expandItems: [{ text: "string", type: "stat | event | text" }],
		},
	],
	radar: ["string — 2-3 sentences about potential upcoming events for Norwegian athletes"],
};

function buildSystemPrompt() {
	return `You are a Norwegian sports editor for SportSync, a minimal sports dashboard.
Your job is to generate curated editorial content in JSON format.

Rules:
- Write in English but with a Norwegian sports fan perspective
- Prioritize Norwegian athletes: Hovland (golf), Ruud (tennis), Carlsen (chess),
  Klaebo/Johaug/Boe (winter sports), rain (esports), Lyn/Barcelona/Liverpool (football)
- Reference standings positions and form when relevant (e.g. "Arsenal top the table", "Hovland T5")
- Use breaking news headlines to make the brief timely and relevant
- Events marked with ★4 or ★5 are must-watch — prioritize these in the brief and radar
- Use AI-generated summaries and tags for context about stakes and storylines
- Brief lines must be crisp (max 15 words each), like newspaper headlines
- Featured sections should highlight major multi-sport or tournament events currently
  happening: Olympics, World Cup, Champions League knockout stages, Grand Slams, etc.
- "On the radar" should mention potential upcoming events, entry lists, qualification status
- If no major featured event is active, return an empty sections array
- Always return valid JSON matching the provided schema exactly`;
}

function loadCuratedConfigs() {
	const configDir = path.resolve(process.cwd(), "scripts", "config");
	if (!fs.existsSync(configDir)) return [];
	const configs = [];
	for (const file of fs.readdirSync(configDir).filter((f) => f.endsWith(".json"))) {
		const config = readJsonIfExists(path.join(configDir, file));
		if (config && config.name) configs.push(config);
	}
	return configs;
}

function buildCuratedContext(configs, now) {
	if (configs.length === 0) return "";
	const parts = configs.map((c) => {
		const lines = [`\n--- ${c.name} (${c.location || "TBD"}) ---`];
		if (c.startDate && c.endDate) {
			const start = new Date(c.startDate);
			const end = new Date(c.endDate);
			const isActive = now >= start && now <= end;
			lines.push(`Dates: ${c.startDate} to ${c.endDate}${isActive ? " [CURRENTLY ACTIVE]" : ""}`);
		}
		if (c.norwegianAthletes?.length) {
			lines.push(`Norwegian athletes: ${c.norwegianAthletes.join(", ")}`);
		}
		const upcoming = (c.events || [])
			.filter((e) => new Date(e.time) >= now)
			.slice(0, 8);
		if (upcoming.length > 0) {
			lines.push("Upcoming events:");
			for (const e of upcoming) {
				const t = new Date(e.time);
				const day = t.toLocaleDateString("en-US", { weekday: "short", timeZone: "Europe/Oslo" });
				const time = t.toLocaleTimeString("en-NO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Oslo" });
				const players = e.norwegianPlayers?.map((p) => p.name).join(", ") || "";
				lines.push(`  ${day} ${time} | ${e.title}${players ? ` — ${players}` : ""}`);
			}
		}
		return lines.join("\n");
	});
	return `\n\nCurated major event data:\n${parts.join("\n")}`;
}

export function buildStandingsContext(standings) {
	if (!standings) return "";
	const parts = [];

	// Premier League top 5
	const pl = standings.football?.premierLeague;
	if (Array.isArray(pl) && pl.length > 0) {
		const rows = pl.slice(0, 5).map(
			(t) => `  ${t.position}. ${t.team} — ${t.points}pts (W${t.won} D${t.drawn} L${t.lost}, GD ${t.gd > 0 ? "+" : ""}${t.gd})`
		);
		parts.push(`Premier League standings (top 5):\n${rows.join("\n")}`);
	}

	// Golf leaderboards
	for (const key of ["pga", "dpWorld"]) {
		const tour = standings.golf?.[key];
		if (tour?.name && tour.leaderboard?.length > 0) {
			const label = key === "pga" ? "PGA Tour" : "DP World Tour";
			const rows = tour.leaderboard.slice(0, 5).map(
				(p) => `  ${p.position || "-"}. ${p.player} (${p.score})`
			);
			parts.push(`${label} — ${tour.name} (${tour.status}):\n${rows.join("\n")}`);
		}
	}

	// F1 top 5
	const f1 = standings.f1?.drivers;
	if (Array.isArray(f1) && f1.length > 0) {
		const rows = f1.slice(0, 5).map(
			(d) => `  ${d.position}. ${d.driver} (${d.team}) — ${d.points}pts, ${d.wins} wins`
		);
		parts.push(`F1 Driver Standings (top 5):\n${rows.join("\n")}`);
	}

	if (parts.length === 0) return "";
	return `\n\nCurrent standings data:\n${parts.join("\n\n")}`;
}

export function buildRssContext(rssDigest) {
	if (!rssDigest?.items?.length) return "";
	const lines = rssDigest.items.slice(0, 15).map((item) => {
		const sport = item.sport !== "general" ? `[${item.sport}]` : `[${item.source}]`;
		return `  ${sport} ${item.title}`;
	});
	return `\n\nRecent sports news headlines:\n${lines.join("\n")}`;
}

function buildUserPrompt(events, now, curatedConfigs, standings, rssDigest) {
	const dateStr = now.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: "Europe/Oslo",
	});

	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const weekEnd = new Date(todayStart);
	weekEnd.setDate(weekEnd.getDate() + 7);

	const todayEvents = events.filter((e) => {
		const t = new Date(e.time);
		return t >= todayStart && t < new Date(todayStart.getTime() + 86400000);
	});

	const weekEvents = events.filter((e) => {
		const t = new Date(e.time);
		return t >= todayStart && t < weekEnd;
	});

	const summary = weekEvents
		.slice(0, 30)
		.map((e) => {
			const t = new Date(e.time);
			const day = t.toLocaleDateString("en-US", { weekday: "short", timeZone: "Europe/Oslo" });
			const time = t.toLocaleTimeString("en-NO", {
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
				timeZone: "Europe/Oslo",
			});
			const nor = e.norwegian ? " [NOR]" : "";
			let enrichment = "";
			if (e.importance >= 4) enrichment += ` [\u2605${e.importance}]`;
			if (e.summary) enrichment += ` \u2014 ${e.summary}`;
			if (Array.isArray(e.tags) && e.tags.length > 0) {
				const top = e.tags.filter((t) => ["must-watch", "rivalry", "derby", "final", "major", "title-race"].includes(t)).slice(0, 2);
				if (top.length > 0) enrichment += ` [${top.join(", ")}]`;
			}
			return `${day} ${time} | ${e.sport} | ${e.tournament || ""} | ${e.title}${nor}${enrichment}`;
		})
		.join("\n");

	const curatedContext = buildCuratedContext(curatedConfigs || [], now);
	const standingsContext = buildStandingsContext(standings);
	const rssContext = buildRssContext(rssDigest);

	// Enrichment context — highlight must-watch events for Claude
	let enrichmentContext = "";
	const mustWatch = weekEvents.filter((e) => e.importance >= 4);
	if (mustWatch.length > 0) {
		const items = mustWatch.slice(0, 5).map((e) => {
			const s = e.summary ? `: ${e.summary}` : "";
			return `  - ${e.title}${s}`;
		});
		enrichmentContext = `\n\nMust-watch events (importance \u22654):\n${items.join("\n")}`;
	}

	return `Today is ${dateStr}. There are ${todayEvents.length} events today and ${weekEvents.length} this week.

Events (next 7 days, max 30 shown):
${summary || "(no events)"}${curatedContext}${standingsContext}${rssContext}${enrichmentContext}

Generate featured.json matching this schema:
${JSON.stringify(FEATURED_SCHEMA, null, 2)}

Remember:
- brief: exactly 2-3 lines
- sections: only if a major event (Olympics, World Cup, CL, etc.) is active — use the curated data above for accurate details
- radar: 2-3 forward-looking sentences about Norwegian athletes
- Return ONLY valid JSON, no markdown wrapper`;
}

async function generateWithClaudeCLI(systemPrompt, userPrompt) {
	const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
	const tmpFile = path.join(rootDataPath(), ".featured-prompt.tmp");
	fs.writeFileSync(tmpFile, fullPrompt);
	try {
		const output = execSync(
			`cat "${tmpFile}" | npx -y @anthropic-ai/claude-code@latest -p --output-format text`,
			{ encoding: "utf-8", timeout: 120000, maxBuffer: 1024 * 1024 }
		);
		return output.trim();
	} finally {
		try { fs.unlinkSync(tmpFile); } catch {}
	}
}

function generateFallbackBrief(events, now) {
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const todayEnd = new Date(todayStart.getTime() + 86400000);

	const todayEvents = events.filter((e) => {
		const t = new Date(e.time);
		return t >= todayStart && t < todayEnd;
	});

	if (todayEvents.length === 0) return ["No events scheduled today."];

	const sportCounts = {};
	todayEvents.forEach((e) => {
		const sport = e.sport === "f1" ? "F1" : e.sport;
		sportCounts[sport] = (sportCounts[sport] || 0) + 1;
	});

	const parts = Object.entries(sportCounts)
		.map(([sport, count]) => `${count} ${sport}`)
		.join(", ");

	const lines = [`${todayEvents.length} events today: ${parts}.`];

	const norEvent = todayEvents.find((e) => e.norwegian);
	if (norEvent) {
		const time = new Date(norEvent.time).toLocaleTimeString("en-NO", {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
			timeZone: "Europe/Oslo",
		});
		lines.push(`${norEvent.title} at ${time}.`);
	}

	return lines;
}

async function main() {
	const dataDir = rootDataPath();
	const eventsPath = path.join(dataDir, "events.json");
	const featuredPath = path.join(dataDir, "featured.json");

	const events = readJsonIfExists(eventsPath);
	if (!events || !Array.isArray(events) || events.length === 0) {
		console.log("No events found. Writing minimal featured.json.");
		writeJsonPretty(featuredPath, { brief: ["No events scheduled."], sections: [], radar: [] });
		return;
	}

	const now = new Date();
	const curatedConfigs = loadCuratedConfigs();
	if (curatedConfigs.length > 0) {
		console.log(`Loaded ${curatedConfigs.length} curated config(s): ${curatedConfigs.map((c) => c.name).join(", ")}`);
	}

	const standingsPath = path.join(dataDir, "standings.json");
	const standings = readJsonIfExists(standingsPath);
	if (standings) {
		console.log("Loaded standings.json for editorial context.");
	}

	const rssPath = path.join(dataDir, "rss-digest.json");
	const rssDigest = readJsonIfExists(rssPath);
	if (rssDigest?.items?.length) {
		console.log(`Loaded rss-digest.json: ${rssDigest.items.length} headlines.`);
	}

	const systemPrompt = buildSystemPrompt();
	const userPrompt = buildUserPrompt(events, now, curatedConfigs, standings, rssDigest);
	let rawContent = null;

	// 1. Try Claude CLI (OAuth token from Max subscription)
	if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
		console.log("Using Claude CLI (OAuth) to generate featured content.");
		try {
			rawContent = await generateWithClaudeCLI(systemPrompt, userPrompt);
		} catch (err) {
			console.error("Claude CLI failed:", err.message);
		}
	}

	// 2. Try direct API (ANTHROPIC_API_KEY or OPENAI_API_KEY)
	if (!rawContent) {
		const llm = new LLMClient();
		if (llm.isAvailable()) {
			console.log(`Using ${llm.getProviderName()} API to generate featured content.`);
			try {
				rawContent = await llm.complete(systemPrompt, userPrompt);
			} catch (err) {
				console.error("LLM API failed:", err.message);
			}
		}
	}

	// 3. Fallback — template-based brief
	if (!rawContent) {
		console.log("No AI available. Using fallback brief generation.");
		writeJsonPretty(featuredPath, {
			brief: generateFallbackBrief(events, now),
			sections: [],
			radar: [],
		});
		return;
	}

	// Parse JSON from AI response
	try {
		let result;
		try {
			result = JSON.parse(rawContent);
		} catch {
			const match = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
			if (match) {
				result = JSON.parse(match[1].trim());
			} else {
				throw new Error(`Could not parse JSON from response: ${rawContent.substring(0, 200)}`);
			}
		}

		const featured = {
			brief: Array.isArray(result.brief) ? result.brief.slice(0, 3) : [],
			sections: Array.isArray(result.sections)
				? result.sections.map((s) => ({
						id: s.id || "unknown",
						title: s.title || "",
						emoji: s.emoji || "",
						style: s.style || "default",
						items: Array.isArray(s.items) ? s.items : [],
						expandLabel: s.expandLabel || null,
						expandItems: Array.isArray(s.expandItems) ? s.expandItems : [],
					}))
				: [],
			radar: Array.isArray(result.radar) ? result.radar.slice(0, 3) : [],
		};

		if (featured.brief.length === 0) {
			featured.brief = generateFallbackBrief(events, now);
		}

		writeJsonPretty(featuredPath, featured);
		console.log(
			`Featured content generated: ${featured.brief.length} brief lines, ${featured.sections.length} sections, ${featured.radar.length} radar items.`
		);
	} catch (err) {
		console.error("Failed to parse AI response:", err.message);
		console.log("Falling back to template-based brief.");
		writeJsonPretty(featuredPath, {
			brief: generateFallbackBrief(events, now),
			sections: [],
			radar: [],
		});
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
