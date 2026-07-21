// demand.js — WP-165: aggregate open `coverage-request` issues into a demand signal.
// Network-free: the gh call is injected (mirrors escalate-research's testability).
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
	sectionValue,
	parseCoverageRequest,
	aggregateDemand,
	fetchCoverageRequestIssues,
	collectDemand,
	COVERAGE_REQUEST_LABEL,
	ENTITY_HEADING,
	SPORT_HEADING,
	TITLE_PREFIX,
	SPORT_UNSET,
} from "../scripts/lib/demand.js";

const body = (entity, sport) =>
	`Offentlig, anonymt ønske om dekning fra Sportivista — kun navn + sport.\n\n### ${ENTITY_HEADING}\n\n${entity}\n\n### ${SPORT_HEADING}\n\n${sport}`;

describe("sectionValue", () => {
	it("reads the value under a ### heading", () => {
		expect(sectionValue(body("Liverpool", "football"), ENTITY_HEADING)).toBe("Liverpool");
		expect(sectionValue(body("Liverpool", "football"), SPORT_HEADING)).toBe("football");
	});
	it("returns null for a missing heading, empty value, or _No response_", () => {
		expect(sectionValue("no headings here", ENTITY_HEADING)).toBeNull();
		expect(sectionValue(`### ${SPORT_HEADING}\n\n_No response_`, SPORT_HEADING)).toBeNull();
		expect(sectionValue(`### ${ENTITY_HEADING}\n\n   `, ENTITY_HEADING)).toBeNull();
		expect(sectionValue(null, ENTITY_HEADING)).toBeNull();
	});
	it("stops at the next heading (multi-section body)", () => {
		expect(sectionValue(body("Aker BP Invitational", "golf"), ENTITY_HEADING)).toBe("Aker BP Invitational");
	});
});

describe("parseCoverageRequest", () => {
	it("parses entity + sport from a structured body", () => {
		const r = parseCoverageRequest({ number: 5, title: `${TITLE_PREFIX} Liverpool`, body: body("Liverpool", "football"), createdAt: "2026-07-20T10:00:00Z", url: "u" });
		expect(r).toEqual({ number: 5, entity: "Liverpool", sport: "football", createdAt: "2026-07-20T10:00:00Z", url: "u" });
	});
	it("treats the (ikke satt) sport placeholder as null", () => {
		expect(parseCoverageRequest({ number: 1, body: body("Vipers", SPORT_UNSET) }).sport).toBeNull();
	});
	it("falls back to the title (prefix stripped) when the body has no Entitet", () => {
		const r = parseCoverageRequest({ number: 2, title: `${TITLE_PREFIX} Bodø/Glimt`, body: "freeform note" });
		expect(r.entity).toBe("Bodø/Glimt");
		expect(r.sport).toBeNull();
	});
	it("returns null when there is no usable entity (bare prefix title, empty body)", () => {
		expect(parseCoverageRequest({ number: 3, title: `${TITLE_PREFIX} `, body: "" })).toBeNull();
		expect(parseCoverageRequest(null)).toBeNull();
		expect(parseCoverageRequest({})).toBeNull();
	});
});

