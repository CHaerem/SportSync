// Edit page: load the current interests and make EXISTING entries editable with
// one click — no typing, no JSON. Each action deep-links to the follow-request
// Issue Form with fields PRE-FILLED via query params (GitHub renders the form,
// the user just submits). The existing workflow turns it into a PR they merge.
// Nothing is written directly — same review-gated flow, just zero manual input.
// Repo slug (SS_REPO), escapeHtml and ssShortReason come from shared-constants.js
// (loaded before this script); theme lives in js/theme.js.
const KINDS = [
	['athletes', 'Utøver', 'Utøvere'],
	['teams', 'Lag', 'Lag'],
	['tournaments', 'Turnering', 'Turneringer'],
];

// GitHub Issue Forms DON'T prefill dropdowns from the URL — only text fields — so
// prefilling the template left Handling/Type unset. Instead compose the whole
// structured body (which the workflow's parser reads) and apply the label that
// triggers the workflow. Everything arrives filled in; the user just submits.
function issueUrl(f) {
	const lines = [
		'Send inn dette, så oppdaterer boten lista automatisk og bygger om siden.',
		`### Handling\n\n${f.action}`,
		`### Type\n\n${f.kind}`,
		`### Navn\n\n${f.name}`,
	];
	if (f.aliases) lines.push(`### Aliaser (komma-separert, valgfritt)\n\n${f.aliases}`);
	if (f.sport) lines.push(`### Sport (valgfritt, men hjelper matchingen)\n\n${f.sport}`);
	if (f.notify) lines.push(`### Kalendervarsel?\n\n${f.notify}`);
	const p = new URLSearchParams({
		labels: 'follow-request',
		title: `[følg] ${f.action}: ${f.name}`,
		body: lines.join('\n\n'),
	});
	return `https://github.com/${SS_REPO}/issues/new?${p.toString()}`;
}

/** Does this entry notify? Teams/athletes default on; tournaments default off. */
function notifies(entry, kindKey) {
	const def = kindKey !== 'tournaments';
	return entry && typeof entry === 'object' && entry.notify != null ? entry.notify : def;
}

function row(entry, kindKey, kindLabel) {
	const name = typeof entry === 'string' ? entry : entry.name;
	const on = notifies(entry, kindKey);
	const sport = typeof entry === 'object' && entry.sport ? entry.sport : '';
	const aliases = typeof entry === 'object' && Array.isArray(entry.aliases) ? entry.aliases.join(', ') : '';
	const toggleUrl = issueUrl({ action: 'Endre varsel', kind: kindLabel, name, notify: on ? 'Nei' : 'Ja' });
	const removeUrl = issueUrl({ action: 'Fjern', kind: kindLabel, name });
	return `<div class="edit-row">
		<div class="edit-name">
			<span class="edit-title">${escapeHtml(name)}</span>${on ? '<span class="bell" title="Varsler deg">🔔</span>' : ''}
			${sport ? `<span class="tag">${escapeHtml(sport)}</span>` : ''}
			${aliases ? `<div class="edit-alias">også: ${escapeHtml(aliases)}</div>` : ''}
		</div>
		<div class="edit-actions">
			<a class="btn" href="${toggleUrl}" target="_blank" rel="noopener">${on ? 'Skru av 🔔' : 'Skru på 🔔'}</a>
			<a class="btn btn-danger" href="${removeUrl}" target="_blank" rel="noopener">Fjern</a>
		</div>
	</div>`;
}

/** A free-text interest line (e.g. an added sport) with a remove button. */
function briefRow(s) {
	const removeUrl = issueUrl({ action: 'Fjern', kind: 'Sport', name: s });
	return `<div class="edit-row"><div class="edit-name"><span class="edit-brief">${escapeHtml(s)}</span></div><div class="edit-actions"><a class="btn btn-danger" href="${removeUrl}" target="_blank" rel="noopener">Fjern</a></div></div>`;
}

/** Strip trailing year / parenthetical from a tracked name for a clean follow. */
function coreName(name) {
	return String(name).replace(/\s*\d{4}(?:\/\d{2})?/g, '').replace(/\s*\(.*?\)/g, '').trim();
}

