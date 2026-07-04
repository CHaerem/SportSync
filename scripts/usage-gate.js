#!/usr/bin/env node
/**
 * Governor gate: decide whether an agent should run, from docs/data/usage-state.json.
 *   node scripts/usage-gate.js <critical|optional>
 * Writes `run=true|false` to $GITHUB_OUTPUT (for a workflow step `if:`).
 *
 * FAIL-OPEN by design: missing, unparsed, or stale (>3h) state → run. The
 * governor must never block work because of its own gaps — it only throttles on
 * fresh, confident quota data.
 *   - skipAll (session near-exhausted / rejected) → skip every tier.
 *   - skipNiceToHave (amber/red) → skip only the "optional" tier.
 */
import fs from "fs";
import path from "path";
import { rootDataPath, readJsonIfExists } from "./lib/helpers.js";

const STALE_MS = 3 * 60 * 60 * 1000;
const tier = (process.argv[2] || "critical").toLowerCase();
const state = readJsonIfExists(path.join(rootDataPath(), "usage-state.json"));

let run = true;
let reason = "no usage-state (fail-open)";
if (state && state.parsed && state.checkedAt) {
	const ageMs = Date.now() - Date.parse(state.checkedAt);
	if (!(ageMs >= 0) || ageMs > STALE_MS) {
		run = true;
		reason = `state stale/invalid (fail-open)`;
	} else if (state.skipAll) {
		run = false;
		reason = `quota ${state.unifiedStatus || state.status} · session ${state.session?.percentUsed ?? "?"}%`;
	} else if (tier === "optional" && state.skipNiceToHave) {
		run = false;
		reason = `conserving (${state.status}) · week ${state.week?.percentUsed ?? "?"}%`;
	} else {
		run = true;
		reason = `${state.status} · session ${state.session?.percentUsed ?? "?"}% week ${state.week?.percentUsed ?? "?"}%`;
	}
}

console.log(`usage-gate[${tier}]: run=${run} — ${reason}`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
