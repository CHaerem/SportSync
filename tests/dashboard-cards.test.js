// docs/js/dashboard.js — the calm agenda renders sane HTML from fixture data.
import { describe, it, expect, beforeAll } from "vitest";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

let dash;

beforeAll(() => {
	const sandbox = createClientSandbox();
	loadClientScript(sandbox, "shared-constants.js");
	loadClientScript(sandbox, "dashboard.js");
	loadClientScript(sandbox, "live.js");
	loadClientScript(sandbox, "detail.js");
	loadClientScript(sandbox, "followed.js");
	loadClientScript(sandbox, "chrome.js");
	dash = sandbox.window.dashboard;
});

const soon = () => new Date(Date.now() + 3600000).toISOString();

describe("agenda event row", () => {
	it("renders a match with both teams, time and channel in a flat row (no sport badge)", () => {
		const html = dash.eventRow({
			id: "x", sport: "football", tournament: "Premier League",
			homeTeam: "Liverpool FC", awayTeam: "Arsenal FC", title: "Liverpool vs Arsenal",
			time: soon(), streaming: [{ platform: "TV 2 Play", url: "https://tv2.no" }],
		});
		expect(html).toContain("Liverpool");
		expect(html).toContain("Arsenal");
		expect(html).toContain("TV 2 Play");
		expect(html).toContain("ev-time");
		// Pinned v1 look → now DESIGN.md: sport is signalled by the content, not an
		// emoji sticker in a rounded box. The per-row sport badge is gone.
		expect(html).not.toContain("ev-badge");
	});

	it("renders a non-match event by its title", () => {
		const html = dash.eventRow({ id: "g", sport: "golf", tournament: "PGA Tour", title: "The Open", time: soon() });
		expect(html).toContain("The Open");
	});

	it("gently marks must-see events (no loud card)", () => {
		const fav = dash.eventRow({ id: "f", sport: "golf", title: "Hovland", time: soon(), isFavorite: true });
		expect(fav).toContain('class="ev must"');
		const plain = dash.eventRow({ id: "p", sport: "golf", title: "Random", time: soon() });
		expect(plain).toContain('class="ev"');
		expect(plain).not.toContain("ev must");
	});

	it("makes ai-research events expandable, with sources in the detail (no loud badge)", () => {
		const e = { id: "z", sport: "biathlon", title: "Sprint", time: soon(), source: "ai-research", confidence: "high", evidence: ["https://a.no", "https://b.no"] };
		const row = dash.eventRow(e);
		expect(row).toContain("expandable");
		expect(row).not.toContain("ai-badge"); // provenance is folded into the tap-to-expand detail
		const detail = dash.eventDetail(e);
		expect(detail).toContain("Funnet av AI");
		expect(detail).toContain("kilde 1");
	});

	it("shows both country teams by name, with no flag emoji in the chrome", () => {
		const html = dash.eventTitle({ homeTeam: "Norway", awayTeam: "Brazil" });
		expect(html).toContain("Norway");
		expect(html).toContain("Brazil");
		expect(html).toContain("–"); // the two teams, joined
		// Pinned v1 look → now DESIGN.md: emoji is forbidden in the chrome (only
		// the amber must-see dot + the plain team names carry the row).
		expect(html).not.toContain("🇳🇴");
		expect(html).not.toContain("🇧🇷");
	});

	it("shows round context when present (e.g. WC knockout round)", () => {
		const html = dash.eventRow({ id: "w", sport: "football", homeTeam: "Brazil", awayTeam: "Norway", time: soon(), round: "Åttedelsfinale", tournament: "FIFA World Cup" });
		expect(html).toContain("ev-round");
		expect(html).toContain("Åttedelsfinale");
	});

	it("escapes HTML in event fields", () => {
		const html = dash.eventRow({ id: "q", sport: "golf", title: "<script>alert(1)</script>", time: soon() });
		expect(html).not.toContain("<script>alert");
	});
});