/** "AI har funnet" row: a discovery, name + why + expiry, with a "Følg 🔔" action. */
function aiRow(x, kind) {
	const until = x.expires ? `<span class="tag">ut ${escapeHtml(x.expires.slice(0, 10))}</span>` : '';
	const why = x.reason ? `<div class="edit-alias" title="${escapeHtml(x.reason)}">${escapeHtml(ssShortReason(x.reason))}</div>` : '';
	const followUrl = issueUrl({ action: 'Legg til', kind, name: coreName(x.name), sport: x.sport || '', notify: 'Ja' });
	return `<div class="edit-row"><div class="edit-name"><span class="edit-title">${escapeHtml(x.name)}</span>${until}${why}</div><div class="edit-actions"><a class="btn" href="${followUrl}" target="_blank" rel="noopener">Følg 🔔</a></div></div>`;
}

function render(interests, tracked) {
	const at = interests.alwaysTrack || {};
	const root = document.getElementById('edit-root');
	let html = KINDS.map(([key, kindLabel, groupLabel]) => {
		const items = at[key] || [];
		const rows = items.length
			? items.map((e) => row(e, key, kindLabel)).join('')
			: '<p class="muted">Ingenting her ennå.</p>';
		return `<section class="edit-group"><h2>${groupLabel}</h2>${rows}</section>`;
	}).join('');
	const briefs = interests.interests || [];
	if (briefs.length) {
		html += `<section class="edit-group"><h2>Brede interesser</h2><p class="muted brief-note">Fritekst AI-en leter events fra. Legg til en sport via søket under.</p>${briefs.map(briefRow).join('')}</section>`;
	}
	// AI har funnet — the research agent's discoveries; promote any to a real follow.
	const followed = ['teams', 'athletes', 'tournaments'].flatMap((k) => trackedTerms(at[k] || []));
	const isFollowed = (name) => followed.some((t) => ssContainsTerm(name, t) || ssContainsTerm(t, coreName(name)));
	const trk = (label, items, kind) => {
		const disc = (items || []).filter((x) => x?.name && !isFollowed(x.name)); // only genuine discoveries
		return disc.length ? `<div class="edit-subhead">${label}</div>` + disc.map((x) => aiRow(x, kind)).join('') : '';
	};
	const aiHtml = trk('Turneringer', tracked?.tournaments, 'Turnering') + trk('Ligaer', tracked?.leagues, 'Turnering') + trk('Utøvere', tracked?.athletes, 'Utøver');
	if (aiHtml) html += `<section class="edit-group"><h2>AI har funnet for deg</h2><p class="muted brief-note">Ting AI-en fant utover lista di. Trykk «Følg» for å få det som fast følge med varsel.</p>${aiHtml}</section>`;
	root.innerHTML = html;
}

// ── Add: search local data + TheSportsDB (teams) → prefilled "Legg til" issue ──
// Local data (your standings/board) has the RIGHT athletes/tournaments; TheSportsDB
// broadens teams reliably (CORS-ok, sport-specific). Its player search is football-
// skewed/unreliable, so athletes/tournaments come from local + a manual fallback.
const SPORT_MAP = { Soccer: 'football', Golf: 'golf', Tennis: 'tennis', Cycling: 'cycling', Motorsport: 'f1', Athletics: 'athletics', Esports: 'esports' };
// Sports a user might add as a free-text interest (the AI then researches them).
const SPORTS_NB = ['Håndball', 'Ishockey', 'Friidrett', 'Langrenn', 'Skiskyting', 'Alpint', 'Skihopp', 'Kombinert', 'Svømming', 'Roing', 'Bryting', 'Boksing', 'MMA', 'Basketball', 'Volleyball', 'Bordtennis', 'Badminton', 'Padel', 'Motorsport', 'Rally', 'Sjakk', 'Esport', 'Golf', 'Tennis', 'Sykkel', 'Fotball'];
let localCandidates = [];

