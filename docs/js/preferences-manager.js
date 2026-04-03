// Preferences Manager for SportSync
// Single source of truth: scripts/config/user-context.json (published to data/user-preferences.json)
// Local edits stored in localStorage until committed to GitHub via Contents API.
class PreferencesManager {
	constructor() {
		this.STORAGE_KEY = 'sportsync-preferences';
		this.REPO = 'CHaerem/SportSync';
		this._serverPrefs = null; // loaded from user-preferences.json
		this._pendingEdits = false;
		this.preferences = this.loadPreferences();
	}

	loadPreferences() {
		try {
			const stored = localStorage.getItem(this.STORAGE_KEY);
			if (stored) {
				return JSON.parse(stored);
			}
		} catch (error) {
			console.error('Error loading preferences:', error);
		}

		// Empty defaults — real data comes from server via loadServerPreferences()
		return {
			favoriteSports: [],
			favoriteTeams: {},
			favoritePlayers: {},
			favoriteEvents: [],
			sportPreferences: {},
			hidePassedEvents: false,
			defaultView: 'list',
			theme: 'auto'
		};
	}

	savePreferences() {
		try {
			localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.preferences));
			return true;
		} catch (error) {
			console.error('Error saving preferences:', error);
			return false;
		}
	}

	// --- Server preference loading ---

	/**
	 * Load published preferences from server (user-preferences.json).
	 * This is the source of truth — published by the pipeline from user-context.json.
	 * Merges server data into local preferences (server wins for favorites/sport prefs,
	 * local wins for UI settings like theme, engagement, and telemetry).
	 * @returns {Object|null} The server preferences, or null on failure
	 */
	async loadServerPreferences() {
		try {
			const resp = await fetch('data/user-preferences.json');
			if (!resp.ok) return null;
			this._serverPrefs = await resp.json();

			// Merge server favorites into local if local has empty/default favorites
			const local = this.preferences;
			const server = this._serverPrefs;

			// Server favorites override local if local is empty or still has old defaults
			if (server.favoriteTeamsBySport && Object.keys(server.favoriteTeamsBySport).length > 0) {
				const localTeamCount = Object.values(local.favoriteTeams || {}).reduce((s, a) => s + a.length, 0);
				if (localTeamCount === 0 || !local._serverSynced) {
					local.favoriteTeams = { ...server.favoriteTeamsBySport };
				}
			}
			if (server.favoritePlayersBySport && Object.keys(server.favoritePlayersBySport).length > 0) {
				const localPlayerCount = Object.values(local.favoritePlayers || {}).reduce((s, a) => s + a.length, 0);
				if (localPlayerCount === 0 || !local._serverSynced) {
					local.favoritePlayers = { ...server.favoritePlayersBySport };
				}
			}
			if (server.sportPreferences && Object.keys(server.sportPreferences).length > 0) {
				if (!local.sportPreferences || Object.keys(local.sportPreferences).length === 0 || !local._serverSynced) {
					local.sportPreferences = { ...server.sportPreferences };
				}
			}

			local._serverSynced = true;
			local._serverPublishedAt = server._publishedAt;
			this.savePreferences();

			return this._serverPrefs;
		} catch (err) {
			console.warn('[PreferencesManager] Could not load server preferences:', err.message);
			return null;
		}
	}

	/**
	 * Get the published-at timestamp from server preferences.
	 */
	getServerPublishedAt() {
		return this._serverPrefs?._publishedAt || this.preferences._serverPublishedAt || null;
	}

	/**
	 * Get effective preferences — server truth merged with any local overrides.
	 * Server preferences always win for favorites and sport weights unless the user
	 * has made local edits that haven't been saved to GitHub yet.
	 */
	getEffectivePreferences() {
		if (!this._serverPrefs) return this.preferences;
		return {
			...this.preferences,
			favoriteTeams: this._pendingEdits ? this.preferences.favoriteTeams : (this._serverPrefs.favoriteTeamsBySport || this.preferences.favoriteTeams),
			favoritePlayers: this._pendingEdits ? this.preferences.favoritePlayers : (this._serverPrefs.favoritePlayersBySport || this.preferences.favoritePlayers),
			sportPreferences: this._pendingEdits ? this.preferences.sportPreferences : (this._serverPrefs.sportPreferences || this.preferences.sportPreferences),
		};
	}

	/**
	 * Check whether there are unsaved local edits.
	 */
	hasPendingEdits() {
		return this._pendingEdits;
	}

	/**
	 * Mark that local preference edits have been made (need saving to GitHub).
	 */
	_markPendingEdits() {
		this._pendingEdits = true;
	}

	// --- Direct commit to user-context.json via GitHub Contents API ---

	/**
	 * Save preference changes directly to scripts/config/user-context.json via GitHub API.
	 * Uses the same proven pattern as autonomy.html saveRoadmap().
	 * @param {GitHubSync} sync - GitHubSync instance with OAuth token
	 * @returns {Object} { saved: boolean, reason?: string }
	 */
	async saveToGitHub(sync) {
		if (!sync?.isConnected()) {
			return { saved: false, reason: 'not-connected' };
		}

		const token = sync._config.token;
		const filePath = 'scripts/config/user-context.json';
		const apiUrl = `https://api.github.com/repos/${this.REPO}/contents/${filePath}`;

		try {
			// 1. GET current file (content + SHA for concurrency control)
			const getResp = await fetch(apiUrl, {
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/vnd.github+json'
				}
			});
			if (!getResp.ok) {
				return { saved: false, reason: `fetch-failed: ${getResp.status}` };
			}
			const fileData = await getResp.json();
			const current = JSON.parse(atob(fileData.content));

			// 2. Merge local changes into current (preserve dynamicAthletes, notes, etc.)
			const updated = this._mergePreferencesInto(current);

			// 3. PUT with SHA for optimistic concurrency
			const putResp = await fetch(apiUrl, {
				method: 'PUT',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					Accept: 'application/vnd.github+json'
				},
				body: JSON.stringify({
					message: 'Update preferences from dashboard',
					content: btoa(unescape(encodeURIComponent(JSON.stringify(updated, null, 2) + '\n'))),
					sha: fileData.sha
				})
			});

			if (!putResp.ok) {
				const errText = await putResp.text();
				return { saved: false, reason: `save-failed: ${putResp.status} ${errText}` };
			}

			this._pendingEdits = false;
			return { saved: true };
		} catch (err) {
			return { saved: false, reason: `error: ${err.message}` };
		}
	}

	/**
	 * Merge local preference edits into the current user-context.json structure.
	 * Preserves pipeline-only fields (dynamicAthletes, notes, norwegianFocus, location).
	 * Normalizes sport IDs from client form (formula1) back to pipeline form (f1).
	 * @param {Object} current - Current user-context.json contents
	 * @returns {Object} Updated user-context.json contents
	 */
	_mergePreferencesInto(current) {
		const eff = this.getEffectivePreferences();
		const updated = { ...current };

		// Flatten teams for pipeline compatibility
		const allTeams = [];
		for (const teams of Object.values(eff.favoriteTeams || {})) {
			allTeams.push(...teams);
		}
		updated.favoriteTeams = [...new Set(allTeams)];

		// Flatten players for pipeline compatibility
		const allPlayers = [];
		for (const players of Object.values(eff.favoritePlayers || {})) {
			allPlayers.push(...players);
		}
		updated.favoritePlayers = [...new Set(allPlayers)];

		// Nested by-sport structures
		updated.favoriteTeamsBySport = { ...(eff.favoriteTeams || {}) };
		updated.favoritePlayersBySport = { ...(eff.favoritePlayers || {}) };

		// Esports orgs (extract from teams)
		updated.favoriteEsportsOrgs = eff.favoriteTeams?.esports || current.favoriteEsportsOrgs || [];

		// Sport preferences — normalize client IDs back to pipeline IDs
		if (eff.sportPreferences && Object.keys(eff.sportPreferences).length > 0) {
			const normalized = {};
			for (const [key, value] of Object.entries(eff.sportPreferences)) {
				// Use normalizePipelineSportId if available (client-side), else manual map
				const pipelineKey = (typeof window !== 'undefined' && window.normalizePipelineSportId)
					? window.normalizePipelineSportId(key)
					: (key === 'formula1' ? 'f1' : key);
				normalized[pipelineKey] = value;
			}
			updated.sportPreferences = normalized;
		}

		// Preserve pipeline-only fields
		// (dynamicAthletes, notes, location, norwegianFocus are kept from current)

		return updated;
	}

	// Sport preferences
	toggleFavoriteSport(sport) {
		const index = this.preferences.favoriteSports.indexOf(sport);
		if (index > -1) {
			this.preferences.favoriteSports.splice(index, 1);
		} else {
			this.preferences.favoriteSports.push(sport);
		}
		this.savePreferences();
		return this.preferences.favoriteSports.includes(sport);
	}

	isFavoriteSport(sport) {
		return this.preferences.favoriteSports.includes(sport);
	}

	// Team preferences
	addFavoriteTeam(sport, teamName) {
		if (!sport?.trim() || !teamName?.trim()) return false;
		if (!this.preferences.favoriteTeams[sport]) {
			this.preferences.favoriteTeams[sport] = [];
		}
		if (!this.preferences.favoriteTeams[sport].includes(teamName)) {
			this.preferences.favoriteTeams[sport].push(teamName);
			this._markPendingEdits();
			this.savePreferences();
			return true;
		}
		return false;
	}

	removeFavoriteTeam(sport, teamName) {
		if (this.preferences.favoriteTeams[sport]) {
			const index = this.preferences.favoriteTeams[sport].indexOf(teamName);
			if (index > -1) {
				this.preferences.favoriteTeams[sport].splice(index, 1);
				this._markPendingEdits();
				this.savePreferences();
			}
		}
	}

	getFavoriteTeams(sport) {
		const eff = this.getEffectivePreferences();
		return eff.favoriteTeams?.[sport] || [];
	}

	isTeamFavorite(sport, teamName) {
		const teams = this.getFavoriteTeams(sport);
		return teams.some(team =>
			teamName.toLowerCase().includes(team.toLowerCase()) ||
			team.toLowerCase().includes(teamName.toLowerCase())
		);
	}

	// Player preferences
	addFavoritePlayer(sport, playerName) {
		if (!sport?.trim() || !playerName?.trim()) return false;
		if (!this.preferences.favoritePlayers[sport]) {
			this.preferences.favoritePlayers[sport] = [];
		}
		if (!this.preferences.favoritePlayers[sport].includes(playerName)) {
			this.preferences.favoritePlayers[sport].push(playerName);
			this._markPendingEdits();
			this.savePreferences();
			return true;
		}
		return false;
	}

	removeFavoritePlayer(sport, playerName) {
		if (this.preferences.favoritePlayers[sport]) {
			const index = this.preferences.favoritePlayers[sport].indexOf(playerName);
			if (index > -1) {
				this.preferences.favoritePlayers[sport].splice(index, 1);
				this._markPendingEdits();
				this.savePreferences();
			}
		}
	}

	getFavoritePlayers(sport) {
		const eff = this.getEffectivePreferences();
		return eff.favoritePlayers?.[sport] || [];
	}

	isPlayerFavorite(sport, playerName) {
		const players = this.getFavoritePlayers(sport);
		return players.some(player =>
			playerName.toLowerCase().includes(player.toLowerCase()) ||
			player.toLowerCase().includes(playerName.toLowerCase())
		);
	}

	// Individual event favorites
	toggleEventFavorite(eventId) {
		if (!this.preferences.favoriteEvents) {
			this.preferences.favoriteEvents = [];
		}

		const index = this.preferences.favoriteEvents.indexOf(eventId);
		if (index > -1) {
			this.preferences.favoriteEvents.splice(index, 1);
		} else {
			this.preferences.favoriteEvents.push(eventId);
		}
		this.savePreferences();
		return this.preferences.favoriteEvents.includes(eventId);
	}

	isEventIdFavorite(eventId) {
		return this.preferences.favoriteEvents && this.preferences.favoriteEvents.includes(eventId);
	}

	// Check if an event matches user favorites (uses effective preferences)
	isEventFavorite(event, eventId) {
		// Check if this specific event is marked as favorite
		if (eventId && this.isEventIdFavorite(eventId)) {
			return true;
		}

		// Check sport preference
		if (this.isFavoriteSport(event.sport)) {
			return true;
		}

		const eff = this.getEffectivePreferences();

		// Check team preferences across all sports with teams
		const teamSports = Object.keys(eff.favoriteTeams || {});
		for (const sport of teamSports) {
			if (event.sport !== sport) continue;
			const teams = this.getFavoriteTeams(sport);
			for (const team of teams) {
				// Check homeTeam/awayTeam for football-like sports
				if (event.homeTeam && (
					event.homeTeam.toLowerCase().includes(team.toLowerCase()) ||
					team.toLowerCase().includes(event.homeTeam.toLowerCase())
				)) return true;
				if (event.awayTeam && (
					event.awayTeam.toLowerCase().includes(team.toLowerCase()) ||
					team.toLowerCase().includes(event.awayTeam.toLowerCase())
				)) return true;
				// Check title for all team sports (esports, etc.)
				if (event.title && event.title.toLowerCase().includes(team.toLowerCase())) {
					return true;
				}
			}
		}

		// Check player preferences across all sports with players
		const playerSports = Object.keys(eff.favoritePlayers || {});
		for (const sport of playerSports) {
			if (event.sport !== sport) continue;
			// Golf: check norwegianPlayers array
			if (event.norwegianPlayers) {
				for (const player of event.norwegianPlayers) {
					if (this.isPlayerFavorite(sport, player.name)) return true;
				}
			}
			// Tennis/chess: check participants array
			if (event.participants) {
				for (const participant of event.participants) {
					if (this.isPlayerFavorite(sport, participant)) return true;
				}
			}
		}

		return false;
	}

	// Sport preference levels (high/medium/low/none)
	setSportPreference(sport, level) {
		if (!sport?.trim()) return;
		if (!this.preferences.sportPreferences) {
			this.preferences.sportPreferences = {};
		}
		if (!level || level === 'none') {
			delete this.preferences.sportPreferences[sport];
		} else {
			this.preferences.sportPreferences[sport] = level;
		}
		this._markPendingEdits();
		this.savePreferences();
	}

	getSportPreference(sport) {
		const eff = this.getEffectivePreferences();
		return eff.sportPreferences?.[sport] || null;
	}

	getAllSportPreferences() {
		const eff = this.getEffectivePreferences();
		return eff.sportPreferences || {};
	}

	// View preferences
	setDefaultView(view) {
		this.preferences.defaultView = view;
		this.savePreferences();
	}

	getDefaultView() {
		return this.preferences.defaultView;
	}

	// Theme preferences
	setTheme(theme) {
		this.preferences.theme = theme;
		this.savePreferences();
	}

	getTheme() {
		return this.preferences.theme;
	}

	// Get all preferences (used by AI assistant)
	getPreferences() {
		return this.getEffectivePreferences();
	}

	// Export preferences in backend format (matches user-context.json)
	// Use this to keep frontend and enrichment pipeline in sync
	exportForBackend() {
		const eff = this.getEffectivePreferences();
		const teams = [];
		for (const sportTeams of Object.values(eff.favoriteTeams || {})) {
			teams.push(...sportTeams);
		}
		const players = [];
		for (const sportPlayers of Object.values(eff.favoritePlayers || {})) {
			players.push(...sportPlayers);
		}

		// Use explicit sport preferences if set, otherwise derive from engagement
		const explicit = eff.sportPreferences || {};
		const engagement = this.getEngagement();
		const sportPreferences = { ...explicit };
		const totalClicks = Object.values(engagement).reduce((s, e) => s + (e.clicks || 0), 0);
		if (totalClicks >= 20) {
			for (const [sport, data] of Object.entries(engagement)) {
				if (sportPreferences[sport]) continue; // explicit takes precedence
				const share = data.clicks / totalClicks;
				if (share >= 0.25) sportPreferences[sport] = 'high';
				else if (share >= 0.10) sportPreferences[sport] = 'medium';
				else sportPreferences[sport] = 'low';
			}
		}

		return {
			favoriteTeams: [...new Set(teams)],
			favoritePlayers: [...new Set(players)],
			favoriteEsportsOrgs: eff.favoriteTeams?.esports || [],
			location: 'Norway',
			sportPreferences,
			engagement,
			watchFeedback: this.getAllWatchFeedback(),
			telemetry: this.getTelemetry(),
			blockEngagement: this.getBlockEngagement(),
		};
	}

	// Engagement tracking — records per-sport expand/click counts
	trackEngagement(sport) {
		if (!sport?.trim()) return;
		if (!this.preferences.engagement) {
			this.preferences.engagement = {};
		}
		if (!this.preferences.engagement[sport]) {
			this.preferences.engagement[sport] = { clicks: 0, lastClick: null };
		}
		this.preferences.engagement[sport].clicks++;
		this.preferences.engagement[sport].lastClick = new Date().toISOString();
		this.savePreferences();
	}

	getEngagement() {
		return this.preferences.engagement || {};
	}

	// --- Telemetry tracking ---

	_ensureTelemetry() {
		if (!this.preferences.telemetry) {
			this.preferences.telemetry = {
				blocks: {},
				sessions: { count: 0, totalMinutes: 0, lastStart: null },
				peakHours: {},
				dayNav: { past: 0, future: 0, today: 0 },
				watchPlanClicks: { total: 0, byKey: {} },
				features: {}
			};
		}
		return this.preferences.telemetry;
	}

	trackBlockEngagement(blockType, blockId) {
		if (!blockType?.trim()) return;
		const t = this._ensureTelemetry();
		t.blocks[blockType] = (t.blocks[blockType] || 0) + 1;
		this.savePreferences();
		// Also persist to dedicated block engagement store for pipeline export
		this._persistBlockEngagement(blockType, blockId || null);
	}

	/**
	 * Persist block-level engagement to a dedicated localStorage key.
	 * Format: { blockEngagement: { [blockType]: { count, ids: { [blockId]: count } } }, lastUpdated }
	 * This separate store enables the pipeline to read block engagement
	 * independently of the full preferences blob.
	 */
	_persistBlockEngagement(blockType, blockId) {
		const BLOCK_KEY = 'sportsync_block_engagement';
		let data;
		try {
			data = JSON.parse(localStorage.getItem(BLOCK_KEY)) || {};
		} catch { data = {}; }
		if (!data.blockEngagement) data.blockEngagement = {};
		if (!data.blockEngagement[blockType]) {
			data.blockEngagement[blockType] = { count: 0, ids: {} };
		}
		data.blockEngagement[blockType].count++;
		if (blockId) {
			data.blockEngagement[blockType].ids[blockId] = (data.blockEngagement[blockType].ids[blockId] || 0) + 1;
		}
		data.lastUpdated = new Date().toISOString();
		try {
			localStorage.setItem(BLOCK_KEY, JSON.stringify(data));
		} catch { /* localStorage full — silently skip */ }
	}

	/**
	 * Get dedicated block engagement data (from separate localStorage key).
	 * Returns { blockEngagement: { [type]: { count, ids } }, lastUpdated } or null.
	 */
	getBlockEngagement() {
		try {
			return JSON.parse(localStorage.getItem('sportsync_block_engagement')) || null;
		} catch { return null; }
	}

	trackSessionStart() {
		const t = this._ensureTelemetry();
		t.sessions.count++;
		t.sessions.lastStart = new Date().toISOString();
		const hour = String(new Date().getHours()).padStart(2, '0');
		t.peakHours[hour] = (t.peakHours[hour] || 0) + 1;
		this.savePreferences();
	}

	trackSessionEnd() {
		const t = this._ensureTelemetry();
		if (t.sessions.lastStart) {
			const elapsed = (Date.now() - new Date(t.sessions.lastStart).getTime()) / 60000;
			if (elapsed > 0 && elapsed < 480) {
				t.sessions.totalMinutes = Math.round((t.sessions.totalMinutes + elapsed) * 10) / 10;
			}
		}
		this.savePreferences();
	}

	trackDayNavigation(direction) {
		if (!direction) return;
		const t = this._ensureTelemetry();
		if (direction in t.dayNav) {
			t.dayNav[direction]++;
			this.savePreferences();
		}
	}

	trackWatchPlanClick(pickKey) {
		if (!pickKey) return;
		const t = this._ensureTelemetry();
		if (!t.watchPlanClicks.byKey[pickKey]) {
			t.watchPlanClicks.byKey[pickKey] = true;
			t.watchPlanClicks.total++;
			this.savePreferences();
		}
	}

	trackFeatureUse(feature) {
		if (!feature?.trim()) return;
		const t = this._ensureTelemetry();
		t.features[feature] = (t.features[feature] || 0) + 1;
		this.savePreferences();
	}

	getTelemetry() {
		return this.preferences.telemetry || null;
	}

	// Watch-plan feedback — thumbs-up/down on picks
	setWatchFeedback(pickKey, value) {
		if (!pickKey) return;
		if (!this.preferences.watchFeedback) {
			this.preferences.watchFeedback = {};
		}
		if (value === null) {
			delete this.preferences.watchFeedback[pickKey];
		} else {
			this.preferences.watchFeedback[pickKey] = { value, timestamp: new Date().toISOString() };
		}
		this.savePreferences();
	}

	getWatchFeedback(pickKey) {
		return this.preferences.watchFeedback?.[pickKey]?.value ?? null;
	}

	getAllWatchFeedback() {
		return this.preferences.watchFeedback || {};
	}

	// Reset preferences
	reset() {
		localStorage.removeItem(this.STORAGE_KEY);
		this._pendingEdits = false;
		this._serverPrefs = null;
		this.preferences = this.loadPreferences();
	}
}

// Export for use in dashboard
window.PreferencesManager = PreferencesManager;
