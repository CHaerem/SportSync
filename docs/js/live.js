// Sportivista — live now: the quiet "Direkte nå" line + client-side ESPN live polling.
// Extends window.Dashboard.prototype (see js/dashboard.js). Loads AFTER dashboard.js.
Object.assign(window.Dashboard.prototype, {

	// ── Live now (quiet line at the top) ─────────────────────────────────────
	// WP-126: ONE shared live definition (ssLiveState). Every board event that is
	// 'direkte' right now shows here — not just the ESPN-polled football/golf/F1.
	// An ESPN score/leaderboard merely ENRICHES a row (score = bonus, not the
	// entrance ticket), so a Tour stage / chess round / CS2 match finally appears
	// in "Direkte nå" too. 'pågår' multi-day events stay OUT of the line (they
	// carry their own agenda row).
	renderLive() {
		const box = document.getElementById('live-now');
		if (!box) return;
		const now = Date.now();
		const items = [];
		const shownIds = new Set();
		// ESPN football live scores enrich their board row with the running score.
		for (const [id, live] of Object.entries(this.liveScores)) {
			if (live.state !== 'in') continue;
			items.push(`<div class="live-wrap"><div class="live-item"><span class="live-dot"></span><span class="live-body"><span class="live-name">${escapeHtml(ssShortName(live.homeName))} <span class="live-score">${live.home}–${live.away}</span> ${escapeHtml(ssShortName(live.awayName))}</span></span><span class="live-meta">${escapeHtml(live.clock || '')}</span></div></div>`);
			shownIds.add(id);
		}
		// Golf + F1 keep their ESPN-driven expandable leaderboard / running-order
		// rows — that live poll is the RELIABLE signal for those two, so they are
		// owned by this path and are NOT re-derived from the coarse daily-window
		// heuristic below (which would risk a false 'direkte' between rounds).
		if (this.liveLeaderboard?.state === 'in' && this.liveLeaderboard.top?.length) items.push(this.liveGolfItem(this.liveLeaderboard));
		if (this.liveF1?.state === 'in' && this.liveF1.top?.length) items.push(this.liveF1Item(this.liveF1));
		// WP-126: all remaining live board events — the sports the ESPN poll can't
		// see (cycling, chess, CS2, tennis) plus any unpolled football — as calm
		// when·what·where rows.
		for (const e of this.directLiveEvents(now)) {
			if (shownIds.has(e.id)) continue;              // already shown with its ESPN score
			if (e.sport === 'golf' || e.sport === 'f1') continue; // owned by the ESPN rows above
			if (this.liveScores[e.id]?.state === 'post') continue; // ESPN says it's finished — trust the poll
			items.push(this.liveEventRow(e));
		}
		if (items.length === 0) { box.hidden = true; return; }
		box.innerHTML = `<div class="live-label"><span class="live-dot"></span>Direkte nå</div>${items.join('')}`;
		box.hidden = false;
	},

	/** WP-126 — every board event that is LIVE right now ('direkte' per the shared
	 *  ssLiveState), earliest-started first. Sport- and poll-agnostic: this is the
	 *  entrance ticket to "Direkte nå" (mirrors iOS `liveRows`). 'pågår' multi-day
	 *  events are excluded by ssLiveState itself. */
	directLiveEvents(now = Date.now()) {
		return this.allEvents
			.filter((e) => !e.isSeries && ssLiveState(e, now) === 'direkte')
			.sort((a, b) => new Date(a.time) - new Date(b.time));
	},

	/** One calm "Direkte nå" row for a board event with no ESPN enrichment
	 *  (cycling stage, chess round, CS2 match, an unpolled football match, …):
	 *  when·what·where — the same quiet shape as the score rows, minus the score. */
	liveEventRow(e) {
		return `<div class="live-wrap"><div class="live-item"><span class="live-dot"></span><span class="live-body"><span class="live-name">${this.eventTitle(e)}</span></span><span class="live-meta">${this.whereToWatch(e)}</span></div></div>`;
	},

	/** One leaderboard row (position · name · trailing value); your player is
	 *  highlighted in amber (the .mine class) — no flag emoji in the chrome. */
	lbRow(pos, name, trail, mine) {
		return `<div class="lb-row${mine ? ' mine' : ''}"><span class="lb-pos">${escapeHtml(String(pos ?? ''))}</span><span class="lb-name">${escapeHtml(ssShortName(name || ''))}</span><span class="lb-x">${escapeHtml(String(trail ?? ''))}</span></div>`;
	},

	/** Golf live: quiet line (tournament + leader + your Norwegians' live position),
	 *  tap to expand the top of the leaderboard (with your players appended if lower). */
	liveGolfItem(g) {
		const open = !!(this._liveOpen && this._liveOpen.golf);
		const leader = g.top[0];
		const you = (g.tracked || []).map((t) => `${escapeHtml(ssShortName(t.player))} ${escapeHtml(t.score)} <span class="live-pos">${escapeHtml(String(t.pos))}.</span>${t.out ? ' <span class="live-out">utenfor</span>' : ''}`).join(' · ');
		const board = g.top.map((r) => this.lbRow(r.pos, r.player, r.score, false))
			.concat((g.tracked || []).filter((t) => !g.top.some((r) => r.player === t.player)).map((t) => this.lbRow(t.pos, t.player, t.score, true)))
			.join('');
		const cutRow = g.cut ? `<div class="lb-cut">Antatt cut · ${escapeHtml(g.cut.label)} (topp 65)</div>` : '';
		return `<div class="live-wrap"><div class="live-item live-expand" role="button" tabindex="0" aria-expanded="${open}" data-live="golf">
			<span class="live-dot"></span>
			<span class="live-body"><span class="live-name">${escapeHtml(g.name)}</span>${you ? `<span class="live-you">${you}</span>` : ''}</span>
			<span class="live-meta">${escapeHtml(leader.player)} ${escapeHtml(leader.score)}</span>
		</div><div class="live-detail"${open ? '' : ' hidden'}>${board}${cutRow}</div></div>`;
	},

	/** F1 live: quiet line (GP + session + leader), tap to expand the running order. */
	liveF1Item(f) {
		const open = !!(this._liveOpen && this._liveOpen.f1);
		const leader = f.top[0];
		const board = f.top.map((r) => this.lbRow(r.pos, r.player, r.team, false)).join('');
		return `<div class="live-wrap"><div class="live-item live-expand" role="button" tabindex="0" aria-expanded="${open}" data-live="f1">
			<span class="live-dot"></span>
			<span class="live-body"><span class="live-name">${escapeHtml(f.name)}</span>${f.session ? `<span class="live-you">${escapeHtml(f.session)}</span>` : ''}</span>
			<span class="live-meta">${escapeHtml(leader.player)}</span>
		</div><div class="live-detail"${open ? '' : ' hidden'}>${board}</div></div>`;
	},

	/** Tap/keyboard expand for a live leaderboard; remembers open state across the
	 *  60s re-render so a poll doesn't collapse what you're reading. */
	bindLive() {
		const box = document.getElementById('live-now');
		if (!box || this._liveBound) return;
		this._liveBound = true;
		const toggle = (row) => {
			const detail = row.parentElement.querySelector('.live-detail');
			if (!detail) return;
			const open = row.getAttribute('aria-expanded') === 'true';
			row.setAttribute('aria-expanded', String(!open));
			detail.hidden = open;
			this._liveOpen = this._liveOpen || {};
			this._liveOpen[row.dataset.live] = !open;
		};
		box.addEventListener('click', (e) => { const r = e.target.closest('.live-item.live-expand'); if (r) toggle(r); });
		box.addEventListener('keydown', (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const r = e.target.closest('.live-item.live-expand'); if (r) { e.preventDefault(); toggle(r); } });
	},

	// ── Live polling (ESPN, client-side) ─────────────────────────────────────
	startLivePolling() {
		if (this._liveInterval) return;
		this._liveInterval = setInterval(() => this.pollLiveScores(), 60 * 1000);
		setTimeout(() => this.pollLiveScores(), 3000);
	},
	// WP-126: gate the 60s poll on the SHARED live definition, not just the three
	// ESPN sports. So a live cycling stage / chess round keeps the "Direkte nå"
	// line re-rendering (and truthful — a finished event drops) every minute, the
	// web counterpart of iOS's minute tick. The per-sport ESPN fetches inside
	// pollLiveScores keep their own guards, so no needless network calls result.
	hasLiveEvents() {
		const now = Date.now();
		return this.allEvents.some((e) => ssLiveState(e, now) === 'direkte');
	},
	async pollLiveScores() {
		if (!this._liveVisible || !this.hasLiveEvents()) return;
		try {
			await Promise.all([this.pollFootballScores(), this.pollGolfScores(), this.pollF1Scores()]);
			this.renderLive();
			this.renderAgenda();
		} catch { /* live scores are best-effort */ }
	},
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
	},
	async pollGolfScores() {
		const now = Date.now();
		if (!this.allEvents.some((e) => { if (e.sport !== 'golf') return false; const s = new Date(e.time).getTime(); const end = e.endTime ? new Date(e.endTime).getTime() : s + 4 * SS_CONSTANTS.MS_PER_DAY; return s <= now && now <= end; })) return;
		try {
			const resp = await fetch('https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard');
			if (!resp.ok) return;
			const data = await resp.json();
			const ev = data.events?.[0], comp = ev?.competitions?.[0], state = ev?.status?.type?.state;
			if (!comp || state === 'pre') return;
			const row = (c) => ({
				pos: c.status?.position?.displayName || (c.order != null ? String(c.order) : ''),
				player: c.athlete?.displayName || c.athlete?.fullName || '—',
				score: typeof c.score === 'object' ? (c.score?.displayValue || 'E') : (c.score?.toString() || 'E'),
			});
			const comps = comp.competitors || [];
			const toNum = (s) => { const v = String(s).trim(); if (/^e$/i.test(v)) return 0; const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
			// Projected 36-hole cut (top 65 & ties — the common rule). ESPN's feed
			// doesn't expose a cut line, so derive it from the field: the score at
			// the 65th position. Only meaningful rounds 1–2; label it "antatt".
			const round = Number(ev?.status?.period || comp?.status?.period || 1);
			let cut = null;
			if (round <= 2) {
				const scored = comps.map((c) => toNum(row(c).score)).filter((n) => n != null).sort((a, b) => a - b);
				if (scored.length > 65) {
					const n = scored[64];
					cut = { n, label: n > 0 ? `+${n}` : (n === 0 ? 'E' : String(n)) };
				}
			}
			// The covered golfers' live positions, flagged inside/outside the
			// projected cut. WP-96: sourced from the catalog (this.covers), not a
			// personal profile — the web board is catalog-wide.
			const terms = trackedTerms((this.covers?.alwaysTrack?.athletes || []).filter((a) => (a && a.sport) === 'golf')).map((t) => t.toLowerCase());
			const tracked = comps.map(row).filter((r) => terms.some((t) => ssContainsTerm(r.player, t)))
				.map((r) => ({ ...r, out: cut != null && toNum(r.score) != null && toNum(r.score) > cut.n }));
			this.liveLeaderboard = { name: ev.name || '', state, top: comps.slice(0, 8).map(row), tracked, cut, round };
		} catch { /* ignore */ }
	},

	/** F1 live: during a session (practice/quali/race), the running order. ESPN's
	 *  F1 scoreboard nests each session under the GP weekend's competitions. */
	async pollF1Scores() {
		const now = Date.now();
		if (!this.allEvents.some((e) => { if (e.sport !== 'f1') return false; const s = new Date(e.time).getTime(); const end = e.endTime ? new Date(e.endTime).getTime() : s + 4 * SS_CONSTANTS.MS_PER_HOUR; return s <= now && now <= end; })) return;
		try {
			const resp = await fetch('https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard');
			if (!resp.ok) return;
			const data = await resp.json();
			const ev = data.events?.[0];
			const live = (ev?.competitions || []).find((c) => c.status?.type?.state === 'in');
			if (!ev || !live) { this.liveF1 = null; return; }
			const row = (c) => ({
				pos: c.order != null ? String(c.order) : '',
				player: c.athlete?.displayName || c.athlete?.shortName || '—',
				team: c.athlete?.team?.name || c.athlete?.team?.abbreviation || '',
			});
			const top = (live.competitors || []).slice(0, 8).map(row).filter((r) => r.player !== '—');
			this.liveF1 = top.length ? { name: ev.shortName || ev.name || 'Formel 1', session: live.type?.text || live.type?.abbreviation || '', state: 'in', top } : null;
		} catch { /* ignore */ }
	},

});
