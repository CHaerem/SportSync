// HIG coherence gate (DESIGN.md § HIG-samsvar → "Dynamic Type" checkbox):
//
//   "all tekst via tekststiler; ingen isolert `.system(size:)`.
//    CI-gate: en test feiler på nye faste størrelser i `Sportivista/`."
//
// The iOS baseline binds every text role to a Dynamic Type text style via
// `Font.sportivista(_:weight:)` / `Font.sportivistaTabular(...)`. A fixed point
// size (`Font.system(size: 13)`) ignores the user's Dynamic Type setting and is
// barred. The WP-80→WP-85 migration also removed the `zenjiMono(size:)` shim,
// which was the last fixed-size font; nothing may reintroduce it — the tripwire
// keeps the historical `zenjiMono` name AND guards the post-rename
// `sportivistaMono` spelling.
//
// This gate greps the source (it cannot run on-device), so it catches future
// bloat in CI rather than after ship. Legitimate exceptions live in an explicit,
// commented whitelist below.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Scan the app AND the WidgetKit extension — DESIGN.md § Cross-surface binds
// both to the baseline (the widget was migrated in WP-84), so the gate must
// cover ios/SportivistaWidget too, not just the app tree.
const SCAN_DIRS = [
	path.resolve(process.cwd(), "ios", "Sportivista"),
	path.resolve(process.cwd(), "ios", "SportivistaWidget"),
];

