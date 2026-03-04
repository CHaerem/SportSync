// SportSync Bracket Renderer
// Tournament bracket visualization: single & double elimination, bracket paths, bracket cards.
// Depends on: shared-constants.js (escapeHtml, SS_CONSTANTS)

/**
 * @typedef {Object} BracketContext
 * @property {Function} esc - HTML escape (escapeHtml from shared-constants.js)
 * @property {Function} _isSameDay - Same-day date comparison
 */

/** Find bracket data for an event by _bracketId or name matching */
function findBracketForEvent(event, brackets) {
	if (!brackets) return null;
	// Direct match via _bracketId (synthesized tournament events)
	if (event._bracketId && brackets[event._bracketId]) {
		return brackets[event._bracketId];
	}
	const title = (event.title || '').toLowerCase();
	const tournament = (event.tournament || '').toLowerCase();
	const stage = (event.stage || '').toLowerCase();
	for (const [id, data] of Object.entries(brackets)) {
		if (!data.name) continue;
		const bracketName = data.name.toLowerCase();
		// Match if bracket name appears in event title, tournament, or stage
		// Also match first word of bracket name (e.g. "draculan" from "DraculaN Season 5")
		const firstWord = bracketName.split(' ')[0];
		if (title.includes(bracketName) || title.includes(firstWord) ||
			tournament.includes(bracketName) || tournament.includes(firstWord) ||
			stage.includes(bracketName)) {
			return data;
		}
	}
	return null;
}

/** Check if a bracket match involves a specific team */
function bracketMatchInvolves(match, teamName) {
	if (!teamName) return false;
	const t = teamName.toLowerCase();
	return (match.team1 || '').toLowerCase().includes(t) ||
		(match.team2 || '').toLowerCase().includes(t);
}

/** Compact label for a pending match (e.g., "HEROIC/ASTRAL") */
function bracketPotLabel(m) {
	const t1 = m.team1 || 'TBD';
	const t2 = m.team2 || 'TBD';
	if (t1 === 'TBD' && t2 === 'TBD') return 'TBD';
	return `${t1}/${t2}`;
}

/** Abbreviate round names for bracket tree headers */
function bracketShortRoundName(r) {
	if (!r) return '';
	const s = r.toLowerCase();
	if (s.includes('grand')) return 'GF';
	if (s.includes('final') && !s.includes('quarter') && !s.includes('semi')) return 'Final';
	if (s.includes('semi')) return 'SF';
	if (s.includes('quarter')) return 'QF';
	if (s.includes('round of')) return 'R' + s.replace(/\D/g, '');
	return r.replace(/round\s*/i, 'R');
}

/**
 * Render a compact bracket path for any tournament with playoff data.
 * Shows all remaining rounds from the focus team's current position to the final.
 * Generic — works for double elimination (UB/LB/GF), single elimination, or any format.
 */
