#!/usr/bin/env node
/**
 * Coverage watch (mechanical half): cross-references RSS headlines against
 * events.json and tracked interests, flagging entities that are in the news
 * but have no upcoming event on the dashboard → docs/data/coverage-gaps.json
 *
 * Deliberately recall-biased and noisy — the research agent reads the gaps
 * file each run and decides what is real. Detection is mechanical so it costs
 * nothing and runs every pipeline cycle.
 */

import path from "path";
import { readJsonIfExists, rootDataPath, writeJsonPretty, iso, MS_PER_DAY } from "./lib/helpers.js";

/** Build the watchlist: names worth spotting in headlines. */
export function buildWatchlist(interests, tracked) {
	const names = new Set();
	for (const n of interests?.alwaysTrack?.athletes || []) names.add(n);
	for (const n of interests?.alwaysTrack?.teams || []) names.add(n);
	for (const group of ["athletes", "tournaments", "leagues"]) {
		for (const entry of tracked?.[group] || []) {
			if (entry?.name) names.add(entry.name);
		}
	}
	return [...names].filter((n) => n && n.length >= 3);
}

function normalize(s) {
	return (s || "").toLowerCase();
}

/** Does any upcoming event mention this name (title, teams, tournament, players)? */
export function hasUpcomingEvent(name, events, now = Date.now()) {
	const n = normalize(name);
	const horizon = now + 14 * MS_PER_DAY;
	return events.some((e) => {
		const t = Date.parse(e.time);
		if (Number.isNaN(t) || t < now - MS_PER_DAY || t > horizon) return false;
		const haystack = normalize(
			[
				e.title,
				e.tournament,
				e.homeTeam,
				e.awayTeam,
				...(e.norwegianPlayers || []).map((p) => p.name || p),
				...(e.participants || []),
			].join(" ")
		);
		return haystack.includes(n);
	});
}

export function detectGaps({ rss, events, interests, tracked, now = Date.now() }) {
	const watchlist = buildWatchlist(interests, tracked);
	const items = rss?.items || [];
	const gaps = [];
	const seen = new Set();

	for (const item of items) {
		const headline = normalize(`${item.title || ""} ${item.description || ""}`);
		for (const name of watchlist) {
			const n = normalize(name);
			if (!headline.includes(n)) continue;
			if (seen.has(n)) continue;
			if (hasUpcomingEvent(name, events, now)) continue;
			seen.add(n);
			gaps.push({
				entity: name,
				headline: item.title || "",
				link: item.link || null,
				feed: item.feed || item.source || null,
				detectedAt: iso(now),
			});
		}
	}
	return gaps;
}

function main() {
	const dataDir = rootDataPath();
	const configDir = process.env.SPORTSYNC_CONFIG_DIR || path.resolve(process.cwd(), "scripts", "config");
	const rss = readJsonIfExists(path.join(dataDir, "rss-digest.json"));
	const events = readJsonIfExists(path.join(dataDir, "events.json")) || [];
	const interests = readJsonIfExists(path.join(configDir, "interests.json"));
	const tracked = readJsonIfExists(path.join(configDir, "tracked.json"));

	const gaps = detectGaps({ rss, events, interests, tracked });
	writeJsonPretty(path.join(dataDir, "coverage-gaps.json"), {
		generatedAt: iso(),
		gapCount: gaps.length,
		gaps,
		note: "Recall-biased mechanical detection — the research agent triages these.",
	});
	console.log(`Coverage gaps: ${gaps.length} entity(ies) in the news without an upcoming event`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
	main();
}
