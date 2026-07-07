// interests.json is the single user-owned config — CI catches accidental corruption.
// The SAME schema file that gives github.dev autocomplete/validation is the CI
// contract here, via a tiny dependency-free validator (the project stays dep-free).
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { normalizeEntity } from "../scripts/lib/helpers.js";
import { validateAgainstSchema } from "../scripts/lib/validate-schema.js";

const configDir = path.resolve(process.cwd(), "scripts", "config");
const interests = JSON.parse(fs.readFileSync(path.join(configDir, "interests.json"), "utf-8"));
const schema = JSON.parse(fs.readFileSync(path.join(configDir, "interests.schema.json"), "utf-8"));

// The same schema drives github.dev autocomplete AND this CI check, via the shared
// dependency-free validator in scripts/lib/validate-schema.js.
const validate = (data) => validateAgainstSchema(data, schema, schema);

describe("interests.json against interests.schema.json", () => {
	it("the real config validates with zero errors", () => {
		expect(validate(interests)).toEqual([]);
	});

	it("the validator actually catches violations (so the contract has teeth)", () => {
		const bad = (mutate) => {
			const clone = JSON.parse(JSON.stringify(interests));
			mutate(clone);
			return validate(clone).length;
		};
		expect(bad((c) => (c.alwaysTrack.teams[0].sport = "quidditch"))).toBeGreaterThan(0);
		expect(bad((c) => delete c.alwaysTrack.athletes[0].name)).toBeGreaterThan(0);
		expect(bad((c) => (c.alwaysTrack.teams[0].notify = "yes"))).toBeGreaterThan(0);
		expect(bad((c) => (c.notify.leadMinutes = 0))).toBeGreaterThan(0);
		expect(bad((c) => (c.surprise = true))).toBeGreaterThan(0);
	});
});

describe("interests.json — matcher + product invariants", () => {
	it("every alwaysTrack entry coerces to a usable entity (the matcher's contract)", () => {
		for (const key of ["athletes", "teams", "tournaments"]) {
			for (const item of interests.alwaysTrack[key]) {
				expect(normalizeEntity(item), `${key} entry ${JSON.stringify(item)}`).not.toBeNull();
			}
		}
	});

	it("has at least one free-text interest for the research agent", () => {
		expect(interests.interests.length).toBeGreaterThan(0);
	});
});
