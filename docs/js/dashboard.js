// SportSync v2 — dashboard controller
// Loads pre-built JSON data, renders: live hero, editorial brief (blocks),
// per-sport card grid, tracked-entities surface. Polls ESPN for live scores.
// Depends on: shared-constants.js, sport-config.js, asset-maps.js, block-renderers.js

class Dashboard {
	constructor() {
		this.allEvents = [];
		this.featured = null;
		this.standings = null;
		this.recentResults = null;
		this.tracked = null;
		this.meta = null;
		this.liveScores = {};       // { eventId: { home, away, clock, state, ... } }
		this.liveLeaderboard = null; // golf live leaderboard
		this._liveInterval = null;
		this._liveVisible = !document.hidden;
	}

	async init() {
		this.initTheme();
		this.renderHeaderDate();
		await this.loadData();
		this.render();
		this.startLivePolling();
		this.bindTrackedToggle();
		this.bindAiBadges();
		document.addEventListener('visibilitychange', () => {
			this._liveVisible = !document.hidden;
			if (this._liveVisible) this.pollLiveScores();
		});
	}

	// ── Data loading ──────────────────────────────────────────────────────────

	async loadData() {
		const load = (file) =>
			fetch(`data/${file}?t=${Date.now()}`)
				.then((r) => (r.ok ? r.json() : null))
				.catch(() => null);

		const [events, featured, standings, results, tracked, meta] = await Promise.all([
			load('events.json'),
			load('featured.json'),
			load('standings.json'),
			load('recent-results.json'),
			load('tracked.json'),
			load('meta.json'),
		]);

		this.allEvents = Array.isArray(events) ? events : [];
		this.allEvents.forEach((e, i) => {
			e.id = `${e.sport}|${e.title}|${e.time}|${i}`;
		});
		this.featured = featured;
		this.standings = standings;
		this.recentResults = results;
		this.tracked = tracked;
		this.meta = meta;
	}

	// ── Rendering ─────────────────────────────────────────────────────────────

	render() {
		this.renderLive();
		this.renderBrief();
		this.renderSportsGrid();
		this.renderTracked();
		this.renderFooter();
	}

	renderHeaderDate() {
		const el = document.getElementById('header-date');
		if (!el) return;
		el.textContent = new Date().toLocaleDateString('nb-NO', {
			weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Oslo',
		});
	}

	renderFooter() {
		const el = document.getElementById('footer-updated');
		if (!el) return;
		const updated = this.meta?.lastUpdated;
		if (!updated) { el.textContent = ''; return; }
		const mins = Math.round((Date.now() - new Date(updated).getTime()) / SS_CONSTANTS.MS_PER_MINUTE);
		el.textContent = mins < 90
			? `Oppdatert for ${mins} min siden`
			: `Oppdatert ${new Date(updated).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' })}`;
	}

	// ── Live hero ─────────────────────────────────────────────────────────────

	renderLive() {
		const section = document.getElementById('live-section');
		const strip = document.getElementById('live-strip');
		if (!section || !strip) return;

		const cards = [];

		for (const [eventId, live] of Object.entries(this.liveScores)) {
			if (live.state !== 'in') continue;
			const event = this.allEvents.find((e) => e.id === eventId);
			cards.push(this.liveFootballCard(event, live));
		}

		if (this.liveLeaderboard?.state === 'in' && this.liveLeaderboard.players?.length) {
			cards.push(this.liveGolfCard(this.liveLeaderboard));
		}

		if (cards.length === 0) {
			section.hidden = true;
			return;
		}
		strip.innerHTML = cards.join('');
		section.hidden = false;
	}

	liveFootballCard(event, live) {
		const hLogo = getTeamLogo(live.homeName) || '';
		const aLogo = getTeamLogo(live.awayName) || '';
		const league = event?.tournament || '';
		return `<div class="live-card">
			<div class="live-league"><span class="live-dot"></span>${escapeHtml(league)}</div>
			<div class="live-teams">
				<span class="live-side">${hLogo ? `<img src="${hLogo}" alt="" loading="lazy">` : ''}${escapeHtml(ssShortName(live.homeName))}</span>
				<span class="live-score">${live.home} – ${live.away}</span>
				<span class="live-side">${aLogo ? `<img src="${aLogo}" alt="" loading="lazy">` : ''}${escapeHtml(ssShortName(live.awayName))}</span>
			</div>
			<div class="live-clock">${escapeHtml(live.clock || live.detail || '')}</div>
		</div>`;
	}

