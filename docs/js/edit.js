// Edit page: load the current interests and make EXISTING entries editable with
// one click — no typing, no JSON. Each action deep-links to the follow-request
// Issue Form with fields PRE-FILLED via query params (GitHub renders the form,
// the user just submits). The existing workflow turns it into a PR they merge.
// Nothing is written directly — same review-gated flow, just zero manual input.
const REPO = 'CHaerem/SportSync';
const KINDS = [
	['athletes', 'Utøver', 'Utøvere'],
	['teams', 'Lag', 'Lag'],
	['tournaments', 'Turnering', 'Turneringer'],
];

function escapeHtml(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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
	return `https://github.com/${REPO}/issues/new?${p.toString()}`;
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

function render(interests) {
	const at = interests.alwaysTrack || {};
	const root = document.getElementById('edit-root');
	root.innerHTML = KINDS.map(([key, kindLabel, groupLabel]) => {
		const items = at[key] || [];
		const rows = items.length
			? items.map((e) => row(e, key, kindLabel)).join('')
			: '<p class="muted">Ingenting her ennå.</p>';
		return `<section class="edit-group"><h2>${groupLabel}</h2>${rows}</section>`;
	}).join('');
}

// ── Add: search local data + TheSportsDB (teams) → prefilled "Legg til" issue ──
// Local data (your standings/board) has the RIGHT athletes/tournaments; TheSportsDB
// broadens teams reliably (CORS-ok, sport-specific). Its player search is football-
// skewed/unreliable, so athletes/tournaments come from local + a manual fallback.
const SPORT_MAP = { Soccer: 'football', Golf: 'golf', Tennis: 'tennis', Cycling: 'cycling', Motorsport: 'f1', Athletics: 'athletics', Esports: 'esports' };
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
	const url = issueUrl({ action: 'Legg til', kind: c.kind, name: c.name, sport: c.sport, notify: 'Standard' });
	const sport = c.sport ? `<span class="s-sport">${escapeHtml(c.sport)}</span>` : '';
	return `<a class="suggestion" href="${url}" target="_blank" rel="noopener"><span>${escapeHtml(c.name)}</span>${sport}<span class="s-kind">${escapeHtml(c.kind)}${c.source === 'ekstern' ? ' · søk' : ''}</span></a>`;
}

function renderSuggestions(list, q) {
	const box = document.getElementById('add-suggestions');
	if (!box) return;
	const manualUrl = `https://github.com/${REPO}/issues/new?${new URLSearchParams({ template: 'follow.yml', name: q }).toString()}`;
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
	renderSuggestions(dedupe(local), q); // instant
	clearTimeout(searchTimer);
	searchTimer = setTimeout(async () => {
		const ext = await searchTeamsExternal(q);
		if ((document.getElementById('add-search')?.value || '').trim() !== q) return; // stale query
		renderSuggestions(dedupe([...local, ...ext]), q);
	}, 300);
}

Promise.all([
	fetch('data/interests.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
	fetch('data/events.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
	fetch('data/standings.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
]).then(([interests, events, standings]) => {
	render(interests);
	localCandidates = buildLocalCandidates(events, standings, interests);
	document.getElementById('add-search')?.addEventListener('input', (e) => onSearch(e.target.value));
}).catch(() => {
	document.getElementById('edit-root').innerHTML = '<p class="muted">Kunne ikke laste lista. Prøv å laste siden på nytt.</p>';
});

// Theme toggle — parity with the dashboard (same localStorage key).
document.getElementById('theme-toggle')?.addEventListener('click', () => {
	const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
	const next = cur === 'dark' ? 'light' : 'dark';
	document.documentElement.dataset.theme = next;
	try { localStorage.setItem('ss-theme', next); } catch (e) { /* ignore */ }
});
