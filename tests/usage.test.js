// check-usage.js — turns the unified rate-limit response headers into governor state.
import { describe, it, expect } from "vitest";
import { usageStateFromHeaders } from "../scripts/check-usage.js";

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
