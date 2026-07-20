// assistant.test.js — the deterministic web assistant (docs/js/assistant.js).
// Proves the router + window/entity queries + filter + follow intent over a small
// grounded feed. (Full eval-corpus.json replay — the JS<->Swift parity gate — is
// a tracked follow-on; this pins v1 behaviour.)

import { describe, it, expect, beforeAll } from "vitest";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

let A; // sandbox window
const NOW = Date.parse("2026-07-20T09:00:00Z"); // Monday, Oslo 11:00

beforeAll(() => {
	const sandbox = createClientSandbox();
	loadClientScript(sandbox, "shared-constants.js");
	loadClientScript(sandbox, "lens.js");
	loadClientScript(sandbox, "assistant.js");
	A = sandbox.window;
});

const events = () => [
	{ id: "e-tonight", sport: "football", title: "Liverpool – Arsenal", homeTeam: "Liverpool", awayTeam: "Arsenal", time: "2026-07-20T18:00:00Z" }, // Oslo 20:00 today
	{ id: "e-tomorrow", sport: "cycling", title: "Tour de France", tournament: "Tour de France 2026", time: "2026-07-21T13:00:00Z" },
	{ id: "e-golf-week", sport: "golf", title: "The Open", tournament: "The Open 2026", time: "2026-07-23T10:00:00Z", endTime: "2026-07-25T18:00:00Z" },
];
const ask = (q) => A.ssAssistant(q, { events: events(), interests: null, config: null, nowMs: NOW });

describe("window questions", () => {
	it("«hva skjer i kveld?» → tonight's events", () => {
		const r = ask("hva skjer i kveld?");
		expect(r.kind).toBe("answer");
		expect(r.eventIds).toContain("e-tonight");
		expect(r.eventIds).not.toContain("e-tomorrow");
	});
	it("«hva skjer i morgen?» → tomorrow's events", () => {
		expect(ask("hva skjer i morgen?").eventIds).toEqual(["e-tomorrow"]);
	});
	it("«hva skjer denne uka?» → the whole week incl. the multi-day golf", () => {
		const ids = ask("hva skjer denne uka?").eventIds;
		expect(ids).toContain("e-golf-week");
		expect(ids).toContain("e-tonight");
	});
});

describe("filter utterances", () => {
	it("«vis golf denne uka» → a golf+week filter", () => {
		const r = ask("vis golf denne uka");
		expect(r.kind).toBe("filter");
		expect(r.filter.sports).toEqual(["golf"]);
		expect(r.filter.window).toBe("this-week");
		expect(r.eventIds).toEqual(["e-golf-week"]);
	});
	it("«vis alt» → reset", () => {
		expect(ask("vis alt").kind).toBe("reset");
	});
});

describe("entity next-event", () => {
	it("«når spiller Liverpool?» → the Liverpool match", () => {
		const r = ask("når spiller Liverpool?");
		expect(r.kind).toBe("answer");
		expect(r.eventIds).toEqual(["e-tonight"]);
		expect(r.text).toContain("Liverpool");
	});
});

describe("follow intent", () => {
	it("«følg Hovland» → a follow mutation carrying the subject", () => {
		const r = ask("følg Hovland");
		expect(r.kind).toBe("mutation");
		expect(r.unfollow).toBe(false);
		expect(r.subject).toBe("Hovland");
	});
	it("«slutt å følge Liverpool» → an unfollow mutation", () => {
		const r = ask("slutt å følge Liverpool");
		expect(r.kind).toBe("mutation");
		expect(r.unfollow).toBe(true);
		expect(r.subject).toBe("Liverpool");
	});
});

describe("honesty", () => {
	it("empty → a calm prompt", () => {
		expect(ask("").kind).toBe("help");
	});
	it("unplaceable → the capability line (never invents)", () => {
		const r = ask("blablabla xyz");
		expect(r.kind).toBe("help");
		expect(r.eventIds).toEqual([]);
	});
});
