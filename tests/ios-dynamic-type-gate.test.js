// HIG coherence gate (DESIGN.md § HIG-samsvar → "Dynamic Type" checkbox):
//
//   "all tekst via tekststiler; ingen isolert `.system(size:)`.
//    CI-gate: en test feiler på nye faste størrelser i `Zenji/`."
//
// The iOS baseline binds every text role to a Dynamic Type text style via
// `Font.zenji(_:weight:)` / `Font.zenjiTabular(...)`. A fixed point size
// (`Font.system(size: 13)`) ignores the user's Dynamic Type setting and is
// barred. The WP-80→WP-85 migration also removed the `zenjiMono(size:)` shim,
// which was the last fixed-size font; nothing may reintroduce it.
//
// This gate greps the source (it cannot run on-device), so it catches future
// bloat in CI rather than after ship. Legitimate exceptions live in an explicit,
// commented whitelist below.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Scan the app AND the WidgetKit extension — DESIGN.md § Cross-surface binds
// both to the baseline (the widget was migrated in WP-84), so the gate must
// cover ios/ZenjiWidget too, not just the app tree.
const SCAN_DIRS = [
	path.resolve(process.cwd(), "ios", "Zenji"),
	path.resolve(process.cwd(), "ios", "ZenjiWidget"),
];

// Explicit whitelist of legitimate fixed-size call sites. Each entry is
// { file, needle, reason } — a line in `file` whose text includes `needle` is
// exempt. Keep this list SHORT and justified: a fixed size is only acceptable
// for a deliberately non-scaling decorative surface (never body/label text).
// Empty today — the baseline has no fixed-size text.
const SYSTEM_SIZE_WHITELIST = [
	// Example shape (leave commented until a real exception is needed):
	// { file: "ZenjiWidget/SomeGlyph.swift", needle: ".system(size: 8)", reason: "..." },
];

/** Recursively collect every .swift file under a directory. */
function swiftFiles(dir) {
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...swiftFiles(full));
		else if (entry.name.endsWith(".swift")) out.push(full);
	}
	return out;
}

// A real fixed-size font call — SwiftUI `.system(size:` or the UIKit
// `systemFont(ofSize:` — followed by an ARGUMENT (a digit OR a named constant).
// A bare `.system(size:)` with no argument (a doc-comment mention, e.g. in
// DesignTokens.swift) is NOT matched, since `[^)\s]` requires a real argument
// char that is neither the closing paren nor whitespace.
const FIXED_SIZE = /(?:\.system\(size:|systemFont\(ofSize:)\s*[^)\s]/;
const SHIM = /zenjiMono\(size:/;

describe("iOS Dynamic Type HIG gate", () => {
	const files = SCAN_DIRS.flatMap(swiftFiles);

	it("finds the iOS source tree", () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it("no view reintroduces the removed zenjiMono(size:) shim", () => {
		const offenders = [];
		for (const file of files) {
			const lines = fs.readFileSync(file, "utf-8").split("\n");
			lines.forEach((line, i) => {
				if (SHIM.test(line)) {
					offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}: ${line.trim()}`);
				}
			});
		}
		expect(offenders, `zenjiMono(size:) was removed in WP-85 — use Font.zenji / Font.zenjiTabular:\n${offenders.join("\n")}`).toEqual([]);
	});

	it("no view uses a fixed .system(size:) point that bypasses Dynamic Type", () => {
		const offenders = [];
		for (const file of files) {
			const rel = path.relative(process.cwd(), file);
			const lines = fs.readFileSync(file, "utf-8").split("\n");
			lines.forEach((line, i) => {
				if (!FIXED_SIZE.test(line)) return;
				const whitelisted = SYSTEM_SIZE_WHITELIST.some(
					(w) => rel.endsWith(w.file) && line.includes(w.needle)
				);
				if (!whitelisted) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
			});
		}
		expect(offenders, `Fixed .system(size:) ignores Dynamic Type — bind to a text style via Font.zenji(_:weight:), or whitelist with a reason:\n${offenders.join("\n")}`).toEqual([]);
	});
});
