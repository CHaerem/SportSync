// interests.json is the single user-owned config — CI catches accidental corruption.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { normalizeEntity } from "../scripts/lib/helpers.js";

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

	it("alwaysTrack entries are strings or {name, aliases?, sport?, notify?} objects", () => {
		for (const key of ["athletes", "teams", "tournaments"]) {
			expect(Array.isArray(interests.alwaysTrack[key]), `alwaysTrack.${key}`).toBe(true);
			for (const item of interests.alwaysTrack[key]) {
				// Must coerce to a usable entity (the matcher's contract).
				const e = normalizeEntity(item);
				expect(e, `alwaysTrack.${key} entry ${JSON.stringify(item)}`).not.toBeNull();
				if (typeof item === "object") {
					expect(typeof item.name).toBe("string");
					if (item.aliases != null) {
						expect(Array.isArray(item.aliases)).toBe(true);
						for (const a of item.aliases) expect(typeof a).toBe("string");
					}
					if (item.sport != null) expect(typeof item.sport).toBe("string");
					if (item.notify != null) expect(typeof item.notify).toBe("boolean");
				}
			}
		}
	});

	it("optional notify block, when present, has a positive leadMinutes", () => {
		if (interests.notify == null) return; // optional — user may not have added it yet
		expect(interests.notify).toBeTypeOf("object");
		expect(typeof interests.notify.leadMinutes).toBe("number");
		expect(interests.notify.leadMinutes).toBeGreaterThan(0);
	});

	it("has at least one interest defined", () => {
		expect(interests.interests.length).toBeGreaterThan(0);
	});
});
