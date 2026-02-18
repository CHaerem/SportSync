#!/usr/bin/env node
/**
 * Generates featured.json with AI-curated editorial content using block-based layout.
 * Output: { blocks: [{ type, text, ... }, ...] }
 *
 * Narrative block types: headline, event-line, event-group, narrative, section, divider
 * Component block types: match-result, match-preview, event-schedule, golf-status
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
import { readJsonIfExists, rootDataPath, writeJsonPretty, isEventInWindow, MS_PER_DAY, formatDateKey, parseCliJsonOutput } from "./lib/helpers.js";
import { LLMClient } from "./lib/llm-client.js";
import { validateFeaturedContent, evaluateEditorialQuality, evaluateWatchPlanQuality, buildQualitySnapshot, buildAdaptiveHints, evaluateResultsQuality, buildResultsHints, buildSanityHints, computeRollingAverages } from "./lib/ai-quality-gates.js";
import { buildWatchPlan, computeFeedbackAdjustments } from "./lib/watch-plan.js";
import { factCheck, buildFactCheckHints, appendFactCheckHistory } from "./lib/fact-checker.js";

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
		// Narrative blocks (LLM writes text)
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
		// Component blocks (LLM configures, client renders from data)
		{ type: "match-result", homeTeam: "string", awayTeam: "string" },
		{ type: "match-preview", homeTeam: "string", awayTeam: "string", showStandings: "boolean (optional)" },
		{ type: "golf-status", tournament: "pga | dpWorld" },
		{ type: "event-schedule", label: "string", filter: { sport: "string", window: "today | tomorrow | week" }, maxItems: "number (optional, default 6)", showFlags: "boolean (optional, default true)", style: "highlight | default" },
	],
};

function buildSystemPrompt(voice) {
	const voiceOverride = buildVoiceOverride(voice);
	return `You are the editor-in-chief of SportSync, a minimal sports dashboard.
Your job is to COMPOSE today's editorial zone using a palette of layout blocks.
Return a JSON object with a single "blocks" array.

YOUR EDITORIAL TOOLS — NARRATIVE BLOCKS (you write the text):
1. "headline" — Bold editorial headline, the story of the day. Max 15 words. Use when there's a strong narrative.
2. "event-line" — Single event highlight. Emoji + text + time. Max 20 words. Use for chess, esports, tennis, F1 — sports without component types.
3. "event-group" — Multiple related events under a label. Use when 3+ events share a theme.
   Has "label" (string) and "items" (array of strings).
4. "narrative" — 1-2 editorial sentences adding context or analysis. Italic styling. Max 40 words. Use sparingly (max 3 per page).
5. "section" — Major event card with expand/collapse. For Olympics, World Cup, etc. Same structure as before:
   { type:"section", id, title, emoji, style, items:[{text,type}], expandLabel, expandItems }
6. "divider" — Section break with label. Use to separate today from "This Week" or "Looking Ahead".

YOUR EDITORIAL TOOLS — COMPONENT BLOCKS (you configure, client renders from live data):
7. "match-result" — Completed football match. Client renders score, logos, goalscorers from data.
   { type:"match-result", homeTeam:"Team A", awayTeam:"Team B" }
8. "match-preview" — Upcoming football match. Client renders time, logos, countdown, optional standings.
   { type:"match-preview", homeTeam:"Team A", awayTeam:"Team B", showStandings:true }
9. "golf-status" — Golf tournament status. Client renders leaderboard snippet + Norwegian player position.
   { type:"golf-status", tournament:"pga" } — tournament is "pga" or "dpWorld"
10. "event-schedule" — Filtered event list. Client renders sorted events with times, day prefixes, 🇳🇴 flags.
   { type:"event-schedule", label:"🏅 Olympics today", filter:{sport:"olympics",window:"today"}, maxItems:6, showFlags:true, style:"highlight" }

COMPONENT RULES:
- Prefer match-result for football results and match-preview for football fixtures — the client adds logos and live data automatically
- Prefer golf-status for golf tournaments in progress — the client adds leaderboard and Norwegian player tracking
- Use event-schedule for Olympics day schedules — the client adds sorted times, day prefixes, and Norwegian flags
- Use event-line only for sports without component types (chess, esports, tennis, F1)
- Narrative blocks provide your editorial voice around component blocks — components handle the data, you handle the story
- Component blocks auto-update with live data (scores, times) — text blocks are static

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

Champions League night (mixing narrative + component blocks):
{ "blocks": [
  { "type": "headline", "text": "All eyes on the Bernabéu" },
  { "type": "match-preview", "homeTeam": "Real Madrid", "awayTeam": "Liverpool", "showStandings": true },
  { "type": "narrative", "text": "Holders Liverpool arrive three points clear of the pack. Ancelotti's men need a result." },
  { "type": "match-preview", "homeTeam": "PSG", "awayTeam": "Bayern Munich" },
  { "type": "divider", "text": "This Week" },
  { "type": "event-line", "text": "⚽ Sat — Weekend PL fixtures" }
]}

Olympics day (component blocks for structured data, event-line for others):
{ "blocks": [
  { "type": "headline", "text": "Medal day in Milano-Cortina" },
  { "type": "match-result", "homeTeam": "Barcelona", "awayTeam": "Atlético Madrid" },
  { "type": "golf-status", "tournament": "pga" },
  { "type": "event-schedule", "label": "🏅 Olympics today", "filter": {"sport":"olympics","window":"today"}, "maxItems": 6, "showFlags": true, "style": "highlight" },
  { "type": "divider", "text": "This Week" },
  { "type": "event-line", "text": "♟️ Fri 15:00 — Carlsen opens Freestyle Chess" }
]}

Quiet Tuesday:
{ "blocks": [
  { "type": "golf-status", "tournament": "pga" },
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

	// Tennis ATP top 10
	const atp = standings.tennis?.atp;
	if (Array.isArray(atp) && atp.length > 0) {
		const rows = atp.slice(0, 10).map(
			(p) => `  ${p.position}. ${p.player} (${p.country}) — ${p.points}pts`
		);
		parts.push(`ATP Rankings (top 10):\n${rows.join("\n")}`);
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
	const dataDir = rootDataPath();
	const sysFile = path.join(dataDir, ".featured-system.tmp");
	const userFile = path.join(dataDir, ".featured-user.tmp");
	fs.writeFileSync(sysFile, systemPrompt);
	fs.writeFileSync(userFile, userPrompt);
	try {
		let cmd = `cat "${userFile}" | npx -y @anthropic-ai/claude-code@latest -p --system-prompt-file "${sysFile}" --output-format json --max-turns 6`;

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

		const output = execSync(cmd, { encoding: "utf-8", timeout: 180000, maxBuffer: 2 * 1024 * 1024 });
		const parsed = parseCliJsonOutput(output);
		return { content: parsed.result, usage: { ...parsed.usage, tracked: true, estimated: false } };
	} finally {
		try { fs.unlinkSync(sysFile); } catch {}
		try { fs.unlinkSync(userFile); } catch {}
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
	if (/olympics|world cup|champions league|grand slam|playoff|final/i.test(haystack)) return true;
	if (/masters|major/i.test(haystack) && event?.sport === "golf") return true;
	return false;
}

function buildFallbackSections(events, now) {
	const upcomingMajor = events
		.filter((event) => new Date(event.time) >= now)
		.filter((event) => looksLikeMajorEvent(event));

	if (upcomingMajor.length === 0) return [];

	// Group by context or sport — never mix different competitions
	const groups = {};
	for (const event of upcomingMajor) {
		const key = event.context || event.sport || "featured";
		if (!groups[key]) groups[key] = [];
		groups[key].push(event);
	}

	return Object.entries(groups).slice(0, 2).map(([key, groupEvents]) => {
		const first = groupEvents[0];
		const sorted = [...groupEvents].sort((a, b) => new Date(a.time) - new Date(b.time));
		const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
		const items = sorted.slice(0, 6).map((event) => {
			const t = new Date(event.time);
			const time = t.toLocaleTimeString("en-NO", {
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
				timeZone: "Europe/Oslo",
			});
			const eventDay = t.toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
			const dayPrefix = eventDay !== todayStr
				? t.toLocaleDateString("en-US", { weekday: "short", timeZone: "Europe/Oslo" }) + " "
				: "";
			const norFlag = event.norwegian ? " 🇳🇴" : "";
			return {
				text: `${dayPrefix}${time} — ${event.title}${norFlag}`,
				type: "event",
			};
		});

		return {
			id: key.toLowerCase().replace(/\s+/g, "-"),
			title: first.tournament || first.context || key,
			emoji: sportEmoji(first.sport),
			style: "highlight",
			items,
			expandLabel: null,
			expandItems: [],
		};
	});
}

function sportEmoji(sport) {
	const map = { football: "⚽", golf: "⛳", tennis: "🎾", formula1: "🏎️", f1: "🏎️", chess: "♟️", esports: "🎮", cs2: "🎮", olympics: "🏅" };
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

	const picked = [];
	for (const event of candidates) {
		if (usedSports.has(event.sport)) continue;
		usedSports.add(event.sport);
		picked.push(event);
		if (picked.length >= 3) break;
	}

	// Sort picked events chronologically for display
	picked.sort((a, b) => new Date(a.time) - new Date(b.time));

	return picked.map((event) => {
		const t = new Date(event.time);
		const day = t.toLocaleDateString("en-US", { weekday: "short", timeZone: "Europe/Oslo" });
		const time = t.toLocaleTimeString("en-NO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Oslo" });
		const textLine = `${sportEmoji(event.sport)} ${day} ${time} — ${event.title}`;

		// Football events with both teams → match-preview component
		if (event.sport === "football" && event.homeTeam && event.awayTeam) {
			return {
				type: "match-preview",
				homeTeam: event.homeTeam,
				awayTeam: event.awayTeam,
				showStandings: (event.importance || 0) >= 3,
				_fallbackText: textLine,
			};
		}
		return textLine;
	});
}

/**
 * Build a deterministic headline from the most newsworthy available data.
 * Priority: results of favorite teams > today's must-watch events > event count summary.
 */
