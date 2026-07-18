#!/usr/bin/env node
/**
 * Governor gate: decide whether an agent should run, from docs/data/usage-state.json.
 *   node scripts/usage-gate.js <critical|optional>
 * Writes `run=true|false` (+ `source=`) to $GITHUB_OUTPUT (for a workflow step `if:`).
 *
 * FAIL-OPEN by design: missing, unusable, or too-stale (>3h) state → run. The
 * governor must never block work because of its own gaps — it only throttles on
 * fresh, confident quota data.
 *   - skipAll (session near-exhausted / rejected) → skip every tier.
 *   - skipNiceToHave (amber/red) → skip only the "optional" tier.
 *
 * Freshness (WP-94): usage-monitor.yml only refreshes usage-state.json hourly, so a
 * critical-tier agent could previously make a run/skip call on a reading up to ~1h
 * stale — in the red windows this was built to fix, that meant hard-failing (or
 * running straight into a rejected quota) instead of skipping gracefully. If the
 * cached snapshot is older than FRESH_MS (~10min), the gate now attempts ONE live
 * reading itself (reusing check-usage.js's header call) before deciding, and falls
 * back to the cached snapshot (if not stale beyond STALE_MS) or fail-open if that
 * also fails/is unavailable. The decision always reports which source it used:
 * fresh | cached-fresh | cached-stale-fetch-unavailable | none.
 *
 * NB: the live read here needs CLAUDE_CODE_OAUTH_TOKEN in this step's env. Today
 * only usage-monitor.yml's step exports it; the agent workflows (research/verify/
 * scout) do not pass it to the usage-gate step, so `fetchFresh` is a no-op there
 * until a workflow change adds it — `.github/workflows/**` is a protected path,
 * out of scope for this change (see PR notes). Until then this degrades exactly
 * to the previous cached/fail-open behaviour, which is safe.
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { rootDataPath, readJsonIfExists, iso } from "./lib/helpers.js";
import { fetchUsageHeaders, usageStateFromHeaders } from "./check-usage.js";

export const FRESH_MS = 10 * 60 * 1000; // cached snapshot younger than this needs no live check
export const STALE_MS = 3 * 60 * 60 * 1000; // cached snapshot older than this is unusable (fail-open)

/**
 * Pick the state to decide on: the cache if it's fresh enough, otherwise a live
 * reading (via the injected `fetchFresh`), otherwise the cache if it's at least
 * not stale, otherwise nothing (fail-open). Pure apart from the injected fetch —
 * testable with a stub `fetchFresh` and no real network/fs/clock.
 */
export async function resolveEffectiveState({ cached, now = Date.now(), fetchFresh } = {}) {
	const ageMs = cached && cached.checkedAt ? now - Date.parse(cached.checkedAt) : null;
	const cachedUsable = !!(cached && cached.parsed && cached.checkedAt && ageMs != null && ageMs >= 0);

	if (cachedUsable && ageMs <= FRESH_MS) {
		return { state: cached, source: "cached-fresh", ageMs };
	}

	let fresh = null;
	if (fetchFresh) {
		try {
			fresh = await fetchFresh();
		} catch {
			fresh = null;
		}
	}
	if (fresh && fresh.parsed) {
		return { state: fresh, source: "fresh", ageMs: 0 };
	}

	if (cachedUsable && ageMs <= STALE_MS) {
		return { state: cached, source: "cached-stale-fetch-unavailable", ageMs };
	}
	return { state: null, source: "none", ageMs };
}

/** Turn a resolved state (or null, meaning fail-open) into a run/skip decision. */
export function decideFromState(state, tier) {
	if (!state) return { run: true, reason: "no usable usage-state (fail-open)" };
	if (state.skipAll) {
		return { run: false, reason: `quota ${state.unifiedStatus || state.status} · session ${state.session?.percentUsed ?? "?"}%` };
	}
	if (tier === "optional" && state.skipNiceToHave) {
		return { run: false, reason: `conserving (${state.status}) · week ${state.week?.percentUsed ?? "?"}%` };
	}
	return { run: true, reason: `${state.status} · session ${state.session?.percentUsed ?? "?"}% week ${state.week?.percentUsed ?? "?"}%` };
}

async function main() {
	const tier = (process.argv[2] || "critical").toLowerCase();
	const cached = readJsonIfExists(path.join(rootDataPath(), "usage-state.json"));
	const now = Date.now();

	const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
	const fetchFresh = token
		? async () => {
				const { status, headers } = await fetchUsageHeaders(token);
				if (status === 429) headers["anthropic-ratelimit-unified-status"] = "rejected";
				return usageStateFromHeaders(headers, iso(now));
			}
		: null;

	const { state, source, ageMs } = await resolveEffectiveState({ cached, now, fetchFresh });
	const { run, reason } = decideFromState(state, tier);
	const ageNote = ageMs == null ? "" : `, snapshot age ${Math.round(ageMs / 60000)}m`;

	console.log(`usage-gate[${tier}]: run=${run} — ${reason} [source=${source}${ageNote}]`);
	if (process.env.GITHUB_OUTPUT) {
		fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\nsource=${source}\n`);
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
	main();
}
