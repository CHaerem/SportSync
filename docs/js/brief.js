// brief.js — «Min brief»: the deterministic, on-device personal brief (WP-174).
//
// The editorial hero line is DELIBERATELY catalog-wide (WP-96: "NOT a line tuned
// to the owner's follows"), so it is the surface furthest from the go-to promise.
// Everything a personal brief needs is ALREADY on the client — the lens, events,
// results and news — so per VISJON v3 the server distils ONCE and the client
// COMPOSES the personal brief locally. No LLM (the web-LLM spike found Norwegian
// quality at a browser-model's size the binding constraint): the brief is
// DETERMINISTIC text composition.
//
// TWIN DISCIPLINE (the core of this WP): the pure composer `ssComposeBrief` is
// a bit-for-bit twin of ios/Sportivista/News/MinBrief.swift `MinBrief.compose`,
// PINNED by the shared golden fixtures in tests/fixtures/brief-vectors/ (à la the
// feed-vectors). Both platforms decode the same {input:context, expected:brief}
// files and must produce the SAME string. Only PARAMETERS/SELECTION differ per
// platform (documented in tests/fixtures/brief-vectors/DIVERGENCES.md); the
// COMPOSITION is one algorithm.
//
// The composer takes a SEMANTIC BriefContext (already-selected upcoming events,
// results, and a news count — each field a plain primitive, never HTML), so the
// composition decisions (frame, wording, spoiler phrasing, capping, max-length)
// are what the fixtures freeze. Each platform builds the context from its own
// data with its own already-twinned machinery (relevance lens, result rows, news
// lens); the web half lives in the Dashboard prototype extension at the bottom.
//
// Depends on shared-constants.js (ssShortName, ssParticipantMatchup, ssNormalize,
// ssContainsTerm, ssOsloHour, MS_PER_DAY), lens.js (ssLensHaystack) and
// news-web.js (ssNewsRelevant, ssCanonicalNewsSport) — all loaded before this file.

// ── Composition tunables (twinned with MinBrief.swift) ───────────────────────
/** How many upcoming events the brief NAMES. Ro: the brief is a line, not a list. */
const SS_BRIEF_MAX_UPCOMING = 2;
/** How many recent results the brief names. */
const SS_BRIEF_MAX_RESULTS = 2;
/** Only events starting within this window feed «i din verden i dag». */
const SS_BRIEF_HORIZON_DAYS = 7;
/** Hard ceiling on the whole brief (characters). Enforced by dropping trailing
 *  sentences, then a word-boundary truncation of the first — so the line never
 *  runs away no matter how long a title is. */
const SS_BRIEF_MAX_LEN = 220;

// ── The pure composer (TWIN of MinBrief.compose) ─────────────────────────────

/** Norwegian list join: "a" / "a og b" / "a, b og c". */
function ssBriefJoin(list) {
	const items = (list || []).filter((s) => s && s.length);
	if (items.length === 0) return '';
	if (items.length === 1) return items[0];
	return `${items.slice(0, -1).join(', ')} og ${items[items.length - 1]}`;
}

