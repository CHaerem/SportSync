import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
globalThis.navigator = {};
globalThis.window = globalThis;
globalThis.document = {
	addEventListener: vi.fn(),
	hidden: false,
};

// Mock window event listener methods (needed for postMessage handling)
const eventListeners = {};
window.addEventListener = vi.fn((event, handler) => {
	if (!eventListeners[event]) eventListeners[event] = [];
	eventListeners[event].push(handler);
});
window.removeEventListener = vi.fn((event, handler) => {
	if (eventListeners[event]) {
		eventListeners[event] = eventListeners[event].filter(h => h !== handler);
	}
});
window.open = vi.fn();

// Mock PreferencesManager
const pmSrc = readFileSync(join(import.meta.dirname, "../docs/js/preferences-manager.js"), "utf-8");
eval(pmSrc);

// Mock fetch
globalThis.fetch = vi.fn();

// Load GitHubSync
const src = readFileSync(join(import.meta.dirname, "../docs/js/github-sync.js"), "utf-8");
eval(src);
const GitHubSync = window.GitHubSync;

function makeSyncIssueBody(data) {
	return `## SportSync Engagement Sync\n\n### Data (for pipeline)\n\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\`\n`;
}

function connectSync(sync) {
	// Manually set connected state (bypassing OAuth popup)
	sync._config.token = "ghp_test123";
	sync._config.user = { login: "testuser", avatar: "https://example.com/avatar.png" };
	sync._save();
}

describe("GitHubSync restoreFromSync", () => {
	let sync;

	beforeEach(() => {
		localStorageMock.clear();
		localStorageMock.getItem.mockClear();
		localStorageMock.setItem.mockClear();
		fetch.mockReset();
		sync = new GitHubSync();
		window._ssPreferences = new PreferencesManager();
	});

	it("returns not-connected when disconnected", async () => {
		const result = await sync.restoreFromSync();
		expect(result).toEqual({ restored: false, reason: "not-connected" });
	});

	it("returns no-sync-issue when no issue exists", async () => {
		connectSync(sync);
		// _findSyncIssue returns null (empty search results)
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [],
		});

		const result = await sync.restoreFromSync();
		expect(result).toEqual({ restored: false, reason: "no-sync-issue" });
	});

	it("restores nested preferences from sync issue", async () => {
		connectSync(sync);
		const prefs = {
			favoriteTeams: { football: ["Arsenal", "Lyn"], esports: ["Navi"] },
			favoritePlayers: { golf: ["Tiger Woods"], chess: ["Magnus Carlsen"] },
			sportPreferences: { football: "high", chess: "medium" },
		};

		// Find sync issue
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [{ number: 42 }],
		});
		// Fetch issue body
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ body: makeSyncIssueBody({ preferences: prefs, backendPreferences: {} }) }),
		});

		const result = await sync.restoreFromSync();
		expect(result.restored).toBe(true);
		expect(result.keys).toContain("favoriteTeams");
		expect(result.keys).toContain("favoritePlayers");
		expect(result.keys).toContain("sportPreferences");

		const pm = window._ssPreferences;
		expect(pm.preferences.favoriteTeams.football).toEqual(["Arsenal", "Lyn"]);
		expect(pm.preferences.favoritePlayers.golf).toEqual(["Tiger Woods"]);
		expect(pm.preferences.sportPreferences).toEqual({ football: "high", chess: "medium" });
	});

	it("prefers nested preferences over flattened backendPreferences", async () => {
		connectSync(sync);
		const nested = {
			favoriteTeams: { football: ["Barcelona"] },
		};
		const backend = {
			favoriteTeams: ["Liverpool"],
			sportPreferences: { football: "low" },
		};

		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [{ number: 10 }],
		});
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ body: makeSyncIssueBody({ preferences: nested, backendPreferences: backend }) }),
		});

		const result = await sync.restoreFromSync();
		expect(result.restored).toBe(true);
		// Should use nested, not backend
		expect(window._ssPreferences.preferences.favoriteTeams.football).toEqual(["Barcelona"]);
	});

	it("falls back to backendPreferences when no nested preferences", async () => {
		connectSync(sync);
		const backend = {
			sportPreferences: { tennis: "high", golf: "medium" },
		};

		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [{ number: 10 }],
		});
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ body: makeSyncIssueBody({ backendPreferences: backend }) }),
		});

		const result = await sync.restoreFromSync();
		expect(result.restored).toBe(true);
		expect(result.keys).toContain("sportPreferences");
		expect(window._ssPreferences.preferences.sportPreferences).toEqual({ tennis: "high", golf: "medium" });
	});

	it("handles missing JSON block gracefully", async () => {
		connectSync(sync);
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [{ number: 10 }],
		});
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ body: "## Some issue with no JSON" }),
		});

		const result = await sync.restoreFromSync();
		expect(result).toEqual({ restored: false, reason: "no-json-block" });
	});

	it("handles malformed JSON gracefully", async () => {
		connectSync(sync);
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [{ number: 10 }],
		});
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ body: "```json\n{invalid json\n```" }),
		});

		const result = await sync.restoreFromSync();
		expect(result).toEqual({ restored: false, reason: "invalid-json" });
	});

	it("handles empty issue body gracefully", async () => {
		connectSync(sync);
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [{ number: 10 }],
		});
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ body: "" }),
		});

		const result = await sync.restoreFromSync();
		expect(result).toEqual({ restored: false, reason: "empty-issue" });
	});

	it("handles API error gracefully", async () => {
		connectSync(sync);
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [{ number: 10 }],
		});
		fetch.mockResolvedValueOnce({
			ok: false,
			status: 500,
			text: async () => "Server error",
		});

		const result = await sync.restoreFromSync();
		expect(result.restored).toBe(false);
		expect(result.reason).toBe("error");
	});

	it("caches issue number after restore", async () => {
		connectSync(sync);
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [{ number: 77 }],
		});
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ body: makeSyncIssueBody({ preferences: { sportPreferences: { golf: "high" } } }) }),
		});

		await sync.restoreFromSync();
		expect(sync._config.issueNumber).toBe(77);
	});
});

