import { describe, it, expect } from "vitest";
import { parseRssItems, isNorwegianRelevant, filterRecent, applyPerSportCap } from "../scripts/fetch-rss.js";
import { buildRssContext } from "../scripts/generate-featured.js";

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Test Feed</title>
<item>
  <title>Hovland wins Phoenix Open with record score</title>
  <description>Viktor Hovland shot a final-round 63 to win by 4 strokes.</description>
  <link>https://example.com/hovland</link>
  <pubDate>${new Date().toUTCString()}</pubDate>
  <category>Golf</category>
  <category>PGA Tour</category>
</item>
<item>
  <title>Arsenal beat Liverpool 3-1 at the Emirates</title>
  <description>Saka scored twice as Arsenal extended their lead.</description>
  <link>https://example.com/arsenal</link>
  <pubDate>${new Date().toUTCString()}</pubDate>
  <category>Football</category>
</item>
<item>
  <title>Random cricket news from Australia</title>
  <description>Australia won the test series against India.</description>
  <link>https://example.com/cricket</link>
  <pubDate>${new Date().toUTCString()}</pubDate>
  <category>Cricket</category>
</item>
<item>
  <title><![CDATA[Kl&aelig;bo dominates 15km classic]]></title>
  <description><![CDATA[Johannes H&oslash;sflot Klæbo won by 30 seconds.]]></description>
  <link>https://example.com/klaebo</link>
  <pubDate>${new Date(Date.now() - 48 * 60 * 60 * 1000).toUTCString()}</pubDate>
