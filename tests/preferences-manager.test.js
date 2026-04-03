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

// Load sport-config.js first (provides normalizeClientSportId, normalizePipelineSportId)
const sportConfigSrc = readFileSync(join(import.meta.dirname, "../docs/js/sport-config.js"), "utf-8");
eval(sportConfigSrc);

const src = readFileSync(join(import.meta.dirname, "../docs/js/preferences-manager.js"), "utf-8");
eval(src);
const PreferencesManager = window.PreferencesManager;

describe("PreferencesManager", () => {
	let pm;

	beforeEach(() => {
		localStorageMock.clear();
		localStorageMock.getItem.mockClear();
		localStorageMock.setItem.mockClear();
		localStorageMock.removeItem.mockClear();
		pm = new PreferencesManager();
	});

	describe("loadPreferences()", () => {
		it("returns empty defaults when localStorage is empty", () => {
			const prefs = pm.getPreferences();
			expect(prefs.favoriteSports).toEqual([]);
			expect(prefs.favoriteTeams).toEqual({});
			expect(prefs.favoritePlayers).toEqual({});
			expect(prefs.sportPreferences).toEqual({});
			expect(prefs.defaultView).toBe("list");
			expect(prefs.theme).toBe("auto");
		});

		it("loads stored preferences from localStorage", () => {
			const custom = {
				favoriteSports: ["football"], favoriteTeams: { football: ["Arsenal"] },
				favoritePlayers: {}, favoriteEvents: [], sportPreferences: {},
				hidePassedEvents: true, defaultView: "timeline", theme: "dark",
			};
			store["sportsync-preferences"] = JSON.stringify(custom);
			expect(new PreferencesManager().getPreferences()).toEqual(custom);
		});

		it("returns defaults when localStorage has invalid JSON", () => {
			store["sportsync-preferences"] = "not-json{{{";
			expect(new PreferencesManager().getPreferences().favoriteSports).toEqual([]);
		});
	});

	describe("savePreferences()", () => {
		it("persists to localStorage and returns true", () => {
			expect(pm.savePreferences()).toBe(true);
			expect(localStorageMock.setItem).toHaveBeenCalledWith("sportsync-preferences", expect.any(String));
		});

		it("returns false when localStorage throws", () => {
			localStorageMock.setItem.mockImplementationOnce(() => { throw new Error("quota"); });
			expect(pm.savePreferences()).toBe(false);
		});
	});

	describe("toggleFavoriteSport()", () => {
		it("adds and removes sports", () => {
			expect(pm.toggleFavoriteSport("golf")).toBe(true);
			expect(pm.isFavoriteSport("golf")).toBe(true);
			expect(pm.toggleFavoriteSport("golf")).toBe(false);
			expect(pm.isFavoriteSport("golf")).toBe(false);
		});

		it("returns false for non-favorited sport", () => {
			expect(pm.isFavoriteSport("chess")).toBe(false);
		});
	});

	describe("team preferences", () => {
		it("adds team and creates sport category", () => {
			pm.addFavoriteTeam("football", "Arsenal");
			expect(pm.getFavoriteTeams("football")).toContain("Arsenal");
		});

		it("prevents duplicates", () => {
			pm.addFavoriteTeam("football", "Arsenal");
			pm.addFavoriteTeam("football", "Arsenal");
			expect(pm.getFavoriteTeams("football").filter((t) => t === "Arsenal")).toHaveLength(1);
		});

		it("creates sport category if missing", () => {
			pm.addFavoriteTeam("hockey", "Vålerenga");
			expect(pm.getFavoriteTeams("hockey")).toEqual(["Vålerenga"]);
		});

		it("removes existing team", () => {
			pm.addFavoriteTeam("football", "Barcelona");
			pm.removeFavoriteTeam("football", "Barcelona");
			expect(pm.getFavoriteTeams("football")).not.toContain("Barcelona");
		});

		it("no-ops for missing team/sport", () => {
			pm.removeFavoriteTeam("football", "NonExistent FC");
			pm.removeFavoriteTeam("cricket", "Mumbai Indians");
		});

		it("returns empty array for unknown sport", () => {
			expect(pm.getFavoriteTeams("curling")).toEqual([]);
		});

		it("rejects empty string, null, and undefined team names", () => {
			expect(pm.addFavoriteTeam("football", "")).toBe(false);
			expect(pm.addFavoriteTeam("football", null)).toBe(false);
			expect(pm.addFavoriteTeam("football", undefined)).toBe(false);
			expect(pm.addFavoriteTeam("football", "   ")).toBe(false);
		});

		it("rejects empty string, null, and undefined sport names", () => {
			expect(pm.addFavoriteTeam("", "Arsenal")).toBe(false);
			expect(pm.addFavoriteTeam(null, "Arsenal")).toBe(false);
			expect(pm.addFavoriteTeam(undefined, "Arsenal")).toBe(false);
		});

		it("returns true when team is added, false when duplicate", () => {
			expect(pm.addFavoriteTeam("football", "Arsenal")).toBe(true);
			expect(pm.addFavoriteTeam("football", "Arsenal")).toBe(false);
		});

		it("marks pending edits when adding/removing teams", () => {
			expect(pm.hasPendingEdits()).toBe(false);
			pm.addFavoriteTeam("football", "Arsenal");
			expect(pm.hasPendingEdits()).toBe(true);
		});
	});

	describe("isTeamFavorite()", () => {
		it("matches exact, fuzzy substring, and case-insensitive", () => {
			pm.addFavoriteTeam("football", "Barcelona");
			expect(pm.isTeamFavorite("football", "Barcelona")).toBe(true);
			expect(pm.isTeamFavorite("football", "FC Barcelona")).toBe(true);
			expect(pm.isTeamFavorite("football", "barcelona")).toBe(true);
		});

		it("returns false for non-matching team", () => {
			expect(pm.isTeamFavorite("football", "Real Madrid")).toBe(false);
		});
	});

	describe("player preferences", () => {
		it("adds, deduplicates, and removes players", () => {
			pm.addFavoritePlayer("golf", "Viktor Hovland");
			pm.addFavoritePlayer("golf", "Rory McIlroy");
			expect(pm.getFavoritePlayers("golf")).toContain("Rory McIlroy");
			expect(pm.getFavoritePlayers("golf")).toContain("Viktor Hovland");
			pm.addFavoritePlayer("golf", "Viktor Hovland");
			expect(pm.getFavoritePlayers("golf").filter((p) => p === "Viktor Hovland")).toHaveLength(1);
			pm.removeFavoritePlayer("golf", "Viktor Hovland");
			expect(pm.getFavoritePlayers("golf")).not.toContain("Viktor Hovland");
		});

		it("creates sport category if missing", () => {
			pm.addFavoritePlayer("chess", "Magnus Carlsen");
			expect(pm.getFavoritePlayers("chess")).toEqual(["Magnus Carlsen"]);
		});

		it("no-ops removing non-existent player", () => {
			pm.addFavoritePlayer("golf", "Viktor Hovland");
			const before = pm.getFavoritePlayers("golf").length;
			pm.removeFavoritePlayer("golf", "Tiger Woods");
			expect(pm.getFavoritePlayers("golf")).toHaveLength(before);
		});

		it("rejects empty string, null, and undefined player names", () => {
			expect(pm.addFavoritePlayer("golf", "")).toBe(false);
			expect(pm.addFavoritePlayer("golf", null)).toBe(false);
			expect(pm.addFavoritePlayer("golf", undefined)).toBe(false);
			expect(pm.addFavoritePlayer("golf", "   ")).toBe(false);
		});

		it("rejects empty string, null, and undefined sport names", () => {
			expect(pm.addFavoritePlayer("", "Tiger Woods")).toBe(false);
			expect(pm.addFavoritePlayer(null, "Tiger Woods")).toBe(false);
		});

		it("returns true when player is added, false when duplicate", () => {
			expect(pm.addFavoritePlayer("golf", "Rory McIlroy")).toBe(true);
			expect(pm.addFavoritePlayer("golf", "Rory McIlroy")).toBe(false);
		});

		it("marks pending edits when adding/removing players", () => {
			expect(pm.hasPendingEdits()).toBe(false);
			pm.addFavoritePlayer("golf", "Tiger Woods");
			expect(pm.hasPendingEdits()).toBe(true);
		});
	});

	describe("isPlayerFavorite()", () => {
		it("matches exact, fuzzy, and case-insensitive", () => {
			pm.addFavoritePlayer("tennis", "Casper Ruud");
			pm.addFavoritePlayer("golf", "Viktor Hovland");
			expect(pm.isPlayerFavorite("tennis", "Casper Ruud")).toBe(true);
			expect(pm.isPlayerFavorite("golf", "Viktor Hovland (NOR)")).toBe(true);
			expect(pm.isPlayerFavorite("tennis", "casper ruud")).toBe(true);
		});

		it("returns false for non-matching player", () => {
			expect(pm.isPlayerFavorite("golf", "Tiger Woods")).toBe(false);
		});
	});

	describe("toggleEventFavorite()", () => {
		it("adds and removes event favorites", () => {
			expect(pm.toggleEventFavorite("evt-123")).toBe(true);
			expect(pm.isEventIdFavorite("evt-123")).toBe(true);
			expect(pm.toggleEventFavorite("evt-123")).toBe(false);
			expect(pm.isEventIdFavorite("evt-123")).toBe(false);
		});
	});

	describe("isEventFavorite()", () => {
		it("matches by event ID", () => {
			pm.toggleEventFavorite("evt-1");
			expect(pm.isEventFavorite({ sport: "chess", title: "test" }, "evt-1")).toBe(true);
		});

		it("matches by favorite sport", () => {
			pm.toggleFavoriteSport("chess");
			expect(pm.isEventFavorite({ sport: "chess", title: "test" })).toBe(true);
		});

		it("matches football home and away teams", () => {
			pm.addFavoriteTeam("football", "Barcelona");
			pm.addFavoriteTeam("football", "Liverpool");
			expect(pm.isEventFavorite({ sport: "football", homeTeam: "FC Barcelona", awayTeam: "Getafe", title: "" })).toBe(true);
			expect(pm.isEventFavorite({ sport: "football", homeTeam: "Getafe", awayTeam: "Liverpool FC", title: "" })).toBe(true);
		});

		it("matches esports team in title", () => {
			pm.addFavoriteTeam("esports", "100 Thieves");
			expect(pm.isEventFavorite({ sport: "esports", title: "100 Thieves vs Cloud9" })).toBe(true);
		});

		it("matches golf Norwegian player and tennis participant", () => {
			pm.addFavoritePlayer("golf", "Viktor Hovland");
			pm.addFavoritePlayer("tennis", "Casper Ruud");
			expect(pm.isEventFavorite({ sport: "golf", title: "PGA", norwegianPlayers: [{ name: "Viktor Hovland" }] })).toBe(true);
			expect(pm.isEventFavorite({ sport: "tennis", title: "Roland Garros", participants: ["Casper Ruud"] })).toBe(true);
		});

		it("returns false when nothing matches", () => {
			expect(pm.isEventFavorite({ sport: "chess", title: "FIDE Candidates" })).toBe(false);
		});

		it("matches chess participants", () => {
			pm.addFavoritePlayer("chess", "Magnus Carlsen");
			expect(pm.isEventFavorite({ sport: "chess", title: "WCC", participants: ["Magnus Carlsen", "Ding Liren"] })).toBe(true);
		});
	});

	describe("server preferences", () => {
		it("getServerPublishedAt returns null when no server prefs loaded", () => {
			expect(pm.getServerPublishedAt()).toBeNull();
		});

		it("getEffectivePreferences returns local when no server prefs", () => {
			pm.addFavoriteTeam("football", "Arsenal");
			const eff = pm.getEffectivePreferences();
			expect(eff.favoriteTeams.football).toEqual(["Arsenal"]);
		});

		it("getEffectivePreferences returns server data when loaded and no pending edits", () => {
			pm._serverPrefs = {
				favoriteTeamsBySport: { football: ["Barcelona", "Liverpool"] },
				favoritePlayersBySport: { golf: ["Viktor Hovland"] },
				sportPreferences: { football: "high", golf: "high" },
				_publishedAt: "2026-03-04T00:00:00Z",
			};
			const eff = pm.getEffectivePreferences();
			expect(eff.favoriteTeams.football).toEqual(["Barcelona", "Liverpool"]);
			expect(eff.favoritePlayers.golf).toEqual(["Viktor Hovland"]);
			expect(eff.sportPreferences.football).toBe("high");
		});

		it("getEffectivePreferences uses local when pending edits exist", () => {
			pm._serverPrefs = {
				favoriteTeamsBySport: { football: ["Barcelona"] },
				favoritePlayersBySport: {},
				sportPreferences: { football: "high" },
			};
			pm.addFavoriteTeam("football", "Arsenal"); // marks pending
			const eff = pm.getEffectivePreferences();
			expect(eff.favoriteTeams.football).toEqual(["Arsenal"]);
		});

		it("hasPendingEdits tracks edit state", () => {
			expect(pm.hasPendingEdits()).toBe(false);
			pm.setSportPreference("football", "high");
			expect(pm.hasPendingEdits()).toBe(true);
		});
	});

	describe("_mergePreferencesInto()", () => {
		it("merges local preferences into current user-context.json", () => {
			pm.addFavoriteTeam("football", "Arsenal");
			pm.addFavoriteTeam("football", "Chelsea");
			pm.addFavoritePlayer("golf", "Rory McIlroy");

			const current = {
				favoriteTeams: ["Barcelona"],
				favoritePlayers: ["Viktor Hovland"],
				sportPreferences: { football: "high" },
				dynamicAthletes: { golf: { norwegian: true } },
				notes: "Keep this",
				location: "Norway",
			};

			const updated = pm._mergePreferencesInto(current);
			expect(updated.favoriteTeams).toContain("Arsenal");
			expect(updated.favoriteTeams).toContain("Chelsea");
			expect(updated.favoritePlayers).toContain("Rory McIlroy");
			expect(updated.favoriteTeamsBySport.football).toContain("Arsenal");
			expect(updated.dynamicAthletes).toEqual({ golf: { norwegian: true } });
			expect(updated.notes).toBe("Keep this");
			expect(updated.location).toBe("Norway");
		});

		it("normalizes formula1 back to f1 in sportPreferences", () => {
			pm.setSportPreference("formula1", "medium");
			pm.setSportPreference("football", "high");

			const current = { sportPreferences: {} };
			const updated = pm._mergePreferencesInto(current);
			expect(updated.sportPreferences.f1).toBe("medium");
			expect(updated.sportPreferences.formula1).toBeUndefined();
			expect(updated.sportPreferences.football).toBe("high");
		});

		it("deduplicates flat team/player arrays", () => {
			pm.addFavoriteTeam("football", "Barcelona");
			pm.addFavoriteTeam("esports", "Barcelona"); // same name different sport
			const current = { favoriteTeams: [] };
			const updated = pm._mergePreferencesInto(current);
			expect(updated.favoriteTeams.filter((t) => t === "Barcelona")).toHaveLength(1);
		});

		it("extracts esports orgs from favorite teams", () => {
			pm.addFavoriteTeam("esports", "100 Thieves");
			pm.addFavoriteTeam("esports", "Cloud9");
			const current = { favoriteEsportsOrgs: [] };
			const updated = pm._mergePreferencesInto(current);
			expect(updated.favoriteEsportsOrgs).toEqual(["100 Thieves", "Cloud9"]);
		});
	});

	describe("view and theme preferences", () => {
		it("gets and sets default view", () => {
			expect(pm.getDefaultView()).toBe("list");
			pm.setDefaultView("timeline");
			expect(pm.getDefaultView()).toBe("timeline");
		});

		it("gets and sets theme", () => {
			expect(pm.getTheme()).toBe("auto");
			pm.setTheme("dark");
			expect(pm.getTheme()).toBe("dark");
		});
	});

	describe("exportForBackend()", () => {
		it("flattens teams and players, extracts esports orgs", () => {
			pm.addFavoriteTeam("football", "Barcelona");
			pm.addFavoriteTeam("esports", "100 Thieves");
			pm.addFavoritePlayer("golf", "Viktor Hovland");
			pm.addFavoritePlayer("tennis", "Casper Ruud");
			const exported = pm.exportForBackend();
			expect(exported.favoriteTeams).toContain("Barcelona");
			expect(exported.favoriteTeams).toContain("100 Thieves");
			expect(exported.favoritePlayers).toContain("Viktor Hovland");
			expect(exported.favoritePlayers).toContain("Casper Ruud");
			expect(exported.favoriteEsportsOrgs).toEqual(["100 Thieves"]);
			expect(exported.location).toBe("Norway");
		});
	});

	describe("telemetry tracking", () => {
		it("trackBlockEngagement increments block counts", () => {
			pm.trackBlockEngagement("match-result");
			pm.trackBlockEngagement("match-result");
			pm.trackBlockEngagement("golf-status");
			const t = pm.getTelemetry();
			expect(t.blocks["match-result"]).toBe(2);
			expect(t.blocks["golf-status"]).toBe(1);
		});

		it("trackBlockEngagement ignores empty input", () => {
			pm.trackBlockEngagement("");
			pm.trackBlockEngagement(null);
			expect(pm.getTelemetry()).toBeNull();
		});

		it("trackBlockEngagement persists to dedicated localStorage key with blockId", () => {
			pm.trackBlockEngagement("match-result", "evt_123");
			pm.trackBlockEngagement("match-result", "evt_456");
			pm.trackBlockEngagement("match-result", "evt_123");
			pm.trackBlockEngagement("golf-status");
			const data = pm.getBlockEngagement();
			expect(data).toBeTruthy();
			expect(data.blockEngagement["match-result"].count).toBe(3);
			expect(data.blockEngagement["match-result"].ids["evt_123"]).toBe(2);
			expect(data.blockEngagement["match-result"].ids["evt_456"]).toBe(1);
			expect(data.blockEngagement["golf-status"].count).toBe(1);
			expect(data.blockEngagement["golf-status"].ids).toEqual({});
			expect(data.lastUpdated).toBeTruthy();
		});

		it("getBlockEngagement returns null when no data", () => {
			expect(pm.getBlockEngagement()).toBeNull();
		});

		it("exportForBackend includes blockEngagement", () => {
			pm.trackBlockEngagement("match-preview", "evt_1");
			const exported = pm.exportForBackend();
			expect(exported.blockEngagement).toBeTruthy();
			expect(exported.blockEngagement.blockEngagement["match-preview"].count).toBe(1);
		});

		it("trackSessionStart records count, timestamp, and peak hour", () => {
			pm.trackSessionStart();
			const t = pm.getTelemetry();
			expect(t.sessions.count).toBe(1);
			expect(t.sessions.lastStart).toBeTruthy();
			const hour = String(new Date().getHours()).padStart(2, "0");
			expect(t.peakHours[hour]).toBe(1);
		});

		it("trackSessionEnd calculates elapsed time", () => {
			pm._ensureTelemetry();
			pm.preferences.telemetry.sessions.lastStart = new Date(Date.now() - 5 * 60000).toISOString();
			pm.trackSessionEnd();
			const t = pm.getTelemetry();
			expect(t.sessions.totalMinutes).toBeGreaterThan(4);
			expect(t.sessions.totalMinutes).toBeLessThan(6);
		});

		it("trackSessionEnd ignores very long sessions (>8h)", () => {
			pm._ensureTelemetry();
			pm.preferences.telemetry.sessions.lastStart = new Date(Date.now() - 10 * 3600000).toISOString();
			pm.trackSessionEnd();
			expect(pm.getTelemetry().sessions.totalMinutes).toBe(0);
		});

		it("trackDayNavigation increments direction counts", () => {
			pm.trackDayNavigation("past");
			pm.trackDayNavigation("past");
			pm.trackDayNavigation("future");
			pm.trackDayNavigation("today");
			const t = pm.getTelemetry();
			expect(t.dayNav.past).toBe(2);
			expect(t.dayNav.future).toBe(1);
			expect(t.dayNav.today).toBe(1);
		});

		it("trackDayNavigation ignores invalid directions", () => {
			pm.trackDayNavigation("sideways");
			pm.trackDayNavigation(null);
			const t = pm.getTelemetry();
			expect(t.dayNav.past).toBe(0);
		});

		it("trackWatchPlanClick tracks unique clicks", () => {
			pm.trackWatchPlanClick("arsenal_chelsea_20260301");
			pm.trackWatchPlanClick("arsenal_chelsea_20260301");
			pm.trackWatchPlanClick("liverpool_city_20260301");
			const t = pm.getTelemetry();
			expect(t.watchPlanClicks.total).toBe(2);
			expect(t.watchPlanClicks.byKey["arsenal_chelsea_20260301"]).toBe(true);
		});

		it("trackWatchPlanClick ignores empty key", () => {
			pm.trackWatchPlanClick(null);
			pm.trackWatchPlanClick("");
			expect(pm.getTelemetry()).toBeNull();
		});

		it("trackFeatureUse increments feature counts", () => {
			pm.trackFeatureUse("standings");
			pm.trackFeatureUse("standings");
			pm.trackFeatureUse("brackets");
			const t = pm.getTelemetry();
			expect(t.features.standings).toBe(2);
			expect(t.features.brackets).toBe(1);
		});

		it("trackFeatureUse ignores empty input", () => {
			pm.trackFeatureUse("");
			pm.trackFeatureUse(null);
			expect(pm.getTelemetry()).toBeNull();
		});

		it("getTelemetry returns null when no telemetry exists", () => {
			const fresh = new PreferencesManager();
			expect(fresh.getTelemetry()).toBeNull();
		});

		it("exportForBackend includes telemetry", () => {
			pm.trackBlockEngagement("match-result");
			pm.trackSessionStart();
			const exported = pm.exportForBackend();
			expect(exported.telemetry).toBeTruthy();
			expect(exported.telemetry.blocks["match-result"]).toBe(1);
			expect(exported.telemetry.sessions.count).toBe(1);
		});

		it("exportForBackend has null telemetry when none tracked", () => {
			const exported = pm.exportForBackend();
			expect(exported.telemetry).toBeNull();
		});
	});

	describe("sport preferences (setSportPreference / getSportPreference / getAllSportPreferences)", () => {
		it("round-trips a sport preference", () => {
			pm.setSportPreference("football", "high");
			expect(pm.getSportPreference("football")).toBe("high");
		});

		it("removes on 'none'", () => {
			pm.setSportPreference("golf", "medium");
			pm.setSportPreference("golf", "none");
			expect(pm.getSportPreference("golf")).toBeNull();
		});

		it("removes on null", () => {
			pm.setSportPreference("tennis", "low");
			pm.setSportPreference("tennis", null);
			expect(pm.getSportPreference("tennis")).toBeNull();
		});

		it("returns null for unknown sport", () => {
			expect(pm.getSportPreference("handball")).toBeNull();
		});

		it("getAllSportPreferences returns full map", () => {
			pm.setSportPreference("football", "high");
			pm.setSportPreference("chess", "low");
			const all = pm.getAllSportPreferences();
			expect(all).toEqual({ football: "high", chess: "low" });
		});

		it("exportForBackend includes explicit sportPreferences", () => {
			pm.setSportPreference("football", "high");
			pm.setSportPreference("golf", "medium");
			const exported = pm.exportForBackend();
			expect(exported.sportPreferences.football).toBe("high");
			expect(exported.sportPreferences.golf).toBe("medium");
		});

		it("explicit preferences take precedence over engagement-derived", () => {
			pm.setSportPreference("football", "low");
			for (let i = 0; i < 30; i++) pm.trackEngagement("football");
			const exported = pm.exportForBackend();
			expect(exported.sportPreferences.football).toBe("low");
		});

		it("ignores empty/null sport name", () => {
			pm.setSportPreference("", "high");
			pm.setSportPreference(null, "high");
			expect(pm.getAllSportPreferences()).toEqual({});
		});

		it("marks pending edits when setting sport preference", () => {
			expect(pm.hasPendingEdits()).toBe(false);
			pm.setSportPreference("football", "high");
			expect(pm.hasPendingEdits()).toBe(true);
		});
	});

	describe("reset()", () => {
		it("clears localStorage and restores defaults", () => {
			pm.toggleFavoriteSport("chess");
			pm.setTheme("dark");
			pm.reset();
			expect(localStorageMock.removeItem).toHaveBeenCalledWith("sportsync-preferences");
			expect(pm.getPreferences().theme).toBe("auto");
			expect(pm.isFavoriteSport("chess")).toBe(false);
		});

		it("clears pending edits flag", () => {
			pm.addFavoriteTeam("football", "Arsenal");
			expect(pm.hasPendingEdits()).toBe(true);
			pm.reset();
			expect(pm.hasPendingEdits()).toBe(false);
		});
	});
});
