// season-proof-follows.test.js (WP-162) — a follow must never die silently at a
// season/edition change.
//
// The failure this pins: a profile rule FREEZES `entityId` + `entityName` at
// follow time. When next season's bookkeeping publishes a new edition, an
// edition-stamped id (`premier-league-2026-27`) resolves to nothing AND the
// stored name ("Premier League 2026/27") word-boundary-matches nothing in the
// new edition's title — the follow is gone without a single visible signal.
//
// Two defences, both tested here (the iOS twins live in
// SportivistaTests/SeasonProofFollowsTests.swift):
//   1. MATCHING  — lens.js term building carries the edition-stripped form, so a
//      rule created against the 2026 edition still matches the 2027 one.
//   2. MIGRATION — `ssMigrateProfileIds` re-points a rule onto the canonical id
//      published by build-entities.js (`altIds`), losslessly and idempotently.

import { describe, it, expect, beforeEach } from "vitest";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

let W;
beforeEach(() => {
	const sandbox = createClientSandbox();
	Object.assign(sandbox, { TextEncoder, TextDecoder, btoa, atob, Uint8Array, crypto: globalThis.crypto });
	loadClientScript(sandbox, "shared-constants.js");
	loadClientScript(sandbox, "lens.js");
	loadClientScript(sandbox, "profile-sync.js");
	W = sandbox.window;
});

/** The index as the server publishes it AFTER WP-162: canonical id + altIds. */
const ENTITIES = [
	{
		id: "premier-league", name: "Premier League", aliases: ["Premier League 2026/27", "EPL"],
		sport: "football", type: "tournament", edition: "2026/27", altIds: ["premier-league-2026-27"],
	},
	{
		id: "tour-de-france", name: "Tour de France 2026", aliases: ["Tour de France"],
		sport: "cycling", type: "tournament", edition: "2026", altIds: ["tour-de-france-2026"],
	},
	{ id: "liverpool", name: "Liverpool", aliases: ["Liverpool FC"], sport: "football", type: "team" },
];

/** A rule created LAST season, against the then-published edition id + name. */
function rule2026(overrides = {}) {
	return Object.assign({
		entityId: "premier-league-2026-27",
		entityName: "Premier League 2026/27",
		sport: "football",
		scope: null,
		weight: 0.5,
		reason: "Fulgt fra web",
		addedAt: "2026-08-01T10:00:00Z",
		lens: { sportAsSuch: {} },
		kind: "league",
	}, overrides);
}

describe("WP-162 · matching survives the edition change (web)", () => {
	it("a rule created against the 2026 edition matches a 2027 event", () => {
		const interests = W.ssProfileToInterests(
			W.ssUpdatingRules(W.ssEmptyState(), [rule2026()], "2026-08-01T10:00:00Z", "dev-a")
		);
		const event2027 = {
			sport: "football", time: "2027-08-14T14:00:00Z",
			title: "Liverpool – Arsenal", tournament: "Premier League 2027/28",
		};
		// The stored name is last season's; the stripped form is what matches.
		expect(W.ssMatchInterest("Premier League 2027/28", interests.alwaysTrack.teams)).not.toBeNull();
		expect(W.ssIsRelevant(event2027, interests, Date.parse("2027-08-14T00:00:00Z"))).toBe(true);
		expect(W.ssWhyShown(event2027, interests)).toContain("Premier League");

		// The load-bearing case: a sport NOT followed broadly, where relevance
		// depends ENTIRELY on the frozen rule still matching (football would have
		// been admitted by followBroadly regardless).
		const handball = W.ssProfileToInterests(W.ssUpdatingRules(W.ssEmptyState(), [rule2026({
			entityId: "ehf-champions-league-2026-27", entityName: "EHF Champions League 2026/27",
			sport: "handball", kind: "tournament",
		})], "2026-08-01T10:00:00Z", "dev-a"));
		const hb2027 = {
			sport: "handball", time: "2027-09-10T18:00:00Z",
			title: "Kolstad – Veszprém", tournament: "EHF Champions League 2027/28",
		};
		expect(W.ssIsRelevant(hb2027, handball, Date.parse("2027-09-10T00:00:00Z"))).toBe(true);
	});

	it("edition stripping is additive — it never widens a term into a different entity", () => {
		const terms = [{ name: "Tour de France Femmes 2026", sport: "cycling" }];
		// The stripped form is "Tour de France Femmes", NOT "Tour de France": a
		// substring-style widening would make the women's race match the men's.
		expect(W.ssMatchInterest("Tour de France 2027 – etappe 4", terms)).toBeNull();
		expect(W.ssMatchInterest("Tour de France Femmes 2027 – etappe 4", terms)).not.toBeNull();
	});

	it("ssEditionStripped mirrors the server + Swift twins", () => {
		expect(W.ssEditionStripped("Tour de France 2026")).toBe("Tour de France");
		expect(W.ssEditionStripped("The Open Championship 2026 (Royal Birkdale)")).toBe("The Open Championship");
		expect(W.ssEditionStripped("La Liga 2026/27")).toBe("La Liga");
		expect(W.ssEditionStripped("Liverpool")).toBe("Liverpool"); // nothing to strip
		expect(W.ssEditionStripped("100 Thieves")).toBe("100 Thieves"); // a digit run is not an edition
	});
});

