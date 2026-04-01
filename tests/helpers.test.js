import { describe, it, expect, afterEach, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { iso, normalizeToUTC, hasEvents, countEvents, mergePrimaryAndOpen, isEventInWindow, parseCliJsonOutput, parseSessionUsage, isNorwegianClubResult, isNoteworthyNorwegianResult, NORWEGIAN_CLUBS, UEFA_COMPETITIONS, retainLastGood } from "../scripts/lib/helpers.js";

describe("iso()", () => {
	it("returns valid ISO string for current time", () => {
		const result = iso();
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
	});

	it("converts timestamp to ISO string", () => {
		const result = iso(0);
		expect(result).toBe("1970-01-01T00:00:00.000Z");
	});
});

describe("normalizeToUTC()", () => {
	it("returns ISO string for valid date", () => {
		const result = normalizeToUTC("2025-08-20T14:00:00Z");
		expect(result).toBe("2025-08-20T14:00:00.000Z");
	});

	it("handles null/undefined by returning current time", () => {
		const result = normalizeToUTC(null);
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("handles invalid date string by returning current time", () => {
		const result = normalizeToUTC("not-a-date");
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});

describe("hasEvents()", () => {
	it("returns false for null", () => {
		expect(hasEvents(null)).toBe(false);
	});

	it("returns false for empty tournaments", () => {
		expect(hasEvents({ tournaments: [] })).toBe(false);
	});

	it("returns false for tournaments with empty events", () => {
		expect(hasEvents({ tournaments: [{ name: "T1", events: [] }] })).toBe(false);
	});

	it("returns true for tournaments with events", () => {
		expect(
			hasEvents({
				tournaments: [{ name: "T1", events: [{ title: "Match" }] }],
			})
		).toBe(true);
	});
});

describe("countEvents()", () => {
	it("returns 0 for null", () => {
		expect(countEvents(null)).toBe(0);
	});

	it("counts events across tournaments", () => {
		const data = {
			tournaments: [
				{ name: "T1", events: [{ title: "A" }, { title: "B" }] },
				{ name: "T2", events: [{ title: "C" }] },
			],
		};
		expect(countEvents(data)).toBe(3);
	});
});

describe("mergePrimaryAndOpen()", () => {
	it("returns primary when open has no events", () => {
		const primary = { tournaments: [{ name: "T1", events: [{ title: "A" }] }] };
		const open = { tournaments: [] };
		const result = mergePrimaryAndOpen(primary, open);
		expect(result.tournaments).toHaveLength(1);
	});

	it("merges non-overlapping tournaments", () => {
		const primary = { tournaments: [{ name: "PGA", events: [{ title: "A" }] }] };
		const open = { tournaments: [{ name: "DP World", events: [{ title: "B" }] }] };
		const result = mergePrimaryAndOpen(primary, open);
		expect(result.tournaments).toHaveLength(2);
	});

	it("open overrides when tournament names overlap (hasEvents checks tournaments prop)", () => {
		const primary = { tournaments: [{ name: "PGA", events: [{ title: "Primary" }] }] };
		const open = { tournaments: [{ name: "PGA", events: [{ title: "Open" }] }] };
		const result = mergePrimaryAndOpen(primary, open);
		expect(result.tournaments).toHaveLength(1);
		// Note: hasEvents() checks for .tournaments prop, individual tournament objects don't have it
		// so open overrides primary for same-named tournaments
		expect(result.tournaments[0].events[0].title).toBe("Open");
	});
});

describe("isEventInWindow()", () => {
	const day1 = new Date("2026-02-12T00:00:00Z");
	const day2 = new Date("2026-02-13T00:00:00Z");
	const day3 = new Date("2026-02-14T00:00:00Z");
	const day5 = new Date("2026-02-16T00:00:00Z");

	it("single-day event inside window", () => {
		expect(isEventInWindow({ time: "2026-02-12T15:00:00Z" }, day1, day2)).toBe(true);
	});

	it("single-day event outside window", () => {
		expect(isEventInWindow({ time: "2026-02-14T15:00:00Z" }, day1, day2)).toBe(false);
	});

	it("multi-day event overlapping window start", () => {
		expect(isEventInWindow({ time: "2026-02-11T05:00:00Z", endTime: "2026-02-13T23:00:00Z" }, day2, day3)).toBe(true);
	});

	it("multi-day event overlapping window end", () => {
		expect(isEventInWindow({ time: "2026-02-13T05:00:00Z", endTime: "2026-02-15T23:00:00Z" }, day2, day3)).toBe(true);
	});

	it("multi-day event spanning entire window", () => {
		expect(isEventInWindow({ time: "2026-02-11T00:00:00Z", endTime: "2026-02-16T00:00:00Z" }, day2, day3)).toBe(true);
	});

	it("multi-day event entirely before window", () => {
		expect(isEventInWindow({ time: "2026-02-10T00:00:00Z", endTime: "2026-02-11T23:00:00Z" }, day2, day3)).toBe(false);
	});

	it("multi-day event entirely after window", () => {
		expect(isEventInWindow({ time: "2026-02-15T00:00:00Z", endTime: "2026-02-16T00:00:00Z" }, day1, day2)).toBe(false);
	});

	it("returns false for null event", () => {
		expect(isEventInWindow(null, day1, day2)).toBe(false);
	});

	it("returns false for event without time", () => {
		expect(isEventInWindow({ title: "No time" }, day1, day2)).toBe(false);
	});

	it("accepts numeric timestamps as window bounds", () => {
		expect(isEventInWindow({ time: "2026-02-12T15:00:00Z" }, day1.getTime(), day2.getTime())).toBe(true);
	});
});

describe("parseCliJsonOutput()", () => {
	it("extracts result and usage from CLI JSON", () => {
		const raw = JSON.stringify({
			type: "result",
			subtype: "success",
			is_error: false,
			result: "Hello world",
			total_cost_usd: 0.05,
			num_turns: 2,
			duration_api_ms: 3000,
			usage: {
				input_tokens: 100,
				output_tokens: 50,
				cache_creation_input_tokens: 5000,
				cache_read_input_tokens: 8000,
			},
		});
		const parsed = parseCliJsonOutput(raw);
		expect(parsed.result).toBe("Hello world");
		expect(parsed.usage.input).toBe(100 + 5000 + 8000);
		expect(parsed.usage.output).toBe(50);
		expect(parsed.usage.cacheCreation).toBe(5000);
		expect(parsed.usage.cacheRead).toBe(8000);
		expect(parsed.usage.total).toBe(100 + 5000 + 8000 + 50);
		expect(parsed.usage.costUSD).toBe(0.05);
		expect(parsed.numTurns).toBe(2);
		expect(parsed.durationApiMs).toBe(3000);
	});

	it("throws on CLI error response", () => {
		const raw = JSON.stringify({
			type: "result",
			is_error: true,
			result: "Something went wrong",
		});
		expect(() => parseCliJsonOutput(raw)).toThrow("CLI error: Something went wrong");
	});

	it("handles missing usage fields gracefully", () => {
		const raw = JSON.stringify({
			type: "result",
			is_error: false,
			result: "ok",
		});
		const parsed = parseCliJsonOutput(raw);
		expect(parsed.result).toBe("ok");
		expect(parsed.usage.input).toBe(0);
		expect(parsed.usage.output).toBe(0);
		expect(parsed.usage.total).toBe(0);
		expect(parsed.usage.costUSD).toBe(0);
	});

	it("throws on invalid JSON", () => {
		expect(() => parseCliJsonOutput("not json")).toThrow();
	});
});

describe("parseSessionUsage()", () => {
	const tmpDir = path.join(os.tmpdir(), "sportsync-test-sessions");
	const projectDir = path.join(tmpDir, "test-project");

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns null for null/undefined session ID", () => {
		expect(parseSessionUsage(null)).toBeNull();
		expect(parseSessionUsage(undefined)).toBeNull();
		expect(parseSessionUsage("")).toBeNull();
	});

	it("returns null when session file does not exist", () => {
		expect(parseSessionUsage("nonexistent-session-id")).toBeNull();
	});

	it("correctly sums tokens from a session JSONL file", () => {
		// Create a fake session file in the real ~/.claude/projects dir
		const claudeProjects = path.join(os.homedir(), ".claude", "projects");
		if (!fs.existsSync(claudeProjects)) {
			// Can't test without the directory existing
			return;
		}

		// Use a temp project dir inside the real projects dir
		const testProjectDir = path.join(claudeProjects, "sportsync-test-parseSession");
		fs.mkdirSync(testProjectDir, { recursive: true });
		const sessionId = "test-session-" + Date.now();
		const sessionFile = path.join(testProjectDir, `${sessionId}.jsonl`);

		try {
			const lines = [
				JSON.stringify({ type: "human", message: { content: "hello" } }),
				JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 200, cache_read_input_tokens: 300 } } }),
				JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 150, output_tokens: 75 } } }),
				"not valid json",
				"",
				JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 50, output_tokens: 25, cache_creation_input_tokens: 100, cache_read_input_tokens: 0 } } }),
			];
			fs.writeFileSync(sessionFile, lines.join("\n"));

			const result = parseSessionUsage(sessionId);
			expect(result).not.toBeNull();
			expect(result.input).toBe(300);       // 100 + 150 + 50
			expect(result.output).toBe(150);       // 50 + 75 + 25
			expect(result.cacheCreation).toBe(300); // 200 + 0 + 100
			expect(result.cacheRead).toBe(300);     // 300 + 0 + 0
			expect(result.total).toBe(1050);        // 300 + 150 + 300 + 300
		} finally {
			fs.rmSync(testProjectDir, { recursive: true, force: true });
		}
	});

	it("handles malformed lines gracefully", () => {
		const claudeProjects = path.join(os.homedir(), ".claude", "projects");
		if (!fs.existsSync(claudeProjects)) return;

		const testProjectDir = path.join(claudeProjects, "sportsync-test-parseSession2");
		fs.mkdirSync(testProjectDir, { recursive: true });
		const sessionId = "test-malformed-" + Date.now();
		const sessionFile = path.join(testProjectDir, `${sessionId}.jsonl`);

		try {
			fs.writeFileSync(sessionFile, "garbage\n{bad json\n");
			const result = parseSessionUsage(sessionId);
			expect(result).not.toBeNull();
			expect(result.total).toBe(0);
		} finally {
			fs.rmSync(testProjectDir, { recursive: true, force: true });
		}
	});
});

