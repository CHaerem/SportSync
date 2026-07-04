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
		this.bindAgendaExpand();
		document.addEventListener('visibilitychange', () => {
			this._liveVisible = !document.hidden;
			if (this._liveVisible) this.pollLiveScores();
		});
	}

	async loadData() {
		const load = (f) => fetch(`data/${f}?t=${Date.now()}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
		const [events, featured, standings, results, tracked, interests, meta] = await Promise.all([
			load('events.json'), load('featured.json'), load('standings.json'), load('recent-results.json'), load('tracked.json'), load('interests.json'), load('meta.json'),
		]);
		this.allEvents = Array.isArray(events) ? events : [];
		this.allEvents.forEach((e, i) => { e.id = `${e.sport}|${e.title}|${e.time}|${i}`; });
		this.featured = featured;
		this.standings = standings;
		this.recentResults = results;
		this.tracked = tracked;
		this.interests = interests;
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
	sportCfg(e) {
		const id = normalizeClientSportId(e.sport);
		return SPORT_CONFIG.find((s) => s.id === id) || { emoji: '🏆', name: e.sport, color: 'var(--accent)' };
	}
	isMustSee(e) { return !!(e.isFavorite || (e.importance || 0) >= 4 || (e.norwegian && e.norwegianPlayers?.length)); }

	/** Leading visual anchor: sport icon in a faint sport-coloured circle. */
	sportBadge(e) {
		const cfg = this.sportCfg(e);
		return `<span class="ev-badge" style="--sport-color:${cfg.color}" title="${escapeHtml(cfg.name)}">${cfg.emoji}</span>`;
	}

	/** Visual mark for a team: club crest if we have one, else a national flag, else nothing. */
	teamMark(name) {
		const url = typeof getTeamLogo === 'function' ? getTeamLogo(name) : null;
		if (url) return `<img class="ev-logo" src="${url}" alt="" loading="lazy" onerror="this.remove()">`;
		const flag = typeof getNationFlag === 'function' ? getNationFlag(name) : null;
		if (flag) return `<span class="ev-flag" aria-hidden="true">${flag}</span>`;
		return '';
	}

	eventTitle(e) {
		if (e.homeTeam && e.awayTeam) {
			return `${this.teamMark(e.homeTeam)}${escapeHtml(ssShortName(e.homeTeam))} – ${this.teamMark(e.awayTeam)}${escapeHtml(ssShortName(e.awayTeam))}`;
		}
		return escapeHtml(e.title);
	}

	/** Where to watch — quiet, honest. First 1–2 Norwegian channels; faint dash if unknown. */
	whereToWatch(e) {
		const streams = Array.isArray(e.streaming) ? e.streaming : [];
		if (streams.length === 0) return `<span class="ev-where unknown">–</span>`;
		const s = streams[0];
		const p = escapeHtml(String(s.platform || s));
		const extra = streams.length > 1 ? `<span class="ev-where-more">+${streams.length - 1}</span>` : '';
		const inner = s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${p}</a>` : p;
		return `<span class="ev-where">${inner}${extra}</span>`;
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

		this._eventById = new Map(this.allEvents.map((e) => [e.id, e]));
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
		const where = live && live.state === 'in'
			? `<span class="ev-where ev-live">${live.home}–${live.away}</span>`
			: this.whereToWatch(e);
		const expandable = this.hasDetail(e);
		const caret = expandable ? `<span class="ev-caret" aria-hidden="true">›</span>` : `<span class="ev-caret"></span>`;
		const attrs = expandable
			? ` role="button" tabindex="0" aria-expanded="false" data-event-id="${escapeHtml(e.id)}"`
			: '';
		const round = e.round ? `<span class="ev-round">${escapeHtml(e.round)}</span>` : '';
		return `<div class="ev-wrap"><div class="ev${this.isMustSee(e) ? ' must' : ''}${expandable ? ' expandable' : ''}"${attrs}>
			${this.sportBadge(e)}
			<span class="ev-time">${escapeHtml(this.osloTime(date))}</span>
			<span class="ev-main"><span class="ev-title">${this.eventTitle(e)}</span>${round}</span>
			${where}
			${caret}
		</div><div class="ev-detail" hidden></div></div>`;
	}

	// ── Progressive disclosure: extra context on tap (calm — hidden by default) ──

	/** True only when there's genuinely more to show — flat rows stay non-interactive. */
	hasDetail(e) {
		return !!(
			this.footballStanding(e) ||
			this.finishedResult(e) ||
			this.golfContext(e) ||
			(e.venue && e.venue !== 'TBD') ||
			e.summary ||
			e.norwegianPlayers?.length ||
			(Array.isArray(e.streaming) && e.streaming.length > 1) ||
			(e.source === 'ai-research' && e.evidence?.length)
		);
	}

	eventDetail(e) {
		const rows = [];
		const add = (k, v) => { if (v) rows.push(`<div class="d-row"><span class="d-k">${k}</span><span class="d-v">${v}</span></div>`); };

		const result = this.finishedResult(e);
		if (result) add('Resultat', result);
		add('Tabell', this.footballStanding(e));
		add('Ledende', this.golfContext(e));
		if (e.venue && e.venue !== 'TBD') add('Arena', escapeHtml(e.venue));
		if (e.norwegianPlayers?.length) add('Norske', escapeHtml(e.norwegianPlayers.map((p) => p.name || p).join(', ')));
		if (e.summary) add('Om', escapeHtml(e.summary));

		const streams = Array.isArray(e.streaming) ? e.streaming : [];
		if (streams.length) {
			const chans = streams.map((s) => {
				const p = escapeHtml(String(s.platform || s));
				return s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${p}</a>` : p;
			}).join(' · ');
			add('Se på', chans);
		}
		if (e.source === 'ai-research' && e.evidence?.length) {
			const links = e.evidence.map((u, i) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">kilde ${i + 1}</a>`).join(' · ');
			add('Funnet av AI', `${links} · sikkerhet: ${escapeHtml(e.confidence || 'ukjent')}`);
		}
		return rows.join('');
	}

	footballStanding(e) {
		if (e.sport !== 'football' || !e.homeTeam || !e.awayTeam) return '';
		const tables = this.standings?.football;
		if (!tables) return '';
		const tour = (e.tournament || '').toLowerCase();
		const table = tour.includes('la liga') || tour.includes('copa') ? tables.laLiga : tables.premierLeague;
		if (!Array.isArray(table) || table.length === 0) return '';
		const look = (name) => {
			const n = name.toLowerCase();
			const row = table.find((t) => t.team.toLowerCase().includes(n) || n.includes(t.team.toLowerCase()));
			return row ? `${escapeHtml(ssShortName(row.team))} ${row.position}. (${row.points})` : null;
		};
		const h = look(e.homeTeam), a = look(e.awayTeam);
		return h && a ? `${h} · ${a}` : '';
	}

	finishedResult(e) {
		if (!e.homeTeam || !e.awayTeam) return '';
		const fb = this.recentResults?.football;
		if (!Array.isArray(fb)) return '';
		const hn = e.homeTeam.toLowerCase(), an = e.awayTeam.toLowerCase();
		const m = fb.find((r) => {
			const rh = (r.homeTeam || '').toLowerCase(), ra = (r.awayTeam || '').toLowerCase();
			return (rh.includes(hn) || hn.includes(rh)) && (ra.includes(an) || an.includes(ra)) && r.homeScore != null;
		});
		return m ? `${escapeHtml(ssShortName(m.homeTeam))} ${m.homeScore}–${m.awayScore} ${escapeHtml(ssShortName(m.awayTeam))}` : '';
	}

	golfContext(e) {
		if (e.sport !== 'golf') return '';
		const tour = this.standings?.golf?.pga || this.standings?.golf?.dpWorld;
		const leader = tour?.leaderboard?.[0];
		return leader ? `${escapeHtml(leader.player)} (${escapeHtml(leader.score)})` : '';
	}

	bindAgendaExpand() {
		const agenda = document.getElementById('agenda');
		if (!agenda) return;
		const toggle = (row) => {
			const id = row.dataset.eventId;
			const e = this._eventById?.get(id);
			const detail = row.parentElement.querySelector('.ev-detail');
			if (!e || !detail) return;
			const open = row.getAttribute('aria-expanded') === 'true';
			if (!open && !detail.innerHTML) detail.innerHTML = this.eventDetail(e);
			row.setAttribute('aria-expanded', String(!open));
			detail.hidden = open;
		};
		agenda.addEventListener('click', (evt) => {
			const link = evt.target.closest('a');
			if (link) return; // let channel/source links work normally
			const row = evt.target.closest('.ev.expandable');
			if (row) toggle(row);
		});
		agenda.addEventListener('keydown', (evt) => {
			if (evt.key !== 'Enter' && evt.key !== ' ') return;
			const row = evt.target.closest('.ev.expandable');
			if (row) { evt.preventDefault(); toggle(row); }
		});
	}

	// ── "Hva vi følger" — one quiet disclosure at the bottom ──────────────────
	renderFollowed() {
		const wrap = document.getElementById('followed');
		const body = document.getElementById('followed-body');
		if (!wrap || !body) return;
		const t = this.tracked;
		const i = this.interests;
		const hasTracked = t && (t.tournaments?.length || t.leagues?.length || t.athletes?.length);
		const hasInterests = i && (i.alwaysTrack || i.interests);
		if (!hasTracked && !hasInterests) { wrap.hidden = true; return; }

		// Layer 1 — DU FØLGER: what you asked for (interests.json, user-owned)
		const chips = (items) => (items || []).length
			? `<div class="chips-row">${items.map((x) => `<span class="chip-follow">${escapeHtml(x)}</span>`).join('')}</div>` : '';
		let du = '';
		if (hasInterests) {
			const at = i.alwaysTrack || {};
			du += `<div class="followed-layer"><div class="followed-head">Du følger</div>`;
			du += chips(at.athletes);
			du += chips(at.teams);
			du += chips(at.tournaments);
			if (Array.isArray(i.interests) && i.interests.length) {
				du += `<div class="followed-note">${i.interests.map((s) => escapeHtml(s)).join(' · ')}</div>`;
			}
			du += `<div class="followed-hint">Vil du følge noe mer? Si det til Claude, så oppdateres denne lista.</div></div>`;
		}

		// Layer 2 — AI HAR FUNNET: what the research agent discovered (tracked.json)
		const group = (label, items) => {
			if (!items?.length) return '';
			return `<div class="followed-group">${label}</div>` + items.map((x) =>
				`<div class="followed-item">${escapeHtml(x.name)}${x.reason ? ` <span class="why">— ${escapeHtml(x.reason)}</span>` : ''}${x.expires ? ` <span class="until">· ut ${escapeHtml(x.expires.slice(0, 10))}</span>` : ''}</div>`
			).join('');
		};
		let ai = '';
		if (hasTracked) {
			ai = `<div class="followed-layer"><div class="followed-head">AI har funnet</div>`
				+ group('Turneringer', t.tournaments) + group('Ligaer', t.leagues) + group('Utøvere', t.athletes)
				+ `</div>`;
		}

		body.innerHTML = du + ai;
		wrap.hidden = false;
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
