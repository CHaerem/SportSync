// Zenji — a calm overview of the sport you follow.
// One question, answered quietly: what's on, when (Oslo), and where to watch.
// One list, grouped by day. No dashboard, no noise.
//
// The Dashboard class is split across files that share ONE prototype (no build
// step — the window-global pattern, like shared-constants.js). This file owns the
// core: lifecycle (init/loadData/render), the hero headline, the row helpers, and
// the agenda itself. The other seams extend window.Dashboard.prototype and MUST
// load after this file:
//   js/live.js     — live-now line + ESPN live polling
//   js/detail.js   — progressive-disclosure event detail (tap to expand)
//   js/followed.js — "Dine neste" + "Hva vi følger" index
//   js/chrome.js   — shell chrome (clock, date, footer, AI-budget, install hint)
// Depends on: shared-constants.js.

class Dashboard {
	constructor() {
		this.allEvents = [];
		this.featured = null;
		this.tracked = null;
		this.meta = null;
		this.liveScores = {};
		this.liveLeaderboard = null;
		this.liveF1 = null;
		this._liveInterval = null;
		this._liveVisible = !document.hidden;
	}

	async init() {
		// Theme is owned by js/theme.js (shared across pages).
		this.renderDate();
		this.startClock();
		await this.loadData();
		this.render();
		this._lastRefresh = Date.now();
		this.startLivePolling();
		this.bindAgendaExpand();
		this.bindFollowed();
		this.bindLive();
		this.maybeShowInstallHint();
		document.addEventListener('visibilitychange', () => {
			this._liveVisible = !document.hidden;
			if (this._liveVisible) this.onResume();
		});
	}

	/** Brought back to the foreground. On iOS a home-screen PWA resumes the old
	 *  page instead of reloading, so data is fetched only once (in init) and the
	 *  board would keep showing yesterday. Re-pull data + re-stamp the date so a
	 *  reopen always reflects today. Throttled so quick tab-switches don't refetch. */
	async onResume() {
		const now = Date.now();
		if (this._lastRefresh && now - this._lastRefresh < 30 * 1000) {
			this.pollLiveScores();
			return;
		}
		this._lastRefresh = now;
		this.renderDate();   // the day may have rolled over since it was opened
		try { await this.loadData(); } catch { /* keep showing what we have */ }
		this.render();
		this.pollLiveScores();
	}

