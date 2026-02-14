// Feedback Manager for SportSync
// Collects user feedback (reports, suggestions) in localStorage
// and generates a pre-filled GitHub Issue URL for submission.
// Favorites come from PreferencesManager (star system) and are
// included automatically in the issue body.

class FeedbackManager {
	constructor() {
		this.STORAGE_KEY = 'sportsync-feedback';
		this.REPO = 'CHaerem/SportSync';
		this.data = this._load();
	}

	_load() {
		try {
			const raw = localStorage.getItem(this.STORAGE_KEY);
			if (raw) return JSON.parse(raw);
		} catch { /* ignore */ }
		return { reports: [], suggestions: [] };
	}

	_save() {
		try {
			localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
		} catch { /* ignore */ }
	}

	// --- Reports (flag misinformation or issues) ---

	report(eventId, eventTitle, message, sport, tournament) {
		this.data.reports.push({
			eventId,
			title: eventTitle,
			message,
			sport: sport || null,
			tournament: tournament || null,
			timestamp: new Date().toISOString(),
		});
		this._save();
	}

	// --- Suggestions (new sports, events, features) ---

	suggest(text) {
		if (!text?.trim()) return;
		this.data.suggestions.push({
			text: text.trim(),
			timestamp: new Date().toISOString(),
		});
		this._save();
	}

	// --- Pending count ---

	pendingCount() {
		return this.data.reports.length +
			this.data.suggestions.length;
	}

	// --- Favorites snapshot (from PreferencesManager) ---

	_getPreferencesSnapshot() {
		if (!window.PreferencesManager) return null;
		// Find the live instance on the dashboard, or create a temporary read
		const pm = window._ssPreferences || new PreferencesManager();
		const prefs = pm.getPreferences();
		return {
			favoriteTeams: prefs.favoriteTeams || {},
			favoritePlayers: prefs.favoritePlayers || {},
			engagement: prefs.engagement || {},
		};
	}

	// --- Generate GitHub Issue URL ---

	buildIssueURL() {
		const reports = this.data.reports;
		const suggestions = this.data.suggestions;
		const favorites = this._getPreferencesSnapshot();

		let body = '## SportSync User Feedback\n\n';

		// Favorites section — shows current preferences state
		if (favorites) {
			const teams = Object.entries(favorites.favoriteTeams).filter(([, v]) => v.length > 0);
			const players = Object.entries(favorites.favoritePlayers).filter(([, v]) => v.length > 0);
			if (teams.length > 0 || players.length > 0) {
				body += '### Current Favorites\n\n';
				for (const [sport, names] of teams) {
					body += `- **${sport}** teams: ${names.join(', ')}\n`;
				}
				for (const [sport, names] of players) {
					body += `- **${sport}** players: ${names.join(', ')}\n`;
				}
				body += '\n';
			}
		}

		// Reports section
		if (reports.length > 0) {
			body += '### Issues Reported\n\n';
			for (const r of reports) {
				body += `- **${r.title}**: ${r.message}\n`;
			}
			body += '\n';
		}

		// Suggestions section
		if (suggestions.length > 0) {
			body += '### Suggestions\n\n';
			for (const s of suggestions) {
				body += `- ${s.text}\n`;
			}
			body += '\n';
		}

		// Machine-readable JSON block for autopilot parsing
		const payload = { favorites, reports, suggestions, date: new Date().toISOString().slice(0, 10) };
		body += '### Data (for autopilot)\n\n';
		body += '```json\n';
		body += JSON.stringify(payload);
		body += '\n```\n';

		const title = `User feedback ${new Date().toISOString().slice(0, 10)}`;
		const params = new URLSearchParams({
			title,
			body,
			labels: 'user-feedback',
		});

		const url = `https://github.com/${this.REPO}/issues/new?${params.toString()}`;

		// GitHub URL-based issue creation truncates around 8k chars
		if (url.length > 7500) {
			console.warn(`Feedback URL is ${url.length} chars — may be truncated. Consider submitting more frequently.`);
		}

		return url;
	}

	// --- Submit (open GitHub Issue and clear) ---

	submit() {
		const url = this.buildIssueURL();
		window.open(url, '_blank');
		this.clear();
	}

	clear() {
		this.data = { reports: [], suggestions: [] };
		this._save();
	}
}

window.FeedbackManager = FeedbackManager;