</item>
</channel>
</rss>`;

describe("parseRssItems()", () => {
	it("parses standard RSS items", () => {
		const items = parseRssItems(SAMPLE_RSS);
		expect(items).toHaveLength(4);
		expect(items[0].title).toBe("Hovland wins Phoenix Open with record score");
		expect(items[0].link).toBe("https://example.com/hovland");
		expect(items[0].categories).toEqual(["Golf", "PGA Tour"]);
	});

	it("handles CDATA sections", () => {
		const items = parseRssItems(SAMPLE_RSS);
		const klaebo = items[3];
		expect(klaebo.title).toContain("bo dominates 15km classic");
	});

	it("decodes HTML entities in descriptions", () => {
		const items = parseRssItems(SAMPLE_RSS);
		expect(items[0].description).toContain("Viktor Hovland");
	});

	it("returns empty array for invalid XML", () => {
		const items = parseRssItems("not xml at all");
		expect(items).toEqual([]);
	});

	it("returns empty array for empty string", () => {
		const items = parseRssItems("");
		expect(items).toEqual([]);
	});

	it("truncates long descriptions", () => {
		const longDesc = "A".repeat(500);
		const xml = `<rss><channel><item><title>Test</title><description>${longDesc}</description></item></channel></rss>`;
		const items = parseRssItems(xml);
		expect(items[0].description.length).toBeLessThanOrEqual(200);
	});
});

describe("isNorwegianRelevant()", () => {
	it("always returns true for Norwegian-language feeds", () => {
		const item = { title: "Random news about anything", description: "", categories: [] };
		expect(isNorwegianRelevant(item, "no")).toBe(true);
	});

	it("matches Norwegian athlete names in title", () => {
		const item = { title: "Hovland wins Phoenix Open", description: "", categories: [] };
		expect(isNorwegianRelevant(item, "en")).toBe(true);
	});

	it("matches Norwegian athlete names in description", () => {
		const item = { title: "Golf results", description: "Viktor Hovland shot -12", categories: [] };
		expect(isNorwegianRelevant(item, "en")).toBe(true);
	});

	it("matches keywords in categories", () => {
		const item = { title: "Race results", description: "", categories: ["Olympic", "Biathlon"] };
		expect(isNorwegianRelevant(item, "en")).toBe(true);
	});

	it("rejects irrelevant English articles", () => {
		const item = { title: "Random cricket news", description: "Australia won", categories: ["Cricket"] };
		expect(isNorwegianRelevant(item, "en")).toBe(false);
	});

	it("matches chess keywords", () => {
		const item = { title: "Carlsen wins rapid tournament", description: "", categories: [] };
		expect(isNorwegianRelevant(item, "en")).toBe(true);
	});

	it("matches winter sports keywords", () => {
		const item = { title: "Biathlon relay results from Cortina", description: "", categories: [] };
		expect(isNorwegianRelevant(item, "en")).toBe(true);
	});
});

describe("filterRecent()", () => {
	it("keeps items from last 24 hours", () => {
		const items = [
			{ pubDate: new Date().toUTCString() },
			{ pubDate: new Date(Date.now() - 12 * 60 * 60 * 1000).toUTCString() },
		];
		const recent = filterRecent(items, 24);
		expect(recent).toHaveLength(2);
	});

	it("filters out old items", () => {
		const items = [
			{ pubDate: new Date().toUTCString() },
			{ pubDate: new Date(Date.now() - 48 * 60 * 60 * 1000).toUTCString() },
		];
		const recent = filterRecent(items, 24);
		expect(recent).toHaveLength(1);
	});

	it("keeps items without dates", () => {
		const items = [{ pubDate: "" }, { pubDate: null }];
		const recent = filterRecent(items, 24);
		expect(recent).toHaveLength(2);
	});
});

describe("buildRssContext()", () => {
	it("returns empty string for null digest", () => {
		expect(buildRssContext(null)).toBe("");
	});

	it("returns empty string for empty items", () => {
		expect(buildRssContext({ items: [] })).toBe("");
	});

	it("formats headlines with sport tags", () => {
		const digest = {
			items: [
				{ source: "espn-golf", sport: "golf", title: "Hovland wins" },
				{ source: "nrk-sport", sport: "general", title: "OL-gull for Norge" },
			],
		};
		const result = buildRssContext(digest);
		expect(result).toContain("[golf] Hovland wins");
		expect(result).toContain("[nrk-sport] OL-gull");
		expect(result).toContain("Recent sports news headlines");
	});

	it("limits to 15 items", () => {
		const items = Array.from({ length: 20 }, (_, i) => ({
			source: "test", sport: "football", title: `Item ${i}`,
		}));
		const result = buildRssContext({ items });
		const lines = result.split("\n").filter((l) => l.trim().startsWith("["));
		expect(lines).toHaveLength(15);
	});
});

describe("rss-digest.json output shape", () => {
	it("should match expected schema", () => {
		const output = {
			lastUpdated: new Date().toISOString(),
			itemCount: 2,
			items: [
				{ source: "nrk-sport", sport: "general", title: "Test", description: "Desc", link: "https://example.com", pubDate: new Date().toUTCString() },
				{ source: "bbc-football", sport: "football", title: "Test 2", description: "Desc 2", link: "https://example.com/2", pubDate: new Date().toUTCString() },
			],
		};

		expect(output).toHaveProperty("lastUpdated");
		expect(output).toHaveProperty("itemCount");
		expect(output).toHaveProperty("items");
		expect(Array.isArray(output.items)).toBe(true);
		expect(output.items[0]).toHaveProperty("source");
		expect(output.items[0]).toHaveProperty("sport");
		expect(output.items[0]).toHaveProperty("title");
	});
});

describe("applyPerSportCap()", () => {
	function makeItem(sport, title, pubDate = new Date().toUTCString()) {
		return { sport, title, pubDate };
	}

	it("returns all items when under cap", () => {
		const items = [makeItem("football", "A"), makeItem("golf", "B")];
		const result = applyPerSportCap(items, 40, 3);
		expect(result).toHaveLength(2);
	});

	it("guarantees minPerSport items per sport even when general-sport items dominate", () => {
		// 20 general items + 2 football items — football would be dropped by pure date cap of 10
		const generalItems = Array.from({ length: 20 }, (_, i) =>
			makeItem("general", `General ${i}`, new Date(Date.now() - i * 1000).toUTCString())
		);
		const footballItems = [
			makeItem("football", "Football A", new Date(Date.now() - 25000).toUTCString()),
			makeItem("football", "Football B", new Date(Date.now() - 26000).toUTCString()),
		];
		const items = [...generalItems, ...footballItems];
		const result = applyPerSportCap(items, 10, 3);
		const footballInResult = result.filter(i => i.sport === "football");
		expect(footballInResult).toHaveLength(2);
		expect(result).toHaveLength(10);
	});

	it("does not exceed cap even when minPerSport guaranteed items fill it", () => {
		// 5 sports * 3 items = 15 guaranteed items, with cap=10 → still capped at 10
		const sports = ["football", "golf", "tennis", "formula1", "chess"];
		const items = sports.flatMap(s =>
			Array.from({ length: 3 }, (_, i) => makeItem(s, `${s} ${i}`))
		);
		const result = applyPerSportCap(items, 10, 3);
		expect(result.length).toBeLessThanOrEqual(10);
	});

	it("preserves at most minPerSport items per sport in the guaranteed set", () => {
		const items = Array.from({ length: 10 }, (_, i) =>
			makeItem("football", `Football ${i}`, new Date(Date.now() - i * 1000).toUTCString())
		);
		// With minPerSport=3, only first 3 football items are guaranteed
		// Fill with cap=5 → 3 guaranteed + 2 remaining football = 5
		const result = applyPerSportCap(items, 5, 3);
		expect(result).toHaveLength(5);
		expect(result.every(i => i.sport === "football")).toBe(true);
	});

	it("result is sorted newest-first", () => {
		const now = Date.now();
		const items = [
			makeItem("general", "Old", new Date(now - 10000).toUTCString()),
			makeItem("football", "Newest", new Date(now).toUTCString()),
			makeItem("golf", "Middle", new Date(now - 5000).toUTCString()),
		];
		const result = applyPerSportCap(items, 10, 3);
		expect(result[0].title).toBe("Newest");
		expect(result[result.length - 1].title).toBe("Old");
	});

	it("handles items with missing sport by treating as general", () => {
		const items = [
			{ title: "No sport", pubDate: new Date().toUTCString() },
			makeItem("football", "Football A"),
		];
		const result = applyPerSportCap(items, 10, 3);
		expect(result).toHaveLength(2);
	});
});
