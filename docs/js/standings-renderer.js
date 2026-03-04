// SportSync Standings Renderer
// Renders standings tables for football, golf, F1, and tennis.
// Depends on: shared-constants.js (escapeHtml)
// Optional: asset-maps.js (getGolferHeadshot)

/**
 * Generic mini-table builder for the consolidated standings section.
 * @param {object} opts
 * @param {string} opts.title - Table heading
 * @param {Array<{label: string}>} opts.columns - Column definitions (excluding #)
 * @param {Array} opts.allRows - Full dataset
 * @param {number} [opts.topN=5] - Number of top rows to always show
 * @param {Function} [opts.isHighlight] - (row) => boolean for highlight styling
 * @param {Function} opts.cellValues - (row) => string[] of cell values (excluding position)
 * @param {Function} [opts.getPosition] - (row) => number, defaults to row.position
 * @param {Function} [opts.extraRows] - (allRows, topRows) => additional rows to include
 */
function buildMiniTable({ title, columns, allRows, topN = 5, isHighlight, cellValues, getPosition, extraRows }) {
	const pos = getPosition || (r => r.position);
	const topRows = allRows.slice(0, topN);
	const extra = extraRows ? extraRows(allRows, topRows) : [];
	const rows = [...topRows, ...extra].sort((a, b) => pos(a) - pos(b));
	if (rows.length === 0) return '';

	const colCount = columns.length + 1;
	let html = `<div class="standings-table-group"><div class="standings-table-label">${escapeHtml(title)}</div>`;
	html += `<table class="exp-mini-table"><thead><tr><th>#</th>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>`;
	let lastPos = 0;
	for (const row of rows) {
		const p = pos(row);
		if (p - lastPos > 1 && lastPos > 0) {
			html += `<tr class="ellipsis"><td colspan="${colCount}">\u2026</td></tr>`;
		}
		const cls = isHighlight?.(row) ? ' class="highlight"' : '';
		const cells = cellValues(row);
		html += `<tr${cls}><td>${p}</td>${cells.map(v => `<td>${v}</td>`).join('')}</tr>`;
		lastPos = p;
	}
	html += '</tbody></table></div>';
	return html;
}

/** Football mini table (Premier League / La Liga) for standings section */
function buildFootballMiniTable(name, table, favoriteTeams) {
	const favorites = (favoriteTeams || []).map(t => t.toLowerCase());
	const isFav = (row) => favorites.some(fav =>
		row.team.toLowerCase().includes(fav) || fav.includes(row.team.toLowerCase())
	);
	return buildMiniTable({
		title: name,
		columns: [{ label: 'Team' }, { label: 'Pts' }, { label: 'GD' }],
		allRows: table,
		isHighlight: isFav,
		cellValues: (row) => [escapeHtml(row.teamShort), row.points, row.gd > 0 ? `+${row.gd}` : row.gd],
		extraRows: (all, top) => all.filter(t => isFav(t) && !top.includes(t)),
	});
}

/** Golf mini table for standings section */
function buildGolfMiniTable(pga) {
	const norwegianNames = ['Hovland', 'Ventura', 'Aberg'];
	const isNor = (row) => norwegianNames.some(n => row.player?.includes(n));
	return buildMiniTable({
		title: pga.name || 'Golf Leaderboard',
		columns: [{ label: 'Player' }, { label: 'Score' }, { label: 'Thru' }],
		allRows: pga.leaderboard,
		isHighlight: isNor,
		cellValues: (row) => [escapeHtml(row.player), escapeHtml(row.score), escapeHtml(row.thru || '')],
		extraRows: (all, top) => all.filter(p => isNor(p) && !top.includes(p)),
	});
}

/** F1 mini table for standings section */
function buildF1MiniTable(drivers) {
	return buildMiniTable({
		title: 'F1 Standings',
		columns: [{ label: 'Driver' }, { label: 'Pts' }, { label: 'Wins' }],
		allRows: drivers,
		cellValues: (d) => [escapeHtml(d.driver), d.points, d.wins],
	});
}

/** Tennis (ATP) mini table for standings section */
function buildTennisMiniTable(atp) {
	const isRuud = (p) => p.player.toLowerCase().includes('ruud');
	return buildMiniTable({
		title: 'ATP Rankings',
		columns: [{ label: 'Player' }, { label: 'Pts' }],
		allRows: atp,
		isHighlight: isRuud,
		cellValues: (p) => [escapeHtml(p.player), p.points],
		extraRows: (all, top) => {
			const ruud = all.find(p => isRuud(p));
			return ruud && !top.includes(ruud) ? [ruud] : [];
		},
	});
}

