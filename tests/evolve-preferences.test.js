import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
	computeSportWeights,
	parseEngagementFromIssueBody,
	parseFavoritesFromIssueBody,
	parseWatchFeedbackFromIssueBody,
	readFavoritesFromFile,
	readWatchFeedbackFromFile,
	detectNewFavorites,
	mergeEngagement,
	readEngagementFromFile,
	evolvePreferences,
	recordHeartbeat,
} from "../scripts/evolve-preferences.js";
import { evaluatePreferenceEvolution } from "../scripts/autonomy-scorecard.js";

// --- exportForBackend tests use the browser class ---
import { readFileSync } from "fs";
import { join } from "path";

const store = {};
const localStorageMock = {
	getItem: vi.fn((key) => store[key] ?? null),
	setItem: vi.fn((key, value) => { store[key] = value; }),
	removeItem: vi.fn((key) => { delete store[key]; }),
	clear: vi.fn(() => { for (const k in store) delete store[k]; }),
};
globalThis.localStorage = localStorageMock;
globalThis.window = globalThis;

const pmSrc = readFileSync(join(import.meta.dirname, "../docs/js/preferences-manager.js"), "utf-8");
eval(pmSrc);
const PreferencesManager = window.PreferencesManager;

// --- Helper to create temp dirs ---
function makeTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "evolve-prefs-"));
}

// ============================================================
// computeSportWeights
// ============================================================
describe("computeSportWeights()", () => {
	const defaultPrefs = { football: "high", golf: "high", f1: "medium", tennis: "medium", chess: "medium", esports: "low" };

	it("returns current preferences when total clicks < 20 (threshold guard)", () => {
		const engagement = { football: { clicks: 5, lastClick: new Date().toISOString() } };
		const result = computeSportWeights(engagement, defaultPrefs);
		expect(result).toEqual(defaultPrefs);
	});

	it("assigns 'high' to sports with >= 25% share", () => {
		// golf gets 30/40 = 75%
		const engagement = {
			golf: { clicks: 30, lastClick: new Date().toISOString() },
			football: { clicks: 10, lastClick: new Date().toISOString() },
		};
		const result = computeSportWeights(engagement, {});
		expect(result.golf).toBe("high");
	});

	it("assigns 'medium' to sports with 10-25% share", () => {
		// football: 6/40 = 15%
		const engagement = {
			golf: { clicks: 30, lastClick: new Date().toISOString() },
			football: { clicks: 6, lastClick: new Date().toISOString() },
			tennis: { clicks: 4, lastClick: new Date().toISOString() },
		};
		const result = computeSportWeights(engagement, {});
		expect(result.football).toBe("medium");
	});

	it("assigns 'low' to sports with < 10% share", () => {
		// tennis: 2/40 = 5%
		const engagement = {
			golf: { clicks: 30, lastClick: new Date().toISOString() },
			football: { clicks: 8, lastClick: new Date().toISOString() },
			tennis: { clicks: 2, lastClick: new Date().toISOString() },
		};
		const result = computeSportWeights(engagement, {});
		expect(result.tennis).toBe("low");
	});

	it("preserves current preference for sports with 0 clicks", () => {
		const engagement = {
			football: { clicks: 25, lastClick: new Date().toISOString() },
		};
		const prefs = { football: "medium", chess: "medium" };
		const result = computeSportWeights(engagement, prefs);
		expect(result.chess).toBe("medium"); // unchanged — no engagement data
	});

	it("applies recency decay (>14 days halves clicks)", () => {
		const oldDate = new Date(Date.now() - 20 * 86_400_000).toISOString(); // 20 days ago
		const recentDate = new Date().toISOString();
		// golf: 40 clicks but old → 20 effective. football: 20 clicks recent.
		// Shares: golf 20/40=50%, football 20/40=50% → both high
		const engagement = {
			golf: { clicks: 40, lastClick: oldDate },
			football: { clicks: 20, lastClick: recentDate },
		};
		const result = computeSportWeights(engagement, {});
		// Both should be high at 50% each
		expect(result.golf).toBe("high");
		expect(result.football).toBe("high");
	});

	it("stability guard prevents small fluctuations from changing level", () => {
		// If share is 0.26 (just above 0.25), margin is only 0.01 < 0.05 stability margin
		// So if current is "medium", it should stay "medium"
		const engagement = {
			golf: { clicks: 13, lastClick: new Date().toISOString() },
			football: { clicks: 12, lastClick: new Date().toISOString() },
			tennis: { clicks: 12, lastClick: new Date().toISOString() },
			chess: { clicks: 13, lastClick: new Date().toISOString() },
		};
		// 13/50=0.26 for golf/chess — just over 0.25 threshold, margin 0.01 < 0.05
		const prefs = { golf: "medium", football: "medium", tennis: "medium", chess: "medium" };
		const result = computeSportWeights(engagement, prefs);
		expect(result.golf).toBe("medium"); // stability guard holds
		expect(result.chess).toBe("medium");
	});

	it("handles empty engagement gracefully", () => {
		expect(computeSportWeights({}, defaultPrefs)).toEqual(defaultPrefs);
		expect(computeSportWeights(null, defaultPrefs)).toEqual(defaultPrefs);
		expect(computeSportWeights(undefined, defaultPrefs)).toEqual(defaultPrefs);
	});

	it("handles single-sport dominance correctly", () => {
		const engagement = {
			golf: { clicks: 50, lastClick: new Date().toISOString() },
		};
		const result = computeSportWeights(engagement, { golf: "medium" });
		expect(result.golf).toBe("high"); // 100% share → high
	});

	it("does not create entries for sports with zero effective clicks", () => {
		const engagement = {
			football: { clicks: 25, lastClick: new Date().toISOString() },
			tennis: { clicks: 0, lastClick: null },
		};
		const result = computeSportWeights(engagement, {});
		expect(result.tennis).toBeUndefined();
	});
});