describe("Norwegian club helpers", () => {
	describe("isNorwegianClubResult()", () => {
		it("detects Norwegian home team", () => {
			expect(isNorwegianClubResult({ homeTeam: "Bodo/Glimt", awayTeam: "Inter" })).toBe(true);
		});

		it("detects Norwegian away team", () => {
			expect(isNorwegianClubResult({ homeTeam: "Inter", awayTeam: "Molde" })).toBe(true);
		});

		it("is case-insensitive", () => {
			expect(isNorwegianClubResult({ homeTeam: "ROSENBORG", awayTeam: "Celtic" })).toBe(true);
		});

		it("returns false for non-Norwegian teams", () => {
			expect(isNorwegianClubResult({ homeTeam: "Arsenal", awayTeam: "Liverpool" })).toBe(false);
		});

		it("handles missing team names", () => {
			expect(isNorwegianClubResult({})).toBe(false);
			expect(isNorwegianClubResult({ homeTeam: null })).toBe(false);
		});
	});

	describe("isNoteworthyNorwegianResult()", () => {
		it("returns true for Norwegian club in Champions League", () => {
			expect(isNoteworthyNorwegianResult({
				homeTeam: "Inter", awayTeam: "Bodo/Glimt", leagueCode: "uefa.champions",
			})).toBe(true);
		});

		it("returns true for Norwegian club in Europa League", () => {
			expect(isNoteworthyNorwegianResult({
				homeTeam: "Molde", awayTeam: "Ajax", leagueCode: "uefa.europa",
			})).toBe(true);
		});

		it("returns true for Norwegian club in Conference League", () => {
			expect(isNoteworthyNorwegianResult({
				homeTeam: "Bodø/Glimt", awayTeam: "Roma", leagueCode: "uefa.europa.conf",
			})).toBe(true);
		});

		it("returns false for Norwegian club in domestic league", () => {
			expect(isNoteworthyNorwegianResult({
				homeTeam: "Rosenborg", awayTeam: "Molde", leagueCode: "nor.1",
			})).toBe(false);
		});

		it("returns false for non-Norwegian club in UEFA", () => {
			expect(isNoteworthyNorwegianResult({
				homeTeam: "Arsenal", awayTeam: "PSG", leagueCode: "uefa.champions",
			})).toBe(false);
		});
	});

	it("NORWEGIAN_CLUBS list covers key teams", () => {
		expect(NORWEGIAN_CLUBS).toContain("bodo/glimt");
		expect(NORWEGIAN_CLUBS).toContain("rosenborg");
		expect(NORWEGIAN_CLUBS).toContain("lyn");
		expect(NORWEGIAN_CLUBS.length).toBeGreaterThanOrEqual(10);
	});

	it("UEFA_COMPETITIONS covers all three tiers", () => {
		expect(UEFA_COMPETITIONS).toContain("uefa.champions");
		expect(UEFA_COMPETITIONS).toContain("uefa.europa");
		expect(UEFA_COMPETITIONS).toContain("uefa.europa.conf");
	});
});

