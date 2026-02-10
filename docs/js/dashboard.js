// SportSync Dashboard — Sport-organized layout
class Dashboard {
	constructor() {
		this.allEvents = [];
		this.featured = null;
		this.standings = null;
		this.expandedId = null;
		this.liveScores = {};      // { eventId: { home, away, clock, state } }
		this.liveLeaderboard = null; // golf live leaderboard
		this._liveInterval = null;
		this._liveVisible = true;
		this.preferences = window.PreferencesManager ? new PreferencesManager() : null;
		this.init();
	}

	async init() {
		this.bindThemeToggle();
		await this.loadEvents();
		setInterval(() => this.loadEvents(), 15 * 60 * 1000);
		this.startLivePolling();
		document.addEventListener('visibilitychange', () => {
			this._liveVisible = !document.hidden;
		});
	}

	// --- Data loading ---

	async loadEvents() {
		try {
			const [eventsResp, featuredResp, standingsResp] = await Promise.all([
				fetch('data/events.json?t=' + Date.now()),
				fetch('data/featured.json?t=' + Date.now()).catch(() => null),
				fetch('data/standings.json?t=' + Date.now()).catch(() => null)
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

			if (featuredResp && featuredResp.ok) {
				try { this.featured = await featuredResp.json(); } catch { this.featured = null; }
			}

			if (standingsResp && standingsResp.ok) {
				try { this.standings = await standingsResp.json(); } catch { this.standings = null; }
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
		this.renderBrief();
		this.renderSections();
		this.renderEvents();
		this.renderOnTheRadar();
	}

	// --- The Brief ---

	renderBrief() {
		const el = document.getElementById('the-brief');
		let lines = [];

		if (this.featured && Array.isArray(this.featured.brief) && this.featured.brief.length > 0) {
			lines = this.featured.brief.slice(0, 2);
		} else {
			lines = this.generateBriefLines();
		}

		if (lines.length === 0) {
			el.style.display = 'none';
			return;
		}

		el.style.display = '';
		el.innerHTML = lines.map(line => this.esc(line)).join(' ');
	}

	generateBriefLines() {
		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const todayEnd = new Date(todayStart);
		todayEnd.setDate(todayEnd.getDate() + 1);

		const todayEvents = this.allEvents.filter(e => {
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
			<button class="feat-expand" data-section="${this.esc(section.id)}">${this.esc(section.expandLabel)}</button>
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

	// --- Sport-organized Events ---

	renderEvents() {
		const container = document.getElementById('events');
		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const tomorrowStart = new Date(todayStart);
		tomorrowStart.setDate(tomorrowStart.getDate() + 1);

		// Group events by sport
		const sportEvents = {};
		SPORT_CONFIG.forEach(s => { sportEvents[s.id] = []; });
		this.allEvents.forEach(e => {
			if (sportEvents[e.sport]) sportEvents[e.sport].push(e);
		});

		const active = [];
		const upcoming = [];

		SPORT_CONFIG.forEach(sport => {
			const all = sportEvents[sport.id];
			const future = all.filter(e => new Date(e.time) >= todayStart);
			const today = future.filter(e => new Date(e.time) < tomorrowStart);

			if (today.length > 0) {
				active.push({ sport, today, future });
			} else if (future.length > 0) {
				upcoming.push({ sport, future, next: future[0] });
			}
		});

		active.sort((a, b) => new Date(a.today[0].time) - new Date(b.today[0].time));
		upcoming.sort((a, b) => new Date(a.next.time) - new Date(b.next.time));

		let html = '';

		// Active sports (events today)
		active.forEach(({ sport, today, future }) => {
			const later = future.filter(e => new Date(e.time) >= tomorrowStart);

			html += `<div class="sport-section" style="border-left-color:${sport.color}">`;
			html += `<div class="sport-header">
				<span class="sport-name">${sport.emoji} ${this.esc(sport.name)}</span>
				<span class="sport-status">${today.length} today</span>
			</div>`;

			today.forEach(e => { html += this.renderRow(e, false); });

			if (later.length > 0) {
				html += `<button class="more-toggle" data-toggle="later-${sport.id}">${later.length} more \u25b8</button>`;
				html += `<div class="more-content" data-content="later-${sport.id}">`;
				later.forEach(e => { html += this.renderRow(e, true); });
				html += `</div>`;
			}

			html += `</div>`;
		});

		// Upcoming sports (no events today)
		if (upcoming.length > 0) {
			html += `<div class="section-divider">Coming up</div>`;
			upcoming.forEach(({ sport, next }) => {
				const date = new Date(next.time);
				const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Europe/Oslo' });
				const nextTitle = next.title || next.tournament;
				const nextMeta = next.tournament && next.tournament !== next.title ? next.tournament : '';
				html += `<div class="sport-section compact" style="border-left-color:${sport.color}">
					<div class="sport-header">
						<span class="sport-name">${sport.emoji} ${this.esc(sport.name)}</span>
						<span class="sport-status">${dateStr}</span>
					</div>
					<div class="sport-next">${this.esc(nextTitle)}${nextMeta ? ` <span style="opacity:0.6">\u00b7 ${this.esc(nextMeta)}</span>` : ''}</div>
				</div>`;
			});
		}

		if (!html) {
			html = '<p class="empty">No upcoming events.</p>';
		}

		container.innerHTML = html;
		this.bindEventRows();
		this.bindExpandToggles();
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
			}
			const live = this.liveScores[event.id];
			if (live) {
				title = `${this.esc(this.shortName(event.homeTeam))} <strong>${live.home} - ${live.away}</strong> ${this.esc(this.shortName(event.awayTeam))}`;
				if (live.state === 'in') {
					timeStr = `<span class="live-dot"></span>${this.esc(live.clock)}`;
				} else if (live.state === 'post') {
					timeStr = 'FT';
				}
			} else {
				title = `${this.shortName(event.homeTeam)} v ${this.shortName(event.awayTeam)}`;
			}
		} else if (event.sport === 'golf' && event.norwegianPlayers && event.norwegianPlayers.length > 0) {
			const headshot = typeof getGolferHeadshot === 'function' ? getGolferHeadshot(event.norwegianPlayers[0].name) : null;
			if (headshot) {
				iconHtml = `<img src="${headshot}" class="row-headshot" loading="lazy">`;
			}
		}

		const isExpanded = this.expandedId === event.id;

		// If title contains live score HTML (<strong>), render raw; otherwise escape
		const hasLiveScore = this.liveScores[event.id];
		const titleHtml = hasLiveScore ? title : this.esc(title);

		return `
			<div class="event-row${isExpanded ? ' expanded' : ''}" data-id="${this.esc(event.id)}">
				<div class="row-main">
					<span class="row-time">${timeStr}</span>
					${iconHtml ? `<span class="row-icons">${iconHtml}</span>` : ''}
					<span class="row-title">${titleHtml}</span>
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

		// Football: mini league table
		if (event.sport === 'football' && this.standings?.football?.premierLeague?.length > 0) {
			content += this.renderFootballStandings(event);
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

		// Golf: tournament leaderboard
		if (event.sport === 'golf' && this.standings?.golf) {
			content += this.renderGolfLeaderboard(event);
		}

		// F1: driver standings
		if (event.sport === 'formula1' && this.standings?.f1?.drivers?.length > 0) {
			content += this.renderF1Standings();
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

	// --- Standings renderers ---

	renderFootballStandings(event) {
		const table = this.standings.football.premierLeague;
		const matchTeams = [event.homeTeam, event.awayTeam].filter(Boolean).map(t => t.toLowerCase());

		// Collect top 3 + both match teams, deduped, sorted by position
		const top3 = table.slice(0, 3);
		const matchRows = table.filter(t => matchTeams.some(mt =>
			t.team.toLowerCase().includes(mt) || mt.includes(t.team.toLowerCase()) ||
			t.teamShort.toLowerCase() === mt.replace(/ fc$| afc$/i, '').trim().toLowerCase()
		));

		const shown = new Map();
		[...top3, ...matchRows].forEach(t => { if (!shown.has(t.position)) shown.set(t.position, t); });
		const rows = Array.from(shown.values()).sort((a, b) => a.position - b.position);
		if (rows.length === 0) return '';

		let html = '<div class="exp-standings"><div class="exp-standings-header">Premier League</div>';
		html += '<table class="exp-mini-table"><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>';

		let lastPos = 0;
		for (const row of rows) {
			if (row.position - lastPos > 1 && lastPos > 0) {
				html += '<tr class="ellipsis"><td colspan="8">\u2026</td></tr>';
			}
			const isHighlight = matchTeams.some(mt =>
				row.team.toLowerCase().includes(mt) || mt.includes(row.team.toLowerCase()) ||
				row.teamShort.toLowerCase() === mt.replace(/ fc$| afc$/i, '').trim().toLowerCase()
			);
			const cls = isHighlight ? ' class="highlight"' : '';
			const gd = row.gd > 0 ? `+${row.gd}` : row.gd;
			html += `<tr${cls}><td>${row.position}</td><td>${this.esc(row.teamShort)}</td><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${gd}</td><td>${row.points}</td></tr>`;
			lastPos = row.position;
		}

		html += '</tbody></table></div>';
		return html;
	}

	renderGolfLeaderboard(event) {
		// Try to match tournament to PGA or DP World Tour
		const tourKey = (event.tournament || '').toLowerCase().includes('dp world') ? 'dpWorld' : 'pga';
		const tour = this.standings.golf[tourKey];
		if (!tour?.leaderboard?.length) return '';

		let html = `<div class="exp-standings"><div class="exp-standings-header">${this.esc(tour.name || 'Leaderboard')}</div>`;
		html += '<table class="exp-mini-table"><thead><tr><th>#</th><th>Player</th><th>Score</th><th>Today</th><th>Thru</th></tr></thead><tbody>';

		const top5 = tour.leaderboard.slice(0, 5);
		for (const p of top5) {
			html += `<tr><td>${p.position || '-'}</td><td>${this.esc(p.player)}</td><td>${this.esc(p.score)}</td><td>${this.esc(p.today)}</td><td>${this.esc(p.thru)}</td></tr>`;
		}

		// Check if any Norwegian player is on the leaderboard beyond top 5
		if (event.norwegianPlayers?.length > 0) {
			const norNames = event.norwegianPlayers.map(p => p.name.toLowerCase());
			const norOnBoard = tour.leaderboard.slice(5).filter(p =>
				norNames.some(n => p.player.toLowerCase().includes(n.split(' ').pop()))
			);
			if (norOnBoard.length > 0) {
				html += '<tr class="ellipsis"><td colspan="5">\u2026</td></tr>';
				for (const p of norOnBoard) {
					html += `<tr class="highlight"><td>${p.position || '-'}</td><td>${this.esc(p.player)}</td><td>${this.esc(p.score)}</td><td>${this.esc(p.today)}</td><td>${this.esc(p.thru)}</td></tr>`;
				}
			}
		}

		html += '</tbody></table></div>';
		return html;
	}

	renderF1Standings() {
		const drivers = this.standings.f1.drivers.slice(0, 5);
		if (drivers.length === 0) return '';

		let html = '<div class="exp-standings"><div class="exp-standings-header">Driver Standings</div>';
		html += '<table class="exp-mini-table"><thead><tr><th>#</th><th>Driver</th><th>Team</th><th>Pts</th></tr></thead><tbody>';

		for (const d of drivers) {
			html += `<tr><td>${d.position}</td><td>${this.esc(d.driver)}</td><td>${this.esc(d.team)}</td><td>${d.points}</td></tr>`;
		}

		html += '</tbody></table></div>';
		return html;
	}

	// --- Live score polling ---

	startLivePolling() {
		if (this._liveInterval) return;
		this._liveInterval = setInterval(() => this.pollLiveScores(), 60 * 1000);
		// Initial poll after short delay
		setTimeout(() => this.pollLiveScores(), 3000);
	}

	hasLiveEvents() {
		const now = Date.now();
		return this.allEvents.some(e => {
			const start = new Date(e.time).getTime();
			// Event could be live: started up to 4h ago (covers golf rounds, football + extra time)
			return start <= now && start > now - 4 * 60 * 60 * 1000 &&
				(e.sport === 'football' || e.sport === 'golf');
		});
	}

	async pollLiveScores() {
		if (!this._liveVisible || !this.hasLiveEvents()) return;
		try {
			await Promise.all([
				this.pollFootballScores(),
				this.pollGolfScores(),
			]);
			this.updateLiveDOM();
		} catch (err) {
			// Silent fail — live scores are a nice-to-have
		}
	}

	async pollFootballScores() {
		const now = Date.now();
		const hasLiveFootball = this.allEvents.some(e =>
			e.sport === 'football' && new Date(e.time).getTime() <= now &&
			new Date(e.time).getTime() > now - 3 * 60 * 60 * 1000
		);
		if (!hasLiveFootball) return;

		try {
			const resp = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard');
			if (!resp.ok) return;
			const data = await resp.json();

			for (const ev of (data.events || [])) {
				const comp = ev.competitions?.[0];
				if (!comp) continue;
				const state = comp.status?.type?.state; // pre, in, post
				if (state !== 'in' && state !== 'post') continue;

				const home = comp.competitors?.find(c => c.homeAway === 'home');
				const away = comp.competitors?.find(c => c.homeAway === 'away');
				if (!home || !away) continue;

				const homeName = home.team?.displayName || '';
				const awayName = away.team?.displayName || '';

				// Match to our events by team names
				const matched = this.allEvents.find(e =>
					e.sport === 'football' &&
					e.homeTeam && e.awayTeam &&
					this.teamMatch(e.homeTeam, homeName) &&
					this.teamMatch(e.awayTeam, awayName)
				);
				if (matched) {
					this.liveScores[matched.id] = {
						home: parseInt(home.score, 10) || 0,
						away: parseInt(away.score, 10) || 0,
						clock: comp.status?.displayClock || '',
						state: state,
						detail: comp.status?.type?.shortDetail || '',
					};
				}
			}
		} catch { /* silent */ }
	}

	async pollGolfScores() {
		const now = Date.now();
		const hasLiveGolf = this.allEvents.some(e =>
			e.sport === 'golf' && new Date(e.time).getTime() <= now &&
			new Date(e.time).getTime() > now - 12 * 60 * 60 * 1000
		);
		if (!hasLiveGolf) return;

		try {
			const resp = await fetch('https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard');
			if (!resp.ok) return;
			const data = await resp.json();
			const ev = data.events?.[0];
			const comp = ev?.competitions?.[0];
			const state = ev?.status?.type?.state;
			if (!comp || state === 'pre') return;

			const competitors = comp.competitors || [];
			this.liveLeaderboard = {
				name: ev.name || '',
				state: state,
				players: competitors.slice(0, 15).map((c, idx) => ({
					position: c.order || (idx + 1),
					player: c.athlete?.displayName || c.athlete?.fullName || 'Unknown',
					score: typeof c.score === 'object' ? (c.score?.displayValue || 'E') : (c.score?.toString() || 'E'),
					today: c.linescores?.[c.linescores.length - 1]?.displayValue || '-',
					thru: c.status?.thru?.toString() || '-',
				})),
			};
		} catch { /* silent */ }
	}

	teamMatch(a, b) {
		const normalize = s => s.toLowerCase().replace(/ fc$| afc$| cf$| fk$/i, '').replace(/^fc |^afc /i, '').trim();
		return normalize(a) === normalize(b) || a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());
	}

	updateLiveDOM() {
		// Update football scores inline
		for (const [eventId, score] of Object.entries(this.liveScores)) {
			const row = document.querySelector(`.event-row[data-id="${CSS.escape(eventId)}"]`);
			if (!row) continue;
			const titleEl = row.querySelector('.row-title');
			const timeEl = row.querySelector('.row-time');
			if (!titleEl) continue;

			const event = this.allEvents.find(e => e.id === eventId);
			if (!event) continue;

			titleEl.innerHTML = `${this.esc(this.shortName(event.homeTeam))} <strong>${score.home} - ${score.away}</strong> ${this.esc(this.shortName(event.awayTeam))}`;

			if (timeEl && score.state === 'in') {
				timeEl.innerHTML = `<span class="live-dot"></span>${this.esc(score.clock)}`;
			} else if (timeEl && score.state === 'post') {
				timeEl.textContent = 'FT';
			}
		}

		// Update golf leaderboard in expanded view if visible
		if (this.liveLeaderboard && this.liveLeaderboard.state === 'in') {
			const golfTable = document.querySelector('.exp-standings .exp-standings-header');
			if (golfTable && golfTable.textContent.includes(this.liveLeaderboard.name)) {
				// Leaderboard is visible and matches — update will happen on next full render
			}
		}
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