describe("cancelled / postponed matches stay on the board, labelled", () => {
	it("shows a cancelled match faded with an 'Avlyst' label instead of a channel", () => {
		const html = dash.eventRow({ id: "c", sport: "football", title: "Barcelona vs X", time: soon(), status: "cancelled", streaming: [{ platform: "TV3" }] });
		expect(html).toContain("Avlyst");
		expect(html).toContain("cancelled");   // dims the row
		expect(html).not.toContain("TV3");      // channel is moot when cancelled
	});
	it("labels a postponed match 'Utsatt'", () => {
		const html = dash.eventRow({ id: "p", sport: "football", title: "Y", time: soon(), status: "postponed" });
		expect(html).toContain("Utsatt");
	});
	it("leaves a normal match unaffected", () => {
		const html = dash.eventRow({ id: "n", sport: "football", title: "Z", time: soon(), streaming: [{ platform: "NRK" }] });
		expect(html).not.toContain("cancelled");
		expect(html).toContain("NRK");
	});
});

describe("finished matches show their result, not a channel", () => {
	const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
	it("shows 'Ferdig' + the score for a completed football match", () => {
		dash.liveScores = {};
		dash.recentResults = { football: [{ homeTeam: "Argentina", awayTeam: "Egypt", homeScore: 2, awayScore: 1 }] };
		const html = dash.eventRow({ id: "f1", sport: "football", title: "Argentina vs Egypt", homeTeam: "Argentina", awayTeam: "Egypt", time: hoursAgo(2), streaming: [{ platform: "TV 2 Play" }] });
		expect(html).toContain("Ferdig");
		expect(html).toContain("2–1");
		expect(html).toContain("done");
		expect(html).not.toContain("TV 2 Play"); // it's over — not "watch here"
	});
	it("marks a clearly-ended football match finished even without a score", () => {
		dash.liveScores = {};
		dash.recentResults = { football: [] };
		const html = dash.eventRow({ id: "f2", sport: "football", title: "A vs B", homeTeam: "A", awayTeam: "B", time: hoursAgo(3) });
		expect(html).toContain("Ferdig");
		expect(html).toContain("done");
	});
	it("does not guess 'finished' for an open-ended entry (non-football, no endTime)", () => {
		dash.liveScores = {};
		dash.recentResults = null;
		const html = dash.eventRow({ id: "f3", sport: "tennis", title: "Some tournament", time: hoursAgo(5) });
		expect(html).not.toContain("done");
	});
});

describe("progressive disclosure detail", () => {
	it("only marks rows expandable when there's genuinely more to show", () => {
		const bare = { id: "b", sport: "chess", title: "Round 3", time: soon() };
		expect(dash.hasDetail(bare)).toBe(false);
		const rich = { id: "r", sport: "golf", title: "The Open", time: soon(), venue: "Royal Portrush" };
		expect(dash.hasDetail(rich)).toBe(true);
	});

	it("builds a Norwegian-channel 'Se på' line in the detail", () => {
		const html = dash.eventDetail({ sport: "football", title: "x", streaming: [{ platform: "NRK", url: "https://tv.nrk.no" }, { platform: "TV 2 Play" }] });
		expect(html).toContain("Se på");
		expect(html).toContain("NRK");
		expect(html).toContain("TV 2 Play");
	});
});

