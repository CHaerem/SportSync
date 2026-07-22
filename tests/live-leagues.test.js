// WP-172 — the live-football league list + the per-league poll gate.
//
// Two things are pinned here, both network-free:
//   (a) COHERENCE — `SS_FOOTBALL_LEAGUES` (docs/js/shared-constants.js) is a mirror
//       of the football leagues the pipeline actually covers
//       (scripts/config/sports-config.js), minus esp.copa_del_rey (the same trim the
//       seed-registry mirror already makes). A league added/removed in sports-config
//       fails CI until the shared constant follows — so the old hardcoded
//       ['eng.1','esp.1','fifa.world'] (which meant a Lyn/Eliteserien match NEVER got
//       a live score) can never silently drift back.
//   (b) THE GATE — `footballLeaguesToPoll` targets ONLY the league a plausibly-live
//       board match is in (surface-pressure floor: one scoreboard, not the whole
//       list), and `pollFootballScores` fetches exactly those and enriches the
//       matched row. Fetch is mocked.
import { describe, it, expect, beforeEach } from "vitest";
import { sportsConfig } from "../scripts/config/sports-config.js";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

/** The ESPN league codes the football fetcher covers, from sports-config. */
function configLeagueCodes() {
	const espn = sportsConfig.football.sources.find((s) => s.api === "espn");
	return espn.leagues.map((l) => l.code);
}

function boot() {
	const sandbox = createClientSandbox();
	sandbox.location = { search: "" };
	loadClientScript(sandbox, "shared-constants.js");
	loadClientScript(sandbox, "dashboard.js");
	loadClientScript(sandbox, "live.js");
	return sandbox;
}

const HH = 3600e3;
const ago = (h) => new Date(Date.now() - h * HH).toISOString();
const ahead = (h) => new Date(Date.now() + h * HH).toISOString();

describe("SS_FOOTBALL_LEAGUES — sports-config coherence (WP-172)", () => {
	let sandbox;
	beforeEach(() => { sandbox = boot(); });

	it("is exactly the covered leagues, minus esp.copa_del_rey (order-independent)", () => {
		const codes = sandbox.window.SS_FOOTBALL_LEAGUES.map((l) => l.code);
		const expected = configLeagueCodes().filter((c) => c !== "esp.copa_del_rey");
		expect([...codes].sort()).toEqual([...expected].sort());
	});

	it("every polled league is a real covered league (no invented codes)", () => {
		const covered = new Set(configLeagueCodes());
		for (const league of sandbox.window.SS_FOOTBALL_LEAGUES) {
			expect(covered.has(league.code)).toBe(true);
		}
	});

	it("includes the Norwegian tiers + Champions League the WP-172 fix added", () => {
		const codes = sandbox.window.SS_FOOTBALL_LEAGUES.map((l) => l.code);
		expect(codes).toEqual(expect.arrayContaining(["nor.1", "nor.2", "uefa.champions"]));
	});

	it("each entry's `name` is the ESPN display name from sports-config", () => {
		const espn = sportsConfig.football.sources.find((s) => s.api === "espn");
		const byCode = new Map(espn.leagues.map((l) => [l.code, l.name]));
		for (const league of sandbox.window.SS_FOOTBALL_LEAGUES) {
			expect(league.name).toBe(byCode.get(league.code));
		}
	});
});

describe("ssFootballLeagueForEvent — tournament → league mapping (WP-172)", () => {
	let f;
	beforeEach(() => { f = boot().window.ssFootballLeagueForEvent; });

	it("maps an Eliteserien match to nor.1 (with an edition suffix too)", () => {
		expect(f({ tournament: "Eliteserien" }).code).toBe("nor.1");
		expect(f({ tournament: "Eliteserien 2026" }).code).toBe("nor.1");
	});

	it("maps OBOS-ligaen to nor.2 and a shortened Champions to uefa.champions", () => {
		expect(f({ tournament: "OBOS-ligaen" }).code).toBe("nor.2");
		expect(f({ tournament: "Champions League" }).code).toBe("uefa.champions");
	});

	it("returns null for an unknown or missing tournament (never a wrong league)", () => {
		expect(f({ tournament: "NM Cupen" })).toBeNull();
		expect(f({})).toBeNull();
	});
});

