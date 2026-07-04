// lib/norwegian-rights.js — followed events always resolve to Norwegian channels.
import { describe, it, expect } from "vitest";
import { norwegianRights, normalizeStreaming } from "../scripts/lib/norwegian-rights.js";

describe("norwegianRights", () => {
	it("World Cup football → NRK + TV 2, never a foreign net", () => {
		const r = norwegianRights({ sport: "football", tournament: "FIFA World Cup 2026", title: "Norway vs Brazil" });
		expect(r.map((c) => c.platform)).toEqual(["NRK", "TV 2 Play"]);
	});
	it("F1 → Viaplay", () => {
		expect(norwegianRights({ sport: "f1", tournament: "Belgian Grand Prix" })[0].platform).toBe("Viaplay");
	});
	it("Premier League → TV 2 Play", () => {
		expect(norwegianRights({ sport: "football", tournament: "Premier League" })[0].platform).toBe("TV 2 Play");
	});
	it("unknown competition → no guess (empty)", () => {
		expect(norwegianRights({ sport: "football", tournament: "Some Friendly" })).toEqual([]);
	});
});

describe("normalizeStreaming", () => {
	it("overrides a foreign broadcaster (FOX) with Norwegian rights", () => {
		const s = normalizeStreaming({ sport: "football", tournament: "FIFA World Cup 2026", streaming: [{ platform: "FOX" }] });
		expect(s.map((c) => c.platform)).toEqual(["NRK", "TV 2 Play"]);
		expect(JSON.stringify(s)).not.toContain("FOX");
	});
	it("drops foreign nets when no rights mapping and keeps Norwegian ones", () => {
		const s = normalizeStreaming({ sport: "tennis", tournament: "Nordea Open", streaming: [{ platform: "Tennis Channel" }, { platform: "TV 2 Play" }] });
		expect(s.map((c) => c.platform)).toEqual(["TV 2 Play"]);
	});
	it("leaves esports free streams untouched", () => {
		const s = normalizeStreaming({ sport: "esports", streaming: [{ platform: "Twitch" }] });
		expect(s[0].platform).toBe("Twitch");
	});
});
