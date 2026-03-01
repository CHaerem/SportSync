#!/usr/bin/env node

/**
 * Capability registry generator — inspects the pipeline manifest, data files,
 * and fetchers to produce docs/data/capabilities.json.
 *
 * Also writes docs/data/meta.json (lastUpdate / nextUpdate timestamps) so
 * that the client can display pipeline freshness without a separate step.
 *
 * The autopilot reads this during scouting to identify system gaps and
 * decide what to build next.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readJsonIfExists, writeJsonPretty } from "./lib/helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "docs", "data");
const MANIFEST_PATH = path.join(__dirname, "pipeline-manifest.json");
const ROADMAP_PATH = path.join(ROOT, "AUTOPILOT_ROADMAP.md");

/** Known sports and their capabilities (static knowledge). */
const SPORT_CAPABILITIES = {
	football: { liveScores: true, standings: true, results: true },
	golf: { liveScores: true, standings: true, results: true },
	tennis: { liveScores: false, standings: false, results: false },
	f1: { liveScores: false, standings: true, results: false },
	chess: { liveScores: false, standings: false, results: false },
	esports: { liveScores: false, standings: false, results: false },
};

/**
 * Detect which sports have standings data in standings.json.
 * Returns a Set of sport names with detected standings.
 * This allows dynamically discovered standings (e.g. tennis ATP rankings) to
 * override the static SPORT_CAPABILITIES table.
 */
function detectStandingsFromFile(dataDir) {
	const detected = new Set();
	try {
		const standingsPath = path.join(dataDir, "standings.json");
		const standings = JSON.parse(fs.readFileSync(standingsPath, "utf-8"));
		// Football: premierLeague array
		if (Array.isArray(standings.football?.premierLeague) && standings.football.premierLeague.length > 0) {
			detected.add("football");
		}
		// Golf: pga or dpWorld arrays
		if (
			(Array.isArray(standings.golf?.pga) && standings.golf.pga.length > 0) ||
			(Array.isArray(standings.golf?.dpWorld) && standings.golf.dpWorld.length > 0)
		) {
			detected.add("golf");
		}
		// Tennis: ATP or WTA rankings
		if (
			(Array.isArray(standings.tennis?.atp) && standings.tennis.atp.length > 0) ||
			(Array.isArray(standings.tennis?.wta) && standings.tennis.wta.length > 0)
		) {
			detected.add("tennis");
		}
		// F1: drivers array
		if (Array.isArray(standings.f1?.drivers) && standings.f1.drivers.length > 0) {
			detected.add("f1");
		}
	} catch { /* standings.json missing or invalid — fall back to static caps */ }
	return detected;
}

/**
 * Generate the capability registry.
 * @param {object} opts - optional path overrides for testing
 * @returns {object} capabilities object
 */
