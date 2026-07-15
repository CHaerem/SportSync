#!/usr/bin/env node
/**
 * Regenerate the AI-budget status block in README.md from the quota data the
 * usage-monitor writes (usage-state.json + usage-summary.json). Runs hourly right
 * after check-usage.js. Budget/ops belong in the repo README, not on the calm
 * dashboard — so the maintainer sees quota pressure + trend where they work.
 *
 * Best-effort: if the data or the markers are missing, leave README.md untouched.
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { rootDataPath, readJsonIfExists, iso } from "./lib/helpers.js";

const START = "<!-- STATUS:START -->";
const END = "<!-- STATUS:END -->";
const EMOJI = { green: "🟢", amber: "🟡", red: "🔴" };

/** Build the markdown that goes between the STATUS markers. Pure — no IO. */
export function renderStatusBlock(summary, state, nowIso) {
	if (!state || !state.parsed) {
		return "## AI-budsjett\n\n_Ingen kvote-data ennå — `usage-monitor` har ikke kjørt._";
	}
	const dateOnly = (s) => (s ? s.slice(0, 10) : "?");
	const timeOnly = (s) => (s ? `${s.slice(11, 16)} UTC` : "?");
	const st = EMOJI[state.status] || "";
	const trend = summary?.weekTrend24hPct;
	const trendStr =
		trend == null ? "" : `${trend > 0 ? "↑ +" : trend < 0 ? "↓ −" : "→ "}${Math.abs(trend)}pp siste 24t`;

	const rows = [];
	if (state.week) {
		const detail = [trendStr, state.week.resetsAt ? `nullstilles ${dateOnly(state.week.resetsAt)}` : ""]
			.filter(Boolean)
			.join(" · ");
		rows.push(`| Uke (7d) | **${state.week.percentUsed}%** ${st} | ${detail} |`);
	}
	if (state.session) {
		rows.push(
			`| Sesjon (5t) | ${state.session.percentUsed}% | ${state.session.resetsAt ? `nullstilles ${timeOnly(state.session.resetsAt)}` : ""} |`
		);
	}
	const s7 = summary?.last7d;
	if (s7 && s7.samples) {
		const conserve = (s7.amberHours || 0) + (s7.redHours || 0);
		rows.push(`| Siste 7 dager | topp ${s7.peakWeekPct}% · snitt ${s7.avgWeekPct}% | ${conserve}t i sparemodus |`);
	}

	const stamp = nowIso ? `${nowIso.slice(0, 16).replace("T", " ")} UTC` : "";
	return [
		"## AI-budsjett",
		"",
		"Kvoten er **konto-bred** (delt med interaktiv Claude-bruk) — samlet kvote-trykk, ikke per-agent.",
		"",
		"| Vindu | Brukt | Detaljer |",
		"|---|---|---|",
		...rows,
		"",
		`<sub>Oppdatert ${stamp} av \`usage-monitor\` · kilde: \`docs/data/usage-summary.json\` · [Self-throttling on quota](#self-throttling-on-quota)</sub>`,
	].join("\n");
}

/** Swap the text between START/END markers. Returns null if markers are absent. */
export function replaceBetweenMarkers(text, start, end, replacement) {
	const s = text.indexOf(start);
	const e = text.indexOf(end);
	if (s === -1 || e === -1 || e < s) return null;
	return `${text.slice(0, s + start.length)}\n${replacement}\n${text.slice(e)}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
	const readmePath = path.resolve(process.cwd(), "README.md");
	const dataDir = rootDataPath();
	const summary = readJsonIfExists(path.join(dataDir, "usage-summary.json"));
	const state = readJsonIfExists(path.join(dataDir, "usage-state.json"));
	try {
		const readme = fs.readFileSync(readmePath, "utf8");
		const block = renderStatusBlock(summary, state, iso());
		const updated = replaceBetweenMarkers(readme, START, END, block);
		if (!updated) {
			console.error("STATUS markers not found in README.md — leaving it untouched");
			process.exit(0);
		}
		fs.writeFileSync(readmePath, updated);
		console.log(`README AI-budsjett updated: ${state?.status ?? "no-state"} · week ${state?.week?.percentUsed ?? "?"}%`);
	} catch (e) {
		console.error("update-readme-status failed (best-effort):", e.message);
	}
}