export function buildFallbackHeadline(events, now, recentResults, standings, sectionSports = []) {
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const todayEnd = new Date(todayStart.getTime() + MS_PER_DAY);
	const todayEvents = events.filter((e) => isEventInWindow(e, todayStart, todayEnd));

	// Check for Olympics events today
	const olympicsToday = todayEvents.filter((e) => e.sport === "olympics" || /olympic/i.test(e.context || ""));
	if (olympicsToday.length > 0) {
		return "Medal day in Milano-Cortina";
	}

	// Check for recent favorite team results (last 48h)
	const favResults = getFavoriteResults(recentResults, now);
	if (favResults.length > 0) {
		const r = favResults[0];
		const winner = r.homeScore > r.awayScore ? r.homeTeam : r.homeScore < r.awayScore ? r.awayTeam : null;
		if (winner) {
			const loser = winner === r.homeTeam ? r.awayTeam : r.homeTeam;
			return `${winner} ${r.homeScore}-${r.awayScore} ${loser}`;
		}
		return `${r.homeTeam} ${r.homeScore}-${r.awayScore} ${r.awayTeam}`;
	}

	// Check for must-watch events today
	const mustWatch = todayEvents.filter((e) => (e.importance || 0) >= 4 && !sectionSports.includes(e.sport));
	if (mustWatch.length > 0) {
		const e = mustWatch[0];
		if (e.sport === "football" && e.homeTeam && e.awayTeam) {
			const tourLabel = e.tournament ? `: ${e.homeTeam} v ${e.awayTeam}` : ` — ${e.homeTeam} v ${e.awayTeam}`;
			return `${e.tournament || "Football"}${tourLabel}`;
		}
		return e.title;
	}

	// Fallback: event count summary
	if (todayEvents.length === 0) return null;
	const sports = [...new Set(todayEvents.map((e) => e.sport))];
	return `${todayEvents.length} events across ${sports.length} sport${sports.length !== 1 ? "s" : ""} today`;
}

