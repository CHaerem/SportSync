// entity-page.js — WP-170: the ENTITY PAGE, «hva skjer med X?» in one place.
// The web twin of ios/Sportivista/Profile/EntityPage.swift + EntityPageView.swift.
//
// The go-to mapping (22.07) found this as the biggest remaining gap against
// FotMob/VG Live: their core ritual is ONE page per team/athlete — next match,
// last result, table position, news — and we had no such object at all. The
// answer was spread across the agenda, the Nyheter board's sections and the
// event detail.
//
// It is a COMPOSITION of what the page already loaded — no new data file, no new
// request, no new matching:
//   KOMMENDE       — the SAME `ssNextEventForEntity` term matching «Dette dekker
//                    vi» uses, widened to the next few events.
//   SISTE RESULTAT — `ssResultRows(recent-results)` (news-web.js), name-filtered.
//   TABELL         — an ENTITY gate over standings.json that is as honest as the
//                    event one: the table is shown ONLY when the entity is in it.
//                    An OBOS club never gets the Premier League table.
//   SISTE NYTT     — news.json pointers matched on entityIds, else on the name.
//   MER            — one deep link to the specialist (VISJON v3: «ikke konkurrer
//                    på dybde, lenk til spesialisten»). Absent, never guessed.
//
// Calm rules (they are what keep this from becoming a FotMob clone): ONE screen,
// a FIXED section order, no tabs, no infinite scroll, small caps per section, and
// every section OMITTED when it has nothing to say.
//
// NB: the web has no spoiler shield — `spoilerPolicy` is an on-device iOS memory
// fact and never leaves the phone. So the web shows results plainly here, exactly
// as the Nyheter board already does (news-web.js `resultRow`). The iOS page keeps
// the shield.

/** How much each section shows. Ro before completeness. */
const SS_EP_UPCOMING = 3;
const SS_EP_RESULTS = 3;
const SS_EP_NEWS = 4;
/** Table rows before the entity's own row is appended (mirrors StandingsTable.topRows). */
const SS_EP_TABLE_TOP = 5;

/** The match terms for an entity entry (a bare name, an alwaysTrack entry, or an
 *  entities.json record) — name + aliases, exactly what the rest of the board
 *  matches on. */
function ssEntityTerms(entry) {
	return trackedTerms([entry]).filter(Boolean);
}

/** Does any of the entity's terms hit this haystack? Word-boundary + accent
 *  insensitive (`ssContainsTerm`), never a substring free-for-all. */
function ssEntityHits(haystack, entry) {
	const hay = String(haystack || '');
	return ssEntityTerms(entry).some((t) => ssContainsTerm(hay, t));
}

/** The next `limit` upcoming events for an entity, nearest first. Same sport
 *  scoping and same 3h "already over" floor as `ssNextEventForEntity` — it is
 *  literally applied repeatedly over a shrinking pool, so the first row here is
 *  ALWAYS the row «Dette dekker vi» shows. */
function ssEntityUpcoming(events, entry, now = Date.now(), limit = SS_EP_UPCOMING) {
	const out = [];
	let pool = Array.isArray(events) ? events.slice() : [];
	for (let i = 0; i < limit; i++) {
		const next = ssNextEventForEntity(pool, entry, now);
		if (!next) break;
		out.push(next);
		pool = pool.filter((e) => e !== next);
	}
	return out;
}

/** The recent results this entity took part in (rows from news-web.js's
 *  `ssResultRows`, whose `names` carry the participants). */
function ssEntityResults(rows, entry, limit = SS_EP_RESULTS) {
	return (rows || [])
		.filter((r) => ssEntityHits((r.names || []).join(' '), entry))
		.slice(0, limit);
}

/** The news pointers about this entity: a stamped entityId hit when we know the
 *  id, else the name in the headline. Never the whole sport — this is a page
 *  about ONE entity. */
function ssEntityNews(news, entry, entityId, limit = SS_EP_NEWS) {
	const id = entityId || (entry && entry.id) || null;
	return (news || [])
		.filter((it) => {
			const ids = Array.isArray(it.entityIds) ? it.entityIds : [];
			if (id && ids.indexOf(id) >= 0) return true;
			return ssEntityHits(it.title, entry);
		})
		.slice()
		.sort((a, b) => (Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0)))
		.slice(0, limit);
}

