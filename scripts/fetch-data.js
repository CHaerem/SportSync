#!/usr/bin/env node
/**
 * Data Fetcher for SportSync
 *
 * Fetches open/free API data for:
 *  - Football (football-data.org) limited competitions (Premier League, La Liga, Bundesliga, Serie A, Eliteserien fallback)
 *  - Formula 1 (Ergast API) schedule
 *  - Chess (Lichess upcoming tournaments)
 *  - F1 sessions enrichment (placeholder)
 *  - Generic meta.json update
 *
 * Notes:
 *  - Keep requests minimal (GitHub Actions every 6h). Cache-friendly.
 *  - All times converted to UTC ISO strings; frontend converts to Europe/Oslo.
 *  - Ensure graceful degradation: if one sport fails, others still write.
 */

import fs from "fs";
import path from "path";
import https from "https";

const ROOT = path.resolve(process.cwd(), "docs", "data");

function ensureDir(p) {
	if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
ensureDir(ROOT);

function fetchJson(url) {
	return new Promise((resolve, reject) => {
		https
			.get(url, { headers: { "User-Agent": "SportSync/1.0" } }, (res) => {
				let data = "";
				res.on("data", (d) => {
					data += d;
				});
				res.on("end", () => {
					try {
						resolve(JSON.parse(data));
					} catch (e) {
						reject(e);
					}
				});
			})
			.on("error", reject);
	});
}

function iso(date) {
	return new Date(date).toISOString();
}

function writeData(file, obj) {
	const outPath = path.join(ROOT, file);
	fs.writeFileSync(outPath, JSON.stringify(obj, null, 2));
	console.log("Wrote", file);
}

async function fetchFootball() {
	// football-data.org free competitions (IDs) - Premier League (PL), La Liga (PD), Serie A (SA), Bundesliga (BL1)
	// Eliteserien not available on free tier; leave placeholder / curated.
	const COMPETITIONS = ["PL", "PD", "SA", "BL1"];
	const TOURNAMENTS = [];
	const endpointBase = "https://api.football-data.org/v4";
	// No API key -> will likely 403; keep structure & skip gracefully.
	for (const code of COMPETITIONS) {
		try {
			const url = `${endpointBase}/competitions/${code}/matches?status=SCHEDULED&limit=10`;
			const json = await fetchJson(url);
			const events = (json.matches || [])
				.slice(0, 10)
				.map((m) => ({
					title: `${m.homeTeam?.name || "TBD"} vs ${m.awayTeam?.name || "TBD"}`,
					meta: json.competition?.name || code,
					time: m.utcDate ? iso(m.utcDate) : null,
					venue: m.venue || "",
					homeTeam: m.homeTeam?.name,
					awayTeam: m.awayTeam?.name,
					sport: "football",
					streaming: [],
					norwegian:
						m.homeTeam?.name?.includes("Norway") ||
						m.awayTeam?.name?.includes("Norway") ||
						false,
				}))
				.filter((e) => e.time);
			TOURNAMENTS.push({ name: json.competition?.name || code, events });
		} catch (e) {
			console.warn("Football fetch failed for", code, e.message);
		}
	}
	if (TOURNAMENTS.length === 0) return null;
	return {
		lastUpdated: iso(Date.now()),
		source: "football-data.org (public unauthenticated)",
		tournaments: TOURNAMENTS,
	};
}

async function fetchF1() {
	// Ergast F1 schedule
	const year = new Date().getFullYear();
	const url = `https://ergast.com/api/f1/${year}.json`;
	try {
		const json = await fetchJson(url);
		const races = json.MRData?.RaceTable?.Races || [];
		const tournaments = [
			{
				name: `Formula 1 ${year}`,
				events: races.map((r) => ({
					title: r.raceName,
					meta: r.Circuit?.circuitName,
					time: iso(`${r.Date || r.date}T${r.time || "00:00:00Z"}`),
					venue: `${r.Circuit?.Location?.locality || ""}, ${
						r.Circuit?.Location?.country || ""
					}`.trim(),
					sport: "formula1",
					streaming: [],
					norwegian: false,
				})),
			},
		];
		return { lastUpdated: iso(Date.now()), source: "Ergast API", tournaments };
	} catch (e) {
		console.warn("F1 fetch failed", e.message);
		return null;
	}
}

async function fetchChess() {
	// Use the proper professional chess tournaments fetcher
	try {
		const { fetchChessOpen } = await import("./fetch/chess.js");
		return await fetchChessOpen();
	} catch (e) {
		console.warn("Chess fetch failed", e.message);
		return null;
	}
}

async function fetchEsports() {
	// Liquipedia or other sources need scraping; placeholder structure keeps file valid.
	return {
		lastUpdated: iso(Date.now()),
		source: "Placeholder",
		tournaments: [],
	};
}

async function main() {
	const writers = [];

	const football = await fetchFootball();
	if (football) writers.push(() => writeData("football-open.json", football));

	const f1 = await fetchF1();
	if (f1) writers.push(() => writeData("f1-open.json", f1));

	const chess = await fetchChess();
	if (chess) writers.push(() => writeData("chess-open.json", chess));

	const esports = await fetchEsports();
	writers.push(() => writeData("esports-open.json", esports));

	writers.forEach((w) => w());

	// Update meta
	writeData("meta.json", {
		lastUpdate: iso(Date.now()),
		timezone: "Europe/Oslo",
	});
}

main().catch((err) => {
	console.error("Data fetch script failed", err);
	process.exit(1);
});
