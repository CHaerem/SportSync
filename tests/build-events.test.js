// build-events.js: merges sport JSONs + curated configs, preserves AI-research events.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

let dataDir, configDir;

function runBuild() {
	execFileSync("node", ["scripts/build-events.js"], {
		env: { ...process.env, SPORTSYNC_DATA_DIR: dataDir, SPORTSYNC_CONFIG_DIR: configDir },
		cwd: process.cwd(),
	});
	return JSON.parse(fs.readFileSync(path.join(dataDir, "events.json"), "utf-8"));
}

const future = (days) => new Date(Date.now() + days * 86400000).toISOString();

beforeEach(() => {
	dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-data-"));
	configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-config-"));
	fs.writeFileSync(
		path.join(dataDir, "football.json"),
		JSON.stringify({
			tournaments: [
				{ name: "Premier League", events: [{ title: "Liverpool vs Arsenal", time: future(2), homeTeam: "Liverpool", awayTeam: "Arsenal" }] },
			],
		})
	);
});

afterEach(() => {
	fs.rmSync(dataDir, { recursive: true, force: true });
	fs.rmSync(configDir, { recursive: true, force: true });
});

describe("build-events", () => {
	it("merges sport JSON files into events.json", () => {
		const events = runBuild();
		expect(events).toHaveLength(1);
		expect(events[0].sport).toBe("football");
		expect(events[0].tournament).toBe("Premier League");
	});

	it("merges curated configs with events arrays", () => {
		fs.writeFileSync(
			path.join(configDir, "biathlon-test.json"),
			JSON.stringify({ sport: "biathlon", name: "World Cup", events: [{ title: "Sprint", time: future(3) }] })
		);
		const events = runBuild();
		expect(events.map((e) => e.sport).sort()).toEqual(["biathlon", "football"]);
	});

	it("preserves ai-research events from the previous events.json", () => {
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "biathlon", title: "Mixed relay", time: future(5), source: "ai-research", confidence: "high", evidence: ["a", "b"] },
				{ sport: "football", title: "Old static event", time: future(1) },
			])
		);
		const events = runBuild();
		const aiEvents = events.filter((e) => e.source === "ai-research");
		expect(aiEvents).toHaveLength(1);
		expect(aiEvents[0].title).toBe("Mixed relay");
		// static events are rebuilt from source files, not carried over
		expect(events.find((e) => e.title === "Old static event")).toBeUndefined();
	});

	it("rescues an in-progress static event that dropped out of the latest fetch", () => {
		const startedAgo = new Date(Date.now() - 60 * 60000).toISOString(); // kicked off 1h ago → live
		// The live match is NOT in the current fetch (ESPN stops returning it once
		// it goes live) — only the later, not-yet-started match is.
		fs.writeFileSync(
			path.join(dataDir, "football.json"),
			JSON.stringify({ tournaments: [{ name: "FIFA World Cup", events: [
				{ title: "Later match", time: future(1), homeTeam: "A", awayTeam: "B" },
			] }] })
		);
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "football", tournament: "FIFA World Cup", title: "Egypt at Argentina", time: startedAgo,
				  homeTeam: "Argentina", awayTeam: "Egypt", streaming: [{ platform: "TV 2 Play" }],
				  verifiedAt: "2026-07-05T08:27:09Z", verificationStatus: "amended" },
				// A FUTURE static event missing from the fetch stays dropped (may be cancelled/moved).
				{ sport: "football", tournament: "FIFA World Cup", title: "Cancelled future", time: future(3), homeTeam: "C", awayTeam: "D" },
			])
		);
		const events = runBuild();
		const live = events.find((e) => e.title === "Egypt at Argentina");
		expect(live).toBeDefined();                       // the live match survived the rebuild
		expect(live.streaming).toEqual([{ platform: "TV 2 Play" }]); // with its verified channel
		expect(events.find((e) => e.title === "Cancelled future")).toBeUndefined(); // future drop stays dropped
	});

	it("keeps an agent-marked cancelled event on the board instead of dropping it", () => {
		// The cancelled match is gone from the fetch; only an unrelated match remains.
		fs.writeFileSync(
			path.join(dataDir, "football.json"),
			JSON.stringify({ tournaments: [{ name: "PL", events: [{ title: "Other", time: future(2) }] }] })
		);
		// Previous build: verify marked a real fixture cancelled (kept, not removed).
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "football", tournament: "PL", title: "Cancelled match", time: future(1), status: "cancelled", verificationStatus: "amended" },
			])
		);
		const events = runBuild();
		const c = events.find((e) => e.title === "Cancelled match");
		expect(c).toBeDefined();          // it stays on the board...
		expect(c.status).toBe("cancelled"); // ...still labelled cancelled
	});

	it("carries agent amendments (streaming, verification) onto re-fetched static events", () => {
		const time = future(2);
		fs.writeFileSync(
			path.join(dataDir, "football.json"),
			JSON.stringify({ tournaments: [{ name: "PL", events: [{ title: "Derby", time }] }] })
		);
		// Previous build: verify agent added streaming + verification to the static event
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{
					sport: "football", tournament: "PL", title: "Derby", time,
					streaming: [{ platform: "TV 2 Play" }],
					verifiedAt: "2026-07-03T05:30:00Z",
					verificationStatus: "confirmed",
				},
			])
		);
		const events = runBuild();
		const derby = events.find((e) => e.title === "Derby");
		expect(derby.streaming).toEqual([{ platform: "TV 2 Play" }]);
		expect(derby.verificationStatus).toBe("confirmed");
	});

	it("upgrades a generic landing URL to a deeper per-event URL from the previous build", () => {
		const time = future(2);
		// biathlon → rights map returns the NRK sport-section landing (tv.nrk.no/direkte, depth 1).
		fs.writeFileSync(
			path.join(configDir, "biathlon.json"),
			JSON.stringify({ sport: "biathlon", name: "IBU World Cup", events: [{ title: "Sprint", time }] })
		);
		// Previous build: verify found the real NRK programme page (deeper).
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "biathlon", tournament: "IBU World Cup", title: "Sprint", time,
				  streaming: [{ platform: "NRK", url: "https://tv.nrk.no/serie/skiskyting/sprint-abc" }] },
			])
		);
		const events = runBuild();
		const sprint = events.find((e) => e.title === "Sprint");
		expect(sprint.streaming[0].url).toBe("https://tv.nrk.no/serie/skiskyting/sprint-abc"); // deep URL survived, not clobbered by /direkte
	});

	it("lifts a bare broadcaster homepage to its sport/live section", () => {
		const time = future(2);
		fs.writeFileSync(
			path.join(dataDir, "football.json"),
			JSON.stringify({ tournaments: [{ name: "FIFA World Cup", events: [
				{ title: "Norway vs Brazil", time, homeTeam: "Norway", awayTeam: "Brazil" },
			] }] })
		);
		// Previous build: verify confirmed NRK but wrote the bare homepage URL.
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "football", tournament: "FIFA World Cup", title: "Norway vs Brazil", time, homeTeam: "Norway", awayTeam: "Brazil",
				  streaming: [{ platform: "NRK", url: "https://tv.nrk.no" }] },
			])
		);
		const events = runBuild();
		const m = events.find((e) => e.title === "Norway vs Brazil");
		expect(m.streaming[0].url).toBe("https://tv.nrk.no/direkte"); // homepage → sport/live section
	});

	it("keeps a confirmed channel instead of downgrading it to a tentative guess", () => {
		const time = future(2);
		// A World Cup fixture — resolveStreaming would produce the tentative NRK / TV 2 label.
		fs.writeFileSync(
			path.join(dataDir, "football.json"),
			JSON.stringify({ tournaments: [{ name: "FIFA World Cup 2026", events: [
				{ title: "Brazil vs Norway", time, homeTeam: "Brazil", awayTeam: "Norway" },
			] }] })
		);
		// Previous build: verify agent confirmed the real broadcaster (no tentative flag).
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "football", tournament: "FIFA World Cup 2026", title: "Brazil vs Norway", time,
				  streaming: [{ platform: "NRK", url: "https://tv.nrk.no" }] },
			])
		);
		const events = runBuild();
		const match = events.find((e) => e.title === "Brazil vs Norway");
		// Confirmed NRK is kept (not downgraded to the tentative NRK/TV 2 guess);
		// the bare homepage is lifted to NRK's live section.
		expect(match.streaming).toEqual([{ platform: "NRK", url: "https://tv.nrk.no/direkte" }]);
		expect(match.streaming.some((s) => s.tentative)).toBe(false);
	});

	it("dedupes ai-research events that a static fetcher now covers", () => {
		const time = future(2);
		fs.writeFileSync(
			path.join(dataDir, "football.json"),
			JSON.stringify({ tournaments: [{ name: "PL", events: [{ title: "Derby", time }] }] })
		);
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([{ sport: "football", title: "Derby", time, source: "ai-research", confidence: "low" }])
		);
		const events = runBuild();
		expect(events.filter((e) => e.title === "Derby")).toHaveLength(1);
		expect(events[0].source).toBeUndefined();
	});

	it("de-dupes an ai-research event a static fetcher already covers under a different start time", () => {
		const base = new Date(Date.now() + 2 * 86400000);
		const at = (h) => { const d = new Date(base); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
		const end = () => { const d = new Date(base.getTime() + 3 * 86400000); d.setUTCHours(20, 0, 0, 0); return d.toISOString(); };
		// Static ESPN event at 04:00 with the field data.
		fs.writeFileSync(
			path.join(dataDir, "golf.json"),
			JSON.stringify({ tournaments: [{ name: "PGA Tour", events: [
				{ title: "Genesis Scottish Open", time: at(4), endTime: end(), norwegian: true, norwegianPlayers: [{ name: "Viktor Hovland", teeTime: "09:39" }] },
			] }] })
		);
		// Previous build: the research agent re-added the SAME tournament at 06:00.
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "golf", tournament: "DP World Tour / PGA Tour", title: "Genesis Scottish Open", time: at(6), endTime: end(), source: "ai-research", confidence: "high", evidence: ["a", "b"] },
			])
		);
		const events = runBuild();
		const scottish = events.filter((e) => e.title === "Genesis Scottish Open");
		expect(scottish).toHaveLength(1);            // not two rows for the same tournament
		expect(scottish[0].source).toBeUndefined();  // kept the static one (carries the field/tee times)
	});

	it("grafts ai-research enrichment onto a bare static stub it dedupes against", () => {
		// Regression: ESPN's tennis feed lists "EFG Swiss Open Gstaad" as a bare
		// stub (no player, not norwegian) — off-interest, so the relevance filter
		// would drop it. The research agent's copy carries Casper Ruud + TV 2 Play.
		// The fuzzy-dedupe must merge that enrichment onto the stub, else BOTH copies
		// vanish (the real-world Gstaad / Ruud silent drop).
		const base = new Date(Date.now() + 3 * 86400000);
		const at = (h) => { const d = new Date(base); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
		const end = () => { const d = new Date(base.getTime() + 6 * 86400000); d.setUTCHours(16, 0, 0, 0); return d.toISOString(); };
		fs.writeFileSync(
			path.join(dataDir, "tennis.json"),
			JSON.stringify({ tournaments: [{ name: "ATP/WTA Tour", events: [
				{ title: "EFG Swiss Open Gstaad", time: at(4), endTime: end() },
			] }] })
		);
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "tennis", title: "Swiss Open Gstaad 2026 (Casper Ruud)", time: at(9), endTime: end(),
					norwegian: true, norwegianPlayers: [{ name: "Casper Ruud" }],
					streaming: [{ platform: "TV 2 Play", url: "https://play.tv2.no/sport" }],
					source: "ai-research", confidence: "high", evidence: ["a", "b"] },
			])
		);
		const events = runBuild();
		const gstaad = events.filter((e) => /gstaad/i.test(e.title));
		expect(gstaad).toHaveLength(1);                              // survives, not dropped
		expect(gstaad[0].norwegian).toBe(true);                     // enrichment grafted on
		// WP-05: "Casper Ruud" is a real tracked athlete entity (sport tennis), so
		// the enrichment pass stamps entityId — expected, not a regression.
		expect(gstaad[0].norwegianPlayers).toEqual([{ name: "Casper Ruud", entityId: "casper-ruud" }]);
		expect(gstaad[0].streaming).toEqual([{ platform: "TV 2 Play", url: "https://play.tv2.no/sport" }]);
		// And it must PERSIST: the next rebuild re-fetches the bare stub, so the
		// grafted enrichment has to carry forward or the event vanishes an hour later.
		const rebuilt = runBuild().filter((e) => /gstaad/i.test(e.title));
		expect(rebuilt).toHaveLength(1);
		expect(rebuilt[0].norwegian).toBe(true);
		expect(rebuilt[0].norwegianPlayers).toEqual([{ name: "Casper Ruud", entityId: "casper-ruud" }]);
		expect(rebuilt[0].streaming).toEqual([{ platform: "TV 2 Play", url: "https://play.tv2.no/sport" }]);
	});

	it("dedupes a World Cup knockout placeholder against the ai-research event, keeping the AI copy", () => {
		// Regression: ESPN re-emits knockout slots as bracket placeholders
		// ("Semifinal 2 Winner at Semifinal 1 Winner") whose title shares NO words
		// with the ai-research "VM-finalen 2026". The sport|title|time key misses
		// them and, before this fix, the title-only fuzzy check missed them too — so
		// both survived and verify had to remove the placeholder by hand every day.
		// They match on venue + exact kickoff; keep the human-titled, channel-confirmed
		// AI event and drop the placeholder.
		const time = future(4);
		fs.writeFileSync(
			path.join(dataDir, "football.json"),
			JSON.stringify({ tournaments: [{ name: "FIFA World Cup", events: [
				{ title: "Semifinal 2 Winner at Semifinal 1 Winner", time, round: "Finale",
				  homeTeam: "Semifinal 1 Winner", awayTeam: "Semifinal 2 Winner", venue: "MetLife Stadium" },
			] }] })
		);
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "football", tournament: "FIFA World Cup", title: "VM-finalen 2026", time,
				  round: "Finale", venue: "MetLife Stadium, East Rutherford, New Jersey",
				  streaming: [{ platform: "NRK", url: "https://tv.nrk.no/direkte" }],
				  source: "ai-research", confidence: "high", evidence: ["a", "b"],
				  verificationStatus: "confirmed" },
			])
		);
		const events = runBuild();
		const wc = events.filter((e) => e.tournament === "FIFA World Cup");
		expect(wc).toHaveLength(1);                                   // not two rows for the final
		expect(wc[0].title).toBe("VM-finalen 2026");                 // the human title won
		expect(wc[0].source).toBe("ai-research");                    // the placeholder was dropped
		expect(wc[0].streaming).toEqual([{ platform: "NRK", url: "https://tv.nrk.no/direkte" }]);
		// The placeholder team names must not leak onto the surviving event.
		expect(wc[0].awayTeam).not.toBe("Semifinal 2 Winner");
	});

	it("does NOT merge two different same-time matches at different venues", () => {
		// Safety: the venue path must not collapse unrelated fixtures. Two knockout
		// slots kick off at the same instant but at different stadiums — both stay.
		const time = future(4);
		fs.writeFileSync(
			path.join(dataDir, "football.json"),
			JSON.stringify({ tournaments: [{ name: "FIFA World Cup", events: [
				{ title: "Semifinal 2 Winner at Semifinal 1 Winner", time, homeTeam: "Semifinal 1 Winner", awayTeam: "Semifinal 2 Winner", venue: "MetLife Stadium" },
			] }] })
		);
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "football", tournament: "FIFA World Cup", title: "VM-bronsefinale", time,
				  venue: "Hard Rock Stadium, Miami Gardens, Florida",
				  source: "ai-research", confidence: "high", evidence: ["a", "b"] },
			])
		);
		const events = runBuild();
		const titles = events.filter((e) => e.tournament === "FIFA World Cup").map((e) => e.title).sort();
		expect(titles).toEqual(["Semifinal 2 Winner at Semifinal 1 Winner", "VM-bronsefinale"]);
	});

	it("filters out events older than 14 days", () => {
		fs.writeFileSync(
			path.join(dataDir, "football.json"),
			JSON.stringify({ tournaments: [{ name: "PL", events: [
				{ title: "Ancient", time: new Date(Date.now() - 20 * 86400000).toISOString() },
				{ title: "Upcoming", time: future(1) },
			] }] })
		);
		const events = runBuild();
		expect(events.map((e) => e.title)).toEqual(["Upcoming"]);
	});

	it("publishes tracked.json to the data dir when present in config", () => {
		fs.writeFileSync(path.join(configDir, "tracked.json"), JSON.stringify({ version: 1, leagues: [] }));
		runBuild();
		expect(fs.existsSync(path.join(dataDir, "tracked.json"))).toBe(true);
	});

	// WP-04: participation-form normalization.
	it("normalizes a freshly-built event's participation to canonical form (pushEvent)", () => {
		// Regression: the chess fetcher path used to emit norwegianPlayers: null and
		// bare-string participants (scripts/lib/event-normalizer.js). build-events.js's
		// own pushEvent() must guarantee the canonical shape regardless of what any
		// sport file emits.
		fs.writeFileSync(
			path.join(dataDir, "chess.json"),
			JSON.stringify({ tournaments: [{ name: "Sant Martí", events: [
				{ title: "Round 1", time: future(1), participants: ["Johan-Sebastian Christiansen"], norwegianPlayers: null },
			] }] })
		);
		const events = runBuild();
		const ev = events.find((e) => e.title === "Round 1");
		expect(ev).toBeDefined();
		expect(ev.participants).toEqual([{ name: "Johan-Sebastian Christiansen" }]);
		expect(ev.norwegianPlayers).toEqual([]);
	});

	it("normalizes a preserved ai-research event's participation to canonical form (bypasses pushEvent)", () => {
		// Regression: preserved ai-research / kept-on-board events are pushed
		// straight from a previous events.json (see the preservation pass), so they
		// never go through pushEvent(). The final pass over `kept` must catch them.
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "biathlon", title: "Mixed relay", time: future(5), source: "ai-research", confidence: "high", evidence: ["a", "b"],
				  participants: ["Johannes Thingnes Bø"], norwegianPlayers: null },
			])
		);
		const events = runBuild();
		const ev = events.find((e) => e.title === "Mixed relay");
		expect(ev).toBeDefined();
		expect(ev.participants).toEqual([{ name: "Johannes Thingnes Bø" }]);
		expect(ev.norwegianPlayers).toEqual([]);
	});

	it("keeps a non-broadly-followed event relevant when a tracked athlete appears only in participants", () => {
		// Regression: isRelevant()'s hay-building used to spread raw participants
		// strings; once participants became canonical {name} objects, a naive spread
		// would embed "[object Object]" instead of the name and silently break
		// interest matching for any event relying purely on participants (tennis,
		// chess) rather than norwegianPlayers/homeTeam/awayTeam.
		fs.writeFileSync(
			path.join(configDir, "interests.json"),
			JSON.stringify({ alwaysTrack: { athletes: ["Casper Ruud"] } })
		);
		fs.writeFileSync(
			path.join(dataDir, "tennis.json"),
			JSON.stringify({ tournaments: [{ name: "ATP Tour", events: [
				{ title: "R32 Match", time: future(2), participants: ["Casper Ruud", "Someone Else"] },
			] }] })
		);
		const events = runBuild();
		expect(events.find((e) => e.title === "R32 Match")).toBeDefined();
	});
});
