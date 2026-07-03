// docs/js/dashboard.js: card and block rendering produce sane HTML from fixture data.
import { describe, it, expect, beforeAll } from "vitest";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

let dash, sandbox;

beforeAll(() => {
	sandbox = createClientSandbox();
	loadClientScript(sandbox, "shared-constants.js");
	loadClientScript(sandbox, "sport-config.js");
	loadClientScript(sandbox, "asset-maps.js");
	loadClientScript(sandbox, "block-renderers.js");
	loadClientScript(sandbox, "dashboard.js");
	dash = sandbox.window.dashboard;
});

describe("dashboard event cards", () => {
	it("renders a match row with both team names", () => {
		const html = dash.timelineRow({
			id: "x", sport: "football", tournament: "Premier League",
			homeTeam: "Liverpool FC", awayTeam: "Arsenal FC",
			title: "Liverpool vs Arsenal",
			time: new Date(Date.now() + 3600000).toISOString(),
			streaming: [{ platform: "Viaplay", url: "https://viaplay.no" }],
		});
		expect(html).toContain("Liverpool");
		expect(html).toContain("Arsenal");
		expect(html).toContain("Viaplay");
	});

	it("marks must-see hero events (importance >= 4)", () => {
		const html = dash.heroCard({ id: "y", sport: "golf", title: "The Open", time: new Date().toISOString(), importance: 5 });
		expect(html).toContain("hero-card must");
	});

	it("adds an AI badge for ai-research events", () => {
		const html = dash.timelineRow({
			id: "z", sport: "biathlon", title: "Sprint",
			time: new Date().toISOString(),
			source: "ai-research", confidence: "high", evidence: ["https://a.no", "https://b.no"],
		});
		expect(html).toContain("ai-badge");
	});

	it("escapes HTML in event fields", () => {
		const html = dash.timelineRow({ id: "q", sport: "golf", title: "<script>alert(1)</script>", time: new Date().toISOString() });
		expect(html).not.toContain("<script>alert");
	});

	it("channel chips answer 'hvor kan jeg se det' — link when url, honest when unknown", () => {
		const withUrl = dash.channelChips({ streaming: [{ platform: "NRK 1", url: "https://tv.nrk.no" }] });
		expect(withUrl).toContain("NRK 1");
		expect(withUrl).toContain("tv.nrk.no");
		const none = dash.channelChips({ streaming: [] });
		expect(none).toContain("Kanal ukjent");
	});

	it("timeline row carries a channel chip for every event", () => {
		const html = dash.timelineRow({ id: "t", sport: "golf", title: "Round 1", time: new Date().toISOString(), streaming: [{ platform: "Viaplay" }] });
		expect(html).toContain("chip");
		expect(html).toContain("Viaplay");
	});
});

describe("dashboard brief blocks", () => {
	const ctx = () => ({
		allEvents: [], recentResults: null, standings: null,
		liveScores: {}, liveLeaderboard: null,
		relativeTime: () => "", _getTrackedGolferNames: () => new Set(),
	});

	it("renders headline and narrative blocks", () => {
		expect(dash.renderBlock({ type: "headline", text: "Stor kveld" }, ctx())).toContain("Stor kveld");
		expect(dash.renderBlock({ type: "narrative", text: "Tekst her." }, ctx())).toContain("Tekst her.");
	});

	it("falls back to _fallbackText when a structured block cannot resolve", () => {
		const html = dash.renderBlock(
			{ type: "match-preview", homeTeam: "Nowhere FC", awayTeam: "Nothing FC", _fallbackText: "Nowhere møter Nothing" },
			ctx()
		);
		expect(html).toContain("Nowhere møter Nothing");
	});

	it("returns empty string for unknown block types without fallback", () => {
		expect(dash.renderBlock({ type: "does-not-exist" }, ctx())).toBe("");
	});
});

describe("dashboard relative time", () => {
	it("formats future times in Norwegian", () => {
		expect(dash.relativeTime(new Date(Date.now() + 30 * 60000))).toMatch(/om \d+ min/);
		expect(dash.relativeTime(new Date(Date.now() + 5 * 3600000))).toMatch(/om \d+ t/);
	});

	it("labels ongoing events", () => {
		expect(dash.relativeTime(new Date(Date.now() - 30 * 60000))).toBe("pågår");
	});
});
