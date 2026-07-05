// update-readme-status.js — renders the AI-budget block into the README from quota data.
import { describe, it, expect } from "vitest";
import { renderStatusBlock, replaceBetweenMarkers } from "../scripts/update-readme-status.js";

const NOW = "2026-07-05T12:00:00.000Z";
const state = {
	parsed: true,
	status: "green",
	week: { percentUsed: 67, resetsAt: "2026-07-08T16:00:00.000Z" },
	session: { percentUsed: 20, resetsAt: "2026-07-05T14:20:00.000Z" },
};
const summary = {
	weekTrend24hPct: 12,
	last7d: { samples: 10, peakWeekPct: 78, avgWeekPct: 60, amberHours: 3, redHours: 0 },
};

describe("renderStatusBlock", () => {
	it("renders week/session/7d with status emoji and trend", () => {
		const b = renderStatusBlock(summary, state, NOW);
		expect(b).toContain("## AI-budsjett");
		expect(b).toContain("**67%** 🟢");
		expect(b).toContain("↑ +12pp siste 24t");
		expect(b).toContain("nullstilles 2026-07-08");
		expect(b).toContain("Sesjon (5t) | 20%");
		expect(b).toContain("topp 78% · snitt 60%");
		expect(b).toContain("3t i sparemodus");
	});

	it("shows the right emoji for amber/red", () => {
		expect(renderStatusBlock(summary, { ...state, status: "amber" }, NOW)).toContain("🟡");
		expect(renderStatusBlock(summary, { ...state, status: "red" }, NOW)).toContain("🔴");
	});

	it("degrades gracefully with no summary (state only)", () => {
		const b = renderStatusBlock(null, state, NOW);
		expect(b).toContain("**67%**");
		expect(b).not.toContain("siste 24t"); // no trend without summary
		expect(b).not.toContain("Siste 7 dager");
	});

	it("says so when there is no quota data at all", () => {
		expect(renderStatusBlock(null, null, NOW)).toContain("Ingen kvote-data ennå");
		expect(renderStatusBlock(null, { parsed: false }, NOW)).toContain("Ingen kvote-data ennå");
	});
});

describe("replaceBetweenMarkers", () => {
	const START = "<!-- STATUS:START -->";
	const END = "<!-- STATUS:END -->";

	it("replaces content but keeps the markers", () => {
		const doc = `intro\n${START}\nold\n${END}\noutro`;
		const out = replaceBetweenMarkers(doc, START, END, "NEW");
		expect(out).toBe(`intro\n${START}\nNEW\n${END}\noutro`);
		expect(out).toContain("intro");
		expect(out).toContain("outro");
		expect(out).not.toContain("old");
	});

	it("returns null when markers are missing", () => {
		expect(replaceBetweenMarkers("no markers here", START, END, "x")).toBe(null);
	});
});
