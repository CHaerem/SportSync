// events.json is a flat array of event objects; events.schema.json describes ONE
// such object. Same pattern as tests/interests-schema.test.js: the schema drives
// both this CI check and (via scripts/validate-events.js) the pipeline gate,
// through the shared dependency-free validator in scripts/lib/validate-schema.js.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { validateAgainstSchema } from "../scripts/lib/validate-schema.js";

const configDir = path.resolve(process.cwd(), "scripts", "config");
const dataDir = path.resolve(process.cwd(), "docs", "data");
const schema = JSON.parse(fs.readFileSync(path.join(configDir, "events.schema.json"), "utf-8"));
const events = JSON.parse(fs.readFileSync(path.join(dataDir, "events.json"), "utf-8"));

const validate = (event) => validateAgainstSchema(event, schema, schema);

describe("docs/data/events.json against events.schema.json", () => {
	it("is a non-empty array", () => {
		expect(Array.isArray(events)).toBe(true);
		expect(events.length).toBeGreaterThan(0);
	});

	it("every real event validates with zero errors", () => {
		for (const event of events) {
			expect(validate(event), JSON.stringify({ sport: event.sport, title: event.title, time: event.time })).toEqual([]);
		}
	});
});

describe("events.schema.json — the validator actually catches violations (so the contract has teeth)", () => {
	// A minimal valid event to mutate — matches the schema's only required fields.
	const base = () => ({
		sport: "golf",
		title: "Open",
		time: "2026-08-01T10:00:00Z",
	});

	it("passes a minimal valid event", () => {
		expect(validate(base())).toEqual([]);
	});

	it("catches a missing title", () => {
		const event = base();
		delete event.title;
		expect(validate(event).length).toBeGreaterThan(0);
	});

	it("catches a missing sport", () => {
		const event = base();
		delete event.sport;
		expect(validate(event).length).toBeGreaterThan(0);
	});

	it("catches a missing time", () => {
		const event = base();
		delete event.time;
		expect(validate(event).length).toBeGreaterThan(0);
	});

	it("catches an invalid confidence enum value", () => {
		const event = { ...base(), source: "ai-research", confidence: "certain" };
		expect(validate(event).length).toBeGreaterThan(0);
	});

	it("accepts a valid confidence enum value", () => {
		const event = { ...base(), source: "ai-research", confidence: "medium" };
		expect(validate(event)).toEqual([]);
	});

	it("catches importance outside 1-5", () => {
		expect(validate({ ...base(), importance: 0 }).length).toBeGreaterThan(0);
		expect(validate({ ...base(), importance: 6 }).length).toBeGreaterThan(0);
	});

	it("accepts importance within 1-5", () => {
		expect(validate({ ...base(), importance: 3 })).toEqual([]);
	});

	it("catches streaming that isn't an array", () => {
		const event = { ...base(), streaming: "NRK" };
		expect(validate(event).length).toBeGreaterThan(0);
	});

	it("accepts a well-formed streaming array", () => {
		const event = { ...base(), streaming: [{ platform: "NRK", url: "https://tv.nrk.no" }] };
		expect(validate(event)).toEqual([]);
	});

	it("catches an unexpected top-level property (typo guard)", () => {
		const event = { ...base(), toornament: "Oops" };
		expect(validate(event).length).toBeGreaterThan(0);
	});

	it("tolerates today's norwegianPlayers polymorphism (string | {name} | {name, teeTime, teeTimeUTC, status} | null) — tightening this is WP-04", () => {
		const event = {
			...base(),
			norwegianPlayers: ["Casper Ruud", { name: "Viktor Hovland" }, { name: "Kris Ventura", teeTime: "14:20", teeTimeUTC: null, status: null }, null],
		};
		expect(validate(event)).toEqual([]);
	});

	it("catches a malformed norwegianPlayers entry (object missing name)", () => {
		const event = { ...base(), norwegianPlayers: [{ teeTime: "14:20" }] };
		expect(validate(event).length).toBeGreaterThan(0);
	});
});
