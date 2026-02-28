// GitHub Sync for SportSync
// Syncs engagement telemetry to a single GitHub Issue (engagement-sync label)
// and submits user feedback as individual issues (user-feedback label).

class GitHubSync {
	constructor() {
		this.STORAGE_KEY = 'sportsync-github';
		this.REPO = 'CHaerem/SportSync';
		this.API = 'https://api.github.com';
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

	async connect(token) {
		if (!token?.trim()) throw new Error('Token is required');
		const resp = await fetch(`${this.API}/user`, {
			headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
		});
		if (!resp.ok) throw new Error('Invalid token');
		const user = await resp.json();
		this._config.token = token;
		this._config.user = { login: user.login, avatar: user.avatar_url };
		this._save();
		return this._config.user;
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
		const { backendPreferences, telemetry } = payload;
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
		body += JSON.stringify({ backendPreferences, telemetry, syncedAt: new Date().toISOString() });
		body += '\n```\n';
		return body;
	}

	async syncEngagement() {
		if (!this.isConnected()) return { synced: false, reason: 'not-connected' };

		const pm = window._ssPreferences;
		if (!pm) return { synced: false, reason: 'no-preferences' };

		const backendPreferences = pm.exportForBackend();
		const telemetry = pm.getTelemetry();
		const payload = { backendPreferences, telemetry };

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
			for (const s of suggestions) body += `- ${typeof s === 'string' ? s : s.text}\n`;
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