	liveGolfCard(lb) {
		const tracked = this._getTrackedGolferNames();
		const focus = lb.players.find((p) =>
			[...tracked].some((n) => p.player.toLowerCase().includes(n.toLowerCase()))
		) || lb.players[0];
		const rows = lb.players.slice(0, 5).map((p) =>
			`<div class="block-schedule-item">${escapeHtml(String(p.position))} ${escapeHtml(p.player)} <span class="muted">${escapeHtml(p.score)} (${escapeHtml(p.thru)})</span></div>`
		).join('');
		return `<div class="live-card">
			<div class="live-league"><span class="live-dot"></span>⛳ ${escapeHtml(lb.name)} · ${escapeHtml(lb.round || '')}</div>
			${rows}
			${focus ? `<div class="live-detail">${escapeHtml(focus.player)}: ${escapeHtml(focus.score)}</div>` : ''}
		</div>`;
	}

	// ── Editorial brief ───────────────────────────────────────────────────────

	renderBrief() {
		const section = document.getElementById('brief-section');
		const container = document.getElementById('brief');
		if (!section || !container) return;
		const blocks = this.featured?.blocks;
		if (!Array.isArray(blocks) || blocks.length === 0) {
			section.hidden = true;
			return;
		}

		const ctx = {
			allEvents: this.allEvents,
			recentResults: this.recentResults,
			standings: this.standings,
			liveScores: this.liveScores,
			liveLeaderboard: this.liveLeaderboard,
			renderBriefLine: (t) => escapeHtml(t),
			relativeTime: (d) => this.relativeTime(d),
			_isSameDay: (a, b) => a.toDateString() === b.toDateString(),
			_getTrackedGolferNames: () => this._getTrackedGolferNames(),
		};

		const modeLabel = this.featured.mode === 'evening' ? 'Kveldsbrief' : 'Morgenbrief';
		let html = `<div class="brief-mode">${modeLabel}</div>`;
		for (const block of blocks) {
			html += this.renderBlock(block, ctx) || '';
		}
		container.innerHTML = html;
		section.hidden = false;
	}

	renderBlock(block, ctx) {
		switch (block.type) {
			case 'headline':
				return `<div class="block-headline">${escapeHtml(block.text)}</div>`;
			case 'narrative':
				return `<div class="block-narrative">${escapeHtml(block.text)}</div>`;
			case 'divider':
				return `<div class="block-divider">${escapeHtml(block.text || '')}</div>`;
			case 'event-line':
				return `<div class="block-event-line">${escapeHtml(block.text || block._fallbackText || '')}</div>`;
			default: {
				const renderer = window.BLOCK_RENDERERS?.[block.type];
				if (renderer) {
					const html = renderer(block, ctx);
					if (html) return html;
				}
				// Graceful degradation: structured block that couldn't resolve
				if (block._fallbackText) {
					return `<div class="block-event-line">${escapeHtml(block._fallbackText)}</div>`;
				}
				return '';
			}
		}
	}

	// ── Sport card grid ───────────────────────────────────────────────────────

