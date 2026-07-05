// check-usage.js — turns the unified rate-limit response headers into governor state.
import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { usageStateFromHeaders, summarizeUsage, appendUsageHistory } from "../scripts/check-usage.js";

const NOW = "2026-07-04T18:00:00Z";
// The real header set observed from an OAuth /v1/messages call in CI:
const REAL = {
	"anthropic-ratelimit-unified-5h-utilization": "0.18",
	"anthropic-ratelimit-unified-5h-reset": "1783192800",
	"anthropic-ratelimit-unified-5h-status": "allowed",
	"anthropic-ratelimit-unified-7d-utilization": "0.59",
	"anthropic-ratelimit-unified-7d-reset": "1783526400",
	"anthropic-ratelimit-unified-7d-status": "allowed",
	"anthropic-ratelimit-unified-status": "allowed",
};

describe("usageStateFromHeaders", () => {
	it("parses real headers into session/week percentages + ISO resets", () => {
		const s = usageStateFromHeaders(REAL, NOW);
		expect(s.parsed).toBe(true);
		expect(s.session.percentUsed).toBe(18);
		expect(s.week.percentUsed).toBe(59);
		expect(s.session.resetsAt).toBe(new Date(1783192800 * 1000).toISOString());
		expect(s.status).toBe("green");
		expect(s.skipAll).toBe(false);
		expect(s.skipNiceToHave).toBe(false);
	});

	it("amber (skip nice-to-have) at >=75% on either window", () => {
		const s = usageStateFromHeaders({ ...REAL, "anthropic-ratelimit-unified-7d-utilization": "0.80" }, NOW);
		expect(s.status).toBe("amber");
		expect(s.skipNiceToHave).toBe(true);
		expect(s.skipAll).toBe(false);
	});

	it("allowed_warning status → amber even at low utilization", () => {
		const s = usageStateFromHeaders({ ...REAL, "anthropic-ratelimit-unified-status": "allowed_warning" }, NOW);
		expect(s.status).toBe("amber");
		expect(s.skipNiceToHave).toBe(true);
	});

	it("red at >=90%", () => {
		const s = usageStateFromHeaders({ ...REAL, "anthropic-ratelimit-unified-7d-utilization": "0.93" }, NOW);
		expect(s.status).toBe("red");
	});

	it("skipAll when session window near-exhausted (>=95%)", () => {
		const s = usageStateFromHeaders({ ...REAL, "anthropic-ratelimit-unified-5h-utilization": "0.97" }, NOW);
		expect(s.skipAll).toBe(true);
	});

	it("skipAll when unified status is rejected (being throttled)", () => {
		const s = usageStateFromHeaders({ ...REAL, "anthropic-ratelimit-unified-status": "rejected" }, NOW);
		expect(s.status).toBe("red");
		expect(s.skipAll).toBe(true);
	});

	it("fail-open (parsed:false) when no unified headers present", () => {
		const s = usageStateFromHeaders({ "content-type": "application/json" }, NOW);
		expect(s.parsed).toBe(false);
		expect(s.skipAll).toBe(false);
		expect(s.skipNiceToHave).toBe(false);
	});
});

describe("summarizeUsage", () => {
	const now = Date.parse("2026-07-05T12:00:00Z");
	const D = 86_400_000, H = 3_600_000;
	const records = [
		{ checkedAt: new Date(now - 2 * D).toISOString(), sessionPct: 10, weekPct: 40, status: "green" },
		{ checkedAt: new Date(now - 1 * D).toISOString(), sessionPct: 30, weekPct: 55, status: "green" },
		{ checkedAt: new Date(now - 2 * H).toISOString(), sessionPct: 80, weekPct: 78, status: "amber" },
		{ checkedAt: new Date(now).toISOString(), sessionPct: 20, weekPct: 67, status: "green" },
	];

	it("reports the latest reading", () => {
		expect(summarizeUsage(records, now).latest.weekPct).toBe(67);
	});

	it("computes the 24h week-utilization trend (percentage points)", () => {
		expect(summarizeUsage(records, now).weekTrend24hPct).toBe(12); // 67 now vs 55 a day ago
	});

	it("computes 7d peak/avg and conservation hours", () => {
		const s = summarizeUsage(records, now).last7d;
		expect(s.peakWeekPct).toBe(78);
		expect(s.avgWeekPct).toBe(60); // (40+55+78+67)/4
		expect(s.peakSessionPct).toBe(80);
		expect(s.amberHours).toBe(1);
		expect(s.redHours).toBe(0);
	});

	it("excludes samples outside the window", () => {
		const old = [{ checkedAt: new Date(now - 40 * D).toISOString(), sessionPct: 5, weekPct: 30, status: "green" }];
		expect(summarizeUsage([...old, ...records], now).last7d.samples).toBe(4);
		expect(summarizeUsage([...old, ...records], now).last30d.samples).toBe(4);
	});

	it("handles empty history gracefully", () => {
		const s = summarizeUsage([], now);
		expect(s.latest).toBe(null);
		expect(s.weekTrend24hPct).toBe(null);
		expect(s.last7d).toEqual({ samples: 0 });
	});
});

describe("appendUsageHistory", () => {
	it("appends a compact record and trims, returning parsed records", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "usage-"));
		const state1 = { checkedAt: "2026-07-05T10:00:00Z", session: { percentUsed: 20 }, week: { percentUsed: 67 }, status: "green" };
		const state2 = { checkedAt: "2026-07-05T11:00:00Z", session: { percentUsed: 25 }, week: { percentUsed: 68 }, status: "green" };
		const r1 = appendUsageHistory(state1, dir);
		expect(r1).toHaveLength(1);
		expect(r1[0]).toEqual({ checkedAt: "2026-07-05T10:00:00Z", sessionPct: 20, weekPct: 67, status: "green" });
		const r2 = appendUsageHistory(state2, dir);
		expect(r2).toHaveLength(2);
		expect(r2[1].weekPct).toBe(68);
		// file is valid JSONL
		const lines = fs.readFileSync(path.join(dir, "usage-history.jsonl"), "utf8").split("\n").filter(Boolean);
		expect(lines).toHaveLength(2);
		expect(() => lines.map((l) => JSON.parse(l))).not.toThrow();
	});
});
