#!/usr/bin/env node
/**
 * Generates featured.json with AI-curated editorial content:
 * - today: emoji-prefixed telegraphic lines about today's events
 * - sections: dynamic featured content (Olympics, World Cup, CL, etc.)
 * - thisWeek: emoji-prefixed lines about upcoming days
 * - watch-plan: ranked "what to watch next" windows for the UI
 * - ai-quality: quality gate report (structure + freshness checks)
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
import { validateFeaturedContent } from "./lib/ai-quality-gates.js";
import { buildWatchPlan } from "./lib/watch-plan.js";

const USER_CONTEXT_PATH = path.resolve(process.cwd(), "scripts", "config", "user-context.json");

const VOICE = process.env.SPORTSYNC_VOICE || "";
const FEATURED_SUFFIX = process.env.SPORTSYNC_FEATURED_SUFFIX || "";

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

const FEATURED_SCHEMA = {
	today: [
		"string — Line 1: editorial headline about the day's main story (the ONE thing that matters most)",
		"string — Line 2: compact summary of what else is on, e.g. 'Plus 4 PL matches from 20:30 and Copa del Rey semifinal'",
	],
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
	thisWeek: [
		"string — 1-2 lines about upcoming NON-section events, e.g. '⛳ Thu — Hovland at Pebble Beach · ♟️ Sat — Carlsen in Freestyle Chess'",
	],
};

function buildSystemPrompt(voice) {
	const voiceOverride = buildVoiceOverride(voice);
	return `You are a Norwegian sports editor for SportSync, a minimal sports dashboard.
Your job is to generate curated editorial content in JSON format.

VOICE & PERSPECTIVE:
- Write like a sports ticker editor at VG or Dagbladet — punchy, opinionated, never bland
- Write in English with a Norwegian sports fan perspective
- Prioritize Norwegian athletes: Hovland (golf), Ruud (tennis), Carlsen (chess),
  Klaebo/Johaug/Boe (winter sports), rain (esports), Lyn/Barcelona/Liverpool (football)
- Lead with drama, stakes, and narrative — not just fixture facts
- Reference standings positions and point gaps when relevant
- Never write a line that just restates the fixture — every line must add context, stakes, or narrative

STANDINGS INTEGRATION:
- When a football match involves a top-5 PL team, mention league position or point gap
  e.g. "leaders Liverpool at Sunderland" not just "Liverpool vs Sunderland"
- When a golfer is on the leaderboard, mention their position e.g. "Hovland T5, three back"
- When F1 standings are tight, reference the championship battle

NEWS HOOK:
- Use the breaking news headlines to make content timely
- If a headline relates to a scheduled event, weave it in
- Events marked ★4 or ★5 are must-watch — always include these

BRIEF STRUCTURE (critical — the brief must NOT restate the event list below it):
- "today" has exactly 2 lines:
  Line 1: The editorial headline — the ONE story that defines today. Emoji-prefixed, with HH:MM time.
  Line 2: A compact "what else" summary — counts and time ranges, NOT individual match listings.
  Example: "Plus 4 PL matches from 20:30 and Copa del Rey semifinal at 21:00"
  Example: "Also: Hovland tees off 14:30 at Pebble Beach, Carlsen in Norway Chess 17:00"
- "thisWeek" has 1-2 lines:
  Only mention sports NOT already covered by a featured section.
  If Olympics section exists, do NOT repeat Olympics events in thisWeek.
  Use middot (·) to combine multiple sports on one line.
  Example: "⛳ Thu — Hovland at Pebble Beach Pro-Am · ♟️ Sat — Carlsen opens Freestyle Chess"

LINE FORMAT:
- Headline line starts with ONE sport emoji: ⚽ ⛳ 🎾 🏎️ ♟️ 🎮 🏅
- 🏅 is reserved for Olympics events ONLY
- Use 24h HH:MM times (21:15, never 9:15 PM), max 18 words, telegraphic
- The "what else" line can skip emoji — it's a summary, not a headline
- No full sentences — headline/ticker style only

TEAM NAMES (important for logo rendering):
- For football headline lines, mention BOTH team names explicitly so the UI can render inline logos
- Use actual team names from events data (e.g. "Liverpool" not "the Reds")

QUALITY EXAMPLES:
Excellent today (2 lines only):
  Line 1: "🏅 Granerud and Lindvik chase ski jump gold, 16:00 — Norway's first medal shot"
  Line 2: "Plus 3 PL matches from 20:30 and Basque derby Copa semifinal at 21:00"

  Line 1: "⚽ Leaders Liverpool at Sunderland, 21:15 — six-point cushion on the line"
  Line 2: "Also: Hovland tees off 14:30 at Pebble Beach, Copa del Rey semifinal at 21:00"

BAD today (DO NOT write like this — these restate the event list):
  "⚽ Liverpool vs Sunderland, 21:15"
  "⚽ Fulham at Manchester City, 20:30"
  "⚽ Real Sociedad at Athletic Club, 21:00"
  (This is just the fixture list rewritten — the events section already shows this)

GOLF TEE TIMES:
- If tee time data is provided, include the golfer's tee time in the line
- Format: "Hovland tees off 14:30" or "Hovland/Scheffler pairing at 14:30"

SECTIONS:
- Featured sections highlight major events currently active: Olympics, World Cup,
  Champions League knockout stages, Grand Slams, etc.
- If no major featured event is active, return an empty sections array

OUTPUT:
- Always return valid JSON matching the provided schema exactly
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
- today: EXACTLY 2 lines. Line 1 = editorial headline (the ONE story of the day). Line 2 = compact "what else" summary (counts + time ranges, not individual fixtures)
- sections: only if a major event (Olympics, World Cup, CL, etc.) is active — use the curated data above for accurate details
- thisWeek: 1-2 lines about upcoming events NOT covered by sections. Skip any sport that has its own section above.
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

function parseResponseJSON(rawContent) {
	try {
		return JSON.parse(rawContent);
	} catch {
		const match = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (match) return JSON.parse(match[1].trim());
		throw new Error(`Could not parse JSON from response: ${rawContent.substring(0, 200)}`);
	}
}

function toFeaturedShape(result) {
	// Backward compat: accept brief/radar from old AI responses
	const todayLines = result?.today || result?.brief || [];
	const thisWeekLines = result?.thisWeek || result?.radar || [];
	return {
		today: Array.isArray(todayLines) ? todayLines.slice(0, 2) : [],
		sections: Array.isArray(result?.sections)
			? result.sections.map((s) => ({
					id: s?.id || "unknown",
					title: s?.title || "",
					emoji: s?.emoji || "",
					style: s?.style || "default",
					items: Array.isArray(s?.items) ? s.items : [],
					expandLabel: s?.expandLabel || null,
					expandItems: Array.isArray(s?.expandItems) ? s.expandItems : [],
				}))
			: [],
		thisWeek: Array.isArray(thisWeekLines) ? thisWeekLines.slice(0, 2) : [],
	};
}

function looksLikeMajorEvent(event) {
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
		parts.push(`${sportEmoji(event.sport)} ${day} — ${event.title}`);
		if (parts.length >= 2) break;
	}

	// If we have 2 short items, combine them with middot on one line
	if (parts.length === 2 && parts[0].length + parts[1].length < 80) {
		return [`${parts[0]} · ${parts[1]}`];
	}

	return parts.slice(0, 2);
}

function buildFallbackFeatured(events, now) {
	const sections = buildFallbackSections(events, now);
	const sectionSports = sections.map((s) => {
		if (/olympic/i.test(s.id || s.title)) return "olympics";
		return null;
	}).filter(Boolean);
	return {
		today: generateFallbackToday(events, now),
		sections,
		thisWeek: generateFallbackThisWeek(events, now, sectionSports),
	};
}

function fallbackLine(e) {
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
	const todayEnd = new Date(todayStart.getTime() + 86400000);

	const todayEvents = events.filter((e) => {
		const t = new Date(e.time);
		return t >= todayStart && t < todayEnd;
	});

	if (todayEvents.length === 0) return ["No events scheduled today."];

	// Line 1: editorial headline — pick the single most important event
	const headline = todayEvents.filter((e) => e.norwegian).sort((a, b) => (b.importance || 0) - (a.importance || 0))[0]
		|| todayEvents.filter((e) => e.importance >= 4).sort((a, b) => (b.importance || 0) - (a.importance || 0))[0]
		|| todayEvents[0];

	const lines = [fallbackLine(headline)];

	// Line 2: compact "what else" summary
	const rest = todayEvents.filter((e) => e !== headline);
	if (rest.length > 0) {
		const sportCounts = {};
		for (const e of rest) {
			sportCounts[e.sport] = (sportCounts[e.sport] || 0) + 1;
		}
		const times = rest.map((e) => new Date(e.time));
		const earliest = new Date(Math.min(...times));
		const earliestTime = earliest.toLocaleTimeString("en-NO", {
			hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Oslo",
		});
		const parts = Object.entries(sportCounts).map(([sport, count]) => {
			const label = { football: "football", golf: "golf", tennis: "tennis", formula1: "F1", chess: "chess", esports: "esports", olympics: "Olympics" }[sport] || sport;
			return `${count} ${label}`;
		});
		lines.push(`Plus ${parts.join(", ")} from ${earliestTime}`);
	}

	return lines.slice(0, 2);
}

async function generateRawFeatured(systemPrompt, userPrompt) {
	// 1. Try Claude CLI (OAuth token from Max subscription)
	if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
		console.log("Using Claude CLI (OAuth) to generate featured content.");
		try {
			const rawContent = await generateWithClaudeCLI(systemPrompt, userPrompt);
			return { rawContent, provider: "claude-cli" };
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
			return { rawContent, provider: llm.getProviderName() };
		} catch (err) {
			console.error("LLM API failed:", err.message);
		}
	}

	return { rawContent: null, provider: "none" };
}

async function main() {
	const dataDir = rootDataPath();
	const eventsPath = path.join(dataDir, "events.json");
	const featuredFile = FEATURED_SUFFIX ? `featured-${FEATURED_SUFFIX}.json` : "featured.json";
	const featuredPath = path.join(dataDir, featuredFile);
	const watchPlanPath = path.join(dataDir, "watch-plan.json");
	const qualityPath = path.join(dataDir, "ai-quality.json");

	if (VOICE) console.log(`Voice override: ${VOICE}`);
	if (FEATURED_SUFFIX) console.log(`Output file: ${featuredFile}`);

	const events = readJsonIfExists(eventsPath);
	if (!events || !Array.isArray(events) || events.length === 0) {
		console.log("No events found. Writing minimal featured.json.");
		const fallback = { today: ["No events scheduled today."], sections: [], thisWeek: ["Check back after the next data sync."] };
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
				todayLines: fallback.today.length,
				sectionCount: 0,
				thisWeekLines: fallback.thisWeek.length,
			},
		});
		return;
	}

	const now = new Date();
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

	const systemPrompt = buildSystemPrompt(VOICE);
	const baseUserPrompt = buildUserPrompt(events, now, curatedConfigs, standings, rssDigest);
	let featured = null;
	let provider = "none";
	let attempts = 0;
	let qualityResult = null;
	let qualityCorrections = [];

	for (let attempt = 1; attempt <= 2; attempt++) {
		attempts = attempt;
		let userPrompt = baseUserPrompt;
		if (qualityCorrections.length > 0) {
			userPrompt += `\n\nQuality corrections from previous attempt:\n- ${qualityCorrections.join("\n- ")}\nFix all issues and return valid JSON only.`;
		}

		const generated = await generateRawFeatured(systemPrompt, userPrompt);
		if (!generated.rawContent) break;
		provider = generated.provider;

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

	if (!featured.today || featured.today.length === 0) {
		featured.today = generateFallbackToday(events, now);
	}
	if (!featured.thisWeek || featured.thisWeek.length === 0) {
		const sectionSports = (featured.sections || []).map((s) => {
			if (/olympic/i.test(s.id || s.title)) return "olympics";
			return null;
		}).filter(Boolean);
		featured.thisWeek = generateFallbackThisWeek(events, now, sectionSports);
	}

	const finalQuality = validateFeaturedContent(featured, { events });
	featured = finalQuality.normalized;

	writeJsonPretty(featuredPath, featured);

	// Only write watch-plan and quality for the main featured.json (not voice variants)
	if (!FEATURED_SUFFIX) {
		const watchPlan = buildWatchPlan(events, {
			now,
			userContext,
			featured,
		});
		writeJsonPretty(watchPlanPath, watchPlan);

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
				todayLines: featured.today.length,
				sectionCount: featured.sections.length,
				thisWeekLines: featured.thisWeek.length,
			},
		});
	}

	console.log(
		`Featured content generated (${featuredFile}): ${featured.today.length} today lines, ${featured.sections.length} sections, ${featured.thisWeek.length} this-week items.`
	);
	if (!FEATURED_SUFFIX) {
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