// ============================================================
// parseEngagementFromIssueBody
// ============================================================
describe("parseEngagementFromIssueBody()", () => {
	it("parses engagement from favorites.engagement path", () => {
		const body = '## Feedback\n\n```json\n{"favorites":{"engagement":{"football":{"clicks":10,"lastClick":"2026-02-15T12:00:00Z"}}},"date":"2026-02-15"}\n```\n';
		const result = parseEngagementFromIssueBody(body);
		expect(result).toEqual({ football: { clicks: 10, lastClick: "2026-02-15T12:00:00Z" } });
	});

	it("parses engagement from backendPreferences.engagement path", () => {
		const body = '```json\n{"backendPreferences":{"engagement":{"golf":{"clicks":5,"lastClick":"2026-02-14T00:00:00Z"}}}}\n```';
		const result = parseEngagementFromIssueBody(body);
		expect(result).toEqual({ golf: { clicks: 5, lastClick: "2026-02-14T00:00:00Z" } });
	});

	it("returns null when no JSON block found", () => {
		expect(parseEngagementFromIssueBody("No JSON here")).toBeNull();
	});

	it("returns null for malformed JSON", () => {
		expect(parseEngagementFromIssueBody("```json\n{invalid}\n```")).toBeNull();
	});

	it("returns null for null/undefined input", () => {
		expect(parseEngagementFromIssueBody(null)).toBeNull();
		expect(parseEngagementFromIssueBody(undefined)).toBeNull();
	});

	it("parses engagement from engagement-sync issue format", () => {
		const body = `## SportSync Engagement Sync\n\n_Last synced: 2026-02-28T12:00:00Z_\n\n### Data (for pipeline)\n\n\`\`\`json\n{"backendPreferences":{"engagement":{"football":{"clicks":25,"lastClick":"2026-02-28T11:00:00Z"},"golf":{"clicks":10,"lastClick":"2026-02-27T09:00:00Z"}}},"telemetry":{"blocks":{"match-result":5}},"syncedAt":"2026-02-28T12:00:00Z"}\n\`\`\`\n`;
		const result = parseEngagementFromIssueBody(body);
		expect(result.football.clicks).toBe(25);
		expect(result.golf.clicks).toBe(10);
	});
});

