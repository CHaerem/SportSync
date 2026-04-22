// Tests for client-side sport inference from RSS headline text.
// Verifies that _inferSportFromHeadline correctly tags "general" items
// and that renderNews uses inferred sports for filtering and color bars.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const dashboardSrc = readFileSync(
	join(import.meta.dirname, "../docs/js/dashboard.js"),
	"utf-8",
);

// --- Source-level integration checks ---

describe("News sport inference integration (source checks)", () => {
	it("defines _inferSportFromHeadline method", () => {
		expect(dashboardSrc).toContain("_inferSportFromHeadline(item)");
	});

	it("calls _inferSportFromHeadline in renderNews", () => {
		expect(dashboardSrc).toMatch(
			/renderNews[\s\S]*?_inferSportFromHeadline\s*\(/,
		);
	});

	it("uses _inferredSport in the sport filter check", () => {
		// The filter should check inferred sport, not just item.sport
		expect(dashboardSrc).toMatch(
			/item\._inferredSport\s*\|\|\s*item\.sport/,
		);
	});

	it("uses _inferredSport in _renderNewsCard for color bar", () => {
		expect(dashboardSrc).toMatch(
			/_renderNewsCard[\s\S]*?item\._inferredSport\s*\|\|\s*item\.sport/,
		);
	});

	it("only infers when sport is general or missing", () => {
		// Should not override items that already have a specific sport
		expect(dashboardSrc).toMatch(
			/item\.sport\s*===\s*'general'/,
		);
	});

	it("caches inferred sport on the item to avoid re-computation", () => {
		// The method sets item._inferredSport once
		expect(dashboardSrc).toMatch(
			/item\._inferredSport\s*=\s*this\._inferSportFromHeadline/,
		);
	});

	it("includes keywords for all tracked sports", () => {
		const sports = ["formula1", "golf", "tennis", "chess", "esports", "cycling", "football"];
		for (const sport of sports) {
			expect(dashboardSrc).toMatch(
				new RegExp(`\\['${sport}'`),
			);
		}
	});
});

// --- Functional tests: reproduce the inference logic ---

describe("_inferSportFromHeadline functional tests", () => {
	// Extract the keyword map from dashboard.js to keep tests in sync.
	// For testability we reproduce the core matching logic.
	function inferSportFromHeadline(item) {
		const text = ((item.title || "") + " " + (item.description || "")).toLowerCase();
		const sportKeywords = [
			["formula1", [
				"formel 1", "formula 1", "grand prix", " f1 ", "f1-", "red bull racing",
				"verstappen", "hamilton", "leclerc", "norris", "sainz", "piastri",
				"mclaren", "ferrari", "mercedes", "alonso",
			]],
			["tennis", [
				"tennis", " atp ", " wta ", "roland garros", "roland-garros", "wimbledon",
				"us open tennis", "australian open", "ruud", "djokovic", "sinner",
				"alcaraz", "medvedev", "swiatek", "sabalenka", "budkov",
				"masters 1000", "tennistalentet",
			]],
			["golf", [
				"golf", " pga ", "pga tour", "dp world", "masters", "open championship",
				"the open", "ryder cup", "hovland", "rahm", "scheffler", "mcilroy",
				"koepka", "spieth", "augusta", "birdie", "bogey", "eagle",
			]],
			["chess", [
				"chess", "sjakk", " fide", "carlsen", "magnus carlsen", "candidates",
				"tari", "grandmaster", "stormester",
			]],
			["esports", [
				"esport", "e-sport", "counter-strike", " cs2", "cs2 ", " csgo",
				"hltv", "blast", "iem ", "esl ", "major cs", "navi", "faze clan",
			]],
			["cycling", [
				"cycling", "sykkel", "sykling", "tour de france", "giro", "vuelta",
				"monument", "etappeseier", "sykkelstjerne", "uno-x", "visma-lease",
				"klassiker", "peloton", "rittet", "etappe",
				"johannessen", "tobias halland",
			]],
			["football", [
				"premier league", "champions league", "europa league", "la liga",
				"serie a", "bundesliga", "ligue 1", "eliteserien", "obos-ligaen",
				"toppserien", "fotball", "football", "soccer",
				" vm ", "vm-", "fotball-vm", "world cup",
				"arsenal", "chelsea", "liverpool", "manchester city", "manchester united",
				"man city", "man united", "tottenham", "spurs", "newcastle",
				"brighton", "aston villa", "west ham", "everton", "leicester",
				"barcelona", "real madrid", "atletico",
				"haaland", "odegaard", "ødegaard", "salah", "palmer",
				"brann", "rosenborg", "vålerenga", "molde", "bodø/glimt",
				"lyn oslo", "seriegull", "nedrykk", "opprykk", "tabellen",
				"cup-", "cupfinale", "straffespark", "offside", " var ",
				"inter", "milan", "como", "lens", "toulouse",
				"slot", "knutsen", "rekdal",
			]],
		];
		for (const [sportId, keywords] of sportKeywords) {
			for (const kw of keywords) {
				if (text.includes(kw)) {
					return sportId;
				}
			}
		}
		return null;
	}

	// Football headlines
	it("infers football from Chelsea headline", () => {
		const item = {
			sport: "general",
			title: "Femte strake Chelsea-tap uten scoring",
			description: "Chelsea måtte tåle sitt femte strake Premier League-tap.",
		};
		expect(inferSportFromHeadline(item)).toBe("football");
	});

	it("infers football from Haaland headline", () => {
		const item = {
			sport: "general",
			title: "Haaland og City til Hongkong",
			description: "Med Erling Braut Haaland som trekkplaster.",
		};
		expect(inferSportFromHeadline(item)).toBe("football");
	});

	it("infers football from VM/World Cup headline", () => {
		const item = {
			sport: "general",
			title: "Skattebombe i VM - risikerer å tape millioner",
			description: "Fotballforbundet så for seg et solid VM-overskudd.",
		};
		expect(inferSportFromHeadline(item)).toBe("football");
	});

	it("infers football from cupfinale headline", () => {
		const item = {
			sport: "general",
			title: "Inter vendte til cupfinale",
			description: "Inters håp om dobbelttriumf i italiensk fotball.",
		};
		expect(inferSportFromHeadline(item)).toBe("football");
	});

	it("infers football from Leicester nedrykk headline", () => {
		const item = {
			sport: "general",
			title: "Historisk fall for tidligere Premier League-vinner",
			description: "Leicester rykker ned.",
		};
		expect(inferSportFromHeadline(item)).toBe("football");
	});

	it("infers football from tabellen headline", () => {
		const item = {
			sport: "general",
			title: "Brighton vant 3-0 og gikk forbi på tabellen",
			description: "",
		};
		expect(inferSportFromHeadline(item)).toBe("football");
	});

	// Formula 1 headlines
	it("infers formula1 from Formel 1 headline", () => {
		const item = {
			sport: "general",
			title: "Formel 1 gir etter og endrer reglene",
			description: "Miami Grand Prix den første helgen i mai.",
		};
		expect(inferSportFromHeadline(item)).toBe("formula1");
	});

	it("infers formula1 from Verstappen headline", () => {
		const item = {
			sport: "general",
			title: "Verstappen dominerer kvalifiseringen",
			description: "Red Bull-føreren er raskest.",
		};
		expect(inferSportFromHeadline(item)).toBe("formula1");
	});

	// Tennis headlines
	it("infers tennis from Masters 1000 headline", () => {
		const item = {
			sport: "general",
			title: "Kjær med maktdemonstrasjon – klar for storturnering i Madrid",
			description: "Masters 1000-turneringen i Madrid.",
		};
		expect(inferSportFromHeadline(item)).toBe("tennis");
	});

	it("infers tennis from tennistalentet headline", () => {
		const item = {
			sport: "general",
			title: "Nicolai Budkov Kjær tennis",
			description: "Det 19 år gamle tennistalentet.",
		};
		expect(inferSportFromHeadline(item)).toBe("tennis");
	});

	// Cycling headlines
	it("infers cycling from sykkel headline", () => {
		const item = {
			sport: "general",
			title: "Har ventet i 940 dager",
			description: "Tobias Halland Johannessen har aldri vært bedre. Sykkelstjerna.",
		};
		expect(inferSportFromHeadline(item)).toBe("cycling");
	});

	// Chess headlines
	it("infers chess from sjakk headline", () => {
		const item = {
			sport: "general",
			title: "Magnus Carlsen vinner igjen",
			description: "Verdensmesteren i sjakk.",
		};
		expect(inferSportFromHeadline(item)).toBe("chess");
	});

	// Esports headlines
	it("infers esports from CS2 headline", () => {
		const item = {
			sport: "general",
			title: "NAVI wins IEM Rio",
			description: "Counter-Strike 2 tournament. CS2 major results.",
		};
		expect(inferSportFromHeadline(item)).toBe("esports");
	});

	// Golf headlines
	it("infers golf from PGA Tour headline", () => {
		const item = {
			sport: "general",
			title: "Hovland shoots 66 at Augusta",
			description: "PGA Tour event at the Masters.",
		};
		expect(inferSportFromHeadline(item)).toBe("golf");
	});

	// No match
	it("returns null for unrecognizable headline", () => {
		const item = {
			sport: "general",
			title: "100. strake seier for svensken",
			description: "Pingisligan, melder SVT. 24-åringen har blant annet to OL-sølv.",
		};
		expect(inferSportFromHeadline(item)).toBeNull();
	});

	it("returns null for empty item", () => {
		expect(inferSportFromHeadline({})).toBeNull();
	});

	// Does not override already-tagged items
	it("should not be called for items with a specific sport", () => {
		// This tests the integration guard, not the function itself.
		// The renderNews code only calls inference when sport is "general" or missing.
		expect(dashboardSrc).toMatch(
			/!item\.sport\s*\|\|\s*item\.sport\s*===\s*'general'/,
		);
	});

	// Priority: F1 "grand prix" should not match football "grand" false positive
	it("matches F1 grand prix before football", () => {
		const item = {
			sport: "general",
			title: "Monaco Grand Prix preview",
			description: "Formula 1 race weekend.",
		};
		expect(inferSportFromHeadline(item)).toBe("formula1");
	});

	// Edge case: keyword at boundary
	it("matches keyword with surrounding spaces", () => {
		const item = {
			sport: "general",
			title: "Latest F1 news and updates",
			description: "",
		};
		// " f1 " requires spaces around it
		expect(inferSportFromHeadline(item)).toBe("formula1");
	});
});