	renderSportsGrid() {
		const grid = document.getElementById('sports-grid');
		if (!grid) return;

		const now = Date.now();
		const horizon = now + 7 * SS_CONSTANTS.MS_PER_DAY;
		const visible = this.allEvents.filter((e) => isEventInWindow(e, now - SS_CONSTANTS.MS_PER_HOUR * 4, horizon));

		// Group by sport, ordered by soonest event
		const bySport = new Map();
		for (const e of visible) {
			const key = normalizeClientSportId(e.sport);
			if (!bySport.has(key)) bySport.set(key, []);
			bySport.get(key).push(e);
		}
		const sections = [...bySport.entries()]
			.map(([sport, events]) => {
				events.sort((a, b) => new Date(a.time) - new Date(b.time));
				return { sport, events, first: new Date(events[0].time).getTime() };
			})
			.sort((a, b) => a.first - b.first);

		if (sections.length === 0) {
			grid.innerHTML = `<div class="empty-state">Ingen kommende arrangementer de neste 7 dagene.</div>`;
			return;
		}

		grid.innerHTML = sections.map(({ sport, events }) => {
			const cfg = SPORT_CONFIG.find((s) => s.id === sport) || { emoji: '🏆', name: sport, color: 'var(--accent)' };
			const cards = events.slice(0, 8).map((e) => this.eventCard(e)).join('');
			const more = events.length > 8 ? `<div class="empty-state">+${events.length - 8} flere</div>` : '';
			return `<div class="sport-section" style="--sport-color:${cfg.color}">
				<div class="sport-heading">${cfg.emoji} ${escapeHtml(cfg.name)} <span class="count">${events.length}</span></div>
				${cards}${more}
			</div>`;
		}).join('');
	}