/**
 * The table this ENTITY is actually in — never «a» table for its sport.
 * Returns `{ title, rows: [{ rank, name, value, highlighted }] }` or null.
 *
 * The honest gate is the whole point (the WP-171 lesson, applied per entity):
 * football events cover far more leagues than we publish standings for, so an
 * OBOS fixture must not render the Premier League top five as if it were its own
 * table. Twin of `EntityPage.standingsTable` in Swift.
 */
function ssEntityStandingsTable(standings, entry) {
	if (!standings) return null;
	const sport = (entry && entry.sport) || '';
	const hit = (name) => ssEntityHits(name, entry);

	if (sport === 'football') {
		const tables = standings.football || {};
		for (const [title, table] of [['Premier League', tables.premierLeague], ['La Liga', tables.laLiga]]) {
			if (!Array.isArray(table) || !table.length) continue;
			if (!table.some((t) => hit(t.team))) continue;
			const picked = table.slice(0, SS_EP_TABLE_TOP);
			for (const t of table) if (hit(t.team) && !picked.some((p) => p.position === t.position)) picked.push(t);
			picked.sort((a, b) => a.position - b.position);
			return { title, rows: picked.map((t) => ({ rank: `${t.position}.`, name: t.team, value: String(t.points), highlighted: hit(t.team) })) };
		}
		return null;
	}

	if (sport === 'golf') {
		const tours = standings.golf || {};
		for (const key of Object.keys(tours).sort()) {
			const board = tours[key];
			const lb = (board && Array.isArray(board.leaderboard)) ? board.leaderboard : [];
			const tracked = (board && Array.isArray(board.trackedPlayers)) ? board.trackedPlayers : [];
			if (!lb.length) continue;
			if (!lb.concat(tracked).some((p) => hit(p.player))) continue;
			const rows = lb.slice(0, SS_EP_TABLE_TOP).map((p) => ssGolfTableRow(p, hit(p.player)));
			for (const p of lb.concat(tracked)) {
				if (hit(p.player) && !rows.some((r) => r.name === p.player)) rows.push(ssGolfTableRow(p, true));
			}
			return { title: board.name || 'Ledertavle', rows };
		}
		return null;
	}

	if (sport === 'f1') {
		const drivers = (standings.f1 && Array.isArray(standings.f1.drivers)) ? standings.f1.drivers : [];
		if (!drivers.some((d) => hit(d.driver))) return null;
		const picked = drivers.slice(0, SS_EP_TABLE_TOP);
		for (const d of drivers) if (hit(d.driver) && !picked.some((p) => p.position === d.position)) picked.push(d);
		picked.sort((a, b) => a.position - b.position);
		return { title: 'VM-stilling', rows: picked.map((d) => ({ rank: `${d.position}.`, name: d.driver, value: String(d.points), highlighted: hit(d.driver) })) };
	}

	return null;
}

function ssGolfTableRow(p, highlighted) {
	return {
		rank: p.positionDisplay || (p.position != null ? `${p.position}.` : '–'),
		name: p.player,
		value: p.score || '–',
		highlighted,
	};
}

/**
 * The specialist we hand the reader off to for DEPTH (squad lists, xG, lap
 * charts). VISJON v3: we don't compete on depth, we link to the one who owns it.
 *
 * Deliberately NARROW, and identical to the Swift map: a link that 404s or lands
 * on a front page is worse than no link, so only search endpoints we are
 * confident about are here; every other sport simply has no MER section.
 */
function ssSpecialistLink(sport, name) {
	const who = String(name || '').trim();
	if (!who) return null;
	const table = {
		football: { label: 'FotMob', prefix: 'https://www.fotmob.com/search?term=' },
		cycling: { label: 'ProCyclingStats', prefix: 'https://www.procyclingstats.com/search.php?term=' },
		esports: { label: 'Liquipedia', prefix: 'https://liquipedia.net/counterstrike/index.php?search=' },
	};
	const t = table[typeof ssCanonicalNewsSport === 'function' ? ssCanonicalNewsSport(sport) : String(sport || '')];
	if (!t) return null;
	return { label: t.label, url: t.prefix + encodeURIComponent(who) };
}

