#!/usr/bin/env node
/**
 * Generates featured.json with AI-curated editorial content using block-based layout.
 * Output: { blocks: [{ type, text, ... }, ...] }
 *
 * Block types: headline, event-line, event-group, narrative, section, divider
 *
 * Auth (checked in order):
 *   1. CLAUDE_CODE_OAUTH_TOKEN — uses Claude CLI (Max subscription)
 *   2. ANTHROPIC_API_KEY — direct Anthropic API
 *   3. OPENAI_API_KEY — direct OpenAI API
 *   4. Fallback — template-based blocks (no AI)
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { readJsonIfExists, rootDataPath, writeJsonPretty, isEventInWindow, MS_PER_DAY, formatDateKey } from "./lib/helpers.js";
import { LLMClient } from "./lib/llm-client.js";
import { validateFeaturedContent, evaluateEditorialQuality, evaluateWatchPlanQuality, buildQualitySnapshot, buildAdaptiveHints, evaluateResultsQuality, buildResultsHints, buildSanityHints } from "./lib/ai-quality-gates.js";
import { buildWatchPlan } from "./lib/watch-plan.js";

const USER_CONTEXT_PATH = path.resolve(process.cwd(), "scripts", "config", "user-context.json");

const VOICE = process.env.SPORTSYNC_VOICE || "";
const FEATURED_SUFFIX = process.env.SPORTSYNC_FEATURED_SUFFIX || "";
const FEATURED_DATE = process.env.SPORTSYNC_FEATURED_DATE || ""; // YYYY-MM-DD
const FEATURED_MODE = process.env.SPORTSYNC_FEATURED_MODE || "live"; // live | recap | preview

function buildVoiceOverride(voice) {
	const voices = {
		broadsheet: `VOICE OVERRIDE — BROADSHEET:
Adopt the voice of a Financial Times sports correspondent. Write formal, measured prose with complete sentences and understated authority. Use proper nouns, dashes for asides, and precise language. No emoji in lines, no exclamation marks. Example style: "Arsenal host Liverpool at the Emirates in what promises to be a pivotal title encounter, with just two points separating the sides."`,
		terminal: `VOICE OVERRIDE — TERMINAL:
Adopt a terse, abbreviated terminal/scoreboard voice. ALL CAPS headers. Use pipe separators for data. Drop articles (a, an, the). Use status codes like [LIVE] [SOON] [DONE]. Example style: "ARSvLIV | 20:30 | TITLE DECIDER | 2pt gap". Keep everything compact and data-dense. No prose, no narrative — just raw data lines.`,
		playful: `VOICE OVERRIDE — PLAYFUL:
Adopt an energetic, enthusiastic voice. Use exclamation marks freely, casual language, rhetorical questions. Be excited about every event. Example style: "Arsenal vs Liverpool is going to be HUGE tonight! Can the Gunners close the gap? Kick-off at 20:30!" Make it fun and conversational.`,
	};
	return voices[voice] || "";
}

const BLOCKS_SCHEMA = {
	blocks: [
		{ type: "headline", text: "string — Bold editorial headline, the story of the day (max 15 words)" },
		{ type: "event-line", text: "string — Single event highlight: emoji + description + time (max 20 words)" },
		{ type: "event-group", label: "string — Group label", items: ["string — compact event lines"] },
		{ type: "narrative", text: "string — 1-2 editorial sentences, context/analysis (max 40 words)" },
		{
			type: "section", id: "string — kebab-case", title: "string", emoji: "string",
			style: "highlight | default",
			items: [{ text: "string", type: "stat | event | text" }],
			expandLabel: "string or null", expandItems: [{ text: "string", type: "stat | event | text" }],
		},
		{ type: "divider", text: "string — section label like 'This Week' or 'Looking Ahead'" },
	],
};

function buildSystemPrompt(voice) {
	const voiceOverride = buildVoiceOverride(voice);
	return `You are the editor-in-chief of SportSync, a minimal sports dashboard.
Your job is to COMPOSE today's editorial zone using a palette of layout blocks.
Return a JSON object with a single "blocks" array.

YOUR EDITORIAL TOOLS (block types):
1. "headline" — Bold editorial headline, the story of the day. Max 15 words. Use when there's a strong narrative.
2. "event-line" — Single event highlight (the workhorse). Emoji + text + time. Max 20 words.
3. "event-group" — Multiple related events under a label. Use when 3+ events share a theme (e.g. Olympics today, PL matchday).
   Has "label" (string) and "items" (array of strings).
4. "narrative" — 1-2 editorial sentences adding context or analysis. Italic styling. Max 40 words. Use sparingly (max 3 per page).
5. "section" — Major event card with expand/collapse. For Olympics, World Cup, etc. Same structure as before:
   { type:"section", id, title, emoji, style, items:[{text,type}], expandLabel, expandItems }
6. "divider" — Section break with label. Use to separate today from "This Week" or "Looking Ahead".

COMPOSITION RULES:
- Start with today's top stories (headline or event-lines)
- Use event-group when 3+ events share a theme (Olympics, PL matchday)
- Use narrative sparingly for context that enriches the page
- Place a divider before "This Week" content only if something notable is coming this week
- Total 3-8 blocks. At least 1 event-line or event-group.
- Quiet day: 3-4 blocks (2 event-lines, maybe a divider + 1 look-ahead)
- Big day (Olympics, CL night): up to 8 blocks
- NEVER pad with low-importance events. If only 2 things matter today, show 2 things.

EDITOR'S INSTINCT:
- You are an editor, not a data dumper. Pick THE story of the day.
- Ask yourself: if I could only tell the reader ONE thing, what is it?
- Be ruthless about cutting. Every block must earn its place.
- Silence is editorial — a 3-block page on a quiet day is perfect.

VOICE & PERSPECTIVE:
- Write like a sports ticker editor at VG or Dagbladet — punchy, opinionated, never bland
- English with a Norwegian sports fan perspective
- Prioritize: Hovland, Ruud, Carlsen, Klaebo/Johaug/Boe, rain (esports), Lyn/Barcelona/Liverpool
- Lead with drama, stakes, and narrative — not just fixture facts
- Reference standings positions and point gaps when relevant
- Events marked ★4 or ★5 are must-watch — always include these

LINE FORMAT:
- event-line text starts with ONE sport emoji: ⚽ ⛳ 🎾 🏎️ ♟️ 🎮 🏅
- 🏅 is reserved for Olympics ONLY
- Use 24h HH:MM times, telegraphic style
- For football, mention BOTH team names (for inline logo rendering)
- Use actual team names from events data

RESULTS AWARENESS:
- Reference recent results for narrative continuity: "After Arsenal's comeback...", "Hovland's T22 at Pebble Beach..."
- Use results to frame today's stakes — don't just list them
- Favorite team/player results are marked [FAV] — weave these into the narrative
- CRITICAL: Results are listed newest-first with explicit dates. Respect chronological order — if Match A was on Feb 10 and Match B on Feb 12, Match B happened AFTER Match A. Never reverse the timeline.
- Only reference results that appear in the provided data. Do not fabricate or assume results.

STANDINGS INTEGRATION:
- When a football match involves a top-5 PL team, mention league position or point gap
- When a golfer is on the leaderboard, mention position
- CRITICAL: Premier League standings apply to PL teams only. Do not cite PL positions when discussing La Liga, Copa del Rey, or other competitions. Each league has its own context.
- When F1 standings are tight, reference the championship battle

EXAMPLE COMPOSITIONS:

Champions League night:
{ "blocks": [
  { "type": "headline", "text": "All eyes on the Bernabéu" },
  { "type": "event-line", "text": "⚽ Real Madrid vs Liverpool, 21:00" },
  { "type": "narrative", "text": "Holders Liverpool arrive three points clear of the pack. Ancelotti's men need a result." },
  { "type": "event-line", "text": "⚽ PSG vs Bayern Munich, 21:00" },
  { "type": "divider", "text": "This Week" },
  { "type": "event-line", "text": "⚽ Sat — Weekend PL fixtures" }
]}

Olympics day:
{ "blocks": [
  { "type": "headline", "text": "Medal day in Milano-Cortina" },
  { "type": "event-line", "text": "⚽ Barcelona at Atlético Madrid — Copa semifinal, 21:00" },
  { "type": "event-line", "text": "⛳ Hovland at Pebble Beach, tee time 19:03" },
  { "type": "event-group", "label": "🏅 Olympics today", "items": ["Boe brothers in biathlon, 10:00", "Kristoffersen in GS, 10:00", "Johaug in women's XC, 13:00"] },
  { "type": "section", "id": "olympics-2026", "title": "Winter Olympics 2026", "emoji": "🏅", "style": "highlight", "items": [{"text":"Full week schedule","type":"text"}], "expandLabel": null, "expandItems": [] },
  { "type": "divider", "text": "This Week" },
  { "type": "event-line", "text": "♟️ Fri 15:00 — Carlsen opens Freestyle Chess" }
]}

Quiet Tuesday:
{ "blocks": [
  { "type": "event-line", "text": "⛳ Hovland at PGA event, 14:30" },
  { "type": "event-line", "text": "⚽ La Liga mid-table, 21:00" }
]}

AVAILABLE TOOLS:
You have access to SportSync data tools and web browsing. Use them to write better content.
- Use mcp__sportsync__query_events to verify event details or find events you're unsure about
- Use mcp__sportsync__get_recommendations to see the user's personalized top picks
- Use WebSearch to look up breaking news, injuries, or context for today's top 1-2 events
- Keep it focused: max 2 web searches, only for the story of the day
- Your final response must be ONLY the JSON blocks object

OUTPUT:
- Return ONLY valid JSON: { "blocks": [...] }
- No markdown wrapper — raw JSON only${voiceOverride ? `\n\n${voiceOverride}` : ""}`;
}

function buildRecapSystemPrompt(voice) {
	const voiceOverride = buildVoiceOverride(voice);
	return `You are the editor-in-chief of SportSync, a minimal sports dashboard.
Your job is to COMPOSE a recap of a past day's sports action using layout blocks.
Return a JSON object with a single "blocks" array.

YOUR EDITORIAL TOOLS (block types):
1. "headline" — Bold recap headline summarizing the day's story. Max 15 words.
2. "event-line" — Single result or outcome highlight. Emoji + text. Max 20 words.
3. "event-group" — Multiple related results under a label. Use for 3+ results from same sport.
4. "narrative" — 1-2 editorial sentences reflecting on outcomes, surprises, performances. Max 40 words.
5. "divider" — Section break with label (e.g. "Key Results").

RECAP RULES:
- Focus on RESULTS: scores, performances, surprises, narrative arcs that concluded
- Reference actual scores and outcomes from the results data
- Lead with the biggest story — the result that changed the most
- Highlight Norwegian athletes' performances prominently
- Total 3-6 blocks. Be concise — this is a historical record.
- If nothing notable happened, a 2-block page is fine.

VOICE & PERSPECTIVE:
- Write like a morning-after sports editor — reflective but punchy
- English with a Norwegian sports fan perspective
- Past tense: "Hovland finished T5", "Arsenal won 2-1"

LINE FORMAT:
- event-line text starts with ONE sport emoji: ⚽ ⛳ 🎾 🏎️ ♟️ 🎮 🏅
- No times needed (it's a recap)

OUTPUT:
- Return ONLY valid JSON: { "blocks": [...] }
- No markdown wrapper — raw JSON only${voiceOverride ? `\n\n${voiceOverride}` : ""}`;
}

function buildPreviewSystemPrompt(voice) {
	const voiceOverride = buildVoiceOverride(voice);
	return `You are the editor-in-chief of SportSync, a minimal sports dashboard.
Your job is to COMPOSE a preview of an upcoming day's sports action using layout blocks.
Return a JSON object with a single "blocks" array.

YOUR EDITORIAL TOOLS (block types):
1. "headline" — Bold preview headline. Max 15 words. Use when there's a compelling storyline.
2. "event-line" — Single event preview. Emoji + text + time. Max 20 words.
3. "event-group" — Multiple related events under a label. Use for 3+ events from same sport.
4. "narrative" — 1-2 editorial sentences setting up storylines, stakes. Max 40 words.
5. "divider" — Section break with label.

PREVIEW RULES:
- Focus on STORYLINES: what to watch for, stakes, Norwegian angles
- Include times (24h format) for events
- Lead with the most anticipated event
- Total 3-6 blocks. Be concise.
- If it's a quiet day, a 2-block page is fine.

VOICE & PERSPECTIVE:
- Write like an anticipatory sports editor — building excitement
- English with a Norwegian sports fan perspective
- Future tense: "Hovland tees off at 14:30", "Arsenal face Liverpool"

LINE FORMAT:
- event-line text starts with ONE sport emoji: ⚽ ⛳ 🎾 🏎️ ♟️ 🎮 🏅
- Use 24h HH:MM times

OUTPUT:
- Return ONLY valid JSON: { "blocks": [...] }
- No markdown wrapper — raw JSON only${voiceOverride ? `\n\n${voiceOverride}` : ""}`;
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
		const farFuture = new Date(now.getTime() + 365 * MS_PER_DAY);
		const upcoming = (c.events || [])
			.filter((e) => isEventInWindow(e, now, farFuture))
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
				(p) => {
					const thru = p.thru && p.thru !== "-" ? ` thru ${p.thru}` : "";
					const today = p.today && p.today !== "-" ? ` today ${p.today}` : "";
					return `  ${p.position || "-"}. ${p.player} (${p.score}${today}${thru})`;
				}
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

export function buildResultsContext(recentResults) {
	if (!recentResults) return "";
	const parts = [];

	// Football results — sorted newest first with explicit dates for chronological accuracy
	const football = [...(recentResults.football || [])]
		.sort((a, b) => new Date(b.date) - new Date(a.date))
		.slice(0, 8);
	if (football.length > 0) {
		const lines = football.map((m) => {
			const date = new Date(m.date);
			const dayDate = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "Europe/Oslo" });
			const league = m.league === "Premier League" ? "PL" : m.league === "La Liga" ? "LL" : m.league;
			const fav = m.isFavorite ? " [FAV]" : "";
			const recap = m.recapHeadline ? ` — "${m.recapHeadline}"` : "";
			return `  ${dayDate}: ${m.homeTeam} ${m.homeScore}-${m.awayScore} ${m.awayTeam} (${league})${fav}${recap}`;
		});
		parts.push(`Football results (newest first):\n${lines.join("\n")}`);
	}

	// Golf results
	const golf = recentResults.golf || {};
	for (const [key, tour] of Object.entries(golf)) {
		if (!tour) continue;
		const label = key === "pga" ? "PGA" : "DP World";
		const statusLabel = tour.status === "final" ? "Final" : `R${tour.completedRound}`;
		const leader = tour.topPlayers?.[0];
		const norPlayers = (tour.norwegianPlayers || []).map((p) => {
			const thru = p.thru && p.thru !== "-" ? ` thru ${p.thru}` : "";
			return `${p.player} T${p.position} (${p.score}${thru})`;
		}).join(", ");
		const leaderLine = leader ? `Leader: ${leader.player} ${leader.score}` : "";
		const norLine = norPlayers ? `, Norwegian: ${norPlayers}` : "";
		parts.push(`  ${label} — ${tour.tournamentName || "?"} ${statusLabel}: ${leaderLine}${norLine}`);
	}

	if (parts.length === 0) return "";
	return `\n\nRecent results (last few days):\n${parts.join("\n")}`;
}

function buildUserPrompt(events, now, curatedConfigs, standings, rssDigest, recentResults, mode = "live") {
	const dateStr = now.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: "Europe/Oslo",
	});

	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const tomorrowStart = new Date(todayStart.getTime() + MS_PER_DAY);
	const weekEnd = new Date(todayStart.getTime() + 7 * MS_PER_DAY);

	// For recap/preview, scope events to the target day only
	let scopedEvents, scopeLabel;
	if (mode === "recap") {
		scopedEvents = events.filter((e) => isEventInWindow(e, todayStart, tomorrowStart));
		scopeLabel = `Events on ${dateStr}`;
	} else if (mode === "preview") {
		scopedEvents = events.filter((e) => isEventInWindow(e, todayStart, new Date(tomorrowStart.getTime() + MS_PER_DAY)));
		scopeLabel = `Upcoming events on ${dateStr}`;
	} else {
		scopedEvents = events.filter((e) => isEventInWindow(e, todayStart, weekEnd));
		scopeLabel = `Events (next 7 days, max 20 shown)`;
	}

	const todayEvents = events.filter((e) => isEventInWindow(e, todayStart, tomorrowStart));

	const summary = scopedEvents
		.slice(0, 20)
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
	const resultsContext = buildResultsContext(recentResults);

	// Enrichment context — highlight must-watch events for Claude
	let enrichmentContext = "";
	const mustWatch = scopedEvents.filter((e) => e.importance >= 4);
	if (mustWatch.length > 0) {
		const items = mustWatch.slice(0, 5).map((e) => {
			const s = e.summary ? `: ${e.summary}` : "";
			return `  - ${e.title}${s}`;
		});
		enrichmentContext = `\n\nMust-watch events (importance \u22654):\n${items.join("\n")}`;
	}

	if (mode === "recap") {
		return `This is a RECAP for ${dateStr}. There were ${todayEvents.length} events on this date.

${scopeLabel}:
${summary || "(no events)"}${standingsContext}${rssContext}${resultsContext}${enrichmentContext}

Compose a recap of what happened on ${dateStr}. Focus on results, key performances, surprises, and narrative arcs that concluded.
Return ONLY valid JSON: { "blocks": [...] }, no markdown wrapper`;
	}

	if (mode === "preview") {
		return `This is a PREVIEW for ${dateStr}. There are ${todayEvents.length} events scheduled.

${scopeLabel}:
${summary || "(no events)"}${curatedContext}${standingsContext}${rssContext}${enrichmentContext}

Compose a preview of what's coming on ${dateStr}. Focus on storylines to watch, Norwegian angles, and stakes.
Return ONLY valid JSON: { "blocks": [...] }, no markdown wrapper`;
	}

	return `Today is ${dateStr}. There are ${todayEvents.length} events today and ${scopedEvents.length} this week.

${scopeLabel}:
${summary || "(no events)"}${curatedContext}${standingsContext}${rssContext}${resultsContext}${enrichmentContext}

Generate the editorial zone as a blocks array matching this schema:
${JSON.stringify(BLOCKS_SCHEMA, null, 2)}

Remember:
- Compose 3-8 blocks. Start with today's top stories. Use divider + look-ahead only if something notable is coming this week.
- Use headline only when there's a strong narrative (CL night, Olympics medal day). Skip on quiet days.
- event-line is the workhorse — one event per block. Favorites/user interests first.
- event-group for 3+ related events (Olympics, PL matchday). Use label + items array.
- section only for major active events (Olympics, World Cup) — use curated data for accuracy.
- narrative adds context sparingly (max 3). Don't narrate every event.
- NEVER pad — if only 2 things matter, show 2 things.
- Return ONLY valid JSON: { "blocks": [...] }, no markdown wrapper`;
}

async function generateWithClaudeCLI(systemPrompt, userPrompt) {
	const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
	const tmpFile = path.join(rootDataPath(), ".featured-prompt.tmp");
	fs.writeFileSync(tmpFile, fullPrompt);
	try {
		let cmd = `cat "${tmpFile}" | npx -y @anthropic-ai/claude-code@latest -p --output-format text --max-turns 6`;

		// Wire MCP tools if .mcp.json exists
		const mcpConfigPath = path.resolve(process.cwd(), ".mcp.json");
		if (fs.existsSync(mcpConfigPath)) {
			const allowedTools = [
				"mcp__sportsync__query_events",
				"mcp__sportsync__get_recommendations",
				"mcp__sportsync__get_event_details",
				"mcp__sportsync__dashboard_status",
				"WebSearch",
				"WebFetch",
			].map((t) => `"${t}"`).join(" ");
			cmd += ` --mcp-config "${mcpConfigPath}" --allowedTools ${allowedTools}`;
		}

		const output = execSync(cmd, { encoding: "utf-8", timeout: 180000, maxBuffer: 1024 * 1024 });
		return output.trim();
	} finally {
		try { fs.unlinkSync(tmpFile); } catch {}
	}
}

export function parseResponseJSON(rawContent) {
	try {
		return JSON.parse(rawContent);
	} catch {
		const match = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (match) return JSON.parse(match[1].trim());
		throw new Error(`Could not parse JSON from response: ${rawContent.substring(0, 200)}`);
	}
}

export function toFeaturedShape(result) {
	if (Array.isArray(result?.blocks)) {
		return { blocks: result.blocks };
	}
	return { blocks: [] };
}

export function looksLikeMajorEvent(event) {
	const haystack = `${event?.context || ""} ${event?.tournament || ""} ${event?.title || ""}`;
	return /olympics|world cup|champions league|grand slam|masters|major|playoff|final/i.test(haystack);
}

function buildFallbackSections(events, now) {
	const upcomingMajor = events
		.filter((event) => new Date(event.time) >= now)
		.filter((event) => looksLikeMajorEvent(event))
		.slice(0, 6);

	if (upcomingMajor.length === 0) return [];

	const sectionKey = upcomingMajor[0].context || upcomingMajor[0].tournament || "featured-now";
	const sectionTitle = upcomingMajor[0].tournament || upcomingMajor[0].context || "Major Event Focus";
	const items = upcomingMajor.map((event) => {
		const t = new Date(event.time);
		const time = t.toLocaleTimeString("en-NO", {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
			timeZone: "Europe/Oslo",
		});
		return {
			text: `${time} — ${event.title}`,
			type: "event",
		};
	});

	return [
		{
			id: sectionKey.toLowerCase().replace(/\s+/g, "-"),
			title: sectionTitle,
			emoji: "🏅",
			style: "highlight",
			items,
			expandLabel: null,
			expandItems: [],
		},
	];
}

function sportEmoji(sport) {
	const map = { football: "⚽", golf: "⛳", tennis: "🎾", formula1: "🏎️", f1: "🏎️", chess: "♟️", esports: "🎮", olympics: "🏅" };
	return map[sport] || "🏆";
}

function generateFallbackThisWeek(events, now, sectionSports = []) {
	const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	const upcoming = events
		.filter((event) => new Date(event.time) >= todayEnd)
		.filter((event) => !sectionSports.includes(event.sport))
		.sort((a, b) => new Date(a.time) - new Date(b.time));

	const parts = [];
	const usedSports = new Set();

	// Pick top events from different sports
	const candidates = [
		...upcoming.filter((e) => e.norwegian && e.importance >= 3),
		...upcoming.filter((e) => e.importance >= 4),
		...upcoming,
	];

	for (const event of candidates) {
		if (usedSports.has(event.sport)) continue;
		usedSports.add(event.sport);
		const t = new Date(event.time);
		const day = t.toLocaleDateString("en-US", { weekday: "short", timeZone: "Europe/Oslo" });
		const time = t.toLocaleTimeString("en-NO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Oslo" });
		parts.push(`${sportEmoji(event.sport)} ${day} ${time} — ${event.title}`);
		if (parts.length >= 3) break;
	}

	return parts.slice(0, 3);
}

export function buildFallbackFeatured(events, now) {
	const blocks = [];

	// Today event lines
	const todayLines = generateFallbackToday(events, now);
	for (const line of todayLines) {
		blocks.push({ type: "event-line", text: line });
	}

	// Sections for major events
	const sections = buildFallbackSections(events, now);
	for (const s of sections) {
		blocks.push({
			type: "section",
			id: s.id,
			title: s.title,
			emoji: s.emoji,
			style: s.style,
			items: s.items,
			expandLabel: s.expandLabel,
			expandItems: s.expandItems,
		});
	}

	// This week
	const sectionSports = sections.map((s) => {
		if (/olympic/i.test(s.id || s.title)) return "olympics";
		return null;
	}).filter(Boolean);
	const thisWeekLines = generateFallbackThisWeek(events, now, sectionSports);
	if (thisWeekLines.length > 0) {
		blocks.push({ type: "divider", text: "This Week" });
		for (const line of thisWeekLines) {
			blocks.push({ type: "event-line", text: line });
		}
	}

	return { blocks };
}

export function fallbackLine(e) {
	const time = new Date(e.time).toLocaleTimeString("en-NO", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "Europe/Oslo",
	});
	const emoji = sportEmoji(e.sport);

	// Football: use explicit team names for logo rendering
	if (e.sport === "football" && e.homeTeam && e.awayTeam) {
		const tourContext = e.tournament ? `, ${e.tournament}` : "";
		const summaryTail = e.summary ? ` — ${e.summary.split(".")[0]}` : "";
		return `${emoji} ${e.homeTeam} v ${e.awayTeam}, ${time}${tourContext}${summaryTail}`;
	}

	// Other sports: add tournament + summary when available
	const parts = [emoji, e.title + ",", time];
	if (e.tournament && !e.title.includes(e.tournament)) {
		parts.push(`— ${e.tournament}`);
	} else if (e.summary) {
		parts.push(`— ${e.summary.split(".")[0]}`);
	}
	return parts.join(" ");
}

function generateFallbackToday(events, now) {
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const todayEnd = new Date(todayStart.getTime() + MS_PER_DAY);

	const todayEvents = events.filter((e) => isEventInWindow(e, todayStart, todayEnd));

	if (todayEvents.length === 0) return ["No events scheduled today."];

	// Sort by: favorites first, then importance, then Norwegian relevance
	const sorted = [...todayEvents].sort((a, b) => {
		if (a.isFavorite && !b.isFavorite) return -1;
		if (!a.isFavorite && b.isFavorite) return 1;
		if ((b.importance || 0) !== (a.importance || 0)) return (b.importance || 0) - (a.importance || 0);
		return (b.norwegianRelevance || 0) - (a.norwegianRelevance || 0);
	});

	// One event per line, up to 4
	const lines = [];
	const used = new Set();

	for (const e of sorted) {
		if (lines.length >= 4) break;
		if (used.has(e.title)) continue;
		used.add(e.title);
		lines.push(fallbackLine(e));
	}

	return lines;
}

async function generateRawFeatured(systemPrompt, userPrompt) {
	// 1. Try Claude CLI (OAuth token from Max subscription)
	if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
		console.log("Using Claude CLI (OAuth) to generate featured content.");
		try {
			const rawContent = await generateWithClaudeCLI(systemPrompt, userPrompt);
			return { rawContent, provider: "claude-cli", llm: null };
		} catch (err) {
			console.error("Claude CLI failed:", err.message);
		}
	}

	// 2. Try direct API (ANTHROPIC_API_KEY or OPENAI_API_KEY)
	const llm = new LLMClient();
	if (llm.isAvailable()) {
		console.log(`Using ${llm.getProviderName()} API to generate featured content.`);
		try {
			const rawContent = await llm.complete(systemPrompt, userPrompt);
			return { rawContent, provider: llm.getProviderName(), llm };
		} catch (err) {
			console.error("LLM API failed:", err.message);
		}
	}

	return { rawContent: null, provider: "none", llm: null };
}

async function main() {
	const dataDir = rootDataPath();
	const eventsPath = path.join(dataDir, "events.json");

	// Determine output file: date-specific files for multi-day, otherwise default
	const isDateMode = !!FEATURED_DATE;
	const featuredFile = isDateMode
		? `featured-${FEATURED_DATE}.json`
		: (FEATURED_SUFFIX ? `featured-${FEATURED_SUFFIX}.json` : "featured.json");
	const featuredPath = path.join(dataDir, featuredFile);
	const watchPlanPath = path.join(dataDir, "watch-plan.json");
	const qualityPath = path.join(dataDir, "ai-quality.json");

	// Skip watch-plan and quality tracking for non-live modes
	const isLiveMode = !isDateMode && FEATURED_MODE === "live";

	if (VOICE) console.log(`Voice override: ${VOICE}`);
	if (FEATURED_SUFFIX) console.log(`Output file: ${featuredFile}`);
	if (isDateMode) console.log(`Date mode: ${FEATURED_DATE} (${FEATURED_MODE})`);

	const events = readJsonIfExists(eventsPath);
	if (!events || !Array.isArray(events) || events.length === 0) {
		console.log("No events found. Writing minimal featured.json.");
		const fallback = { blocks: [
			{ type: "event-line", text: "No events scheduled today." },
			{ type: "divider", text: "This Week" },
			{ type: "event-line", text: "Check back after the next data sync." },
		] };
		writeJsonPretty(featuredPath, fallback);
		writeJsonPretty(watchPlanPath, buildWatchPlan([], { now: new Date() }));
		const existingQuality = readJsonIfExists(qualityPath) || {};
		writeJsonPretty(qualityPath, {
			...existingQuality,
			generatedAt: new Date().toISOString(),
			featured: {
				provider: "fallback",
				attempts: 0,
				valid: true,
				score: 100,
				issues: [],
				blockCount: fallback.blocks.length,
			},
		});
		return;
	}

	// For date mode, construct the target date; otherwise use current time
	const now = isDateMode ? (() => {
		const [y, m, d] = FEATURED_DATE.split("-").map(Number);
		return new Date(y, m - 1, d, 12, 0, 0); // noon on target date
	})() : new Date();
	const userContext = readJsonIfExists(USER_CONTEXT_PATH) || {};
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

	const resultsPath = path.join(dataDir, "recent-results.json");
	const recentResults = readJsonIfExists(resultsPath);
	if (recentResults?.football?.length || recentResults?.golf?.pga || recentResults?.golf?.dpWorld) {
		const fCount = recentResults.football?.length || 0;
		console.log(`Loaded recent-results.json: ${fCount} football results.`);
	}

	const systemPrompt = FEATURED_MODE === "recap"
		? buildRecapSystemPrompt(VOICE)
		: FEATURED_MODE === "preview"
			? buildPreviewSystemPrompt(VOICE)
			: buildSystemPrompt(VOICE);
	let baseUserPrompt = buildUserPrompt(events, now, curatedConfigs, standings, rssDigest, recentResults, FEATURED_MODE);

	// Adaptive hints: only for live mode (recap/preview don't need quality corrections)
	let allHints = [];
	let sanityReport = null;
	let qualityHistory = [];
	if (isLiveMode) {
		const historyPath = path.join(dataDir, "quality-history.json");
		qualityHistory = readJsonIfExists(historyPath) || [];
		const { hints: adaptiveHints } = buildAdaptiveHints(qualityHistory);
		const { hints: resultsHints } = buildResultsHints(qualityHistory);
		const sanityReportPath = path.join(dataDir, "sanity-report.json");
		sanityReport = readJsonIfExists(sanityReportPath);
		const { hints: sanityHints } = buildSanityHints(sanityReport);
		allHints = [...adaptiveHints, ...resultsHints, ...sanityHints];
		if (allHints.length > 0) {
			console.log(`Adaptive hints active: ${allHints.length} correction(s) (${adaptiveHints.length} editorial, ${resultsHints.length} results, ${sanityHints.length} sanity)`);
			for (const hint of allHints) console.log(`  → ${hint.slice(0, 80)}`);
			baseUserPrompt += `\n\nADAPTIVE CORRECTIONS (based on recent quality scores):\n${allHints.map((h) => `- ${h}`).join("\n")}`;
		}
	}

	let featured = null;
	let provider = "none";
	let attempts = 0;
	let qualityResult = null;
	let qualityCorrections = [];
	let featuredLlm = null;

	const generationStart = Date.now();
	for (let attempt = 1; attempt <= 2; attempt++) {
		attempts = attempt;
		let userPrompt = baseUserPrompt;
		if (qualityCorrections.length > 0) {
			userPrompt += `\n\nQuality corrections from previous attempt:\n- ${qualityCorrections.join("\n- ")}\nFix all issues and return valid JSON only.`;
		}

		const generated = await generateRawFeatured(systemPrompt, userPrompt);
		if (!generated.rawContent) break;
		provider = generated.provider;
		if (generated.llm) featuredLlm = generated.llm;

		try {
			const parsed = parseResponseJSON(generated.rawContent);
			const candidate = toFeaturedShape(parsed);
			qualityResult = validateFeaturedContent(candidate, { events });

			if (qualityResult.valid) {
				featured = qualityResult.normalized;
				break;
			}

			qualityCorrections = qualityResult.issues.map((issue) => issue.message).slice(0, 5);
			console.warn(
				`Featured quality gate failed (attempt ${attempt}): ${qualityCorrections.join("; ")}`
			);
		} catch (err) {
			qualityCorrections = [err.message];
			console.warn(`Failed to parse featured JSON (attempt ${attempt}): ${err.message}`);
		}
	}

	if (!featured) {
		console.log("Using deterministic fallback for featured content.");
		provider = "fallback";
		featured = buildFallbackFeatured(events, now);
		qualityResult = validateFeaturedContent(featured, { events });
		featured = qualityResult.normalized;
	}

	// Ensure blocks have at least some event content
	if (featured.blocks && featured.blocks.filter((b) => b.type === "event-line" || b.type === "event-group").length === 0) {
		const todayLines = generateFallbackToday(events, now);
		const eventBlocks = todayLines.map((line) => ({ type: "event-line", text: line }));
		featured.blocks = [...eventBlocks, ...featured.blocks];
	}

	const finalQuality = validateFeaturedContent(featured, { events });
	featured = finalQuality.normalized;

	// Add _meta for date-specific briefings
	if (isDateMode) {
		featured._meta = {
			date: FEATURED_DATE,
			mode: FEATURED_MODE,
			generatedAt: new Date().toISOString(),
		};
	}

	writeJsonPretty(featuredPath, featured);

	// Only write watch-plan and quality for the main live featured.json (not voice variants or date modes)
	if (isLiveMode && !FEATURED_SUFFIX) {
		const generationMs = Date.now() - generationStart;
		const watchPlan = buildWatchPlan(events, {
			now,
			userContext,
			featured,
		});
		writeJsonPretty(watchPlanPath, watchPlan);

		const editorialResult = evaluateEditorialQuality(featured, events, { now });
		const watchPlanResult = evaluateWatchPlanQuality(watchPlan);
		const resultsQuality = evaluateResultsQuality(recentResults, events, rssDigest, userContext);

		const blockCount = featured.blocks ? featured.blocks.length : 0;
		const featuredTokenUsage = provider === "claude-cli"
			? { input: 0, output: 0, calls: attempts, total: 0, tracked: false }
			: featuredLlm ? featuredLlm.getUsage() : { input: 0, output: 0, calls: 0, total: 0 };
		const existingQuality = readJsonIfExists(qualityPath) || {};
		writeJsonPretty(qualityPath, {
			...existingQuality,
			generatedAt: new Date().toISOString(),
			featured: {
				provider,
				attempts,
				valid: finalQuality.valid,
				score: finalQuality.score,
				issues: finalQuality.issues.map((issue) => issue.message),
				blockCount,
				generationMs,
				tokenUsage: featuredTokenUsage,
			},
			editorial: {
				score: editorialResult.score,
				metrics: editorialResult.metrics,
				issues: editorialResult.issues.map((issue) => issue.message),
			},
			watchPlan: {
				score: watchPlanResult.score,
				metrics: watchPlanResult.metrics,
			},
			results: {
				score: resultsQuality.score,
				metrics: resultsQuality.metrics,
				issues: resultsQuality.issues.map((issue) => issue.message),
			},
		});

		// Append snapshot to quality history
		const historyPath = path.join(dataDir, "quality-history.json");
		const history = readJsonIfExists(historyPath) || qualityHistory;
		const enrichmentTokens = existingQuality?.enrichment?.tokenUsage || null;
		const totalInput = (enrichmentTokens?.input || 0) + (featuredTokenUsage.input || 0);
		const totalOutput = (enrichmentTokens?.output || 0) + (featuredTokenUsage.output || 0);
		const totalCalls = (enrichmentTokens?.calls || 0) + (featuredTokenUsage.calls || 0);
		const snapshot = buildQualitySnapshot(
			editorialResult,
			existingQuality.enrichment || null,
			{ blocks: featured.blocks, score: finalQuality.score, provider, valid: finalQuality.valid },
			watchPlanResult,
			{
				hintsApplied: allHints,
				tokenUsage: {
					enrichment: enrichmentTokens,
					featured: featuredTokenUsage,
					total: { input: totalInput, output: totalOutput, calls: totalCalls, total: totalInput + totalOutput },
				},
				results: resultsQuality,
				sanity: sanityReport ? {
					findingCount: sanityReport.summary?.total ?? 0,
					warningCount: sanityReport.summary?.warning ?? 0,
					pass: sanityReport.pass ?? true,
				} : null,
			}
		);
		history.push(snapshot);
		// Cap at 100 entries
		while (history.length > 100) history.shift();
		writeJsonPretty(historyPath, history);
	}

	const blockCount = featured.blocks ? featured.blocks.length : 0;
	console.log(
		`Featured content generated (${featuredFile}): ${blockCount} blocks.`
	);
	if (isLiveMode && !FEATURED_SUFFIX) {
		const watchPlanData = readJsonIfExists(watchPlanPath);
		if (watchPlanData) {
			console.log(
				`Watch plan generated: ${watchPlanData.picks?.length || 0} picks across ${(watchPlanData.windows || []).filter((w) => w.items.length > 0).length} active windows.`
			);
		}
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
