// esports fetcher: Liquipedia match parsing (the CS2 ground-truth path for 100 Thieves).
import { describe, it, expect } from "vitest";
import { parseLiquipediaMatches } from "../scripts/fetch/esports.js";

// Minimal HTML shaped like Liquipedia's Liquipedia:Matches widget: each match is a
// `class="match-info"` container with two `class="name"` team cells, a
// `data-timestamp`, and the tournament name in a <span> inside match-info-tournament-name.
const HTML = `
<div class="matches">
  <div class="match-info">
    <span class="name" style="white-space:pre"><a href="/counterstrike/100_Thieves" title="100 Thieves">100 Thieves</a></span>
    <span class="timer-object" data-timestamp="1753142400"></span>
    <span class="name"><a href="/counterstrike/FaZe" title="FaZe">FaZe</a></span>
    <abbr title="Best of 3">Bo3</abbr>
    <div class="match-info-tournament"><div class="match-info-tournament-name"><a href="/x" title="BLAST"><span>BLAST Bounty 2026</span></a></div></div>
  </div>
  <div class="match-info">
    <span class="name"><a title="B8">B8</a></span>
    <span class="timer-object" data-timestamp="1753146000"></span>
    <span class="name"><a title="BIG">BIG</a></span>
    <div class="match-info-tournament-name"><a title="XSE"><span>XSE Pro League 2026 - Round 5</span></a></div>
  </div>
  <div class="match-info">
    <span class="name"><a title="TBD">TBD</a></span>
    <span class="name"><a title="TBD">TBD</a></span>
  </div>
</div>`;

describe("parseLiquipediaMatches", () => {
	const matches = parseLiquipediaMatches(HTML);

	it("parses only blocks that have a timestamp", () => {
		expect(matches).toHaveLength(2); // the third (no data-timestamp) is skipped
	});

	it("extracts teams, timestamp and the real tournament name (from the inner <span>)", () => {
		const m = matches[0];
		expect(m.team1).toBe("100 Thieves");
		expect(m.team2).toBe("FaZe");
		expect(m.tournament).toBe("BLAST Bounty 2026");
		expect(m.time).toBe(new Date(1753142400 * 1000).toISOString());
		expect(m.format).toBe("Bo3");
	});

	it("names smaller tournaments correctly (not the 'CS2 Match' fallback)", () => {
		expect(matches[1].tournament).toBe("XSE Pro League 2026 - Round 5");
	});

	it("a 100 Thieves match survives the focus-team filter regardless of tournament tier", () => {
		const focus = ["100 Thieves", "100T"];
		const kept = matches.filter((m) =>
			focus.some((t) => (m.team1 + m.team2).toLowerCase().includes(t.toLowerCase()))
		);
		expect(kept).toHaveLength(1);
		expect(kept[0].team1).toBe("100 Thieves");
	});

	it("returns [] on empty/garbage input", () => {
		expect(parseLiquipediaMatches("")).toEqual([]);
		expect(parseLiquipediaMatches(null)).toEqual([]);
	});
});
