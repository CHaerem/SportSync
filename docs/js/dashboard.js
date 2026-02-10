// SportSync Dashboard — Ultra-minimal redesign
class Dashboard {
	constructor() {
		this.allEvents = [];
		this.selectedSports = new Set();
		this.expandedId = null;
		this.preferences = window.PreferencesManager ? new PreferencesManager() : null;
		this.laterExpanded = false;
		this.init();
	}

	async init() {
		this.bindThemeToggle();
		this.bindFilters();
		await this.loadEvents();

		// Tick countdowns every 60s
		this.tickInterval = setInterval(() => this.tickCountdowns(), 60000);
		// Refresh data every 30 min
		setInterval(() => this.loadEvents(), 30 * 60 * 1000);
	}

	// --- Data loading ---

	async loadEvents() {
		try {
			const resp = await fetch('data/events.json?t=' + Date.now());
			if (!resp.ok) throw new Error('Failed to load events');
			const data = await resp.json();
			this.allEvents = data
				.map(ev => ({
					id: `${ev.sport}-${ev.title}-${ev.time}`.replace(/\s+/g, '-').toLowerCase(),
					title: ev.title,
					time: ev.time,
					sport: ev.sport === 'f1' ? 'formula1' : ev.sport,
					tournament: ev.tournament || '',
					venue: ev.venue || '',
					norwegian: ev.norwegian || false,
					streaming: ev.streaming || [],
					participants: ev.participants || [],
					norwegianPlayers: ev.norwegianPlayers || [],
					link: ev.link || null,
					homeTeam: ev.homeTeam || null,
					awayTeam: ev.awayTeam || null,
					context: ev.context || null,
					featuredGroups: ev.featuredGroups || [],
				}))
				.sort((a, b) => new Date(a.time) - new Date(b.time));
			this.render();
		} catch (err) {
			console.error('Error loading events:', err);
			document.getElementById('events').innerHTML =
				'<p class="empty">Unable to load events. Please refresh.</p>';
		}
	}

	// --- Rendering ---

	render() {
		const filtered = this.getFilteredEvents();
		this.renderBrief(filtered);
		this.renderFeaturedContext(filtered);
		this.renderBands(filtered);
	}

	renderBrief(events) {
		const el = document.getElementById('brief');
		const brief = this.generateBrief(events);
		if (brief) {
			el.textContent = brief;
			el.style.display = '';
		} else {
			el.style.display = 'none';
		}
	}

	generateBrief(events) {
		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const todayEnd = new Date(todayStart);
		todayEnd.setDate(todayEnd.getDate() + 1);

		const todayEvents = events.filter(e => {
			const t = new Date(e.time);
			return t >= todayStart && t < todayEnd;
		});

		if (todayEvents.length === 0) return 'No events scheduled today.';

		const sportCounts = {};
		todayEvents.forEach(e => {
			sportCounts[e.sport] = (sportCounts[e.sport] || 0) + 1;
		});

		const sportLabels = {
			football: 'Premier League match', golf: 'golf event', tennis: 'tennis match',
			formula1: 'F1 session', chess: 'chess round', esports: 'esports match'
		};

		const parts = [];
		for (const [sport, count] of Object.entries(sportCounts)) {
			const base = sportLabels[sport] || `${sport} event`;
			parts.push(`${count} ${base}${count > 1 ? (base.endsWith('ch') ? 'es' : 's') : ''}`);
		}

		const upcoming = todayEvents
			.filter(e => new Date(e.time) > now)
			.sort((a, b) => new Date(a.time) - new Date(b.time))[0];

		let nextUp = '';
		if (upcoming) {
			const time = new Date(upcoming.time).toLocaleTimeString('en-NO', {
				hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo'
			});
			const shortTitle = upcoming.homeTeam && upcoming.awayTeam
				? `${upcoming.homeTeam} vs ${upcoming.awayTeam}`
				: upcoming.title;
			nextUp = ` Next up: ${shortTitle} at ${time}.`;
		}

		if (todayEvents.length <= 2) return `Quiet day \u2014 ${parts.join(' and ')}.${nextUp}`;
		return `${todayEvents.length} events today: ${parts.join(', ')}.${nextUp}`;
	}

