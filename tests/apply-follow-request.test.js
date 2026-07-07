// apply-follow-request.js: parse a follow-request Issue Form and edit interests.json.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fieldsFromForm, applyChange } from "../scripts/apply-follow-request.js";
import { validateAgainstSchema } from "../scripts/lib/validate-schema.js";

const schema = JSON.parse(
	fs.readFileSync(path.resolve(process.cwd(), "scripts", "config", "interests.schema.json"), "utf-8")
);

const base = () => ({
	language: "nb-NO",
	timezone: "Europe/Oslo",
	alwaysTrack: {
		athletes: [{ name: "Viktor Hovland", sport: "golf" }],
		teams: [{ name: "Liverpool", sport: "football" }],
		tournaments: [{ name: "F1 World Championship", sport: "f1", notify: true }],
	},
	interests: ["Norsk idrett"],
});

const formBody = (o) => `### Handling

${o.action}

### Type

${o.kind}

### Navn

${o.name}

### Aliaser (komma-separert, valgfritt)

${o.aliases ?? "_No response_"}

### Sport (valgfritt, men hjelper matchingen)

${o.sport ?? "(ikke satt)"}

### Kalendervarsel?

${o.notify ?? "Standard"}`;

describe("fieldsFromForm", () => {
	it("parses the Issue Form body and blanks placeholders", () => {
		const f = fieldsFromForm(formBody({ action: "Legg til", kind: "Lag", name: "Brann", aliases: "SK Brann, Brann Bergen", sport: "football", notify: "Ja" }));
		expect(f).toMatchObject({ action: "Legg til", kind: "Lag", name: "Brann", aliases: "SK Brann, Brann Bergen", sport: "football", notify: "Ja" });
	});
	it("treats _No response_ and (ikke satt) as empty; notify defaults to Standard", () => {
		const f = fieldsFromForm(formBody({ action: "Fjern", kind: "Utøver", name: "X" }));
		expect(f.aliases).toBe("");
		expect(f.sport).toBe("");
		expect(f.notify).toBe("Standard");
	});
});

describe("applyChange", () => {
	it("adds a team with aliases; default notify is not stored (teams notify by default)", () => {
		const f = fieldsFromForm(formBody({ action: "Legg til", kind: "Lag", name: "Brann", aliases: "SK Brann", sport: "football", notify: "Standard" }));
		const { interests } = applyChange(base(), f);
		const brann = interests.alwaysTrack.teams.find((t) => t.name === "Brann");
		expect(brann).toMatchObject({ name: "Brann", aliases: ["SK Brann"], sport: "football" });
		expect(brann).not.toHaveProperty("notify");
		expect(validateAgainstSchema(interests, schema, schema)).toEqual([]);
	});

	it("stores notify:true when adding a tournament with 'Ja' (deviates from default)", () => {
		const f = fieldsFromForm(formBody({ action: "Legg til", kind: "Turnering", name: "Tour de France", sport: "cycling", notify: "Ja" }));
		const { interests } = applyChange(base(), f);
		expect(interests.alwaysTrack.tournaments.find((t) => t.name === "Tour de France")).toMatchObject({ notify: true });
	});

	it("removes an existing entry", () => {
		const f = fieldsFromForm(formBody({ action: "Fjern", kind: "Lag", name: "Liverpool" }));
		const { interests } = applyChange(base(), f);
		expect(interests.alwaysTrack.teams.find((t) => t.name === "Liverpool")).toBeUndefined();
	});

	it("adds a Sport to the free-text interests[] brief (not alwaysTrack)", () => {
		const f = fieldsFromForm(formBody({ action: "Legg til", kind: "Sport", name: "Håndball" }));
		const { interests } = applyChange(base(), f);
		expect(interests.interests).toContain("Håndball");
		expect(interests.alwaysTrack.teams.some((t) => t.name === "Håndball")).toBe(false);
		expect(validateAgainstSchema(interests, schema, schema)).toEqual([]);
	});

	it("removes an interest line, and rejects adding one already covered", () => {
		const rm = fieldsFromForm(formBody({ action: "Fjern", kind: "Sport", name: "Norsk idrett" }));
		expect(applyChange(base(), rm).interests.interests).not.toContain("Norsk idrett");
		expect(() => applyChange(base(), fieldsFromForm(formBody({ action: "Legg til", kind: "Sport", name: "Norsk" })))).toThrow();
	});

	it("changes notify on an existing entry", () => {
		const f = fieldsFromForm(formBody({ action: "Endre varsel", kind: "Lag", name: "Liverpool", notify: "Nei" }));
		const { interests } = applyChange(base(), f);
		expect(interests.alwaysTrack.teams.find((t) => t.name === "Liverpool")).toMatchObject({ notify: false });
	});

	it("rejects removing something that isn't there, and adding a duplicate", () => {
		expect(() => applyChange(base(), fieldsFromForm(formBody({ action: "Fjern", kind: "Lag", name: "Vålerenga" })))).toThrow();
		expect(() => applyChange(base(), fieldsFromForm(formBody({ action: "Legg til", kind: "Lag", name: "Liverpool" })))).toThrow();
	});

	it("never produces a config that violates the schema", () => {
		const f = fieldsFromForm(formBody({ action: "Legg til", kind: "Utøver", name: "Karsten Warholm", sport: "athletics", notify: "Nei" }));
		const { interests } = applyChange(base(), f);
		expect(validateAgainstSchema(interests, schema, schema)).toEqual([]);
	});
});
