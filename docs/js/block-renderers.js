// SportSync Block Renderers
// Component renderers for structured editorial blocks (match-result, match-preview, etc.).
// Each function receives (block, ctx) where ctx provides data and utilities.
// Depends on: shared-constants.js (escapeHtml, ssShortName, isEventInWindow, SS_CONSTANTS)

/**
 * @typedef {Object} BlockRendererContext
 * @property {Array} allEvents - All events from events.json
 * @property {Object|null} recentResults - Recent match results
 * @property {Object|null} standings - Standings data (football, golf, f1)
 * @property {Object} liveScores - Live score data keyed by event ID
 * @property {Object|null} liveLeaderboard - Live golf leaderboard
 * @property {Function} renderBriefLine - Renders inline logos/headshots in editorial text
 * @property {Function} relativeTime - Returns "in Xm", "in Xh" relative time string
 * @property {Function} _isSameDay - Same-day date comparison
 * @property {Function} _getTrackedGolferNames - Returns Set of tracked golfer names
 */

/** match-result: renders a completed match as a card with logos, score, goalscorers */
function renderMatchResult(block, ctx) {
	const football = Array.isArray(ctx.recentResults?.football) ? ctx.recentResults.football : [];
	if (!football.length || !block.homeTeam || !block.awayTeam) return null;

	const homeL = block.homeTeam.toLowerCase();
	const awayL = block.awayTeam.toLowerCase();
	const match = football.find(m => {
		const mHome = (m.homeTeam || '').toLowerCase();
		const mAway = (m.awayTeam || '').toLowerCase();
		return (mHome.includes(homeL) || homeL.includes(mHome)) &&
			(mAway.includes(awayL) || awayL.includes(mAway));
	});
	if (!match || match.homeScore == null) return null;

	const hLogo = typeof getTeamLogo === 'function' ? getTeamLogo(match.homeTeam) : null;
	const aLogo = typeof getTeamLogo === 'function' ? getTeamLogo(match.awayTeam) : null;
	const hImg = hLogo ? `<img src="${hLogo}" alt="${escapeHtml(match.homeTeam)}" class="result-card-logo" loading="lazy">` : '';
	const aImg = aLogo ? `<img src="${aLogo}" alt="${escapeHtml(match.awayTeam)}" class="result-card-logo" loading="lazy">` : '';

	const scorers = (match.goalScorers || []).slice(0, 3);
	const scorerHtml = scorers.length > 0
		? `<div class="result-card-scorers">${scorers.map(g => escapeHtml(`${g.player} ${g.minute}`)).join(', ')}</div>`
		: '';
	const leagueHtml = match.league ? `<div class="result-card-league">${escapeHtml(match.league)}</div>` : '';

	return `<div class="block-match-result"><div class="result-card-teams"><span class="result-card-side">${hImg}<span class="result-card-name">${escapeHtml(ssShortName(match.homeTeam))}</span></span><span class="result-card-score">${match.homeScore} - ${match.awayScore}</span><span class="result-card-side">${aImg}<span class="result-card-name">${escapeHtml(ssShortName(match.awayTeam))}</span></span></div>${scorerHtml}${leagueHtml}</div>`;
}

/** match-preview: renders an upcoming match with logos, time, optional standings */
function renderMatchPreview(block, ctx) {
	if (!block.homeTeam || !block.awayTeam) return null;

	const homeL = block.homeTeam.toLowerCase();
	const awayL = block.awayTeam.toLowerCase();
	const event = ctx.allEvents.find(e => {
		if (e.sport !== 'football') return false;
		const eHome = (e.homeTeam || '').toLowerCase();
		const eAway = (e.awayTeam || '').toLowerCase();
		return (eHome.includes(homeL) || homeL.includes(eHome)) &&
			(eAway.includes(awayL) || awayL.includes(eAway));
	});
	if (!event) return null;

	const date = new Date(event.time);
	const timeStr = date.toLocaleTimeString('en-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' });
	const rel = ctx.relativeTime(date) || '';

	const hLogo = typeof getTeamLogo === 'function' ? getTeamLogo(event.homeTeam) : null;
	const aLogo = typeof getTeamLogo === 'function' ? getTeamLogo(event.awayTeam) : null;
	const hImg = hLogo ? `<img src="${hLogo}" alt="${escapeHtml(event.homeTeam)}" class="brief-logo" loading="lazy">` : '';
	const aImg = aLogo ? `<img src="${aLogo}" alt="${escapeHtml(event.awayTeam)}" class="brief-logo" loading="lazy">` : '';

	let standingsHtml = '';
	if (block.showStandings && ctx.standings?.football) {
		const tournament = (event.tournament || '').toLowerCase();
		const isSpanish = tournament.includes('la liga') || tournament.includes('copa del rey');
		const tableKey = isSpanish ? 'laLiga' : 'premierLeague';
		const table = ctx.standings.football[tableKey];
		if (table?.length) {
			const matchTeams = [event.homeTeam, event.awayTeam].map(t => t.toLowerCase());
			const positions = table.filter(t =>
				matchTeams.some(mt => t.team.toLowerCase().includes(mt) || mt.includes(t.team.toLowerCase()))
			).map(t => `${t.teamShort} ${escapeHtml(String(t.position))}${t.position === 1 ? 'st' : t.position === 2 ? 'nd' : t.position === 3 ? 'rd' : 'th'}`);
			if (positions.length > 0) {
				standingsHtml = ` <span class="block-standings-ctx">(${positions.join(' vs ')})</span>`;
			}
		}
	}

	const relHtml = rel ? `<span class="preview-rel">${escapeHtml(rel)}</span>` : '';
	const tourCtx = event.tournament ? `<span class="preview-ctx">${escapeHtml(event.tournament)}</span>` : '';

	// Extract editorial context from _fallbackText (text after " — " beyond team/time info)
	let editorialHtml = '';
	if (block._fallbackText) {
		const parts = block._fallbackText.split(' — ');
		if (parts.length >= 2) {
			const editorial = parts.slice(1).join(' — ').trim();
			const lowerEd = editorial.toLowerCase();
			const hasTeamNames = lowerEd.includes(block.homeTeam?.toLowerCase()) || lowerEd.includes(block.awayTeam?.toLowerCase());
			const isJustTeams = hasTeamNames && editorial.length < 40;
			const isEditorial = editorial.length > 20 && !isJustTeams;
			if (isEditorial) {
				editorialHtml = `<div class="preview-editorial">${escapeHtml(editorial)}</div>`;
			}
		}
	}

	return `<div class="block-event-line editorial-line block-match-preview"><span class="preview-main">⚽ ${hImg}${escapeHtml(ssShortName(event.homeTeam))} v ${aImg}${escapeHtml(ssShortName(event.awayTeam))}, ${escapeHtml(timeStr)}</span>${relHtml}${tourCtx}${standingsHtml}${editorialHtml}</div>`;
}