function renderBracketPath(b, focus, ctx) {
	const playoffs = b.playoffs;
	if (!playoffs) return '';
	const getLogo = typeof getTeamLogo === 'function' ? getTeamLogo : () => null;
	const focusLogo = getLogo(focus);
	const focusImg = focusLogo ? `<img class="bpath-logo" src="${focusLogo}" alt="" loading="lazy">` : '';
	const ftp = b.focusTeamPath; // pre-built path summary if available

	// Collect all rounds in bracket order, tagged by section
	const allRounds = [];
	const addSection = (rounds, section) => {
		if (!rounds?.length) return;
		for (const r of rounds) allRounds.push({ ...r, _section: section });
	};
	addSection(playoffs.upperBracket, 'UB');
	addSection(playoffs.lowerBracket, 'LB');
	if (Array.isArray(playoffs.grandFinal)) {
		addSection(playoffs.grandFinal, 'GF');
	} else if (playoffs.grandFinal?.matches) {
		addSection([{ round: 'Grand Final', ...playoffs.grandFinal }], 'GF');
	}
	addSection(playoffs.rounds, ''); // single elimination

	// Walk all rounds — categorize focus team matches
	const completed = [];
	let currentSection = null;
	let lastKnownRoundIdx = -1;
	let nextMatch = null;
	for (let i = 0; i < allRounds.length; i++) {
		const round = allRounds[i];
		for (const m of (round.matches || [])) {
			if (!bracketMatchInvolves(m, focus)) continue;
			currentSection = round._section;
			lastKnownRoundIdx = i;
			if (m.winner || m.status === 'completed') {
				const won = m.winner === focus;
				const opp = m.team1 === focus ? m.team2 : m.team1;
				completed.push({
					round: round.round, section: round._section,
					opponent: opp, won, score: m.score, maps: m.maps,
					status: m.status
				});
			} else if (!nextMatch) {
				const opp = (m.team1 === focus ? m.team2 : m.team1) || 'TBD';
				nextMatch = {
					round: round.round, section: round._section,
					opponent: opp, time: m.scheduledTime || round.scheduledTime,
					status: m.status, note: m.note
				};
			}
		}
	}

	// Double-elimination: prefix round names with UB/LB for clarity
	const isDoubleElim = playoffs.upperBracket?.length && playoffs.lowerBracket?.length;
	if (isDoubleElim) {
		for (const c of completed) {
			if (c.section === 'UB') c.round = 'UB ' + c.round;
			else if (c.section === 'LB') c.round = 'LB ' + c.round;
		}
		if (nextMatch?.section === 'UB') nextMatch.round = 'UB ' + nextMatch.round;
		else if (nextMatch?.section === 'LB') nextMatch.round = 'LB ' + nextMatch.round;
	}

	// Merge focusTeamPath.completed — includes group stage matches not in playoffs
	if (ftp?.completed?.length) {
		if (completed.length === 0) {
			// No bracket walk results — use focusTeamPath entirely
			for (const c of ftp.completed) {
				const won = c.result?.startsWith('W');
				completed.push({
					round: c.stage, opponent: c.opponent, won,
					score: c.result?.replace(/^[WL] /, ''),
					maps: c.maps || (c.map ? `${c.map} ${c.result?.replace(/^[WL] /, '')}` : null)
				});
			}
		} else {
			// Merge: prepend group stage / pre-playoff matches, enrich map details
			const prePlayoff = [];
			for (const f of ftp.completed) {
				const isInBracket = completed.some(c => c.opponent === f.opponent);
				if (!isInBracket) {
					const won = f.result?.startsWith('W');
					prePlayoff.push({
						round: f.stage, opponent: f.opponent, won,
						score: f.result?.replace(/^[WL] /, ''),
						maps: f.maps || (f.map ? `${f.map} ${f.result?.replace(/^[WL] /, '')}` : null)
					});
				}
			}
			completed.unshift(...prePlayoff);
			// Enrich map details from focusTeamPath
			for (const c of completed) {
				if (c.maps) continue;
				const ftpMatch = ftp.completed.find(f => f.opponent === c.opponent);
				if (ftpMatch?.maps) c.maps = ftpMatch.maps;
				else if (ftpMatch?.map) c.maps = `${ftpMatch.map} ${ftpMatch.result?.replace(/^[WL] /, '')}`;
			}
		}
	}

	// If no nextMatch from bracket walk, check focusTeamPath.current
	if (!nextMatch && ftp?.current) {
		nextMatch = {
			round: ftp.current.stage,
			opponent: ftp.current.opponent,
			time: ftp.current.scheduledTime,
			status: ftp.current.status,
			format: ftp.current.format
		};
	}

	// Build remaining path to final (future rounds after next match)
	const futurePath = [];
	if (lastKnownRoundIdx >= 0) {
		let skippedNext = false;
		for (let i = lastKnownRoundIdx; i < allRounds.length; i++) {
			const round = allRounds[i];
			const isReachable = round._section === currentSection || round._section === 'GF' || round._section === '';
			if (!isReachable) continue;
			const focusMatch = round.matches?.find(m => bracketMatchInvolves(m, focus));
			const tbdMatch = round.matches?.find(m => !m.winner && m.status !== 'completed');
			const m = focusMatch || tbdMatch;
			if (!m) continue;
			if (m.winner || m.status === 'completed') continue;
			if (!skippedNext) { skippedNext = true; continue; } // skip the nextMatch
			const prefix = isDoubleElim && round._section === 'UB' ? 'UB '
			: isDoubleElim && round._section === 'LB' ? 'LB ' : '';
		futurePath.push({
				round: prefix + round.round,
				time: m.scheduledTime || round.scheduledTime
			});
		}
	}

	if (completed.length === 0 && !nextMatch && futurePath.length === 0) return '';

	// === Render ===
	let html = '<div class="lead-bracket-path">';
	html += `<div class="lead-bracket-path-header">${focusImg}<span>Tournament path \u00b7 ${escapeHtml(focus)}</span></div>`;

	// Completed results
	if (completed.length > 0) {
		for (const c of completed) {
			const oppLogo = getLogo(c.opponent);
			const oppImg = oppLogo ? `<img class="bpath-logo" src="${oppLogo}" alt="" loading="lazy">` : '';
			const badge = c.won ? '<span class="bpath-badge bpath-win">W</span>' : '<span class="bpath-badge bpath-loss">L</span>';
			html += `<div class="bpath-step bpath-completed">`;
			html += `<span class="bpath-round">${escapeHtml(c.round || '')}</span>`;
			html += `<span class="bpath-opp">${badge} ${oppImg} ${escapeHtml(c.opponent || '')}</span>`;
			html += `<span class="bpath-score">${escapeHtml(c.score || '')}</span>`;
			html += '</div>';
			if (c.maps) {
				html += `<div class="bpath-maps">${escapeHtml(c.maps)}</div>`;
			}
		}
	}

	// Next / current match (highlighted)
	if (nextMatch) {
		const oppLogo = getLogo(nextMatch.opponent);
		const oppImg = oppLogo ? `<img class="bpath-logo" src="${oppLogo}" alt="" loading="lazy">` : '';
		let timeStr = '';
		let dayStr = '';
		if (nextMatch.time) {
			const d = new Date(nextMatch.time);
			const now = new Date();
			timeStr = d.toLocaleTimeString('en-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' });
			if (!ctx._isSameDay(d, now)) {
				dayStr = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Europe/Oslo' }) + ' ';
			}
		}
		const format = nextMatch.format ? ` \u00b7 ${escapeHtml(nextMatch.format)}` : '';
		html += `<div class="bpath-step bpath-next">`;
		html += `<span class="bpath-round">${escapeHtml(nextMatch.round || 'Next')}</span>`;
		html += `<span class="bpath-opp">\u25b6 ${oppImg} vs ${escapeHtml(nextMatch.opponent)}</span>`;
		if (timeStr) html += `<span class="bpath-time">${dayStr}${timeStr}${format}</span>`;
		html += '</div>';
	}

	// Future path to final
	for (const step of futurePath) {
		let timeStr = '';
		let dayStr = '';
		if (step.time) {
			const d = new Date(step.time);
			const now = new Date();
			timeStr = d.toLocaleTimeString('en-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' });
			if (!ctx._isSameDay(d, now)) {
				dayStr = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Europe/Oslo' }) + ' ';
			}
		}
		html += `<div class="bpath-step bpath-future">`;
		html += `<span class="bpath-round">${escapeHtml(step.round)}</span>`;
		html += `<span class="bpath-opp">TBD</span>`;
		if (timeStr) html += `<span class="bpath-time">${dayStr}${timeStr}</span>`;
		html += '</div>';
	}

	// Elimination info from focusTeamPath
	if (ftp?.ifLose) {
		html += `<div class="bpath-elim">If eliminated: ${escapeHtml(ftp.ifLose)}</div>`;
	}

	html += '</div>';
	return html;
}

