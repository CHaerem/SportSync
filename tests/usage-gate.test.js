// usage-gate.js — freshness-aware decision logic (WP-94).
import { describe, it, expect, vi } from "vitest";
import { resolveEffectiveState, decideFromState, FRESH_MS, STALE_MS } from "../scripts/usage-gate.js";

const NOW = Date.parse("2026-07-18T12:00:00Z");
const greenState = (checkedAt) => ({
	checkedAt,
	parsed: true,
	unifiedStatus: "allowed",
	session: { percentUsed: 20 },
	week: { percentUsed: 40 },
	status: "green",
	skipAll: false,
	skipNiceToHave: false,
});
const redState = (checkedAt) => ({
	checkedAt,
	parsed: true,
	unifiedStatus: "rejected",
	session: { percentUsed: 96 },
	week: { percentUsed: 96 },
	status: "red",
	skipAll: true,
	skipNiceToHave: true,
});

describe("resolveEffectiveState", () => {
	it("uses the cache untouched when it's fresh (<= FRESH_MS old) — never calls fetchFresh", async () => {
		const cached = greenState(new Date(NOW - 5 * 60 * 1000).toISOString()); // 5 min old
		const fetchFresh = vi.fn();
		const { state, source, ageMs } = await resolveEffectiveState({ cached, now: NOW, fetchFresh });
		expect(source).toBe("cached-fresh");
		expect(state).toBe(cached);
		expect(ageMs).toBe(5 * 60 * 1000);
		expect(fetchFresh).not.toHaveBeenCalled();
	});

	it("fetches fresh when the cache is older than FRESH_MS and uses the fresh reading", async () => {
		const cached = greenState(new Date(NOW - 20 * 60 * 1000).toISOString()); // 20 min old
		const fresh = redState(new Date(NOW).toISOString());
		const fetchFresh = vi.fn().mockResolvedValue(fresh);
		const { state, source } = await resolveEffectiveState({ cached, now: NOW, fetchFresh });
		expect(fetchFresh).toHaveBeenCalledTimes(1);
		expect(source).toBe("fresh");
		expect(state).toBe(fresh);
	});

	it("falls back to the (still non-stale) cache when the live fetch is unavailable/fails", async () => {
		const cached = greenState(new Date(NOW - 20 * 60 * 1000).toISOString()); // 20 min old, within STALE_MS
		const fetchFresh = vi.fn().mockRejectedValue(new Error("no token"));
		const { state, source } = await resolveEffectiveState({ cached, now: NOW, fetchFresh });
		expect(source).toBe("cached-stale-fetch-unavailable");
		expect(state).toBe(cached);
	});

	it("falls back to the cache when fetchFresh is not provided at all (no token) and cache is not stale", async () => {
		const cached = greenState(new Date(NOW - 20 * 60 * 1000).toISOString());
		const { state, source } = await resolveEffectiveState({ cached, now: NOW, fetchFresh: null });
		expect(source).toBe("cached-stale-fetch-unavailable");
		expect(state).toBe(cached);
	});

	it("fails open (state: null) when cache is stale beyond STALE_MS and fetch is unavailable", async () => {
		const cached = greenState(new Date(NOW - (STALE_MS + 60_000)).toISOString());
		const { state, source } = await resolveEffectiveState({ cached, now: NOW, fetchFresh: null });
		expect(state).toBe(null);
		expect(source).toBe("none");
	});

	it("fails open (state: null) when there is no cache at all and no fetch", async () => {
		const { state, source } = await resolveEffectiveState({ cached: null, now: NOW, fetchFresh: null });
		expect(state).toBe(null);
		expect(source).toBe("none");
	});

	it("still attempts a fresh fetch when there is no cache at all", async () => {
		const fresh = greenState(new Date(NOW).toISOString());
		const fetchFresh = vi.fn().mockResolvedValue(fresh);
		const { state, source } = await resolveEffectiveState({ cached: null, now: NOW, fetchFresh });
		expect(fetchFresh).toHaveBeenCalledTimes(1);
		expect(source).toBe("fresh");
		expect(state).toBe(fresh);
	});

	it("ignores an unparsed fresh reading and falls back to cache", async () => {
		const cached = greenState(new Date(NOW - 20 * 60 * 1000).toISOString());
		const fetchFresh = vi.fn().mockResolvedValue({ parsed: false });
		const { state, source } = await resolveEffectiveState({ cached, now: NOW, fetchFresh });
		expect(source).toBe("cached-stale-fetch-unavailable");
		expect(state).toBe(cached);
	});

	it("treats a boundary exactly at FRESH_MS as fresh (no fetch)", async () => {
		const cached = greenState(new Date(NOW - FRESH_MS).toISOString());
		const fetchFresh = vi.fn();
		const { source } = await resolveEffectiveState({ cached, now: NOW, fetchFresh });
		expect(source).toBe("cached-fresh");
		expect(fetchFresh).not.toHaveBeenCalled();
	});
});

describe("decideFromState", () => {
	it("fail-open (run=true) when state is null", () => {
		expect(decideFromState(null, "critical")).toEqual({ run: true, reason: "no usable usage-state (fail-open)" });
	});

	it("skips every tier when skipAll is set", () => {
		const s = redState("2026-07-18T12:00:00Z");
		expect(decideFromState(s, "critical").run).toBe(false);
		expect(decideFromState(s, "optional").run).toBe(false);
	});

	it("skipNiceToHave only skips the optional tier, not critical", () => {
		const s = { ...greenState("x"), status: "amber", skipNiceToHave: true };
		expect(decideFromState(s, "critical").run).toBe(true);
		expect(decideFromState(s, "optional").run).toBe(false);
	});

	it("runs when green", () => {
		const s = greenState("2026-07-18T12:00:00Z");
		expect(decideFromState(s, "critical")).toEqual({ run: true, reason: "green · session 20% week 40%" });
	});
});
