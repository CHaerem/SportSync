// Sportivista — the entity-first "when's X next?" index: the compact "Dine neste" glance
// at the top and the "Hva vi følger" disclosure at the bottom.
// Extends window.Dashboard.prototype (see js/dashboard.js). Loads AFTER dashboard.js.
Object.assign(window.Dashboard.prototype, {

	// ── "Dine neste" — the compact, central answer to "when's X next?" ────────
	// A capped, nearest-first glance across the athletes/teams you follow,
	// upcoming-only. Kept deliberately small so it tops the agenda without
	// burying it; the full list (incl. "ikke satt opp ennå" + tournaments +
	// editing) stays in the "Hva vi følger" disclosure at the bottom.
	/** The athletes+teams behind "Neste opp": YOUR follows first, then the catalog
	 *  (what we cover), de-duplicated by name. WP-163: following must not collapse
	 *  the glance to only your list — it LAYERS your follows on top of the catalog. */
	nextUpCandidates() {
		const bucket = (c) => (c && c.alwaysTrack) ? [...(c.alwaysTrack.athletes || []), ...(c.alwaysTrack.teams || [])] : [];
		const out = [];
		const seen = new Set();
		for (const entry of [...bucket(this.followed), ...bucket(this.covers)]) {
			const key = ssNormalize(ssEntityName(entry));
			if (!key || seen.has(key)) continue;
			seen.add(key);
			out.push(entry);
		}
		return out;
	},

	/** Followed athletes/teams that have an upcoming event, nearest first. The
	 *  pure selection behind "Neste opp" (upcoming-only; gaps live at the bottom). */
	nextUpEntries() {
		const candidates = this.nextUpCandidates();
		if (!candidates.length) return [];
		// WP-128: don't repeat an entity's next event in the glance when that same
		// event already has its own visible agenda row in the window (renderAgenda
		// records the shown ids). Absent the set (e.g. before first agenda render),
		// no dedupe — the glance still shows everything.
		const shown = this._agendaShownIds;
		return candidates
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
	// athlete/team/TOURNAMENT you follow, the next known event — UNWINDOWED
	// (ignores the agenda's 14-day cap) so a match months out still shows, and
	// honestly says "ikke satt opp ennå" when there's nothing scheduled. WP-120:
	// tournaments are next-event rows too (was a chip line) — every followed row
	// now answers "what does following this GIVE me?", matching the iOS surface.
	renderFollowed() {
		const wrap = document.getElementById('followed');
		const body = document.getElementById('followed-body');
		if (!wrap || !body) return;
		// WP-163: TWO layers, one disclosure — "Det du følger" (your personal list)
		// on top, then "Dette dekker vi" (the catalog, tier2). Following something
		// never collapses the catalog away (the old bug where covers became your
		// list only). Both may be present; the catalog is always the base.
		const at = this.covers && this.covers.alwaysTrack;
		const mine = this.followed && this.followed.alwaysTrack;
		if (!at && !mine) { wrap.hidden = true; return; }

		const nextGroup = (label, items, notifyDefault) => (items || []).length
			? `<div class="chip-group"><div class="chip-group-label">${label}</div><ul class="follow-next">${items.map((x) => this.followRow(x, notifyDefault)).join('')}</ul></div>`
			: '';
		// "Det du følger" — a flat, nearest-first list of everything you follow.
		let yours = '';
		if (mine) {
			const followedEntries = [...(mine.athletes || []), ...(mine.teams || []), ...(mine.tournaments || [])];
			if (followedEntries.length) {
				yours = '<div class="followed-layer followed-mine">'
					+ '<div class="followed-layer-label">Det du følger</div>'
					+ `<ul class="follow-next">${followedEntries.map((x) => this.followRow(x, true)).join('')}</ul>`
					+ '</div>';
			}
		}
		const catalog = at
			? '<div class="followed-layer followed-catalog">'
				+ (yours ? '<div class="followed-layer-label">Dette dekker vi</div>' : '')
				+ nextGroup('Utøvere', at.athletes, true)
				+ nextGroup('Lag', at.teams, true)
				+ nextGroup('Turneringer', at.tournaments, false)
				+ '</div>'
			: '';
		body.innerHTML = yours + catalog
			+ `<div class="followed-hint">Søk over for å følge et lag eller en utøver · trykk en rad for detaljer. <a class="followed-edit" href="rediger.html">Savner du en hel sport? Be om dekning →</a></div>`;
		wrap.hidden = false;
	},

	/** The next upcoming event for a followed entity, searched across ALL events
	 *  (not the agenda window). Sport-scoped so "Barcelona" (football) never
	 *  matches a Tour stage through the city. Returns the event or null. Delegates
	 *  to the shared ssNextEventForEntity (WP-120) so the dashboard and the rediger
	 *  page find "next" identically. */
	nextEventForEntity(entry) {
		return ssNextEventForEntity(this.allEvents, entry);
	},

	/** Calm relative-day label in Oslo terms. */
	relDay(e) {
		const now = Date.now();
		// WP-126: use the ONE shared live definition, not a raw [start,end] window.
		// A multi-day tournament at 03:00 is 'pågår' (underway) — not 'pågår nå',
		// which would falsely imply an active session right now; only a genuine
		// live session (a plausible active window) reads "pågår nå".
		const live = ssLiveState(e, now);
		if (live === 'direkte') return 'pågår nå';
		if (live === 'pågår') return 'pågår';
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
	 *  no logo/badge, no bell, no chevron; the row's rhythm signals tappability.
	 *  WP-170: ONE tap opens that entity's PAGE («hva skjer med X?») instead of
	 *  expanding a next-event blurb in place. The blurb is not lost — it is the
	 *  page's KOMMENDE section (the same `followDetail`, tee time and all) — and a
	 *  row with nothing scheduled is now tappable too, because the page can still
	 *  answer with a result, a table position or news. */
	followRow(entry, notifyDefault) {
		const name = escapeHtml(ssEntityName(entry));
		void notifyDefault; // notify state lives in the detail, not the row chrome
		const key = this.rememberEntity ? this.rememberEntity(entry) : '';
		const open = ` role="button" tabindex="0" data-entity-key="${escapeHtml(key)}"`;
		const next = this.nextEventForEntity(entry);
		if (!next) {
			return `<li class="fn-item no-event"><div class="fn-row"${open}><span class="fn-name">${name}<span class="fn-sub">ikke satt opp ennå</span></span></div></li>`;
		}
		const status = this.golfPlayerStatus(next, entry);
		const tee = this.golfTeeForEntity(next, entry);
		// A player who is out of the tournament (cut/WD) shows the calm status, not
		// "pågår nå"/a tee time — relDay alone would read "pågår nå" for the still
		// live tournament even though this golfer is done.
		const when = status
			? status
			: (tee ? `${this.relDay(next)} · ${tee.tee}` : this.relDay(next));
		return `<li class="fn-item has-event"><div class="fn-row"${open}>
			<span class="fn-name">${name}</span>
			<span class="fn-when">${escapeHtml(when)}</span>
		</div></li>`;
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

	/** Tap/keyboard open for the "neste" index rows in BOTH the top "Dine neste"
	 *  section and the bottom disclosure (delegated, survives re-render). WP-170:
	 *  the tap opens the entity PAGE — one tap from a follow row to the answer. */
	bindFollowed() {
		if (this._followedBound) return;
		this._followedBound = true;
		const open = (row) => {
			const entry = this.entityForKey ? this.entityForKey(row.dataset.entityKey) : null;
			if (entry && typeof this.openEntityPage === 'function') this.openEntityPage(entry);
		};
		const onClick = (evt) => {
			if (evt.target.closest('a')) return; // let channel/source links work
			if (evt.target.closest('.nu-more')) {
				const d = document.getElementById('followed');
				if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
				return;
			}
			const row = evt.target.closest('.fn-item .fn-row[data-entity-key]');
			if (row) open(row);
		};
		const onKey = (evt) => {
			if (evt.key !== 'Enter' && evt.key !== ' ') return;
			const row = evt.target.closest('.fn-item .fn-row[data-entity-key]');
			if (row) { evt.preventDefault(); open(row); }
		};
		for (const id of ['next-up', 'followed-body']) {
			const c = document.getElementById(id);
			if (!c) continue;
			c.addEventListener('click', onClick);
			c.addEventListener('keydown', onKey);
		}
	},

});
