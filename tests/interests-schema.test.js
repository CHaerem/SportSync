// interests.json is the single user-owned config — CI catches accidental corruption.
// The SAME schema file that gives github.dev autocomplete/validation is the CI
// contract here, via a tiny dependency-free validator (the project stays dep-free).
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { normalizeEntity } from "../scripts/lib/helpers.js";

const configDir = path.resolve(process.cwd(), "scripts", "config");
const interests = JSON.parse(fs.readFileSync(path.join(configDir, "interests.json"), "utf-8"));
const schema = JSON.parse(fs.readFileSync(path.join(configDir, "interests.schema.json"), "utf-8"));

/**
 * Minimal JSON-Schema validator — supports exactly the keywords interests.schema.json
 * uses: type, required, properties, additionalProperties:false, items, enum, minimum,
 * anyOf, and local $ref (#/definitions/x). Returns a list of error strings.
 */
function validate(data, node, root, at = "") {
	const errors = [];
	if (!node || typeof node !== "object") return errors;

	if (node.$ref) {
		const target = node.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o?.[k], root);
		return validate(data, target, root, at);
	}
	if (node.anyOf) {
		if (!node.anyOf.some((s) => validate(data, s, root, at).length === 0)) {
			errors.push(`${at || "(root)"}: matches none of the allowed shapes`);
		}
		return errors;
	}
	if (node.type) {
		const t = node.type;
		const ok =
			(t === "object" && data && typeof data === "object" && !Array.isArray(data)) ||
			(t === "array" && Array.isArray(data)) ||
			(t === "string" && typeof data === "string") ||
			(t === "integer" && Number.isInteger(data)) ||
			(t === "number" && typeof data === "number") ||
			(t === "boolean" && typeof data === "boolean");
		if (!ok) { errors.push(`${at || "(root)"}: expected ${t}`); return errors; }
	}
	if (node.enum && !node.enum.includes(data)) errors.push(`${at}: "${data}" not allowed`);
	if (typeof node.minimum === "number" && typeof data === "number" && data < node.minimum) {
		errors.push(`${at}: ${data} below minimum ${node.minimum}`);
	}
	if (node.type === "object" && data && typeof data === "object" && !Array.isArray(data)) {
		for (const req of node.required || []) if (!(req in data)) errors.push(`${at}: missing "${req}"`);
		for (const key of Object.keys(data)) {
			if (node.properties?.[key]) errors.push(...validate(data[key], node.properties[key], root, `${at}.${key}`));
			else if (node.additionalProperties === false) errors.push(`${at}: unexpected property "${key}"`);
		}
	}
	if (node.type === "array" && Array.isArray(data) && node.items) {
		data.forEach((item, i) => errors.push(...validate(item, node.items, root, `${at}[${i}]`)));
	}
	return errors;
}

describe("interests.json against interests.schema.json", () => {
	it("the real config validates with zero errors", () => {
		expect(validate(interests, schema, schema)).toEqual([]);
	});

	it("the validator actually catches violations (so the contract has teeth)", () => {
		const bad = (mutate) => {
			const clone = JSON.parse(JSON.stringify(interests));
			mutate(clone);
			return validate(clone, schema, schema).length;
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
