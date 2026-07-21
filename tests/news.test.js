// news.js (WP-103): docs/data/news.json — lens-ready news pointers built from
// the RSS digest × the entity index. Pointers only (id/title/link/source/sport/
// entityIds/publishedAt), never article text. Entity matching reuses the same
// word-boundary containsName the events pipeline uses, so the Brooklyn/Lyn
// substring trap (feed-vectors/DIVERGENCES.md §2) is avoided here too.
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { buildNews, matchEntityIds, newsEntityPool, NEWS_MAX_ITEMS } from "../scripts/lib/news.js";

const NOW = Date.parse("2026-07-19T12:00:00Z");

// A minimal entity index in the entities.json shape { id, name, aliases, sport, type }.
const ENTITIES = [
	{ id: "team:lyn", name: "Lyn", aliases: ["FK Lyn Oslo"], sport: "football", type: "team" },
	{ id: "team:arsenal", name: "Arsenal", aliases: ["Arsenal FC"], sport: "football", type: "team" },
	{ id: "athlete:carlsen", name: "Magnus Carlsen", aliases: ["Carlsen"], sport: "chess", type: "athlete" },
	{ id: "tournament:tdf", name: "Tour de France", aliases: [], sport: "cycling", type: "tournament" },
	{ id: "league:pl", name: "Premier League", aliases: [], sport: "football", type: "league" },
	// server-inert umbrella entities (WP-64) — must NOT become news entityIds
	{ id: "sport:football", name: "Fotball", aliases: [], sport: "football", type: "sport" },
	{ id: "category:winter", name: "Vintersport", aliases: [], sport: null, type: "category" },
];

function item(overrides = {}) {
	return {
		source: "nrk-sport",
		sport: "football",
		title: "Arsenal vant",
		description: "En kamp.",
		link: "https://example.com/" + Math.random().toString(36).slice(2),
		pubDate: "Sun, 19 Jul 2026 10:00:00 GMT",
		...overrides,
	};
}

describe("entity matching (word-boundary, reused from helpers)", () => {
	it("matches an entity named in the title or description", () => {
		const ids = matchEntityIds("Arsenal vant mot Tottenham", newsEntityPool(ENTITIES));
		expect(ids).toContain("team:arsenal");
	});

	it("matches on an alias too", () => {
		const ids = matchEntityIds("Magnus Carlsen vinner igjen — Carlsen dominerer", newsEntityPool(ENTITIES));
		expect(ids).toContain("athlete:carlsen");
	});

	it("does NOT match 'Lyn' inside 'Brooklyn' (the substring trap)", () => {
		const ids = matchEntityIds("Brooklyn FC klar for ny sesong", newsEntityPool(ENTITIES));
		expect(ids).not.toContain("team:lyn");
	});

	it("DOES match a real word-boundary 'Lyn' mention", () => {
		const ids = matchEntityIds("Vålerenga slo Lyn i derbyet", newsEntityPool(ENTITIES));
		expect(ids).toContain("team:lyn");
	});

	it("excludes server-inert sport/category umbrella entities", () => {
		// "Fotball" (sport) and "Vintersport" (category) present in the text must
		// never surface as entityIds — per-sport filtering is item.sport's job.
		const ids = matchEntityIds("Fotball og vintersport i vinter", newsEntityPool(ENTITIES));
		expect(ids).not.toContain("sport:football");
		expect(ids).not.toContain("category:winter");
	});

	it("de-duplicates repeated entity mentions to one id", () => {
		const ids = matchEntityIds("Arsenal, Arsenal, Arsenal FC", newsEntityPool(ENTITIES));
		expect(ids.filter((id) => id === "team:arsenal")).toHaveLength(1);
	});

	it("matches tournaments (a followable pointer)", () => {
		const ids = matchEntityIds("Tour de France starter i dag", newsEntityPool(ENTITIES));
		expect(ids).toContain("tournament:tdf");
	});

	it("WP-161: a ≤2-letter entity name never claims news (the CS2 org 'OG' vs. the Norwegian word 'og')", () => {
		// The world registry legitimately contains orgs whose names are everyday
		// words. Headlines have no sport context to gate on, so ultra-short terms
		// are excluded from NEWS matching only — the entity stays followable and
		// still matches events (sport-scoped there).
		const pool = newsEntityPool([
			...ENTITIES,
			{ id: "team:og", name: "OG", aliases: [], sport: "esports", type: "team" },
		]);
		expect(matchEntityIds("Warholm klar for NM og EM", pool)).not.toContain("team:og");
		// A ≥3-letter alias would still match — the gate is per-TERM, not per-entity.
		const poolWithAlias = newsEntityPool([
			{ id: "team:og", name: "OG", aliases: ["OG Esports"], sport: "esports", type: "team" },
		]);
		expect(matchEntityIds("OG Esports vant finalen", poolWithAlias)).toContain("team:og");
	});
});