// ============================================================
// mergeEngagement
// ============================================================
describe("mergeEngagement()", () => {
	it("sums clicks and keeps latest lastClick across sources", () => {
		const a = { football: { clicks: 10, lastClick: "2026-02-10T00:00:00Z" } };
		const b = { football: { clicks: 5, lastClick: "2026-02-15T00:00:00Z" } };
		const result = mergeEngagement(a, b);
		expect(result.football.clicks).toBe(15);
		expect(result.football.lastClick).toBe("2026-02-15T00:00:00Z");
	});

	it("merges different sports from different sources", () => {
		const a = { football: { clicks: 10, lastClick: "2026-02-10T00:00:00Z" } };
		const b = { golf: { clicks: 5, lastClick: "2026-02-15T00:00:00Z" } };
		const result = mergeEngagement(a, b);
		expect(result.football.clicks).toBe(10);
		expect(result.golf.clicks).toBe(5);
	});

	it("handles null and undefined sources", () => {
		const a = { football: { clicks: 10, lastClick: "2026-02-10T00:00:00Z" } };
		const result = mergeEngagement(null, a, undefined);
		expect(result.football.clicks).toBe(10);
	});

	it("returns empty object for no valid sources", () => {
		expect(mergeEngagement(null, undefined)).toEqual({});
	});
});