describe("retainLastGood()", () => {
	const tmpDir = path.join(os.tmpdir(), "sportsync-retain-test");
	let targetFile;

	beforeEach(() => {
		fs.mkdirSync(tmpDir, { recursive: true });
		targetFile = path.join(tmpDir, `test-${Date.now()}.json`);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	const validData = {
		lastUpdated: new Date().toISOString(),
		tournaments: [{ name: "PGA", events: [{ title: "Masters" }] }],
	};

	const emptyData = {
		lastUpdated: new Date().toISOString(),
		tournaments: [],
	};

	const emptyEventsData = {
		lastUpdated: new Date().toISOString(),
		tournaments: [{ name: "PGA", events: [] }],
	};

	it("writes fresh data when no existing file", () => {
		const result = retainLastGood(targetFile, validData);
		expect(result.kept).toBe(false);
		expect(result.data).toEqual(validData);
		const written = JSON.parse(fs.readFileSync(targetFile, "utf-8"));
		expect(written.tournaments[0].name).toBe("PGA");
	});

	it("writes fresh data when new data has events", () => {
		fs.writeFileSync(targetFile, JSON.stringify(validData));
		const newData = {
			lastUpdated: new Date().toISOString(),
			tournaments: [{ name: "DP World", events: [{ title: "Open" }] }],
		};
		const result = retainLastGood(targetFile, newData);
		expect(result.kept).toBe(false);
		expect(result.data.tournaments[0].name).toBe("DP World");
	});

	it("clears _retained marker when fresh data arrives", () => {
		const newDataWithRetained = {
			lastUpdated: new Date().toISOString(),
			tournaments: [{ name: "PGA", events: [{ title: "Open" }] }],
			_retained: { since: "2026-01-01T00:00:00Z", consecutiveRetains: 5 },
		};
		const result = retainLastGood(targetFile, newDataWithRetained);
		expect(result.kept).toBe(false);
		expect(result.data._retained).toBeUndefined();
		const written = JSON.parse(fs.readFileSync(targetFile, "utf-8"));
		expect(written._retained).toBeUndefined();
	});

	it("retains old data when new data has no events", () => {
		fs.writeFileSync(targetFile, JSON.stringify(validData));
		const result = retainLastGood(targetFile, emptyData);
		expect(result.kept).toBe(true);
		expect(result.data.tournaments[0].name).toBe("PGA");
	});

	it("retains old data when new data has tournaments with empty events arrays", () => {
		fs.writeFileSync(targetFile, JSON.stringify(validData));
		const result = retainLastGood(targetFile, emptyEventsData);
		expect(result.kept).toBe(true);
		expect(result.data.tournaments[0].events).toHaveLength(1);
	});

	it("adds _retained metadata on first retain", () => {
		fs.writeFileSync(targetFile, JSON.stringify(validData));
		const result = retainLastGood(targetFile, emptyData);
		expect(result.data._retained).toBeDefined();
		expect(result.data._retained.consecutiveRetains).toBe(1);
		expect(result.data._retained.since).toBeDefined();
		expect(result.data._retained.lastFreshFetch).toBe(validData.lastUpdated);
	});

	it("increments consecutiveRetains on repeated retains", () => {
		const existingWithRetained = {
			...validData,
			_retained: {
				since: "2026-03-01T00:00:00Z",
				consecutiveRetains: 5,
				lastFreshFetch: "2026-02-28T00:00:00Z",
			},
		};
		fs.writeFileSync(targetFile, JSON.stringify(existingWithRetained));
		const result = retainLastGood(targetFile, emptyData);
		expect(result.kept).toBe(true);
		expect(result.data._retained.consecutiveRetains).toBe(6);
		expect(result.data._retained.since).toBe("2026-03-01T00:00:00Z");
		expect(result.data._retained.lastFreshFetch).toBe("2026-02-28T00:00:00Z");
	});

	it("increments from high consecutive counts (e.g. 84 like F1)", () => {
		const existingWithRetained = {
			...validData,
			_retained: {
				since: "2026-01-01T00:00:00Z",
				consecutiveRetains: 84,
				lastFreshFetch: "2025-12-31T00:00:00Z",
			},
		};
		fs.writeFileSync(targetFile, JSON.stringify(existingWithRetained));
		const result = retainLastGood(targetFile, emptyData);
		expect(result.data._retained.consecutiveRetains).toBe(85);
	});

	it("expires retained data after maxAgeDays (default 14)", () => {
		const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
		const oldRetained = {
			lastUpdated: fifteenDaysAgo,
			tournaments: [{ name: "PGA", events: [{ title: "Old" }] }],
		};
		fs.writeFileSync(targetFile, JSON.stringify(oldRetained));
		const result = retainLastGood(targetFile, emptyData);
		expect(result.kept).toBe(false);
		expect(result.data).toEqual(emptyData);
	});

	it("retains data within 14-day boundary", () => {
		const justUnder = new Date(Date.now() - 13.9 * 24 * 60 * 60 * 1000).toISOString();
		const borderlineData = {
			lastUpdated: justUnder,
			tournaments: [{ name: "PGA", events: [{ title: "Borderline" }] }],
		};
		fs.writeFileSync(targetFile, JSON.stringify(borderlineData));
		const result = retainLastGood(targetFile, emptyData);
		expect(result.kept).toBe(true);
	});

	it("expires data just past the boundary", () => {
		const justOver = new Date(Date.now() - 14.1 * 24 * 60 * 60 * 1000).toISOString();
		const expiredData = {
			lastUpdated: justOver,
			tournaments: [{ name: "PGA", events: [{ title: "Expired" }] }],
		};
		fs.writeFileSync(targetFile, JSON.stringify(expiredData));
		const result = retainLastGood(targetFile, emptyData);
		expect(result.kept).toBe(false);
	});

	it("respects custom maxAgeDays parameter", () => {
		const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
		const oldData = {
			lastUpdated: threeDaysAgo,
			tournaments: [{ name: "PGA", events: [{ title: "Old" }] }],
		};
		fs.writeFileSync(targetFile, JSON.stringify(oldData));
		const result = retainLastGood(targetFile, emptyData, 2);
		expect(result.kept).toBe(false);
	});

	it("does not retain when existing data has no lastUpdated", () => {
		const noTimestamp = {
			tournaments: [{ name: "PGA", events: [{ title: "No timestamp" }] }],
		};
		fs.writeFileSync(targetFile, JSON.stringify(noTimestamp));
		const result = retainLastGood(targetFile, emptyData);
		expect(result.kept).toBe(false);
	});

	it("skips retention when _noRetain flag is set", () => {
		fs.writeFileSync(targetFile, JSON.stringify(validData));
		const newData = { ...emptyData, _noRetain: true };
		const result = retainLastGood(targetFile, newData);
		expect(result.kept).toBe(false);
		const written = JSON.parse(fs.readFileSync(targetFile, "utf-8"));
		expect(written._noRetain).toBeUndefined();
	});

	it("handles newData with no tournaments property", () => {
		fs.writeFileSync(targetFile, JSON.stringify(validData));
		const noTournaments = { lastUpdated: new Date().toISOString() };
		const result = retainLastGood(targetFile, noTournaments);
		expect(result.kept).toBe(true);
	});

	it("does not retain when both old and new data are empty", () => {
		fs.writeFileSync(targetFile, JSON.stringify(emptyData));
		const result = retainLastGood(targetFile, emptyData);
		expect(result.kept).toBe(false);
	});

	it("handles malformed _retained by starting fresh count", () => {
		const existingWithBadRetained = {
			...validData,
			_retained: "not an object",
		};
		fs.writeFileSync(targetFile, JSON.stringify(existingWithBadRetained));
		const result = retainLastGood(targetFile, emptyData);
		expect(result.kept).toBe(true);
		expect(result.data._retained.consecutiveRetains).toBe(1);
	});

	it("persists retained data to disk", () => {
		fs.writeFileSync(targetFile, JSON.stringify(validData));
		retainLastGood(targetFile, emptyData);
		const onDisk = JSON.parse(fs.readFileSync(targetFile, "utf-8"));
		expect(onDisk._retained).toBeDefined();
		expect(onDisk._retained.consecutiveRetains).toBe(1);
		expect(onDisk.tournaments[0].name).toBe("PGA");
	});
});
