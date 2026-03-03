// GitHub Sync for SportSync
// Syncs engagement telemetry to a single GitHub Issue (engagement-sync label)
// and submits user feedback as individual issues (user-feedback label).
// Connects via OAuth popup through the relay server on serverpi.

class GitHubSync {
	constructor() {
		this.STORAGE_KEY = 'sportsync-github';
		this.REPO = 'CHaerem/SportSync';
		this.API = 'https://api.github.com';
		this.OAUTH_RELAY = 'https://serverpi.corgi-climb.ts.net:3847';
		this._config = this._load();
		this._syncTimer = null;
		this._lastFocusSync = 0;
	}

	_load() {
		try {
			const raw = localStorage.getItem(this.STORAGE_KEY);
			if (raw) return JSON.parse(raw);
		} catch { /* ignore */ }
		return { token: null, user: null, issueNumber: null, lastSync: null, lastHash: null };
	}

	_save() {
		try {
			localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._config));
		} catch { /* ignore */ }
	}

	isConnected() {
		return !!this._config.token && !!this._config.user;
	}

	getUser() {
		return this._config.user;
	}

	getLastSync() {
		return this._config.lastSync;
	}

	/**
	 * Connect via OAuth popup flow.
	 * Opens the relay's /auth endpoint in a popup, waits for the token via postMessage.
	 * Then validates the token, stores it, and auto-restores preferences from the latest sync issue.
	 * @returns {Promise<{user: object, restored: boolean, restoreReason?: string, keys?: string[]}>}
	 */
	async connect() {
		const popup = window.open(
			`${this.OAUTH_RELAY}/auth`,
			'sportsync-oauth',
			'width=500,height=700,popup=yes'
		);
		if (!popup) throw new Error('Popup blocked — please allow popups for this site');

		const token = await new Promise((resolve, reject) => {
			const cleanup = () => {
				window.removeEventListener('message', onMessage);
				clearInterval(pollClosed);
			};

			const onMessage = (event) => {
				if (event.data?.type === 'sportsync-oauth' && event.data.token) {
					cleanup();
					resolve(event.data.token);
				}
			};
			window.addEventListener('message', onMessage);

			// Poll for popup closed without completing
			const pollClosed = setInterval(() => {
				if (popup.closed) {
					cleanup();
					reject(new Error('Sign-in cancelled'));
				}
			}, 500);
		});

		// Validate token against GitHub API
		const resp = await fetch(`${this.API}/user`, {
			headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
		});
		if (!resp.ok) throw new Error('Invalid token from OAuth');
		const userData = await resp.json();

		this._config.token = token;
		this._config.user = { login: userData.login, avatar: userData.avatar_url };
		this._save();

		// Auto-restore preferences from latest sync issue
		const restoreResult = await this.restoreFromSync();

		return {
			user: this._config.user,
			restored: restoreResult.restored,
			restoreReason: restoreResult.reason,
			keys: restoreResult.keys
		};
	}

	/**
	 * Restore preferences from the latest engagement-sync issue.
	 * Called automatically after OAuth connect, or manually.
	 * @returns {Promise<{restored: boolean, reason?: string, keys?: string[]}>}
	 */
	async restoreFromSync() {
		if (!this.isConnected()) return { restored: false, reason: 'not-connected' };

		try {
			const issueNumber = await this._findSyncIssue();
			if (!issueNumber) return { restored: false, reason: 'no-sync-issue' };

			// Cache the issue number for future syncs
			this._config.issueNumber = issueNumber;
			this._save();

			const issue = await this._apiRequest(`/repos/${this.REPO}/issues/${issueNumber}`);
			const body = issue?.body;
			if (!body) return { restored: false, reason: 'empty-issue' };

			// Extract JSON from ```json block
			const jsonMatch = body.match(/```json\n([\s\S]*?)\n```/);
			if (!jsonMatch) return { restored: false, reason: 'no-json-block' };

			let data;
			try { data = JSON.parse(jsonMatch[1]); }
			catch { return { restored: false, reason: 'invalid-json' }; }

			const pm = window._ssPreferences;
			if (!pm) return { restored: false, reason: 'no-preferences-manager' };

			// Prefer nested preferences (full structure) over flattened backendPreferences
			const prefs = data.preferences || null;
			const backend = data.backendPreferences || null;

			if (!prefs && !backend) return { restored: false, reason: 'no-preference-data' };

			const keys = [];

			if (prefs) {
				// Full nested restore — merge directly into preferences
				if (prefs.favoriteTeams) { pm.preferences.favoriteTeams = prefs.favoriteTeams; keys.push('favoriteTeams'); }
				if (prefs.favoritePlayers) { pm.preferences.favoritePlayers = prefs.favoritePlayers; keys.push('favoritePlayers'); }
				if (prefs.favoriteSports) { pm.preferences.favoriteSports = prefs.favoriteSports; keys.push('favoriteSports'); }
				if (prefs.sportPreferences) { pm.preferences.sportPreferences = prefs.sportPreferences; keys.push('sportPreferences'); }
				if (prefs.favoriteEvents) { pm.preferences.favoriteEvents = prefs.favoriteEvents; keys.push('favoriteEvents'); }
			} else if (backend) {
				// Flattened restore — reconstruct nested structure from backend format
				if (backend.favoriteTeams?.length) {
					// Backend format is flat array; we can't perfectly reconstruct sport-keyed structure
					// but we store what we have
					keys.push('favoriteTeams');
				}
				if (backend.favoritePlayers?.length) {
					keys.push('favoritePlayers');
				}
				if (backend.sportPreferences) {
					pm.preferences.sportPreferences = backend.sportPreferences;
					keys.push('sportPreferences');
				}
			}

			if (keys.length > 0) {
				pm.savePreferences();
				return { restored: true, keys };
			}

			return { restored: false, reason: 'no-restorable-data' };
		} catch (err) {
			console.warn('[GitHubSync] restore failed:', err.message);
			return { restored: false, reason: 'error', error: err.message };
		}
	}

	disconnect() {
		this._config = { token: null, user: null, issueNumber: null, lastSync: null, lastHash: null };
		this._save();
		this.stopAutoSync();
	}

	_hash(data) {
		const str = JSON.stringify(data);
		let h = 0;
		for (let i = 0; i < str.length; i++) {
			h = ((h << 5) - h + str.charCodeAt(i)) | 0;
		}
		return String(h);
	}

	async _apiRequest(path, options = {}) {
		const resp = await fetch(`${this.API}${path}`, {
			...options,
			headers: {
				Authorization: `Bearer ${this._config.token}`,
				Accept: 'application/vnd.github+json',
				'Content-Type': 'application/json',
				...options.headers
			}
		});
		if (!resp.ok) {
			const text = await resp.text().catch(() => '');
			throw new Error(`GitHub API ${resp.status}: ${text.slice(0, 200)}`);
		}
		return resp.status === 204 ? null : resp.json();
	}

	_buildSyncBody(payload) {
		const { backendPreferences, preferences, telemetry } = payload;
		let body = '## SportSync Engagement Sync\n\n';
		body += `_Last synced: ${new Date().toISOString()}_\n\n`;

		if (telemetry) {
			body += '### Session Stats\n';
			body += `- Sessions: ${telemetry.sessions?.count || 0}\n`;
			body += `- Total time: ${Math.round(telemetry.sessions?.totalMinutes || 0)} min\n`;
			const peakHours = Object.entries(telemetry.peakHours || {})
				.sort(([, a], [, b]) => b - a).slice(0, 3);
			if (peakHours.length) {
				body += `- Peak hours: ${peakHours.map(([h, c]) => `${h}:00 (${c}x)`).join(', ')}\n`;
			}
			body += '\n';

			const blocks = Object.entries(telemetry.blocks || {}).sort(([, a], [, b]) => b - a);
			if (blocks.length) {
				body += '### Block Engagement\n';
				for (const [type, count] of blocks) body += `- ${type}: ${count}\n`;
				body += '\n';
			}

			const features = Object.entries(telemetry.features || {}).sort(([, a], [, b]) => b - a);
			if (features.length) {
				body += '### Feature Usage\n';
				for (const [f, count] of features) body += `- ${f}: ${count}\n`;
				body += '\n';
			}

			const nav = telemetry.dayNav || {};
			if (nav.past || nav.future || nav.today) {
				body += '### Day Navigation\n';
				body += `- Past: ${nav.past || 0}, Future: ${nav.future || 0}, Today: ${nav.today || 0}\n\n`;
			}

			if (telemetry.watchPlanClicks?.total) {
				body += `### Watch Plan\n- Clicks: ${telemetry.watchPlanClicks.total}\n\n`;
			}
		}

		body += '### Data (for pipeline)\n\n```json\n';
		const jsonData = { backendPreferences, telemetry, syncedAt: new Date().toISOString() };
		if (preferences) jsonData.preferences = preferences;
		body += JSON.stringify(jsonData);
		body += '\n```\n';
		return body;
	}

	async syncEngagement() {
		if (!this.isConnected()) return { synced: false, reason: 'not-connected' };

		const pm = window._ssPreferences;
		if (!pm) return { synced: false, reason: 'no-preferences' };

		const backendPreferences = pm.exportForBackend();
		const telemetry = pm.getTelemetry();
		// Include nested preferences for restore-on-reconnect
		const preferences = {
			favoriteTeams: pm.preferences.favoriteTeams,
			favoritePlayers: pm.preferences.favoritePlayers,
			favoriteSports: pm.preferences.favoriteSports,
			sportPreferences: pm.preferences.sportPreferences,
			favoriteEvents: pm.preferences.favoriteEvents,
		};
		const payload = { backendPreferences, preferences, telemetry };

		const hash = this._hash(payload);
		if (hash === this._config.lastHash) {
			return { synced: false, reason: 'unchanged' };
		}

		const body = this._buildSyncBody(payload);

		try {
			if (this._config.issueNumber) {
				await this._apiRequest(`/repos/${this.REPO}/issues/${this._config.issueNumber}`, {
					method: 'PATCH',
					body: JSON.stringify({ body })
				});
			} else {
				const existing = await this._findSyncIssue();
				if (existing) {
					this._config.issueNumber = existing;
					await this._apiRequest(`/repos/${this.REPO}/issues/${existing}`, {
						method: 'PATCH',
						body: JSON.stringify({ body })
					});
				} else {
					const created = await this._apiRequest(`/repos/${this.REPO}/issues`, {
						method: 'POST',
						body: JSON.stringify({
							title: 'Engagement Sync',
							body,
							labels: ['engagement-sync']
						})
					});
					this._config.issueNumber = created.number;
				}
			}

			this._config.lastSync = new Date().toISOString();
			this._config.lastHash = hash;
			this._save();
			return { synced: true };
		} catch (err) {
			console.warn('[GitHubSync] sync failed:', err.message);
			return { synced: false, reason: 'error', error: err.message };
		}
	}

	async _findSyncIssue() {
		try {
			const issues = await this._apiRequest(
				`/repos/${this.REPO}/issues?labels=engagement-sync&state=open&per_page=1`
			);
			return issues?.[0]?.number || null;
		} catch {
			return null;
		}
	}

	async submitFeedback(reports, suggestions) {
		if (!this.isConnected()) return { submitted: false, reason: 'not-connected' };
		if ((!reports || reports.length === 0) && (!suggestions || suggestions.length === 0)) {
			return { submitted: false, reason: 'empty' };
		}

		let body = '## SportSync User Feedback\n\n';
		if (reports?.length) {
			body += '### Issues Reported\n\n';
			for (const r of reports) body += `- **${r.title || r.eventId}**: ${r.message}\n`;
			body += '\n';
		}
		if (suggestions?.length) {
			body += '### Suggestions\n\n';
			for (const s of suggestions) {
				if (s.type === 'sport-request') {
					body += `- **Sport request:** ${s.sport}${s.event ? ` — ${s.event}` : ''}${s.note ? ` (${s.note})` : ''}\n`;
				} else {
					body += `- ${typeof s === 'string' ? s : s.text}\n`;
				}
			}
			body += '\n';
		}

		const backendPreferences = window._ssPreferences?.exportForBackend();
		body += '### Data (for autopilot)\n\n```json\n';
		body += JSON.stringify({ reports, suggestions, backendPreferences, date: new Date().toISOString().slice(0, 10) });
		body += '\n```\n';

		const title = `User feedback ${new Date().toISOString().slice(0, 10)}`;
		const created = await this._apiRequest(`/repos/${this.REPO}/issues`, {
			method: 'POST',
			body: JSON.stringify({ title, body, labels: ['user-feedback'] })
		});
		return { submitted: true, issueNumber: created.number, url: created.html_url };
	}

	startAutoSync() {
		this.stopAutoSync();
		if (!this.isConnected()) return;

		// Sync every 30 minutes
		this._syncTimer = setInterval(() => this.syncEngagement(), 30 * 60 * 1000);

		// Sync on tab re-focus (5 min debounce)
		this._focusHandler = () => {
			const now = Date.now();
			if (now - this._lastFocusSync > 5 * 60 * 1000) {
				this._lastFocusSync = now;
				this.syncEngagement();
			}
		};
		document.addEventListener('visibilitychange', () => {
			if (!document.hidden) this._focusHandler();
		});

		// Initial sync
		this.syncEngagement();
	}

	stopAutoSync() {
		if (this._syncTimer) {
			clearInterval(this._syncTimer);
			this._syncTimer = null;
		}
	}
}

window.GitHubSync = GitHubSync;
