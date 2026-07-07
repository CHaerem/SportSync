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
		'Send inn dette, så lager en bot en Pull Request du ser over og merger.',
		`### Handling\n\n${f.action}`,
		`### Type\n\n${f.kind}`,
		`### Navn\n\n${f.name}`,
	];
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

fetch('data/interests.json', { cache: 'no-store' })
	.then((r) => r.json())
	.then(render)
	.catch(() => {
		document.getElementById('edit-root').innerHTML = '<p class="muted">Kunne ikke laste lista. Prøv å laste siden på nytt.</p>';
	});
