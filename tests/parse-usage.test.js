// parse-usage.js — turns `claude -p "/usage"` text into the governor state.
import { describe, it, expect } from "vitest";
import { parseUsage } from "../scripts/parse-usage.js";

const NOW = "2026-07-04T18:00:00Z";
const REAL = `You are currently using your subscription to power your Claude Code usage

Current session: 15% used · resets Jul 4 at 9:19pm (Europe/Oslo)
Current week (all models): 59% used · resets Jul 8 at 5:59pm (Europe/Oslo)

What's contributing to your limits usage?
Last 24h · 657 requests · 1 session`;

describe("parseUsage", () => {
	it("extracts session + week percentages and reset strings", () => {
		const s = parseUsage(REAL, NOW);
		expect(s.parsed).toBe(true);
		expect(s.session).toEqual({ percentUsed: 15, resetsAt: "Jul 4 at 9:19pm (Europe/Oslo)" });
		expect(s.week).toEqual({ percentUsed: 59, resetsAt: "Jul 8 at 5:59pm (Europe/Oslo)" });
		expect(s.status).toBe("green"); // max 59 < 75
		expect(s.skipAll).toBe(false);
		expect(s.skipNiceToHave).toBe(false);
	});

	it("goes amber (skip nice-to-have) at >=75% on either window", () => {
		const s = parseUsage("Current session: 20% used · resets x\nCurrent week (all models): 80% used · resets y", NOW);
		expect(s.status).toBe("amber");
		expect(s.skipNiceToHave).toBe(true);
		expect(s.skipAll).toBe(false); // session still low
	});

	it("goes red at >=90%", () => {
		const s = parseUsage("Current session: 30% used · resets x\nCurrent week (all models): 92% used · resets y", NOW);
		expect(s.status).toBe("red");
		expect(s.skipNiceToHave).toBe(true);
	});

	it("skipAll when the session window is near exhausted (>=95%)", () => {
		const s = parseUsage("Current session: 97% used · resets x\nCurrent week (all models): 60% used · resets y", NOW);
		expect(s.skipAll).toBe(true);
	});

	it("fail-open on unparseable input (parsed:false, no skips)", () => {
		const s = parseUsage("garbage with no usage lines", NOW);
		expect(s.parsed).toBe(false);
		expect(s.skipAll).toBe(false);
		expect(s.skipNiceToHave).toBe(false);
	});
});