// Explicit whitelist of legitimate fixed-size call sites. Each entry is
// { file, needle, reason } — a line in `file` whose text includes `needle` is
// exempt. Keep this list SHORT and justified: a fixed size is only acceptable
// for a deliberately non-scaling decorative surface (never body/label text).
// Empty today — the baseline has no fixed-size text.
const SYSTEM_SIZE_WHITELIST = [
	// Example shape (leave commented until a real exception is needed):
	// { file: "SportivistaWidget/SomeGlyph.swift", needle: ".system(size: 8)", reason: "..." },
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
const SHIM = /(?:zenji|sportivista)Mono\(size:/;

// WP-134 — the SIBLING bug class to fixed-size fonts: a scaling SF Symbol or a
// decorative glyph pinned inside a HARDCODED `.frame(width: <number>)`. The glyph
// grows with Dynamic Type but its box does NOT, so at Accessibility sizes the
// symbol overflows its column and collides with the neighbouring text (the agenda
// tid/symbol/tittel-overlapp). The fix is `@ScaledMetric` so the column scales in
// lock-step with the font. This gate flags the regression.
//
// `.frame(width: <digit>` — a NUMERIC LITERAL width. `.frame(width: symbolWidth)`
// (a `@ScaledMetric`-backed variable, the correct pattern) begins with a letter,
// so it is deliberately NOT matched: the rule bars only the hardcoded form.
const FRAME_WIDTH_LITERAL = /\.frame\(\s*width:\s*\d/;
// An SF Symbol subject — unambiguously an icon that scales with its font.
const SF_SYMBOL_SUBJECT = /Image\(\s*systemName:/;

// Resolve the view expression a `.frame(...)` modifies. Two shapes:
//   • INLINE chain root on the same line (`Circle().fill(…).frame(width: 5)`):
//     the subject is the text before `.frame`.
//   • `.frame` as its own chained modifier line: walk BACKWARDS over the chain
//     (lines whose trimmed text starts with `.`) to the first line that does not
//     — that view line is the subject.
// (House style is a single-line subject — `Image(systemName: …)` / `Text("•")`;
// a rare multi-line subject resolves to a non-matching line and is safely skipped
// rather than mis-flagged.)
function subjectFor(lines, frameIdx) {
	const line = lines[frameIdx];
	const before = line.slice(0, line.indexOf(".frame")).trim();
	if (before !== "" && !before.startsWith(".")) return before; // inline root
	for (let j = frameIdx - 1; j >= 0; j--) {
		if (lines[j].trim().startsWith(".")) continue;
		return lines[j];
	}
	return "";
}

// A DECORATIVE GLYPH `Text` — a marker built from single-character string
// literals only (`Text("»")`, `Text(applied ? "•" : "+")`). Such a glyph scales
// with its font exactly like an SF Symbol, so a hardcoded frame width clips it.
// A `Text(variable)` label column (e.g. the Eval category `Text(cat.category)`)
// has NO string literal and is deliberately excluded, so a legitimately
// fixed-width text column is never a false positive.
function isDecorativeGlyphText(subjectLine) {
	const m = subjectLine.match(/\bText\((.*)\)/);
	if (!m) return false;
	const inner = m[1];
	if (inner.includes("\\(")) return false; // interpolation ⇒ dynamic content, not a glyph
	const literals = inner.match(/"[^"]*"/g);
	if (!literals || literals.length === 0) return false; // Text(variable) ⇒ label column, not a glyph
	// Every literal is a single character (length 3 incl. the two quote marks).
	return literals.every((lit) => lit.length === 3);
}

describe("iOS Dynamic Type HIG gate", () => {
	const files = SCAN_DIRS.flatMap(swiftFiles);

	it("finds the iOS source tree", () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it("no view reintroduces the removed zenjiMono/sportivistaMono(size:) shim", () => {
		const offenders = [];
		for (const file of files) {
			const lines = fs.readFileSync(file, "utf-8").split("\n");
			lines.forEach((line, i) => {
				if (SHIM.test(line)) {
					offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}: ${line.trim()}`);
				}
			});
		}
		expect(offenders, `zenjiMono/sportivistaMono(size:) was removed in WP-85 — use Font.sportivista / Font.sportivistaTabular:\n${offenders.join("\n")}`).toEqual([]);
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
		expect(offenders, `Fixed .system(size:) ignores Dynamic Type — bind to a text style via Font.sportivista(_:weight:), or whitelist with a reason:\n${offenders.join("\n")}`).toEqual([]);
	});

	// WP-134 — the SF-Symbol/glyph frame-width rule (sibling of the font rule).
	//
	// RULE: an SF Symbol (`Image(systemName:)`) or a decorative glyph `Text`
	// (single-character literals only) MUST NOT sit in a HARDCODED numeric
	// `.frame(width: N)` — the glyph scales with Dynamic Type but the box does
	// not, so at Accessibility sizes the symbol overflows and overlaps its
	// neighbours (the agenda tid/symbol/tittel-overlapp WP-134 fixed). Use
	// `@ScaledMetric(relativeTo: <textStyle>)` so the column scales with the font;
	// `.frame(width: symbolWidth)` (a variable) is the accepted form and passes.
	//
	// PRECISION (only icon/glyph frames, never arbitrary frames): a decorative
	// dot (`Circle().frame(width: 6, height: 6)`), a fixed QR image
	// (`Image(uiImage:).frame(width: 180 …)`), and a fixed text-label COLUMN
	// (`Text(variable).frame(width: 110 …)`) are all correctly NOT flagged —
	// their subject is neither an SF Symbol nor a single-character glyph literal.
	it("no SF Symbol / decorative glyph is pinned in a hardcoded frame width (must @ScaledMetric)", () => {
		const offenders = [];
		for (const file of files) {
			const rel = path.relative(process.cwd(), file);
			const lines = fs.readFileSync(file, "utf-8").split("\n");
			lines.forEach((line, i) => {
				if (!FRAME_WIDTH_LITERAL.test(line)) return;
				const subject = subjectFor(lines, i);
				const isIconOrGlyph =
					SF_SYMBOL_SUBJECT.test(subject) || isDecorativeGlyphText(subject);
				if (isIconOrGlyph) {
					offenders.push(`${rel}:${i + 1}: ${line.trim()}  (subject: ${subject.trim()})`);
				}
			});
		}
		expect(offenders, `SF Symbols / glyph markers scale with Dynamic Type — a hardcoded frame width clips them at Accessibility sizes. Use @ScaledMetric(relativeTo: <textStyle>) for the column width:\n${offenders.join("\n")}`).toEqual([]);
	});
});
