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
		it("returns defaults when localStorage is empty", () => {
			const prefs = pm.getPreferences();
			expect(prefs.favoriteSports).toEqual([]);
			expect(prefs.favoriteTeams.football).toEqual(["Barcelona", "Liverpool", "Lyn"]);
			expect(prefs.favoritePlayers.golf).toEqual(["Viktor Hovland"]);
			expect(prefs.defaultView).toBe("list");
			expect(prefs.theme).toBe("auto");
		});

		it("loads stored preferences from localStorage", () => {
			const custom = {
				favoriteSports: ["football"], favoriteTeams: { football: ["Arsenal"] },
				favoritePlayers: {}, favoriteEvents: [],
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
		it("adds team to existing sport without duplicates", () => {
			pm.addFavoriteTeam("football", "Arsenal");
			expect(pm.getFavoriteTeams("football")).toContain("Arsenal");
			pm.addFavoriteTeam("football", "Barcelona");
			expect(pm.getFavoriteTeams("football").filter((t) => t === "Barcelona")).toHaveLength(1);
		});

		it("creates sport category if missing", () => {
			pm.addFavoriteTeam("hockey", "Vålerenga");
			expect(pm.getFavoriteTeams("hockey")).toEqual(["Vålerenga"]);
		});

		it("removes existing team, no-ops for missing team/sport", () => {
			pm.removeFavoriteTeam("football", "Barcelona");
			expect(pm.getFavoriteTeams("football")).not.toContain("Barcelona");
			pm.removeFavoriteTeam("football", "NonExistent FC");
			pm.removeFavoriteTeam("cricket", "Mumbai Indians");
		});

		it("returns empty array for unknown sport", () => {
			expect(pm.getFavoriteTeams("curling")).toEqual([]);
		});
	});

	describe("isTeamFavorite()", () => {
		it("matches exact, fuzzy substring, and case-insensitive", () => {
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
			pm.addFavoritePlayer("golf", "Rory McIlroy");
			expect(pm.getFavoritePlayers("golf")).toContain("Rory McIlroy");
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
			const before = pm.getFavoritePlayers("golf").length;
			pm.removeFavoritePlayer("golf", "Tiger Woods");
			expect(pm.getFavoritePlayers("golf")).toHaveLength(before);
		});
	});

	describe("isPlayerFavorite()", () => {
		it("matches exact, fuzzy, and case-insensitive", () => {
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
			expect(pm.isEventFavorite({ sport: "football", homeTeam: "FC Barcelona", awayTeam: "Getafe", title: "" })).toBe(true);
			expect(pm.isEventFavorite({ sport: "football", homeTeam: "Getafe", awayTeam: "Liverpool FC", title: "" })).toBe(true);
		});

		it("matches esports team in title", () => {
			expect(pm.isEventFavorite({ sport: "esports", title: "100 Thieves vs Cloud9" })).toBe(true);
		});

		it("matches golf Norwegian player and tennis participant", () => {
			expect(pm.isEventFavorite({ sport: "golf", title: "PGA", norwegianPlayers: [{ name: "Viktor Hovland" }] })).toBe(true);
			expect(pm.isEventFavorite({ sport: "tennis", title: "Roland Garros", participants: ["Casper Ruud"] })).toBe(true);
		});

		it("returns false when nothing matches", () => {
			expect(pm.isEventFavorite({ sport: "chess", title: "FIDE Candidates" })).toBe(false);
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
			const exported = pm.exportForBackend();
			expect(exported.favoriteTeams).toContain("Barcelona");
			expect(exported.favoriteTeams).toContain("100 Thieves");
			expect(exported.favoritePlayers).toContain("Viktor Hovland");
			expect(exported.favoritePlayers).toContain("Casper Ruud");
			expect(exported.favoriteEsportsOrgs).toEqual(["100 Thieves"]);
			expect(exported.location).toBe("Norway");
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
	});
});
