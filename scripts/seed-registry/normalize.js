#!/usr/bin/env node
/**
 * WP-185: `npm run seed:registry:normalize` — the NETWORK-FREE half of the
 * re-seed.
 *
 * `npm run seed:registry` converges a file's identity metadata as a side effect
 * of hitting its source (mergeRegistry normalises existing rows too), but four
 * of the nine sources are expensive or fragile to re-hit just to reformat a
 * field: Wikidata SPARQL (cycling/winter/handball/athletics — heavy queries that
 * 429 back-to-back), FIDE's HTML top lists, and Liquipedia (asks for ~30 s
 * between parse requests). Re-running them would also fold in a month of
 * unrelated world drift into a presentation PR.
 *
 * So this pass re-reads each registry file, folds every entity through
 * `normalizeIdentity` (ISO 3166 country, canonical `#rrggbb` colours) and
 * re-serializes deterministically. Pure local I/O, idempotent, and it touches
 * nothing else — same merge/serialize code path as a real seed, minus the fetch.
 *
 * Colours can only ARRIVE from a real seed (only ESPN publishes them today), so
 * this is normalisation, never enrichment.
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { readJsonIfExists } from "../lib/helpers.js";
import { toIsoCountry } from "../lib/country.js";
import { mergeRegistry, serializeRegistry } from "./seed-lib.js";
import { registryDirPath, reservedSlugsFor } from "./index.js";

/** Normalise one already-written registry file in place. Returns a small report. */
export function normalizeRegistryFile(registryDir, file) {
	const target = path.join(registryDir, file);
	const data = readJsonIfExists(target);
	if (!data?.entities) return null;
	const dropped = data.entities.filter((e) => e.country && !toIsoCountry(e.country)).map((e) => `${e.id} (${e.country})`);
	const merged = mergeRegistry(data.entities, [], reservedSlugsFor(registryDir, file));
	const meta = { $schema: data.$schema, source: data.source, notes: data.notes };
	const before = fs.readFileSync(target, "utf-8");
	const after = serializeRegistry(meta, merged);
	if (after !== before) fs.writeFileSync(target, after);
	return {
		file,
		changed: after !== before,
		total: merged.length,
		withCountry: merged.filter((e) => e.country).length,
		withColors: merged.filter((e) => e.colors).length,
		dropped,
	};
}

function main() {
	const registryDir = registryDirPath();
	const files = fs.readdirSync(registryDir).filter((f) => f.endsWith(".json")).sort();
	for (const file of files) {
		const r = normalizeRegistryFile(registryDir, file);
		if (!r) continue;
		console.log(
			`registry/${r.file}: ${r.total} entiteter — ${r.withCountry} med ISO-land, ${r.withColors} med farger${r.changed ? "" : " (uendret)"}` +
				(r.dropped.length ? `\n  droppet ukjent land: ${r.dropped.join(", ")}` : "")
		);
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
