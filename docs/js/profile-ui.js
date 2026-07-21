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
		// Push the change to iCloud right away (fire-and-forget) so the phone picks
		// it up on its next sync — no waiting for a later web sync round. No-op when
		// iCloud isn't wired (dev/test) or the user isn't signed in.
		if (window.ssICloud && typeof ssICloud.enabled === 'function' && ssICloud.enabled()) {
			try { Promise.resolve(ssICloud.sync()).catch(() => {}); } catch { /* ignore */ }
		}
	},

	/** Wire the deterministic assistant: a floating bottom-trailing button opens a
	 *  conversation sheet (mirrors the iOS AssistantButton + AssistantSheetView).
	 *  Type a question → grounded answer + matching event rows; no spinner, no model. */
	bindAssistant() {
		const fab = document.getElementById('assistant-fab');
		const sheet = document.getElementById('assistant-sheet');
		const input = document.getElementById('assistant-input');
		const results = document.getElementById('assistant-results');
		const examples = document.getElementById('assistant-examples');
		if (!fab || !sheet || !input || !results || typeof ssAssistant !== 'function') return;

		const run = () => {
			const q = input.value.trim();
			if (!q) { results.hidden = true; results.innerHTML = ''; if (examples) examples.hidden = false; return; }
			const r = ssAssistant(q, { events: this.allEvents || [], interests: this.interests, config: this.lensConfig, vocab: this.assistantVocab, nowMs: Date.now() });
			const rows = (r.eventIds || [])
				.map((id) => (this._eventById && this._eventById.get(id)) || (this.allEvents || []).find((e) => e.id === id))
				.filter(Boolean);
			const body = rows.length ? rows.map((e) => this.eventRow(e)).join('') : '';
			results.innerHTML = `<p class="assistant-answer">${escapeHtml(r.text)}</p>${body}`;
			results.hidden = false;
			if (examples) examples.hidden = true; // the thread replaces the examples (iOS parity)
		};

		// Sheet open/close. Focus the field on open so the keyboard/dictation is ready.
		const open = () => {
			sheet.hidden = false;
			// Defer focus a frame so the rise animation doesn't fight the caret.
			requestAnimationFrame(() => input.focus());
		};
		const close = () => { sheet.hidden = true; input.blur(); };
		fab.addEventListener('click', open);
		sheet.querySelectorAll('[data-assistant-close]').forEach((el) => el.addEventListener('click', close));
		document.addEventListener('keydown', (evt) => { if (evt.key === 'Escape' && !sheet.hidden) close(); });

		// Example rows fill the field and run — the sheet's calm guiding (iOS parity).
		if (examples) examples.querySelectorAll('.ex-row').forEach((el) => el.addEventListener('click', () => {
			input.value = el.dataset.ex || el.textContent || '';
			run();
		}));

		input.addEventListener('keydown', (evt) => { if (evt.key === 'Enter') { evt.preventDefault(); run(); } });
		// Clearing the field brings the examples back.
		input.addEventListener('input', () => { if (!input.value.trim()) { results.hidden = true; results.innerHTML = ''; if (examples) examples.hidden = false; } });

		// Collapse the FAB to the bare glyph while the board scrolls (iOS WP-146
		// idiom); expanded at the top / at rest. A small dead-zone keeps a resting
		// board expanded. Reduce Motion: the CSS transition is disabled there anyway.
		const onScroll = () => { fab.classList.toggle('collapsed', window.scrollY > 40); };
		window.addEventListener('scroll', onScroll, { passive: true });
		onScroll();
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