/** Render consolidated standings section (collapsed band with all sport tables) */
function renderStandingsSection(standings, preferences) {
	const tables = [];
	const prefs = preferences ? preferences.getPreferences() : {};
	const favTeams = prefs.favoriteTeams?.football || [];

	// Premier League
	const plTable = standings?.football?.premierLeague;
	if (Array.isArray(plTable) && plTable.length > 0) {
		tables.push(buildFootballMiniTable('Premier League', plTable, favTeams));
	}

	// La Liga
	const laLigaTable = standings?.football?.laLiga;
	if (Array.isArray(laLigaTable) && laLigaTable.length > 0) {
		tables.push(buildFootballMiniTable('La Liga', laLigaTable, favTeams));
	}

	// Golf leaderboard
	const pga = standings?.golf?.pga;
	if (pga?.leaderboard?.length && pga.status !== 'scheduled') {
		tables.push(buildGolfMiniTable(pga));
	}

	// F1 standings
	const drivers = standings?.f1?.drivers;
	if (Array.isArray(drivers) && drivers.length > 0) {
		const totalPoints = drivers.reduce((s, d) => s + (d.points || 0), 0);
		if (totalPoints > 0) {
			tables.push(buildF1MiniTable(drivers));
		}
	}

	// ATP rankings
	const atp = standings?.tennis?.atp;
	if (Array.isArray(atp) && atp.length > 0) {
		tables.push(buildTennisMiniTable(atp));
	}

	if (tables.length === 0) return '';

	let html = '<div class="flow-label band-label collapsible" data-band="standings" role="button" tabindex="0" aria-expanded="false"><span class="flow-text">Standings</span><span class="flow-line"></span><span style="font-size:0.6rem">\u25b8</span></div>';
	html += '<div class="band-content collapsed" data-band-content="standings">';
	html += '<div class="event-card">';
	html += tables.join('');
	html += '</div></div>';
	return html;
}

/** Detailed football standings for expanded event view */
function renderFootballStandings(event, standings) {
	const tournament = (event.tournament || '').toLowerCase();
	const isSpanish = tournament.includes('la liga') || tournament.includes('copa del rey');
	const tableKey = isSpanish ? 'laLiga' : 'premierLeague';
	const tableName = isSpanish ? 'La Liga' : 'Premier League';
	const table = standings?.football?.[tableKey];
	if (!table?.length) return '';
	const matchTeams = [event.homeTeam, event.awayTeam].filter(Boolean).map(t => t.toLowerCase());

	// Collect top 3 + both match teams, deduped, sorted by position
	const top3 = table.slice(0, 3);
	const matchRows = table.filter(t => matchTeams.some(mt =>
		t.team.toLowerCase().includes(mt) || mt.includes(t.team.toLowerCase()) ||
		t.teamShort.toLowerCase() === mt.replace(/ fc$| afc$/i, '').trim().toLowerCase()
	));

	const shown = new Map();
	[...top3, ...matchRows].forEach(t => { if (!shown.has(t.position)) shown.set(t.position, t); });
	const rows = Array.from(shown.values()).sort((a, b) => a.position - b.position);
	if (rows.length === 0) return '';

	let html = `<div class="exp-standings"><div class="exp-standings-header">${tableName}</div>`;
	html += '<table class="exp-mini-table"><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>';

	let lastPos = 0;
	for (const row of rows) {
		if (row.position - lastPos > 1 && lastPos > 0) {
			html += '<tr class="ellipsis"><td colspan="8">\u2026</td></tr>';
		}
		const isHighlight = matchTeams.some(mt =>
			row.team.toLowerCase().includes(mt) || mt.includes(row.team.toLowerCase()) ||
			row.teamShort.toLowerCase() === mt.replace(/ fc$| afc$/i, '').trim().toLowerCase()
		);
		const cls = isHighlight ? ' class="highlight"' : '';
		const gd = row.gd > 0 ? `+${row.gd}` : row.gd;
		html += `<tr${cls}><td>${row.position}</td><td>${escapeHtml(row.teamShort)}</td><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${gd}</td><td>${row.points}</td></tr>`;
		lastPos = row.position;
	}

	html += '</tbody></table></div>';
	return html;
}

