// Sportivista — the entity-first "when's X next?" index: the compact "Dine neste" glance
// at the top and the "Hva vi følger" disclosure at the bottom.
// Extends window.Dashboard.prototype (see js/dashboard.js). Loads AFTER dashboard.js.
Object.assign(window.Dashboard.prototype, {

	// ── "Dine neste" — the compact, central answer to "when's X next?" ────────
	// A capped, nearest-first glance across the athletes/teams you follow,
	// upcoming-only. Kept deliberately small so it tops the agenda without
	// burying it; the full list (incl. "ikke satt opp ennå" + tournaments +
	// editing) stays in the "Hva vi følger" disclosure at the bottom.
	/** Followed athletes/teams that have an upcoming event, nearest first. The
	 *  pure selection behind "Dine neste" (upcoming-only; gaps live at the bottom). */
	nextUpEntries() {
		// WP-96: sourced from the catalog (what we cover), not a personal profile.
		const at = this.covers && this.covers.alwaysTrack;
		if (!at) return [];
		// WP-128: don't repeat an entity's next event in the glance when that same
		// event already has its own visible agenda row in the window (renderAgenda
		// records the shown ids). Absent the set (e.g. before first agenda render),
		// no dedupe — the glance still shows everything.
		const shown = this._agendaShownIds;
		return [...(at.athletes || []), ...(at.teams || [])]
			.map((entry) => ({ entry, next: this.nextEventForEntity(entry) }))
			.filter((x) => x.next)
			.filter((x) => !(shown && shown.has(x.next.id)))
			.sort((a, b) => new Date(a.next.time) - new Date(b.next.time));
	},

	renderNextUp() {
		const el = document.getElementById('next-up');
		if (!el) return;
		const all = this.nextUpEntries();
		if (!all.length) { el.hidden = true; return; }
		const MAX = 5;
		const shown = all.slice(0, MAX);
		const more = all.length - shown.length;
		el.innerHTML = '<div class="nu-label">Neste opp</div>'
			+ `<ul class="follow-next">${shown.map((x) => this.followRow(x.entry, true)).join('')}</ul>`
			+ (more > 0 ? `<button type="button" class="nu-more">+ ${more} til i «Dette dekker vi»</button>` : '');
		el.hidden = false;
	},

	// ── "Hva vi følger" — one quiet disclosure at the bottom ──────────────────
	// It answers the recurring "when's X next?" question, entity-first: for each
	// athlete/team you follow, the next known event — UNWINDOWED (ignores the
	// agenda's 14-day cap) so a match months out still shows, and honestly says
	// "ikke satt opp ennå" when there's nothing scheduled. Tournaments stay chips.
	renderFollowed() {
		const wrap = document.getElementById('followed');
		const body = document.getElementById('followed-body');
		if (!wrap || !body) return;
		// WP-96: "Dette dekker vi" renders the catalog (tier2), not a personal profile.
		const at = this.covers && this.covers.alwaysTrack;
		if (!at) { wrap.hidden = true; return; }

		const chip = (x) => `<span class="chip-follow">${escapeHtml(ssEntityName(x))}</span>`;
		const chipGroup = (label, items) => (items || []).length
			? `<div class="chip-group"><div class="chip-group-label">${label}</div><div class="chips-row">${items.map((x) => chip(x)).join('')}</div></div>`
			: '';
		const nextGroup = (label, items, notifyDefault) => (items || []).length
			? `<div class="chip-group"><div class="chip-group-label">${label}</div><ul class="follow-next">${items.map((x) => this.followRow(x, notifyDefault)).join('')}</ul></div>`
			: '';
		body.innerHTML = '<div class="followed-layer">'
			+ nextGroup('Utøvere', at.athletes, true)
			+ nextGroup('Lag', at.teams, true)
			+ chipGroup('Turneringer', at.tournaments, false)
			+ `<div class="followed-hint">Dette er sportene og navnene Sportivista dekker · trykk en rad for detaljer. <a class="followed-edit" href="rediger.html">Savner du noe? Be om dekning →</a></div>`
			+ '</div>';
		wrap.hidden = false;
	},

	/** The next upcoming event for a followed entity, searched across ALL events
	 *  (not the agenda window). Sport-scoped so "Barcelona" (football) never
	 *  matches a Tour stage through the city. Returns the event or null. */
	nextEventForEntity(entry) {
		const terms = trackedTerms([entry]).map((t) => t.toLowerCase()).filter(Boolean);
		if (!terms.length) return null;
		const sport = (entry && typeof entry === 'object') ? entry.sport : null;
		const floor = Date.now() - 3 * SS_CONSTANTS.MS_PER_HOUR;
		let best = null, bestStart = Infinity;
		for (const e of this.allEvents) {
			if (sport && e.sport && e.sport !== sport) continue;
			const start = new Date(e.time).getTime();
			const end = e.endTime ? new Date(e.endTime).getTime() : start;
			if (!(end >= floor)) continue; // already over
			const hay = [e.title, e.tournament, e.homeTeam, e.awayTeam,
				...(e.norwegianPlayers || []).map((p) => p.name || p),
				...(e.participants || []).map((p) => p.name || p)].filter(Boolean).join(' ');
			if (!terms.some((t) => ssContainsTerm(hay, t))) continue;
			if (start < bestStart) { best = e; bestStart = start; }
		}
		return best;
	},

	/** Calm relative-day label in Oslo terms. */
	relDay(e) {
		const now = Date.now();
		const start = new Date(e.time).getTime();
		const end = e.endTime ? new Date(e.endTime).getTime() : start;
		if (start <= now && end >= now) return 'pågår nå';
		const days = Math.round((Date.parse(this.osloDayKey(new Date(e.time))) - Date.parse(this.osloDayKey(new Date(now)))) / SS_CONSTANTS.MS_PER_DAY);
		if (days <= 0) return 'i dag';
		if (days === 1) return 'i morgen';
		return `om ${days} dager`;
	},

	/** For a golf event + a followed golfer entity, that player's own tee time
	 *  (already Oslo-formatted for display) and marquee groupmates. Golf's real
	 *  "when" is the individual tee time, not the tournament's Thursday start —
	 *  so "Dine neste" surfaces it for golfers. Returns { tee, groupmates } or null. */
	golfTeeForEntity(e, entry) {
		if (!e || e.sport !== 'golf' || !entry) return null;
		const terms = trackedTerms([entry]).map((t) => t.toLowerCase()).filter(Boolean);
		if (!terms.length) return null;
		const hit = (name) => terms.some((t) => ssContainsTerm(String(name || ''), t));
		const p = (e.norwegianPlayers || []).find((pl) => hit(pl.name || pl));
		const g = (e.featuredGroups || []).find((gr) => hit(gr.player));
		const tee = (p && p.teeTime) || (g && g.teeTime) || null;
		if (!tee) return null;
		return { tee, groupmates: ((g && g.groupmates) || []).map((m) => m.name || m).filter(Boolean) };
	},

	/** WP-95: the followed golfer's participation status ("røk cutten" etc.) for a
	 *  golf event, or null. When set, the player is OUT — the row shows this calm
	 *  status instead of "pågår nå"/a tee time, which would imply they're playing. */
	golfPlayerStatus(e, entry) {
		if (!e || e.sport !== 'golf' || !entry) return null;
		const terms = trackedTerms([entry]).map((t) => t.toLowerCase()).filter(Boolean);
		if (!terms.length) return null;
		const hit = (name) => terms.some((t) => ssContainsTerm(String(name || ''), t));
		const p = (e.norwegianPlayers || []).find((pl) => hit(pl.name || pl));
		return (p && p.status) || null;
	},

	/** One row in the "neste" index: name + next event (or an honest gap). Flat —
	 *  no logo/badge, no bell, no chevron; the row's rhythm signals tappability. */
	followRow(entry, notifyDefault) {
		const name = escapeHtml(ssEntityName(entry));
		void notifyDefault; // notify state lives in the detail, not the row chrome
		const next = this.nextEventForEntity(entry);
		if (!next) {
			return `<li class="fn-item no-event"><div class="fn-row"><span class="fn-name">${name}<span class="fn-sub">ikke satt opp ennå</span></span></div></li>`;
		}
		const status = this.golfPlayerStatus(next, entry);
		const tee = this.golfTeeForEntity(next, entry);
		// A player who is out of the tournament (cut/WD) shows the calm status, not
		// "pågår nå"/a tee time — relDay alone would read "pågår nå" for the still
		// live tournament even though this golfer is done.
		const when = status
			? status
			: (tee ? `${this.relDay(next)} · ${tee.tee}` : this.relDay(next));
		return `<li class="fn-item has-event"><div class="fn-row" role="button" tabindex="0" aria-expanded="false">
			<span class="fn-name">${name}</span>
			<span class="fn-when">${escapeHtml(when)}</span>
		</div><div class="fn-detail" hidden>${this.followDetail(next, entry)}</div></li>`;
	},

	/** The expanded when·what·where for a followed entity's next event.
	 *  For golfers, `entry` lets us surface that player's own tee time + group. */
	followDetail(e, entry) {
		const d = new Date(e.time);
		const when = `${d.toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' })} ${this.osloTime(d)}`;
		const what = (e.homeTeam && e.awayTeam) ? `${ssShortName(e.homeTeam)} – ${ssShortName(e.awayTeam)}` : (e.title || '');
		const tee = this.golfTeeForEntity(e, entry);
		const streams = Array.isArray(e.streaming) ? e.streaming : [];
		const chans = streams.length
			? streams.map((s) => {
				const p = escapeHtml(String(s.platform || s));
				const label = s.tentative ? `${p} <span class="tbd">(bekreftes)</span>` : p;
				return this.streamLink(s) ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${p}</a>` : label;
			}).join(' · ')
			: '<span class="tbd">–</span>';
		const status = this.golfPlayerStatus(e, entry);
		const rows = [
			`<div class="d-row"><span class="d-k">Når</span><span class="d-v">${escapeHtml(when)}</span></div>`,
			`<div class="d-row"><span class="d-k">Hva</span><span class="d-v">${escapeHtml(what)}</span></div>`,
		];
		if (status) rows.push(`<div class="d-row"><span class="d-k">Status</span><span class="d-v">${escapeHtml(status)}</span></div>`);
		if (tee) {
			const mates = tee.groupmates.length ? ` <span class="tbd">med ${escapeHtml(tee.groupmates.join(', '))}</span>` : '';
			rows.push(`<div class="d-row"><span class="d-k">Tee-tid</span><span class="d-v">${escapeHtml(tee.tee)}${mates}</span></div>`);
		}
		if (e.tournament && e.tournament !== what) rows.push(`<div class="d-row"><span class="d-k">Turnering</span><span class="d-v">${escapeHtml(e.tournament)}</span></div>`);
		rows.push(`<div class="d-row"><span class="d-k">Se på</span><span class="d-v">${chans}</span></div>`);
		return rows.join('');
	},

	/** Tap/keyboard expand for the "neste" index rows in BOTH the top "Dine
	 *  neste" section and the bottom disclosure (delegated, survives re-render). */
	bindFollowed() {
		if (this._followedBound) return;
		this._followedBound = true;
		const toggle = (row) => {
			const detail = row.parentElement.querySelector('.fn-detail');
			if (!detail) return;
			const open = row.getAttribute('aria-expanded') === 'true';
			row.setAttribute('aria-expanded', String(!open));
			detail.hidden = open;
		};
		const onClick = (evt) => {
			if (evt.target.closest('a')) return; // let channel/source links work
			if (evt.target.closest('.nu-more')) {
				const d = document.getElementById('followed');
				if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
				return;
			}
			const row = evt.target.closest('.fn-item.has-event .fn-row');
			if (row) toggle(row);
		};
		const onKey = (evt) => {
			if (evt.key !== 'Enter' && evt.key !== ' ') return;
			const row = evt.target.closest('.fn-item.has-event .fn-row');
			if (row) { evt.preventDefault(); toggle(row); }
		};
		for (const id of ['next-up', 'followed-body']) {
			const c = document.getElementById(id);
			if (!c) continue;
			c.addEventListener('click', onClick);
			c.addEventListener('keydown', onKey);
		}
	},

});
