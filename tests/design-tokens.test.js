// design/tokens.json coherence gate (WP-97 · Design-biblioteket): the token
// library LOCKS today's shipped reality — it does not change it. This test
// verifies the same three surfaces the file itself claims to synchronise:
//   (a) tokens.json parses and has the expected shape
//   (b) docs/css/base.css custom properties match the token hex values per theme
//   (c) ios/Sportivista/DesignTokens.swift's semantic colour mappings match
//       the token's documented `ios` semantic name (source-grep, same style as
//       the HIG CI gate in tests/ios-dynamic-type-gate.test.js — this repo does
//       not compile Swift in CI, so coherence is verified via source text)
//   (d) DESIGN.md § Tokens prose table matches the token's hex values — DESIGN.md
//       is the prose fasit, tokens.json is the machine-readable one; they must agree
//
// Any drift on any of the three surfaces is a real product bug (a rebrand or a
// one-off CSS edit silently diverging from the documented contract) and must
// fail CI, not be "fixed" by this test.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const tokens = JSON.parse(fs.readFileSync(path.join(ROOT, "design", "tokens.json"), "utf-8"));
const baseCss = fs.readFileSync(path.join(ROOT, "docs", "css", "base.css"), "utf-8");
const designTokensSwift = fs.readFileSync(
	path.join(ROOT, "ios", "Sportivista", "DesignTokens.swift"),
	"utf-8"
);
const designMd = fs.readFileSync(path.join(ROOT, "DESIGN.md"), "utf-8");

/** Read `key: { $value }` for a colour token in a given theme, tolerating $extensions.web == null. */
function colorValue(key, theme) {
	const t = tokens.color[key];
	if (!t) throw new Error(`no such color token: ${key}`);
	return t[theme].$value;
}

describe("design/tokens.json — shape", () => {
	it("parses and has the expected top-level groups", () => {
		for (const group of ["color", "typography", "spacing", "radius", "layout"]) {
			expect(tokens[group], group).toBeTruthy();
		}
	});

	it("every color token declares both a dark and a light $value", () => {
		for (const [name, t] of Object.entries(tokens.color)) {
			if (name.startsWith("$")) continue; // group-level metadata (e.g. $description), not a token
			expect(t.dark?.$value, `${name}.dark`).toBeTruthy();
			expect(t.light?.$value, `${name}.light`).toBeTruthy();
			expect(t.$type, `${name}.$type`).toBe("color");
		}
	});
});

describe("design/tokens.json ⇄ docs/css/base.css", () => {
	// base.css custom properties this test can verify directly against a hex/rgba
	// literal (skips tokens the file itself documents as web-absent, e.g. cell2,
	// destructive — see each token's $extensions.sportivista.discrepancy).
	const cssVarByToken = {
		background: "--bg",
		groupedBackground: "--bg",
		cell: "--surface",
		label: "--fg",
		secondaryLabel: "--fg-2",
		tertiaryLabel: "--fg-3",
		separator: "--line",
		accent: "--accent",
		accentInk: "--accent-ink",
		live: "--live",
	};

	/** Extract `--var: value;` from a `:root { ... }` or `:root[data-theme="light"] { ... }` block. */
	function cssVarValue(cssVar, theme) {
		const block =
			theme === "dark"
				? baseCss.match(/:root\s*\{([^}]*)\}/s)?.[1]
				: baseCss.match(/:root\[data-theme="light"\]\s*\{([^}]*)\}/s)?.[1];
		expect(block, `${theme} :root block found in base.css`).toBeTruthy();
		const m = block.match(new RegExp(`${cssVar}:\\s*([^;]+);`));
		expect(m, `${cssVar} declared in ${theme} block`).toBeTruthy();
		return m[1].trim();
	}

	for (const theme of ["dark", "light"]) {
		for (const [token, cssVar] of Object.entries(cssVarByToken)) {
			it(`${theme}: ${token} (${cssVar}) matches base.css`, () => {
				expect(cssVarValue(cssVar, theme)).toBe(colorValue(token, theme));
			});
		}
	}
});

