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
import { rootDataPath, iso, MS_PER_DAY } from "./lib/helpers.js";

// Utilization thresholds (0..1):
export const AMBER = 0.75; // start conserving — optional agents skip
export const RED = 0.9; // conserve hard
export const NEAR_EXHAUSTED = 0.95; // session almost gone — skip everything

// Keep ~100 days of hourly history — bounded, small, mineable by the improve agent.
export const MAX_HISTORY = 2400;

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

/**
 * Roll the append-only history into a small, digestible overview: latest reading,
 * 24h week-utilization trend, and 7d/30d peaks + how many hours we spent conserving
 * (amber/red). This is what tells us whether to adjust schedules or thresholds.
 */
export function summarizeUsage(records, now = Date.now()) {
	const valid = (records || []).filter((r) => r && typeof r.weekPct === "number" && r.checkedAt);
	const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);

	const windowStats = (days) => {
		const cutoff = now - days * MS_PER_DAY;
		const inWin = valid.filter((r) => Date.parse(r.checkedAt) >= cutoff);
		if (inWin.length === 0) return { samples: 0 };
		const weekVals = inWin.map((r) => r.weekPct);
		const sessVals = inWin.map((r) => r.sessionPct).filter((v) => typeof v === "number");
		return {
			samples: inWin.length,
			peakWeekPct: Math.max(...weekVals),
			avgWeekPct: avg(weekVals),
			peakSessionPct: sessVals.length ? Math.max(...sessVals) : null,
			amberHours: inWin.filter((r) => r.status === "amber").length,
			redHours: inWin.filter((r) => r.status === "red").length,
		};
	};

	const latest = valid.length ? valid[valid.length - 1] : null;
	const dayAgo = now - MS_PER_DAY;
	const before = [...valid].reverse().find((r) => Date.parse(r.checkedAt) <= dayAgo);
	const weekTrend24hPct = latest && before ? latest.weekPct - before.weekPct : null;

	return {
		generatedAt: iso(now),
		latest: latest
			? { checkedAt: latest.checkedAt, sessionPct: latest.sessionPct, weekPct: latest.weekPct, status: latest.status }
			: null,
		weekTrend24hPct, // + rising toward the weekly cap, - falling
		last7d: windowStats(7),
		last30d: windowStats(30),
	};
}

/** Append one compact reading to usage-history.jsonl (trimmed) and return all records. */
export function appendUsageHistory(state, dir = rootDataPath()) {
	const file = path.join(dir, "usage-history.jsonl");
	const rec = {
		checkedAt: state.checkedAt,
		sessionPct: state.session?.percentUsed ?? null,
		weekPct: state.week?.percentUsed ?? null,
		status: state.status,
	};
	let lines = [];
	try {
		lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
	} catch {
		// first run — no history yet
	}
	lines.push(JSON.stringify(rec));
	if (lines.length > MAX_HISTORY) lines = lines.slice(lines.length - MAX_HISTORY);
	fs.writeFileSync(file, lines.join("\n") + "\n");
	return lines
		.map((l) => {
			try {
				return JSON.parse(l);
			} catch {
				return null;
			}
		})
		.filter(Boolean);
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
			// Append to history and refresh the digest — best-effort, never blocks the gauge.
			try {
				const records = appendUsageHistory(state);
				const summary = summarizeUsage(records);
				fs.writeFileSync(path.join(rootDataPath(), "usage-summary.json"), JSON.stringify(summary, null, 2));
				const t = summary.weekTrend24hPct;
				console.log(
					`usage-state: ${state.status} · session ${state.session?.percentUsed ?? "?"}% (resets ${state.session?.resetsAt ?? "?"}) ` +
					`· week ${state.week?.percentUsed ?? "?"}%${t == null ? "" : ` (${t >= 0 ? "+" : ""}${t}pp/24h)`} · 7d peak ${summary.last7d?.peakWeekPct ?? "?"}% · ` +
					`skipAll=${state.skipAll} skipNiceToHave=${state.skipNiceToHave}`
				);
			} catch (e) {
				console.error("usage history/summary best-effort failed:", e.message);
				console.log(`usage-state: ${state.status} · week ${state.week?.percentUsed ?? "?"}%`);
			}
		} catch (e) {
			console.error("usage check failed (fail-soft, state untouched):", e.message);
		}
	})();
}
