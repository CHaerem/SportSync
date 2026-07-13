// WP-06 · Golden feed vectors.
//
// Freezes the personalisation semantics — relevance, must-watch (bell),
// must-see (accent), the agenda time window, and series collapse — as
// declarative JSON fixtures in tests/fixtures/feed-vectors/. Each fixture is a
// pure-data pair of { input, expected }: no JS inside the fixtures, so the exact
// same files can be replayed from XCTest to prove the Swift FeedCompiler
// (WP-13) equivalent. See tests/fixtures/feed-vectors/README.md for the format
// and tests/fixtures/feed-vectors/DIVERGENCES.md for the server/client mismatches
// this test pins (deliberately NOT fixed — WP-06 is non-fixing by contract).
//
// Where the same logic exists on BOTH sides, the vector is run against both:
//   • isEventInWindow → server scripts/lib/helpers.js AND client
//     docs/js/shared-constants.js (the two must agree — a divergence would be a
//     real bug; the test asserts parity).
//   • mustWatch (bell) → server helper mustWatchEntity (client only reads the
//     precomputed e.mustWatch, so there is no second implementation to run).
//   • mustSee (accent) + collapseSeries → client only (docs/js/dashboard.js).
//   • relevant (feed inclusion) → a faithful mirror of scripts/build-events.js
//     (isRelevant + the 14-day retention cutoff), built on the exported
//     matchInterest. isRelevant is not exported, so it is reconstructed here and
//     annotated with its source lines; this reconstruction IS the JS reference
//     the Swift port is proven against.

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import {
	isEventInWindow as serverInWindow,
	mustWatchEntity,
	matchInterest,
	MS_PER_DAY,
} from "../scripts/lib/helpers.js";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

const FIX_DIR = path.resolve(process.cwd(), "tests", "fixtures", "feed-vectors");

// --- Load every JSON vector (deterministic order by filename) ----------------
function loadVectors() {
	return fs
		.readdirSync(FIX_DIR)
		.filter((f) => f.endsWith(".json"))
		.sort()
		.map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(FIX_DIR, f), "utf-8")) }));
}
const VECTORS = loadVectors();

// --- Server reference: relevance (feed inclusion) ----------------------------
// Mirrors scripts/build-events.js:405-432 verbatim:
//   • the default followBroadly list (build-events.js:406)
//   • isRelevant() (build-events.js:414-421) — NOTE: matchInterest is called
//     WITHOUT a sport scope here, unlike mustWatchEntity (see DIVERGENCES.md)
//   • the 14-day retention cutoff (build-events.js:424-432), which keys off
//     endTime when present, else start.
const DEFAULT_FOLLOW_BROADLY = [
	"football", "golf", "f1", "cycling", "chess", "esports",
	"biathlon", "cross-country", "alpine", "nordic", "ski jumping",
];

function serverRelevant(event, interests, nowMs) {
	if (!event.time) return false;
	const relevantTime = event.endTime ? Date.parse(event.endTime) : Date.parse(event.time);
	if (relevantTime < nowMs - 14 * MS_PER_DAY) return false; // dropped: too old

	const followBroadly = new Set(
		(interests.followBroadly || DEFAULT_FOLLOW_BROADLY).map((s) => s.toLowerCase())
	);
	if (followBroadly.has((event.sport || "").toLowerCase())) return true;
	if (event.norwegian || event.isFavorite || (event.importance || 0) >= 4 || event.source === "ai-research") return true;

	const trackedEntities = [
		...(interests.alwaysTrack?.teams || []),
		...(interests.alwaysTrack?.athletes || []),
		...(interests.alwaysTrack?.tournaments || []),
	];
	const hay = [
		event.title, event.tournament, event.homeTeam, event.awayTeam,
		...(event.norwegianPlayers || []).map((p) => p.name || p),
		...(event.participants || []),
	].join(" ");
	return matchInterest(hay, trackedEntities) != null; // NOT sport-scoped
}

// --- Client reference: shared sandbox ----------------------------------------
let dash; // docs/js/dashboard.js Dashboard instance
let clientInWindow; // docs/js/shared-constants.js isEventInWindow