// ============================================================
// readEngagementFromFile
// ============================================================
describe("readEngagementFromFile()", () => {
	it("reads engagement from engagement-data.json", () => {
		const tmpDir = makeTempDir();
		const data = {
			engagement: { football: { clicks: 12, lastClick: "2026-02-15T00:00:00Z" } },
			exportedAt: "2026-02-15T00:00:00Z",
		};
		fs.writeFileSync(path.join(tmpDir, "engagement-data.json"), JSON.stringify(data));
		const result = readEngagementFromFile(tmpDir);
		expect(result.football.clicks).toBe(12);
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("returns null when file does not exist", () => {
		const tmpDir = makeTempDir();
		expect(readEngagementFromFile(tmpDir)).toBeNull();
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("returns null for malformed file", () => {
		const tmpDir = makeTempDir();
		fs.writeFileSync(path.join(tmpDir, "engagement-data.json"), "not json");
		expect(readEngagementFromFile(tmpDir)).toBeNull();
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("returns null when engagement key is missing", () => {
		const tmpDir = makeTempDir();
		fs.writeFileSync(path.join(tmpDir, "engagement-data.json"), JSON.stringify({ other: true }));
		expect(readEngagementFromFile(tmpDir)).toBeNull();
		fs.rmSync(tmpDir, { recursive: true });
	});
});

// ============================================================
// parseFavoritesFromIssueBody
// ============================================================
describe("parseFavoritesFromIssueBody()", () => {
	it("parses favorites from favorites path", () => {
		const body = '```json\n{"favorites":{"favoriteTeams":["Liverpool","Arsenal"],"favoritePlayers":["Salah"]}}\n```';
		const result = parseFavoritesFromIssueBody(body);
		expect(result.favoriteTeams).toEqual(["Liverpool", "Arsenal"]);
		expect(result.favoritePlayers).toEqual(["Salah"]);
	});

	it("parses favorites from backendPreferences path", () => {
		const body = '```json\n{"backendPreferences":{"favoriteTeams":["Barcelona"],"favoritePlayers":[]}}\n```';
		const result = parseFavoritesFromIssueBody(body);
		expect(result.favoriteTeams).toEqual(["Barcelona"]);
		expect(result.favoritePlayers).toEqual([]);
	});

	it("returns null when no favorites present", () => {
		const body = '```json\n{"favorites":{"engagement":{"football":{"clicks":5}}}}\n```';
		expect(parseFavoritesFromIssueBody(body)).toBeNull();
	});

	it("returns null for empty teams and players", () => {
		const body = '```json\n{"favorites":{"favoriteTeams":[],"favoritePlayers":[]}}\n```';
		expect(parseFavoritesFromIssueBody(body)).toBeNull();
	});

	it("returns null for null/undefined input", () => {
		expect(parseFavoritesFromIssueBody(null)).toBeNull();
		expect(parseFavoritesFromIssueBody(undefined)).toBeNull();
	});
});

// ============================================================
// parseWatchFeedbackFromIssueBody
// ============================================================
describe("parseWatchFeedbackFromIssueBody()", () => {
	it("parses watch feedback from favorites path", () => {
		const body = '```json\n{"favorites":{"watchFeedback":{"pick1":{"value":"up","timestamp":"2026-02-15T12:00:00Z"},"pick2":{"value":"down","timestamp":"2026-02-15T13:00:00Z"}}}}\n```';
		const result = parseWatchFeedbackFromIssueBody(body);
		expect(result).toEqual({ up: 1, down: 1, total: 2 });
	});

	it("parses watch feedback from backendPreferences path", () => {
		const body = '```json\n{"backendPreferences":{"watchFeedback":{"a":{"value":"up"},"b":{"value":"up"},"c":{"value":"down"}}}}\n```';
		const result = parseWatchFeedbackFromIssueBody(body);
		expect(result).toEqual({ up: 2, down: 1, total: 3 });
	});

	it("returns null when no watch feedback present", () => {
		const body = '```json\n{"favorites":{"engagement":{"football":{"clicks":5}}}}\n```';
		expect(parseWatchFeedbackFromIssueBody(body)).toBeNull();
	});

	it("returns null for empty watch feedback", () => {
		const body = '```json\n{"favorites":{"watchFeedback":{}}}\n```';
		expect(parseWatchFeedbackFromIssueBody(body)).toBeNull();
	});

	it("returns null for null/undefined input", () => {
		expect(parseWatchFeedbackFromIssueBody(null)).toBeNull();
		expect(parseWatchFeedbackFromIssueBody(undefined)).toBeNull();
	});
});

// ============================================================
// readWatchFeedbackFromFile
// ============================================================
describe("readWatchFeedbackFromFile()", () => {
	it("reads watch feedback from engagement-data.json", () => {
		const tmpDir = makeTempDir();
		fs.writeFileSync(path.join(tmpDir, "engagement-data.json"), JSON.stringify({
			watchFeedback: {
				"pick1": { value: "up", timestamp: "2026-02-15T12:00:00Z" },
				"pick2": { value: "down", timestamp: "2026-02-15T13:00:00Z" },
				"pick3": { value: "up", timestamp: "2026-02-15T14:00:00Z" },
			},
		}));
		const result = readWatchFeedbackFromFile(tmpDir);
		expect(result).toEqual({ up: 2, down: 1, total: 3 });
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("returns null when file has no watch feedback", () => {
		const tmpDir = makeTempDir();
		fs.writeFileSync(path.join(tmpDir, "engagement-data.json"), JSON.stringify({
			engagement: { football: { clicks: 5 } },
		}));
		expect(readWatchFeedbackFromFile(tmpDir)).toBeNull();
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("returns null when file does not exist", () => {
		const tmpDir = makeTempDir();
		expect(readWatchFeedbackFromFile(tmpDir)).toBeNull();
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("returns null for empty watch feedback object", () => {
		const tmpDir = makeTempDir();
		fs.writeFileSync(path.join(tmpDir, "engagement-data.json"), JSON.stringify({
			watchFeedback: {},
		}));
		expect(readWatchFeedbackFromFile(tmpDir)).toBeNull();
		fs.rmSync(tmpDir, { recursive: true });
	});
});

// ============================================================
// readFavoritesFromFile
// ============================================================
describe("readFavoritesFromFile()", () => {
	it("reads favorites from engagement-data.json", () => {
		const tmpDir = makeTempDir();
		fs.writeFileSync(path.join(tmpDir, "engagement-data.json"), JSON.stringify({
			favoriteTeams: ["Liverpool"],
			favoritePlayers: ["Salah"],
		}));
		const result = readFavoritesFromFile(tmpDir);
		expect(result.favoriteTeams).toEqual(["Liverpool"]);
		expect(result.favoritePlayers).toEqual(["Salah"]);
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("returns null when file has no favorites", () => {
		const tmpDir = makeTempDir();
		fs.writeFileSync(path.join(tmpDir, "engagement-data.json"), JSON.stringify({
			engagement: { football: { clicks: 5 } },
		}));
		expect(readFavoritesFromFile(tmpDir)).toBeNull();
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("returns null when file does not exist", () => {
		const tmpDir = makeTempDir();
		expect(readFavoritesFromFile(tmpDir)).toBeNull();
		fs.rmSync(tmpDir, { recursive: true });
	});
});

// ============================================================
// detectNewFavorites
// ============================================================
describe("detectNewFavorites()", () => {
	const userContext = {
		favoriteTeams: ["Barcelona", "Lyn"],
		favoritePlayers: ["Viktor Hovland", "Casper Ruud"],
	};

	it("detects new teams not in user-context", () => {
		const client = { favoriteTeams: ["Barcelona", "Liverpool", "Arsenal"], favoritePlayers: [] };
		const { newTeams, newPlayers } = detectNewFavorites(client, userContext);
		expect(newTeams).toEqual(["Liverpool", "Arsenal"]);
		expect(newPlayers).toEqual([]);
	});

	it("detects new players not in user-context", () => {
		const client = { favoriteTeams: [], favoritePlayers: ["Viktor Hovland", "Erling Haaland"] };
		const { newTeams, newPlayers } = detectNewFavorites(client, userContext);
		expect(newTeams).toEqual([]);
		expect(newPlayers).toEqual(["Erling Haaland"]);
	});

	it("is case-insensitive when matching", () => {
		const client = { favoriteTeams: ["barcelona", "BARCELONA"], favoritePlayers: ["casper ruud"] };
		const { newTeams, newPlayers } = detectNewFavorites(client, userContext);
		expect(newTeams).toEqual([]);
		expect(newPlayers).toEqual([]);
	});

	it("returns empty arrays for null input", () => {
		const { newTeams, newPlayers } = detectNewFavorites(null, userContext);
		expect(newTeams).toEqual([]);
		expect(newPlayers).toEqual([]);
	});

	it("handles empty user-context gracefully", () => {
		const client = { favoriteTeams: ["Liverpool"], favoritePlayers: ["Salah"] };
		const { newTeams, newPlayers } = detectNewFavorites(client, {});
		expect(newTeams).toEqual(["Liverpool"]);
		expect(newPlayers).toEqual(["Salah"]);
	});
});

// ============================================================
// evolvePreferences (integration)
// ============================================================
describe("evolvePreferences()", () => {
	let configDir, dataDir;

	beforeEach(() => {
		configDir = makeTempDir();
		dataDir = makeTempDir();
	});

	afterEach(() => {
		fs.rmSync(configDir, { recursive: true, force: true });
		fs.rmSync(dataDir, { recursive: true, force: true });
	});

	function writeUserContext(prefs) {
		const ctx = {
			favoriteTeams: ["Barcelona"],
			favoritePlayers: ["Viktor Hovland"],
			location: "Norway",
			sportPreferences: prefs,
		};
		fs.writeFileSync(path.join(configDir, "user-context.json"), JSON.stringify(ctx, null, 2));
		return ctx;
	}

	function writeEngagement(engagement) {
		fs.writeFileSync(
			path.join(dataDir, "engagement-data.json"),
			JSON.stringify({ engagement, exportedAt: new Date().toISOString() })
		);
	}

	it("full evolve flow: engagement → weight computation → user-context update", async () => {
		writeUserContext({ football: "medium", golf: "medium" });
		writeEngagement({
			golf: { clicks: 35, lastClick: new Date().toISOString() },
			football: { clicks: 5, lastClick: new Date().toISOString() },
		});

		const result = await evolvePreferences({ configDir, dataDir });
		expect(result.skipped).toBe(false);
		expect(result.changes.length).toBeGreaterThan(0);

		// Verify user-context.json was updated
		const updated = JSON.parse(fs.readFileSync(path.join(configDir, "user-context.json"), "utf-8"));
		expect(updated.sportPreferences.golf).toBe("high");
	});

	it("skips update when no changes needed", async () => {
		writeUserContext({ golf: "high" });
		writeEngagement({
			golf: { clicks: 40, lastClick: new Date().toISOString() },
		});

		const result = await evolvePreferences({ configDir, dataDir });
		expect(result.skipped).toBe(false);
		expect(result.changes).toHaveLength(0);
	});

	it("writes evolution history", async () => {
		writeUserContext({ football: "low" });
		writeEngagement({
			football: { clicks: 30, lastClick: new Date().toISOString() },
		});

		await evolvePreferences({ configDir, dataDir });
		const history = JSON.parse(fs.readFileSync(path.join(dataDir, "preference-evolution.json"), "utf-8"));
		expect(history.lastEvolved).toBeDefined();
		expect(history.runs.length).toBeGreaterThan(0);
		expect(history.currentWeights).toBeDefined();
	});

	it("caps history at 50 entries", async () => {
		writeUserContext({ football: "low" });

		// Pre-populate with 55 runs
		const existing = {
			runs: Array.from({ length: 55 }, (_, i) => ({
				timestamp: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
				totalClicks: 30,
				changes: 1,
				source: "local-file",
			})),
		};
		fs.writeFileSync(path.join(dataDir, "preference-evolution.json"), JSON.stringify(existing));

		writeEngagement({
			football: { clicks: 30, lastClick: new Date().toISOString() },
		});

		await evolvePreferences({ configDir, dataDir });
		const history = JSON.parse(fs.readFileSync(path.join(dataDir, "preference-evolution.json"), "utf-8"));
		expect(history.runs.length).toBeLessThanOrEqual(50);
	});

	it("preserves location and other non-evolving fields", async () => {
		const ctx = writeUserContext({ football: "low" });
		writeEngagement({
			football: { clicks: 30, lastClick: new Date().toISOString() },
		});

		await evolvePreferences({ configDir, dataDir });
		const updated = JSON.parse(fs.readFileSync(path.join(configDir, "user-context.json"), "utf-8"));
		expect(updated.location).toBe(ctx.location);
	});

	it("syncs new favorite teams from engagement-data.json", async () => {
		const ctx = writeUserContext({ football: "high" });
		// Write engagement data with favorites not in user-context
		const data = {
			engagement: { football: { clicks: 30, lastClick: new Date().toISOString() } },
			favoriteTeams: ["Barcelona", "Liverpool", "Arsenal"],
			favoritePlayers: ["Viktor Hovland", "Erling Haaland"],
		};
		fs.writeFileSync(path.join(dataDir, "engagement-data.json"), JSON.stringify(data));

		const result = await evolvePreferences({ configDir, dataDir });
		expect(result.skipped).toBe(false);

		const updated = JSON.parse(fs.readFileSync(path.join(configDir, "user-context.json"), "utf-8"));
		expect(updated.favoriteTeams).toContain("Liverpool");
		expect(updated.favoriteTeams).toContain("Arsenal");
		expect(updated.favoritePlayers).toContain("Erling Haaland");
		// Already-existing should not be duplicated
		expect(updated.favoriteTeams.filter(t => t === "Barcelona")).toHaveLength(1);
	});

	it("handles missing user-context.json gracefully", async () => {
		const result = await evolvePreferences({ configDir, dataDir });
		expect(result.skipped).toBe(true);
		expect(result.reason).toBe("no-user-context");
	});

	it("skips when insufficient engagement data and no watch feedback", async () => {
		writeUserContext({ football: "high" });
		writeEngagement({
			football: { clicks: 5, lastClick: new Date().toISOString() },
		});

		const result = await evolvePreferences({ configDir, dataDir });
		expect(result.skipped).toBe(true);
		expect(result.reason).toBe("insufficient-data");
	});

	it("records watch feedback in evolution history", async () => {
		writeUserContext({ football: "high" });
		const data = {
			engagement: { football: { clicks: 30, lastClick: new Date().toISOString() } },
			watchFeedback: {
				"pick1": { value: "up", timestamp: "2026-02-15T12:00:00Z" },
				"pick2": { value: "down", timestamp: "2026-02-15T13:00:00Z" },
			},
		};
		fs.writeFileSync(path.join(dataDir, "engagement-data.json"), JSON.stringify(data));

		const result = await evolvePreferences({ configDir, dataDir });
		expect(result.skipped).toBe(false);
		expect(result.watchFeedback).toEqual({ up: 1, down: 1, total: 2 });

		const history = JSON.parse(fs.readFileSync(path.join(dataDir, "preference-evolution.json"), "utf-8"));
		expect(history.watchFeedback).toEqual({ up: 1, down: 1, total: 2 });
	});

	it("writes a heartbeat entry when no engagement and no prior history", async () => {
		writeUserContext({ football: "high" });
		// No engagement data file, no watch feedback
		const result = await evolvePreferences({ configDir, dataDir });
		expect(result.skipped).toBe(true);
		expect(result.reason).toBe("insufficient-data");
		expect(result.heartbeatWritten).toBe(true);

		const history = JSON.parse(fs.readFileSync(path.join(dataDir, "preference-evolution.json"), "utf-8"));
		expect(history.runs).toHaveLength(1);
		expect(history.runs[0].type).toBe("heartbeat");
		expect(history.runs[0].changes).toBe(0);
		expect(history.runs[0].reason).toBe("insufficient-data");
		expect(history.lastEvolved).toBeDefined();
	});

	it("does not write a duplicate heartbeat when last entry is <24h old", async () => {
		writeUserContext({ football: "high" });
		// Pre-populate with a recent heartbeat (1 hour old)
		const recentTs = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		fs.writeFileSync(path.join(dataDir, "preference-evolution.json"), JSON.stringify({
			runs: [{ timestamp: recentTs, type: "heartbeat", changes: 0, reason: "insufficient-data" }],
			lastEvolved: recentTs,
		}));

		const result = await evolvePreferences({ configDir, dataDir });
		expect(result.skipped).toBe(true);
		expect(result.heartbeatWritten).toBe(false);

		const history = JSON.parse(fs.readFileSync(path.join(dataDir, "preference-evolution.json"), "utf-8"));
		// Still only the original entry — no duplicate
		expect(history.runs).toHaveLength(1);
		expect(history.runs[0].timestamp).toBe(recentTs);
	});

	it("writes a heartbeat when last entry is >=24h old", async () => {
		writeUserContext({ football: "high" });
		// Pre-populate with an old heartbeat (25 hours old)
		const oldTs = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
		fs.writeFileSync(path.join(dataDir, "preference-evolution.json"), JSON.stringify({
			runs: [{ timestamp: oldTs, type: "heartbeat", changes: 0, reason: "insufficient-data" }],
			lastEvolved: oldTs,
		}));

		const result = await evolvePreferences({ configDir, dataDir });
		expect(result.skipped).toBe(true);
		expect(result.heartbeatWritten).toBe(true);

		const history = JSON.parse(fs.readFileSync(path.join(dataDir, "preference-evolution.json"), "utf-8"));
		expect(history.runs).toHaveLength(2);
		expect(history.runs[1].type).toBe("heartbeat");
	});

	it("records a regular (non-heartbeat) entry when there are real changes", async () => {
		writeUserContext({ football: "low" });
		writeEngagement({
			football: { clicks: 30, lastClick: new Date().toISOString() },
		});

		await evolvePreferences({ configDir, dataDir });
		const history = JSON.parse(fs.readFileSync(path.join(dataDir, "preference-evolution.json"), "utf-8"));
		expect(history.runs.length).toBeGreaterThan(0);
		const latest = history.runs[history.runs.length - 1];
		// Real evolution entries have weightChanges/newTeams/newPlayers fields; no type:"heartbeat"
		expect(latest.type).not.toBe("heartbeat");
		expect(latest.changes).toBeGreaterThan(0);
	});

	it("bumps preferenceEvolution loop score to 1.0 after a heartbeat is recorded", async () => {
		writeUserContext({ football: "high" });

		// Before: evaluate with empty history (simulates the stuck-at-0.5 state).
		// We create an empty file to represent the "infrastructure exists but
		// no entries yet" partial state.
		fs.writeFileSync(path.join(dataDir, "preference-evolution.json"), JSON.stringify({ runs: [] }));
		const scriptsDir = path.resolve(import.meta.dirname, "../scripts");
		const before = evaluatePreferenceEvolution(dataDir, scriptsDir);
		expect(before.score).toBe(0.5);

		// Run evolve — should record a heartbeat
		await evolvePreferences({ configDir, dataDir });

		// After: score should be 1.0
		const after = evaluatePreferenceEvolution(dataDir, scriptsDir);
		expect(after.score).toBe(1.0);
	});

	it("does not skip when only watch feedback is available (no weight changes)", async () => {
		writeUserContext({ football: "high" });
		const data = {
			engagement: { football: { clicks: 5, lastClick: new Date().toISOString() } },
			watchFeedback: {
				"pick1": { value: "up" },
				"pick2": { value: "up" },
			},
		};
		fs.writeFileSync(path.join(dataDir, "engagement-data.json"), JSON.stringify(data));

		const result = await evolvePreferences({ configDir, dataDir });
		// Should NOT skip — watch feedback present even though clicks < 20
		expect(result.skipped).toBe(false);
		expect(result.watchFeedback).toEqual({ up: 2, down: 0, total: 2 });
	});
});

// ============================================================
// exportForBackend (PreferencesManager)
// ============================================================
describe("PreferencesManager.exportForBackend()", () => {
	beforeEach(() => {
		localStorageMock.clear();
	});

	it("includes engagement data in export", () => {
		const pm = new PreferencesManager();
		pm.trackEngagement("football");
		pm.trackEngagement("football");
		pm.trackEngagement("golf");
		const exported = pm.exportForBackend();
		expect(exported.engagement).toBeDefined();
		expect(exported.engagement.football.clicks).toBe(2);
		expect(exported.engagement.golf.clicks).toBe(1);
	});

	it("derives sport preferences from engagement when sufficient data", () => {
		const pm = new PreferencesManager();
		// Simulate 25 clicks: 20 football, 5 golf
		for (let i = 0; i < 20; i++) pm.trackEngagement("football");
		for (let i = 0; i < 5; i++) pm.trackEngagement("golf");
		const exported = pm.exportForBackend();
		expect(exported.sportPreferences.football).toBe("high"); // 80%
		expect(exported.sportPreferences.golf).toBe("medium"); // 20%
	});

	it("returns empty sportPreferences when < 20 clicks", () => {
		const pm = new PreferencesManager();
		pm.trackEngagement("football");
		pm.trackEngagement("golf");
		const exported = pm.exportForBackend();
		expect(exported.sportPreferences).toEqual({});
	});

	it("includes watchFeedback in export", () => {
		const pm = new PreferencesManager();
		pm.setWatchFeedback("pick-1", "up");
		pm.setWatchFeedback("pick-2", "down");
		const exported = pm.exportForBackend();
		expect(exported.watchFeedback).toBeDefined();
		expect(exported.watchFeedback["pick-1"].value).toBe("up");
		expect(exported.watchFeedback["pick-2"].value).toBe("down");
	});
});
