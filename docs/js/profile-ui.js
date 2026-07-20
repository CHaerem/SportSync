// profile-ui.js — the follow/unfollow affordance that makes the web board
// personal. Extends the Dashboard prototype (loaded AFTER dashboard.js/detail.js).
// A tap on an event row → follow that team/athlete → the board re-renders with
// your accents. Storage + merge live in profile-sync.js; this is only the wiring.
//
// Calm by DESIGN.md: reuses the existing .ev-act button style, one amber accent
// for the followed state, no toast/badge/spinner. Degrades to nothing when
// profile-sync.js isn't present (so nothing breaks in a stripped context).

Object.assign(window.Dashboard.prototype, {
	/** Whether the personal-profile machinery is available in this context. */
	profileAvailable() {
		return typeof ssProfileFollows === 'function' && typeof ssProfileFollow === 'function';
	},

	/** The followable entities on an event: each team (with its id) and each
	 *  Norwegian player. Prefers the event's real entityId so a web follow
	 *  key-matches the iOS WP-05 id across devices; falls back to a synthesized
	 *  `normalize(name)|sport` id (best-effort, documented divergence). */
	followTargets(e) {
		const out = [];
		const seen = new Set();
		const push = (name, id, kind) => {
			const nm = (name || '').trim();
			if (!nm) return;
			const entityId = id || `${ssNormalize(nm)}|${e.sport || ''}`;
			if (seen.has(entityId)) return;
			seen.add(entityId);
			out.push({ entityId, entityName: nm, sport: e.sport || '', kind });
		};
		push(e.homeTeam, e.homeTeamEntityId, 'team');
		push(e.awayTeam, e.awayTeamEntityId, 'team');
		for (const p of e.norwegianPlayers || []) push(p.name || p, p.entityId, 'athlete');
		return out;
	},

	/** The "Følg X" / "Følger X" buttons for the detail sheet's action row.
	 *  Empty string when the profile machinery is absent. */
	followButtonsHtml(e) {
		if (!this.profileAvailable()) return '';
		return this.followTargets(e).map((t) => {
			const on = ssProfileFollows(t.entityId);
			const label = on ? `Følger ${escapeHtml(t.entityName)}` : `Følg ${escapeHtml(t.entityName)}`;
			return `<button type="button" class="ev-act ev-follow${on ? ' is-following' : ''}"`
				+ ` data-entity-id="${escapeHtml(t.entityId)}" data-entity-name="${escapeHtml(t.entityName)}"`
				+ ` data-entity-sport="${escapeHtml(t.sport)}" data-kind="${escapeHtml(t.kind)}"`
				+ ` data-follow-state="${on ? 'on' : 'off'}" aria-pressed="${on}">${label}</button>`;
		}).join('');
	},

	/** Toggle a follow from a button's data-* attrs, then re-render locally (no
	 *  network refetch) so the accents/sections update immediately. */
	toggleFollow(btn) {
		if (!this.profileAvailable()) return;
		const d = btn.dataset;
		if (d.followState === 'on') ssProfileUnfollow(d.entityId);
		else ssProfileFollow({ entityId: d.entityId, entityName: d.entityName, sport: d.entitySport, kind: d.kind });
		this.applyProfile(ssProfileLoad());
		this.render();
	},

	/** Wire the deterministic assistant input: type a question → grounded answer
	 *  + the matching event rows, in a calm panel (no spinner, no model). */
	bindAssistant() {
		const input = document.getElementById('assistant-input');
		const results = document.getElementById('assistant-results');
		if (!input || !results || typeof ssAssistant !== 'function') return;
		const run = () => {
			const q = input.value.trim();
			if (!q) { results.hidden = true; results.innerHTML = ''; return; }
			const r = ssAssistant(q, { events: this.allEvents || [], interests: this.interests, config: this.lensConfig, nowMs: Date.now() });
			const rows = (r.eventIds || [])
				.map((id) => (this._eventById && this._eventById.get(id)) || (this.allEvents || []).find((e) => e.id === id))
				.filter(Boolean);
			const body = rows.length ? rows.map((e) => this.eventRow(e)).join('') : '';
			results.innerHTML = `<p class="assistant-answer">${escapeHtml(r.text)}</p>${body}`;
			results.hidden = false;
		};
		input.addEventListener('keydown', (evt) => { if (evt.key === 'Enter') { evt.preventDefault(); run(); } });
		// Clearing the field hides the panel again.
		input.addEventListener('input', () => { if (!input.value.trim()) { results.hidden = true; results.innerHTML = ''; } });
	},

	/** Recompute interests/covers from a profile state (mirrors loadData's branch). */
	applyProfile(profile) {
		this.profile = profile;
		this.hasProfile = !!(profile && typeof ssStateIsEmpty === 'function' && !ssStateIsEmpty(profile));
		if (this.hasProfile) {
			this.interests = ssProfileToInterests(profile);
			this.covers = { alwaysTrack: this.interests.alwaysTrack };
		} else {
			this.covers = this.catalog && this.catalog.tier2 ? { alwaysTrack: this.catalog.tier2 } : null;
			this.interests = null;
		}
	},
});
