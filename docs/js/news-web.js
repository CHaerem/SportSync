// news-web.js — the Nyheter board (app-parity, WP-154): a JS twin of the iOS
// NewsBoard/NewsView. It renders three sections into #nyheter/#fremover under the
// «Nyheter» segment (the fourth iOS section — the editorial headline — stays the
// quiet hero line above, so it isn't repeated here):
//
//   1. NYTT     — news.json pointers, lens-matched, newest first (capped).
//   2. RESULTAT — recent results for what you follow, ALL sports in
//                 recent-results.json (WP-171: football with goal scorers, golf
//                 leaderboards, F1 podiums, tennis), capped + «Vis alle».
//   3. FREMOVER — forvarsler beyond 14 d (rendered by dashboard.renderFremover
//                 into #fremover, which now lives inside the Nyheter view).
//
// The lens mirrors NewsLens.swift: a pointer is shown when its entityIds hit the
// followed set OR its sport is a followed WHOLE-sport. An EMPTY profile is
// catalog-wide (show all recent news) — the web's catalog-wide default elsewhere.
//
// Pure `ssNewsRelevant` / `ssCanonicalNewsSport` are unit-tested; the DOM wiring
// (renderNyheter / bindRootTabs) is a thin Dashboard prototype extension.

/** Norwegian display label for a news pointer's story-kind (WP-175). Only the
 *  four server-classified types render; an unknown or absent `type` yields no
 *  label, so the row's type slot stays empty — additive, and a pointer the server
 *  didn't classify looks exactly as it did before WP-175. Allowlist lookup: an
 *  attacker-supplied `type` value never reaches the DOM (unknown key → ''). */
const SS_NEWS_TYPE_LABELS = { kamprapport: 'Kamprapport', overgang: 'Overgang', skade: 'Skade', intervju: 'Intervju' };
function ssNewsTypeLabel(type) {
	return SS_NEWS_TYPE_LABELS[String(type || '').toLowerCase()] || '';
}

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

// ── RESULTAT (WP-171): one row DNA for every sport ───────────────────────────
// «Hva skjedde i går» must be answered for ALL you follow — the board used to
// read only `recent-results.json`'s `.football` key while The Open's final
// leaderboard and the F1 podium sat unused in the same file. The sports have
// different result DNA (golf = leaderboard position/score, F1 = finishing order,
// tennis = sets), so instead of three special cases each sport is projected onto
// ONE row shape — the same shape NewsBoard.swift's NewsResultRow carries:
//
//   { id, sport, title, outcome, meta, date, details[], names[] }
//
//   • title    — WHO/WHAT played (deliberately outcome-neutral: the tennis title
//                is the two names sorted alphabetically, never "winner – loser").
//   • outcome  — the spoiler-carrying payload (score / winner + score).
//   • details  — the extra lines the fetchers already pay for but nobody showed:
//                football goal scorers with minute, the golf top-3 + Norwegians,
//                the F1 podium. Outcome-revealing, so they live WITH `outcome`
//                (iOS masks both behind the same «Vis resultat» shield).
//   • names    — the participant names the on-device lens matches against.

/** The result cap per section (ro — the RESULTAT section must never become a
 *  result stream). Everything beyond it is reachable in a «Vis alle» disclosure,
 *  never dropped. Mirrors NewsBoard.resultCap. */
const SS_RESULT_CAP = 5;

/** Detail lines per row. Ro again: a 10-goal World Cup match would otherwise
 *  render eleven scorer lines and turn one row into a wall. Five is the honest
 *  floor — a golf row's top-3 PLUS both Norwegians must survive it. Mirrors
 *  NewsBoard.detailCap. */
const SS_RESULT_DETAIL_CAP = 5;

const SS_GOLF_TOUR_NB = { pga: 'PGA Tour', dpWorld: 'DP World Tour' };

/** Cap the detail lines, saying honestly how many were left out. */
function ssCapDetails(lines) {
	const list = (lines || []).filter(Boolean);
	if (list.length <= SS_RESULT_DETAIL_CAP) return list;
	return list.slice(0, SS_RESULT_DETAIL_CAP).concat([`+${list.length - SS_RESULT_DETAIL_CAP} til`]);
}

/** "8' Kristian Eriksen (SK Brann)" — one line per goal, minute first (the data
 *  fetch-results.js has always carried in `goalScorers` and no surface rendered). */
function ssGoalScorerLines(result) {
	const scorers = Array.isArray(result && result.goalScorers) ? result.goalScorers : [];
	return scorers.map((g) => {
		const player = String((g && g.player) || '').trim();
		if (!player) return '';
		const minute = String((g && g.minute) || '').trim();
		const team = String((g && g.team) || '').trim();
		return `${minute ? `${minute} ` : ''}${player}${team ? ` (${team})` : ''}`;
	}).filter(Boolean);
}