/** Capitalise the first character (Norwegian-safe: a single-char uppercase). */
function ssBriefSentenceCase(s) {
	if (!s || !s.length) return s || '';
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/** One upcoming event → a calm fragment. The day frame ("i dag") is on the whole
 *  brief, so a today-fragment needs no day word — only its time. */
function ssBriefUpcomingFragment(e) {
	const title = e.title || '';
	if (e.day === 'today') return e.time ? `${title} ${e.time}` : title;
	if (e.day === 'tomorrow') return e.time ? `${title} i morgen ${e.time}` : `${title} i morgen`;
	// later
	return e.weekday ? `${title} ${e.weekday}` : title;
}

/** One result → a calm fragment. SPOILER always wins: a screened entity's result
 *  is named WITHOUT its outcome ("resultatet fra X venter på deg"). Otherwise a
 *  scoreline sport ("A – B endte 2–1") reads differently from a winner sport
 *  ("The Open ble vunnet av Ryan Fox −10"). */
function ssBriefResultFragment(r) {
	const suffix = r.day === 'yesterday' ? ' i går' : (r.day === 'today' ? ' i dag' : '');
	const title = r.title || '';
	if (r.spoiler) return `resultatet fra ${title}${suffix} venter på deg`;
	const outcome = r.outcome || '';
	if (r.kind === 'score') return `${title} endte ${outcome}${suffix}`;
	return `${title} ble vunnet av ${outcome}${suffix}`;
}

/** The news clause: "N nyheter om det du følger" (calm, no exclamation). */
function ssBriefNewsFragment(n) {
	return n === 1 ? 'én nyhet om det du følger' : `${n} nyheter om det du følger`;
}

/** Enforce the max length: keep whole sentences from the front while they fit,
 *  then, only if even the first alone overflows, word-boundary-truncate it + "…". */
function ssBriefClamp(sentences, max) {
	let out = '';
	for (const sent of sentences) {
		const candidate = out ? `${out} ${sent}` : sent;
		if (candidate.length <= max) out = candidate;
		else break;
	}
	if (out) return out;
	// The first sentence alone is too long — hard-truncate at a word boundary.
	let cut = sentences[0].slice(0, max - 1);
	const lastSpace = cut.lastIndexOf(' ');
	if (lastSpace > 0) cut = cut.slice(0, lastSpace);
	return `${cut.replace(/\s+$/, '')}…`;
}

/** Compose the personal brief from a SEMANTIC context. Returns "" when there is
 *  nothing to say (the caller then falls back to the editorial line — graceful
 *  degradation, never an empty «I din verden»). Bit-for-bit twin of
 *  MinBrief.compose — see the file header. `context`:
 *    { upcoming: [{title, day:'today'|'tomorrow'|'later', evening, time, weekday}],
 *      results:  [{title, outcome, kind:'score'|'winner', spoiler, day:'yesterday'|'today'|'earlier'}],
 *      newsCount: int } */
function ssComposeBrief(context) {
	const ctx = context || {};
	const up = (Array.isArray(ctx.upcoming) ? ctx.upcoming : []).slice(0, SS_BRIEF_MAX_UPCOMING);
	const rs = (Array.isArray(ctx.results) ? ctx.results : []).slice(0, SS_BRIEF_MAX_RESULTS);
	const newsCount = Math.max(0, Math.floor(ctx.newsCount || 0));

	// Segments in priority order: upcoming → results → news.
	const segments = [];
	if (up.length) {
		segments.push({
			kind: 'upcoming',
			text: ssBriefJoin(up.map(ssBriefUpcomingFragment)),
			evening: up[0].day === 'today' && !!up[0].evening,
		});
	}
	if (rs.length) segments.push({ kind: 'results', text: ssBriefJoin(rs.map(ssBriefResultFragment)) });
	if (newsCount > 0) segments.push({ kind: 'news', text: ssBriefNewsFragment(newsCount) });

	if (!segments.length) return '';

	const frame = (segments[0].kind === 'upcoming' && segments[0].evening)
		? 'I din verden i kveld'
		: 'I din verden i dag';

	const sentences = [`${frame}: ${segments[0].text}.`];
	for (const s of segments.slice(1)) sentences.push(`${ssBriefSentenceCase(s.text)}.`);

	return ssBriefClamp(sentences, SS_BRIEF_MAX_LEN);
}

// ── Web context-building (Dashboard prototype extension) ─────────────────────
// Selection reuses the web's already-twinned personal machinery: the news lens
// (ssNewsRelevant), the result rows (resultItems), and a follow-match predicate
// mirroring NewsLens.matchesEvent. NB: the web has NO spoiler shield (unlike
// iOS), so web result items always carry spoiler:false — a documented platform
// divergence (brief-vectors/DIVERGENCES.md); the COMPOSER's spoiler branch is
// still pinned by the shared fixtures and exercised by the iOS side.
if (typeof Dashboard !== 'undefined') Object.assign(Dashboard.prototype, {
	/** The personal brief when the profile has follows AND there is something to
	 *  say — else null (the hero falls back to the editorial line, byte-for-byte
	 *  today's behaviour). */
	personalBrief(now = Date.now()) {
		if (!this.hasProfile) return null;
		const text = ssComposeBrief(this.briefContext(now));
		return text || null;
	},

	/** Build the SEMANTIC BriefContext from the on-device data. */
	briefContext(now = Date.now()) {
		return {
			upcoming: this.briefUpcoming(now),
			results: this.briefResults(now),
			newsCount: this.briefNewsCount(),
		};
	},

	/** The followed entities (name/aliases/sport) behind name-match selection. */
	briefFollowEntities() {
		const at = this.interests && this.interests.alwaysTrack;
		if (!at) return [];
		return [...(at.teams || []), ...(at.athletes || []), ...(at.tournaments || [])];
	},

	/** Web twin of NewsLens.matchesEvent: a whole-sport follow, an entity id the
	 *  event carries (home/away team + Norwegian players), or a sport-scoped
	 *  name/alias hit against the server haystack. `lens` is this.newsLens(). */
	briefFollowMatchesEvent(e, lens) {
		if (lens.sports && lens.sports.has(ssCanonicalNewsSport(e.sport))) return true;
		if (lens.entityIds) {
			const ids = [];
			if (e.homeTeamEntityId) ids.push(e.homeTeamEntityId);
			if (e.awayTeamEntityId) ids.push(e.awayTeamEntityId);
			for (const p of e.norwegianPlayers || []) if (p && p.entityId) ids.push(p.entityId);
			if (ids.some((id) => lens.entityIds.has(id))) return true;
		}
		const hay = ssLensHaystack(e);
		for (const ent of this.briefFollowEntities()) {
			if (ent.sport && ssNormalize(ent.sport) !== ssNormalize(e.sport)) continue;
			const terms = [ent.name, ...(ent.aliases || [])];
			if (terms.some((t) => t && ssContainsTerm(hay, t))) return true;
		}
		return false;
	},

	/** Events about something you follow, upcoming within the horizon, nearest
	 *  first, capped — reduced to the composer's semantic UpcomingItem. */
	briefUpcoming(now = Date.now()) {
		const horizon = now + SS_BRIEF_HORIZON_DAYS * SS_CONSTANTS.MS_PER_DAY;
		const lens = this.newsLens();
		const matched = (this.allEvents || []).filter((e) => {
			if (!e.time) return false;
			const start = Date.parse(e.time);
			if (Number.isNaN(start)) return false;
			const end = e.endTime ? Date.parse(e.endTime) : start;
			if (!(end >= now)) return false;          // already finished
			if (!(start <= horizon)) return false;    // beyond «i dag»'s reach
			return this.briefFollowMatchesEvent(e, lens);
		}).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
		return matched.slice(0, SS_BRIEF_MAX_UPCOMING).map((e) => this.briefUpcomingItem(e, now));
	},

	/** A plain (un-escaped) title for the brief — mirrors AgendaFormat.title. The
	 *  whole brief is escaped once at render, so this must NOT pre-escape. */
	briefEventTitle(e) {
		if (e.homeTeam && e.awayTeam) return `${ssShortName(e.homeTeam)} – ${ssShortName(e.awayTeam)}`;
		const m = ssParticipantMatchup(e);
		if (m) return m;
		return e.title || '';
	},

	briefUpcomingItem(e, now) {
		const start = Date.parse(e.time);
		const todayKey = this.osloDayKey(new Date(now));
		const tomorrowKey = this.osloDayKey(new Date(now + SS_CONSTANTS.MS_PER_DAY));
		const isMultiday = !!(e.endTime && this.osloDayKey(new Date(start)) !== this.osloDayKey(new Date(Date.parse(e.endTime))));
		let startKey = this.osloDayKey(new Date(start));
		if (startKey < todayKey) startKey = todayKey;  // an ongoing multi-day event lives under «i dag»
		let day = 'later', evening = false, time = '', weekday = '';
		if (startKey === todayKey) {
			day = 'today';
			if (!isMultiday) evening = ssOsloHour(start) >= 18;
		} else if (startKey === tomorrowKey) {
			day = 'tomorrow';
		} else {
			day = 'later';
			weekday = new Date(start).toLocaleDateString('nb-NO', { weekday: 'long', timeZone: 'Europe/Oslo' });
		}
		time = isMultiday ? '' : this.osloTime(new Date(start));
		return { title: this.briefEventTitle(e), day, evening, time, weekday };
	},

	/** Recent results about what you follow, newest first, capped — reduced to the
	 *  composer's semantic ResultItem. Only rows that will render meaningfully
	 *  (an outcome, or spoiler-screened) are kept. */
	briefResults(now = Date.now()) {
		const rows = (typeof this.resultItems === 'function') ? this.resultItems() : [];
		const kept = rows
			.map((r, i) => ({ r, i, t: Date.parse(r.date || '') }))
			.filter(({ r }) => (r.outcome && r.outcome.length) || this.briefResultSpoiler(r))
			.sort((a, b) => {
				const ta = Number.isNaN(a.t) ? -Infinity : a.t;
				const tb = Number.isNaN(b.t) ? -Infinity : b.t;
				return tb !== ta ? tb - ta : a.i - b.i;   // newest first, stable
			});
		return kept.slice(0, SS_BRIEF_MAX_RESULTS).map(({ r }) => this.briefResultItem(r, now));
	},

	/** The web has no spoiler shield — results are always shown openly here (the
	 *  RESULTAT section does the same). Kept as a seam so the shape twins iOS. */
	briefResultSpoiler(_r) { return false; },

	briefResultItem(r, now) {
		let day = 'earlier';
		if (r.date) {
			const dk = this.osloDayKey(new Date(r.date));
			if (!Number.isNaN(Date.parse(r.date))) {
				if (dk === this.osloDayKey(new Date(now))) day = 'today';
				else if (dk === this.osloDayKey(new Date(now - SS_CONSTANTS.MS_PER_DAY))) day = 'yesterday';
			}
		}
		return {
			title: r.title || '',
			outcome: r.outcome || '',
			kind: r.sport === 'football' ? 'score' : 'winner',
			spoiler: this.briefResultSpoiler(r),
			day,
		};
	},

	/** How many lens-matched news items exist (the NYTT feed). */
	briefNewsCount() {
		const lens = this.newsLens();
		return (this.news || []).filter((it) => ssNewsRelevant(it, lens)).length;
	},
});

// Node/vitest interop — the browser ignores this (no module.exports global).
if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		ssComposeBrief, ssBriefJoin, ssBriefSentenceCase,
		ssBriefUpcomingFragment, ssBriefResultFragment, ssBriefNewsFragment, ssBriefClamp,
		SS_BRIEF_MAX_UPCOMING, SS_BRIEF_MAX_RESULTS, SS_BRIEF_MAX_LEN, SS_BRIEF_HORIZON_DAYS,
	};
}
