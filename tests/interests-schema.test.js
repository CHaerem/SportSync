// interests.json is the single user-owned config — CI catches accidental corruption.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const interestsPath = path.resolve(process.cwd(), "scripts", "config", "interests.json");

describe("interests.json", () => {
	const interests = JSON.parse(fs.readFileSync(interestsPath, "utf-8"));

	it("has valid JSON with the expected top-level shape", () => {
		expect(interests.language).toBeTruthy();
		expect(interests.timezone).toBe("Europe/Oslo");
		expect(interests.alwaysTrack).toBeTypeOf("object");
		expect(Array.isArray(interests.interests)).toBe(true);
		expect(Array.isArray(interests.neverTrack)).toBe(true);
	});

	it("alwaysTrack contains athletes, teams and tournaments arrays of strings", () => {
		for (const key of ["athletes", "teams", "tournaments"]) {
			expect(Array.isArray(interests.alwaysTrack[key]), `alwaysTrack.${key}`).toBe(true);
			for (const item of interests.alwaysTrack[key]) {
				expect(typeof item).toBe("string");
			}
		}
	});

	it("has at least one interest defined", () => {
		expect(interests.interests.length).toBeGreaterThan(0);
	});
});
