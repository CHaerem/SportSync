#!/usr/bin/env node
/**
 * Coverage watch (mechanical half): a cheap, recall-biased net that runs every
 * pipeline cycle and flags things the dashboard may be missing. Three signals,
 * all written to docs/data/coverage-gaps.json for the research/coverage agents:
 *
 *   1. Entity gaps   — a tracked entity is in the news but has NO upcoming event
 *      (the original signal), OR has one only far out while the news signals
 *      something imminent ("i dag", "denne helgen", …).
 *   2. Sport gaps    — a followed sport is in the news with imminence language but
 *      has no event on the board in the next few days. This is the F1-blind-spot
 *      catcher: ESPN silently mis-dates F1 weekends (Fridays, premature FINAL) so
 *      the CURRENT race can vanish while later races remain — no entity/name match
 *      would notice, but "Formel 1 … i dag" + zero F1 events soon does.
 *   3. Source anomalies — a fetcher's own data file is missing/empty, or has events
 *      the board dropped. Guards against a single upstream source going unreliable.
 *
 * Deliberately noisy and mechanical — the coverage-critic and research agents read
 * this file and decide what is real (they cross-check the web). Detection costs
 * nothing, so it runs hourly; judgement is left to the agents.
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { readJsonIfExists, rootDataPath, writeJsonPretty, iso, MS_PER_DAY, containsName, normalizeEntity, entityTerms, isEventInWindow } from "./lib/helpers.js";

// Re-export so existing importers (tests) keep resolving containsName from here.
export { containsName };

/** How soon counts as "imminent" — the window the news is usually shouting about. */
export const IMMINENT_DAYS = 4;
/** How far out we still consider an entity "covered" for the plain missing check. */
export const UPCOMING_DAYS = 14;

/** Sport data files the static pipeline is expected to produce (mirrors scripts/fetch/index.js). */
export const EXPECTED_SPORT_FILES = ["football", "golf", "tennis", "f1", "chess", "esports", "cycling"];

/**
 * Followed sports keyed by distinctive news terms → the sport key used in events.json.
 * Kept small and specific on purpose: this is a recall net, not a taxonomy. "winter"
 * has no fetcher/sport key, so it flags whenever winter sport is imminent in the news
 * and nothing is on the board (correct in season, silent off-season).
 */
export const SPORT_NEWS_KEYWORDS = [
	{ sport: "f1", label: "Formel 1", keywords: ["formel 1", "formula 1", "grand prix"] },
	{ sport: "cycling", label: "Sykkel", keywords: ["tour de france", "sykkel-vm", "verdenscup sykkel"] },
	{ sport: "chess", label: "Sjakk", keywords: ["sjakk-vm", "norway chess", "sjakkturnering"] },
	{ sport: "golf", label: "Golf", keywords: ["pga tour", "golf major", "the open championship"] },
	{ sport: "tennis", label: "Tennis", keywords: ["grand slam", "atp-turnering", "wta-turnering"] },
	{ sport: "football", label: "Fotball", keywords: ["mesterligaen", "cupfinale", "landskamp"] },
	{ sport: "esports", label: "Esport", keywords: ["cs2", "counter-strike", "esport-major"] },
	{ sport: "winter", label: "Vinteridrett", keywords: ["langrenn", "skiskyting", "alpint verdenscup"] },
];

/** Headline language that says "this is happening now / very soon". */
export const IMMINENCE_MARKERS = [
	"i dag", "i kveld", "i natt", "i morgen",
	"denne helga", "denne helgen", "i helga", "i helgen",
	"live", "direkte", "sendes nå", "starter i dag",
	"this weekend", "today", "tonight", "kickoff", "race day",
];

/** Build the watchlist: names (and aliases) worth spotting in headlines. */
export function buildWatchlist(interests, tracked) {
	const names = new Set();
	for (const group of ["athletes", "teams", "tournaments"]) {
		for (const raw of interests?.alwaysTrack?.[group] || []) {
			const e = normalizeEntity(raw);
			if (e) for (const term of entityTerms(e)) names.add(term);
		}
	}
	for (const group of ["athletes", "tournaments", "leagues"]) {
		for (const entry of tracked?.[group] || []) {
			if (entry?.name) names.add(entry.name);
		}
	}
	return [...names].filter((n) => n && n.length >= 3);
}

/** Does the headline carry "happening now/soon" language? */
export function headlineIsImminent(headline) {
	return IMMINENCE_MARKERS.some((m) => containsName(headline, m));
}

/** Does this event mention the given name (title, teams, tournament, players)? */
function eventMentionsName(event, name) {
	const haystack = [
		event.title,
		event.tournament,
		event.homeTeam,
		event.awayTeam,
		...(event.norwegianPlayers || []).map((p) => p?.name || p),
		...(event.participants || []).map((p) => p?.name || p),
	].join(" ");
	return containsName(haystack, name);
}

/**
 * Does any event within `days` (and not already over) mention this name?
 * Uses isEventInWindow so an ongoing multi-day event (golf, stage race) that
 * STARTED days ago still counts as coverage — windowing on start time alone
 * generated false gaps for exactly those events.
 */
export function hasEventWithin(name, events, now, days) {
	const windowStart = now - MS_PER_DAY;
	const windowEnd = now + days * MS_PER_DAY;
	return events.some((e) => isEventInWindow(e, windowStart, windowEnd) && eventMentionsName(e, name));
}

/** Back-compat: is there an upcoming (≤14d) event for this name? */
export function hasUpcomingEvent(name, events, now = Date.now()) {
	return hasEventWithin(name, events, now, UPCOMING_DAYS);
}

