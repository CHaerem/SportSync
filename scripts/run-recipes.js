#!/usr/bin/env node
/**
 * Recipe Runner — Pipeline Step
 *
 * Executes all active recipes from scripts/config/recipes/_registry.json.
 * For each recipe: fetch → extract → map → validate → update health.
 * Writes results to the corresponding config's events array.
 * Writes execution history to docs/data/scraper-history.json.
 *
 * This step runs every pipeline cycle (hourly) with ZERO LLM cost.
 * Self-repair (LLM) is handled separately by learn-recipe.js.
 *
 * Pipeline phase: fetch (parallel with other data fetchers)
 */

import fs from "fs";
import path from "path";
import { readJsonIfExists, writeJsonPretty, rootDataPath } from "./lib/helpers.js";
import {
	executeRecipe,
	needsRepair,
} from "./lib/recipe-scraper.js";

const configDir = process.env.SPORTSYNC_CONFIG_DIR || path.resolve(process.cwd(), "scripts", "config");
const recipesDir = path.join(configDir, "recipes");
const dataDir = rootDataPath();
const historyPath = path.join(dataDir, "scraper-history.json");

const MAX_HISTORY_ENTRIES = 200;

async function main() {
	// Load registry
	const registryPath = path.join(recipesDir, "_registry.json");
	const registry = readJsonIfExists(registryPath);
	if (!registry?.recipes?.length) {
		console.log("No recipes registered. Skipping.");
		return;
	}

	const activeRecipes = registry.recipes.filter((r) => r.active);
	console.log(`Running ${activeRecipes.length} active recipe(s)...`);

	// Load history
	const history = readJsonIfExists(historyPath) || { runs: [] };

	let successCount = 0;
	let failCount = 0;

	for (const entry of activeRecipes) {
		const recipePath = path.join(recipesDir, entry.file);
		const recipe = readJsonIfExists(recipePath);
		if (!recipe) {
			console.warn(`  Recipe file not found: ${entry.file}`);
			continue;
		}

		console.log(`  Executing recipe: ${recipe.id} (${recipe.description || ""})`);

		const result = await executeRecipe(recipe);

		console.log(`    → ${result.resultCount} results in ${result.durationMs}ms (${result.success ? "OK" : "FAILED"})`);

		if (!result.success && result.diagnosis) {
			console.log(`    → Diagnosis: ${result.diagnosis.cause} — ${result.diagnosis.details.join("; ")}`);
		}

		// Update recipe health in the file
		recipe.health = result.health;
		recipe.lastUsedAt = new Date().toISOString();
		writeJsonPretty(recipePath, recipe);

		// Update registry entry
		entry.lastRun = new Date().toISOString();
		entry.consecutiveFailures = result.health.consecutiveFailures || 0;
		entry.needsRepair = needsRepair(result.health);

		if (result.success) {
			entry.lastSuccess = new Date().toISOString();
			successCount++;

			// Write results to the target config if configRef is set
			if (recipe.metadata?.configRef) {
				applyRecipeResults(recipe, result.events);
			}
		} else {
			failCount++;
		}

		// Log to history
		history.runs.push({
			recipeId: recipe.id,
			timestamp: new Date().toISOString(),
			success: result.success,
			resultCount: result.resultCount,
			durationMs: result.durationMs,
			issues: result.validation.issues.length > 0 ? result.validation.issues.slice(0, 3) : undefined,
			diagnosis: result.diagnosis?.cause || undefined,
		});
	}

	// Trim history
	if (history.runs.length > MAX_HISTORY_ENTRIES) {
		history.runs = history.runs.slice(-MAX_HISTORY_ENTRIES);
	}

	// Save registry and history
	writeJsonPretty(registryPath, registry);
	writeJsonPretty(historyPath, history);

	console.log(`Recipe runner complete: ${successCount} succeeded, ${failCount} failed`);

	// Surface repair needs
	const repairNeeded = registry.recipes.filter((r) => r.needsRepair);
	if (repairNeeded.length > 0) {
		console.log(`⚠ ${repairNeeded.length} recipe(s) need self-repair: ${repairNeeded.map((r) => r.id).join(", ")}`);
	}
}

/**
 * Apply recipe results to the target config's events array.
 * Only updates events that came from this recipe (tagged with _recipeId).
 */
function applyRecipeResults(recipe, events) {
	const configPath = path.join(configDir, recipe.metadata.configRef);
	const config = readJsonIfExists(configPath);
	if (!config) {
		console.log(`    → Config not found: ${recipe.metadata.configRef}, skipping result apply`);
		return;
	}

	// Tag events with recipe source
	const taggedEvents = events.map((ev) => ({
		...ev,
		_recipeId: recipe.id,
	}));

	// Remove old recipe-sourced events, keep manually added ones
	const existingEvents = (config.events || []).filter(
		(ev) => ev._recipeId !== recipe.id
	);

	config.events = [...existingEvents, ...taggedEvents];
	config.lastRecipeRun = new Date().toISOString();
	writeJsonPretty(configPath, config);

	console.log(`    → Applied ${taggedEvents.length} events to ${recipe.metadata.configRef}`);
}

main().catch((err) => {
	console.error("Recipe runner failed:", err.message);
	process.exit(1);
});