describe("GitHubSync _buildSyncBody with preferences", () => {
	let sync;

	beforeEach(() => {
		localStorageMock.clear();
		fetch.mockReset();
		sync = new GitHubSync();
	});

	it("includes nested preferences in JSON payload", () => {
		const payload = {
			backendPreferences: { favoriteTeams: ["Arsenal"] },
			preferences: {
				favoriteTeams: { football: ["Arsenal"] },
				favoritePlayers: { golf: ["Hovland"] },
			},
			telemetry: null,
		};
		const body = sync._buildSyncBody(payload);
		expect(body).toContain('"preferences"');
		expect(body).toContain('"favoriteTeams"');

		// Parse the JSON from the body
		const jsonMatch = body.match(/```json\n([\s\S]*?)\n```/);
		const data = JSON.parse(jsonMatch[1]);
		expect(data.preferences.favoriteTeams.football).toEqual(["Arsenal"]);
		expect(data.preferences.favoritePlayers.golf).toEqual(["Hovland"]);
	});

	it("omits preferences key when not provided", () => {
		const payload = {
			backendPreferences: { favoriteTeams: ["Arsenal"] },
			telemetry: null,
		};
		const body = sync._buildSyncBody(payload);
		const jsonMatch = body.match(/```json\n([\s\S]*?)\n```/);
		const data = JSON.parse(jsonMatch[1]);
		expect(data.preferences).toBeUndefined();
	});
});

describe("GitHubSync connect (OAuth popup flow)", () => {
	let sync;

	beforeEach(() => {
		vi.useFakeTimers();
		localStorageMock.clear();
		localStorageMock.getItem.mockClear();
		localStorageMock.setItem.mockClear();
		fetch.mockReset();
		window.addEventListener.mockClear();
		window.removeEventListener.mockClear();
		// Mock non-standalone mode so popup flow is used
		window.matchMedia = vi.fn(() => ({ matches: false }));
		window.navigator.standalone = undefined;
		sync = new GitHubSync();
		window._ssPreferences = new PreferencesManager();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("throws when popup is blocked", async () => {
		window.open = vi.fn(() => null);
		await expect(sync.connect()).rejects.toThrow("Popup blocked");
	});

	it("throws when popup is closed without completing", async () => {
		const mockPopup = { closed: false };
		window.open = vi.fn(() => mockPopup);

		const promise = sync.connect();
		// Simulate popup closing
		mockPopup.closed = true;
		vi.advanceTimersByTime(600);

		await expect(promise).rejects.toThrow("Sign-in cancelled");
	});

	it("completes OAuth flow via postMessage", async () => {
		const mockPopup = { closed: false };
		window.open = vi.fn(() => mockPopup);

		// Start the connect flow
		const connectPromise = sync.connect();

		// Find the message handler that was registered
		const messageCall = window.addEventListener.mock.calls.find(c => c[0] === "message");
		const messageHandler = messageCall[1];

		// Simulate the OAuth callback sending the token
		messageHandler({ data: { type: "sportsync-oauth", token: "gho_abc123" } });

		// Mock the GitHub API validation
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ login: "oauthuser", avatar_url: "https://example.com/avatar.png" }),
		});

		// Mock _findSyncIssue (no existing issue)
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [],
		});

		const result = await connectPromise;
		expect(result.user.login).toBe("oauthuser");
		expect(sync.isConnected()).toBe(true);
		expect(sync._config.token).toBe("gho_abc123");
		expect(result.restored).toBe(false);
		expect(result.restoreReason).toBe("no-sync-issue");
	});
});

