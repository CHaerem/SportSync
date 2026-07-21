// assistant.js — the DETERMINISTIC web assistant (v1). Per the web-LLM spike:
// the grounding + parsing is the engine; no model is load-bearing. It answers
// grounded questions over the personal feed and reuses the shipped lens
// (ssIsRelevant) + shared-constants — never invents an event, never claims a
// reminder it can't keep. A browser-LLM layer (Chrome Prompt API) can later sit
// in FRONT of this for intent disambiguation only; this floor works in every
// browser, offline, zero bytes extra.
//
// v1 scope (honest): window questions (i dag / i kveld / i morgen / denne uka /
// i helga), an entity's next event ("når spiller X"), a sport/window filter
// ("vis golf denne uka"), and a follow intent ("følg X"). Faithful to the iOS
// AgendaFilterParser cue/window semantics. NOT yet ported: the full FeedQuery
// search + the 58-case eval-corpus replay (the parity gate) — tracked follow-on.
//
// Depends on shared-constants.js + lens.js. Pure `ssAssistant(query, ctx)` is
// unit-tested; the DOM wiring (bindAssistant) is a thin Dashboard extension.

// presentCues + resetWords now come from the shared assistant-vocab.json (below);
// questionWords/followCues/unfollowPhrases stay web-only (iOS parses these differently).
const SS_A_QUESTION_WORDS = new Set(['når', 'nar', 'hva', 'hvem', 'hvor', 'hvilke', 'hvilken', 'hvorfor', 'skjer']);
const SS_A_FOLLOW_CUES = new Set(['følg', 'folg', 'følge', 'folge']);
// Natural-form phrases; compared against ssNormalize(raw) via ssNormalize(phrase)
// so diacritic handling (å→a, ø kept) stays consistent on both sides.
const SS_A_UNFOLLOW_PHRASES = ['slutt å følge', 'ikke følg', 'avfølg', 'unfollow'];

/** Oslo day key (YYYY-MM-DD) for a ms/ISO — mirrors dashboard.osloDayKey. */
function ssADayKey(ms) {
	return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Oslo' });
}
function ssATokens(s) {
	return ssNormalize(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
}

// Baked-in fallback identical to docs/config/assistant-vocab.json — the SHARED
// vocabulary iOS bundles too (AssistantVocab.swift). Used when the fetch fails so
// the assistant degrades to today's behaviour, never breaks.
const SS_A_VOCAB_DEFAULTS = Object.freeze({
	sportKeywords: {
		fotball: 'football', football: 'football', soccer: 'football', golf: 'golf', tennis: 'tennis',
		sjakk: 'chess', chess: 'chess', sykkel: 'cycling', sykling: 'cycling', landeveissykling: 'cycling', cycling: 'cycling',
		friidrett: 'athletics', athletics: 'athletics', 'løping': 'athletics',
		f1: 'f1', formel1: 'f1', formel: 'f1', formula1: 'f1', formula: 'f1',
		esport: 'esports', esports: 'esports', cs2: 'esports', cs: 'esports', counterstrike: 'esports',
		skiskyting: 'biathlon', biathlon: 'biathlon', langrenn: 'cross-country', crosscountry: 'cross-country',
		alpint: 'alpine', alpine: 'alpine', slalam: 'alpine', utfor: 'alpine',
		hopp: 'ski jumping', skihopp: 'ski jumping', hopprenn: 'ski jumping', kombinert: 'nordic', nordic: 'nordic',
	},
	categories: {
		keywords: { vintersport: 'winter-sports', vintersporter: 'winter-sports', vinteridrett: 'winter-sports', vinteridretter: 'winter-sports' },
		members: { 'winter-sports': ['biathlon', 'cross-country', 'nordic', 'alpine', 'ski jumping'] },
		display: { 'winter-sports': 'vintersport' },
	},
	presentCues: ['vis', 'filtrer', 'fremhev'],
	resetWords: ['alt', 'alle', 'igjen', 'allt'],
	windowTokens: {
		'this-week': ['uka', 'uken', 'uke'], 'this-weekend': ['helga', 'helgen', 'helg'],
		tomorrow: ['morgen', 'imorgen'], today: ['dag', 'idag'], tonight: ['kveld', 'ikveld'],
	},
});

/** Coalesce a possibly-partial assistant-vocab.json with the baked-in defaults. */
function ssAssistantVocab(v) {
	if (!v) return SS_A_VOCAB_DEFAULTS;
	const d = SS_A_VOCAB_DEFAULTS;
	return {
		sportKeywords: v.sportKeywords || d.sportKeywords,
		categories: v.categories || d.categories,
		presentCues: v.presentCues || d.presentCues,
		resetWords: v.resetWords || d.resetWords,
		windowTokens: v.windowTokens || d.windowTokens,
	};
}

/** Norwegian keyword → canonical sport tag, from the shared vocabulary. */
function ssASportKeywords(vocab) {
	return ssAssistantVocab(vocab).sportKeywords;
}

/** The named window for a token set — from windowTokens. Returns null if none.
 *  Order (this-week → tonight) mirrors the web's answer/filter precedence. */
function ssADetectWindow(tokenSet, vocab) {
	const wt = ssAssistantVocab(vocab).windowTokens;
	const hasAny = (list) => (list || []).some((w) => tokenSet.has(w));
	for (const win of ['this-week', 'this-weekend', 'tomorrow', 'today', 'tonight']) {
		if (hasAny(wt[win])) return win;
	}
	return null;
}

/** Does an event fall in the named window? (relevance is applied by the caller.) */
function ssAInWindow(e, window, nowMs) {
	if (!e.time) return false;
	const startMs = Date.parse(e.time);
	const endMs = e.endTime ? Date.parse(e.endTime) : startMs;
	const today = ssADayKey(nowMs);
	const dayKey = (offset) => ssADayKey(nowMs + offset * 86400000);
	const overlapsDay = (key) => ssADayKey(startMs) <= key && key <= ssADayKey(endMs);
	if (window === 'today') return overlapsDay(today);
	if (window === 'tonight') {
		if (!overlapsDay(today)) return false;
		const h = Number(new Date(startMs).toLocaleString('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', hour12: false })) % 24;
		return h >= 18;
	}
	if (window === 'tomorrow') return overlapsDay(dayKey(1));
	if (window === 'this-week' || window === 'this-weekend') {
		// Monday-based week; this-week = today..Sunday, this-weekend = Sat..Sun.
		const d = new Date(nowMs);
		const dow = (Number(d.toLocaleString('en-US', { timeZone: 'Europe/Oslo', weekday: 'short' }) === 'Sun') ) ? 7 : null;
		// Compute days-since-Monday via Oslo weekday index.
		const wd = new Date(nowMs).toLocaleString('en-US', { timeZone: 'Europe/Oslo', weekday: 'long' });
		const idx = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(wd);
		const daysSinceMon = idx < 0 ? 0 : idx;
		const sunday = dayKey(6 - daysSinceMon);
		if (window === 'this-week') return ssADayKey(startMs) <= sunday && ssADayKey(endMs) >= today;
		const sat = dayKey(5 - daysSinceMon);
		return ssADayKey(startMs) <= sunday && ssADayKey(endMs) >= sat;
	}
	return false;
}