	async loadData() {
		const load = (f) => fetch(`data/${f}?t=${Date.now()}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
		const [events, featured, standings, results, tracked, interests, meta, usage] = await Promise.all([
			load('events.json'), load('featured.json'), load('standings.json'), load('recent-results.json'), load('tracked.json'), load('interests.json'), load('meta.json'), load('usage-state.json'),
		]);
		this.allEvents = Array.isArray(events) ? events : [];
		// Prefer the server's stable id (build-events.js, WP-02) — a hash of
		// sport|title|time that survives re-renders/reorders. Fall back to the
		// old array-index synthesis only for a payload from before this field
		// existed (backward-compatible until the next rebuild republishes
		// events.json with ids). The live-score overlay (this.liveScores) keys
		// on this same e.id, so either source stays internally consistent.
		this.allEvents.forEach((e, i) => { if (!e.id) e.id = `${e.sport}|${e.title}|${e.time}|${i}`; });
		this.featured = featured;
		this.standings = standings;
		this.recentResults = results;
		this.tracked = tracked;
		this.interests = interests;
		this.meta = meta;
		this.usage = usage;
	}

	render() {
		this.renderTodayLine();
		this.renderLive();
		this.renderNextUp();
		this.renderAgenda();
		this.renderFollowed();
		this.renderFooter();
		this.renderUsage();
	}

	// ── Hero (the editorial brief) ────────────────────────────────────────────
	/** The hero headline — the editorial brief, set large in the display serif. */
	renderTodayLine() {
		const el = document.getElementById('hero-headline');
		if (!el) return;
		const headline = this.featured?.blocks?.find((b) => b.type === 'headline')?.text || this.heroFallback();
		el.innerHTML = this.emphasize(escapeHtml(headline));
	}

	/** Calm fallback when the editorial agent hasn't written a headline yet. */
	heroFallback() {
		return 'Sporten du følger — når det skjer, og hvor du ser det.';
	}

	/** Italic-accent the first Norwegian/tracked keyword — one editorial pop in the deck. */
	emphasize(safe) {
		const names = ['Norge', 'Norway', ...trackedTerms(this.interests?.alwaysTrack?.athletes), ...trackedTerms(this.interests?.alwaysTrack?.teams)];
		const lower = safe.toLowerCase();
		let best = -1, bestLen = 0;
		for (const n of names) {
			const i = lower.indexOf(n.toLowerCase());
			if (i >= 0 && (best === -1 || i < best)) { best = i; bestLen = n.length; }
		}
		if (best === -1) return safe;
		return safe.slice(0, best) + '<span class="em">' + safe.slice(best, best + bestLen) + '</span>' + safe.slice(best + bestLen);
	}

	// ── Helpers ─────────────────────────────────────────────────────────────
	osloTime(d) { return d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }); }
	osloDayKey(d) { return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Oslo' }); }
	isMustSee(e) {
		if (e.isSeries) return false;
		if (e.isFavorite || (e.importance || 0) >= 4 || (e.norwegian && e.norwegianPlayers?.length)) return true;
		// Your people playing is the whole point: Norway national team, a tracked
		// club, or a tracked athlete on the card → give it the accent.
		const teams = [e.homeTeam || '', e.awayTeam || ''].map((t) => t.toLowerCase());
		if (teams.some((t) => /\bnorway\b|\bnorge\b/.test(t))) return true;
		const tracked = trackedTerms(this.interests?.alwaysTrack?.teams).map((t) => t.toLowerCase());
		if (teams.some((t) => t && tracked.some((tt) => t.includes(tt)))) return true;
		const hay = `${e.title || ''} ${(e.norwegianPlayers || []).map((p) => p.name || p).join(' ')}`.toLowerCase();
		const athletes = trackedTerms(this.interests?.alwaysTrack?.athletes).map((a) => a.toLowerCase());
		return athletes.some((a) => a && hay.includes(a));
	}

	/** Reminder lead time (min) from interests.notify — the VALARM offset. */
	notifyLead() {
		const m = Number(this.interests?.notify?.leadMinutes);
		return m > 0 ? Math.round(m) : 30;
	}

	/** The time cell: a HH:MM for a single-day event, or a date window
	 *  ("13.–20. juli") that REPLACES the clock for a multi-day event — never
	 *  both, and never duplicated in the title. */
	timeLabel(e) {
		const start = new Date(e.time);
		if (e.endTime) {
			const end = new Date(e.endTime);
			if (this.osloDayKey(end) > this.osloDayKey(start)) {
				// nb-NO already renders the day with a trailing period ("15."), so
				// strip it and add exactly one — never "15.." (works either way).
				const day = (d) => d.toLocaleDateString('nb-NO', { day: 'numeric', timeZone: 'Europe/Oslo' }).replace(/\.$/, '');
				const mon = (d) => d.toLocaleDateString('nb-NO', { month: 'long', timeZone: 'Europe/Oslo' });
				return mon(start) === mon(end)
					? `${day(start)}.–${day(end)}. ${mon(end)}`
					: `${day(start)}. ${mon(start)}–${day(end)}. ${mon(end)}`;
			}
		}
		return this.osloTime(start);
	}

	eventTitle(e) {
		if (e.homeTeam && e.awayTeam) {
			return `${escapeHtml(ssShortName(e.homeTeam))} – ${escapeHtml(ssShortName(e.awayTeam))}`;
		}
		return escapeHtml(e.title);
	}

	/** The one muted meta line under a title: tournament · round · where-to-watch
	 *  (or, when the game is off/over/live, the status/result/score instead of a
	 *  channel). Parts are joined by a quiet middot. */
	eventMeta(e, trailing) {
		const parts = [];
		const title = (e.homeTeam && e.awayTeam) ? '' : (e.title || '');
		if (e.tournament && e.tournament !== title) parts.push(escapeHtml(e.tournament));
		if (e.round) parts.push(`<span class="ev-round">${escapeHtml(e.round)}</span>`);
		if (trailing) parts.push(trailing);
		if (!parts.length) return '';
		return `<span class="ev-meta">${parts.join('<span class="ev-sep"> · </span>')}</span>`;
	}

	/** A channel is tappable when it has a URL — but a TENTATIVE (shared-rights)
	 *  entry only links to a tvkampen match GUIDE, never to one broadcaster (which
	 *  would mislead when it might be the other). */
	streamLink(s) {
		return !!(s && s.url && (!s.tentative || /tvkampen\.com/.test(s.url)));
	}

	/** Where to watch — quiet, honest. First 1–2 Norwegian channels; faint dash if unknown. */
	whereToWatch(e) {
		const streams = Array.isArray(e.streaming) ? e.streaming : [];
		if (streams.length === 0) return `<span class="ev-where unknown">–</span>`;
		const s = streams[0];
		const p = escapeHtml(String(s.platform || s));
		const extra = streams.length > 1 ? `<span class="ev-where-more">+${streams.length - 1}</span>` : '';
		// Tentative (shared rights, exact channel not yet confirmed) → plain text,
		// no link — linking to one broadcaster when it may be the other misleads.
		const inner = this.streamLink(s) ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${p}</a>` : p;
		const cls = s.tentative ? 'ev-where tentative' : 'ev-where';
		return `<span class="${cls}">${inner}${extra}</span>`;
	}

	// ── The agenda: one list, grouped by day ─────────────────────────────────
	renderAgenda() {
		const el = document.getElementById('agenda');
		if (!el) return;
		const now = Date.now();
		const start = now - 3 * SS_CONSTANTS.MS_PER_HOUR;
		const maxHorizon = now + 14 * SS_CONSTANTS.MS_PER_DAY;
		// Collapse multi-stage races (e.g. Tour de France) into ONE expandable row
		// so 20+ near-identical "Etappe N" rows don't drown the rest of the week.
		const items = this.collapseSeries(
			this.allEvents.filter((e) => isEventInWindow(e, start, maxHorizon)),
			now
		).sort((a, b) => new Date(a.time) - new Date(b.time));

		// Default to a calm 7-day horizon; a quiet "Vis mer" reveals the full 14.
		const cut = now + (this._fullHorizon ? 14 : 7) * SS_CONSTANTS.MS_PER_DAY;
		const shown = this._fullHorizon ? items : items.filter((e) => isEventInWindow(e, start, cut));
		const hasMore = items.length > shown.length;

		this._eventById = new Map(this.allEvents.map((e) => [e.id, e]));
		for (const it of items) if (it.isSeries) this._eventById.set(it.id, it);

		if (shown.length === 0) {
			el.innerHTML = `<p class="empty">Ingen kommende arrangementer akkurat nå.</p>`;
			return;
		}

		const todayKey = this.osloDayKey(new Date());
		const tomorrowKey = this.osloDayKey(new Date(now + SS_CONSTANTS.MS_PER_DAY));
		const groups = new Map();
		for (const e of shown) {
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
		if (hasMore) html += `<button type="button" class="agenda-more">Vis resten av de neste to ukene</button>`;
		el.innerHTML = html;
		// Play the entrance reveal ONCE on first load — not on every live-poll
		// re-render (which would re-flash the whole agenda each minute).
		if (!this._revealed) { el.classList.add('reveal'); this._revealed = true; }
		else { el.classList.remove('reveal'); }
	}

	/** Fold same-tournament stage races (cycling "Etappe N", etc.) into one series item. */
	collapseSeries(events, now) {
		const STAGE_RE = /\betappe\b|\bstage\s*\d/i;
		const groups = new Map();
		const out = [];
		for (const e of events) {
			if (STAGE_RE.test(e.title || '')) {
				const key = `${e.sport}||${e.tournament}`;
				(groups.get(key) || groups.set(key, []).get(key)).push(e);
			} else out.push(e);
		}
		for (const stages of groups.values()) {
			if (stages.length < 4) { out.push(...stages); continue; } // too few — keep as normal rows
			stages.sort((a, b) => new Date(a.time) - new Date(b.time));
			const upcoming = stages.find((s) => (s.endTime ? Date.parse(s.endTime) : Date.parse(s.time)) >= now);
			const next = upcoming || stages[stages.length - 1];
			const s0 = stages[0];
			out.push({
				isSeries: true,
				id: `series|${s0.sport}|${s0.tournament}`,
				sport: s0.sport,
				tournament: s0.tournament,
				title: s0.tournament,
				time: next.time,
				endTime: stages[stages.length - 1].endTime || stages[stages.length - 1].time,
				streaming: next.streaming || [],
				stages,
				nextStage: next,
			});
		}
		return out;
	}

	/** A cancelled/postponed match stays on the board, clearly labelled — it must
	 *  never silently vanish (the same failure as a live match dropping off).
	 *  Returns the Norwegian label or null. */
	statusLabel(e) {
		const s = String(e.status || '').toLowerCase();
		if (s === 'cancelled' || s === 'canceled') return 'Avlyst';
		if (s === 'postponed') return 'Utsatt';
		return null;
	}

	/** Is this event over? Returns { score } ("2–1", event-oriented) or { score: null }
	 *  (finished, score unknown), or null (not finished). A finished match stays on
	 *  the board briefly showing its result — never a "watch here" channel. */
	finishedInfo(e) {
		const live = this.liveScores[e.id];
		if (live && live.state === 'post') return { score: `${live.home}–${live.away}` };
		const score = this.finishedScore(e);
		if (score) return { score };
		// Time fallback only where the end is boundable: an explicit endTime, or a
		// football fixture (~2.5h). Never guess "finished" for open-ended entries.
		const start = new Date(e.time).getTime();
		if (!Number.isFinite(start)) return null;
		let end = null;
		if (e.endTime) end = new Date(e.endTime).getTime();
		else if (e.sport === 'football') end = start + 2.5 * SS_CONSTANTS.MS_PER_HOUR;
		if (end != null && Date.now() > end) return { score: null };
		return null;
	}

	/** Event-oriented final score ("2–1") from recent-results, or null. */
	finishedScore(e) {
		if (!e.homeTeam || !e.awayTeam) return null;
		const fb = this.recentResults?.football;
		if (!Array.isArray(fb)) return null;
		const hn = e.homeTeam.toLowerCase(), an = e.awayTeam.toLowerCase();
		const m = fb.find((r) => {
			const rh = (r.homeTeam || '').toLowerCase(), ra = (r.awayTeam || '').toLowerCase();
			return (rh.includes(hn) || hn.includes(rh)) && (ra.includes(an) || an.includes(ra)) && r.homeScore != null;
		});
		return m ? `${m.homeScore}–${m.awayScore}` : null;
	}

	/** The amber must-see dot, left of the time — or an empty cell that holds the
	 *  column so titles stay aligned. The dot is the whole must-see language. */
	dotCell(on) { return on ? '<span class="ev-dot" aria-hidden="true"></span>' : '<span></span>'; }

	/** The ⓘ provenance glyph — mono, dempet, ONLY on AI-research rows. Every
	 *  other row keeps an empty cell (tappability is signalled by rhythm). */
	infoCell(e) {
		return e.source === 'ai-research'
			? '<span class="ev-info" aria-label="Funnet av AI — trykk for kilder">ⓘ</span>'
			: '<span></span>';
	}

	eventRow(e) {
		if (e.isSeries) return this.seriesRow(e);
		const live = this.liveScores[e.id];
		const status = this.statusLabel(e);
		const done = (!status && !(live && live.state === 'in')) ? this.finishedInfo(e) : null;
		let trailing;
		if (status) trailing = `<span class="ev-status">${escapeHtml(status)}</span>`;
		else if (live && live.state === 'in') trailing = `<span class="ev-where ev-live">${live.home}–${live.away}</span>`;
		else if (done) trailing = `<span class="ev-done">Ferdig${done.score ? `<span class="ev-done-score">${escapeHtml(done.score)}</span>` : ''}</span>`;
		else trailing = this.whereToWatch(e);
		const expandable = this.hasDetail(e);
		const attrs = expandable
			? ` role="button" tabindex="0" aria-expanded="false" data-event-id="${escapeHtml(e.id)}"`
			: '';
		return `<div class="ev-wrap"><div class="ev${this.isMustSee(e) ? ' must' : ''}${status ? ' cancelled' : ''}${done ? ' done' : ''}${expandable ? ' expandable' : ''}"${attrs}>
			${this.dotCell(this.isMustSee(e))}
			<span class="ev-time">${escapeHtml(this.timeLabel(e))}</span>
			<span class="ev-main"><span class="ev-title">${this.eventTitle(e)}</span>${this.eventMeta(e, trailing)}</span>
			${this.infoCell(e)}
		</div><div class="ev-detail" hidden></div></div>`;
	}

	/** A stage race collapsed to one line: next stage + count, tap to expand. */
	seriesRow(s) {
		const date = new Date(s.nextStage.time);
		const m = String(s.nextStage.title || '').match(/(etappe|stage)\s*\d+/i);
		const nextLabel = m ? m[0] : ssShortName(s.nextStage.title || '');
		const meta = `neste: ${escapeHtml(nextLabel)}<span class="ev-sep"> · </span>${s.stages.length} etapper<span class="ev-sep"> · </span>${this.whereToWatch(s.nextStage)}`;
		return `<div class="ev-wrap"><div class="ev expandable series" role="button" tabindex="0" aria-expanded="false" data-event-id="${escapeHtml(s.id)}">
			${this.dotCell(false)}
			<span class="ev-time">${escapeHtml(this.osloTime(date))}</span>
			<span class="ev-main"><span class="ev-title">${escapeHtml(s.tournament)}</span><span class="ev-meta">${meta}</span></span>
			<span></span>
		</div><div class="ev-detail" hidden></div></div>`;
	}

	/** Expanded series: every stage as a quiet line (past ones dimmed). */
	seriesDetail(s) {
		const now = Date.now();
		// Header: the Norwegian squad + the current-stage context. A stage race (TdF)
		// has no standings feed, but the research agent captures the riders and a
		// per-stage note — surface those instead of leaving the detail a bare list.
		let head = '';
		const riders = [];
		const seen = new Set();
		for (const st of s.stages) for (const p of (st.norwegianPlayers || [])) {
			const n = (p && p.name) || p;
			if (n && !seen.has(n)) { seen.add(n); riders.push(n); }
		}
		if (riders.length) head += `<div class="d-row"><span class="d-k">Norske</span><span class="d-v">${escapeHtml(riders.join(', '))}</span></div>`;
		if (s.nextStage?.summary) head += `<div class="d-row"><span class="d-k">Nå</span><span class="d-v">${escapeHtml(s.nextStage.summary)}</span></div>`;
		const rows = s.stages.map((st) => {
			const d = new Date(st.time);
			const when = d.toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' });
			const ch = (st.streaming || []).map((x) => x.platform || x)[0];
			const past = (st.endTime ? Date.parse(st.endTime) : Date.parse(st.time)) < now;
			return `<div class="d-row stage${past ? ' past' : ''}"><span class="d-k">${escapeHtml(when)} ${escapeHtml(this.osloTime(d))}</span><span class="d-v">${escapeHtml(ssShortName(st.title))}${ch ? ` · <span class="tbd">${escapeHtml(ch)}</span>` : ''}</span></div>`;
		}).join('');
		return head + rows;
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
			const share = evt.target.closest('.ev-share');
			if (share) { this.shareEvent(this._eventById?.get(share.dataset.eventId)); return; }
			const report = evt.target.closest('.ev-report');
			if (report) { this.reportEvent(this._eventById?.get(report.dataset.eventId)); return; }
			if (evt.target.closest('.agenda-more')) { this._fullHorizon = true; this.renderAgenda(); return; }
			const row = evt.target.closest('.ev.expandable');
			if (row) toggle(row);
		});
		agenda.addEventListener('keydown', (evt) => {
			if (evt.key !== 'Enter' && evt.key !== ' ') return;
			const row = evt.target.closest('.ev.expandable');
			if (row) { evt.preventDefault(); toggle(row); }
		});
	}

}

window.Dashboard = Dashboard;
const dashboard = new Dashboard();
window.dashboard = dashboard;
document.addEventListener('DOMContentLoaded', () => dashboard.init());