describe("GitHubSync connectWithToken", () => {
	let sync;

	beforeEach(() => {
		localStorageMock.clear();
		localStorageMock.getItem.mockClear();
		localStorageMock.setItem.mockClear();
		fetch.mockReset();
		sync = new GitHubSync();
		window._ssPreferences = new PreferencesManager();
	});

	it("validates token and stores user info", async () => {
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ login: "tokenuser", avatar_url: "https://example.com/a.png" }),
		});
		// restoreFromSync: no sync issue
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [],
		});

		const result = await sync.connectWithToken("gho_test_token");
		expect(sync.isConnected()).toBe(true);
		expect(sync._config.token).toBe("gho_test_token");
		expect(result.user.login).toBe("tokenuser");
		expect(result.user.avatar).toBe("https://example.com/a.png");
	});

	it("throws on invalid token", async () => {
		fetch.mockResolvedValueOnce({
			ok: false,
			status: 401,
			text: async () => "Unauthorized",
		});

		await expect(sync.connectWithToken("bad_token")).rejects.toThrow("Invalid token from OAuth");
		expect(sync.isConnected()).toBe(false);
	});

	it("auto-restores preferences after connecting", async () => {
		const prefs = {
			favoriteTeams: { football: ["Lyn"] },
			sportPreferences: { football: "high" },
		};

		// Validate token
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ login: "user2", avatar_url: "" }),
		});
		// Find sync issue
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [{ number: 55 }],
		});
		// Fetch issue body
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ body: makeSyncIssueBody({ preferences: prefs }) }),
		});

		const result = await sync.connectWithToken("gho_restore_test");
		expect(result.restored).toBe(true);
		expect(result.keys).toContain("favoriteTeams");
		expect(window._ssPreferences.preferences.favoriteTeams.football).toEqual(["Lyn"]);
	});
});

describe("GitHubSync _isStandalone", () => {
	let sync;

	beforeEach(() => {
		localStorageMock.clear();
		sync = new GitHubSync();
	});

	it("returns false in normal browser", () => {
		window.matchMedia = vi.fn(() => ({ matches: false }));
		window.navigator.standalone = undefined;
		expect(sync._isStandalone()).toBe(false);
	});

	it("returns true when display-mode is standalone", () => {
		window.matchMedia = vi.fn(() => ({ matches: true }));
		expect(sync._isStandalone()).toBe(true);
	});

	it("returns true when navigator.standalone is true (iOS)", () => {
		window.matchMedia = vi.fn(() => ({ matches: false }));
		window.navigator.standalone = true;
		expect(sync._isStandalone()).toBe(true);
	});
});

describe("GitHubSync connect standalone session-polling", () => {
	let sync;

	beforeEach(() => {
		localStorageMock.clear();
		fetch.mockReset();
		sync = new GitHubSync();
		window._ssPreferences = new PreferencesManager();
	});

	it("opens OAuth relay with session param in standalone mode", () => {
		window.matchMedia = vi.fn(() => ({ matches: true }));
		window.open = vi.fn();
		// Start connect but don't await (it will poll forever without a mocked response)
		sync.connect().catch(() => {}); // ignore timeout

		expect(window.open).toHaveBeenCalledTimes(1);
		const openUrl = window.open.mock.calls[0][0];
		expect(openUrl).toContain('/auth?session=');
		expect(window.open.mock.calls[0][1]).toBe('_blank');
	});
});

describe("GitHubSync syncEngagement includes preferences", () => {
	let sync;

	beforeEach(() => {
		localStorageMock.clear();
		fetch.mockReset();
		sync = new GitHubSync();
		const pm = new PreferencesManager();
		pm.preferences.favoriteTeams = { football: ["Liverpool"] };
		pm.preferences.sportPreferences = { football: "high" };
		window._ssPreferences = pm;
		connectSync(sync);
	});

	it("includes nested preferences in sync payload", async () => {
		// Find no existing issue
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [],
		});
		// Create issue
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ number: 1 }),
		});

		await sync.syncEngagement();

		// Check the POST body
		const postCall = fetch.mock.calls.find(c => c[1]?.method === "POST");
		const issueBody = JSON.parse(postCall[1].body).body;
		const jsonMatch = issueBody.match(/```json\n([\s\S]*?)\n```/);
		const data = JSON.parse(jsonMatch[1]);
		expect(data.preferences.favoriteTeams.football).toEqual(["Liverpool"]);
		expect(data.preferences.sportPreferences).toEqual({ football: "high" });
	});
});
