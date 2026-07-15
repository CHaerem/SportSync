#!/usr/bin/env node
/**
 * Publishes docs/data/manifest.json: one entry per published data file, with
 * `bytes` + `sha256` so a client (the WP-12 SyncClient) can diff its local
 * cache against the server without re-downloading every file on each poll.
 *
 * Deliberately NOT fs mtime: git doesn't preserve file mtimes, so in CI a
 * file's mtime is meaningless (checkout time, not last-content-change time).
 * Hash-diff is the sync contract. If a file happens to carry its own
 * `lastUpdated` field (meta.json, the per-sport fetcher files, …) it's
 * mirrored onto the entry as `sourceLastUpdated` — informational only, never
 * used for diffing.
 *
 * Called directly from build-events.js (last statement in that script's run)
 * rather than wired into static-pipeline.yml as its own step — no workflow
 * change needed, and `.github/workflows/**` is a protected path.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { pathToFileURL } from "url";
import { rootDataPath, iso } from "./lib/helpers.js";

export const MANIFEST_NAME = "manifest.json";

function sha256Hex(buf) {
	return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Which files in dataDir are "published data" — the exact set the manifest
 * covers: every docs/data/*.json (except manifest.json itself) plus
 * events.ics. Never *.jsonl — those are append-only ledgers, not published
 * snapshots a client would sync.
 */
export function listPublishedFiles(dataDir) {
	if (!fs.existsSync(dataDir)) return [];
	return fs
		.readdirSync(dataDir)
		.filter((f) => f !== MANIFEST_NAME && !f.endsWith(".jsonl") && (f.endsWith(".json") || f === "events.ics"))
		.sort();
}

/**
 * Build the manifest object for dataDir. Pure with respect to the
 * filesystem (reads only, never writes). `now` is injectable for
 * deterministic tests. File keys are inserted in sorted order, so
 * JSON.stringify emits a stable, alphabetically-ordered `files` object —
 * the manifest only diffs when content actually changes (generatedAt aside).
 */
export function buildManifest(dataDir, now = Date.now()) {
	const files = {};
	for (const name of listPublishedFiles(dataDir)) {
		const buf = fs.readFileSync(path.join(dataDir, name));
		const entry = { bytes: buf.length, sha256: sha256Hex(buf) };
		if (name.endsWith(".json")) {
			try {
				const parsed = JSON.parse(buf.toString("utf-8"));
				if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.lastUpdated === "string") {
					entry.sourceLastUpdated = parsed.lastUpdated;
				}
			} catch {
				// Not parseable JSON despite the extension — skip the optional mirror,
				// bytes/sha256 above are still correct for whatever's on disk.
			}
		}
		files[name] = entry;
	}
	return {
		generatedAt: iso(now),
		schemaVersion: 1,
		files,
	};
}

/** Build + write manifest.json into dataDir. Returns the manifest object. */
export function writeManifest(dataDir = rootDataPath(), now = Date.now()) {
	const manifest = buildManifest(dataDir, now);
	fs.writeFileSync(path.join(dataDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2));
	return manifest;
}

function main() {
	const manifest = writeManifest();
	console.log(`manifest.json: ${Object.keys(manifest.files).length} file(s) covered.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
	main();
}
