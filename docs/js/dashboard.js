// SportSync Dashboard — Editorial Brief + Featured Content
class Dashboard {
	constructor() {
		this.allEvents = [];
		this.featured = null;
		this.selectedSports = new Set();
		this.expandedId = null;
		this.preferences = window.PreferencesManager ? new PreferencesManager() : null;
		this.init();
	}

	async init() {
		this.bindThemeToggle();
		this.bindFilters();
		await this.loadEvents();

		// Tick countdowns every 60s
		this.tickInterval = setInterval(() => this.tickCountdowns(), 60000);
		// Refresh data every 15 min
		setInterval(() => this.loadEvents(), 15 * 60 * 1000);
	}

	// --- Data loading ---

	async loadEvents() {
		try {
			const [eventsResp, featuredResp] = await Promise.all([
				fetch('data/events.json?t=' + Date.now()),
				fetch('data/featured.json?t=' + Date.now()).catch(() => null)
			]);

			if (!eventsResp.ok) throw new Error('Failed to load events');
			const data = await eventsResp.json();
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

			// Load featured content
			if (featuredResp && featuredResp.ok) {
				try {
					this.featured = await featuredResp.json();
				} catch {
					this.featured = null;
				}
			}

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
		this.renderSections();
		this.renderBands(filtered);
		this.renderOnTheRadar();
	}

	// --- The Brief ---

	renderBrief(events) {
		const el = document.getElementById('the-brief');
		let lines = [];

		if (this.featured && Array.isArray(this.featured.brief) && this.featured.brief.length > 0) {
			lines = this.featured.brief.slice(0, 2);
		} else {
			lines = this.generateBriefLines(events);
		}

		if (lines.length === 0) {
			el.style.display = 'none';
			return;
		}

		el.style.display = '';
		el.innerHTML = lines.map(line => this.esc(line)).join(' ');
	}

	generateBriefLines(events) {
		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const todayEnd = new Date(todayStart);
		todayEnd.setDate(todayEnd.getDate() + 1);

		const todayEvents = events.filter(e => {
			const t = new Date(e.time);
			return t >= todayStart && t < todayEnd;
		});

		if (todayEvents.length === 0) return [];

		const sportCounts = {};
		todayEvents.forEach(e => { sportCounts[e.sport] = (sportCounts[e.sport] || 0) + 1; });

		const sportLabels = {
			football: 'football', golf: 'golf', tennis: 'tennis',
			formula1: 'F1', chess: 'chess', esports: 'esports', olympics: 'Olympics'
		};

		const parts = Object.entries(sportCounts)
			.map(([sport, count]) => `${count} ${sportLabels[sport] || sport}`)
			.join(', ');

		return [`${todayEvents.length} events today \u2014 ${parts}.`];
	}

	// --- Featured Sections ---

	renderSections() {
		const container = document.getElementById('featured-sections');
		if (!this.featured || !Array.isArray(this.featured.sections) || this.featured.sections.length === 0) {
			container.innerHTML = '';
			return;
		}

		container.innerHTML = this.featured.sections.map(section => this.renderSection(section)).join('');
		this.bindSectionExpands();
	}

	renderSection(section) {
		const styleClass = section.style === 'highlight' ? ' highlight' : '';
		const items = (section.items || []).map(item => this.renderSectionItem(item)).join('');

		const hasExpand = section.expandLabel && section.expandItems && section.expandItems.length > 0;
		const expandHtml = hasExpand ? `
			<button class="feat-expand" data-section="${this.esc(section.id)}">${this.esc(section.expandLabel)} \u25b8</button>
			<div class="feat-expand-content" data-expand="${this.esc(section.id)}">
				${section.expandItems.map(item => this.renderSectionItem(item)).join('')}
			</div>
		` : '';

		return `
			<div class="featured-section${styleClass}">
				<div class="feat-header">${section.emoji || ''} ${this.esc(section.title)}</div>
				${items}
				${expandHtml}
			</div>
		`;
	}

	renderSectionItem(item) {
		const typeClass = item.type || 'text';
		return `<div class="feat-item ${typeClass}">${this.esc(item.text)}</div>`;
	}

	bindSectionExpands() {
		document.querySelectorAll('.feat-expand').forEach(btn => {
			btn.addEventListener('click', () => {
				const sectionId = btn.dataset.section;
				const content = document.querySelector(`.feat-expand-content[data-expand="${sectionId}"]`);
				if (content) {
					content.classList.toggle('open');
					btn.textContent = content.classList.contains('open')
						? btn.textContent.replace('\u25b8', '\u25be')
						: btn.textContent.replace('\u25be', '\u25b8');
				}
			});
		});
	}

	// --- Event Bands ---

	renderBands(events) {
		const container = document.getElementById('events');
		const now = new Date();
		const bands = this.groupByTemporalBand(events, now);

		let html = '';

		// TODAY — grouped by tournament
		if (bands.today.length > 0) {
			html += `<div class="band-label">Today</div>`;
			html += this.renderGroupedEvents(bands.today, false);
		}

		// TOMORROW — grouped
		if (bands.tomorrow.length > 0) {
			html += `<div class="band-label" style="margin-top:28px;">Tomorrow</div>`;
			html += this.renderGroupedEvents(bands.tomorrow, false);
		}

		// THIS WEEK + LATER — collapsed summary
		const later = [...bands.thisWeek, ...bands.later];
		if (later.length > 0) {
			html += `<button class="more-toggle" data-toggle="later" style="margin-top:20px;">${this.summarizeSports(later)} later \u25b8</button>`;
			html += `<div class="more-content" data-content="later">${this.renderGroupedEvents(later, true)}</div>`;
		}

		if (!html) {
			html = '<p class="empty">No upcoming events.</p>';
		}

		container.innerHTML = html;
		this.bindEventRows();
		this.bindExpandToggles();
	}

	renderGroupedEvents(events, showDay) {
		const groups = this.groupByTournament(events);
		return groups.map(group => {
			const sport = SPORT_CONFIG.find(s => s.id === group.sport || (s.aliases && s.aliases.includes(group.sport)));
			const color = sport ? sport.color : '#888';
			const rows = group.events.map(e => this.renderRow(e, showDay)).join('');
			const showLabel = group.events.length >= 2 ||
				(group.tournament && group.tournament !== group.events[0].title);
			return `
				<div class="event-group" style="border-left-color:${color}">
					${showLabel ? `<div class="group-label">${this.esc(group.tournament)}</div>` : ''}
					${rows}
				</div>
			`;
		}).join('');
	}

	renderEventList(events, showDay) {
		return events.map(e => this.renderRow(e, showDay)).join('');
	}

	summarizeSports(events) {
		const sportCounts = {};
		events.forEach(e => {
			const sport = SPORT_CONFIG.find(s => s.id === e.sport || (s.aliases && s.aliases.includes(e.sport)));
			const name = sport ? sport.name.toLowerCase() : e.sport;
			sportCounts[name] = (sportCounts[name] || 0) + 1;
		});
		return Object.entries(sportCounts)
			.map(([name, count]) => `${count} ${name}`)
			.join(' \u00b7 ');
	}

	renderRow(event, showDay) {
		const date = new Date(event.time);

		let timeStr;
		if (showDay) {
			timeStr = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Europe/Oslo' }) + ' ' +
				date.toLocaleTimeString('en-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' });
		} else {
			timeStr = date.toLocaleTimeString('en-NO', {
				hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo'
			});
		}

		let iconHtml = '';
		let title = event.title;

		if (event.sport === 'football' && event.homeTeam && event.awayTeam) {
			const hLogo = typeof getTeamLogo === 'function' ? getTeamLogo(event.homeTeam) : null;
			const aLogo = typeof getTeamLogo === 'function' ? getTeamLogo(event.awayTeam) : null;
			if (hLogo && aLogo) {
				iconHtml = `<img src="${hLogo}" class="row-logo" loading="lazy"><img src="${aLogo}" class="row-logo" loading="lazy">`;
			} else {
				iconHtml = `<span class="row-emoji">\u26bd</span>`;
			}
			title = `${this.shortName(event.homeTeam)} v ${this.shortName(event.awayTeam)}`;
		} else if (event.sport === 'golf' && event.norwegianPlayers && event.norwegianPlayers.length > 0) {
			const headshot = typeof getGolferHeadshot === 'function' ? getGolferHeadshot(event.norwegianPlayers[0].name) : null;
			if (headshot) {
				iconHtml = `<img src="${headshot}" class="row-headshot" loading="lazy">`;
			} else {
				iconHtml = `<span class="row-emoji">${getSportEmoji(event.sport)}</span>`;
			}
		} else {
			iconHtml = `<span class="row-emoji">${getSportEmoji(event.sport)}</span>`;
		}

		const isExpanded = this.expandedId === event.id;

		return `
			<div class="event-row${isExpanded ? ' expanded' : ''}" data-id="${this.esc(event.id)}">
				<div class="row-main">
					<span class="row-time">${timeStr}</span>
					<span class="row-icons">${iconHtml}</span>
					<span class="row-title">${this.esc(title)}</span>
				</div>
				${isExpanded ? this.renderExpanded(event) : ''}
			</div>
		`;
	}