// ── Dashboard prototype extension (DOM) ──────────────────────────────────────
if (typeof Dashboard !== 'undefined') Object.assign(Dashboard.prototype, {

	/** Remember an entry so a row can reopen it by key (the row markup carries a
	 *  key, never a serialised object). */
	rememberEntity(entry) {
		const key = ssNormalize(ssEntityName(entry)).trim();
		if (!key) return '';
		this._entityEntries = this._entityEntries || new Map();
		if (!this._entityEntries.has(key)) this._entityEntries.set(key, entry);
		return key;
	},

	entityForKey(key) {
		return (this._entityEntries && this._entityEntries.get(key)) || null;
	},

	/** The registry record behind an entry, when entities.json knows it — the
	 *  source of the avatar (WP-185/186) and of the stable id for news matching. */
	entityRecord(entry) {
		if (typeof this.identityIndex !== 'function') return null;
		const { byName } = this.identityIndex();
		return byName.get(ssNormalize(ssEntityName(entry)).trim()) || null;
	},

	/** The whole page for one entity, as HTML. Pure-ish (reads this.allEvents /
	 *  standings / recentResults / news) so a test can assert the composed page
	 *  without a DOM. */
	entityPageHtml(entry) {
		const name = ssEntityName(entry);
		const record = this.entityRecord(entry);
		const sport = (entry && entry.sport) || (record && record.sport) || '';
		const avatar = (typeof ssEntityIdentity === 'function' && typeof ssEntityAvatar === 'function')
			? ssEntityAvatar(ssEntityIdentity(record))
			: '';
		const sub = [this.sportLabel ? this.sportLabel(sport) : sport, record && record.type ? SS_EP_TYPE_NB[record.type] || '' : '']
			.filter(Boolean).join(' · ');

		let html = `<div class="ep-head">
			<span class="ep-avatar" aria-hidden="true">${avatar || (this.sportIconCell ? this.sportIconCell(sport) : '')}</span>
			<span class="ep-id"><span class="ep-name">${escapeHtml(name)}</span>${sub ? `<span class="ep-sub">${escapeHtml(sub)}</span>` : ''}</span>
			<button type="button" class="sheet-close" data-entity-close>Lukk</button>
		</div>`;

		let any = false;

		// 1. KOMMENDE — the next few events, the first one expanded with the
		//    når·hva·hvor detail (incl. the golfer's own tee time via followDetail).
		const upcoming = ssEntityUpcoming(this.allEvents, entry);
		if (upcoming.length) {
			any = true;
			html += `<section class="ep-section"><h3 class="ep-h">Kommende</h3>`
				+ `<div class="ep-detail">${this.followDetail(upcoming[0], entry)}</div>`
				+ upcoming.slice(1).map((e) => this.entityUpcomingRow(e)).join('')
				+ `</section>`;
		}

		// 2. SISTE RESULTAT — the same rows the Nyheter board renders.
		const results = ssEntityResults(typeof ssResultRows === 'function' ? ssResultRows(this.recentResults) : [], entry);
		if (results.length) {
			any = true;
			html += `<section class="ep-section"><h3 class="ep-h">Siste resultat</h3>${results.map((r) => this.resultRow(r)).join('')}</section>`;
		}

		// 3. TABELL — only when it is genuinely this entity's table.
		const table = ssEntityStandingsTable(this.standings, Object.assign({}, typeof entry === 'string' ? { name: entry } : entry, { sport }));
		if (table && table.rows.length) {
			any = true;
			html += `<section class="ep-section"><h3 class="ep-h">${escapeHtml(table.title)}</h3>`
				+ table.rows.map((r) => `<div class="ep-table-row${r.highlighted ? ' is-entity' : ''}">`
					+ `<span class="ep-rank">${escapeHtml(r.rank)}</span>`
					+ `<span class="ep-team">${escapeHtml(r.name)}</span>`
					+ `<span class="ep-val">${escapeHtml(r.value)}</span></div>`).join('')
				+ `</section>`;
		}

		// 4. SISTE NYTT — pointers to the source, never our own summary.
		const news = ssEntityNews(this.news, entry, record && record.id);
		if (news.length) {
			any = true;
			html += `<section class="ep-section"><h3 class="ep-h">Siste nytt</h3>${news.map((it) => this.newsRow(it)).join('')}</section>`;
		}

		// 5. MER — the hand-off. Never a guessed URL.
		const link = ssSpecialistLink(sport, name);
		if (link) {
			html += `<section class="ep-section"><h3 class="ep-h">Mer</h3>`
				+ `<a class="ep-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">Åpne i ${escapeHtml(link.label)} ↗</a>`
				+ `<p class="ep-note">Vi svarer på når og hvor. Dybden — tropp, statistikk — er andres fag.</p></section>`;
		}

		if (!any) {
			html += `<p class="ep-empty">Ingenting på tavla om ${escapeHtml(name)} akkurat nå. Siden fyller seg når det kommer events, resultater eller nyheter.</p>`;
		}
		return html;
	},

	/** One quiet extra KOMMENDE line (the first event is shown expanded above). */
	entityUpcomingRow(e) {
		const d = new Date(e.time);
		const when = `${d.toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' })} ${this.osloTime(d)}`;
		const what = (e.homeTeam && e.awayTeam) ? `${ssShortName(e.homeTeam)} – ${ssShortName(e.awayTeam)}` : (e.title || '');
		const chan = (Array.isArray(e.streaming) && e.streaming[0] && (e.streaming[0].platform || e.streaming[0])) || '';
		return `<div class="ep-row"><span class="ep-when">${escapeHtml(when)}</span>`
			+ `<span class="ep-what">${escapeHtml(what)}</span>`
			+ `<span class="ep-where">${chan ? escapeHtml(String(chan)) : '<span class="tbd">–</span>'}</span></div>`;
	},

	/** The event-detail links that lead TO the entity page (WP-170): one per side
	 *  this event is about (each team, each Norwegian player). Reuses
	 *  `followTargets` so it resolves the SAME real entities.json ids the «Følg X»
	 *  buttons use — so the page's news matching keys on the stable id. Empty (no
	 *  section) when nothing resolves — the honest degradation. */
	entityActionsHtml(e) {
		if (typeof this.followTargets !== 'function') return '';
		const targets = this.followTargets(e);
		if (!targets.length) return '';
		const links = targets.map((t) => {
			const entry = { id: t.entityId, name: t.entityName, sport: t.sport, aliases: [] };
			const key = this.rememberEntity ? this.rememberEntity(entry) : '';
			return `<button type="button" class="ev-act ev-entity" data-entity-key="${escapeHtml(key)}">${escapeHtml(t.entityName)} →</button>`;
		}).join('');
		return `<span class="d-entities">${links}</span>`;
	},

	openEntityPage(entry) {
		const wrap = document.getElementById('entity-page');
		const body = document.getElementById('entity-page-body');
		if (!wrap || !body || !entry) return;
		body.innerHTML = this.entityPageHtml(entry);
		wrap.hidden = false;
	},

	closeEntityPage() {
		const wrap = document.getElementById('entity-page');
		if (wrap) wrap.hidden = true;
	},

	/** Delegated open/close wiring — bound once, survives every re-render. */
	bindEntityPage() {
		if (this._entityPageBound) return;
		this._entityPageBound = true;
		const wrap = document.getElementById('entity-page');
		if (wrap) {
			wrap.addEventListener('click', (evt) => {
				if (evt.target.closest('[data-entity-close]')) this.closeEntityPage();
			});
		}
		document.addEventListener('keydown', (evt) => {
			if (evt.key === 'Escape') this.closeEntityPage();
		});
		// The event-detail «entitet →» links live inside the agenda / Nyheter
		// detail markup, so a document-level delegate catches them once, wherever
		// they are re-rendered. `.ev-entity` is a <button>, not an <a>, so the
		// agenda's own row-toggle listener ignores it.
		document.addEventListener('click', (evt) => {
			const link = evt.target.closest && evt.target.closest('.ev-entity[data-entity-key]');
			if (!link) return;
			evt.preventDefault();
			const entry = this.entityForKey ? this.entityForKey(link.dataset.entityKey) : null;
			if (entry) this.openEntityPage(entry);
		});
	},
});

/** Norwegian words for an entities.json `type` (mirrors FollowVocabulary.typeLabel). */
const SS_EP_TYPE_NB = {
	athlete: 'utøver', team: 'lag', tournament: 'turnering',
	league: 'liga', sport: 'sport', category: 'kategori',
};

if (typeof window !== 'undefined') {
	window.ssEntityUpcoming = ssEntityUpcoming;
	window.ssEntityResults = ssEntityResults;
	window.ssEntityNews = ssEntityNews;
	window.ssEntityStandingsTable = ssEntityStandingsTable;
	window.ssSpecialistLink = ssSpecialistLink;
}
if (typeof module !== 'undefined' && module.exports) {
	module.exports = { ssEntityUpcoming, ssEntityResults, ssEntityNews, ssEntityStandingsTable, ssSpecialistLink };
}
