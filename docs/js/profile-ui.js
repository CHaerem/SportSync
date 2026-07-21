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

	// ── Entity index (docs/data/entities.json) ───────────────────────────────
	/** The followable named long-tail — teams, athletes, tournaments, leagues.
	 *  Excludes the server-inert `sport`/`category` meta entities (those drive the
	 *  assistant's sport filter, not a personal follow). Empty until loadData runs
	 *  (so the pure helpers degrade gracefully in a stripped/test context). */
	followableEntities() {
		const FOLLOWABLE = new Set(['team', 'league', 'tournament', 'athlete']);
		return (this.entities || []).filter((e) => e && e.type && FOLLOWABLE.has(e.type));
	},

	/** The follow `kind` for an entities.json `type` — the bucket ssProfileToInterests
	 *  files it under. Mirrors the iOS mapping; league counts as a team. */
	entityFollowKind(type) {
		if (type === 'team' || type === 'league') return 'team';
		if (type === 'tournament') return 'tournament';
		return 'athlete'; // athlete + anything unexpected
	},

	/** Resolve a name (+ optional sport) to its REAL entities.json entity via a
	 *  word-boundary term match (name/alias, either direction — never naive substring,
	 *  so "Brooklyn" never resolves to "Lyn"). Sport-scoped when both carry a sport.
	 *  Returns the entity object or null. This is what lets a web follow reuse the
	 *  stable iOS id instead of a synthetic one. */
	resolveEntity(name, sport) {
		const q = (name || '').trim();
		if (!q) return null;
		const sp = sport ? ssNormalize(sport) : null;
		for (const ent of this.followableEntities()) {
			if (sp && ent.sport && ssNormalize(ent.sport) !== sp) continue;
			const terms = [ent.name, ...(ent.aliases || [])].filter(Boolean);
			if (terms.some((t) => ssContainsTerm(q, t) || ssContainsTerm(t, q))) return ent;
		}
		return null;
	},

	/** Substring search over the entity index (name + aliases, normalised), ranked
	 *  exact → prefix → substring, capped. Powers the search-and-follow box. */
	searchEntities(query, limit = 8) {
		const q = ssNormalize((query || '').trim());
		if (q.length < 2) return [];
		const scored = [];
		for (const ent of this.followableEntities()) {
			const names = [ent.name, ...(ent.aliases || [])].filter(Boolean);
			let best = Infinity;
			for (const n of names) {
				const nn = ssNormalize(n);
				const idx = nn.indexOf(q);
				if (idx < 0) continue;
				best = Math.min(best, idx === 0 ? (nn.length === q.length ? 0 : 1) : 2);
			}
			if (best < Infinity) scored.push({ ent, rank: best });
		}
		scored.sort((a, b) => a.rank - b.rank || a.ent.name.localeCompare(b.ent.name, 'nb', { sensitivity: 'accent' }));
		return scored.slice(0, limit).map((x) => x.ent);
	},

	/** The followable entities on an event: each team (with its id) and each
	 *  Norwegian player. Prefers the event's server-stamped entityId; else looks up
	 *  the REAL entities.json id (so a web follow key-matches the iOS WP-05 id across
	 *  devices — no CRDT dupes); only then falls back to a synthesized
	 *  `normalize(name)|sport` id (best-effort, documented divergence). */
	followTargets(e) {
		const out = [];
		const seen = new Set();
		const push = (name, id, kind) => {
			const nm = (name || '').trim();
			if (!nm) return;
			let entityId = id;
			let ekind = kind;
			if (!entityId) {
				const ent = this.resolveEntity(nm, e.sport);
				if (ent) { entityId = ent.id; ekind = this.entityFollowKind(ent.type); }
			}
			if (!entityId) entityId = `${ssNormalize(nm)}|${e.sport || ''}`;
			if (seen.has(entityId)) return;
			seen.add(entityId);
			out.push({ entityId, entityName: nm, sport: e.sport || '', kind: ekind });
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

	/** Push the local profile change to iCloud right away (fire-and-forget) so the
	 *  phone picks it up on its next sync — no waiting for a later web sync round.
	 *  No-op when iCloud isn't wired (dev/test) or the user isn't signed in. */
	pushProfileToICloud() {
		if (window.ssICloud && typeof ssICloud.enabled === 'function' && ssICloud.enabled()) {
			try { Promise.resolve(ssICloud.sync()).catch(() => {}); } catch { /* ignore */ }
		}
	},

	/** Commit a follow: persist the rule, re-personalise the board locally (no
	 *  network refetch), and push to iCloud. The ONE write path shared by the detail
	 *  sheet, the search-and-follow box, and the assistant. Returns true on success. */
	commitFollow(entity) {
		if (!this.profileAvailable()) return false;
		ssProfileFollow({ entityId: entity.entityId, entityName: entity.entityName, sport: entity.sport, kind: entity.kind });
		this.applyProfile(ssProfileLoad());
		this.render();
		this.pushProfileToICloud();
		return true;
	},

	/** Commit an unfollow (tombstone the rule), then re-personalise + push. */
	commitUnfollow(entityId) {
		if (!this.profileAvailable()) return false;
		ssProfileUnfollow(entityId);
		this.applyProfile(ssProfileLoad());
		this.render();
		this.pushProfileToICloud();
		return true;
	},

	/** Toggle a follow from a button's data-* attrs (the detail-sheet buttons and
	 *  the search results). */
	toggleFollow(btn) {
		if (!this.profileAvailable()) return;
		const d = btn.dataset;
		if (d.followState === 'on') this.commitUnfollow(d.entityId);
		else this.commitFollow({ entityId: d.entityId, entityName: d.entityName, sport: d.entitySport, kind: d.kind });
	},

	/** Execute an assistant follow/unfollow intent ("følg Liverpool"). Resolves the
	 *  subject against entities.json and commits it — never invents an entity, never
	 *  claims a follow it can't ground. Returns { ok, text } for a calm confirmation
	 *  line (the DOM wiring in bindAssistant renders it). */
	handleFollowIntent(subject, unfollow) {
		const q = (subject || '').trim();
		if (!q) return { ok: false, text: 'Hvem vil du følge? Prøv «følg Hovland».' };
		if (!this.profileAvailable()) return { ok: false, text: 'Følging er ikke tilgjengelig akkurat nå.' };
		const ent = this.resolveEntity(q);
		if (!ent) return { ok: false, text: `Fant ikke «${q}». Søk i «Dette dekker vi» for å følge.` };
		const isOn = ssProfileFollows(ent.id);
		if (unfollow) {
			if (!isOn) return { ok: false, text: `Du følger ikke ${ent.name}.` };
			this.commitUnfollow(ent.id);
			return { ok: true, text: `Sluttet å følge ${ent.name}.` };
		}
		if (isOn) return { ok: true, text: `Du følger allerede ${ent.name}.` };
		this.commitFollow({ entityId: ent.id, entityName: ent.name, sport: ent.sport || '', kind: this.entityFollowKind(ent.type) });
		return { ok: true, text: `Følger ${ent.name} nå.` };
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
			// A follow/unfollow intent is EXECUTED here (WP-163) — the assistant used to
			// return kind:'mutation' that nothing consumed. Resolve + commit the follow,
			// then show a calm confirmation instead of the dead "trykk raden" hint.
			if (r.kind === 'mutation') {
				const res = this.handleFollowIntent(r.subject, r.unfollow);
				results.innerHTML = `<p class="assistant-answer">${escapeHtml(res.text)}</p>`;
				results.hidden = false;
				if (examples) examples.hidden = true;
				return;
			}
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

	/** Recompute interests/covers from a profile state (mirrors loadData's branch).
	 *  WP-163: the catalog stays the base `covers` layer; `followed` is your personal
	 *  list, shown ABOVE the catalog — following never collapses the catalog away. */
	applyProfile(profile) {
		this.profile = profile;
		this.hasProfile = !!(profile && typeof ssStateIsEmpty === 'function' && !ssStateIsEmpty(profile));
		this.covers = this.catalog && this.catalog.tier2 ? { alwaysTrack: this.catalog.tier2 } : null;
		if (this.hasProfile) {
			this.interests = ssProfileToInterests(profile);
			this.followed = { alwaysTrack: this.interests.alwaysTrack };
		} else {
			this.interests = null;
			this.followed = null;
		}
	},

	// ── Search-and-follow (WP-163) ───────────────────────────────────────────
	/** Wire the search box inside the "Dette dekker vi" disclosure: type a name →
	 *  matching entities from entities.json → tap to follow directly (ssProfileFollow)
	 *  with a calm inline confirmation. This is the vanilla-user path to follow
	 *  something that isn't on the board (the detail-sheet buttons only cover rows).
	 *  Calm by DESIGN.md: hairline rows, one amber accent, no toast/spinner. */
	bindFollowSearch() {
		const input = document.getElementById('follow-search-input');
		const results = document.getElementById('follow-search-results');
		if (!input || !results || !this.profileAvailable()) return;

		const render = () => {
			const q = input.value.trim();
			if (q.length < 2) { results.hidden = true; results.innerHTML = ''; return; }
			const hits = this.searchEntities(q);
			if (!hits.length) {
				results.innerHTML = `<p class="fs-empty">Ingen treff på «${escapeHtml(q)}».`
					+ ` <a href="rediger.html">Be om dekning →</a></p>`;
				results.hidden = false;
				return;
			}
			results.innerHTML = hits.map((ent) => this.followSearchRow(ent)).join('');
			results.hidden = false;
		};

		input.addEventListener('input', render);
		results.addEventListener('click', (evt) => {
			const row = evt.target.closest('.fs-result');
			if (!row) return;
			const d = row.dataset;
			const on = ssProfileFollows(d.entityId);
			if (on) this.commitUnfollow(d.entityId);
			else this.commitFollow({ entityId: d.entityId, entityName: d.entityName, sport: d.entitySport, kind: d.kind });
			render(); // reflect the new follow state on the row (Følg ⇄ Følger)
		});
	},

	/** One search result row: name · sport · a Følg/Følger toggle. */
	followSearchRow(ent) {
		const on = ssProfileFollows(ent.id);
		const kind = this.entityFollowKind(ent.type);
		const sport = ent.sport ? `<span class="fs-sport">${escapeHtml((typeof ssLensConfig === 'function' && ssLensConfig(this.lensConfig).sportNb[ent.sport]) || ent.sport)}</span>` : '';
		return `<button type="button" class="fs-result${on ? ' is-following' : ''}"`
			+ ` data-entity-id="${escapeHtml(ent.id)}" data-entity-name="${escapeHtml(ent.name)}"`
			+ ` data-entity-sport="${escapeHtml(ent.sport || '')}" data-kind="${escapeHtml(kind)}"`
			+ ` aria-pressed="${on}"><span class="fs-name">${escapeHtml(ent.name)}</span>${sport}`
			+ `<span class="fs-follow">${on ? 'Følger' : 'Følg'}</span></button>`;
	},
});