describe("design/tokens.json ⇄ ios/Sportivista/DesignTokens.swift", () => {
	// Semantic-colour source grep: each entry maps a token to the Swift line that
	// must be present verbatim (the UIColor case name the token documents as
	// `$extensions.sportivista.ios`, or the literal hex pair for accent/live/destructive).
	const semanticChecks = [
		{ token: "background", needle: "static let background = Color(uiColor: .systemGroupedBackground)" },
		{ token: "groupedBackground", needle: "static let groupedBackground = Color(uiColor: .systemGroupedBackground)" },
		{ token: "cell", needle: "static let cell = Color(uiColor: .secondarySystemGroupedBackground)" },
		{ token: "cell2", needle: "static let cell2 = Color(uiColor: .tertiarySystemBackground)" },
		{ token: "label", needle: "static let label = Color(uiColor: .label)" },
		{ token: "secondaryLabel", needle: "static let secondaryLabel = Color(uiColor: .secondaryLabel)" },
		{ token: "separator", needle: "static let separator = Color(uiColor: .separator)" },
	];

	for (const { token, needle } of semanticChecks) {
		it(`${token}: DesignTokens.swift declares the documented semantic mapping`, () => {
			expect(
				designTokensSwift.includes(needle),
				`expected DesignTokens.swift to contain:\n  ${needle}`
			).toBe(true);
		});
	}

	// accent / live / destructive carry explicit hex (not a system colour) — verify
	// the literal 0xRRGGBB pairs match tokens.json's dark/light $value.
	const explicitHexChecks = [
		{ token: "accent", swiftName: "accent" },
		{ token: "live", swiftName: "live" },
		{ token: "destructive", swiftName: "destructive" },
	];

	function hexPairFor(swiftName) {
		const re = new RegExp(
			`static let ${swiftName} = Color\\.sportivista\\(dark: Color\\(hex: 0x([0-9A-Fa-f]{6})\\), light: Color\\(hex: 0x([0-9A-Fa-f]{6})\\)\\)`
		);
		const m = designTokensSwift.match(re);
		expect(m, `${swiftName} hex pair found in DesignTokens.swift`).toBeTruthy();
		return { dark: `#${m[1].toUpperCase()}`, light: `#${m[2].toUpperCase()}` };
	}

	for (const { token, swiftName } of explicitHexChecks) {
		it(`${token}: DesignTokens.swift hex literals match tokens.json`, () => {
			const { dark, light } = hexPairFor(swiftName);
			expect(dark).toBe(colorValue(token, "dark"));
			expect(light).toBe(colorValue(token, "light"));
		});
	}

	// tertiaryLabel is NOT in the SportivistaTokens enum (views call
	// Color(uiColor: .tertiaryLabel) directly) — tokens.json documents this gap
	// explicitly; assert the gap itself hasn't silently closed or widened, so a
	// change either way is a deliberate edit to this test, not an accident.
	it("tertiaryLabel: still bypasses the token enum today (documented gap, not a silent add)", () => {
		expect(designTokensSwift.includes("static let tertiaryLabel")).toBe(false);
		expect(designTokensSwift.includes(".tertiaryLabel")).toBe(false); // not even referenced in this file
	});

	// Spacing scale: verify SportivistaSpacing literals match tokens.json.spacing.
	const spacingChecks = [
		["xs", "4"],
		["s", "8"],
		["m", "12"],
		["l", "16"],
		["xl", "24"],
		["xxl", "32"],
	];
	for (const [key, cgFloat] of spacingChecks) {
		it(`spacing.${key}: DesignTokens.swift SportivistaSpacing matches tokens.json`, () => {
			const re = new RegExp(`static let ${key}: CGFloat = ${cgFloat}\\b`);
			expect(designTokensSwift.match(re), `SportivistaSpacing.${key} == ${cgFloat}`).toBeTruthy();
			expect(tokens.spacing[key].$value).toBe(`${cgFloat}px`);
		});
	}
});