describe("golf detail: who plays, tee times, featured group", () => {
	it("lists each Norwegian with tee time and their marquee groupmates", () => {
		const html = dash.eventDetail({
			sport: "golf", title: "Genesis Scottish Open", time: soon(),
			norwegianPlayers: [{ name: "Viktor Hovland", teeTime: "09:39" }, { name: "Kristoffer Reitan", teeTime: "09:06" }],
			featuredGroups: [
				{ player: "Viktor Hovland", teeTime: "09:39", groupmates: [{ name: "Wyndham Clark" }, { name: "Eugenio Chacarra" }] },
				{ player: "Kristoffer Reitan", teeTime: "09:06", groupmates: [{ name: "Xander Schauffele" }, { name: "Adam Scott" }] },
			],
			totalPlayers: 156,
		});
		expect(html).toContain("Viktor Hovland");
		expect(html).toContain("09:39");                 // tee time
		expect(html).toContain("Wyndham Clark");          // groupmate
		expect(html).toContain("Eugenio Chacarra");
		expect(html).toContain("Kristoffer Reitan");
		expect(html).toContain("156");                    // field size
	});
	it("shows a Norwegian without tee data as simply in the field", () => {
		const html = dash.eventDetail({ sport: "golf", title: "US Open", time: soon(), norwegianPlayers: [{ name: "Kristoffer Ventura" }] });
		expect(html).toContain("Kristoffer Ventura");
		expect(html).toContain("i feltet");
	});
	it("shows a cut player's status verbatim, never a tee time or «i feltet» (WP-95)", () => {
		const html = dash.eventDetail({
			sport: "golf", title: "The Open", time: soon(),
			norwegianPlayers: [
				{ name: "Viktor Hovland", teeTime: null, teeTimeUTC: null, status: "røk cutten" },
				{ name: "Kristoffer Reitan", teeTime: "15:50", status: null },
			],
			featuredGroups: [{ player: "Kristoffer Reitan", teeTime: "15:50", groupmates: [{ name: "Shane Lowry" }] }],
			totalPlayers: 156,
		});
		expect(html).toContain("Kristoffer Reitan");
		expect(html).toContain("15:50");                 // active player keeps his tee
		// Hovland's own row shows the cut status verbatim, not a tee or «i feltet».
		expect(html).toContain('<span class="d-k">Viktor Hovland</span><span class="d-v">røk cutten</span>');
	});
});

describe("stage-race detail (TdF): Norwegian squad + current context", () => {
	it("surfaces the Norwegian riders (deduped) and the current-stage note", () => {
		const stages = [
			{ title: "Etappe 1", time: new Date(Date.now() - 86400000).toISOString(), norwegianPlayers: [{ name: "Tobias Halland Johannessen" }, { name: "Jonas Abrahamsen" }] },
			{ title: "Etappe 2", time: new Date(Date.now() + 86400000).toISOString(), norwegianPlayers: [{ name: "Tobias Halland Johannessen" }, { name: "Søren Wærenskjold" }], summary: "Uno-X jakter etappeseier; Johannessen 4. sammenlagt." },
		];
		const html = dash.seriesDetail({ isSeries: true, stages, nextStage: stages[1] });
		expect(html).toContain("Norske");
		expect(html).toContain("Tobias Halland Johannessen");
		expect(html).toContain("Søren Wærenskjold"); // union across stages
		expect(html).toContain("Nå");
		expect(html).toContain("sammenlagt");          // current context from the summary
	});
});

describe("F1 detail: championship + last race (data we already fetch)", () => {
	it("shows the F1 standings top and the previous race podium", () => {
		dash.standings = { f1: { drivers: [
			{ position: 1, driver: "Kimi Antonelli", team: "Mercedes", points: 179 },
			{ position: 2, driver: "George Russell", team: "Mercedes", points: 154 },
		] } };
		dash.recentResults = { f1: [{ raceName: "British Grand Prix", topDrivers: [
			{ position: 1, driver: "Charles Leclerc" }, { position: 2, driver: "George Russell" }, { position: 3, driver: "Lewis Hamilton" },
		] }] };
		const html = dash.eventDetail({ sport: "f1", title: "Belgian GP", time: soon() });
		expect(html).toContain("VM-stilling");
		expect(html).toContain("Kimi Antonelli");
		expect(html).toContain("179");
		expect(html).toContain("Forrige løp");
		expect(html).toContain("Charles Leclerc");
		expect(dash.hasDetail({ sport: "f1", title: "Belgian GP", time: soon() })).toBe(true);
	});
});

