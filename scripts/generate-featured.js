#!/usr/bin/env node
/**
 * Generates featured.json with AI-curated editorial content:
 * - brief: 2-3 editorial lines summarizing the day
 * - sections: dynamic featured content (Olympics, World Cup, CL, etc.)
 * - radar: 2-3 "on the radar" sentences about potential events
 *
 * Usage: ANTHROPIC_API_KEY=... node scripts/generate-featured.js
 *   or:  OPENAI_API_KEY=... node scripts/generate-featured.js
 */

import fs from "fs";
import path from "path";
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

function buildUserPrompt(events, now, curatedConfigs) {
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
			return `${day} ${time} | ${e.sport} | ${e.tournament || ""} | ${e.title}${nor}`;
		})
		.join("\n");

	const curatedContext = buildCuratedContext(curatedConfigs || [], now);

	return `Today is ${dateStr}. There are ${todayEvents.length} events today and ${weekEvents.length} this week.

Events (next 7 days, max 30 shown):
${summary || "(no events)"}${curatedContext}

Generate featured.json matching this schema:
${JSON.stringify(FEATURED_SCHEMA, null, 2)}

Remember:
- brief: exactly 2-3 lines
- sections: only if a major event (Olympics, World Cup, CL, etc.) is active — use the curated data above for accurate details
- radar: 2-3 forward-looking sentences about Norwegian athletes
- Return ONLY valid JSON, no markdown wrapper`;
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

	const llm = new LLMClient();

	if (!llm.isAvailable()) {
		console.log("No LLM API key found. Using fallback brief generation.");
		writeJsonPretty(featuredPath, {
			brief: generateFallbackBrief(events, now),
			sections: [],
			radar: [],
		});
		return;
	}

	console.log(`Using ${llm.getProviderName()} to generate featured content.`);

	try {
		const result = await llm.completeJSON(buildSystemPrompt(), buildUserPrompt(events, now, curatedConfigs));

		// Validate structure
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
		console.error("LLM featured generation failed:", err.message);
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
