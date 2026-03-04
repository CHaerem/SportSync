#!/usr/bin/env node

/**
 * Publish user preferences for client consumption.
 *
 * Reads scripts/config/user-context.json (the pipeline source of truth),
 * normalizes sport IDs (e.g. f1 → formula1) for client compatibility,
 * and writes docs/data/user-preferences.json.
 *
 * This bridges the gap between server-side pipeline config and the
 * client-side dashboard/preferences page. Changes made via the
 * preferences page commit directly back to user-context.json via
 * GitHub Contents API, closing the loop.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readJsonIfExists, writeJsonPretty } from "./lib/helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const USER_CONTEXT_PATH = path.join(__dirname, "config", "user-context.json");
const OUTPUT_PATH = path.join(ROOT, "docs", "data", "user-preferences.json");

/**
 * Map of pipeline sport IDs → client sport IDs.
 * The pipeline uses short IDs (f1), but the client SPORT_CONFIG uses
 * canonical IDs (formula1). This map normalizes at publish time.
 */
const PIPELINE_TO_CLIENT = {
	f1: "formula1",
};

/**
 * Normalize a pipeline sport ID to client form.
 * @param {string} id - Pipeline sport ID (e.g. "f1")
 * @returns {string} Client sport ID (e.g. "formula1")
 */
export function normalizeToClient(id) {
	return PIPELINE_TO_CLIENT[id] || id;
}

/**
 * Normalize a client sport ID back to pipeline form.
 * @param {string} id - Client sport ID (e.g. "formula1")
 * @returns {string} Pipeline sport ID (e.g. "f1")
 */
export function normalizeFromClient(id) {
	for (const [pipeline, client] of Object.entries(PIPELINE_TO_CLIENT)) {
		if (client === id) return pipeline;
	}
	return id;
}

/**
 * Normalize all keys in an object from pipeline → client sport IDs.
 * @param {Object} obj - Object with pipeline sport ID keys
 * @returns {Object} Object with client sport ID keys
 */
function normalizeObjectKeys(obj) {
	if (!obj || typeof obj !== "object") return obj;
	const result = {};
	for (const [key, value] of Object.entries(obj)) {
		result[normalizeToClient(key)] = value;
	}
	return result;
}

/**
 * Publish user preferences for client consumption.
 * @param {string} [inputPath] - Override path to user-context.json (for testing)
 * @param {string} [outputPath] - Override path to output file (for testing)
 * @returns {Object} The published preferences object
 */
export async function publishPreferences(inputPath, outputPath) {
	const srcPath = inputPath || USER_CONTEXT_PATH;
	const destPath = outputPath || OUTPUT_PATH;

	const userContext = readJsonIfExists(srcPath);
	if (!userContext) {
		console.error(`[publish-preferences] Cannot read ${srcPath}`);
		return null;
	}

	const published = {
		_publishedAt: new Date().toISOString(),
		favoriteTeams: userContext.favoriteTeams || [],
		favoriteTeamsBySport: normalizeObjectKeys(
			userContext.favoriteTeamsBySport || {}
		),
		favoritePlayers: userContext.favoritePlayers || [],
		favoritePlayersBySport: normalizeObjectKeys(
			userContext.favoritePlayersBySport || {}
		),
		favoriteEsportsOrgs: userContext.favoriteEsportsOrgs || [],
		sportPreferences: normalizeObjectKeys(
			userContext.sportPreferences || {}
		),
		location: userContext.location || "Norway",
	};

	// Ensure output directory exists
	const dir = path.dirname(destPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	writeJsonPretty(destPath, published);
	console.log(
		`[publish-preferences] Published ${Object.keys(published.sportPreferences).length} sport preferences, ` +
			`${published.favoriteTeams.length} teams, ${published.favoritePlayers.length} players → ${path.basename(destPath)}`
	);

	return published;
}

// CLI entry point
if (
	process.argv[1] &&
	path.resolve(process.argv[1]) ===
		path.resolve(fileURLToPath(import.meta.url))
) {
	publishPreferences()
		.then((result) => {
			if (!result) process.exit(1);
		})
		.catch((err) => {
			console.error("[publish-preferences] Error:", err.message);
			process.exit(1);
		});
}