describe("whereToWatch — the core 'hvor kan jeg se det'", () => {
	it("links a channel when a url is present", () => {
		const html = dash.whereToWatch({ streaming: [{ platform: "NRK 1", url: "https://tv.nrk.no" }] });
		expect(html).toContain("NRK 1");
		expect(html).toContain("tv.nrk.no");
	});
	it("only links a tentative (shared-rights) channel to a tvkampen guide, never to one broadcaster", () => {
		expect(dash.streamLink({ platform: "TV 2 Play", url: "https://play.tv2.no/sport" })).toBe(true);           // confirmed → link
		expect(dash.streamLink({ platform: "NRK / TV 2", url: "https://tv.nrk.no", tentative: true })).toBe(false); // tentative broadcaster → don't link (misleads)
		expect(dash.streamLink({ platform: "NRK / TV 2", url: "https://www.tvkampen.com/kamp/x-1", tentative: true })).toBe(true); // tentative guide → link
	});
	it("renders a tentative WC chip as a tappable tvkampen guide link", () => {
		const html = dash.whereToWatch({ streaming: [{ platform: "NRK / TV 2", url: "https://www.tvkampen.com/kamp/x-1", tentative: true }] });
		expect(html).toContain("tvkampen.com/kamp/x-1");
		expect(html).toContain("<a ");
	});
	it("shows a faint dash when the channel is unknown (honest, not noisy)", () => {
		const html = dash.whereToWatch({ streaming: [] });
		expect(html).toContain("ev-where unknown");
		expect(html).toContain("–");
	});
	it("shows one primary channel plus a quiet +N when there are more", () => {
		const html = dash.whereToWatch({ streaming: [{ platform: "NRK 1" }, { platform: "TV 2" }, { platform: "Viaplay" }] });
		expect(html).toContain("NRK 1");   // primary channel
		expect(html).toContain("+2");       // the rest, quietly counted
		expect(html).not.toContain("Viaplay");
	});
});

describe("followed 'neste' index — answers 'when's X next?'", () => {
	const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();

	it("finds the next upcoming event for a followed entity, ignoring the agenda window", () => {
		dash.allEvents = [
			{ sport: "tennis", title: "Wimbledon final (Casper Ruud)", time: inDays(40) },
			{ sport: "tennis", title: "Swiss Open Gstaad (Casper Ruud)", time: inDays(6) },
		];
		const next = dash.nextEventForEntity({ name: "Casper Ruud", aliases: ["Ruud"], sport: "tennis" });
		expect(next.title).toContain("Swiss Open"); // the nearer one, though both are far out
	});

	it("is sport-scoped so a name collision in another sport doesn't match", () => {
		dash.allEvents = [{ sport: "cycling", title: "Etappe 5: Barcelona – Girona", time: inDays(1) }];
		expect(dash.nextEventForEntity({ name: "Barcelona", sport: "football" })).toBe(null);
	});

	it("renders an honest 'ikke satt opp ennå' when nothing is scheduled", () => {
		dash.allEvents = [];
		const html = dash.followRow({ name: "Aryan Tari", aliases: ["Tari"], sport: "chess" }, true);
		expect(html).toContain("no-event");
		expect(html).toContain("ikke satt opp ennå");
		expect(html).not.toContain("fn-detail");
	});

	it("renders a tappable row with a relative 'neste' + expandable detail when scheduled", () => {
		dash.allEvents = [{ sport: "esports", title: "BLAST Bounty – 100 Thieves", time: inDays(13), streaming: [{ platform: "Twitch" }] }];
		const html = dash.followRow({ name: "100 Thieves", aliases: ["100T"], sport: "esports" }, true);
		expect(html).toContain("has-event");
		expect(html).toMatch(/om \d+ dager/);
		expect(html).toContain("fn-detail");
		expect(html).toContain("Twitch");
	});

	it("escapes HTML in entity names", () => {
		dash.allEvents = [];
		const html = dash.followRow({ name: "<script>x</script>", sport: "chess" }, false);
		expect(html).not.toContain("<script>x");
	});

	it("surfaces a golfer's own tee time in the 'neste' row + detail", () => {
		dash.allEvents = [{
			sport: "golf", title: "Genesis Scottish Open", time: inDays(2),
			norwegianPlayers: [{ name: "Viktor Hovland", teeTime: "09:39" }],
			featuredGroups: [{ player: "Viktor Hovland", teeTime: "09:39", groupmates: [{ name: "Wyndham Clark" }] }],
		}];
		const html = dash.followRow({ name: "Viktor Hovland", aliases: ["Hovland"], sport: "golf" }, true);
		expect(html).toContain("09:39");        // tee time inline in the when-label
		expect(html).toContain("Tee-tid");      // and as a detail row
		expect(html).toContain("Wyndham Clark"); // marquee groupmate
	});

	it("omits the tee-tid row for a golfer with no tee time yet", () => {
		dash.allEvents = [{ sport: "golf", title: "US Open", time: inDays(3), norwegianPlayers: [{ name: "Kristoffer Ventura" }] }];
		const html = dash.followRow({ name: "Kristoffer Ventura", sport: "golf" }, true);
		expect(html).not.toContain("Tee-tid");
	});

	it("shows a cut golfer's status instead of «pågår nå» for the ongoing tournament (WP-95)", () => {
		// The tournament is live (window spans now) so relDay alone would say
		// «pågår nå», but this golfer is out — the row must show the status.
		dash.allEvents = [{
			sport: "golf", title: "The Open", time: inDays(-2), endTime: inDays(1),
			norwegianPlayers: [{ name: "Viktor Hovland", teeTime: null, teeTimeUTC: null, status: "røk cutten" }],
		}];
		const html = dash.followRow({ name: "Viktor Hovland", aliases: ["Hovland"], sport: "golf" }, true);
		expect(html).toContain("røk cutten");
		expect(html).not.toContain("pågår nå");
		expect(html).not.toContain("Tee-tid");
		expect(html).toContain("Status"); // and a calm status row in the detail
	});
});

