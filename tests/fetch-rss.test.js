// fetch-rss: pure-function coverage — RSS parsing, recency filter, per-sport cap,
// Norwegian relevance. House style: import the exports, inline fixtures, no network.
import { describe, it, expect } from "vitest";
import { parseRssItems, filterRecent, applyPerSportCap, isNorwegianRelevant } from "../scripts/fetch-rss.js";

// --- parseRssItems ---

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>Feed</title>
<item>
  <title><![CDATA[Haaland scorer hat-trick &amp; jubler]]></title>
  <description><![CDATA[<p>Manchester City vant <b>5-0</b> mot Luton.</p>]]></description>
  <link>https://example.com/haaland</link>
  <pubDate>Mon, 13 Jul 2026 18:00:00 GMT</pubDate>
  <category>Football</category>
  <category><![CDATA[Premier League]]></category>
</item>
<item>
  <title>Ruud &amp; Alcaraz &#039;klare&#039; for &quot;finale&quot;</title>
  <link>https://example.com/ruud</link>
  <dc:date>2026-07-13T12:00:00Z</dc:date>
</item>
<item>
  <title>Long one</title>
  <description>${"x".repeat(300)}</description>
</item>
<item>
  <description>No title here — should be skipped</description>
</item>
</channel>
</rss>`;

describe("parseRssItems", () => {
	const items = parseRssItems(RSS_XML);

	it("parses items and skips those without a title", () => {
		expect(items).toHaveLength(3);
	});

	it("extracts title (CDATA + entity-decoded), link, pubDate and all categories", () => {
		const item = items[0];
		expect(item.title).toBe("Haaland scorer hat-trick & jubler");
		expect(item.link).toBe("https://example.com/haaland");
		expect(item.pubDate).toBe("Mon, 13 Jul 2026 18:00:00 GMT");
		expect(item.categories).toEqual(["Football", "Premier League"]);
	});

	it("strips HTML tags from descriptions", () => {
		expect(items[0].description).toBe("Manchester City vant 5-0 mot Luton.");
	});

	it("decodes entities in plain (non-CDATA) titles", () => {
		expect(items[1].title).toBe(`Ruud & Alcaraz 'klare' for "finale"`);
	});

	it("falls back to dc:date when pubDate is missing", () => {
		expect(items[1].pubDate).toBe("2026-07-13T12:00:00Z");
	});

	it("truncates descriptions to 200 chars", () => {
		expect(items[2].description).toHaveLength(200);
	});

	it("defaults missing optional fields (link, pubDate, categories)", () => {
		expect(items[2].link).toBe("");
		expect(items[2].pubDate).toBe("");
		expect(items[2].categories).toEqual([]);
	});

	it("returns [] for empty or item-less input", () => {
		expect(parseRssItems("")).toEqual([]);
		expect(parseRssItems("<rss><channel><title>tom</title></channel></rss>")).toEqual([]);
	});
});

// --- filterRecent ---

describe("filterRecent", () => {
	const hoursOld = (h) => new Date(Date.now() - h * 60 * 60 * 1000).toUTCString();
	const items = [
		{ title: "fresh", pubDate: hoursOld(1) },
		{ title: "stale", pubDate: hoursOld(48) },
		{ title: "undated", pubDate: "" },
		{ title: "garbage", pubDate: "not a date" },
	];

	it("keeps items inside the default 24h window and drops older ones", () => {
		const kept = filterRecent(items).map((i) => i.title);
		expect(kept).toContain("fresh");
		expect(kept).not.toContain("stale");
	});

	it("keeps items without a pubDate", () => {
		expect(filterRecent(items).map((i) => i.title)).toContain("undated");
	});

	it("drops items with an unparseable pubDate", () => {
		expect(filterRecent(items).map((i) => i.title)).not.toContain("garbage");
	});

	it("respects a custom window", () => {
		expect(filterRecent(items, 72).map((i) => i.title)).toEqual(["fresh", "stale", "undated"]);
	});
});

// --- applyPerSportCap ---

describe("applyPerSportCap", () => {
	// Items must arrive sorted newest-first (the caller's contract).
	const mkItem = (sport, minutesAgo, tag) => ({
		sport,
		title: `${sport || "untagged"}-${tag}`,
		pubDate: new Date(Date.parse("2026-07-14T12:00:00Z") - minutesAgo * 60 * 1000).toISOString(),
	});
	const general = Array.from({ length: 10 }, (_, i) => mkItem("general", i, i));
	const football = Array.from({ length: 4 }, (_, i) => mkItem("football", 100 + i, i));
	const golf = Array.from({ length: 3 }, (_, i) => mkItem("golf", 200 + i, i));
	const sorted = [...general, ...football, ...golf];

	it("guarantees minPerSport items per sport before filling with newest", () => {
		const result = applyPerSportCap(sorted, 10, 3);
		const counts = {};
		for (const item of result) counts[item.sport] = (counts[item.sport] || 0) + 1;
		// Without the guarantee, pure date-sort would give 10 general and 0 football/golf.
		expect(counts).toEqual({ general: 4, football: 3, golf: 3 });
	});

	it("keeps the newest items within each guaranteed sport and caps the total", () => {
		const result = applyPerSportCap(sorted, 10, 3);
		expect(result).toHaveLength(10);
		const footballTitles = result.filter((i) => i.sport === "football").map((i) => i.title);
		expect(footballTitles.sort()).toEqual(["football-0", "football-1", "football-2"]);
	});

	it("returns the result sorted newest-first", () => {
		const result = applyPerSportCap(sorted, 10, 3);
		const times = result.map((i) => new Date(i.pubDate).getTime());
		expect(times).toEqual([...times].sort((a, b) => b - a));
	});

	it("returns everything when there are fewer items than the cap", () => {
		expect(applyPerSportCap(sorted.slice(0, 5), 40, 3)).toHaveLength(5);
	});

	it("treats items without a sport as 'general'", () => {
		const untagged = Array.from({ length: 4 }, (_, i) => mkItem(undefined, i, i));
		const result = applyPerSportCap([...untagged, ...football], 6, 3);
		// 3 untagged (general bucket) + 3 football guaranteed = 6; the 4th untagged is cut.
		expect(result.filter((i) => !i.sport)).toHaveLength(3);
		expect(result.filter((i) => i.sport === "football")).toHaveLength(3);
	});
});

// --- isNorwegianRelevant ---

describe("isNorwegianRelevant", () => {
	const mk = (title, description = "", categories = []) => ({ title, description, categories });

	it("always keeps Norwegian-language items", () => {
		expect(isNorwegianRelevant(mk("Lokalfotball i 3. divisjon"), "no")).toBe(true);
	});

	it("matches a keyword in the title, case-insensitively", () => {
		expect(isNorwegianRelevant(mk("HAALAND hat-trick sinks Wolves"), "en")).toBe(true);
	});

	it("matches a keyword in the description", () => {
		expect(isNorwegianRelevant(mk("Premier League roundup", "Martin Odegaard set up both goals"), "en")).toBe(true);
	});

	it("matches a keyword in the categories", () => {
		expect(isNorwegianRelevant(mk("World championship latest", "", ["Magnus Carlsen"]), "en")).toBe(true);
	});

	it("rejects non-Norwegian-relevant English items", () => {
		expect(isNorwegianRelevant(mk("Chelsea appoint new manager", "A quiet day at Stamford Bridge", ["Football"]), "en")).toBe(false);
	});

	it("matches Norwegian characters in keywords (ødegaard, klæbo)", () => {
		expect(isNorwegianRelevant(mk("Ødegaard tilbake fra skade"), "en")).toBe(true);
		expect(isNorwegianRelevant(mk("Klæbo dominates sprint"), "en")).toBe(true);
	});
});
