// docs/js/dashboard.js — the calm agenda renders sane HTML from fixture data.
import { describe, it, expect, beforeAll } from "vitest";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

let dash;

beforeAll(() => {
	const sandbox = createClientSandbox();
	loadClientScript(sandbox, "shared-constants.js");
	loadClientScript(sandbox, "sport-config.js");
	loadClientScript(sandbox, "asset-maps.js");
	loadClientScript(sandbox, "dashboard.js");
	dash = sandbox.window.dashboard;
});

const soon = () => new Date(Date.now() + 3600000).toISOString();

describe("agenda event row", () => {
	it("renders a match with both teams, a sport badge, time and channel", () => {
		const html = dash.eventRow({
			id: "x", sport: "football", tournament: "Premier League",
			homeTeam: "Liverpool FC", awayTeam: "Arsenal FC", title: "Liverpool vs Arsenal",
			time: soon(), streaming: [{ platform: "TV 2 Play", url: "https://tv2.no" }],
		});
		expect(html).toContain("Liverpool");
		expect(html).toContain("Arsenal");
		expect(html).toContain("TV 2 Play");
		expect(html).toContain("ev-badge"); // sport visual anchor
		expect(html).toContain("ev-time");
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

	it("shows a national flag for country teams that have no club crest", () => {
		const html = dash.eventTitle({ homeTeam: "Norway", awayTeam: "Brazil" });
		expect(html).toContain("🇳🇴");
		expect(html).toContain("🇧🇷");
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