/** Render full tournament bracket (header + visual grid) */
function renderTournamentBracket(bracketData, event, ctx) {
	const b = bracketData.bracket;
	if (!b?.playoffs) return '';
	const focusTeam = bracketData.focusTeam || '';

	let html = '<div class="exp-bracket">';

	// Tournament header
	html += '<div class="exp-bracket-header">';
	html += `<span class="exp-bracket-title">${escapeHtml(bracketData.name)}</span>`;
	if (bracketData.tier) html += `<span class="exp-bracket-tier">${escapeHtml(bracketData.tier)}</span>`;
	html += '</div>';
	if (bracketData.prizePool) {
		html += `<div class="exp-bracket-prize">${escapeHtml(bracketData.prizePool)}</div>`;
	}
	// Staleness indicator
	if (bracketData._lastUpdated) {
		const hoursAgo = Math.round((Date.now() - new Date(bracketData._lastUpdated).getTime()) / SS_CONSTANTS.MS_PER_HOUR);
		if (hoursAgo >= 4) {
			html += `<div class="exp-bracket-stale">Bracket data from ${hoursAgo}h ago</div>`;
		}
	}

	// Visual bracket tree
	html += renderBracketGrid(b.playoffs, focusTeam, ctx);

	html += '</div>';
	return html;
}