/** "1. Ryan Fox −10" — a leaderboard/finishing-order line. */
function ssPositionLine(position, name, score) {
	const who = String(name || '').trim();
	if (!who) return '';
	const pos = position != null && position !== '' ? `${position}. ` : '';
	const sc = String(score == null ? '' : score).trim();
	return `${pos}${who}${sc ? ` ${sc}` : ''}`;
}

/** Project `recent-results.json` onto the shared row DNA — every sport in the
 *  file, not just football. Pure; the lens filters afterwards. */
function ssResultRows(recentResults) {
	const data = recentResults || {};
	const rows = [];

	for (const r of Array.isArray(data.football) ? data.football : []) {
		const home = String(r.homeTeam || '').trim(), away = String(r.awayTeam || '').trim();
		if (!home || !away) continue;
		const hasScore = Number.isFinite(r.homeScore) && Number.isFinite(r.awayScore);
		rows.push({
			id: `football|${home}|${away}|${r.date || ''}`,
			sport: 'football',
			title: `${home} – ${away}`,
			outcome: hasScore ? `${r.homeScore}–${r.awayScore}` : '',
			meta: String(r.league || ''),
			date: r.date || '',
			details: ssCapDetails(ssGoalScorerLines(r)),
			names: [home, away],
		});
	}

	const golf = (data.golf && typeof data.golf === 'object') ? data.golf : {};
	for (const key of Object.keys(golf)) {
		const tour = golf[key];
		// Only a FINISHED tournament is a result; an in-progress leaderboard
		// belongs to the agenda/live surface, not to «hva skjedde».
		if (!tour || tour.status !== 'final') continue;
		const top = Array.isArray(tour.topPlayers) ? tour.topPlayers : [];
		const norwegians = Array.isArray(tour.norwegianPlayers) ? tour.norwegianPlayers : [];
		if (!top.length) continue;
		const winner = top[0];
		const details = top.slice(0, 3).map((p) => ssPositionLine(p.position, p.player, p.score))
			.concat(norwegians.map((p) => ssPositionLine(p.position, p.player, p.score)))
			.filter(Boolean);
		rows.push({
			id: `golf|${key}|${tour.tournamentName || ''}`,
			sport: 'golf',
			title: String(tour.tournamentName || 'Golfturnering'),
			outcome: ssPositionLine('', winner.player, winner.score),
			meta: [SS_GOLF_TOUR_NB[key] || key, 'sluttresultat'].filter(Boolean).join(' · '),
			date: tour.date || '',
			details: ssCapDetails(details),
			names: top.map((p) => p.player).concat(norwegians.map((p) => p.player)).filter(Boolean),
		});
	}

	for (const r of Array.isArray(data.f1) ? data.f1 : []) {
		const drivers = Array.isArray(r.topDrivers) ? r.topDrivers : [];
		if (!drivers.length) continue;
		rows.push({
			id: `f1|${r.raceName || ''}|${r.date || ''}`,
			sport: 'f1',
			title: String(r.raceName || 'Grand Prix'),
			outcome: String(drivers[0].driver || ''),
			meta: [String(r.circuit || ''), String(r.type || '')].filter(Boolean).join(' · '),
			date: r.date || '',
			details: drivers.slice(0, 3).map((d) => ssPositionLine(d.position, d.driver, '')).filter(Boolean),
			names: drivers.map((d) => d.driver).filter(Boolean),
		});
	}

	for (const r of Array.isArray(data.tennis) ? data.tennis : []) {
		const winner = String(r.winner || '').trim(), loser = String(r.loser || '').trim();
		if (!winner || !loser) continue;
		// Outcome-neutral title: the pair sorted alphabetically, so the row itself
		// never spoils who won (the outcome lives in `outcome`, which iOS masks).
		const pair = [winner, loser].sort((a, b) => a.localeCompare(b, 'nb'));
		rows.push({
			id: `tennis|${winner}|${loser}|${r.date || ''}`,
			sport: 'tennis',
			title: `${pair[0]} – ${pair[1]}`,
			outcome: [winner, String(r.score || '')].filter(Boolean).join(' '),
			meta: [String(r.tournament || ''), String(r.round || '')].filter(Boolean).join(' · '),
			date: r.date || '',
			details: [],
			names: [winner, loser],
		});
	}

	return rows;
}

/** Order the rows so EVERY sport gets an answer before any sport gets a second
 *  one: per-sport newest-first, then a round-robin across sports (sports ordered
 *  by their own newest result). Without it a busy football weekend would push
 *  The Open's final result out of the capped section entirely. Mirrors
 *  NewsBoard.interleaveBySport. */
