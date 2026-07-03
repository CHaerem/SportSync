// SportSync — dashboard controller
// Goal-driven hierarchy: live now → dagens viktigste (must-see hero cards) →
// program (chronological today+tomorrow agenda, channel chip per row) →
// senere denne uka → demoted editorial brief → tracked surface.
// Channel info ("hvor kan jeg se det") is a first-class chip everywhere.
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
		this.bindDisclosure('brief-toggle', 'brief');
		this.bindDisclosure('tracked-toggle', 'tracked-body');
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
		this.renderHighlights();
		this.renderTimeline();
		this.renderLater();
		this.renderBrief();
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
		const label = document.getElementById('brief-toggle-label');
		if (label) label.textContent = `Redaksjonens ${modeLabel.toLowerCase()}`;
		section.hidden = false; // content stays collapsed until the disclosure is opened
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

	// ── Shared event helpers ────────────────────────────────────────────────────

	sportCfg(e) {
		const id = normalizeClientSportId(e.sport);
		return SPORT_CONFIG.find((s) => s.id === id) || { emoji: '🏆', name: e.sport, color: 'var(--accent)' };
	}

	/** Must-see = matches the goal's priority: favorite, high importance, or Norwegian participation. */
	isMustSee(e) {
		return !!(e.isFavorite || (e.importance || 0) >= 4 || (e.norwegian && e.norwegianPlayers?.length));
	}

	osloTime(date) {
		return date.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });
	}
	osloDayKey(date) {
		return date.toLocaleDateString('en-CA', { timeZone: 'Europe/Oslo' });
	}

	/** The "hvor kan jeg se det" component — consistent channel chips everywhere. */
	channelChips(e, { big = false } = {}) {
		const streams = Array.isArray(e.streaming) ? e.streaming : [];
		if (streams.length === 0) {
			return `<span class="chip unknown${big ? ' big' : ''}">Kanal ukjent</span>`;
		}
		return streams.slice(0, 3).map((s) => {
			const platform = escapeHtml(String(s.platform || s));
			const inner = `<span class="tv">▮</span>${platform}`;
			return s.url
				? `<a class="chip${big ? ' big' : ''}" href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${inner}</a>`
				: `<span class="chip${big ? ' big' : ''}">${inner}</span>`;
		}).join('');
	}

	badges(e) {
		const b = [];
		if (e.isFavorite) b.push('<span class="fav-star" title="Favoritt">★</span>');
		if (e.norwegian || e.norwegianPlayers?.length) b.push('<span class="nor-flag" title="Norsk deltakelse">🇳🇴</span>');
		if (e.source === 'ai-research') {
			b.push(`<button class="ai-badge" data-event-id="${escapeHtml(e.id)}" title="Funnet av AI-research — klikk for kilder">AI</button>`);
		}
		return b.join(' ');
	}

	/** Match title: teams+logos (with live/final score if present) or plain title. */
	matchTitle(e, { logoClass = 'team-logo' } = {}) {
		if (e.homeTeam && e.awayTeam) {
			const hLogo = getTeamLogo(e.homeTeam);
			const aLogo = getTeamLogo(e.awayTeam);
			const live = this.liveScores[e.id];
			const mid = live && live.state !== 'pre'
				? `<span class="score">${live.home}–${live.away}</span>`
				: 'mot';
			return `${hLogo ? `<img class="${logoClass}" src="${hLogo}" alt="" loading="lazy">` : ''}${escapeHtml(ssShortName(e.homeTeam))} ${mid} ${aLogo ? `<img class="${logoClass}" src="${aLogo}" alt="" loading="lazy">` : ''}${escapeHtml(ssShortName(e.awayTeam))}`;
		}
		return escapeHtml(e.title);
	}

	// ── Dagens viktigste (enlarged must-see cards) ──────────────────────────────

	renderHighlights() {
		const section = document.getElementById('highlights-section');
		const wrap = document.getElementById('highlights');
		if (!section || !wrap) return;

		const now = Date.now();
		const horizon = now + 36 * SS_CONSTANTS.MS_PER_HOUR; // today + into tomorrow
		const picks = this.allEvents
			.filter((e) => isEventInWindow(e, now - 2 * SS_CONSTANTS.MS_PER_HOUR, horizon))
			.filter((e) => this.isMustSee(e))
			.sort((a, b) => new Date(a.time) - new Date(b.time))
			.slice(0, 3);

		this._highlightIds = new Set(picks.map((e) => e.id));

		if (picks.length === 0) { section.hidden = true; return; }
		wrap.innerHTML = picks.map((e) => this.heroCard(e)).join('');
		section.hidden = false;
	}

	heroCard(e) {
		const cfg = this.sportCfg(e);
		const date = new Date(e.time);
		const todayKey = this.osloDayKey(new Date());
		const isToday = this.osloDayKey(date) === todayKey;
		const dayStr = isToday ? '' : `<span class="hero-day">${escapeHtml(date.toLocaleDateString('nb-NO', { weekday: 'long', timeZone: 'Europe/Oslo' }))}</span>`;
		const rel = this.relativeTime(date);
		const meta = [];
		if (e.venue && e.venue !== 'TBD') meta.push(escapeHtml(e.venue));
		if (e.norwegianPlayers?.length) meta.push(escapeHtml(e.norwegianPlayers.slice(0, 3).map((p) => p.name || p).join(', ')));
		const must = (e.importance || 0) >= 4;
		return `<article class="hero-card${must ? ' must' : ''}" style="--sport-color:${cfg.color}">
			<div class="hero-top"><span class="sport-dot"></span><span class="sport-name">${cfg.emoji} ${escapeHtml(cfg.name)} · ${escapeHtml(e.tournament || '')}</span><span class="spacer"></span>${this.badges(e)}</div>
			<div class="hero-when"><span class="hero-time">${escapeHtml(this.osloTime(date))}</span>${dayStr}${rel ? `<span class="hero-rel">${escapeHtml(rel)}</span>` : ''}</div>
			<div class="hero-title">${this.matchTitle(e, { logoClass: 'team-logo' })}</div>
			${meta.length ? `<div class="hero-meta">${meta.join('<span class="dot-sep">·</span>')}</div>` : ''}
			<div class="chips">${this.channelChips(e, { big: true })}</div>
		</article>`;
	}

	// ── Program (chronological agenda: today + tomorrow) ────────────────────────

	renderTimeline() {
		const container = document.getElementById('timeline');
		if (!container) return;
		const now = Date.now();
		const start = now - 4 * SS_CONSTANTS.MS_PER_HOUR;
		const horizon = now + 2 * SS_CONSTANTS.MS_PER_DAY;
		const highlightIds = this._highlightIds || new Set();

		const events = this.allEvents
			.filter((e) => isEventInWindow(e, start, horizon))
			.filter((e) => !highlightIds.has(e.id))
			.sort((a, b) => new Date(a.time) - new Date(b.time));

		if (events.length === 0 && highlightIds.size === 0) {
			container.innerHTML = `<div class="empty-state">Ingen arrangementer i dag eller i morgen.</div>`;
			return;
		}
		if (events.length === 0) {
			container.innerHTML = `<div class="empty-state">Alt dagens er løftet fram over. Se «Senere denne uka».</div>`;
			return;
		}

		const todayKey = this.osloDayKey(new Date());
		const tomorrowKey = this.osloDayKey(new Date(Date.now() + SS_CONSTANTS.MS_PER_DAY));
		const groups = new Map();
		for (const e of events) {
			const key = this.osloDayKey(new Date(e.time));
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push(e);
		}

		let html = '';
		for (const [key, evs] of groups) {
			let label;
			if (key === todayKey) label = 'I dag';
			else if (key === tomorrowKey) label = 'I morgen';
			else label = new Date(evs[0].time).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Oslo' });
			html += `<div class="day-group"><div class="day-label">${escapeHtml(label)}</div>${evs.map((e) => this.timelineRow(e)).join('')}</div>`;
		}
		container.innerHTML = html;
	}

	timelineRow(e) {
		const cfg = this.sportCfg(e);
		const date = new Date(e.time);
		const rel = this.relativeTime(date);
		const live = this.liveScores[e.id];
		const isLive = live && live.state === 'in';
		const relShort = rel.replace(/^om /, ''); // "om 54 min" → "54 min" to fit the time column
		return `<div class="tl-row${isLive ? ' is-live' : ''}" style="--sport-color:${cfg.color}">
			<div class="tl-time">${escapeHtml(this.osloTime(date))}${rel ? `<span class="tl-rel">${escapeHtml(isLive ? 'pågår' : relShort)}</span>` : ''}</div>
			<div class="tl-body">
				<div class="tl-head"><span class="sport-dot"></span><span class="tl-title">${this.matchTitle(e, { logoClass: 'team-logo' })}</span> ${this.badges(e)}</div>
				<div class="tl-tournament">${escapeHtml([cfg.name, e.tournament].filter(Boolean).join(' · '))}</div>
				<div class="chips" style="margin-top:6px;">${this.channelChips(e)}</div>
			</div>
		</div>`;
	}

	// ── Senere denne uka (tight list, grouped by weekday) ───────────────────────

	renderLater() {
		const section = document.getElementById('later-section');
		const container = document.getElementById('later');
		if (!section || !container) return;
		const now = Date.now();
		const start = now + 2 * SS_CONSTANTS.MS_PER_DAY;
		const horizon = now + 7 * SS_CONSTANTS.MS_PER_DAY;
		const events = this.allEvents
			.filter((e) => isEventInWindow(e, start, horizon))
			.sort((a, b) => new Date(a.time) - new Date(b.time));

		if (events.length === 0) { section.hidden = true; return; }

		const groups = new Map();
		for (const e of events) {
			const key = this.osloDayKey(new Date(e.time));
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push(e);
		}

		let html = '';
		for (const [, evs] of groups) {
			const label = new Date(evs[0].time).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' });
			html += `<div class="day-group"><div class="day-label">${escapeHtml(label)}</div>${evs.map((e) => this.laterRow(e)).join('')}</div>`;
		}
		container.innerHTML = html;
		section.hidden = false;
	}

	laterRow(e) {
		const cfg = this.sportCfg(e);
		const date = new Date(e.time);
		const streams = Array.isArray(e.streaming) ? e.streaming : [];
		const chan = streams.length ? escapeHtml(String(streams[0].platform || streams[0])) : '';
		const titleText = e.homeTeam && e.awayTeam
			? `${escapeHtml(ssShortName(e.homeTeam))} – ${escapeHtml(ssShortName(e.awayTeam))}`
			: escapeHtml(e.title);
		return `<div class="later-row" style="--sport-color:${cfg.color}">
			<span class="later-time">${escapeHtml(this.osloTime(date))}</span>
			<span class="later-title"><span class="sport-dot" title="${escapeHtml(cfg.name)}"></span><span class="t">${titleText}</span></span>
			<span class="later-chip">${chan}</span>
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

	bindDisclosure(toggleId, bodyId) {
		const btn = document.getElementById(toggleId);
		const body = document.getElementById(bodyId);
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
			this.renderHighlights();
			this.renderTimeline();
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
