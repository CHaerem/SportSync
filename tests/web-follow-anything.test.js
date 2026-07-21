// web-follow-anything.test.js (WP-163) — the vanilla-user "follow anything" path
// on the web: search entities.json → follow directly, the assistant EXECUTES a
// follow, followTargets reuses the real entities.json id (no CRDT dupes), and the
// catalog is LAYERED under your follows (never collapsed away).
//
// All pure/DOM-free methods on the Dashboard prototype (bindFollowSearch/bindAssistant
// need real DOM and are exercised in the browser E2E instead).

import { describe, it, expect, beforeEach } from "vitest";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

let W;
beforeEach(() => {
	const sandbox = createClientSandbox();
	Object.assign(sandbox, { TextEncoder, TextDecoder, btoa, atob, Uint8Array, crypto: globalThis.crypto });
	loadClientScript(sandbox, "shared-constants.js");
	loadClientScript(sandbox, "lens.js");
	loadClientScript(sandbox, "profile-sync.js");
	loadClientScript(sandbox, "assistant.js");
	loadClientScript(sandbox, "dashboard.js");
	loadClientScript(sandbox, "detail.js");
	loadClientScript(sandbox, "followed.js");
	loadClientScript(sandbox, "profile-ui.js");
	W = sandbox.window;
	// A small entities.json fixture shaped like the real one (WP-160 folds tier2 in;
	// Liverpool stands in for that long-tail team that isn't on the board today).
	W.dashboard.entities = [
		{ id: "liverpool", name: "Liverpool", aliases: ["Liverpool FC", "LFC"], sport: "football", type: "team" },
		{ id: "arsenal", name: "Arsenal", aliases: ["Arsenal FC"], sport: "football", type: "team" },
		{ id: "lyn", name: "Lyn", aliases: ["FK Lyn Oslo"], sport: "football", type: "team" },
		{ id: "premier-league-2026-27", name: "Premier League 2026/27", aliases: ["Premier League"], sport: "football", type: "league" },
		{ id: "the-open-2026", name: "The Open 2026", aliases: ["The Open"], sport: "golf", type: "tournament" },
		{ id: "viktor-hovland", name: "Viktor Hovland", aliases: ["Hovland"], sport: "golf", type: "athlete" },
		// server-inert meta entity — must be EXCLUDED from the follow search
		{ id: "sport-football", name: "Fotball", aliases: ["football", "soccer"], sport: "football", type: "sport" },
	];
	W.dashboard.catalog = { tier2: { teams: [], athletes: [], tournaments: [] } };
	W.dashboard.render = () => {}; // DOM-free: neutralise the local re-render
	W.dashboard.applyProfile(W.ssProfileLoad());
});

describe("followableEntities — the long-tail, meta entities excluded", () => {
	it("keeps team/league/tournament/athlete, drops sport/category", () => {
		const types = W.dashboard.followableEntities().map((e) => e.type);
		expect(types).toContain("team");
		expect(types).toContain("league");
		expect(types).toContain("tournament");
		expect(types).toContain("athlete");
		expect(types).not.toContain("sport");
	});
});

describe("entityFollowKind — the profile bucket", () => {
	it("maps type → follow kind (league counts as team)", () => {
		expect(W.dashboard.entityFollowKind("team")).toBe("team");
		expect(W.dashboard.entityFollowKind("league")).toBe("team");
		expect(W.dashboard.entityFollowKind("tournament")).toBe("tournament");
		expect(W.dashboard.entityFollowKind("athlete")).toBe("athlete");
	});
});

describe("resolveEntity — real entities.json id via word-boundary match", () => {
	it("resolves a team name to its entity", () => {
		expect(W.dashboard.resolveEntity("Liverpool", "football").id).toBe("liverpool");
	});
	it("resolves via an alias", () => {
		expect(W.dashboard.resolveEntity("LFC", "football").id).toBe("liverpool");
	});
	it("is sport-scoped (no cross-sport collision)", () => {
		expect(W.dashboard.resolveEntity("Liverpool", "golf")).toBe(null);
	});
	it("never naive-substring matches (Brooklyn ≠ Lyn)", () => {
		expect(W.dashboard.resolveEntity("Brooklyn", "football")).toBe(null);
	});
	it("returns null with no entity index loaded", () => {
		W.dashboard.entities = [];
		expect(W.dashboard.resolveEntity("Liverpool", "football")).toBe(null);
	});
});