describe("footballLeaguesToPoll — per-league match-window gate (WP-172)", () => {
	let dash;
	beforeEach(() => { dash = boot().window.dashboard; });

	it("polls the ONE league with a live match, not the whole list", () => {
		dash.allEvents = [
			{ id: "lyn", sport: "football", tournament: "Eliteserien", title: "Lyn – Sogndal", time: ago(1) },
			{ id: "pl", sport: "football", tournament: "Premier League", title: "Arsenal – Chelsea", time: ahead(6) },
		];
		const codes = dash.footballLeaguesToPoll(Date.now()).map((l) => l.code);
		expect(codes).toEqual(["nor.1"]); // Eliteserien live now; the PL match is 6h out → not polled
	});

	it("polls nothing when no football match is inside its window", () => {
		dash.allEvents = [
			{ id: "old", sport: "football", tournament: "Eliteserien", title: "Lyn – Ull/Kisa", time: ago(5) }, // finished long ago
			{ id: "future", sport: "football", tournament: "La Liga", title: "Barça – Madrid", time: ahead(2) },
		];
		expect(dash.footballLeaguesToPoll(Date.now())).toEqual([]);
	});

	it("still polls a just-finished match (post-match tail) so its final score resolves", () => {
		dash.allEvents = [{ id: "done", sport: "football", tournament: "OBOS-ligaen", title: "Lyn – Bryne", time: ago(2.5) }];
		expect(dash.footballLeaguesToPoll(Date.now()).map((l) => l.code)).toEqual(["nor.2"]);
	});

	it("dedupes two live matches in the same league to one poll", () => {
		dash.allEvents = [
			{ id: "a", sport: "football", tournament: "Eliteserien", title: "Lyn – Brann", time: ago(1) },
			{ id: "b", sport: "football", tournament: "Eliteserien", title: "Molde – Bodø/Glimt", time: ago(0.5) },
		];
		expect(dash.footballLeaguesToPoll(Date.now()).map((l) => l.code)).toEqual(["nor.1"]);
	});
});

describe("pollFootballScores — fetches only gated leagues, enriches the row (WP-172)", () => {
	it("polls nor.1 for a live Eliteserien match and writes the running score", async () => {
		const sandbox = boot();
		const dash = sandbox.window.dashboard;
		dash.allEvents = [
			{ id: "lyn", sport: "football", tournament: "Eliteserien", title: "Lyn – Sogndal",
			  time: ago(1), homeTeam: "Lyn", awayTeam: "Sogndal" },
		];
		const fetched = [];
		sandbox.fetch = (url) => {
			fetched.push(url);
			if (!url.includes("/nor.1/")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) });
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({
					events: [{
						competitions: [{
							status: { type: { state: "in" }, displayClock: "67'" },
							competitors: [
								{ homeAway: "home", score: "2", team: { displayName: "Lyn" } },
								{ homeAway: "away", score: "1", team: { displayName: "Sogndal" } },
							],
						}],
					}],
				}),
			});
		};

		await dash.pollFootballScores();

		// ONLY nor.1 was polled — never eng.1/esp.1/fifa.world (the old hardcoded set).
		expect(fetched).toHaveLength(1);
		expect(fetched[0]).toContain("/soccer/nor.1/scoreboard");
		expect(dash.liveScores.lyn).toMatchObject({ home: 2, away: 1, clock: "67'", state: "in" });
	});

	it("makes NO request when nothing is in-window", async () => {
		const sandbox = boot();
		const dash = sandbox.window.dashboard;
		dash.allEvents = [{ id: "future", sport: "football", tournament: "Premier League", title: "A – B", time: ahead(4) }];
		let calls = 0;
		sandbox.fetch = () => { calls += 1; return Promise.resolve({ ok: false }); };
		await dash.pollFootballScores();
		expect(calls).toBe(0);
	});
});
