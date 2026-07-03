// SportSync — a calm overview of the sport you follow.
// One question, answered quietly: what's on, when (Oslo), and where to watch.
// One list, grouped by day. No dashboard, no noise.
// Depends on: shared-constants.js, sport-config.js, asset-maps.js

class Dashboard {
	constructor() {
		this.allEvents = [];
		this.featured = null;
		this.tracked = null;
		this.meta = null;
		this.liveScores = {};
		this.liveLeaderboard = null;
		this._liveInterval = null;
		this._liveVisible = !document.hidden;
	}

	async init() {
		this.initTheme();
		this.renderDate();
		await this.loadData();
		this.render();
		this.startLivePolling();
		this.bindAiBadges();
		document.addEventListener('visibilitychange', () => {
			this._liveVisible = !document.hidden;
			if (this._liveVisible) this.pollLiveScores();
		});
	}

	async loadData() {
		const load = (f) => fetch(`data/${f}?t=${Date.now()}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
		const [events, featured, tracked, meta] = await Promise.all([
			load('events.json'), load('featured.json'), load('tracked.json'), load('meta.json'),
		]);
		this.allEvents = Array.isArray(events) ? events : [];
		this.allEvents.forEach((e, i) => { e.id = `${e.sport}|${e.title}|${e.time}|${i}`; });
		this.featured = featured;
		this.tracked = tracked;
		this.meta = meta;
	}

	render() {
		this.renderTodayLine();
		this.renderLive();
		this.renderAgenda();
		this.renderFollowed();
		this.renderFooter();
	}

	// ── Header ──────────────────────────────────────────────────────────────
	renderDate() {
		const el = document.getElementById('header-date');
		if (el) el.textContent = new Date().toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Oslo' });
	}

	/** One quiet editorial line under the date — the "nice extra", never a section. */
	renderTodayLine() {
		const el = document.getElementById('today-line');
		if (!el) return;
		const headline = this.featured?.blocks?.find((b) => b.type === 'headline')?.text;
		if (!headline) { el.hidden = true; return; }
		el.textContent = headline;
		el.hidden = false;
	}

	renderFooter() {
		const el = document.getElementById('footer-updated');
		if (!el) return;
		const updated = this.meta?.lastUpdated;
		if (!updated) return;
		const mins = Math.round((Date.now() - new Date(updated).getTime()) / SS_CONSTANTS.MS_PER_MINUTE);
		el.textContent = mins < 90 ? `Oppdatert for ${mins} min siden` : `Oppdatert ${new Date(updated).toLocaleDateString('nb-NO', { timeZone: 'Europe/Oslo' })}`;
	}

	// ── Helpers ─────────────────────────────────────────────────────────────
	osloTime(d) { return d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }); }
	osloDayKey(d) { return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Oslo' }); }
	sportName(e) {
		const id = normalizeClientSportId(e.sport);
		const cfg = SPORT_CONFIG.find((s) => s.id === id);
		return cfg ? cfg.name : e.sport;
	}
	isMustSee(e) { return !!(e.isFavorite || (e.importance || 0) >= 4 || (e.norwegian && e.norwegianPlayers?.length)); }

	eventTitle(e) {
		if (e.homeTeam && e.awayTeam) return `${escapeHtml(ssShortName(e.homeTeam))} – ${escapeHtml(ssShortName(e.awayTeam))}`;
		return escapeHtml(e.title);
	}

	/** Where to watch — quiet, honest. First 1–2 Norwegian channels; faint dash if unknown. */
	whereToWatch(e) {
		const streams = Array.isArray(e.streaming) ? e.streaming : [];
		if (streams.length === 0) return `<span class="ev-where unknown">–</span>`;
		const parts = streams.slice(0, 2).map((s) => {
			const p = escapeHtml(String(s.platform || s));
			return s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${p}</a>` : p;
		});
		return `<span class="ev-where">${parts.join(' · ')}</span>`;
	}

	// ── Live now (quiet line at the top) ─────────────────────────────────────
	renderLive() {
		const box = document.getElementById('live-now');
		if (!box) return;
		const rows = [];
		for (const [id, live] of Object.entries(this.liveScores)) {
			if (live.state !== 'in') continue;
			rows.push(`<div class="live-item"><span class="live-dot"></span><span>${escapeHtml(ssShortName(live.homeName))} <span class="live-score">${live.home}–${live.away}</span> ${escapeHtml(ssShortName(live.awayName))}</span><span class="live-meta">${escapeHtml(live.clock || '')}</span></div>`);
		}
		if (this.liveLeaderboard?.state === 'in' && this.liveLeaderboard.players?.length) {
			const p = this.liveLeaderboard.players[0];
			rows.push(`<div class="live-item"><span class="live-dot"></span><span>${escapeHtml(this.liveLeaderboard.name)}</span><span class="live-meta">${escapeHtml(p.player)} ${escapeHtml(p.score)}</span></div>`);
		}
		if (rows.length === 0) { box.hidden = true; return; }
		box.innerHTML = `<div class="live-label"><span class="live-dot"></span>Direkte nå</div>${rows.join('')}`;
		box.hidden = false;
	}

	// ── The agenda: one list, grouped by day ─────────────────────────────────
	renderAgenda() {
		const el = document.getElementById('agenda');
		if (!el) return;
		const now = Date.now();
		const start = now - 3 * SS_CONSTANTS.MS_PER_HOUR;
		const horizon = now + 14 * SS_CONSTANTS.MS_PER_DAY;
		const events = this.allEvents
			.filter((e) => isEventInWindow(e, start, horizon))
			.sort((a, b) => new Date(a.time) - new Date(b.time));

		if (events.length === 0) {
			el.innerHTML = `<p class="empty">Ingen kommende arrangementer akkurat nå.</p>`;
			return;
		}

		const todayKey = this.osloDayKey(new Date());
		const tomorrowKey = this.osloDayKey(new Date(now + SS_CONSTANTS.MS_PER_DAY));
		const groups = new Map();
		for (const e of events) {
			// Multi-day events that started earlier but are still running belong under "I dag",
			// not their (past) start day.
			let key = this.osloDayKey(new Date(e.time));
			if (key < todayKey && e.endTime && new Date(e.endTime).getTime() >= now) key = todayKey;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push(e);
		}

		let html = '';
		for (const [key, evs] of groups) {
			let name;
			if (key === todayKey) name = 'I dag';
			else if (key === tomorrowKey) name = 'I morgen';
			else name = new Date(evs[0].time).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Oslo' });
			html += `<section class="day${key === todayKey ? ' is-today' : ''}"><div class="day-name">${escapeHtml(name)}</div>${evs.map((e) => this.eventRow(e)).join('')}</section>`;
		}
		el.innerHTML = html;
	}

	eventRow(e) {
		const date = new Date(e.time);
		const live = this.liveScores[e.id];
		const sub = [this.sportName(e), e.tournament].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
		const where = live && live.state === 'in'
			? `<span class="ev-where ev-live">${live.home}–${live.away}</span>`
			: this.whereToWatch(e);
		const ai = e.source === 'ai-research'
			? ` <button class="ai-badge" data-event-id="${escapeHtml(e.id)}" aria-label="Kilde" style="font-size:11px;color:var(--fg-3);">ⓘ</button>`
			: '';
		return `<div class="ev${this.isMustSee(e) ? ' must' : ''}">
			<span class="ev-time">${escapeHtml(this.osloTime(date))}</span>
			<span class="ev-main"><span class="ev-title">${this.eventTitle(e)}${ai}</span>${sub ? `<span class="ev-sub">${escapeHtml(sub)}</span>` : ''}</span>
			${where}
		</div>`;
	}

	// ── "Hva vi følger" — one quiet disclosure at the bottom ──────────────────
	renderFollowed() {
		const wrap = document.getElementById('followed');
		const body = document.getElementById('followed-body');
		if (!wrap || !body) return;
		const t = this.tracked;
		if (!t || (!t.tournaments?.length && !t.leagues?.length && !t.athletes?.length)) { wrap.hidden = true; return; }
		const group = (label, items) => {
			if (!items?.length) return '';
			return `<div class="followed-group">${label}</div>` + items.map((i) =>
				`<div class="followed-item">${escapeHtml(i.name)}${i.reason ? ` <span class="why">— ${escapeHtml(i.reason)}</span>` : ''}</div>`
			).join('');
		};
		body.innerHTML = group('Turneringer', t.tournaments) + group('Ligaer', t.leagues) + group('Utøvere', t.athletes);
		wrap.hidden = false;
	}

	// ── AI provenance (hidden until asked) ───────────────────────────────────
	bindAiBadges() {
		document.body.addEventListener('click', (evt) => {
			const badge = evt.target.closest('.ai-badge');
			if (!badge) return;
			const e = this.allEvents.find((x) => x.id === badge.dataset.eventId);
			if (e) this.showAiModal(e);
		});
	}
	showAiModal(e) {
		document.querySelector('.modal-backdrop')?.remove();
		const links = (e.evidence || []).map((u) => `<a class="evidence-link" href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a>`).join('');
		const b = document.createElement('div');
		b.className = 'modal-backdrop';
		b.innerHTML = `<div class="modal"><button class="modal-close" aria-label="Lukk">✕</button><h3>${escapeHtml(e.title)}</h3><p style="font-size:13px;color:var(--fg-2);margin-bottom:8px;">Funnet av research-agenten · sikkerhet: ${escapeHtml(e.confidence || 'ukjent')}</p>${links || '<p style="font-size:13px;color:var(--fg-2);">Ingen kilder registrert.</p>'}</div>`;
		b.addEventListener('click', (ev) => { if (ev.target === b || ev.target.closest('.modal-close')) b.remove(); });
		document.body.appendChild(b);
	}

	// ── Live polling (ESPN, client-side) ─────────────────────────────────────
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
			this.renderAgenda();
		} catch { /* live scores are best-effort */ }
	}
	async pollFootballScores() {
		const now = Date.now();
		if (!this.allEvents.some((e) => e.sport === 'football' && new Date(e.time).getTime() <= now && new Date(e.time).getTime() > now - 3 * SS_CONSTANTS.MS_PER_HOUR)) return;
		const leagues = ['eng.1', 'esp.1', 'fifa.world'];
		const results = await Promise.all(leagues.map((l) => fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l}/scoreboard`).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
		for (const data of results) {
			for (const ev of data?.events || []) {
				const comp = ev.competitions?.[0];
				const state = comp?.status?.type?.state;
				if (state !== 'in' && state !== 'post') continue;
				const home = comp.competitors?.find((c) => c.homeAway === 'home');
				const away = comp.competitors?.find((c) => c.homeAway === 'away');
				if (!home || !away) continue;
				const homeName = home.team?.displayName || '', awayName = away.team?.displayName || '';
				const matched = this.allEvents.find((e) => e.sport === 'football' && e.homeTeam && e.awayTeam && ssTeamMatch(e.homeTeam, homeName) && ssTeamMatch(e.awayTeam, awayName));
				if (!matched) continue;
				this.liveScores[matched.id] = { home: parseInt(home.score, 10) || 0, away: parseInt(away.score, 10) || 0, clock: comp.status?.displayClock || '', state, homeName, awayName };
			}
		}
	}
	async pollGolfScores() {
		const now = Date.now();
		if (!this.allEvents.some((e) => { if (e.sport !== 'golf') return false; const s = new Date(e.time).getTime(); const end = e.endTime ? new Date(e.endTime).getTime() : s + 4 * SS_CONSTANTS.MS_PER_DAY; return s <= now && now <= end; })) return;
		try {
			const resp = await fetch('https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard');
			if (!resp.ok) return;
			const data = await resp.json();
			const ev = data.events?.[0], comp = ev?.competitions?.[0], state = ev?.status?.type?.state;
			if (!comp || state === 'pre') return;
			this.liveLeaderboard = {
				name: ev.name || '', state,
				players: (comp.competitors || []).slice(0, 5).map((c, i) => ({
					player: c.athlete?.displayName || c.athlete?.fullName || '—',
					score: typeof c.score === 'object' ? (c.score?.displayValue || 'E') : (c.score?.toString() || 'E'),
				})),
			};
		} catch { /* ignore */ }
	}

	// ── Theme ────────────────────────────────────────────────────────────────
	initTheme() {
		const stored = localStorage.getItem('ss-theme');
		if (stored) document.documentElement.dataset.theme = stored;
		document.getElementById('theme-toggle')?.addEventListener('click', () => {
			const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
			const next = cur === 'dark' ? 'light' : 'dark';
			document.documentElement.dataset.theme = next;
			localStorage.setItem('ss-theme', next);
		});
	}
}

const dashboard = new Dashboard();
window.dashboard = dashboard;
document.addEventListener('DOMContentLoaded', () => dashboard.init());