/**
 * Build a deterministic narrative block when there's a dominant story.
 * Returns null if no clear narrative exists.
 */
export function buildFallbackNarrative(events, now, recentResults, standings, sectionSports = []) {
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const todayEnd = new Date(todayStart.getTime() + MS_PER_DAY);
	const todayEvents = events.filter((e) => isEventInWindow(e, todayStart, todayEnd));

	// Olympics narrative: count medal events and Norwegian interest
	const olympicsToday = todayEvents.filter((e) => e.sport === "olympics" || /olympic/i.test(e.context || ""));
	if (olympicsToday.length > 0) {
		const medalEvents = olympicsToday.filter((e) => /final|medal/i.test(e.title || ""));
		const norEvents = olympicsToday.filter((e) => e.norwegian);
		if (medalEvents.length >= 2 || norEvents.length >= 3) {
			const sports = [...new Set(olympicsToday.map((e) => {
				const m = (e.title || "").match(/^([^—–\-]+)/);
				return m ? m[1].trim() : null;
			}).filter(Boolean))];
			const sportsText = sports.length <= 3 ? sports.join(", ") : `${sports.length} disciplines`;
			return `${norEvents.length} Norwegian medal chances across ${sportsText} today.`;
		}
	}

	// Major result narrative: upset or high-scoring game
	const favResults = getFavoriteResults(recentResults, now);
	if (favResults.length > 0) {
		const r = favResults[0];
		const totalGoals = (r.homeScore || 0) + (r.awayScore || 0);
		if (totalGoals >= 5) {
			return `A ${totalGoals}-goal thriller between ${r.homeTeam} and ${r.awayTeam}.`;
		}
	}

	// Must-watch density narrative
	const mustWatch = todayEvents.filter((e) => (e.importance || 0) >= 4 && !sectionSports.includes(e.sport));
	if (mustWatch.length >= 3) {
		const sports = [...new Set(mustWatch.map(e => e.sport))];
		return `${mustWatch.length} must-watch events across ${sports.join(" and ")} today.`;
	}

	return null;
}

