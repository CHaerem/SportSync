// profile-ui.test.js — the follow/unfollow wiring end-to-end in the sandbox:
// followTargets → follow buttons → toggleFollow → the board re-personalises
// (hasProfile flips, interests fill, must-see accent follows). Proves Step 2b:
// the web board becomes YOURS once you follow something, and an empty profile is
// the catalog-wide fallback.

import { describe, it, expect, beforeEach } from "vitest";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

let W; // sandbox window
beforeEach(() => {
	const sandbox = createClientSandbox();
	Object.assign(sandbox, { TextEncoder, TextDecoder, btoa, atob, Uint8Array, crypto: globalThis.crypto });
	loadClientScript(sandbox, "shared-constants.js");
	loadClientScript(sandbox, "lens.js");
	loadClientScript(sandbox, "profile-sync.js");
	loadClientScript(sandbox, "dashboard.js");
	loadClientScript(sandbox, "detail.js");
	loadClientScript(sandbox, "profile-ui.js");
	W = sandbox.window;
	W.dashboard.catalog = { tier2: { teams: [], athletes: [], tournaments: [] } };
	W.dashboard.applyProfile(W.ssProfileLoad());
});

const matchEvent = () => ({
	id: "m1", sport: "football", title: "Liverpool – Arsenal",
	homeTeam: "Liverpool", homeTeamEntityId: "team-liverpool",
	awayTeam: "Arsenal", awayTeamEntityId: "team-arsenal",
	norwegianPlayers: [{ name: "Martin Ødegaard", entityId: "athlete-odegaard" }],
	time: "2026-07-21T18:00:00Z",
});

describe("followTargets", () => {
	it("returns each team (with its id) and each Norwegian player", () => {
		const t = W.dashboard.followTargets(matchEvent());
		expect(t.map((x) => x.entityId)).toEqual(["team-liverpool", "team-arsenal", "athlete-odegaard"]);
		expect(t[2].kind).toBe("athlete");
	});
	it("synthesizes a stable id when the event carries none", () => {
		const t = W.dashboard.followTargets({ sport: "golf", homeTeam: "", awayTeam: "", norwegianPlayers: [{ name: "Viktor Hovland" }] });
		expect(t[0].entityId).toBe("viktor hovland|golf");
	});
});

describe("followButtonsHtml", () => {
	it("labels each target 'Følg X' when not followed", () => {
		const html = W.dashboard.followButtonsHtml(matchEvent());
		expect(html).toContain("Følg Liverpool");
		expect(html).toContain('data-entity-id="team-liverpool"');
		expect(html).not.toContain("is-following");
	});
});

describe("toggleFollow → re-personalisation", () => {
	it("following a team flips hasProfile, fills interests, and marks it must-see", () => {
		expect(W.dashboard.hasProfile).toBe(false); // empty profile → catalog-wide
		// Simulate a click on Liverpool's follow button.
		const btn = { dataset: { entityId: "team-liverpool", entityName: "Liverpool", entitySport: "football", kind: "team", followState: "off" } };
		let rendered = 0;
		W.dashboard.render = () => { rendered++; };
		W.dashboard.toggleFollow(btn);
		expect(rendered).toBe(1);
		expect(W.ssProfileFollows("team-liverpool")).toBe(true);
		expect(W.dashboard.hasProfile).toBe(true);
		expect(W.dashboard.interests.alwaysTrack.teams.map((e) => e.name)).toContain("Liverpool");
		// The board now accents a Liverpool match (isMustSee via the tracked-team branch).
		expect(W.dashboard.isMustSee(matchEvent())).toBe(true);
	});

	it("unfollowing the last entity returns to the catalog-wide fallback", () => {
		const follow = { dataset: { entityId: "team-liverpool", entityName: "Liverpool", entitySport: "football", kind: "team", followState: "off" } };
		W.dashboard.render = () => {};
		W.dashboard.toggleFollow(follow);
		expect(W.dashboard.hasProfile).toBe(true);
		const unfollow = { dataset: { entityId: "team-liverpool", followState: "on" } };
		W.dashboard.toggleFollow(unfollow);
		expect(W.ssProfileFollows("team-liverpool")).toBe(false);
		expect(W.dashboard.hasProfile).toBe(false);
		expect(W.dashboard.interests).toBe(null);
	});
});

describe("whyShown — personal voice when you have a profile", () => {
	it("switches from 'som vi dekker' to the personal 'Fordi … følger'", () => {
		const btn = { dataset: { entityId: "team-liverpool", entityName: "Liverpool", entitySport: "football", kind: "team", followState: "off" } };
		W.dashboard.render = () => {};
		W.dashboard.toggleFollow(btn);
		const why = W.dashboard.whyShown(matchEvent());
		expect(why).toContain("Fordi");
		expect(why).toContain("Liverpool");
	});
});
