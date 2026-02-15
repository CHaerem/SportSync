import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Mock localStorage
const store = {};
const localStorageMock = {
	getItem: vi.fn((key) => store[key] ?? null),
	setItem: vi.fn((key, value) => { store[key] = value; }),
	removeItem: vi.fn((key) => { delete store[key]; }),
	clear: vi.fn(() => { for (const k in store) delete store[k]; }),
};

globalThis.localStorage = localStorageMock;
globalThis.window = globalThis;

// Mock window.open
window.open = vi.fn();

// Load PreferencesManager first (FeedbackManager reads from it)
const pmSrc = readFileSync(join(import.meta.dirname, "../docs/js/preferences-manager.js"), "utf-8");
eval(pmSrc);

// Load FeedbackManager
const src = readFileSync(join(import.meta.dirname, "../docs/js/feedback-manager.js"), "utf-8");
eval(src);

const FeedbackManager = window.FeedbackManager;

// URLSearchParams encodes spaces as '+', decodeURIComponent doesn't decode '+'
const decodeURL = (url) => decodeURIComponent(url.replace(/\+/g, " "));

describe("FeedbackManager", () => {
	let fm;

	beforeEach(() => {
		localStorageMock.clear();
		localStorageMock.getItem.mockClear();
		localStorageMock.setItem.mockClear();
		window.open.mockClear();
		// Reset _ssPreferences so tests are isolated
		window._ssPreferences = undefined;
		fm = new FeedbackManager();
	});

	describe("constructor and _load()", () => {
		it("starts with empty reports and suggestions", () => {
			expect(fm.data.reports).toEqual([]);
			expect(fm.data.suggestions).toEqual([]);
		});

		it("has no votes property", () => {
			expect(fm.data.votes).toBeUndefined();
		});

		it("loads existing data from localStorage", () => {
			store["sportsync-feedback"] = JSON.stringify({
				reports: [{ eventId: "x", title: "T", message: "M", sport: "football", tournament: "PL", timestamp: "2026-01-01" }],
				suggestions: [{ text: "Add hockey", timestamp: "2026-01-01" }],
			});
			const fm2 = new FeedbackManager();
			expect(fm2.data.reports).toHaveLength(1);
			expect(fm2.data.suggestions).toHaveLength(1);
		});

		it("returns defaults when localStorage has invalid JSON", () => {
			store["sportsync-feedback"] = "not-json{{{";
			const fm2 = new FeedbackManager();
			expect(fm2.data.reports).toEqual([]);
			expect(fm2.data.suggestions).toEqual([]);
		});
	});

	describe("report()", () => {
		it("stores report with all fields", () => {
			fm.report("evt-1", "Barcelona v Real Madrid", "Wrong time", "football", "La Liga");
			expect(fm.data.reports).toHaveLength(1);
			const r = fm.data.reports[0];
			expect(r.eventId).toBe("evt-1");
			expect(r.title).toBe("Barcelona v Real Madrid");
			expect(r.message).toBe("Wrong time");
			expect(r.sport).toBe("football");
			expect(r.tournament).toBe("La Liga");
			expect(r.timestamp).toBeTruthy();
		});

		it("stores report with null sport/tournament when omitted", () => {
			fm.report("evt-2", "Some Event", "Issue");
			const r = fm.data.reports[0];
			expect(r.sport).toBeNull();
			expect(r.tournament).toBeNull();
		});

		it("persists to localStorage after report", () => {
			fm.report("evt-1", "Title", "Message", "golf", "PGA");
			expect(localStorageMock.setItem).toHaveBeenCalledWith(
				"sportsync-feedback",
				expect.stringContaining("evt-1")
			);
		});

		it("accumulates multiple reports", () => {
			fm.report("a", "A", "msg1", "football", "PL");
			fm.report("b", "B", "msg2", "golf", "PGA");
			fm.report("c", "C", "msg3");
			expect(fm.data.reports).toHaveLength(3);
		});
	});

	describe("suggest()", () => {
		it("stores suggestion with trimmed text", () => {
			fm.suggest("  Add hockey  ");
			expect(fm.data.suggestions).toHaveLength(1);
			expect(fm.data.suggestions[0].text).toBe("Add hockey");
			expect(fm.data.suggestions[0].timestamp).toBeTruthy();
		});

		it("ignores empty, null, and whitespace-only suggestions", () => {
			fm.suggest("");
			fm.suggest(null);
			fm.suggest(undefined);
			fm.suggest("   ");
			expect(fm.data.suggestions).toHaveLength(0);
		});

		it("persists to localStorage", () => {
			fm.suggest("Track F1 sprint races");
			expect(localStorageMock.setItem).toHaveBeenCalled();
		});

		it("accumulates multiple suggestions", () => {
			fm.suggest("Add hockey");
			fm.suggest("Dark mode");
			expect(fm.data.suggestions).toHaveLength(2);
		});
	});

	describe("pendingCount()", () => {
		it("returns 0 when empty", () => {
			expect(fm.pendingCount()).toBe(0);
		});

		it("counts reports and suggestions", () => {
			fm.report("a", "A", "msg");
			fm.suggest("idea");
			fm.suggest("another idea");
			expect(fm.pendingCount()).toBe(3);
		});
	});

	describe("_getPreferencesSnapshot()", () => {
		it("returns favorites from PreferencesManager", () => {
			const pm = new PreferencesManager();
			window._ssPreferences = pm;

			const snap = fm._getPreferencesSnapshot();
			expect(snap.favoriteTeams.football).toContain("Barcelona");
			expect(snap.favoritePlayers.golf).toContain("Viktor Hovland");
			expect(snap.favoritePlayers.chess).toContain("Magnus Carlsen");
			expect(snap.engagement).toBeDefined();
		});

		it("reflects changes made to PreferencesManager", () => {
			const pm = new PreferencesManager();
			pm.addFavoriteTeam("football", "Arsenal");
			pm.addFavoritePlayer("tennis", "Novak Djokovic");
			window._ssPreferences = pm;

			const snap = fm._getPreferencesSnapshot();
			expect(snap.favoriteTeams.football).toContain("Arsenal");
			expect(snap.favoritePlayers.tennis).toContain("Novak Djokovic");
		});

		it("includes engagement data", () => {
			const pm = new PreferencesManager();
			pm.trackEngagement("football");
			pm.trackEngagement("football");
			pm.trackEngagement("golf");
			window._ssPreferences = pm;

			const snap = fm._getPreferencesSnapshot();
			expect(snap.engagement.football.clicks).toBe(2);
			expect(snap.engagement.golf.clicks).toBe(1);
		});

		it("returns null when PreferencesManager is not available", () => {
			const saved = window.PreferencesManager;
			window.PreferencesManager = undefined;
			expect(fm._getPreferencesSnapshot()).toBeNull();
			window.PreferencesManager = saved;
		});
	});

	describe("buildIssueURL()", () => {
		it("returns a valid GitHub issue URL", () => {
			const url = fm.buildIssueURL();
			expect(url).toMatch(/^https:\/\/github\.com\/CHaerem\/SportSync\/issues\/new\?/);
		});

		it("includes title with current date", () => {
			const url = fm.buildIssueURL();
			const today = new Date().toISOString().slice(0, 10);
			expect(url).toContain(`User+feedback+${today}`);
		});

		it("includes user-feedback label", () => {
			const url = fm.buildIssueURL();
			expect(url).toContain("labels=user-feedback");
		});

		it("includes reports in human-readable and JSON sections", () => {
			fm.report("evt-1", "Real Madrid v Barca", "Wrong date", "football", "La Liga");
			const url = decodeURL(fm.buildIssueURL());
			// Human-readable
			expect(url).toContain("### Issues Reported");
			expect(url).toContain("**Real Madrid v Barca**: Wrong date");
			// JSON block
			expect(url).toContain("```json");
			expect(url).toContain('"eventId":"evt-1"');
			expect(url).toContain('"sport":"football"');
			expect(url).toContain('"tournament":"La Liga"');
		});

		it("includes suggestions in human-readable and JSON sections", () => {
			fm.suggest("Add hockey coverage");
			const url = decodeURL(fm.buildIssueURL());
			expect(url).toContain("### Suggestions");
			expect(url).toContain("- Add hockey coverage");
			expect(url).toContain('"text":"Add hockey coverage"');
		});

		it("includes favorites snapshot from PreferencesManager", () => {
			const pm = new PreferencesManager();
			window._ssPreferences = pm;

			const url = decodeURL(fm.buildIssueURL());
			expect(url).toContain("### Current Favorites");
			expect(url).toContain("**football** teams: Barcelona, Liverpool, Lyn");
			expect(url).toContain("**golf** players: Viktor Hovland");
		});

		it("omits favorites section when PreferencesManager unavailable", () => {
			const saved = window.PreferencesManager;
			window.PreferencesManager = undefined;
			const url = decodeURL(fm.buildIssueURL());
			expect(url).not.toContain("### Current Favorites");
			window.PreferencesManager = saved;
		});

		it("JSON block is parseable", () => {
			const pm = new PreferencesManager();
			window._ssPreferences = pm;
			fm.report("evt-1", "Title", "Msg", "golf", "PGA Tour");
			fm.suggest("More chess");

			const url = decodeURL(fm.buildIssueURL());
			const jsonMatch = url.match(/```json\n(.+?)\n```/s);
			expect(jsonMatch).toBeTruthy();

			const parsed = JSON.parse(jsonMatch[1]);
			expect(parsed.favorites.favoriteTeams.football).toContain("Barcelona");
			expect(parsed.reports).toHaveLength(1);
			expect(parsed.reports[0].sport).toBe("golf");
			expect(parsed.suggestions).toHaveLength(1);
			expect(parsed.date).toBe(new Date().toISOString().slice(0, 10));
		});

		it("warns when URL exceeds 7500 chars", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			// Generate a lot of suggestions to inflate URL
			for (let i = 0; i < 100; i++) {
				fm.suggest(`This is a long suggestion number ${i} that adds significant length to the URL body to test the truncation warning`);
			}
			fm.buildIssueURL();
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("may be truncated"));
			warnSpy.mockRestore();
		});
	});

	describe("submit()", () => {
		it("opens a new window with the issue URL", () => {
			fm.suggest("Test");
			fm.submit();
			expect(window.open).toHaveBeenCalledWith(
				expect.stringContaining("github.com/CHaerem/SportSync/issues/new"),
				"_blank"
			);
		});

		it("clears data after submit", () => {
			fm.report("a", "A", "msg");
			fm.suggest("idea");
			fm.submit();
			expect(fm.data.reports).toEqual([]);
			expect(fm.data.suggestions).toEqual([]);
			expect(fm.pendingCount()).toBe(0);
		});

		it("persists cleared state to localStorage", () => {
			fm.suggest("test");
			fm.submit();
			const stored = JSON.parse(store["sportsync-feedback"]);
			expect(stored.reports).toEqual([]);
			expect(stored.suggestions).toEqual([]);
		});
	});

	describe("clear()", () => {
		it("resets reports and suggestions", () => {
			fm.report("a", "A", "msg");
			fm.suggest("idea");
			fm.clear();
			expect(fm.data.reports).toEqual([]);
			expect(fm.data.suggestions).toEqual([]);
		});

		it("persists to localStorage", () => {
			fm.clear();
			expect(localStorageMock.setItem).toHaveBeenCalledWith(
				"sportsync-feedback",
				JSON.stringify({ reports: [], suggestions: [] })
			);
		});
	});
});
