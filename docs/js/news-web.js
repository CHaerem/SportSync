// news-web.js — the Nyheter board (app-parity, WP-154): a JS twin of the iOS
// NewsBoard/NewsView. It renders three sections into #nyheter/#fremover under the
// «Nyheter» segment (the fourth iOS section — the editorial headline — stays the
// quiet hero line above, so it isn't repeated here):
//
//   1. NYTT     — news.json pointers, lens-matched, newest first (capped).
//   2. RESULTAT — followed teams' recent football results (or catalog-wide).
//   3. FREMOVER — forvarsler beyond 14 d (rendered by dashboard.renderFremover
//                 into #fremover, which now lives inside the Nyheter view).
//
// The lens mirrors NewsLens.swift: a pointer is shown when its entityIds hit the
// followed set OR its sport is a followed WHOLE-sport. An EMPTY profile is
// catalog-wide (show all recent news) — the web's catalog-wide default elsewhere.
//
// Pure `ssNewsRelevant` / `ssCanonicalNewsSport` are unit-tested; the DOM wiring
// (renderNyheter / bindRootTabs) is a thin Dashboard prototype extension.

/** Normalise a news item's sport tag so "formula1" ≡ "f1" etc (mirrors
 *  NewsLens.canonicalSport). Lowercased; a few common aliases folded in. */
function ssCanonicalNewsSport(sport) {
	const s = String(sport || '').trim().toLowerCase();
	const alias = { formula1: 'f1', motorsport: 'f1', soccer: 'football' };
	return alias[s] || s;
}

/** Is a news pointer in the lens? `lens` is either {catalogWide:true} (empty
 *  profile → everything) or {entityIds:Set, sports:Set}. Mirrors NewsLens.matches:
 *  an entityId hit OR a followed whole-sport hit. */
function ssNewsRelevant(item, lens) {
	if (!lens || lens.catalogWide) return true;
	const ids = Array.isArray(item.entityIds) ? item.entityIds : [];
	if (ids.some((id) => lens.entityIds.has(id))) return true;
	return lens.sports.has(ssCanonicalNewsSport(item.sport));
}