const ssATitle = (e) => e.homeTeam && e.awayTeam ? `${e.homeTeam} – ${e.awayTeam}`
	: (typeof ssParticipantMatchup === 'function' && ssParticipantMatchup(e)) || e.title || '';
const ssATimeLabel = (e) => e.time ? new Date(e.time).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }) : '';
const ssAChannel = (e) => {
	const s = Array.isArray(e.streaming) ? e.streaming : [];
	return s.length ? String(s[0].platform || s[0]) : '–';
};

/** The deterministic assistant. Returns { kind, text, eventIds, filter?, entity? }.
 *  kind ∈ answer | filter | reset | mutation | help. Never throws; never invents. */
function ssAssistant(query, ctx) {
	const events = (ctx && ctx.events) || [];
	const interests = ctx && ctx.interests;
	const config = ctx && ctx.config;
	const vocab = ssAssistantVocab(ctx && ctx.vocab); // shared assistant-vocab.json
	const presentCues = new Set(vocab.presentCues);
	const resetWords = new Set(vocab.resetWords);
	const nowMs = (ctx && ctx.nowMs) || Date.now();
	const raw = String(query || '').trim();
	if (!raw) return { kind: 'help', text: 'Spør f.eks. «hva skjer i kveld?» eller «vis golf denne uka».', eventIds: [] };
	const norm = ssNormalize(raw);
	const tokens = ssATokens(raw);
	const tokenSet = new Set(tokens);
	const relevant = events.filter((e) => ssIsRelevant(e, interests, nowMs, config));
	const sortByTime = (a, b) => (Date.parse(a.time || 0) - Date.parse(b.time || 0));

	// 1. Follow / unfollow intent.
	const isUnfollowPhrase = SS_A_UNFOLLOW_PHRASES.some((p) => norm.includes(ssNormalize(p)));
	if (isUnfollowPhrase || (tokens[0] && SS_A_FOLLOW_CUES.has(tokens[0]))) {
		const isUnfollow = isUnfollowPhrase;
		const subject = raw.replace(/^\s*(følg|folg|følge|folge|slutt å følge|slutt a folge|ikke følg|ikke folg)\s*/i, '').trim();
		return { kind: 'mutation', unfollow: isUnfollow, subject, text: subject
			? `${isUnfollow ? 'Slutt å følge' : 'Følg'} «${subject}» — trykk raden i oversikten for å bekrefte.`
			: 'Hvem vil du følge? Prøv «følg Hovland».', eventIds: [] };
	}

	// 2. Filter utterance (starts with a present cue).
	if (tokens[0] && presentCues.has(tokens[0])) {
		const sportMap = ssASportKeywords(vocab);
		const catKeywords = vocab.categories.keywords || {};
		const catMembers = vocab.categories.members || {};
		const sports = new Set();
		for (const t of tokens) {
			if (sportMap[t]) sports.add(sportMap[t]);
			// Umbrella category ("vintersport") → its member sports (WP-64 parity).
			if (catKeywords[t]) for (const s of catMembers[catKeywords[t]] || []) sports.add(s);
		}
		const window = ssADetectWindow(tokenSet, vocab);
		if (!sports.size && !window) {
			if (tokens.some((t) => resetWords.has(t))) return { kind: 'reset', text: 'Viser alt igjen.', eventIds: [] };
			return { kind: 'help', text: 'Hva vil du se? Prøv «vis golf» eller «vis i helga».', eventIds: [] };
		}
		let list = relevant.filter((e) => (!sports.size || sports.has((e.sport || '').toLowerCase()))
			&& (!window || ssAInWindow(e, window, nowMs)));
		list = list.sort(sortByTime);
		const what = [...sports].map((s) => (ssLensConfig(config).sportNb[s] || s)).join(', ');
		const when = window ? ({ today: 'i dag', tomorrow: 'i morgen', tonight: 'i kveld', 'this-week': 'denne uka', 'this-weekend': 'i helga' }[window]) : '';
		return { kind: 'filter', filter: { sports: [...sports], window }, eventIds: list.map((e) => e.id),
			text: list.length ? `${what || 'Hendelser'}${when ? ' ' + when : ''}: ${list.length}` : `Ingenting${what ? ' i ' + what : ''}${when ? ' ' + when : ''}.` };
	}

	// 3. Question — window or entity.
	const isQuestion = raw.includes('?') || (tokens[0] && SS_A_QUESTION_WORDS.has(tokens[0])) || tokenSet.has('skjer');
	const window = ssADetectWindow(tokenSet, vocab);
	if (window) {
		const list = relevant.filter((e) => ssAInWindow(e, window, nowMs)).sort(sortByTime);
		const when = { today: 'I dag', tomorrow: 'I morgen', tonight: 'I kveld', 'this-week': 'Denne uka', 'this-weekend': 'I helga' }[window];
		return { kind: 'answer', eventIds: list.map((e) => e.id),
			text: list.length ? `${when}: ${list.length} ${list.length === 1 ? 'hendelse' : 'hendelser'}.` : `${when}: ingenting i det du følger.` };
	}
	if (isQuestion || tokens.length) {
		// Entity next-event: the soonest upcoming relevant event matching a name in the query.
		const upcoming = relevant.filter((e) => {
			const end = e.endTime ? Date.parse(e.endTime) : Date.parse(e.time || 0);
			return end >= nowMs - 3 * 3600000;
		}).sort(sortByTime);
		const hit = upcoming.find((e) => {
			const hay = ssNormalize(`${ssATitle(e)} ${e.tournament || ''} ${(e.norwegianPlayers || []).map((p) => p.name || p).join(' ')}`);
			return tokens.some((t) => t.length >= 3 && hay.includes(t));
		});
		if (hit) {
			return { kind: 'answer', eventIds: [hit.id],
				text: `Neste: ${ssATitle(hit)} — ${new Date(hit.time).toLocaleDateString('nb-NO', { weekday: 'long', timeZone: 'Europe/Oslo' })} kl. ${ssATimeLabel(hit)} · ${ssAChannel(hit)}.` };
		}
		if (isQuestion) {
			// A question we couldn't place → today's board as the calm default.
			const today = relevant.filter((e) => ssAInWindow(e, 'today', nowMs)).sort(sortByTime);
			return { kind: 'answer', eventIds: today.map((e) => e.id),
				text: today.length ? `I dag: ${today.length} ${today.length === 1 ? 'hendelse' : 'hendelser'}.` : 'Fant ikke noe som passer — prøv «hva skjer denne uka?».' };
		}
	}

	// 4. Capability fallback (honest about what it can do).
	return { kind: 'help', eventIds: [],
		text: 'Jeg kan svare på «hva skjer i dag/i kveld/denne uka», «når spiller <navn>», «vis <sport>» og «følg <navn>».' };
}

// Node/vitest interop.
if (typeof module !== 'undefined' && module.exports) {
	module.exports = { ssAssistant, ssADetectWindow, ssAInWindow, ssASportKeywords, ssATokens };
}