describe("design/tokens.json ⇄ DESIGN.md § Tokens (prose fasit)", () => {
	// DESIGN.md's colour table is `| token | rolle | mørk | lys |` markdown rows.
	// Verify each documented hex pair matches tokens.json (skip rows the table
	// doesn't literally give a hex for, e.g. `live`/`good` share one row).
	const rows = [
		{ token: "background", md: "background" },
		{ token: "groupedBackground", md: "groupedBackground" },
		{ token: "cell", md: "cell" },
		{ token: "cell2", md: "cell2" },
		{ token: "label", md: "label" },
		{ token: "accent", md: "accent" },
		{ token: "destructive", md: "destructive" },
	];

	function mdRowHexes(mdToken) {
		const re = new RegExp(
			"\\|\\s*(?:\\*\\*)?`" + mdToken + "`(?:\\*\\*)?\\s*\\|[^|]*\\|\\s*`([^`]+)`\\s*\\|\\s*`([^`]+)`\\s*\\|"
		);
		const m = designMd.match(re);
		expect(m, `DESIGN.md § Tokens row for \`${mdToken}\` found`).toBeTruthy();
		return { dark: m[1], light: m[2] };
	}

	for (const { token, md } of rows) {
		it(`${token}: DESIGN.md § Farge row matches tokens.json`, () => {
			const { dark, light } = mdRowHexes(md);
			expect(dark).toBe(colorValue(token, "dark"));
			expect(light).toBe(colorValue(token, "light"));
		});
	}

	it("DESIGN.md § Tokens references design/tokens.json as the machine-readable fasit", () => {
		expect(designMd.includes("design/tokens.json")).toBe(true);
	});
});

describe("red-proof: this suite fails on a real value drift (see PR description for the mutate/revert transcript)", () => {
	// This is not a live mutation test (that would need a scratch copy of
	// base.css + DesignTokens.swift + DESIGN.md re-required mid-suite, which
	// vitest's ESM module cache makes brittle). Instead it asserts the exact
	// invariant whose violation the suite above is built to catch: token hex
	// equality across all three surfaces for the accent colour, the one token
	// every surface renders identically today. If this passes while any of the
	// three sources is hand-edited to a different hex, the suite above already
	// caught it in its own per-surface assertions (each is independently red on
	// a mismatch, per the PR's documented mutate/run/revert proof).
	it("accent hex is identical across tokens.json, base.css, DesignTokens.swift and DESIGN.md", () => {
		const fromTokens = { dark: colorValue("accent", "dark"), light: colorValue("accent", "light") };
		const cssBlockDark = baseCss.match(/:root\s*\{([^}]*)\}/s)[1];
		const cssBlockLight = baseCss.match(/:root\[data-theme="light"\]\s*\{([^}]*)\}/s)[1];
		const fromCss = {
			dark: cssBlockDark.match(/--accent:\s*([^;]+);/)[1].trim(),
			light: cssBlockLight.match(/--accent:\s*([^;]+);/)[1].trim(),
		};
		const swiftMatch = designTokensSwift.match(
			/static let accent = Color\.sportivista\(dark: Color\(hex: 0x([0-9A-Fa-f]{6})\), light: Color\(hex: 0x([0-9A-Fa-f]{6})\)\)/
		);
		const fromSwift = { dark: `#${swiftMatch[1].toUpperCase()}`, light: `#${swiftMatch[2].toUpperCase()}` };
		const mdMatch = designMd.match(
			/\|\s*\*\*`accent`\*\*[^|]*\|[^|]*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/
		);
		const fromMd = { dark: mdMatch[1], light: mdMatch[2] };

		expect(fromCss).toEqual(fromTokens);
		expect(fromSwift).toEqual(fromTokens);
		expect(fromMd).toEqual(fromTokens);
	});
});