// ── Dashboard prototype extension (DOM) ──────────────────────────────────────
if (typeof Dashboard !== 'undefined') Object.assign(Dashboard.prototype, {
	/** The news lens derived from the on-device profile. Whole-sport follows are
	 *  the build-entities `sport-`/`category-` id convention (the web has no synced
	 *  entity index — exactly the iOS `nil` fallback). Empty profile → catalog-wide. */
	newsLens() {
		const profile = this.profile;
		if (!this.hasProfile || !profile || !Array.isArray(profile.rules)) return { catalogWide: true };
		const live = profile.rules.filter((r) => !r.deleted).map((r) => r.rule || r);
		const entityIds = new Set(), sports = new Set();
		const catMembers = (this.assistantVocab && this.assistantVocab.categories && this.assistantVocab.categories.members) || {};
		for (const rule of live) {
			const id = rule && rule.entityId;
			if (!id) continue;
			entityIds.add(id);
			if (id.indexOf('sport-') === 0) sports.add(ssCanonicalNewsSport(id.slice('sport-'.length)));
			else if (id.indexOf('category-') === 0) {
				const cat = id.slice('category-'.length);
				for (const s of (catMembers[cat] || [])) sports.add(ssCanonicalNewsSport(s));
			}
		}
		return { entityIds, sports };
	},

	/** A quiet Norwegian relative time ("3 t siden", "i går") for a news item's
	 *  publishedAt, or "" when undateable. */
	newsRelativeTime(iso) {
		if (!iso) return '';
		const then = Date.parse(iso);
		if (Number.isNaN(then)) return '';
		const diffMs = then - Date.now();
		const mins = Math.round(diffMs / 60000);
		try {
			const rtf = new Intl.RelativeTimeFormat('nb', { numeric: 'auto', style: 'short' });
			if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
			const hrs = Math.round(mins / 60);
			if (Math.abs(hrs) < 24) return rtf.format(hrs, 'hour');
			return rtf.format(Math.round(hrs / 24), 'day');
		} catch { return ''; }
	},

	/** The Norwegian display label for a canonical sport tag (shared lens-config). */
	sportLabel(sport) {
		const nb = this.lensConfig && this.lensConfig.sportNb;
		const key = ssCanonicalNewsSport(sport);
		return (nb && nb[key]) || sport || '';
	},

	/** One NYTT row: title (opens the source in a new tab — a pointer, never
	 *  inlined article text), then a quiet sport · source ↗ · relative-time line. */
	newsRow(item) {
		const url = String(item.link || '');
		const rel = this.newsRelativeTime(item.publishedAt);
		const sep = '<span class="nw-sep"> · </span>';
		// Skip the sport tag when it's the uninformative "general" (most RSS feeds)
		// or empty — the source + time already carry the row (avoids "general ·" noise).
		const canon = ssCanonicalNewsSport(item.sport);
		const sport = (canon && canon !== 'general') ? `<span class="nw-sport">${escapeHtml(this.sportLabel(item.sport))}</span>` : '';
		const meta = [
			sport,
			`<span class="nw-source">${escapeHtml(item.source || '')} ↗</span>`,
			rel ? `<span class="nw-time">${escapeHtml(rel)}</span>` : '',
		].filter(Boolean).join(sep);
		const title = escapeHtml(item.title || '');
		const inner = `<span class="nw-title">${title}</span><span class="nw-meta">${meta}</span>`;
		return url
			? `<a class="nw-row" href="${escapeHtml(url)}" target="_blank" rel="noopener">${inner}</a>`
			: `<div class="nw-row">${inner}</div>`;
	},

	/** One RESULTAT row: a followed team's recent football result with its score. */
	resultRow(r) {
		const title = `${escapeHtml(r.homeTeam || '')} – ${escapeHtml(r.awayTeam || '')}`;
		const hasScore = Number.isFinite(r.homeScore) && Number.isFinite(r.awayScore);
		const score = hasScore ? `<span class="rs-score">${r.homeScore}–${r.awayScore}</span>` : '';
		const meta = r.league ? `<span class="rs-meta">${escapeHtml(r.league)}</span>` : '';
		return `<div class="rs-row"><span class="rs-main"><span class="rs-title">${title}</span>${meta}</span>${score}</div>`;
	},

	/** The lens-matched news, newest first, capped. */
	newsItems(max = 20) {
		const lens = this.newsLens();
		return (this.news || [])
			.filter((it) => ssNewsRelevant(it, lens))
			.slice()
			.sort((a, b) => (Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0)))
			.slice(0, max);
	},

	/** Followed teams' recent football results (newest first); catalog-wide when
	 *  the profile is empty. Matched by an entity NAME hit on either team. */
	resultItems(max = 8) {
		const football = (this.recentResults && this.recentResults.football) || [];
		const lens = this.newsLens();
		let list = football;
		if (!lens.catalogWide) {
			const names = [];
			const live = (this.profile && this.profile.rules || []).filter((r) => !r.deleted).map((r) => r.rule || r);
			for (const rule of live) if (rule && rule.entityName) names.push(rule.entityName);
			list = football.filter((r) => {
				const hay = `${r.homeTeam || ''} ${r.awayTeam || ''}`;
				return names.some((n) => ssContainsTerm(hay, n));
			});
		}
		return list.slice()
			.sort((a, b) => (Date.parse(b.date || 0) - Date.parse(a.date || 0)))
			.slice(0, max);
	},

	/** Render the Nyheter board's NYTT + RESULTAT sections into #nyheter. FREMOVER
	 *  is rendered separately by renderFremover into #fremover (below, same view). */
	renderNyheter() {
		const el = document.getElementById('nyheter');
		if (!el) return;
		const news = this.newsItems();
		const results = this.resultItems();
		let html = '';
		html += '<section class="nw-section"><h2 class="nw-head">Nytt</h2>';
		html += news.length
			? news.map((it) => this.newsRow(it)).join('')
			: '<p class="nw-empty">Ingen nyheter om det du følger akkurat nå.</p>';
		html += '</section>';
		if (results.length) {
			html += '<section class="nw-section"><h2 class="nw-head">Resultat</h2>';
			html += results.map((r) => this.resultRow(r)).join('');
			html += '</section>';
		}
		el.innerHTML = html;
	},

	/** The Uka | Nyheter segmented control. Toggles the two root views; the FREMOVER
	 *  disclosure lives inside the Nyheter view (rendered by renderFremover). */
	bindRootTabs() {
		const tabs = Array.from(document.querySelectorAll('.root-tab'));
		const views = { uka: document.getElementById('view-uka'), nyheter: document.getElementById('view-nyheter') };
		if (!tabs.length || !views.uka || !views.nyheter) return;
		const show = (name) => {
			for (const t of tabs) {
				const on = t.dataset.view === name;
				t.classList.toggle('is-active', on);
				t.setAttribute('aria-selected', String(on));
			}
			views.uka.hidden = name !== 'uka';
			views.nyheter.hidden = name !== 'nyheter';
		};
		for (const t of tabs) t.addEventListener('click', () => show(t.dataset.view));
		show('uka');
	},
});

// Node/vitest interop (pure helpers).
if (typeof module !== 'undefined' && module.exports) {
	module.exports = { ssNewsRelevant, ssCanonicalNewsSport };
}