/** Render bracket grid (handles single/double elimination layouts) */
function renderBracketGrid(playoffs, focusTeam, ctx) {
	let html = '<div class="bk-grid">';

	// Single elimination: playoffs.rounds = [{round, matches}, ...]
	if (playoffs.rounds?.length > 0) {
		html += renderBracketTree(playoffs.rounds, focusTeam, ctx);
	}

	// Double elimination: upper/lower/grand final
	const hasLower = playoffs.lowerBracket?.length > 0;
	if (playoffs.upperBracket?.length > 0) {
		if (hasLower) html += '<div class="bk-sec"><div class="bk-sec-label">Upper Bracket</div>';
		html += renderBracketTree(playoffs.upperBracket, focusTeam, ctx);
		if (hasLower) html += '</div>';
	}
	if (hasLower) {
		html += '<div class="bk-sec"><div class="bk-sec-label">Lower Bracket</div>';
		html += renderBracketTree(playoffs.lowerBracket, focusTeam, ctx);
		html += '</div>';
	}
	if (playoffs.grandFinal?.matches?.length > 0) {
		html += '<div class="bk-sec"><div class="bk-sec-label">Grand Final</div>';
		html += renderBracketTree([{ matches: playoffs.grandFinal.matches }], focusTeam, ctx);
		html += '</div>';
	}

	html += '</div>';
	return html;
}

/** Render bracket tree (column of rounds with connector lines) */
function renderBracketTree(rounds, focusTeam, ctx) {
	const vis = [...rounds];
	if (!vis.length) return '';

	// Pre-process: propagate round-level scheduledTime to matches,
	// and compute potential team names for TBD slots
	for (let i = 0; i < vis.length; i++) {
		const round = vis[i];
		const prev = vis[i - 1];
		for (let j = 0; j < round.matches.length; j++) {
			const m = round.matches[j];
			if (!m.scheduledTime && round.scheduledTime) m._roundTime = round.scheduledTime;
			if (prev && (m.team1 || 'TBD') === 'TBD' && (m.team2 || 'TBD') === 'TBD') {
				const prevPairSize = Math.ceil(prev.matches.length / round.matches.length);
				const startIdx = j * prevPairSize;
				const feeders = prev.matches.slice(startIdx, startIdx + prevPairSize);
				if (feeders.length >= 2) {
					m._pot1 = feeders[0].winner || bracketPotLabel(feeders[0]);
					m._pot2 = feeders[1].winner || bracketPotLabel(feeders[1]);
				} else if (feeders.length === 1) {
					m._pot1 = feeders[0].winner || bracketPotLabel(feeders[0]);
				}
			}
		}
	}

	let html = '<div class="bk-tree">';
	for (let i = 0; i < vis.length; i++) {
		const round = vis[i];
		const next = vis[i + 1];

		html += '<div class="bk-round">';
		html += `<div class="bk-rh">${escapeHtml(bracketShortRoundName(round.round))}</div>`;
		html += '<div class="bk-slots">';
		for (const m of round.matches) {
			html += renderBracketCard(m, focusTeam, ctx);
		}
		html += '</div></div>';

		if (next) {
			const lc = round.matches.length, rc = next.matches.length;
			if (lc > 1 && rc === Math.ceil(lc / 2)) {
				html += '<div class="bk-conn"><div class="bk-rh">&nbsp;</div><div class="bk-conn-body">';
				for (let p = 0; p < rc; p++) html += '<div class="bk-cp"><div class="bk-cpin"></div></div>';
				html += '</div></div>';
			} else if (lc === rc) {
				html += '<div class="bk-conn solo"><div class="bk-rh">&nbsp;</div><div class="bk-conn-body">';
				for (let p = 0; p < lc; p++) html += '<div class="bk-cp"></div>';
				html += '</div></div>';
			}
		}
	}
	html += '</div>';
	return html;
}