describe("'Dine neste' top glance — upcoming-only, nearest first", () => {
	const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();

	it("keeps only followed entities with an upcoming event, sorted soonest-first", () => {
		dash.interests = { alwaysTrack: {
			athletes: [
				{ name: "Casper Ruud", aliases: ["Ruud"], sport: "tennis" },
				{ name: "Aryan Tari", aliases: ["Tari"], sport: "chess" }, // no event → excluded
			],
			teams: [{ name: "Lyn", sport: "football" }],
		} };
		dash.allEvents = [
			{ sport: "football", title: "Strømsgodset – Lyn", homeTeam: "Strømsgodset", awayTeam: "Lyn", time: inDays(18) },
			{ sport: "tennis", title: "Swiss Open (Casper Ruud)", time: inDays(6) },
		];
		const rows = dash.nextUpEntries();
		expect(rows.map((r) => r.entry.name)).toEqual(["Casper Ruud", "Lyn"]); // Tari dropped, Ruud (6d) before Lyn (18d)
	});

	it("returns nothing when no followed entity has an upcoming event (section stays hidden)", () => {
		dash.interests = { alwaysTrack: { athletes: [{ name: "Aryan Tari", sport: "chess" }], teams: [] } };
		dash.allEvents = [];
		expect(dash.nextUpEntries()).toEqual([]);
	});
});