	eventCard(e) {
		const date = new Date(e.time);
		const now = new Date();
		const sameDay = date.toDateString() === now.toDateString();
		const dayStr = sameDay
			? ''
			: date.toLocaleDateString('nb-NO', { weekday: 'short', timeZone: 'Europe/Oslo' }) + ' ';
		const timeStr = date.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });
		const rel = this.relativeTime(date);

		// Title: teams with logos for matches, plain title otherwise
		let title;
		if (e.homeTeam && e.awayTeam) {
			const hLogo = getTeamLogo(e.homeTeam);
			const aLogo = getTeamLogo(e.awayTeam);
			const live = this.liveScores[e.id];
			const mid = live && live.state !== 'pre'
				? `<span class="score">${live.home}–${live.away}</span>`
				: '<span class="muted">–</span>';
			title = `${hLogo ? `<img class="team-logo" src="${hLogo}" alt="" loading="lazy">` : ''}${escapeHtml(ssShortName(e.homeTeam))} ${mid} ${aLogo ? `<img class="team-logo" src="${aLogo}" alt="" loading="lazy">` : ''}${escapeHtml(ssShortName(e.awayTeam))}`;
		} else {
			title = escapeHtml(e.title);
		}

		const badges = [];
		if (e.isFavorite) badges.push('<span class="fav-star" title="Favoritt">★</span>');
		if (e.norwegian || e.norwegianPlayers?.length) badges.push('<span class="nor-flag" title="Norsk deltakelse">🇳🇴</span>');
		if (e.source === 'ai-research') {
			badges.push(`<button class="ai-badge" data-event-id="${escapeHtml(e.id)}" title="Funnet av AI-research — klikk for kilder">AI</button>`);
		}

		const details = [];
		if (e.venue && e.venue !== 'TBD') details.push(`<span>${escapeHtml(e.venue)}</span>`);
		if (e.norwegianPlayers?.length) {
			details.push(`<span>${escapeHtml(e.norwegianPlayers.slice(0, 3).map((p) => p.name || p).join(', '))}</span>`);
		}
		const streams = (e.streaming || []).slice(0, 2)
			.map((s) => {
				const platform = s.platform || s;
				return s.url
					? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(platform)}</a>`
					: escapeHtml(String(platform));
			});
		if (streams.length) details.push(`<span class="streaming">📺 ${streams.join(' · ')}</span>`);
		if (e.summary) details.push(`<span>${escapeHtml(e.summary)}</span>`);

		const mustWatch = (e.importance || 0) >= 4;
		return `<div class="card event-card${mustWatch ? ' must-watch' : ''}">
			<div class="card-top">
				<span class="card-time">${escapeHtml(dayStr)}${escapeHtml(timeStr)}${rel ? ` · ${escapeHtml(rel)}` : ''}</span>
				<span class="card-tournament">${escapeHtml(e.tournament || '')}</span>
			</div>
			<div class="card-title">${title} ${badges.join(' ')}</div>
			${details.length ? `<div class="card-detail">${details.join('')}</div>` : ''}
		</div>`;
	}

	// ── Tracked surface ───────────────────────────────────────────────────────

	renderTracked() {
		const section = document.getElementById('tracked-section');
		const body = document.getElementById('tracked-body');
		if (!section || !body) return;
		const t = this.tracked;
		if (!t || (!t.leagues?.length && !t.athletes?.length && !t.tournaments?.length)) {
			section.hidden = true;
			return;
		}

		const group = (label, items) => {
			if (!items?.length) return '';
			const rows = items.map((item) => `<div class="tracked-item">
				<div>${escapeHtml(item.name)}</div>
				<div class="reason">${escapeHtml(item.reason || '')}</div>
				<div class="provenance">${escapeHtml(item.addedBy || '')}${item.expires ? ` · utløper ${escapeHtml(item.expires.slice(0, 10))}` : ''}</div>
			</div>`).join('');
			return `<div class="tracked-group-label">${label}</div>${rows}`;
		};

		body.innerHTML =
			group('Turneringer', t.tournaments) +
			group('Ligaer', t.leagues) +
			group('Utøvere', t.athletes) +
			(t.lastUpdated ? `<div class="provenance muted" style="font-size:11px;margin-top:8px;">Sist oppdatert ${escapeHtml(t.lastUpdated.slice(0, 16).replace('T', ' '))} av ${escapeHtml(t.lastUpdatedBy || '?')}</div>` : '');
		section.hidden = false;
	}

	bindTrackedToggle() {
		const btn = document.getElementById('tracked-toggle');
		const body = document.getElementById('tracked-body');
		if (!btn || !body) return;
		btn.addEventListener('click', () => {
			const open = btn.getAttribute('aria-expanded') === 'true';
			btn.setAttribute('aria-expanded', String(!open));
			body.hidden = open;
		});
	}

	// ── AI provenance modal ───────────────────────────────────────────────────

	bindAiBadges() {
		document.body.addEventListener('click', (evt) => {
			const badge = evt.target.closest('.ai-badge');
			if (!badge) return;
			const event = this.allEvents.find((e) => e.id === badge.dataset.eventId);
			if (!event) return;
			this.showAiModal(event);
		});
	}

	showAiModal(event) {
		const existing = document.querySelector('.modal-backdrop');
		if (existing) existing.remove();
		const links = (event.evidence || [])
			.map((url) => `<a class="evidence-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`)
			.join('');
		const verification = event.verificationStatus
			? `<p class="muted" style="font-size:13px;margin-top:8px;">Verifisert: ${escapeHtml(event.verificationStatus)}${event.verifiedAt ? ` (${escapeHtml(event.verifiedAt.slice(0, 10))})` : ''}</p>`
			: '';
		const backdrop = document.createElement('div');
		backdrop.className = 'modal-backdrop';
		backdrop.innerHTML = `<div class="modal">
			<button class="modal-close" aria-label="Lukk">✕</button>
			<h3>Funnet av AI-research</h3>
			<p style="font-size:14px;">${escapeHtml(event.title)}</p>
			<p class="muted" style="font-size:13px;margin:6px 0;">Sikkerhet: ${escapeHtml(event.confidence || 'ukjent')}</p>
			${links || '<p class="muted" style="font-size:13px;">Ingen kilder registrert.</p>'}
			${verification}
		</div>`;
		backdrop.addEventListener('click', (e) => {
			if (e.target === backdrop || e.target.closest('.modal-close')) backdrop.remove();
		});
		document.body.appendChild(backdrop);
	}

	// ── Live polling (ESPN, client-side, no API key) ──────────────────────────

	startLivePolling() {
		if (this._liveInterval) return;
		this._liveInterval = setInterval(() => this.pollLiveScores(), 60 * 1000);
		setTimeout(() => this.pollLiveScores(), 3000);
	}

	hasLiveEvents() {
		const now = Date.now();
		return this.allEvents.some((e) => {
			const start = new Date(e.time).getTime();
			const end = e.endTime ? new Date(e.endTime).getTime() : start + 4 * SS_CONSTANTS.MS_PER_HOUR;
			return start <= now && now <= end && (e.sport === 'football' || e.sport === 'golf');
		});
	}

	async pollLiveScores() {
		if (!this._liveVisible || !this.hasLiveEvents()) return;
		try {
			await Promise.all([this.pollFootballScores(), this.pollGolfScores()]);
			this.renderLive();
			this.renderSportsGrid();
		} catch {
			// Silent fail — live scores are a nice-to-have
		}
	}

	async pollFootballScores() {
		const now = Date.now();
		const hasLiveFootball = this.allEvents.some((e) =>
			e.sport === 'football' &&
			new Date(e.time).getTime() <= now &&
			new Date(e.time).getTime() > now - 3 * SS_CONSTANTS.MS_PER_HOUR
		);
		if (!hasLiveFootball) return;

		const leagues = ['eng.1', 'esp.1', 'fifa.world'];
		const results = await Promise.all(leagues.map((league) =>
			fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard`)
				.then((r) => (r.ok ? r.json() : null))
				.catch(() => null)
		));

		for (const data of results) {
			if (!data) continue;
			for (const ev of data.events || []) {
				const comp = ev.competitions?.[0];
				if (!comp) continue;
				const state = comp.status?.type?.state; // pre, in, post
				if (state !== 'in' && state !== 'post') continue;

				const home = comp.competitors?.find((c) => c.homeAway === 'home');
				const away = comp.competitors?.find((c) => c.homeAway === 'away');
				if (!home || !away) continue;

				const homeName = home.team?.displayName || '';
				const awayName = away.team?.displayName || '';
				const matched = this.allEvents.find((e) =>
					e.sport === 'football' && e.homeTeam && e.awayTeam &&
					ssTeamMatch(e.homeTeam, homeName) && ssTeamMatch(e.awayTeam, awayName)
				);
				if (!matched) continue;

				this.liveScores[matched.id] = {
					home: parseInt(home.score, 10) || 0,
					away: parseInt(away.score, 10) || 0,
					clock: comp.status?.displayClock || '',
					state,
					detail: comp.status?.type?.shortDetail || '',
					homeName,
					awayName,
				};
			}
		}
	}

	async pollGolfScores() {
		const now = Date.now();
		const hasActiveGolf = this.allEvents.some((e) => {
			if (e.sport !== 'golf') return false;
			const start = new Date(e.time).getTime();
			const end = e.endTime ? new Date(e.endTime).getTime() : start + 4 * SS_CONSTANTS.MS_PER_DAY;
			return start <= now && now <= end;
		});
		if (!hasActiveGolf) return;

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
				state,
				round: ev?.status?.type?.detail || '',
				players: competitors.slice(0, 15).map((c, idx) => ({
					position: c.status?.position?.displayName || c.order || idx + 1,
					player: c.athlete?.displayName || c.athlete?.fullName || 'Unknown',
					score: typeof c.score === 'object' ? (c.score?.displayValue || 'E') : (c.score?.toString() || 'E'),
					today: c.linescores?.[c.linescores.length - 1]?.displayValue || '-',
					thru: c.status?.thru?.toString() || '-',
				})),
			};
		} catch {
			// ignore
		}
	}

	// ── Utilities ─────────────────────────────────────────────────────────────

	relativeTime(date) {
		const diffMs = date.getTime() - Date.now();
		const mins = Math.round(diffMs / SS_CONSTANTS.MS_PER_MINUTE);
		if (mins <= -240) return '';
		if (mins < 0) return 'pågår';
		if (mins < 60) return `om ${mins} min`;
		const hours = Math.round(mins / 60);
		if (hours < 24) return `om ${hours} t`;
		const days = Math.round(hours / 24);
		return `om ${days} d`;
	}

	_getTrackedGolferNames() {
		const names = new Set();
		for (const a of this.tracked?.athletes || []) {
			if (a.sport === 'golf' && a.name) names.add(a.name);
		}
		if (names.size === 0) names.add('Viktor Hovland');
		return names;
	}

	initTheme() {
		const stored = localStorage.getItem('ss-theme');
		if (stored) document.documentElement.dataset.theme = stored;
		const btn = document.getElementById('theme-toggle');
		if (!btn) return;
		btn.addEventListener('click', () => {
			const current = document.documentElement.dataset.theme
				|| (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
			const next = current === 'dark' ? 'light' : 'dark';
			document.documentElement.dataset.theme = next;
			localStorage.setItem('ss-theme', next);
		});
	}
}

const dashboard = new Dashboard();
window.dashboard = dashboard;
document.addEventListener('DOMContentLoaded', () => dashboard.init());