/** Count events of a given sport within `days` (ongoing multi-day events included). */
export function countSportEventsWithin(events, sport, now, days) {
	const windowStart = now - MS_PER_DAY;
	const windowEnd = now + days * MS_PER_DAY;
	return events.filter((e) => e.sport === sport && isEventInWindow(e, windowStart, windowEnd)).length;
}

export function detectGaps({ rss, events, interests, tracked, now = Date.now() }) {
	const watchlist = buildWatchlist(interests, tracked);
	const items = (rss?.items || []).map((item) => ({
		item,
		text: `${item.title || ""} ${item.description || ""}`,
	}));
	const gaps = [];

	// (1) + partial (imminent) — per tracked entity.
	for (const name of watchlist) {
		const matches = items.filter(({ text }) => containsName(text, name));
		if (matches.length === 0) continue;

		const hasUpcoming = hasEventWithin(name, events, now, UPCOMING_DAYS);
		const hasImminent = hasEventWithin(name, events, now, IMMINENT_DAYS);
		const imminentMatch = matches.find(({ text }) => headlineIsImminent(text));

		let type = null;
		if (!hasUpcoming) type = "missing"; // in the news, nothing on the board at all
		else if (imminentMatch && !hasImminent) type = "imminent"; // something soon per the news, but our next one is far out
		if (!type) continue;

		const lead = imminentMatch || matches[0];
		gaps.push({
			kind: "entity",
			entity: name,
			type,
			imminent: type === "imminent" || (!!imminentMatch && type === "missing"),
			headline: lead.item.title || "",
			link: lead.item.link || null,
			feed: lead.item.feed || lead.item.source || null,
			matchCount: matches.length,
			detectedAt: iso(now),
		});
	}

	// (2) sport-level imminence — the ESPN-blind-spot catcher (F1 etc.).
	for (const { sport, label, keywords } of SPORT_NEWS_KEYWORDS) {
		const match = items.find(
			({ text }) => headlineIsImminent(text) && keywords.some((k) => containsName(text, k))
		);
		if (!match) continue;
		if (countSportEventsWithin(events, sport, now, IMMINENT_DAYS) > 0) continue;
		gaps.push({
			kind: "sport",
			entity: label,
			sport,
			type: "imminent",
			imminent: true,
			headline: match.item.title || "",
			link: match.item.link || null,
			feed: match.item.feed || match.item.source || null,
			detectedAt: iso(now),
		});
	}

	return gaps;
}

/**
 * (3) Source health, coverage-first. What matters is whether the *board* covers a
 * sport, not the fetcher's internal state: some sports (chess, most cycling) have no
 * API and are filled by AI research, so an empty fetcher file there is expected. So
 * we only look closer at a sport when the board has NOTHING upcoming for it, then
 * name why (fetcher missing / empty / dropping events). `sources` maps sport key →
 * parsed data file (or null if absent).
 */
export function detectSourceAnomalies({ sources, events, now = Date.now() }) {
	const anomalies = [];
	for (const sport of EXPECTED_SPORT_FILES) {
		const onBoard = countSportEventsWithin(events, sport, now, UPCOMING_DAYS);
		if (onBoard > 0) continue; // covered by some source — not a coverage problem

		const data = sources?.[sport];
		if (data == null) {
			anomalies.push({ sport, issue: "file-missing", detail: `docs/data/${sport}.json is absent and no ${sport} events on the board — fetcher may have failed`, severity: "medium", detectedAt: iso(now) });
			continue;
		}
		const fileEvents = (data.tournaments || []).flatMap((t) => t.events || []);
		const upcomingInFile = fileEvents.filter((e) =>
			isEventInWindow(e, now - MS_PER_DAY, now + UPCOMING_DAYS * MS_PER_DAY)
		).length;
		if (upcomingInFile > 0) {
			anomalies.push({ sport, issue: "dropped-in-build", detail: `${upcomingInFile} upcoming ${sport} event(s) in the source file but 0 on the board — build/normalisation may be dropping them`, severity: "high", detectedAt: iso(now) });
		} else if (fileEvents.length === 0) {
			anomalies.push({ sport, issue: "file-empty", detail: `docs/data/${sport}.json has no events and none on the board — source may be down or changed`, severity: "low", detectedAt: iso(now) });
		}
	}
	return anomalies;
}

function readSources(dataDir) {
	const sources = {};
	for (const sport of EXPECTED_SPORT_FILES) {
		const file = path.join(dataDir, `${sport}.json`);
		sources[sport] = fs.existsSync(file) ? readJsonIfExists(file) : null;
	}
	return sources;
}

function main() {
	const dataDir = rootDataPath();
	const configDir = process.env.SPORTSYNC_CONFIG_DIR || path.resolve(process.cwd(), "scripts", "config");
	const rss = readJsonIfExists(path.join(dataDir, "rss-digest.json"));
	const events = readJsonIfExists(path.join(dataDir, "events.json")) || [];
	const interests = readJsonIfExists(path.join(configDir, "interests.json"));
	const tracked = readJsonIfExists(path.join(configDir, "tracked.json"));
	const sources = readSources(dataDir);

	const gaps = detectGaps({ rss, events, interests, tracked });
	const anomalies = detectSourceAnomalies({ sources, events });
	writeJsonPretty(path.join(dataDir, "coverage-gaps.json"), {
		generatedAt: iso(),
		gapCount: gaps.length,
		anomalyCount: anomalies.length,
		gaps,
		anomalies,
		note: "Recall-biased mechanical detection — the coverage-critic and research agents triage these and cross-check the web. gaps: entity/sport in the news but missing or not imminent on the board. anomalies: a fetcher's own data looks unreliable.",
	});
	console.log(
		`Coverage gaps: ${gaps.length} (${gaps.filter((g) => g.imminent).length} imminent); source anomalies: ${anomalies.length}`
	);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
	main();
}
