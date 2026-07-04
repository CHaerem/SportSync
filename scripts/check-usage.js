#!/usr/bin/env node
/**
 * Read REAL Claude Code Max quota → docs/data/usage-state.json.
 *
 * There is no supported quota API for a Max OAuth token (see the usage-monitor
 * workflow notes), BUT a minimal /v1/messages call authenticated with
 * CLAUDE_CODE_OAUTH_TOKEN returns the account-wide `anthropic-ratelimit-unified-*`
 * response headers — verified in CI, and they match what `/usage` shows locally:
 *   anthropic-ratelimit-unified-5h-utilization / -5h-reset (unix) / -5h-status
 *   anthropic-ratelimit-unified-7d-utilization / -7d-reset / -7d-status
 *   anthropic-ratelimit-unified-status: allowed | allowed_warning | rejected
 * We spend ~1 token to read the gauge.
 *
 * Fail-soft: on any error we LEAVE usage-state.json untouched and the gate
 * fail-opens on stale/missing state, so the governor can never itself block work.
 */
import fs from "fs";
import path from "path";
import { rootDataPath, iso } from "./lib/helpers.js";

// Utilization thresholds (0..1):
export const AMBER = 0.75; // start conserving — optional agents skip
export const RED = 0.9; // conserve hard
export const NEAR_EXHAUSTED = 0.95; // session almost gone — skip everything

/** Build the governor state from the unified rate-limit response headers. */
export function usageStateFromHeaders(h, nowIso) {
	const num = (k) => {
		const v = h[k];
		return v == null || v === "" ? null : Number(v);
	};
	const isoFromEpoch = (k) => {
		const n = num(k);
		return n ? new Date(n * 1000).toISOString() : null;
	};
	const u5 = num("anthropic-ratelimit-unified-5h-utilization");
	const u7 = num("anthropic-ratelimit-unified-7d-utilization");
	const unified = (h["anthropic-ratelimit-unified-status"] || "").toLowerCase() || null;
	const parsed = u5 != null || u7 != null || !!unified;

	const session = u5 != null
		? { percentUsed: Math.round(u5 * 100), utilization: u5, resetsAt: isoFromEpoch("anthropic-ratelimit-unified-5h-reset"), status: h["anthropic-ratelimit-unified-5h-status"] || null }
		: null;
	const week = u7 != null
		? { percentUsed: Math.round(u7 * 100), utilization: u7, resetsAt: isoFromEpoch("anthropic-ratelimit-unified-7d-reset"), status: h["anthropic-ratelimit-unified-7d-status"] || null }
		: null;

	const maxU = Math.max(u5 ?? 0, u7 ?? 0);
	const rejected = unified === "rejected";
	let status = "green";
	if (rejected || maxU >= RED) status = "red";
	else if (unified === "allowed_warning" || maxU >= AMBER) status = "amber";

	// skipAll: session window nearly gone or we're being rejected — a run would fail.
	// skipNiceToHave: conserve budget by dropping optional work whenever not green.
	const skipAll = parsed && (rejected || (u5 ?? 0) >= NEAR_EXHAUSTED);
	const skipNiceToHave = parsed && status !== "green";

	return {
		checkedAt: nowIso,
		parsed,
		unifiedStatus: unified,
		session,
		week,
		status,
		skipAll,
		skipNiceToHave,
		thresholds: { amber: AMBER, red: RED, nearExhausted: NEAR_EXHAUSTED },
	};
}

async function fetchUsageHeaders(token) {
	const res = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"anthropic-version": "2023-06-01",
			"anthropic-beta": "oauth-2025-04-20",
			"content-type": "application/json",
		},
		body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
	});
	const headers = {};
	for (const [k, v] of res.headers) headers[k.toLowerCase()] = v;
	return { status: res.status, headers };
}

// CLI: make the call, write usage-state.json (fail-soft — never overwrite with junk).
if (import.meta.url === `file://${process.argv[1]}`) {
	const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
	const out = path.join(rootDataPath(), "usage-state.json");
	(async () => {
		if (!token) {
			console.error("no CLAUDE_CODE_OAUTH_TOKEN — leaving usage-state.json untouched");
			return;
		}
		try {
			const { status, headers } = await fetchUsageHeaders(token);
			if (status === 429) headers["anthropic-ratelimit-unified-status"] = "rejected"; // being throttled now
			const state = usageStateFromHeaders(headers, iso());
			if (!state.parsed) {
				console.error(`no unified rate-limit headers (HTTP ${status}) — leaving usage-state.json untouched`);
				return;
			}
			fs.writeFileSync(out, JSON.stringify(state, null, 2));
			console.log(
				`usage-state: ${state.status} · session ${state.session?.percentUsed ?? "?"}% (resets ${state.session?.resetsAt ?? "?"}) ` +
				`· week ${state.week?.percentUsed ?? "?"}% · skipAll=${state.skipAll} skipNiceToHave=${state.skipNiceToHave}`
			);
		} catch (e) {
			console.error("usage check failed (fail-soft, state untouched):", e.message);
		}
	})();
}
