#!/usr/bin/env node
import path from "path";
import {
	readJsonIfExists,
	mergePrimaryAndOpen,
	writeJsonPretty,
	hasEvents,
	rootDataPath,
	iso,
} from "./lib/helpers.js";

const dataDir = rootDataPath();

const pairs = [
	{
		primary: "football.json",
		open: "football-open.json",
		out: "football.json",
	},
	{ primary: "f1.json", open: "f1-open.json", out: "f1.json" },
	{ primary: "chess.json", open: "chess-open.json", out: "chess.json" },
	{ primary: "esports.json", open: "esports-open.json", out: "esports.json" },
];

let changes = [];
for (const p of pairs) {
	const primaryPath = path.join(dataDir, p.primary);
	const openPath = path.join(dataDir, p.open);
	const outPath = path.join(dataDir, p.out);
	const primary = readJsonIfExists(primaryPath);
	const open = readJsonIfExists(openPath);
	const merged = mergePrimaryAndOpen(primary, open);
	if (merged) {
		writeJsonPretty(outPath, merged);
		changes.push({
			file: p.out,
			primaryEvents: primary && hasEvents(primary),
			openEvents: open && hasEvents(open),
			mergedEvents: hasEvents(merged),
		});
	}
}

// Update meta with merged flag
const metaPath = path.join(dataDir, "meta.json");
const meta = readJsonIfExists(metaPath) || { lastUpdate: iso() };
meta.merged = true;
writeJsonPretty(metaPath, meta);

console.log("Merged data sets:", changes);
