// sport-icons.test.js — the web sport-glyph registry (app-parity, WP-154), the
// web twin of the iOS SportSymbol table. Pins the alias resolution + that every
// mapped sport yields a well-formed, quiet (never-coloured) SVG.

import { describe, it, expect } from "vitest";
import { ssSportIcon, ssSportIconKey } from "../docs/js/sport-icons.js";

describe("ssSportIconKey", () => {
	it("maps canonical tags + aliases to glyph keys", () => {
		expect(ssSportIconKey("football")).toBe("football");
		expect(ssSportIconKey("soccer")).toBe("football");
		expect(ssSportIconKey("formula1")).toBe("f1");
		expect(ssSportIconKey("F1")).toBe("f1");
		expect(ssSportIconKey("cross-country")).toBe("snow");
		expect(ssSportIconKey("alpine")).toBe("snow");
		expect(ssSportIconKey("ski jumping")).toBe("snow");
		expect(ssSportIconKey("biathlon")).toBe("biathlon");
		expect(ssSportIconKey("chess")).toBe("chess");
	});
	it("falls back for unknown/empty sports (mirrors SportSymbol.fallback)", () => {
		expect(ssSportIconKey("kabaddi")).toBe("fallback");
		expect(ssSportIconKey("")).toBe("fallback");
		expect(ssSportIconKey(null)).toBe("fallback");
	});
});

describe("ssSportIcon", () => {
	it("returns a well-formed, decorative SVG with the row class", () => {
		const svg = ssSportIcon("golf");
		expect(svg).toMatch(/^<svg class="ev-sport"/);
		expect(svg).toContain('viewBox="0 0 24 24"');
		expect(svg).toContain('aria-hidden="true"');
		expect(svg.trim().endsWith("</svg>")).toBe(true);
	});
	it("uses currentColor only — never a hardcoded colour (amber budget untouched)", () => {
		for (const sport of ["football", "golf", "tennis", "cycling", "athletics", "f1", "esports", "chess", "biathlon", "cross-country", "unknown"]) {
			const svg = ssSportIcon(sport);
			expect(svg).toContain("currentColor");
			// No hex / named colours baked into the glyph.
			expect(svg).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
			expect(svg.toLowerCase()).not.toContain("fill=\"amber");
		}
	});
	it("distinct sports get distinct glyphs (golf ≠ f1 ≠ football)", () => {
		expect(ssSportIcon("golf")).not.toBe(ssSportIcon("f1"));
		expect(ssSportIcon("f1")).not.toBe(ssSportIcon("football"));
	});
});