describe("aggregateDemand", () => {
	it("groups requests for the same entity (case/space-folded) and counts them", () => {
		const issues = [
			{ number: 1, title: `${TITLE_PREFIX} Liverpool`, body: body("Liverpool", "football"), createdAt: "2026-07-18T10:00:00Z", url: "a" },
			{ number: 2, title: `${TITLE_PREFIX} liverpool`, body: body("liverpool", SPORT_UNSET), createdAt: "2026-07-20T10:00:00Z", url: "b" },
			{ number: 3, title: `${TITLE_PREFIX} Vipers`, body: body("Vipers", "handball"), createdAt: "2026-07-19T10:00:00Z", url: "c" },
		];
		const demand = aggregateDemand(issues);
		expect(demand).toHaveLength(2);
		// Liverpool has 2 requests → sorts first.
		expect(demand[0]).toMatchObject({ entity: "liverpool", count: 2, sport: "football", issues: [1, 2] });
		expect(demand[0].firstRequestedAt).toBe("2026-07-18T10:00:00.000Z");
		expect(demand[0].lastRequestedAt).toBe("2026-07-20T10:00:00.000Z");
		expect(demand[1]).toMatchObject({ entity: "Vipers", count: 1, sport: "handball", issues: [3] });
	});
	it("the most-recent request owns the display spelling; first non-null sport wins", () => {
		// Same folded key ("liverpool") but different casing → they group, and the
		// newest request's spelling + the first non-null sport are what surface.
		const issues = [
			{ number: 1, body: body("liverpool", SPORT_UNSET), createdAt: "2026-07-18T10:00:00Z" },
			{ number: 2, body: body("Liverpool", "football"), createdAt: "2026-07-21T10:00:00Z" },
		];
		const [top] = aggregateDemand(issues);
		expect(top.entity).toBe("Liverpool"); // newest spelling
		expect(top.sport).toBe("football");
		expect(top.count).toBe(2);
	});
	it("sorts by count desc then name; skips unparseable issues", () => {
		const issues = [
			{ number: 1, body: body("Alpha", "golf") },
			{ number: 2, title: `${TITLE_PREFIX} ` }, // no entity → skipped
			{ number: 3, body: body("Beta", "tennis") },
			{ number: 4, body: body("Beta", "tennis") },
		];
		const demand = aggregateDemand(issues);
		expect(demand.map((d) => d.entity)).toEqual(["Beta", "Alpha"]);
	});
	it("handles an empty / missing issue list", () => {
		expect(aggregateDemand([])).toEqual([]);
		expect(aggregateDemand(null)).toEqual([]);
	});
});

describe("fetchCoverageRequestIssues (injected runner — fail-soft)", () => {
	it("asks gh for open coverage-request issues and parses the JSON", () => {
		let captured;
		const runner = (args) => {
			captured = args;
			return { status: 0, stdout: JSON.stringify([{ number: 1, title: `${TITLE_PREFIX} X`, body: body("X", "golf") }]) };
		};
		const issues = fetchCoverageRequestIssues(runner);
		expect(issues).toHaveLength(1);
		expect(captured).toEqual(expect.arrayContaining(["issue", "list", "--label", COVERAGE_REQUEST_LABEL, "--state", "open"]));
	});
	it("returns null on a non-zero gh exit (unauthorised / no gh)", () => {
		expect(fetchCoverageRequestIssues(() => ({ status: 1, stderr: "gh: auth" }))).toBeNull();
	});
	it("returns null when gh output is not valid JSON", () => {
		expect(fetchCoverageRequestIssues(() => ({ status: 0, stdout: "not json" }))).toBeNull();
	});
	it("returns null when the runner throws (spawn failure)", () => {
		expect(fetchCoverageRequestIssues(() => { throw new Error("ENOENT"); })).toBeNull();
	});
});

describe("collectDemand", () => {
	it("returns the aggregated array on success", () => {
		const runner = () => ({ status: 0, stdout: JSON.stringify([{ number: 1, body: body("Liverpool", "football") }]) });
		expect(collectDemand({ runner })).toEqual([
			expect.objectContaining({ entity: "Liverpool", sport: "football", count: 1 }),
		]);
	});
	it("returns null (→ caller omits the field) when the fetch fails", () => {
		expect(collectDemand({ runner: () => ({ status: 1 }) })).toBeNull();
	});
	it("returns [] when there are no open coverage-request issues", () => {
		expect(collectDemand({ runner: () => ({ status: 0, stdout: "[]" }) })).toEqual([]);
	});
});

describe("issue template coherence", () => {
	const tpl = fs.readFileSync(path.resolve(process.cwd(), ".github", "ISSUE_TEMPLATE", "coverage-request.yml"), "utf-8");
	it("the template exists, is labelled, and its field labels match the parser headings", () => {
		expect(tpl).toContain(`labels: ["${COVERAGE_REQUEST_LABEL}"]`);
		// The `### <label>` headings the parser reads MUST equal the form field labels,
		// so a human filling the form produces a body demand.js can parse.
		expect(tpl).toContain(`label: ${ENTITY_HEADING}`);
		expect(tpl).toContain(`label: ${SPORT_HEADING}`);
		expect(tpl).toContain(`id: entity`);
		expect(tpl).toContain(`id: sport`);
		// Privacy contract is stated in the template.
		expect(tpl.toLowerCase()).toContain("anonym");
	});
	it("the entity field is required and the sport dropdown offers the unset placeholder", () => {
		expect(tpl).toContain("required: true");
		expect(tpl).toContain(SPORT_UNSET);
	});
});