/** Detailed golf leaderboard for expanded event view */
function renderGolfLeaderboard(event, standings) {
	const tourKey = (event.tournament || '').toLowerCase().includes('dp world') ? 'dpWorld' : 'pga';
	const tour = standings?.golf?.[tourKey];
	if (!tour?.leaderboard?.length) return '';

	const playerCell = (p) => {
		const headshot = p.headshot || (typeof getGolferHeadshot === 'function' ? getGolferHeadshot(p.player) : null);
		const img = headshot
			? `<img class="lb-tbl-img" src="${headshot}" alt="" loading="lazy" onerror="this.style.display='none'">`
			: '';
		return `${img}${escapeHtml(p.player)}`;
	};

	let html = `<div class="exp-standings"><div class="exp-standings-header">${escapeHtml(tour.name || 'Leaderboard')}</div>`;
	html += '<table class="exp-mini-table"><thead><tr><th>#</th><th>Player</th><th>Score</th><th>Today</th><th>Thru</th></tr></thead><tbody>';

	const top5 = tour.leaderboard.slice(0, 5);
	for (const p of top5) {
		html += `<tr><td>${p.position || '-'}</td><td>${playerCell(p)}</td><td>${escapeHtml(p.score)}</td><td>${escapeHtml(p.today)}</td><td>${escapeHtml(p.thru)}</td></tr>`;
	}

	// Check if any Norwegian player is on the leaderboard beyond top 5
	if (event.norwegianPlayers?.length > 0) {
		const norNames = event.norwegianPlayers.map(p => p.name.toLowerCase());
		const norOnBoard = tour.leaderboard.slice(5).filter(p =>
			norNames.some(n => p.player.toLowerCase().includes(n.split(' ').pop()))
		);
		if (norOnBoard.length > 0) {
			html += '<tr class="ellipsis"><td colspan="5">\u2026</td></tr>';
			for (const p of norOnBoard) {
				html += `<tr class="highlight"><td>${p.position || '-'}</td><td>${playerCell(p)}</td><td>${escapeHtml(p.score)}</td><td>${escapeHtml(p.today)}</td><td>${escapeHtml(p.thru)}</td></tr>`;
			}
		}
	}

	html += '</tbody></table></div>';
	return html;
}

/** Detailed F1 standings for expanded event view */
function renderF1StandingsTable(standings) {
	const drivers = standings?.f1?.drivers?.slice(0, 5);
	if (!drivers?.length) return '';
	// Hide standings when all drivers have zero points (pre-season or stale data)
	if (drivers.every(d => !d.points)) return '';

	let html = '<div class="exp-standings"><div class="exp-standings-header">Driver Standings</div>';
	html += '<table class="exp-mini-table"><thead><tr><th>#</th><th>Driver</th><th>Team</th><th>Pts</th></tr></thead><tbody>';

	for (const d of drivers) {
		html += `<tr><td>${d.position}</td><td>${escapeHtml(d.driver)}</td><td>${escapeHtml(d.team)}</td><td>${d.points}</td></tr>`;
	}

	html += '</tbody></table></div>';
	return html;
}

/** Golf leaderboard for editorial/brief view (with tracked Norwegian players) */
function renderStandingsLeaderboard(tournament, standings) {
	const tourKey = (tournament || '').toLowerCase().includes('dp world') ? 'dpWorld' : 'pga';
	const tour = standings?.golf?.[tourKey];
	if (!tour?.leaderboard?.length) return '';

	const statusLabel = tour.status === 'in_progress' ? 'In Progress' : (tour.status || '');

	let html = '<div class="lead-lb">';
	html += '<div class="lead-lb-header">';
	html += '<span class="lead-lb-title">Leaderboard</span>';
	if (statusLabel) html += `<span class="lead-lb-badge">${escapeHtml(statusLabel)}</span>`;
	html += '</div>';

	// Show top 3 + all tracked players (Norwegian golfers) regardless of position.
	const top3 = tour.leaderboard.slice(0, 3);
	const trackedInLeaderboard = tour.leaderboard.filter(p => p.tracked && !top3.includes(p));
	const trackedOutside = tour.trackedPlayers || [];
	const showPlayers = [...top3, ...trackedInLeaderboard, ...trackedOutside];

	for (const p of showPlayers) {
		const isTracked = !!p.tracked;
		const headshot = p.headshot || (typeof getGolferHeadshot === 'function' ? getGolferHeadshot(p.player) : null);
		const imgHtml = headshot
			? `<img class="lb-img" src="${headshot}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display=''">`
			  + '<span class="lb-img-placeholder" style="display:none">\u26f3</span>'
			: '<span class="lb-img-placeholder">\u26f3</span>';
		const scoreNum = parseFloat(p.score || '0');
		const scoreCls = (p.score || '').startsWith('-') ? ' under-par' : (scoreNum > 0 ? ' over-par' : '');
		const posDisplay = p.positionDisplay || String(p.position);

		html += `<div class="lb-row${isTracked ? ' is-you' : ''}">`;
		html += `<span class="lb-pos">${escapeHtml(posDisplay)}</span>`;
		html += imgHtml;
		html += `<span class="lb-name">${escapeHtml(p.player)}</span>`;
		if (isTracked) html += '<span class="lb-flag">\ud83c\uddf3\ud83c\uddf4</span>';
		html += `<span class="lb-score${scoreCls}">${escapeHtml(p.score || 'E')}</span>`;
		html += '</div>';
	}

	html += '</div>';
	return html;
}

// ── Expose globals ──────────────────────────────────────────────────────────
window.StandingsRenderer = {
	buildMiniTable,
	buildFootballMiniTable,
	buildGolfMiniTable,
	buildF1MiniTable,
	buildTennisMiniTable,
	renderStandingsSection,
	renderFootballStandings,
	renderGolfLeaderboard,
	renderF1StandingsTable,
	renderStandingsLeaderboard,
};