/** event-schedule: renders filtered events from allEvents as a card */
function renderEventSchedule(block, ctx) {
	const filter = block.filter || {};
	if (!filter.sport) return null;

	const now = new Date();
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	let windowStart, windowEnd;
	if (filter.window === 'tomorrow') {
		windowStart = new Date(todayStart.getTime() + SS_CONSTANTS.MS_PER_DAY);
		windowEnd = new Date(windowStart.getTime() + SS_CONSTANTS.MS_PER_DAY);
	} else if (filter.window === 'week') {
		windowStart = todayStart;
		windowEnd = new Date(todayStart.getTime() + 7 * SS_CONSTANTS.MS_PER_DAY);
	} else {
		windowStart = todayStart;
		windowEnd = new Date(todayStart.getTime() + SS_CONSTANTS.MS_PER_DAY);
	}

	const filtered = ctx.allEvents
		.filter(e => e.sport === filter.sport || (e.context || '').toLowerCase().includes(filter.sport))
		.filter(e => isEventInWindow(e, windowStart, windowEnd))
		.sort((a, b) => new Date(a.time) - new Date(b.time));

	if (filtered.length === 0) return null;

	const maxItems = block.maxItems || 6;
	const items = filtered.slice(0, maxItems);
	const todayStr = todayStart.toLocaleDateString('en-CA', { timeZone: 'Europe/Oslo' });

	let html = `<div class="block-event-schedule${block.style === 'highlight' ? ' highlight' : ''}">`;
	if (block.label) {
		html += `<div class="block-schedule-label">${escapeHtml(block.label)}</div>`;
	}
	for (const event of items) {
		const t = new Date(event.time);
		const timeStr = t.toLocaleTimeString('en-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' });
		const eventDay = t.toLocaleDateString('en-CA', { timeZone: 'Europe/Oslo' });
		const dayPrefix = eventDay !== todayStr
			? t.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Europe/Oslo' }) + ' '
			: '';
		const norFlag = (block.showFlags !== false) && (event.norwegian || event.norwegianPlayers?.length > 0) ? ' \u{1F1F3}\u{1F1F4}' : '';
		html += `<div class="block-schedule-item">${escapeHtml(dayPrefix)}${escapeHtml(timeStr)} \u2014 ${escapeHtml(event.title)}${norFlag}</div>`;
	}
	if (filtered.length > maxItems) {
		html += `<div class="block-schedule-more">+${filtered.length - maxItems} more</div>`;
	}
	html += `</div>`;
	return html;
}

/** golf-status: renders tournament status with Norwegian player position and leaderboard snippet */
function renderGolfStatus(block, ctx) {
	if (!ctx.standings?.golf) return null;
	const tourKey = block.tournament === 'dpWorld' ? 'dpWorld' : 'pga';
	const tour = ctx.standings.golf[tourKey];
	if (!tour?.leaderboard?.length) return null;

	const name = tour.name || (tourKey === 'pga' ? 'PGA Tour' : 'DP World Tour');

	// Find tracked (Norwegian) player — data-driven via tracked flag from pipeline
	const trackedNames = ctx._getTrackedGolferNames();
	const norPlayer = tour.leaderboard.find(p => p.tracked)
		|| (tour.trackedPlayers || [])[0];

	const headshot = norPlayer && typeof getGolferHeadshot === 'function'
		? getGolferHeadshot(norPlayer.player) : null;
	const headshotImg = headshot
		? `<img src="${headshot}" alt="${escapeHtml(norPlayer.player)}" class="brief-logo brief-headshot" loading="lazy">`
		: '';

	let html = `<div class="block-event-line editorial-line block-golf-status">\u26f3 ${escapeHtml(name)}: `;
	if (norPlayer) {
		html += `${headshotImg}${escapeHtml(norPlayer.player)} ${escapeHtml(norPlayer.position || '')} (${escapeHtml(norPlayer.score || '')})`;
	} else {
		const leader = tour.leaderboard[0];
		html += `${escapeHtml(leader.player)} leads at ${escapeHtml(leader.score || '')}`;
	}
	html += `</div>`;
	return html;
}

// ── Expose globals ──────────────────────────────────────────────────────────
window.BLOCK_RENDERERS = {
	'match-result':   renderMatchResult,
	'match-preview':  renderMatchPreview,
	'event-schedule': renderEventSchedule,
	'golf-status':    renderGolfStatus,
};