	renderFeaturedContext(events) {
		const container = document.getElementById('featured-context');
		const contextEvents = events.filter(e => e.context);
		if (contextEvents.length === 0) {
			container.innerHTML = '';
			container.style.display = 'none';
			return;
		}

		// Group by context, pick largest
		const contexts = {};
		contextEvents.forEach(e => {
			if (!contexts[e.context]) contexts[e.context] = [];
			contexts[e.context].push(e);
		});
		const best = Object.entries(contexts).sort((a, b) => b[1].length - a[1].length)[0];
		const [contextId, ctxEvents] = best;

		const nameMap = {
			'olympics-2028': { name: 'Norway at the Olympics', emoji: '\ud83c\uddf3\ud83c\uddf4' },
			'world-cup-2026': { name: 'World Cup 2026', emoji: '\ud83c\udfc6' },
		};
		const mapped = nameMap[contextId] || {
			name: contextId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
			emoji: '\ud83c\udf0d'
		};

		const sorted = ctxEvents.sort((a, b) => new Date(a.time) - new Date(b.time));
		const preview = sorted.slice(0, 3);
		const hasMore = sorted.length > 3;

		container.style.display = '';
		container.innerHTML = `
			<div class="ctx-header">${mapped.emoji} ${this.esc(mapped.name)}</div>
			<div class="ctx-events">
				${preview.map(e => this.renderContextRow(e)).join('')}
			</div>
			${hasMore ? `<button class="ctx-expand" data-context="${this.esc(contextId)}">Explore all ${mapped.name} \u25b8</button>` : ''}
		`;

		const expandBtn = container.querySelector('.ctx-expand');
		if (expandBtn) {
			expandBtn.addEventListener('click', () => {
				const full = container.querySelector('.ctx-events');
				full.innerHTML = sorted.map(e => this.renderContextRow(e)).join('');
				expandBtn.remove();
			});
		}
	}

	renderContextRow(event) {
		const date = new Date(event.time);
		const day = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Europe/Oslo' });
		const time = date.toLocaleTimeString('en-NO', {
			hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo'
		});
		const emoji = getSportEmoji(event.sport);
		return `<div class="ctx-row">${day} ${time} &nbsp;${emoji} ${this.esc(event.title)}</div>`;
	}

	renderBands(events) {
		const container = document.getElementById('events');
		const now = new Date();
		const bands = this.groupByTemporalBand(events, now);

		let html = '';
		if (bands.today.length > 0) html += this.renderBand('TODAY', bands.today, false);
		if (bands.tomorrow.length > 0) html += this.renderBand('TOMORROW', bands.tomorrow, false);
		if (bands.thisWeek.length > 0) html += this.renderBand('THIS WEEK', bands.thisWeek, true);
		if (bands.later.length > 0) html += this.renderLater(bands.later);

		if (!html) {
			html = '<p class="empty">No upcoming events.</p>';
		}

		container.innerHTML = html;
		this.bindEventRows();
	}

	renderBand(label, events, showDay) {
		const groups = this.groupByTournament(events);
		let html = `<div class="band-label">${label}</div><div class="band-divider"></div>`;

		groups.forEach(group => {
			if (group.events.length >= 3) {
				// Tournament header + event rows
				const emoji = getSportEmoji(group.sport);
				html += `<div class="tournament-header">${emoji} ${this.esc(group.tournament)}</div>`;
				group.events.forEach(e => {
					html += this.renderRow(e, showDay, true);
				});
			} else {
				// Inline rows
				group.events.forEach(e => {
					html += this.renderRow(e, showDay, false);
				});
			}
		});

		return html;
	}

	renderLater(events) {
		const count = events.length;
		return `
			<div class="band-label">LATER</div>
			<div class="band-divider"></div>
			<button class="later-toggle" id="laterToggle">${count} more event${count > 1 ? 's' : ''} \u25b8</button>
			<div class="later-events" id="laterEvents" style="display:none;"></div>
		`;
	}

	renderRow(event, showDay, underTournament) {
		const date = new Date(event.time);
		const emoji = getSportEmoji(event.sport);
		const sport = SPORT_CONFIG.find(s => s.id === event.sport || (s.aliases && s.aliases.includes(event.sport)));
		const sportColor = sport ? sport.color : '#888';

		let timeStr;
		if (showDay) {
			timeStr = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Europe/Oslo' }) + ' ' +
				date.toLocaleTimeString('en-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' });
		} else {
			timeStr = date.toLocaleTimeString('en-NO', {
				hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo'
			});
		}

		const title = event.homeTeam && event.awayTeam
			? `${event.homeTeam} vs ${event.awayTeam}`
			: event.title;

		const tournamentLabel = !underTournament && event.tournament && !event.title.includes(event.tournament)
			? `<span class="row-tournament">${this.esc(event.tournament)}</span>` : '';

		const isExpanded = this.expandedId === event.id;

