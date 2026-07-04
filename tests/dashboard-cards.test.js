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

describe("whereToWatch — the core 'hvor kan jeg se det'", () => {
	it("links a channel when a url is present", () => {
		const html = dash.whereToWatch({ streaming: [{ platform: "NRK 1", url: "https://tv.nrk.no" }] });
		expect(html).toContain("NRK 1");
		expect(html).toContain("tv.nrk.no");
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

describe("must-see selection follows the goal's priorities", () => {
	it("favorite, importance>=4, or Norwegian participation", () => {
		expect(dash.isMustSee({ isFavorite: true })).toBe(true);
		expect(dash.isMustSee({ importance: 4 })).toBe(true);
		expect(dash.isMustSee({ norwegian: true, norwegianPlayers: [{ name: "x" }] })).toBe(true);
		expect(dash.isMustSee({ importance: 2 })).toBe(false);
	});
});