function ssInterleaveBySport(rows) {
	const stamp = (r) => { const t = Date.parse((r && r.date) || ''); return Number.isNaN(t) ? -Infinity : t; };
	const groups = new Map();
	for (const r of rows || []) {
		if (!groups.has(r.sport)) groups.set(r.sport, []);
		groups.get(r.sport).push(r);
	}
	for (const list of groups.values()) list.sort((a, b) => stamp(b) - stamp(a));
	const order = Array.from(groups.keys()).sort((a, b) => stamp(groups.get(b)[0]) - stamp(groups.get(a)[0]));
	const out = [];
	for (let i = 0; ; i++) {
		let took = false;
		for (const sport of order) {
			const list = groups.get(sport);
			if (i < list.length) { out.push(list[i]); took = true; }
		}
		if (!took) break;
	}
	return out;
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
		const canonical = (typeof ssCanonicalIdMap === 'function') ? ssCanonicalIdMap(this.entities) : null;
		const catMembers = (this.assistantVocab && this.assistantVocab.categories && this.assistantVocab.categories.members) || {};
		for (const rule of live) {
			const id = rule && rule.entityId;
			if (!id) continue;
			entityIds.add(id);
			// WP-162: a rule still frozen on a FORMER (edition-stamped) id also
			// matches news stamped with the canonical one — the lens follows the
			// entity, not the id string it was followed under.
			if (canonical && canonical.has(id)) entityIds.add(canonical.get(id).id);
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
		// WP-175: the story-kind as a quiet grey tag, first in the meta line. Absent
		// for pointers the server didn't classify (the slot simply stays empty).
		const typeLabel = ssNewsTypeLabel(item.type);
		const type = typeLabel ? `<span class="nw-type">${escapeHtml(typeLabel)}</span>` : '';
		const meta = [
			type,
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

	/** One RESULTAT row, in the shared per-sport DNA (WP-171): what · quiet meta ·
	 *  the detail lines the data already carries (goal scorers with minute, the
	 *  golf top-3 + Norwegians, the F1 podium) · the outcome on the right. Every
	 *  data string goes through escapeHtml (client-render rule). */
	resultRow(r) {
		const title = `<span class="rs-title">${escapeHtml(r.title || '')}</span>`;
		const outcome = r.outcome ? `<span class="rs-score">${escapeHtml(r.outcome)}</span>` : '';
		const meta = r.meta ? `<span class="rs-meta">${escapeHtml(r.meta)}</span>` : '';
		const details = (Array.isArray(r.details) ? r.details : [])
			.map((line) => `<span class="rs-meta rs-detail">${escapeHtml(line)}</span>`)
			.join('');
		return `<div class="rs-row"><span class="rs-main">${title}${meta}${details}</span>${outcome}</div>`;
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

	/** Recent results for what you follow — ALL sports in recent-results.json
	 *  (WP-171), not just football. A row is in when the profile is empty
	 *  (catalog-wide, the web's default elsewhere), when its sport is a followed
	 *  WHOLE-sport, or when a followed entity's name hits one of its
	 *  participants. Returned interleaved per sport, uncapped — the caller caps
	 *  the visible part and puts the rest in the «Vis alle» disclosure. */
	resultItems() {
		const rows = ssResultRows(this.recentResults);
		const lens = this.newsLens();
		let list = rows;
		if (!lens.catalogWide) {
			const names = [];
			const live = (this.profile && this.profile.rules || []).filter((r) => !r.deleted).map((r) => r.rule || r);
			for (const rule of live) if (rule && rule.entityName) names.push(rule.entityName);
			list = rows.filter((r) => {
				if (lens.sports.has(ssCanonicalNewsSport(r.sport))) return true;
				const hay = (r.names || []).join(' ');
				return names.some((n) => ssContainsTerm(hay, n));
			});
		}
		return ssInterleaveBySport(list);
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
			// Ro: a capped section, with the remainder in one quiet disclosure
			// («Vis alle») instead of an endless result stream. Same cap the iOS
			// board uses (NewsBoard.resultCap).
			const shown = results.slice(0, SS_RESULT_CAP);
			const rest = results.slice(SS_RESULT_CAP);
			html += '<section class="nw-section"><h2 class="nw-head">Resultat</h2>';
			html += shown.map((r) => this.resultRow(r)).join('');
			if (rest.length) {
				html += `<details class="fremover rs-all"><summary>Vis alle <span class="fwd-count">${rest.length}</span></summary>`;
				html += `<div class="fwd-body">${rest.map((r) => this.resultRow(r)).join('')}</div></details>`;
			}
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
	module.exports = { ssNewsRelevant, ssCanonicalNewsSport, ssNewsTypeLabel, ssResultRows, ssInterleaveBySport, SS_RESULT_CAP };
}
