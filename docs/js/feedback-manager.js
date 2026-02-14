// Feedback Manager for SportSync
// Collects user feedback (votes, reports, suggestions) in localStorage
// and generates a pre-filled GitHub Issue URL for submission.

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
		return { votes: {}, reports: [], suggestions: [] };
	}

	_save() {
		try {
			localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
		} catch { /* ignore */ }
	}

	// --- Votes (thumbs up/down on events and picks) ---

	vote(eventId, direction) {
		// direction: 'up' | 'down' | null (toggle off)
		if (direction === null || this.data.votes[eventId] === direction) {
			delete this.data.votes[eventId];
		} else {
			this.data.votes[eventId] = direction;
		}
		this._save();
	}

	getVote(eventId) {
		return this.data.votes[eventId] || null;
	}

	// --- Reports (flag misinformation or issues) ---

	report(eventId, eventTitle, message) {
		this.data.reports.push({
			eventId,
			title: eventTitle,
			message,
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
		return Object.keys(this.data.votes).length +
			this.data.reports.length +
			this.data.suggestions.length;
	}

	// --- Generate GitHub Issue URL ---

	buildIssueURL() {
		const votes = this.data.votes;
		const reports = this.data.reports;
		const suggestions = this.data.suggestions;

		let body = '## SportSync User Feedback\n\n';

		// Votes section
		const voteEntries = Object.entries(votes);
		if (voteEntries.length > 0) {
			body += '### Votes\n\n';
			body += '| Event | Vote |\n|-------|------|\n';
			for (const [id, dir] of voteEntries) {
				const emoji = dir === 'up' ? '\u{1F44D}' : '\u{1F44E}';
				const label = id.replace(/-/g, ' ').replace(/^(result |football |golf |tennis |formula1 |chess |esports |olympics )/, '');
				body += `| ${label} | ${emoji} |\n`;
			}
			body += '\n';
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
		body += '### Data (for autopilot)\n\n';
		body += '```json\n';
		body += JSON.stringify({ votes, reports, suggestions, date: new Date().toISOString().slice(0, 10) }, null, 2);
		body += '\n```\n';

		const title = `User feedback ${new Date().toISOString().slice(0, 10)}`;
		const params = new URLSearchParams({
			title,
			body,
			labels: 'user-feedback',
		});

		return `https://github.com/${this.REPO}/issues/new?${params.toString()}`;
	}

	// --- Submit (open GitHub Issue and clear) ---

	submit() {
		if (this.pendingCount() === 0) return;
		const url = this.buildIssueURL();
		window.open(url, '_blank');
		this.clear();
	}

	clear() {
		this.data = { votes: {}, reports: [], suggestions: [] };
		this._save();
	}
}

window.FeedbackManager = FeedbackManager;
