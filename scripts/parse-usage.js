#!/usr/bin/env node
/**
 * Parse the output of `claude -p "/usage"` into docs/data/usage-state.json so the
 * scheduled agents can throttle themselves against REAL Claude Code Max quota,
 * and the dashboard can show it. Driven by `.github/workflows/usage-monitor.yml`.
 *
 * `/usage` prints, e.g.:
 *   Current session: 15% used · resets Jul 4 at 9:19pm (Europe/Oslo)
 *   Current week (all models): 59% used · resets Jul 8 at 5:59pm (Europe/Oslo)
 *
 * We key throttling off the PERCENTAGES (robust); the reset strings are kept for
 * display. No timestamp math needed — after a reset, the next poll simply reports
 * a low %, so the state self-corrects.
 */
import fs from "fs";
import path from "path";
import { rootDataPath, iso } from "./lib/helpers.js";

// Percent-of-window-used thresholds:
export const AMBER = 75; // start conserving — optional agents skip
export const RED = 90; // conserve hard
export const NEAR_EXHAUSTED = 95; // skip everything; a run now would just fail

/**
 * Parse /usage text into a governor state object.
 * @param {string} text - raw `/usage` output
 * @param {string} nowIso - ISO timestamp for checkedAt
 */
export function parseUsage(text, nowIso) {
	const src = String(text || "");
	// `.*?` (no /s flag) stays on the same line and skips the "· " separator.
	const sm = src.match(/current session:\s*(\d+)%\s*used\b.*?resets?\s+([^\n]+)/i);
	const wm = src.match(/current week[^:\n]*:\s*(\d+)%\s*used\b.*?resets?\s+([^\n]+)/i);
	const session = sm ? { percentUsed: Number(sm[1]), resetsAt: sm[2].trim() } : null;
	const week = wm ? { percentUsed: Number(wm[1]), resetsAt: wm[2].trim() } : null;
	const parsed = !!(session || week);

	const maxPct = Math.max(session?.percentUsed ?? 0, week?.percentUsed ?? 0);
	const sessionPct = session?.percentUsed ?? 0;
	let status = "green";
	if (maxPct >= RED) status = "red";
	else if (maxPct >= AMBER) status = "amber";

	// skipAll: the immediate (session) window is nearly gone — any run would fail.
	// skipNiceToHave: conserve the weekly/session budget by dropping optional work.
	const skipAll = parsed && sessionPct >= NEAR_EXHAUSTED;
	const skipNiceToHave = parsed && (status === "amber" || status === "red");

	return {
		checkedAt: nowIso,
		parsed,
		session,
		week,
		status,
		skipAll,
		skipNiceToHave,
		thresholds: { amber: AMBER, red: RED, nearExhausted: NEAR_EXHAUSTED },
	};
}

// CLI: read /usage text on stdin → write docs/data/usage-state.json
if (import.meta.url === `file://${process.argv[1]}`) {
	let raw = "";
	process.stdin.setEncoding("utf8");
	process.stdin.on("data", (d) => (raw += d));
	process.stdin.on("end", () => {
		const state = parseUsage(raw, iso());
		const out = path.join(rootDataPath(), "usage-state.json");
		fs.writeFileSync(out, JSON.stringify(state, null, 2));
		console.log(
			`usage-state: status=${state.status} session=${state.session?.percentUsed ?? "?"}% ` +
			`week=${state.week?.percentUsed ?? "?"}% skipAll=${state.skipAll} skipNiceToHave=${state.skipNiceToHave}`
		);
		if (!state.parsed) {
			// Fail-soft: an unparseable /usage must not break the monitor. The gate
			// treats a missing/unparsed state as "run" (fail-open), so we never let
			// the governor itself block work.
			console.error("WARNING: could not parse /usage output — wrote parsed:false state");
			if (raw.trim()) console.error("--- raw /usage output ---\n" + raw.slice(0, 500));
		}
	});
}