describe("buildNews — item contract", () => {
	it("emits the pointer shape and nothing article-like", () => {
		const news = buildNews({
			digest: { items: [item({ link: "https://ex.com/a", title: "Arsenal vant", description: "Carlsen så på" })] },
			entities: ENTITIES,
			now: NOW,
		});
		expect(news.items).toHaveLength(1);
		const n = news.items[0];
		expect(n).toHaveProperty("id");
		expect(n).toHaveProperty("title", "Arsenal vant");
		expect(n).toHaveProperty("link", "https://ex.com/a");
		expect(n).toHaveProperty("source", "nrk-sport");
		expect(n).toHaveProperty("sport", "football");
		expect(n).toHaveProperty("publishedAt");
		expect(n.entityIds).toContain("team:arsenal");
		expect(n.entityIds).toContain("athlete:carlsen");
		// no article-body fields leak through
		expect(n).not.toHaveProperty("description");
		expect(n).not.toHaveProperty("_ts");
	});

	it("id is the sha1 of the link (stable across runs)", () => {
		const link = "https://ex.com/stable";
		const news = buildNews({ digest: { items: [item({ link })] }, entities: ENTITIES, now: NOW });
		expect(news.items[0].id).toBe(crypto.createHash("sha1").update(link).digest("hex"));
	});
});

describe("dedupe on link", () => {
	it("keeps only the first occurrence of a repeated link", () => {
		const link = "https://ex.com/dup";
		const news = buildNews({
			digest: {
				items: [
					item({ link, title: "First" }),
					item({ link, title: "Second (dup)" }),
				],
			},
			entities: ENTITIES,
			now: NOW,
		});
		expect(news.items).toHaveLength(1);
		expect(news.items[0].title).toBe("First");
	});
});

describe("cap + freshness window", () => {
	it("caps at NEWS_MAX_ITEMS, keeping the newest", () => {
		const items = [];
		for (let i = 0; i < NEWS_MAX_ITEMS + 25; i++) {
			// stagger pubDate by minutes so ordering is well-defined; all within 7 days
			const d = new Date(NOW - i * 60_000).toUTCString();
			items.push(item({ link: "https://ex.com/n" + i, pubDate: d }));
		}
		const news = buildNews({ digest: { items }, entities: ENTITIES, now: NOW });
		expect(news.items).toHaveLength(NEWS_MAX_ITEMS);
		// newest first: item n0 (most recent) survives, the oldest are cut
		expect(news.items[0].link).toBe("https://ex.com/n0");
	});

	it("drops items older than 7 days", () => {
		const news = buildNews({
			digest: {
				items: [
					item({ link: "https://ex.com/fresh", pubDate: new Date(NOW - 2 * 86_400_000).toUTCString() }),
					item({ link: "https://ex.com/stale", pubDate: new Date(NOW - 10 * 86_400_000).toUTCString() }),
				],
			},
			entities: ENTITIES,
			now: NOW,
		});
		const links = news.items.map((n) => n.link);
		expect(links).toContain("https://ex.com/fresh");
		expect(links).not.toContain("https://ex.com/stale");
	});

	it("sorts newest first", () => {
		const news = buildNews({
			digest: {
				items: [
					item({ link: "https://ex.com/old", pubDate: new Date(NOW - 3 * 3600_000).toUTCString() }),
					item({ link: "https://ex.com/new", pubDate: new Date(NOW - 1 * 3600_000).toUTCString() }),
					item({ link: "https://ex.com/mid", pubDate: new Date(NOW - 2 * 3600_000).toUTCString() }),
				],
			},
			entities: ENTITIES,
			now: NOW,
		});
		expect(news.items.map((n) => n.link)).toEqual([
			"https://ex.com/new",
			"https://ex.com/mid",
			"https://ex.com/old",
		]);
	});
});

