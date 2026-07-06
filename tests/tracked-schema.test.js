// tracked.json is AI-managed but must stay transparent: every entry carries provenance.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const trackedPath = path.resolve(process.cwd(), "scripts", "config", "tracked.json");

describe("tracked.json", () => {
	const tracked = JSON.parse(fs.readFileSync(trackedPath, "utf-8"));

	it("has the expected top-level shape", () => {
		expect(tracked.version).toBeTypeOf("number");
		for (const key of ["leagues", "athletes", "tournaments", "notes"]) {
			expect(Array.isArray(tracked[key]), key).toBe(true);
		}
	});

	it("every entry has id, name, reason, addedAt, addedBy and evidence", () => {
		const entries = [...tracked.leagues, ...tracked.athletes, ...tracked.tournaments];
		expect(entries.length).toBeGreaterThan(0);
		for (const entry of entries) {
			expect(entry.id, JSON.stringify(entry)).toBeTruthy();
			expect(entry.name).toBeTruthy();
			expect(entry.reason).toBeTruthy();
			expect(Number.isNaN(Date.parse(entry.addedAt))).toBe(false);
			expect(entry.addedBy).toBeTruthy();
			expect(Array.isArray(entry.evidence)).toBe(true);
		}
	});

	it("every entry cites its user-owned basis (interests.json# provenance)", () => {
		const entries = [...tracked.leagues, ...tracked.athletes, ...tracked.tournaments];
		for (const entry of entries) {
			const hasProvenance = (entry.evidence || []).some(
				(e) => typeof e === "string" && e.startsWith("interests.json#")
			);
			expect(hasProvenance, `${entry.id}: evidence must cite an interests.json# basis`).toBe(true);
		}
	});

	it("expires timestamps, when present, are valid dates", () => {
		const entries = [...tracked.leagues, ...tracked.athletes, ...tracked.tournaments];
		for (const entry of entries) {
			if (entry.expires) {
				expect(Number.isNaN(Date.parse(entry.expires))).toBe(false);
			}
		}
	});
});
