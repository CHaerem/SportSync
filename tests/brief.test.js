// brief.test.js — «Min brief» (WP-174): the deterministic personal brief.
//
// Two halves, mirroring the twin discipline:
//   1. COMPOSER — replays every shared golden vector in
//      tests/fixtures/brief-vectors/ against docs/js/brief.js `ssComposeBrief`.
//      The SAME files ios/SportivistaTests/MinBriefTests.swift decodes, so web
//      and iOS are proven against one fasit (à la the feed-vectors).
//   2. SELECTION + WIRING — drives the real Dashboard (loaded in a vm sandbox)
//      to prove: an EMPTY profile leaves the hero line byte-for-byte the
//      editorial fallback; a profile with follows composes a personal brief from
//      events + results + news; and a profile with no matching content degrades
//      gracefully back to the editorial line.

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { ssComposeBrief } from "../docs/js/brief.js";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

const FIX_DIR = path.resolve(process.cwd(), "tests", "fixtures", "brief-vectors");

function loadVectors() {
	return fs
		.readdirSync(FIX_DIR)
		.filter((f) => f.endsWith(".json"))
		.sort()
		.map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(FIX_DIR, f), "utf-8")) }));
}

// ── 1 · Composer against the shared golden vectors ───────────────────────────
describe("ssComposeBrief — golden brief-vectors (twin fasit)", () => {
	const vectors = loadVectors();

	it("has vectors to replay", () => {
		expect(vectors.length).toBeGreaterThan(0);
	});

	for (const v of vectors) {
		it(`${v.file}: ${v.name}`, () => {
			expect(ssComposeBrief(v.input)).toBe(v.expected.brief);
		});
	}

	it("caps every composed vector at the max length", () => {
		for (const v of vectors) {
			expect(ssComposeBrief(v.input).length).toBeLessThanOrEqual(220);
		}
	});

	it("is defensive against a null/garbage context", () => {
		expect(ssComposeBrief(null)).toBe("");
		expect(ssComposeBrief({})).toBe("");
		expect(ssComposeBrief({ upcoming: null, results: null, newsCount: null })).toBe("");
	});
});

// ── 2 · Web selection + hero wiring (real Dashboard in a sandbox) ─────────────
describe("Dashboard personal brief — selection + hero fallback", () => {
	let dash, win;
	// A fixed clock: 2026-07-22 15:00Z = Oslo 17:00 (July, UTC+2).
	const NOW = Date.parse("2026-07-22T15:00:00Z");

	beforeAll(() => {
		const sandbox = createClientSandbox();
		loadClientScript(sandbox, "shared-constants.js");
		loadClientScript(sandbox, "lens.js");
		loadClientScript(sandbox, "dashboard.js");
		loadClientScript(sandbox, "news-web.js");
		loadClientScript(sandbox, "brief.js");
		dash = sandbox.window.dashboard;
		win = sandbox.window;
	});

	/** A profile following the football team «Lyn» (an entityId + a name rule). */
	function followLyn() {
		dash.hasProfile = true;
		dash.profile = { rules: [{ deleted: false, rule: { entityId: "team-lyn", entityName: "Lyn", sport: "football", kind: "team" } }], facts: [] };
		dash.interests = { followBroadly: null, alwaysTrack: { teams: [{ name: "Lyn", aliases: [], sport: "football" }], athletes: [], tournaments: [] } };
		dash.assistantVocab = null;
		dash.lensConfig = null;
	}

	function clearProfile() {
		dash.hasProfile = false;
		dash.profile = null;
		dash.interests = null;
	}

	it("EMPTY profile → hero is the editorial line, byte-for-byte (acceptance)", () => {
		clearProfile();
		dash.featured = { generatedAt: "2026-07-22T06:00:00Z", blocks: [{ type: "headline", text: "Katalog-bred redaksjonell linje." }] };
		dash.allEvents = [];
		dash.news = [];
		dash.recentResults = {};
		expect(dash.personalBrief(NOW)).toBe(null);
		expect(dash.heroHeadline(NOW)).toBe("Katalog-bred redaksjonell linje.");
	});

	it("EMPTY profile with no fresh editorial → the calm fallback string", () => {
		clearProfile();
		dash.featured = null;
		dash.allEvents = [];
		dash.news = [];
		dash.recentResults = {};
		expect(dash.heroHeadline(NOW)).toBe(dash.heroFallback());
	});

	it("profile with follows → composes a personal brief from events + results + news", () => {
		followLyn();
		// Upcoming: Lyn away at Bodø/Glimt tonight (Oslo 19:30 = 17:30Z).
		dash.allEvents = [{
			id: "e1", sport: "football", homeTeam: "Bodø/Glimt", awayTeam: "Lyn",
			awayTeamEntityId: "team-lyn", tournament: "Eliteserien",
			time: "2026-07-22T17:30:00Z",
		}];
		// Result: Lyn – Sogndal 2–1 yesterday.
		dash.recentResults = {
			football: [{ homeTeam: "Lyn", awayTeam: "Sogndal", homeScore: 2, awayScore: 1, date: "2026-07-21T16:00:00Z", league: "OBOS-ligaen" }],
		};
		// One matching news item.
		dash.news = [{ title: "Lyn henter spiss", link: "https://vg.no/x", source: "VG", sport: "football", entityIds: ["team-lyn"], publishedAt: "2026-07-22T10:00:00Z" }];

		const brief = dash.personalBrief(NOW);
		expect(brief).toBe("I din verden i kveld: Bodø/Glimt – Lyn 19:30. Lyn – Sogndal endte 2–1 i går. Én nyhet om det du følger.");
		// The hero uses the brief over the editorial line when a profile has follows.
		dash.featured = { generatedAt: "2026-07-22T06:00:00Z", blocks: [{ type: "headline", text: "Redaksjonell linje." }] };
		expect(dash.heroHeadline(NOW)).toBe(brief);
	});

	it("profile with follows but NO matching content → falls back to the editorial line (graceful)", () => {
		followLyn();
		dash.allEvents = [{ id: "e2", sport: "golf", title: "Random Open", time: "2026-07-23T09:00:00Z" }];
		dash.recentResults = {};
		dash.news = [{ title: "Golf news", link: "https://x", source: "PGA", sport: "golf", entityIds: ["viktor-hovland"], publishedAt: "2026-07-22T10:00:00Z" }];
		dash.featured = { generatedAt: "2026-07-22T06:00:00Z", blocks: [{ type: "headline", text: "Redaksjonell linje." }] };
		expect(dash.personalBrief(NOW)).toBe(null);
		expect(dash.heroHeadline(NOW)).toBe("Redaksjonell linje.");
	});

	it("brief context reflects the selection caps (≤2 upcoming, ≤2 results)", () => {
		followLyn();
		dash.allEvents = [
			{ id: "a", sport: "football", homeTeam: "Lyn", awayTeam: "A", homeTeamEntityId: "team-lyn", time: "2026-07-22T17:00:00Z" },
			{ id: "b", sport: "football", homeTeam: "Lyn", awayTeam: "B", homeTeamEntityId: "team-lyn", time: "2026-07-23T17:00:00Z" },
			{ id: "c", sport: "football", homeTeam: "Lyn", awayTeam: "C", homeTeamEntityId: "team-lyn", time: "2026-07-24T17:00:00Z" },
		];
		dash.recentResults = {};
		dash.news = [];
		const ctx = dash.briefContext(NOW);
		expect(ctx.upcoming.length).toBe(2);        // capped
		expect(ctx.upcoming[0].title).toBe("Lyn – A"); // nearest first
	});
});
