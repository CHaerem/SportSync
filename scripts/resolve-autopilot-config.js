/**
 * CLI entry point for resolving autopilot runtime config.
 *
 * Reads scripts/autopilot-config.json and docs/data/.quota-status.json,
 * calls resolveAutopilotConfig(), and outputs key=value lines to stdout
 * for consumption by GitHub Actions (>> $GITHUB_OUTPUT).
 *
 * Debug logging goes to stderr so it doesn't pollute the output.
 *
 * Usage:
 *   node scripts/resolve-autopilot-config.js >> $GITHUB_OUTPUT
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveAutopilotConfig, DEFAULTS } from "./lib/resolve-autopilot-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readJsonSafe(filePath) {
	try {
		const raw = fs.readFileSync(filePath, "utf-8");
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

const configPath = path.join(__dirname, "autopilot-config.json");
const quotaPath = path.join(__dirname, "..", "docs", "data", ".quota-status.json");

const config = readJsonSafe(configPath);
const quotaStatus = readJsonSafe(quotaPath);

if (!config) {
	console.error("[resolve-autopilot-config] Warning: could not read autopilot-config.json, using defaults");
}
if (!quotaStatus) {
	console.error("[resolve-autopilot-config] Warning: could not read .quota-status.json, assuming tier 0");
}

const resolved = resolveAutopilotConfig(config, quotaStatus);

// Debug to stderr
console.error(`[resolve-autopilot-config] model=${resolved.model} max_turns=${resolved.maxTurns}`);
if (quotaStatus?.evaluation) {
	console.error(`[resolve-autopilot-config] quota tier=${quotaStatus.evaluation.tier} (${quotaStatus.evaluation.tierName})`);
}

// Output for GitHub Actions ($GITHUB_OUTPUT format)
console.log(`model=${resolved.model}`);
console.log(`max_turns=${resolved.maxTurns}`);
console.log(`allowed_tools=${resolved.allowedTools}`);
