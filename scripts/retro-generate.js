#!/usr/bin/env node
/**
 * Retro-generate featured briefings for today + past N days.
 * Usage: ANTHROPIC_API_KEY="sk-ant-..." node scripts/retro-generate.js [days=5]
 */

import { execSync } from "child_process";

const days = parseInt(process.argv[2] || "5", 10);
const env = { ...process.env };

// Unset CLAUDECODE to allow nested claude CLI if needed
delete env.CLAUDECODE;

console.log(`\n=== Retro-generating featured briefings (today + ${days} days back) ===\n`);

// Step 1: Generate today's featured
console.log("--- TODAY (live) ---");
try {
	execSync("node scripts/generate-featured.js", { env, stdio: "inherit", timeout: 180000 });
	console.log("Today: OK\n");
} catch (e) {
	console.error("Today: FAILED -", e.message, "\n");
}

// Step 2: Generate past days as recaps
for (let i = 1; i <= days; i++) {
	const d = new Date(Date.now() - i * 86400000);
	const dateKey = d.toISOString().slice(0, 10);
	console.log(`--- ${dateKey} (recap) ---`);
	try {
		execSync("node scripts/generate-featured.js", {
			env: {
				...env,
				SPORTSYNC_FEATURED_DATE: dateKey,
				SPORTSYNC_FEATURED_MODE: "recap",
			},
			stdio: "inherit",
			timeout: 180000,
		});
		console.log(`${dateKey}: OK\n`);
	} catch (e) {
		console.error(`${dateKey}: FAILED -`, e.message, "\n");
	}
}

// Step 3: Generate tomorrow preview
const tomorrow = new Date(Date.now() + 86400000);
const tomorrowKey = tomorrow.toISOString().slice(0, 10);
console.log(`--- ${tomorrowKey} (preview) ---`);
try {
	execSync("node scripts/generate-featured.js", {
		env: {
			...env,
			SPORTSYNC_FEATURED_DATE: tomorrowKey,
			SPORTSYNC_FEATURED_MODE: "preview",
		},
		stdio: "inherit",
		timeout: 180000,
	});
	console.log(`${tomorrowKey}: OK\n`);
} catch (e) {
	console.error(`${tomorrowKey}: FAILED -`, e.message, "\n");
}

console.log("=== Retro-generation complete ===");