describe("RFC 822 → ISO", () => {
	it("converts an RFC 822 pubDate to normalized ISO (UTC)", () => {
		const news = buildNews({
			digest: { items: [item({ link: "https://ex.com/t", pubDate: "Sun, 19 Jul 2026 04:01:57 GMT" })] },
			entities: ENTITIES,
			now: NOW,
		});
		expect(news.items[0].publishedAt).toBe("2026-07-19T04:01:57.000Z");
	});

	it("drops an item with an unparseable date (honest over guess)", () => {
		const news = buildNews({
			digest: {
				items: [
					item({ link: "https://ex.com/good", pubDate: "Sun, 19 Jul 2026 04:00:00 GMT" }),
					item({ link: "https://ex.com/bad", pubDate: "not a date" }),
					item({ link: "https://ex.com/missing", pubDate: undefined }),
				],
			},
			entities: ENTITIES,
			now: NOW,
		});
		const links = news.items.map((n) => n.link);
		expect(links).toEqual(["https://ex.com/good"]);
	});
});

describe("idempotency", () => {
	it("two builds over the same input emit byte-identical JSON", () => {
		const digest = {
			items: [
				item({ link: "https://ex.com/1", pubDate: new Date(NOW - 3600_000).toUTCString() }),
				item({ link: "https://ex.com/2", pubDate: new Date(NOW - 7200_000).toUTCString() }),
			],
		};
		const a = JSON.stringify(buildNews({ digest, entities: ENTITIES, now: NOW }), null, 2);
		const b = JSON.stringify(buildNews({ digest, entities: ENTITIES, now: NOW }), null, 2);
		expect(a).toBe(b);
		// and no run-timestamp field crept into the object
		expect(a).not.toMatch(/generatedAt|builtAt|"now"/);
	});
});

describe("empty / missing input never crashes", () => {
	it("returns { items: [] } for a missing digest", () => {
		expect(buildNews({ digest: undefined, entities: ENTITIES, now: NOW })).toEqual({ items: [] });
	});

	it("returns { items: [] } for a digest with no items", () => {
		expect(buildNews({ digest: {}, entities: ENTITIES, now: NOW })).toEqual({ items: [] });
	});

	it("tolerates a missing entity index (no entityIds, no throw)", () => {
		const news = buildNews({ digest: { items: [item({ link: "https://ex.com/x" })] }, entities: undefined, now: NOW });
		expect(news.items).toHaveLength(1);
		expect(news.items[0].entityIds).toEqual([]);
	});

	it("skips items without a link (no stable id)", () => {
		const news = buildNews({
			digest: { items: [item({ link: undefined }), item({ link: "https://ex.com/ok" })] },
			entities: ENTITIES,
			now: NOW,
		});
		expect(news.items.map((n) => n.link)).toEqual(["https://ex.com/ok"]);
	});

	it("no-arg call does not throw and returns empty items", () => {
		expect(buildNews()).toEqual({ items: [] });
	});
});