	shortName(name) {
		if (!name) return '';
		return name.replace(/ FC$| AFC$| CF$| FK$/i, '').replace(/^FC |^AFC /i, '').trim();
	}

	renderExpanded(event) {
		let content = '<div class="row-expanded">';

		// Venue
		if (event.venue && event.venue !== 'TBD') {
			content += `<div class="exp-venue">${this.esc(event.venue)}</div>`;
		}

		// Football: team logos
		if (event.sport === 'football' && event.homeTeam && event.awayTeam) {
			const homeLogo = typeof getTeamLogo === 'function' ? getTeamLogo(event.homeTeam) : null;
			const awayLogo = typeof getTeamLogo === 'function' ? getTeamLogo(event.awayTeam) : null;
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
				const headshot = typeof getGolferHeadshot === 'function' ? getGolferHeadshot(player.name) : null;
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

		// Favorite actions
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

	// --- On the Radar ---

	renderOnTheRadar() {
		const container = document.getElementById('on-the-radar');
		if (!this.featured || !Array.isArray(this.featured.radar) || this.featured.radar.length === 0) {
			container.style.display = 'none';
			return;
		}

		container.style.display = '';
		container.innerHTML = `<div class="radar-text">${this.featured.radar.map(line => this.esc(line)).join(' ')}</div>`;
	}

	// --- Event handlers ---

	bindEventRows() {
		document.querySelectorAll('.event-row').forEach(row => {
			row.addEventListener('click', (e) => {
				if (e.target.closest('.exp-fav-btn') || e.target.closest('.exp-stream-badge') || e.target.closest('.exp-link')) return;
				const id = row.dataset.id;
				this.expandedId = this.expandedId === id ? null : id;
				this.render();
			});
		});

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
	}

	bindExpandToggles() {
		document.querySelectorAll('.more-toggle[data-toggle]').forEach(btn => {
			btn.addEventListener('click', () => {
				const key = btn.dataset.toggle;
				const content = document.querySelector(`.more-content[data-content="${key}"]`);
				if (content) {
					const isOpen = content.classList.contains('open');
					content.classList.toggle('open');
					btn.textContent = isOpen
						? btn.textContent.replace('\u25be', '\u25b8')
						: btn.textContent.replace('\u25b8', '\u25be');

					// Bind event rows inside newly opened content
					if (!isOpen) {
						content.querySelectorAll('.event-row').forEach(row => {
							row.addEventListener('click', (e) => {
								if (e.target.closest('.exp-fav-btn') || e.target.closest('.exp-stream-badge') || e.target.closest('.exp-link')) return;
								const id = row.dataset.id;
								this.expandedId = this.expandedId === id ? null : id;
								this.render();
							});
						});
					}
				}
			});
		});
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
