// catalog.json is the AI-managed coverage compass (WP-96). The SAME schema file
// that gives github.dev autocomplete/validation is the CI contract here, via the
// tiny dependency-free validator (the project stays dep-free).
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { normalizeEntity, matchInterest } from "../scripts/lib/helpers.js";
import { validateAgainstSchema } from "../scripts/lib/validate-schema.js";

const configDir = path.resolve(process.cwd(), "scripts", "config");
const catalog = JSON.parse(fs.readFileSync(path.join(configDir, "catalog.json"), "utf-8"));
const schema = JSON.parse(fs.readFileSync(path.join(configDir, "catalog.schema.json"), "utf-8"));

const validate = (data) => validateAgainstSchema(data, schema, schema);

describe("catalog.json against catalog.schema.json", () => {
	it("the real catalog validates with zero errors", () => {
		expect(validate(catalog)).toEqual([]);
	});

	it("the validator actually catches violations (so the contract has teeth)", () => {
		const bad = (mutate) => {
			const clone = JSON.parse(JSON.stringify(catalog));
			mutate(clone);
			return validate(clone).length;
		};
		expect(bad((c) => (c.tier1[0] = "quidditch"))).toBeGreaterThan(0);
		expect(bad((c) => (c.tier2.athletes[0].sport = "quidditch"))).toBeGreaterThan(0);
		expect(bad((c) => delete c.tier2.teams[0].name)).toBeGreaterThan(0);
		expect(bad((c) => (c.surprise = true))).toBeGreaterThan(0);
		expect(bad((c) => delete c.tier1)).toBeGreaterThan(0);
	});
});

describe("catalog.json — matcher + coverage invariants", () => {
	it("every tier2 entry coerces to a usable entity (the matcher's contract)", () => {
		for (const key of ["athletes", "teams", "tournaments"]) {
			for (const item of catalog.tier2[key] || []) {
				expect(normalizeEntity(item), `${key} entry ${JSON.stringify(item)}`).not.toBeNull();
			}
		}
	});

	it("covers the entity-gated sports through a named elite catalog (chess + esports)", () => {
		// The whole point of the split: chess/esports are NOT wholesale — they must
		// be covered through named entities so ANY user following an elite chess
		// player / tier-1 CS2 team gets events. Assert a broad, multi-name set.
		const chess = catalog.tier2.athletes.filter((a) => a.sport === "chess");
		const cs2Teams = catalog.tier2.teams.filter((t) => t.sport === "esports");
		expect(chess.length).toBeGreaterThanOrEqual(5);
		expect(cs2Teams.length).toBeGreaterThanOrEqual(5);
		// chess & esports are deliberately NOT wholesale (tier1).
		expect(catalog.tier1).not.toContain("chess");
		expect(catalog.tier1).not.toContain("esports");
	});

	it("the catalog is a superset of the owner's seed follows (no coverage regression)", () => {
		// interests.json remains the owner's seed/reference; every owner-tracked
		// entity must still be covered by the catalog so the owner's board never
		// shrinks after the split.
		const interests = JSON.parse(fs.readFileSync(path.join(configDir, "interests.json"), "utf-8"));
		const catalogEntities = [
			...catalog.tier2.teams, ...catalog.tier2.athletes, ...catalog.tier2.tournaments,
		];
		const tier1 = new Set(catalog.tier1.map((s) => s.toLowerCase()));
		for (const group of ["athletes", "teams", "tournaments"]) {
			for (const entry of interests.alwaysTrack[group] || []) {
				const e = normalizeEntity(entry);
				const sport = (e.sport || "").toLowerCase();
				if (tier1.has(sport)) continue; // covered wholesale
				expect(
					matchInterest(e.name, catalogEntities) != null,
					`owner-tracked "${e.name}" (${sport}) must be catalog-covered`
				).toBe(true);
			}
		}
	});
});