beforeAll(() => {
	const sandbox = createClientSandbox();
	loadClientScript(sandbox, "shared-constants.js");
	loadClientScript(sandbox, "sport-config.js");
	loadClientScript(sandbox, "asset-maps.js");
	loadClientScript(sandbox, "dashboard.js");
	dash = sandbox.window.dashboard;
	clientInWindow = sandbox.window.isEventInWindow;
});

// --- Comparison helpers ------------------------------------------------------
const sortIds = (arr) => [...arr].sort();
const idsWhere = (events, pred) => sortIds(events.filter(pred).map((e) => e.id));

function describeSeriesItem(item) {
	return item.isSeries
		? {
			isSeries: true,
			id: item.id,
			tournament: item.tournament,
			stageCount: item.stages.length,
			nextStageId: item.nextStage ? item.nextStage.id : null,
		}
		: { isSeries: false, id: item.id };
}
const sortByIdField = (arr) => [...arr].sort((a, b) => String(a.id).localeCompare(String(b.id)));

// --- Structural guards -------------------------------------------------------
describe("feed-vector suite integrity", () => {
	it("ships at least 10 vectors (WP-06 acceptance)", () => {
		expect(VECTORS.length).toBeGreaterThanOrEqual(10);
	});

	it("every event carries a unique id and every expected id resolves to an event", () => {
		for (const v of VECTORS) {
			const events = v.input.events || [];
			const ids = events.map((e) => e.id);
			expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
			expect(new Set(ids).size, `${v.file}: duplicate event id`).toBe(ids.length);
			const known = new Set(ids);
			for (const key of ["relevant", "mustWatch", "mustSee", "inWindow"]) {
				for (const id of v.expected[key] || []) {
					expect(known.has(id), `${v.file}: expected.${key} references unknown id "${id}"`).toBe(true);
				}
			}
		}
	});

	it("every vector declares at least one expectation", () => {
		for (const v of VECTORS) {
			const keys = Object.keys(v.expected || {});
			expect(keys.length, `${v.file}: no expectations`).toBeGreaterThan(0);
		}
	});
});

// --- Run each vector against the reference implementations -------------------
for (const v of VECTORS) {
	describe(`${v.file} — ${v.name}`, () => {
		const events = v.input.events || [];
		const interests = v.input.interests || {};
		const nowMs = v.input.now ? Date.parse(v.input.now) : Date.now();

		if (v.expected.relevant) {
			it("server: relevant events match (build-events.js isRelevant + 14d cutoff)", () => {
				expect(idsWhere(events, (e) => serverRelevant(e, interests, nowMs))).toEqual(sortIds(v.expected.relevant));
			});
		}

		if (v.expected.mustWatch) {
			it("server: must-watch (bell) events match (helpers.js mustWatchEntity)", () => {
				expect(idsWhere(events, (e) => mustWatchEntity(e, interests) != null)).toEqual(sortIds(v.expected.mustWatch));
			});
		}

		if (v.expected.mustSee) {
			it("client: must-see (accent) events match (dashboard.js isMustSee)", () => {
				dash.interests = interests;
				expect(idsWhere(events, (e) => dash.isMustSee(e))).toEqual(sortIds(v.expected.mustSee));
			});
		}

		if (v.expected.inWindow) {
			const win = v.input.window;
			it("has a window when it expects inWindow results", () => {
				expect(win && win.start && win.end, `${v.file}: expected.inWindow requires input.window`).toBeTruthy();
			});
			it("server & client isEventInWindow agree and match the expected set", () => {
				const ws = Date.parse(win.start), we = Date.parse(win.end);
				const serverIds = idsWhere(events, (e) => serverInWindow(e, ws, we));
				const clientIds = idsWhere(events, (e) => clientInWindow(e, ws, we));
				// The two implementations are byte-identical mirrors — pin parity so a
				// future edit to one side fails loudly (this is the only true both-sides
				// function; see CLAUDE.md "Event time filtering").
				expect(clientIds, `${v.file}: server/client isEventInWindow DIVERGED`).toEqual(serverIds);
				expect(serverIds).toEqual(sortIds(v.expected.inWindow));
			});
		}

		if (v.expected.series) {
			it("client: collapseSeries folds/keeps rows as expected (dashboard.js)", () => {
				const actual = sortByIdField(dash.collapseSeries(events, nowMs).map(describeSeriesItem));
				const expected = sortByIdField(v.expected.series);
				expect(actual).toEqual(expected);
			});
		}
	});
}