/** Render a single bracket match card */
function renderBracketCard(m, focusTeam, ctx) {
	const hasFocus = bracketMatchInvolves(m, focusTeam);
	const isLive = m.status === 'live';
	const isTbd = (m.team1 || 'TBD') === 'TBD' && (m.team2 || 'TBD') === 'TBD';
	const hasWinner = !!m.winner;
	const getLogo = typeof getTeamLogo === 'function' ? getTeamLogo : () => null;

	let s1 = '', s2 = '';
	if (m.score && m.score !== 'FF') {
		const p = m.score.split('-');
		if (p.length === 2) { s1 = p[0].trim(); s2 = p[1].trim(); }
	} else if (m.score === 'FF') {
		s1 = m.winner === m.team1 ? 'W' : '-';
		s2 = m.winner === m.team2 ? 'W' : '-';
	}

	let timeStr = '';
	if ((m.scheduledTime || m._roundTime) && !hasWinner && !isLive) {
		const d = new Date(m.scheduledTime || m._roundTime);
		if (!isNaN(d)) {
			const now = new Date();
			const sameDay = d.toDateString() === now.toDateString();
			const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });
			timeStr = sameDay ? time : d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Europe/Oslo' }) + ' ' + time;
		}
	}

	const cls = ['bk-m', hasFocus ? 'focus' : '', isLive ? 'live' : '', isTbd ? 'tbd' : ''].filter(Boolean).join(' ');
	const t1w = m.winner === m.team1, t2w = m.winner === m.team2;
	const t1f = focusTeam && (m.team1 || '').toLowerCase().includes(focusTeam.toLowerCase());
	const t2f = focusTeam && (m.team2 || '').toLowerCase().includes(focusTeam.toLowerCase());

	const logoHtml = (name) => {
		const url = getLogo(name);
		return url ? `<img src="${url}" alt="" class="bk-logo" loading="lazy">` : '';
	};

	// For TBD matches with potential teams from bracket structure
	const isTbd1 = !m.team1 || m.team1 === 'TBD';
	const isTbd2 = !m.team2 || m.team2 === 'TBD';
	const dispT1 = isTbd1 && m._pot1 ? `W: ${m._pot1}` : (m.team1 || 'TBD');
	const dispT2 = isTbd2 && m._pot2 ? `W: ${m._pot2}` : (m.team2 || 'TBD');
	const isPot1 = isTbd1 && m._pot1;
	const isPot2 = isTbd2 && m._pot2;

	let html = `<div class="${cls}">`;
	html += `<div class="bk-t${t1w ? ' w' : ''}${hasWinner && !t1w ? ' l' : ''}${t1f ? ' ft' : ''}${isPot1 ? ' pot' : ''}">`;
	html += logoHtml(m.team1);
	html += `<span class="bk-name">${escapeHtml(dispT1)}</span>`;
	html += `<span class="bk-sc">${escapeHtml(s1)}</span></div>`;
	html += `<div class="bk-t${t2w ? ' w' : ''}${hasWinner && !t2w ? ' l' : ''}${t2f ? ' ft' : ''}${isPot2 ? ' pot' : ''}">`;
	html += logoHtml(m.team2);
	html += `<span class="bk-name">${escapeHtml(dispT2)}</span>`;
	html += `<span class="bk-sc">${escapeHtml(s2)}</span></div>`;
	if (timeStr) html += `<div class="bk-time">${timeStr}</div>`;
	html += '</div>';
	return html;
}

// ── Expose globals ──────────────────────────────────────────────────────────
window.BracketRenderer = {
	findBracketForEvent,
	renderBracketPath,
	renderTournamentBracket,
	renderBracketGrid,
	renderBracketTree,
	renderBracketCard,
	bracketPotLabel,
	bracketMatchInvolves,
	bracketShortRoundName,
};
