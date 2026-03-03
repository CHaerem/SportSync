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
globalThis.document = {
	addEventListener: vi.fn(),
	hidden: false,
};

// Mock PreferencesManager
const pmSrc = readFileSync(join(import.meta.dirname, "../docs/js/preferences-manager.js"), "utf-8");
eval(pmSrc);

// Mock fetch
globalThis.fetch = vi.fn();

// Load GitHubSync
const src = readFileSync(join(import.meta.dirname, "../docs/js/github-sync.js"), "utf-8");
eval(src);
const GitHubSync = window.GitHubSync;

describe("GitHubSync", () => {
	let sync;

	beforeEach(() => {
		localStorageMock.clear();
		localStorageMock.getItem.mockClear();
		localStorageMock.setItem.mockClear();
		fetch.mockReset();
		sync = new GitHubSync();
	});

	describe("initial state", () => {
		it("is not connected by default", () => {
			expect(sync.isConnected()).toBe(false);
			expect(sync.getUser()).toBeNull();
			expect(sync.getLastSync()).toBeNull();
		});
	});

	describe("connect()", () => {
		it("validates token against GitHub API", async () => {
			fetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ login: "testuser", avatar_url: "https://example.com/avatar.png" }),
			});

			const user = await sync.connect("ghp_test123");
			expect(user.login).toBe("testuser");
			expect(user.avatar).toBe("https://example.com/avatar.png");
			expect(sync.isConnected()).toBe(true);
			expect(fetch).toHaveBeenCalledWith(
				"https://api.github.com/user",
				expect.objectContaining({
					headers: expect.objectContaining({ Authorization: "Bearer ghp_test123" }),
				})
			);
		});

		it("throws on invalid token", async () => {
			fetch.mockResolvedValueOnce({ ok: false, status: 401 });
			await expect(sync.connect("bad_token")).rejects.toThrow("Invalid token");
			expect(sync.isConnected()).toBe(false);
		});

		it("throws on empty token", async () => {
			await expect(sync.connect("")).rejects.toThrow("Token is required");
			await expect(sync.connect("  ")).rejects.toThrow("Token is required");
		});
	});

	describe("disconnect()", () => {
		it("clears all config", async () => {
			fetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ login: "testuser", avatar_url: "" }),
			});
			await sync.connect("ghp_test");
			expect(sync.isConnected()).toBe(true);

			sync.disconnect();
			expect(sync.isConnected()).toBe(false);
			expect(sync.getUser()).toBeNull();
			expect(sync.getLastSync()).toBeNull();
		});
	});

	describe("_hash()", () => {
		it("produces consistent hash for same data", () => {
			const data = { foo: "bar", count: 42 };
			expect(sync._hash(data)).toBe(sync._hash(data));
		});

		it("produces different hash for different data", () => {
			expect(sync._hash({ a: 1 })).not.toBe(sync._hash({ a: 2 }));
		});
	});

	describe("_buildSyncBody()", () => {
		it("builds markdown body with telemetry summary and JSON block", () => {
			const payload = {
				backendPreferences: { favoriteTeams: ["Arsenal"] },
				telemetry: {
					blocks: { "match-result": 5, "match-preview": 3 },
					sessions: { count: 10, totalMinutes: 75, lastStart: "2026-02-28T12:00:00Z" },
					peakHours: { "07": 3, "19": 5 },
					dayNav: { past: 2, future: 8, today: 15 },
					watchPlanClicks: { total: 4, byKey: {} },
					features: { standings: 7 },
				},
			};
			const body = sync._buildSyncBody(payload);
			expect(body).toContain("## SportSync Engagement Sync");
			expect(body).toContain("Sessions: 10");
			expect(body).toContain("Total time: 75 min");
			expect(body).toContain("match-result: 5");
			expect(body).toContain("standings: 7");
			expect(body).toContain("Past: 2, Future: 8, Today: 15");
			expect(body).toContain("```json");
			expect(body).toContain('"favoriteTeams"');
		});

		it("handles missing telemetry gracefully", () => {
			const body = sync._buildSyncBody({ backendPreferences: {}, telemetry: null });
			expect(body).toContain("## SportSync Engagement Sync");
			expect(body).toContain("```json");
		});
	});

	describe("syncEngagement()", () => {
		it("returns not-connected when disconnected", async () => {
			const result = await sync.syncEngagement();
			expect(result).toEqual({ synced: false, reason: "not-connected" });
		});

		it("returns unchanged when data hash matches", async () => {
			// Connect
			fetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ login: "testuser", avatar_url: "" }),
			});
			await sync.connect("ghp_test");

			// Setup preferences
			const pm = new PreferencesManager();
			window._ssPreferences = pm;

			// Mock: find no existing issue, create new
			fetch.mockResolvedValueOnce({
				ok: true,
				json: async () => [],
			});
			fetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ number: 42 }),
			});

			const result1 = await sync.syncEngagement();
			expect(result1.synced).toBe(true);

			// Second sync with same data
			const result2 = await sync.syncEngagement();
			expect(result2).toEqual({ synced: false, reason: "unchanged" });
		});

		it("creates a new issue when none exists", async () => {
			fetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ login: "testuser", avatar_url: "" }),
			});
			await sync.connect("ghp_test");

			const pm = new PreferencesManager();
			pm.trackEngagement("football");
			window._ssPreferences = pm;

			// Search returns empty
			fetch.mockResolvedValueOnce({
				ok: true,
				json: async () => [],
			});
			// Create issue
			fetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ number: 99 }),
			});

			const result = await sync.syncEngagement();
			expect(result.synced).toBe(true);
			expect(sync.getLastSync()).toBeTruthy();
		});

		it("updates existing issue when found", async () => {
			fetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ login: "testuser", avatar_url: "" }),
			});
			await sync.connect("ghp_test");

			const pm = new PreferencesManager();
			pm.trackEngagement("golf");
			window._ssPreferences = pm;

			// Search returns existing issue
			fetch.mockResolvedValueOnce({
				ok: true,
				json: async () => [{ number: 50 }],
			});
			// PATCH
			fetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ number: 50 }),
			});

			const result = await sync.syncEngagement();
			expect(result.synced).toBe(true);
		});
	});

	describe("submitFeedback()", () => {
		it("returns not-connected when disconnected", async () => {
			const result = await sync.submitFeedback([{ title: "test", message: "bug" }], []);
			expect(result).toEqual({ submitted: false, reason: "not-connected" });
		});

		it("returns empty when no content", async () => {
			fetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ login: "testuser", avatar_url: "" }),
			});
			await sync.connect("ghp_test");

			const result = await sync.submitFeedback([], []);
			expect(result).toEqual({ submitted: false, reason: "empty" });
		});

		it("creates feedback issue via API", async () => {
			fetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ login: "testuser", avatar_url: "" }),
			});
			await sync.connect("ghp_test");

			window._ssPreferences = new PreferencesManager();

			fetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ number: 123, html_url: "https://github.com/test/issues/123" }),
			});

			const result = await sync.submitFeedback(
				[{ eventId: "e1", title: "Match", message: "Wrong score" }],
				[{ text: "Add handball" }]
			);
			expect(result.submitted).toBe(true);
			expect(result.issueNumber).toBe(123);
			expect(result.url).toContain("github.com");
		});

		it("includes sport-request suggestions in issue body", async () => {
			fetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ login: "testuser", avatar_url: "" }),
			});
			await sync.connect("ghp_test");

			window._ssPreferences = new PreferencesManager();

			fetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ number: 456, html_url: "https://github.com/test/issues/456" }),
			});

			const sportRequest = {
				type: "sport-request",
				sport: "Handball",
				event: "World Championship",
				note: "Norway is great",
				timestamp: new Date().toISOString(),
			};

			const result = await sync.submitFeedback([], [sportRequest]);
			expect(result.submitted).toBe(true);

			// Verify the body contains the sport-request data
			const callArgs = fetch.mock.calls[fetch.mock.calls.length - 1];
			const body = JSON.parse(callArgs[1].body);
			expect(body.body).toContain("sport-request");
			expect(body.body).toContain("Handball");
			expect(body.labels).toContain("user-feedback");
		});
	});
});
