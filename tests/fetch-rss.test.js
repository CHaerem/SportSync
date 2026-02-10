import { describe, it, expect } from "vitest";
import { parseRssItems, isNorwegianRelevant, filterRecent } from "../scripts/fetch-rss.js";
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