describe("WP-162 · profile-id migration (web)", () => {
	it("re-points a rule from the former edition id onto the canonical one", () => {
		const state = W.ssUpdatingRules(W.ssEmptyState(), [rule2026()], "2026-08-01T10:00:00Z", "dev-a");
		const migrated = W.ssMigrateProfileIds(state, ENTITIES, "2027-07-01T00:00:00Z", "dev-a");
		const live = W.ssLiveRules(migrated);
		expect(live.map((r) => r.entityId)).toEqual(["premier-league"]);
		expect(live[0].entityName).toBe("Premier League");
		// Everything the user owns is carried over verbatim.
		expect(live[0].reason).toBe("Fulgt fra web");
		expect(live[0].addedAt).toBe("2026-08-01T10:00:00Z");
		// The move REPLICATES: the old id is tombstoned, not silently absent.
		const old = (migrated.rules || []).find((r) => r.rule.entityId === "premier-league-2026-27");
		expect(old.deleted).toBe(true);
	});

	it("is idempotent — a second pass finds nothing to do", () => {
		const state = W.ssUpdatingRules(W.ssEmptyState(), [rule2026()], "2026-08-01T10:00:00Z", "dev-a");
		const once = W.ssMigrateProfileIds(state, ENTITIES, "2027-07-01T00:00:00Z", "dev-a");
		expect(W.ssMigrateProfileIds(once, ENTITIES, "2027-07-02T00:00:00Z", "dev-a")).toBeNull();
	});

	it("is LOSSLESS — a rule it cannot re-ground is left exactly as it was", () => {
		const soft = rule2026({ entityId: "soft-erling-haaland", entityName: "Erling Haaland", kind: "athlete" });
		const state = W.ssUpdatingRules(W.ssEmptyState(), [rule2026(), soft], "2026-08-01T10:00:00Z", "dev-a");
		const migrated = W.ssMigrateProfileIds(state, ENTITIES, "2027-07-01T00:00:00Z", "dev-a");
		const live = W.ssLiveRules(migrated);
		expect(live.length).toBe(2); // NOTHING disappears
		expect(live.find((r) => r.entityId === "soft-erling-haaland")).toEqual(soft);
	});

	it("never duplicates when the canonical id is ALREADY followed", () => {
		const canon = rule2026({ entityId: "premier-league", entityName: "Premier League", kind: "tournament" });
		const state = W.ssUpdatingRules(W.ssEmptyState(), [rule2026(), canon], "2026-08-01T10:00:00Z", "dev-a");
		const migrated = W.ssMigrateProfileIds(state, ENTITIES, "2027-07-01T00:00:00Z", "dev-a");
		const live = W.ssLiveRules(migrated);
		expect(live.map((r) => r.entityId)).toEqual(["premier-league"]);
		expect(live[0]).toEqual(canon); // the existing follow is kept as-is
	});

	it("converges across devices instead of duplicating (the CRDT keys on entityId)", () => {
		const state = W.ssUpdatingRules(W.ssEmptyState(), [rule2026()], "2026-08-01T10:00:00Z", "dev-a");
		// Device A migrates; device B still holds the pre-migration copy.
		const a = W.ssMigrateProfileIds(state, ENTITIES, "2027-07-01T00:00:00Z", "dev-a");
		const { merged } = W.ssProfileMerge(a, state);
		expect(W.ssLiveRules(merged).map((r) => r.entityId)).toEqual(["premier-league"]);
	});

	it("no entities / no rules / no altIds → no write at all", () => {
		const state = W.ssUpdatingRules(W.ssEmptyState(), [rule2026()], "2026-08-01T10:00:00Z", "dev-a");
		expect(W.ssMigrateProfileIds(state, [], "2027-07-01T00:00:00Z", "dev-a")).toBeNull();
		expect(W.ssMigrateProfileIds(W.ssEmptyState(), ENTITIES, "2027-07-01T00:00:00Z", "dev-a")).toBeNull();
		expect(W.ssMigrateProfileIds(state, [{ id: "liverpool", name: "Liverpool" }], "2027-07-01T00:00:00Z", "dev-a")).toBeNull();
	});
});

describe("WP-162 · the published index is season-proof", () => {
	it("no live competition id in docs/data/entities.json carries an edition segment it could lose", async () => {
		const fs = await import("fs");
		const live = JSON.parse(fs.readFileSync(new URL("../docs/data/entities.json", import.meta.url), "utf8"));
		const dated = live.filter((e) => ["league", "tournament"].includes(e.type) && /-(?:19|20)\d{2}(?:-\d{2})?(?=-|$)/.test(e.id));
		// The only tolerated survivors are records whose canonical id is genuinely
		// taken by a DIFFERENT entity (build-entities logs and skips those).
		const byId = new Map(live.map((e) => [e.id, e]));
		for (const e of dated) {
			const canon = e.id.replace(/-(?:19|20)\d{2}(?:-\d{2})?(?=-|$)/g, "").replace(/-{2,}/g, "-");
			expect(byId.has(canon)).toBe(true); // skipped only because the id is taken
		}
	});
});