		return `
			<div class="event-row${isExpanded ? ' expanded' : ''}" data-id="${this.esc(event.id)}">
				<div class="row-main">
					<span class="row-time">${timeStr}</span>
					<span class="row-title">${this.esc(title)}</span>
					${tournamentLabel}
					<span class="row-dot" style="background:${sportColor}" title="${emoji}"></span>
				</div>
				${isExpanded ? this.renderExpanded(event) : ''}
			</div>
		`;
	}

	renderExpanded(event) {
		const isFav = this.preferences ? this.preferences.isEventFavorite(event, event.id) : false;
		let content = '<div class="row-expanded">';

		// Venue
		if (event.venue && event.venue !== 'TBD') {
			content += `<div class="exp-venue">${this.esc(event.venue)}</div>`;
		}

		// Football: team logos
		if (event.sport === 'football' && event.homeTeam && event.awayTeam) {
			const homeLogo = getTeamLogo(event.homeTeam);
			const awayLogo = getTeamLogo(event.awayTeam);
			content += '<div class="exp-teams">';
			content += `<div class="exp-team">
				${homeLogo ? `<img src="${homeLogo}" alt="${this.esc(event.homeTeam)}" class="exp-logo" loading="lazy">` : '<span class="exp-logo-placeholder">\u26bd</span>'}
				<span>${this.esc(event.homeTeam)}</span>
			</div>`;
			content += '<span class="exp-vs">vs</span>';
			content += `<div class="exp-team">
				${awayLogo ? `<img src="${awayLogo}" alt="${this.esc(event.awayTeam)}" class="exp-logo" loading="lazy">` : '<span class="exp-logo-placeholder">\u26bd</span>'}
				<span>${this.esc(event.awayTeam)}</span>
			</div>`;
			content += '</div>';
		}

		// Golf: Norwegian players with headshots
		if (event.sport === 'golf' && event.norwegianPlayers && event.norwegianPlayers.length > 0) {
			content += '<div class="exp-golfers">';
			event.norwegianPlayers.forEach(player => {
				const headshot = getGolferHeadshot(player.name);
				const teeTime = player.teeTime || '';
				content += `<div class="exp-golfer">
					<div class="exp-golfer-info">
						${headshot ? `<img src="${headshot}" alt="${this.esc(player.name)}" class="exp-headshot" loading="lazy">` : '<span class="exp-headshot-placeholder">\u26f3</span>'}
						<span>${this.esc(player.name)}</span>
					</div>
					${teeTime ? `<span class="exp-tee-time">${this.esc(teeTime)}</span>` : ''}
				</div>`;
			});
			if (event.link) {
				content += `<a href="${this.esc(event.link)}" target="_blank" rel="noopener noreferrer" class="exp-link">\ud83d\udcca Leaderboard \u2197</a>`;
			}
			content += '</div>';
		}

		// Streaming
		if (event.streaming && event.streaming.length > 0) {
			content += '<div class="exp-streaming">';
			event.streaming.forEach(s => {
				if (s.url) {
					content += `<a href="${this.esc(s.url)}" target="_blank" rel="noopener noreferrer" class="exp-stream-badge">\ud83d\udcfa ${this.esc(s.platform)}</a>`;
				} else {
					content += `<span class="exp-stream-badge">\ud83d\udcfa ${this.esc(s.platform)}</span>`;
				}
			});
			content += '</div>';
		}

		// Favorite action
		if (event.sport === 'football' && (event.homeTeam || event.awayTeam)) {
			const teams = [event.homeTeam, event.awayTeam].filter(Boolean);
			content += '<div class="exp-fav-actions">';
			teams.forEach(team => {
				const isTeamFav = this.preferences && this.preferences.isTeamFavorite('football', team);
				content += `<button class="exp-fav-btn" data-action="team" data-sport="football" data-name="${this.esc(team)}">${isTeamFav ? '\u2605' : '\u2606'} ${this.esc(team)}</button>`;
			});
			content += '</div>';
		} else if (event.sport === 'golf' && event.norwegianPlayers && event.norwegianPlayers.length > 0) {
			content += '<div class="exp-fav-actions">';
			event.norwegianPlayers.forEach(player => {
				const isPlayerFav = this.preferences && this.preferences.isPlayerFavorite('golf', player.name);
				content += `<button class="exp-fav-btn" data-action="player" data-sport="golf" data-name="${this.esc(player.name)}">${isPlayerFav ? '\u2605' : '\u2606'} ${this.esc(player.name)}</button>`;
			});
			content += '</div>';
		}

		content += '</div>';
		return content;
	}

	// --- Event handlers ---

	bindEventRows() {
		// Row click to expand
		document.querySelectorAll('.event-row').forEach(row => {
			row.addEventListener('click', (e) => {
				if (e.target.closest('.exp-fav-btn') || e.target.closest('.exp-stream-badge') || e.target.closest('.exp-link')) return;
				const id = row.dataset.id;
				this.expandedId = this.expandedId === id ? null : id;
				this.render();
			});
		});

		// Favorite buttons in expanded view
		document.querySelectorAll('.exp-fav-btn').forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				if (!this.preferences) return;
				const action = btn.dataset.action;
				const sport = btn.dataset.sport;
				const name = btn.dataset.name;

				if (action === 'team') {
					if (this.preferences.isTeamFavorite(sport, name)) {
						this.preferences.removeFavoriteTeam(sport, name);
					} else {
						this.preferences.addFavoriteTeam(sport, name);
					}
				} else if (action === 'player') {
					if (this.preferences.isPlayerFavorite(sport, name)) {
						this.preferences.removeFavoritePlayer(sport, name);
					} else {
						this.preferences.addFavoritePlayer(sport, name);
					}
				}
				this.render();
			});
		});

		// Later toggle
		const laterToggle = document.getElementById('laterToggle');
		if (laterToggle) {
			laterToggle.addEventListener('click', () => {
				this.laterExpanded = !this.laterExpanded;
				const laterEl = document.getElementById('laterEvents');
				if (this.laterExpanded) {
					const filtered = this.getFilteredEvents();
					const bands = this.groupByTemporalBand(filtered, new Date());
					let html = '';
					const groups = this.groupByTournament(bands.later);
					groups.forEach(group => {
						if (group.events.length >= 3) {
							const emoji = getSportEmoji(group.sport);
							html += `<div class="tournament-header">${emoji} ${this.esc(group.tournament)}</div>`;
							group.events.forEach(e => { html += this.renderRow(e, true, true); });
						} else {
							group.events.forEach(e => { html += this.renderRow(e, true, false); });
						}
					});
					laterEl.innerHTML = html;
					laterEl.style.display = '';
					laterToggle.textContent = 'Show less \u25be';
					// Bind new rows
					laterEl.querySelectorAll('.event-row').forEach(row => {
						row.addEventListener('click', (e) => {
							if (e.target.closest('.exp-fav-btn') || e.target.closest('.exp-stream-badge') || e.target.closest('.exp-link')) return;
							const id = row.dataset.id;
							this.expandedId = this.expandedId === id ? null : id;
							this.render();
						});
					});
				} else {
					laterEl.style.display = 'none';
					const filtered = this.getFilteredEvents();
					const bands = this.groupByTemporalBand(filtered, new Date());
					laterToggle.textContent = `${bands.later.length} more event${bands.later.length > 1 ? 's' : ''} \u25b8`;
				}
			});
		}
	}

	bindFilters() {
		document.querySelectorAll('.filter-dot').forEach(dot => {
			dot.addEventListener('click', () => {
				const sport = dot.dataset.sport;
				if (this.selectedSports.has(sport)) {
					this.selectedSports.delete(sport);
					dot.classList.remove('active');
				} else {
					this.selectedSports.add(sport);
					dot.classList.add('active');
				}
				this.render();
			});
		});
	}

	bindThemeToggle() {
		const btn = document.getElementById('themeToggle');
		if (!btn) return;
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const saved = this.preferences ? this.preferences.getTheme() : 'auto';
		if (saved === 'dark' || (saved === 'auto' && prefersDark)) {
			document.documentElement.classList.add('dark');
			btn.textContent = '\u2600\ufe0f';
		}
		btn.addEventListener('click', () => {
			document.documentElement.classList.toggle('dark');
			const isDark = document.documentElement.classList.contains('dark');
			btn.textContent = isDark ? '\u2600\ufe0f' : '\ud83c\udf19';
			if (this.preferences) this.preferences.setTheme(isDark ? 'dark' : 'light');
		});
	}

	// --- Helpers ---

	getFilteredEvents() {
		if (this.selectedSports.size === 0) return this.allEvents;
		return this.allEvents.filter(e => this.selectedSports.has(e.sport));
	}

	groupByTemporalBand(events, now) {
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const tomorrowStart = new Date(todayStart);
		tomorrowStart.setDate(tomorrowStart.getDate() + 1);
		const tomorrowEnd = new Date(tomorrowStart);
		tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
		const weekEnd = new Date(todayStart);
		weekEnd.setDate(weekEnd.getDate() + 7);

		const bands = { today: [], tomorrow: [], thisWeek: [], later: [] };
		events.forEach(event => {
			const t = new Date(event.time);
			if (t < todayStart) return;
			if (t < tomorrowStart) bands.today.push(event);
			else if (t < tomorrowEnd) bands.tomorrow.push(event);
			else if (t < weekEnd) bands.thisWeek.push(event);
			else bands.later.push(event);
		});
		return bands;
	}

	groupByTournament(events) {
		const map = {};
		events.forEach(event => {
			const key = event.tournament || event.title;
			if (!map[key]) map[key] = { tournament: key, sport: event.sport, events: [] };
			map[key].events.push(event);
		});
		return Object.values(map).sort((a, b) =>
			new Date(a.events[0].time) - new Date(b.events[0].time)
		);
	}

	tickCountdowns() {
		// Re-render brief to update times
		const filtered = this.getFilteredEvents();
		this.renderBrief(filtered);
	}

	esc(str) {
		if (typeof str !== 'string') return '';
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
	window.dashboard = new Dashboard();
});