describe("searchEntities — the search box source", () => {
	it("matches on a name substring, ranked exact→prefix→substring", () => {
		const hits = W.dashboard.searchEntities("liver");
		expect(hits[0].id).toBe("liverpool");
	});
	it("matches on an alias", () => {
		expect(W.dashboard.searchEntities("hovland").map((e) => e.id)).toContain("viktor-hovland");
	});
	it("ignores queries under 2 chars", () => {
		expect(W.dashboard.searchEntities("l")).toEqual([]);
	});
	it("excludes the server-inert sport entity", () => {
		expect(W.dashboard.searchEntities("fotball").map((e) => e.id)).not.toContain("sport-football");
	});
});

describe("followTargets — reuses the REAL entities.json id (no CRDT dupes)", () => {
	it("looks up the real id when the event carries none", () => {
		const t = W.dashboard.followTargets({ sport: "football", homeTeam: "Liverpool", awayTeam: "Arsenal" });
		expect(t.map((x) => x.entityId)).toEqual(["liverpool", "arsenal"]);
		expect(t[0].kind).toBe("team");
	});
	it("prefers the event's server-stamped id over a lookup", () => {
		const t = W.dashboard.followTargets({ sport: "football", homeTeam: "Liverpool", homeTeamEntityId: "team-liverpool" });
		expect(t[0].entityId).toBe("team-liverpool");
	});
	it("falls back to the synthetic id when nothing resolves", () => {
		const t = W.dashboard.followTargets({ sport: "golf", norwegianPlayers: [{ name: "Ukjent Spiller" }] });
		expect(t[0].entityId).toBe("ukjent spiller|golf");
	});
});

describe("followSearchRow — calm, escaped, follow-state aware", () => {
	it("labels 'Følg' when not followed, 'Følger' after", () => {
		const before = W.dashboard.followSearchRow(W.dashboard.entities[0]);
		expect(before).toContain("Følg");
		expect(before).not.toContain("is-following");
		W.dashboard.commitFollow({ entityId: "liverpool", entityName: "Liverpool", sport: "football", kind: "team" });
		const after = W.dashboard.followSearchRow(W.dashboard.entities[0]);
		expect(after).toContain("Følger");
		expect(after).toContain("is-following");
	});
	it("escapes the entity name", () => {
		const html = W.dashboard.followSearchRow({ id: "x", name: "<script>alert(1)</script>", sport: "football", type: "team" });
		expect(html).not.toContain("<script>alert");
	});
});

describe("commitFollow / commitUnfollow — the shared write path", () => {
	it("following fills interests and flips hasProfile", () => {
		W.dashboard.commitFollow({ entityId: "liverpool", entityName: "Liverpool", sport: "football", kind: "team" });
		expect(W.ssProfileFollows("liverpool")).toBe(true);
		expect(W.dashboard.hasProfile).toBe(true);
		expect(W.dashboard.followed.alwaysTrack.teams.map((e) => e.name)).toContain("Liverpool");
	});
	it("unfollowing the last entity returns to the catalog-only fallback", () => {
		W.dashboard.commitFollow({ entityId: "liverpool", entityName: "Liverpool", sport: "football", kind: "team" });
		W.dashboard.commitUnfollow("liverpool");
		expect(W.ssProfileFollows("liverpool")).toBe(false);
		expect(W.dashboard.hasProfile).toBe(false);
		expect(W.dashboard.followed).toBe(null);
	});
});

