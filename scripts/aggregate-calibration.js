#!/usr/bin/env node
/**
 * Mechanically aggregates the calibration ledger (appended by the verify agent,
 * one JSON line per source check) into per-source trust stats the research
 * agent reads when choosing sources.
 *
 *   docs/data/calibration-ledger.jsonl  →  docs/data/calibration.json
 *
 * Ledger record shape (written by verify.md):
 *   { "checkedAt": ISO, "sport": "golf", "source": "pgatour.com",
 *     "field": "time"|"streaming"|"existence", "agreed": true|false,
 *     "boardWasProvisional": true, "note": "..." }
 *
 * `boardWasProvisional` (optional) distinguishes the two very different meanings of
 * `agreed: false`: (a) the SOURCE was wrong (it disagreed with a value we had good
 * reason to trust) vs (b) the source CORRECTED a value that was only ever an estimate
 * (medium/low confidence, a standard-slot guess, a provisional time). A correction is
 * the source being *right* — penalising it inverts the signal (this is why the official
 * TdF source cyclingstage.com scored 0.27: every time it fixed our provisional stage
 * time we counted it as a strike). When `boardWasProvisional: true` and `agreed: false`,
 * we treat the check as agreement (the source proved reliable) and track it separately
 * as a `correction`. Records without the field behave exactly as before (back-compat).
 *
 * No LLM here — pure counting. The research agent interprets the stats.
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { rootDataPath, writeJsonPretty, iso, MS_PER_DAY } from "./lib/helpers.js";

const WINDOW_DAYS = 180; // old lessons decay out of the stats

/** Normalize "https://www.pgatour.com/x", "www.pgatour.com" and "pgatour.com" to one key. */
export function normalizeSource(source) {
	let s = String(source).trim().toLowerCase();
	if (s.includes("://")) {
		try {
			s = new URL(s).hostname;
		} catch {
			s = s.split("://")[1] || s;
		}
	}
	return s.split("/")[0].replace(/^www\./, "");
}

export function aggregate(lines, now = Date.now()) {
	const cutoff = now - WINDOW_DAYS * MS_PER_DAY;
	const sources = {};
	let used = 0;
	let skipped = 0;

	for (const line of lines) {
		let rec;
		try {
			rec = JSON.parse(line);
		} catch {
			skipped++;
			continue;
		}
		if (!rec || !rec.source || typeof rec.agreed !== "boolean") {
			skipped++;
			continue;
		}
		const t = Date.parse(rec.checkedAt);
		if (Number.isNaN(t) || t < cutoff) {
			skipped++;
			continue;
		}
		used++;
		const key = normalizeSource(rec.source);
		if (!sources[key]) {
			sources[key] = { checks: 0, agreed: 0, corrections: 0, bySport: {}, byField: {}, lastChecked: null };
		}
		const s = sources[key];
		// A disagreement against a value we ourselves flagged as provisional is the source
		// CORRECTING us — count it as agreement (reliability) and tally it as a correction.
		const corrected = rec.agreed === false && rec.boardWasProvisional === true;
		const effectiveAgreed = rec.agreed === true || corrected;
		s.checks++;
		if (effectiveAgreed) s.agreed++;
		if (corrected) s.corrections++;
		if (rec.sport) {
			s.bySport[rec.sport] = s.bySport[rec.sport] || { checks: 0, agreed: 0 };
			s.bySport[rec.sport].checks++;
			if (effectiveAgreed) s.bySport[rec.sport].agreed++;
		}
		if (rec.field) {
			s.byField[rec.field] = s.byField[rec.field] || { checks: 0, agreed: 0 };
			s.byField[rec.field].checks++;
			if (effectiveAgreed) s.byField[rec.field].agreed++;
		}
		if (!s.lastChecked || Date.parse(rec.checkedAt) > Date.parse(s.lastChecked)) {
			s.lastChecked = rec.checkedAt;
		}
	}

	// Reliability only shown with a minimum sample — avoid overclaiming from 1-2 checks
	for (const s of Object.values(sources)) {
		s.reliability = s.checks >= 5 ? Math.round((s.agreed / s.checks) * 100) / 100 : null;
	}

	return {
		generatedAt: iso(now),
		windowDays: WINDOW_DAYS,
		records: { used, skipped },
		sources,
	};
}

function main() {
	const dataDir = rootDataPath();
	const ledgerPath = path.join(dataDir, "calibration-ledger.jsonl");
	if (!fs.existsSync(ledgerPath)) {
		console.log("No calibration ledger yet — skipping aggregation.");
		return;
	}
	const lines = fs.readFileSync(ledgerPath, "utf-8").split("\n").filter(Boolean);
	const result = aggregate(lines);
	writeJsonPretty(path.join(dataDir, "calibration.json"), result);
	console.log(
		`Calibration: ${result.records.used} records → ${Object.keys(result.sources).length} source(s) (${result.records.skipped} skipped)`
	);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
	main();
}