export function generateCapabilities(opts = {}) {
	const dataDir = opts.dataDir || DATA_DIR;
	const manifestPath = opts.manifestPath || MANIFEST_PATH;
	const fetcherDir = opts.fetcherDir || path.join(ROOT, "scripts", "fetch");
	const configDir = opts.configDir || path.join(ROOT, "scripts", "config");
	const roadmapPath = opts.roadmapPath || ROADMAP_PATH;

	// Count pipeline steps from manifest
	let pipelineSteps = 0;
	let pipelinePhases = [];
	try {
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
		for (const phase of manifest.phases || []) {
			pipelinePhases.push(phase.name);
			pipelineSteps += (phase.steps || []).length;
		}
	} catch {
		// Manifest not found or invalid
	}

	// Detect sports from data directory — auto-discover from events.json + fetcher files
	const sports = {};
	const sportFiles = new Set(["football", "golf", "tennis", "f1", "chess", "esports"]);
	// Read events.json once — used for sport discovery and config-only event counts
	let allEvents = [];
	try {
		allEvents = JSON.parse(fs.readFileSync(path.join(dataDir, "events.json"), "utf-8"));
		for (const evt of allEvents) {
			if (evt.sport) sportFiles.add(evt.sport);
		}
	} catch { /* events.json missing or invalid */ }
	// Dynamically detect which sports have standings in standings.json (overrides static caps)
	const detectedStandings = detectStandingsFromFile(dataDir);
	for (const sport of sportFiles) {
		const dataFile = path.join(dataDir, `${sport}.json`);
		const hasFetcher = fs.existsSync(path.join(fetcherDir, `${sport}.js`));
		const hasData = fs.existsSync(dataFile);
		let eventCount = 0;
		if (hasData) {
			try {
				const data = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
				if (data.tournaments) {
					eventCount = data.tournaments.reduce((sum, t) => sum + (t.events?.length || 0), 0);
				}
			} catch { /* ignore parse errors */ }
		}
		// For config-only sports without a data file, count events from events.json
		if (!hasData && allEvents.length > 0) {
			eventCount = allEvents.filter(e => e.sport === sport).length;
		}
		const caps = SPORT_CAPABILITIES[sport] || {};
		sports[sport] = {
			fetcher: hasFetcher,
			data: hasData,
			eventCount,
			liveScores: caps.liveScores || false,
			standings: caps.standings || detectedStandings.has(sport),
			results: caps.results || false,
		};
	}

	// Count curated configs
	let curatedConfigs = 0;
	try {
		const configFiles = fs.readdirSync(configDir).filter((f) => f.endsWith(".json") && f !== "user-context.json");
		curatedConfigs = configFiles.length;
	} catch { /* dir not found */ }

	// Read autonomy report
	let feedbackLoops = 0;
	const autonomyReport = readJsonIfExists(path.join(dataDir, "autonomy-report.json"));
	if (autonomyReport) {
		feedbackLoops = autonomyReport.loopsTotal || Object.keys(autonomyReport.loops || {}).length || 0;
	}

	// Count scouting heuristics from roadmap
	let scoutingHeuristics = 0;
	try {
		const roadmap = fs.readFileSync(roadmapPath, "utf-8");
		const matches = roadmap.match(/^### [A-Z]\./gm);
		scoutingHeuristics = matches ? matches.length : 0;
	} catch { /* file not found */ }

	// Identify gaps
	const gaps = [];
	const noLive = Object.entries(sports)
		.filter(([, s]) => s.fetcher && !s.liveScores)
		.map(([name]) => name);
	if (noLive.length > 0) gaps.push(`No live scores for ${noLive.join(", ")}`);

	const noStandings = Object.entries(sports)
		.filter(([, s]) => s.fetcher && !s.standings)
		.map(([name]) => name);
	if (noStandings.length > 0) gaps.push(`No standings for ${noStandings.join(", ")}`);

	const noResults = Object.entries(sports)
		.filter(([, s]) => s.fetcher && !s.results)
		.map(([name]) => name);
	if (noResults.length > 0) gaps.push(`No results tracking for ${noResults.join(", ")}`);

	const noData = Object.entries(sports)
		.filter(([, s]) => s.fetcher && !s.data)
		.map(([name]) => name);
	if (noData.length > 0) gaps.push(`No data file for ${noData.join(", ")} — fetcher may be broken`);

	// Check for known issues
	const esportsSport = sports.esports;
	if (esportsSport && esportsSport.eventCount === 0) {
		gaps.push("Esports HLTV API stale — relying on curated configs only");
	}

	// Check diagnostic files
	const diagnosticFiles = [
		"health-report.json", "ai-quality.json", "coverage-gaps.json",
		"quality-history.json", "autonomy-report.json", "watch-plan.json",
		"recent-results.json", "fact-check-history.json", "preference-evolution.json",
	];
	const missingDiagnostics = diagnosticFiles.filter(
		(f) => !fs.existsSync(path.join(dataDir, f))
	);
	if (missingDiagnostics.length > 0) {
		gaps.push(`Missing diagnostic files: ${missingDiagnostics.join(", ")}`);
	}

	const capabilities = {
		generatedAt: new Date().toISOString(),
		sports,
		pipelineSteps,
		pipelinePhases,
		feedbackLoops,
		scoutingHeuristics,
		curatedConfigs,
		gaps,
	};

	// Write output
	try {
		fs.mkdirSync(dataDir, { recursive: true });
		writeJsonPretty(path.join(dataDir, "capabilities.json"), capabilities);
		console.log(`Capabilities written: ${pipelineSteps} steps, ${Object.keys(sports).length} sports, ${gaps.length} gaps`);
	} catch (err) {
		console.error("Failed to write capabilities.json:", err.message);
	}

	return capabilities;
}

/**
 * Write docs/data/meta.json with pipeline freshness timestamps.
 * Called after generateCapabilities() in the CLI entry point so both
 * outputs are produced in a single pipeline step.
 *
 * @param {string} [dataDir] - Override for docs/data directory (for testing)
 */
export function updateMeta(dataDir) {
	const dir = dataDir || DATA_DIR;
	const now = new Date();
	// Next update: 1 hour + 10-minute buffer (matches workflow schedule)
	const next = new Date(now.getTime() + 1 * 3600000 + 600000);
	const meta = {
		lastUpdate: now.toISOString(),
		nextUpdate: next.toISOString(),
		timezone: "Europe/Oslo",
		openSources: true,
	};
	try {
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
		console.log(`Meta written: lastUpdate=${now.toISOString()}`);
	} catch (err) {
		console.error("Failed to write meta.json:", err.message);
	}
}

// CLI entry point
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
	generateCapabilities();
	updateMeta();
}