describe("handleFollowIntent — the assistant EXECUTES the follow (WP-163)", () => {
	it("«følg Liverpool» resolves + commits, with a calm confirmation", () => {
		const res = W.dashboard.handleFollowIntent("Liverpool", false);
		expect(res.ok).toBe(true);
		expect(res.text).toContain("Følger Liverpool");
		expect(W.ssProfileFollows("liverpool")).toBe(true);
	});
	it("the assistant router → mutation → handled end-to-end", () => {
		const r = W.ssAssistant("følg Hovland", { events: [], interests: null, config: null, nowMs: Date.now() });
		expect(r.kind).toBe("mutation");
		const res = W.dashboard.handleFollowIntent(r.subject, r.unfollow);
		expect(res.ok).toBe(true);
		expect(W.ssProfileFollows("viktor-hovland")).toBe(true);
	});
	it("«slutt å følge Liverpool» tombstones the rule", () => {
		W.dashboard.handleFollowIntent("Liverpool", false);
		const res = W.dashboard.handleFollowIntent("Liverpool", true);
		expect(res.ok).toBe(true);
		expect(W.ssProfileFollows("liverpool")).toBe(false);
	});
	it("an unknown subject is an honest miss (never invents)", () => {
		const res = W.dashboard.handleFollowIntent("Klingon FC", false);
		expect(res.ok).toBe(false);
		expect(res.text).toContain("Fant ikke");
		expect(W.dashboard.hasProfile).toBe(false);
	});
	it("an empty subject asks who", () => {
		expect(W.dashboard.handleFollowIntent("", false).ok).toBe(false);
	});
});

describe("coverageRequestUrl — the WP-165 demand signal (search miss)", () => {
	it("builds a pre-filled public coverage-request issue URL (name + sport only)", () => {
		const url = W.dashboard.coverageRequestUrl("Liverpool", "football");
		expect(url.startsWith(`https://github.com/${W.SS_REPO}/issues/new?`)).toBe(true);
		const params = new URL(url).searchParams;
		expect(params.get("labels")).toBe("coverage-request");
		expect(params.get("title")).toBe("[dekning] Liverpool");
		// The body sections are the parse contract shared with scripts/lib/demand.js.
		const body = params.get("body");
		expect(body).toContain("### Entitet\n\nLiverpool");
		expect(body).toContain("### Sport\n\nfootball");
	});
	it("writes the (ikke satt) placeholder when no sport is known", () => {
		const body = new URL(W.dashboard.coverageRequestUrl("Vipers Kristiansand")).searchParams.get("body");
		expect(body).toContain("### Sport\n\n(ikke satt)");
	});
	it("carries no profile/device data — only the searched name + sport", () => {
		const body = new URL(W.dashboard.coverageRequestUrl("Brann", "football")).searchParams.get("body");
		expect(body.toLowerCase()).toContain("anonym");
		// The disclaimer says «ingen profil- eller enhetsdata»; what must NOT appear is
		// any actual transported identifier (a device/profile id, an entity id, storage keys).
		expect(body).not.toMatch(/ss-device|ss-profile|entityId|localStorage/i);
	});
});

describe("layered covers — following never collapses the catalog (WP-163)", () => {
	beforeEach(() => {
		W.dashboard.catalog = { tier2: {
			teams: [{ name: "Rosenborg", sport: "football" }],
			athletes: [{ name: "Casper Ruud", sport: "tennis" }],
			tournaments: [],
		} };
		W.dashboard.applyProfile(W.ssProfileLoad());
	});
	it("catalog stays the base covers layer after a follow", () => {
		W.dashboard.commitFollow({ entityId: "liverpool", entityName: "Liverpool", sport: "football", kind: "team" });
		// covers = catalog (unchanged); followed = your list (new)
		expect(W.dashboard.covers.alwaysTrack.teams.map((e) => e.name)).toContain("Rosenborg");
		expect(W.dashboard.followed.alwaysTrack.teams.map((e) => e.name)).toContain("Liverpool");
	});
	it("nextUpCandidates unions your follows + the catalog, de-duped by name", () => {
		W.dashboard.commitFollow({ entityId: "liverpool", entityName: "Liverpool", sport: "football", kind: "team" });
		const names = W.dashboard.nextUpCandidates().map((e) => W.ssEntityName(e));
		expect(names).toContain("Liverpool"); // your follow
		expect(names).toContain("Rosenborg"); // the catalog, still present
	});
	it("a name in both layers appears once", () => {
		W.dashboard.commitFollow({ entityId: "rosenborg", entityName: "Rosenborg", sport: "football", kind: "team" });
		const names = W.dashboard.nextUpCandidates().map((e) => W.ssEntityName(e));
		expect(names.filter((n) => n === "Rosenborg").length).toBe(1);
	});
});