/**
 * Get recent results for favorite teams within the last 48h.
 */
function getFavoriteResults(recentResults, now) {
	if (!recentResults?.football?.length) return [];
	const cutoff = new Date(now.getTime() - 2 * MS_PER_DAY);
	return recentResults.football
		.filter((m) => m.isFavorite && new Date(m.date) >= cutoff)
		.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * Build event-line blocks for recent favorite team results.
 * Max 2 result lines from the last 48h.
 */
export function buildFallbackResultLines(recentResults, now) {
	const favResults = getFavoriteResults(recentResults, now);
	if (favResults.length === 0) return [];

	return favResults.slice(0, 2).map((r) => {
		const scorers = (r.goalScorers || []).slice(0, 2);
		const scorerText = scorers.length > 0
			? " — " + scorers.map((g) => `${g.player} ${g.minute}`).join(", ")
			: "";
		const fallbackText = `⚽ FT: ${r.homeTeam} ${r.homeScore}-${r.awayScore} ${r.awayTeam}${scorerText}`;
		return {
			type: "match-result",
			homeTeam: r.homeTeam,
			awayTeam: r.awayTeam,
			_fallbackText: fallbackText,
		};
	});
}

export function buildFallbackFeatured(events, now, { recentResults, standings, rssDigest } = {}) {
	const blocks = [];

	// Sections for major events (compute early so we can dedupe event-lines)
	const sections = buildFallbackSections(events, now);
	const sectionSports = sections.map((s) => {
		if (/olympic/i.test(s.id || s.title)) return "olympics";
		return null;
	}).filter(Boolean);

	// Headline block — deterministic editorial headline from best available data
	const headline = buildFallbackHeadline(events, now, recentResults, standings, sectionSports);
	if (headline) {
		blocks.push({ type: "headline", text: headline });
	}

	// Recent favorite results as match-result component blocks (last 48h)
	const resultBlocks = buildFallbackResultLines(recentResults, now);
	for (const block of resultBlocks) {
		blocks.push(block);
	}

	// Narrative block — deterministic editorial context for dominant stories
	const narrative = buildFallbackNarrative(events, now, recentResults, standings, sectionSports);
	if (narrative) {
		blocks.push({ type: "narrative", text: narrative });
	}

	// Today event lines — football events become match-preview components, others stay as text
	const todayBlocks = generateFallbackTodayBlocks(events, now, sectionSports);
	for (const block of todayBlocks) {
		blocks.push(block);
	}

	// Olympics events as event-schedule component instead of section card
	const olympicsSport = sectionSports.includes("olympics") ? "olympics" : null;
	if (olympicsSport) {
		const olympicsSection = sections.find(s => /olympic/i.test(s.id || s.title));
		blocks.push({
			type: "event-schedule",
			label: `${olympicsSection?.emoji || "🏅"} ${olympicsSection?.title || "Winter Olympics 2026"}`,
			filter: { sport: "olympics", window: "today" },
			maxItems: 6,
			showFlags: true,
			style: "highlight",
			_fallbackText: (olympicsSection?.items || []).map(i => i.text || i).join(" · "),
		});
	}

	// Section cards for remaining major events (excluding Olympics, now rendered as component)
	for (const s of sections) {
		if (/olympic/i.test(s.id || s.title)) continue;
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

	// Golf status component when standings data exists
	if (standings?.golf?.pga?.leaderboard?.length > 0) {
		const golfTourName = standings.golf.pga.name || "PGA Tour";
		blocks.push({
			type: "golf-status",
			tournament: "pga",
			_fallbackText: `⛳ ${golfTourName}`,
		});
	}

	// This week — football events become match-preview components
	const thisWeekItems = generateFallbackThisWeek(events, now, sectionSports);
	if (thisWeekItems.length > 0) {
		blocks.push({ type: "divider", text: "This Week" });
		for (const item of thisWeekItems) {
			if (typeof item === "string") {
				blocks.push({ type: "event-line", text: item });
			} else {
				blocks.push(item);
			}
		}
	}

	return { blocks };
}

/**
 * Generate today's event blocks — football as match-preview components, others as text event-lines.
 */
function generateFallbackTodayBlocks(events, now, sectionSports = []) {
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const todayEnd = new Date(todayStart.getTime() + MS_PER_DAY);

	const todayEvents = events
		.filter((e) => isEventInWindow(e, todayStart, todayEnd))
		.filter((e) => !sectionSports.includes(e.sport));

	if (todayEvents.length === 0) return [];

	// Sort by: favorites first, then importance, then Norwegian relevance
	const sorted = [...todayEvents].sort((a, b) => {
		if (a.isFavorite && !b.isFavorite) return -1;
		if (!a.isFavorite && b.isFavorite) return 1;
		if ((b.importance || 0) !== (a.importance || 0)) return (b.importance || 0) - (a.importance || 0);
		return (b.norwegianRelevance || 0) - (a.norwegianRelevance || 0);
	});

	const blocks = [];
	const used = new Set();

	for (const e of sorted) {
		if (blocks.length >= 4) break;
		if (used.has(e.title)) continue;
		used.add(e.title);

		// Football events with both teams → match-preview component
		if (e.sport === "football" && e.homeTeam && e.awayTeam) {
			blocks.push({
				type: "match-preview",
				homeTeam: e.homeTeam,
				awayTeam: e.awayTeam,
				showStandings: (e.importance || 0) >= 3,
				_fallbackText: fallbackLine(e),
			});
		} else {
			blocks.push({ type: "event-line", text: fallbackLine(e) });
		}
	}

	return blocks;
}

/**
 * Build a personalized "For You" section block from user preferences + events.
 * Deterministic (no LLM) — filters events matching favorites and top preferences.
 */
export function buildForYouBlock(events, userContext, now) {
	if (!events || !userContext) return null;
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const windowEnd = new Date(todayStart.getTime() + 3 * MS_PER_DAY);

	const windowEvents = events.filter(e => isEventInWindow(e, todayStart, windowEnd));
	if (windowEvents.length === 0) return null;

	const teams = (userContext.favoriteTeams || []).map(t => t.toLowerCase());
	const players = (userContext.favoritePlayers || []).map(p => p.toLowerCase());
	const prefs = userContext.sportPreferences || {};

	// Score each event for personal relevance
	const scored = windowEvents.map(e => {
		let score = 0;
		const text = `${e.title || ""} ${e.homeTeam || ""} ${e.awayTeam || ""} ${(e.norwegianPlayers || []).map(p => p.name || p).join(" ")}`.toLowerCase();
		if (teams.some(t => text.includes(t))) score += 10;
		if (players.some(p => text.includes(p))) score += 10;
		if (e.norwegian) score += 3;
		if (prefs[e.sport] === "high") score += 2;
		if (e.importance >= 4) score += 2;
		return { event: e, score };
	});

	const top = scored.filter(s => s.score >= 3).sort((a, b) => b.score - a.score).slice(0, 5);
	if (top.length === 0) return null;

	const items = top.map(({ event: e }) => ({
		text: fallbackLine(e),
		type: "event",
	}));

	return {
		type: "section",
		id: "for-you",
		title: "For You",
		emoji: "⭐",
		style: "highlight",
		items,
	};
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

	// Other sports: add tournament context when not already in title
	const parts = [emoji, e.title + ",", time];
	if (e.tournament && !e.title.includes(e.tournament)) {
		parts.push(`— ${e.tournament}`);
	}
	return parts.join(" ");
}

function generateFallbackToday(events, now, sectionSports = []) {
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const todayEnd = new Date(todayStart.getTime() + MS_PER_DAY);

	const todayEvents = events
		.filter((e) => isEventInWindow(e, todayStart, todayEnd))
		.filter((e) => !sectionSports.includes(e.sport));

	if (todayEvents.length === 0) return [];

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
			const cliResult = await generateWithClaudeCLI(systemPrompt, userPrompt);
			return { rawContent: cliResult.content, provider: "claude-cli", llm: null, cliUsage: cliResult.usage };
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
			return { rawContent, provider: llm.getProviderName(), llm, cliUsage: null };
		} catch (err) {
			console.error("LLM API failed:", err.message);
		}
	}

	return { rawContent: null, provider: "none", llm: null, cliUsage: null };
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
		const factCheckHistoryPath = path.join(dataDir, "fact-check-history.json");
		const factCheckHistory = readJsonIfExists(factCheckHistoryPath) || [];
		const { hints: factCheckHintsFromHistory } = buildFactCheckHints(factCheckHistory);
		allHints = [...adaptiveHints, ...resultsHints, ...sanityHints, ...factCheckHintsFromHistory];
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
	let cliUsage = null;
	let factCheckFindings = null;

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
		if (generated.cliUsage) cliUsage = generated.cliUsage;

		try {
			const parsed = parseResponseJSON(generated.rawContent);
			const candidate = toFeaturedShape(parsed);
			qualityResult = validateFeaturedContent(candidate, { events });

			if (qualityResult.valid) {
				// Fact-check featured blocks (live mode only, best-effort)
				if (isLiveMode && featuredLlm) {
					try {
						const factResult = await factCheck({
							items: qualityResult.normalized.blocks,
							itemType: "featured-blocks",
							context: { events, standings, rssDigest, recentResults },
							llm: featuredLlm,
						});
						if (factResult.findings.some((f) => f.severity === "error")) {
							qualityCorrections = factResult.findings
								.filter((f) => f.severity === "error")
								.map((f) => `FACTUAL ERROR: ${f.message}`);
							console.warn(`Fact-check found ${qualityCorrections.length} error(s), retrying...`);
							continue;
						}
						factCheckFindings = factResult;
					} catch (fcErr) {
						console.warn("Fact-check failed (non-blocking):", fcErr.message);
					}
				}
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
		featured = buildFallbackFeatured(events, now, { recentResults, standings, rssDigest });
		qualityResult = validateFeaturedContent(featured, { events });
		featured = qualityResult.normalized;
	}

	// Ensure blocks have at least some event content (text blocks or component blocks)
	const CONTENT_TYPES = ["event-line", "event-group", "match-result", "match-preview", "event-schedule", "golf-status"];
	if (featured.blocks && featured.blocks.filter((b) => CONTENT_TYPES.includes(b.type)).length === 0) {
		const todayLines = generateFallbackToday(events, now);
		const eventBlocks = todayLines.map((line) => ({ type: "event-line", text: line }));
		featured.blocks = [...eventBlocks, ...featured.blocks];
	}

	const finalQuality = validateFeaturedContent(featured, { events });
	featured = finalQuality.normalized;

	// Add _meta for provenance tracking
	if (isDateMode) {
		featured._meta = {
			date: FEATURED_DATE,
			mode: FEATURED_MODE,
			generatedAt: new Date().toISOString(),
		};
		if (process.env.SPORTSYNC_EVENT_FINGERPRINT) {
			featured._meta.eventFingerprint = process.env.SPORTSYNC_EVENT_FINGERPRINT;
		}
	} else {
		featured.generatedAt = new Date().toISOString();
		featured.provider = provider;
	}

	writeJsonPretty(featuredPath, featured);

	// Only write watch-plan and quality for the main live featured.json (not voice variants or date modes)
	if (isLiveMode && !FEATURED_SUFFIX) {
		const generationMs = Date.now() - generationStart;
		// Read watch feedback to adjust scoring based on user thumbs-up/down
		const engagementData = readJsonIfExists(path.join(dataDir, "engagement-data.json"));
		const feedbackAdjustments = computeFeedbackAdjustments(engagementData?.watchFeedback);
		const enrichedContext = Object.keys(feedbackAdjustments).length > 0
			? { ...userContext, _feedbackAdjustments: feedbackAdjustments }
			: userContext;

		const watchPlan = buildWatchPlan(events, {
			now,
			userContext: enrichedContext,
			featured,
		});
		writeJsonPretty(watchPlanPath, watchPlan);

		const editorialResult = evaluateEditorialQuality(featured, events, { now });
		const watchPlanResult = evaluateWatchPlanQuality(watchPlan);
		const resultsQuality = evaluateResultsQuality(recentResults, events, rssDigest, userContext);

		const blockCount = featured.blocks ? featured.blocks.length : 0;
		const featuredTokenUsage = cliUsage
			? { ...cliUsage, calls: attempts }
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
		const discoveryTokens = existingQuality?.discovery?.tokenUsage || null;
		const multiDayTokens = existingQuality?.multiDay?.tokenUsage || null;
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
					discovery: discoveryTokens,
					multiDay: multiDayTokens,
				},
				results: resultsQuality,
				sanity: sanityReport ? {
					findingCount: sanityReport.summary?.total ?? 0,
					warningCount: sanityReport.summary?.warning ?? 0,
					pass: sanityReport.pass ?? true,
				} : null,
				factCheck: factCheckFindings ? {
					itemsChecked: factCheckFindings.itemsChecked,
					issuesFound: factCheckFindings.issuesFound,
					provider: factCheckFindings.provider,
				} : null,
			}
		);
		// Compute rolling averages and attach to snapshot
		// (include current snapshot in the window)
		history.push(snapshot);
		const rollingAvg = computeRollingAverages(history);
		if (rollingAvg) {
			snapshot.rollingAverage = rollingAvg;
		}
		// Cap at 100 entries
		while (history.length > 100) history.shift();
		writeJsonPretty(historyPath, history);

		// Write fact-check history (feedback loop #10)
		if (factCheckFindings) {
			const fcHistoryPath = path.join(dataDir, "fact-check-history.json");
			appendFactCheckHistory(fcHistoryPath, {
				...factCheckFindings,
				itemType: "featured-blocks",
			});
			if (factCheckFindings.issuesFound > 0) {
				console.log(`Fact-check: ${factCheckFindings.issuesFound} issue(s) found in featured content`);
			}
		}
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
