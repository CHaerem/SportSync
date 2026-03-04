import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Set up browser-like environment
globalThis.window = globalThis;

// Load sport-config.js (browser script, defines globals)
const src = readFileSync(
	join(import.meta.dirname, "../docs/js/sport-config.js"),
	"utf-8"
);
eval(src);

describe("sport-config.js normalization", () => {
	describe("normalizeClientSportId()", () => {
		it("converts f1 to formula1", () => {
			expect(normalizeClientSportId("f1")).toBe("formula1");
		});

		it("passes through canonical IDs unchanged", () => {
			expect(normalizeClientSportId("football")).toBe("football");
			expect(normalizeClientSportId("golf")).toBe("golf");
			expect(normalizeClientSportId("tennis")).toBe("tennis");
			expect(normalizeClientSportId("formula1")).toBe("formula1");
			expect(normalizeClientSportId("chess")).toBe("chess");
			expect(normalizeClientSportId("esports")).toBe("esports");
		});

		it("handles cycling aliases", () => {
			expect(normalizeClientSportId("road cycling")).toBe("cycling");
			expect(normalizeClientSportId("classics")).toBe("cycling");
			expect(normalizeClientSportId("tour")).toBe("cycling");
		});

		it("passes through unknown IDs unchanged", () => {
			expect(normalizeClientSportId("handball")).toBe("handball");
			expect(normalizeClientSportId("basketball")).toBe("basketball");
		});

		it("handles null/undefined", () => {
			expect(normalizeClientSportId(null)).toBeNull();
			expect(normalizeClientSportId(undefined)).toBeUndefined();
		});
	});

	describe("normalizePipelineSportId()", () => {
		it("converts formula1 to f1", () => {
			expect(normalizePipelineSportId("formula1")).toBe("f1");
		});

		it("converts cycling to its first alias", () => {
			expect(normalizePipelineSportId("cycling")).toBe("cycling");
		});

		it("passes through IDs with no aliases unchanged", () => {
			expect(normalizePipelineSportId("football")).toBe("football");
			expect(normalizePipelineSportId("golf")).toBe("golf");
			expect(normalizePipelineSportId("tennis")).toBe("tennis");
			expect(normalizePipelineSportId("chess")).toBe("chess");
			expect(normalizePipelineSportId("esports")).toBe("esports");
		});

		it("passes through unknown IDs unchanged", () => {
			expect(normalizePipelineSportId("handball")).toBe("handball");
		});

		it("handles null/undefined", () => {
			expect(normalizePipelineSportId(null)).toBeNull();
			expect(normalizePipelineSportId(undefined)).toBeUndefined();
		});
	});

	describe("roundtrip consistency", () => {
		it("f1 → formula1 → f1", () => {
			const client = normalizeClientSportId("f1");
			expect(client).toBe("formula1");
			const pipeline = normalizePipelineSportId(client);
			expect(pipeline).toBe("f1");
		});

		it("canonical IDs roundtrip unchanged", () => {
			for (const id of [
				"football",
				"golf",
				"tennis",
				"chess",
				"esports",
			]) {
				expect(normalizeClientSportId(id)).toBe(id);
				expect(normalizePipelineSportId(id)).toBe(id);
			}
		});
	});

	describe("getSportDisplayName with aliases", () => {
		it("resolves f1 alias to F1 display", () => {
			expect(getSportDisplayName("f1")).toContain("F1");
		});

		it("resolves canonical IDs", () => {
			expect(getSportDisplayName("football")).toContain("Football");
			expect(getSportDisplayName("golf")).toContain("Golf");
		});
	});
});