describe("live leaderboard (golf/F1) — quiet line + expandable board", () => {
	it("golf: leader on the line, your Norwegians' live position, full board on expand", () => {
		const html = dash.liveGolfItem({
			name: "Genesis Scottish Open", state: "in",
			top: [{ pos: "1", player: "Tom Kim", score: "-5" }, { pos: "2", player: "Rory McIlroy", score: "-5" }],
			tracked: [{ pos: "26", player: "Viktor Hovland", score: "-2" }],
		});
		expect(html).toContain("Genesis Scottish Open");
		expect(html).toContain("Tom Kim");          // leader
		expect(html).toContain("Viktor Hovland");     // your player's live position
		expect(html).toContain("-2");
		expect(html).toContain('data-live="golf"');
		expect(html).toContain("mine");               // tracked player highlighted in the board
	});
	it("golf: shows the projected cut and flags a Norwegian outside it", () => {
		const html = dash.liveGolfItem({
			name: "X Open", state: "in",
			top: [{ pos: "1", player: "A Player", score: "-5" }],
			tracked: [{ pos: "95", player: "Kristoffer Reitan", score: "+1", out: true }],
			cut: { n: -1, label: "-1" },
		});
		expect(html).toContain("Antatt cut");
		expect(html).toContain("-1");
		expect(html).toContain("utenfor");   // Reitan flagged outside the cut
	});
	it("F1: session + leader on the line, running order on expand", () => {
		const html = dash.liveF1Item({ name: "Belgian GP", state: "in", session: "Race", top: [{ pos: "1", player: "Max Verstappen", team: "Red Bull" }] });
		expect(html).toContain("Belgian GP");
		expect(html).toContain("Race");
		expect(html).toContain("Max Verstappen");
		expect(html).toContain('data-live="f1"');
	});
});

describe("must-see selection follows the goal's priorities", () => {
	it("favorite, importance>=4, or Norwegian participation", () => {
		expect(dash.isMustSee({ isFavorite: true })).toBe(true);
		expect(dash.isMustSee({ importance: 4 })).toBe(true);
		expect(dash.isMustSee({ norwegian: true, norwegianPlayers: [{ name: "x" }] })).toBe(true);
		expect(dash.isMustSee({ importance: 2 })).toBe(false);
	});
});

// WP-02: loadData() must prefer the server's stable id (build-events.js hash)
// and only fall back to the old index-based synthesis for a payload from
// before that field existed. Uses its own sandbox so the stubbed fetch/response
// doesn't interfere with the shared `dash` instance used above.
describe("loadData: stable id from the server, index fallback for old payloads", () => {
	function sandboxWithEvents(events) {
		const sandbox = createClientSandbox();
		loadClientScript(sandbox, "shared-constants.js");
		loadClientScript(sandbox, "dashboard.js");
		loadClientScript(sandbox, "live.js");
		loadClientScript(sandbox, "detail.js");
		loadClientScript(sandbox, "followed.js");
		loadClientScript(sandbox, "chrome.js");
		sandbox.fetch = (url) => {
			const name = String(url).split("data/")[1]?.split("?")[0];
			if (name === "events.json") return Promise.resolve({ ok: true, json: () => Promise.resolve(events) });
			return Promise.resolve({ ok: false });
		};
		return sandbox.window.dashboard;
	}

	it("uses e.id from data when the server already sent one", async () => {
		const d = sandboxWithEvents([{ id: "abc123def456", sport: "football", title: "X", time: soon() }]);
		await d.loadData();
		expect(d.allEvents[0].id).toBe("abc123def456");
	});

	it("falls back to the index-based synthesis when a payload has no id (pre-WP-02)", async () => {
		const time = soon();
		const d = sandboxWithEvents([{ sport: "football", title: "Y", time }]);
		await d.loadData();
		expect(d.allEvents[0].id).toBe(`football|Y|${time}|0`);
	});

	it("keeps the live-score overlay keyed on the same id loadData assigned", async () => {
		// The live poller (pollFootballScores etc.) writes this.liveScores[matched.id]
		// using the SAME e.id set here — so whichever id source loadData picked
		// (server-sent or synthesized fallback), lookups by e.id must line up.
		const d = sandboxWithEvents([{ id: "liveid1", sport: "football", title: "Live match", time: soon() }]);
		await d.loadData();
		const id = d.allEvents[0].id;
		d.liveScores[id] = { home: 1, away: 0, state: "in" };
		const html = d.eventRow(d.allEvents[0]);
		expect(html).toContain("1–0"); // eventRow reads this.liveScores[e.id] and rendered the live score
	});
});