function buildLocalCandidates(events, standings, interests) {
	const at = interests?.alwaysTrack || {};
	const followed = ['teams', 'athletes', 'tournaments'].flatMap((k) => trackedTerms(at[k] || []));
	const isFollowed = (name) => followed.some((t) => ssContainsTerm(name, t) || ssContainsTerm(t, name));
	const seen = new Set();
	const out = [];
	const add = (name, kind, sport) => {
		name = (name || '').trim();
		if (name.length < 2) return;
		const key = kind + '|' + ssNormalize(name);
		if (seen.has(key) || isFollowed(name)) return;
		seen.add(key);
		out.push({ name, kind, sport: sport || '', source: 'lokal' });
	};
	const tbl = standings?.football || {};
	for (const arr of [tbl.premierLeague, tbl.laLiga]) for (const r of (arr || [])) add(r.team, 'Lag', 'football');
	for (const e of (events || [])) {
		add(e.homeTeam, 'Lag', e.sport);
		add(e.awayTeam, 'Lag', e.sport);
		add(e.tournament, 'Turnering', e.sport);
		for (const p of (e.norwegianPlayers || [])) add(p.name || p, 'Utøver', e.sport);
	}
	return out;
}

async function searchTeamsExternal(q) {
	try {
		const r = await fetch(`https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=${encodeURIComponent(q)}`);
		if (!r.ok) return [];
		const d = await r.json();
		return (d.teams || []).slice(0, 6).map((t) => ({
			name: t.strTeam, kind: 'Lag',
			sport: SPORT_MAP[t.strSport] || '',
			source: 'ekstern',
		}));
	} catch { return []; }
}

function dedupe(list) {
	const seen = new Set();
	return list.filter((c) => { const k = c.kind + '|' + ssNormalize(c.name); if (seen.has(k)) return false; seen.add(k); return true; });
}

function suggestionEl(c) {
	const url = issueUrl({ action: 'Legg til', kind: c.kind, name: c.name, sport: c.sport, notify: c.kind === 'Sport' ? undefined : 'Standard' });
	const sport = c.sport ? `<span class="s-sport">${escapeHtml(c.sport)}</span>` : '';
	return `<a class="suggestion" href="${url}" target="_blank" rel="noopener"><span>${escapeHtml(c.name)}</span>${sport}<span class="s-kind">${escapeHtml(c.kind)}${c.source === 'ekstern' ? ' · søk' : ''}</span></a>`;
}

function renderSuggestions(list, q) {
	const box = document.getElementById('add-suggestions');
	if (!box) return;
	const manualUrl = `https://github.com/${SS_REPO}/issues/new?${new URLSearchParams({ template: 'follow.yml', name: q }).toString()}`;
	const manual = `<a class="suggestion manual" href="${manualUrl}" target="_blank" rel="noopener">Legg til «${escapeHtml(q)}» manuelt — velg type + sport</a>`;
	box.innerHTML = list.slice(0, 8).map(suggestionEl).join('') + manual;
}

let searchTimer;
function onSearch(q) {
	q = (q || '').trim();
	const box = document.getElementById('add-suggestions');
	if (!box) return;
	if (q.length < 2) { box.innerHTML = ''; return; }
	const nq = ssNormalize(q);
	const local = localCandidates.filter((c) => ssNormalize(c.name).includes(nq));
	const sports = SPORTS_NB.filter((s) => ssNormalize(s).includes(nq)).map((s) => ({ name: s, kind: 'Sport', sport: '', source: 'sport' }));
	renderSuggestions(dedupe([...local, ...sports]), q); // instant
	clearTimeout(searchTimer);
	searchTimer = setTimeout(async () => {
		const ext = await searchTeamsExternal(q);
		if ((document.getElementById('add-search')?.value || '').trim() !== q) return; // stale query
		renderSuggestions(dedupe([...local, ...sports, ...ext]), q);
	}, 300);
}

Promise.all([
	fetch('data/interests.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
	fetch('data/events.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
	fetch('data/standings.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
	fetch('data/tracked.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
]).then(([interests, events, standings, tracked]) => {
	render(interests, tracked);
	localCandidates = buildLocalCandidates(events, standings, interests);
	document.getElementById('add-search')?.addEventListener('input', (e) => onSearch(e.target.value));
}).catch(() => {
	document.getElementById('edit-root').innerHTML = '<p class="muted">Kunne ikke laste lista. Prøv å laste siden på nytt.</p>';
});
