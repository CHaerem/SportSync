// SportSync Dashboard — Sport-organized layout

/** Check if an event overlaps a time window. Handles multi-day events (endTime). */
function isEventInWindow(event, windowStart, windowEnd) {
	if (!event?.time) return false;
	const start = new Date(event.time).getTime();
	const end = event.endTime ? new Date(event.endTime).getTime() : start;
	const ws = windowStart instanceof Date ? windowStart.getTime() : windowStart;
	const we = windowEnd instanceof Date ? windowEnd.getTime() : windowEnd;
	return start < we && end >= ws;
}

class Dashboard {
	constructor() {
		this.allEvents = [];
		this.featured = null;
		this.standings = null;
		this.watchPlan = null;
		this.rssDigest = null;
		this.expandedId = null;
		this.liveScores = {};      // { eventId: { home, away, clock, state } }
		this.liveLeaderboard = null; // golf live leaderboard
		this._liveInterval = null;
		this._liveVisible = true;
		this.selectedDate = null; // null = today; Date object = start-of-day for other dates
		this.recentResults = null; // recent-results.json data
		this.preferences = window.PreferencesManager ? new PreferencesManager() : null;
		window._ssPreferences = this.preferences;
		this.feedback = window.FeedbackManager ? new FeedbackManager() : null;
		this.init();
	}

	async init() {
		this.bindThemeToggle();
		await this.loadEvents();
		setInterval(() => this.loadEvents(), 15 * 60 * 1000);
		this.startLivePolling();
		document.addEventListener('visibilitychange', () => {
			this._liveVisible = !document.hidden;
		});
	}

	// --- Session cache ---

	_cacheGet(key, maxAgeMs) {
		try {
			const raw = sessionStorage.getItem('ss_' + key);
			if (!raw) return null;
			const { ts, data } = JSON.parse(raw);
			if (Date.now() - ts > maxAgeMs) return null;
			return data;
		} catch { return null; }
	}

	_cacheSet(key, data) {
		try {
			sessionStorage.setItem('ss_' + key, JSON.stringify({ ts: Date.now(), data }));
		} catch { /* quota exceeded — ignore */ }
	}

	// --- Data loading ---

	async loadEvents() {
		const STATIC_TTL = 15 * 60 * 1000; // 15 minutes — data only changes every 2h
		const cachedEvents = this._cacheGet('events', STATIC_TTL);
		const cachedFeatured = this._cacheGet('featured', STATIC_TTL);
		const cachedStandings = this._cacheGet('standings', STATIC_TTL);
		const cachedWatchPlan = this._cacheGet('watchPlan', STATIC_TTL);
		const cachedRssDigest = this._cacheGet('rssDigest', STATIC_TTL);
		const cachedRecentResults = this._cacheGet('recentResults', STATIC_TTL);

		// Always fetch meta.json for freshness display (tiny, not cached)
		fetch('data/meta.json?t=' + Date.now()).then(r => r.ok ? r.json() : null)
			.then(m => { this.meta = m; this.renderDateLine(); })
			.catch(() => {});

		if (cachedEvents) {
			this.allEvents = cachedEvents;
			this.featured = cachedFeatured;
			this.standings = cachedStandings;
			this.watchPlan = cachedWatchPlan;
			this.rssDigest = cachedRssDigest;
			this.recentResults = cachedRecentResults;
			this.render();
			return;
		}

		try {
			const [eventsResp, featuredResp, standingsResp, watchPlanResp, rssDigestResp, metaResp, recentResultsResp] = await Promise.all([
				fetch('data/events.json?t=' + Date.now()),
				fetch('data/featured.json?t=' + Date.now()).catch(() => null),
				fetch('data/standings.json?t=' + Date.now()).catch(() => null),
				fetch('data/watch-plan.json?t=' + Date.now()).catch(() => null),
				fetch('data/rss-digest.json?t=' + Date.now()).catch(() => null),
				fetch('data/meta.json?t=' + Date.now()).catch(() => null),
				fetch('data/recent-results.json?t=' + Date.now()).catch(() => null)
			]);

			if (!eventsResp.ok) throw new Error('Failed to load events');
			const data = await eventsResp.json();
			this.allEvents = data
				.map(ev => ({
					id: `${ev.sport}-${ev.title}-${ev.time}`.replace(/\s+/g, '-').toLowerCase(),
					title: ev.title,
					time: ev.time,
					endTime: ev.endTime || null,
					sport: ev.sport === 'f1' ? 'formula1' : (ev.sport === 'cs2' ? 'esports' : ev.sport),
					tournament: ev.tournament || '',
					venue: ev.venue || '',
					norwegian: ev.norwegian || false,
					streaming: ev.streaming || [],
					participants: ev.participants || [],
					norwegianPlayers: ev.norwegianPlayers || [],
					link: ev.link || null,
					homeTeam: ev.homeTeam || null,
					awayTeam: ev.awayTeam || null,
					context: ev.context || null,
					featuredGroups: ev.featuredGroups || [],
					importance: typeof ev.importance === 'number' ? ev.importance : null,
					summary: ev.summary || null,
					tags: Array.isArray(ev.tags) ? ev.tags : [],
					norwegianRelevance: typeof ev.norwegianRelevance === 'number' ? ev.norwegianRelevance : null,
				importanceReason: ev.importanceReason || null,
				}))
				.sort((a, b) => new Date(a.time) - new Date(b.time));

			if (featuredResp && featuredResp.ok) {
				try { this.featured = await featuredResp.json(); } catch { this.featured = null; }
			}

			if (standingsResp && standingsResp.ok) {
				try { this.standings = await standingsResp.json(); } catch { this.standings = null; }
			}

			if (watchPlanResp && watchPlanResp.ok) {
				try { this.watchPlan = await watchPlanResp.json(); } catch { this.watchPlan = null; }
			}

			if (rssDigestResp && rssDigestResp.ok) {
				try { this.rssDigest = await rssDigestResp.json(); } catch { this.rssDigest = null; }
			}

			if (metaResp && metaResp.ok) {
				try { this.meta = await metaResp.json(); } catch { this.meta = null; }
			}

			if (recentResultsResp && recentResultsResp.ok) {
				try { this.recentResults = await recentResultsResp.json(); } catch { this.recentResults = null; }
			}

			this._cacheSet('events', this.allEvents);
			this._cacheSet('featured', this.featured);
			this._cacheSet('standings', this.standings);
			this._cacheSet('watchPlan', this.watchPlan);
			this._cacheSet('rssDigest', this.rssDigest);
			this._cacheSet('recentResults', this.recentResults);

			this.render();
		} catch (err) {
			console.error('Error loading events:', err);
			document.getElementById('events').innerHTML =
				'<p class="empty">Unable to load events. Please refresh.</p>';
		}
	}

	// --- Day navigation ---

	_isSameDay(a, b) {
		return a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate();
	}

	_isToday(date) {
		return this._isSameDay(date, new Date());
	}

	_isYesterday(date) {
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		return this._isSameDay(date, yesterday);
	}

	_isTomorrow(date) {
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		return this._isSameDay(date, tomorrow);
	}

	_startOfDay(date) {
		return new Date(date.getFullYear(), date.getMonth(), date.getDate());
	}

	_getSelectedDate() {
		return this.selectedDate || this._startOfDay(new Date());
	}

	_isViewingToday() {
		return !this.selectedDate || this._isToday(this.selectedDate);
	}

	getEventsForDate(date) {
		const dayStart = this._startOfDay(date);
		const dayEnd = new Date(dayStart.getTime() + 86400000);
		const now = new Date();

		const dayEvents = this.allEvents.filter(e => isEventInWindow(e, dayStart, dayEnd));

		const live = [];
		const upcoming = [];
		const results = [];

		for (const e of dayEvents) {
			const t = new Date(e.time);
			const liveScore = this.liveScores[e.id];

			if (liveScore && liveScore.state === 'in') {
				live.push(e);
			} else if (liveScore && liveScore.state === 'post') {
				results.push(e);
			} else {
				const hoursAgo = (now - t) / (1000 * 60 * 60);
				const endTime = e.endTime ? new Date(e.endTime) : null;
				const isEnded = endTime ? now > endTime : hoursAgo > 3;
				if (t < now && isEnded) {
					results.push(e);
				} else {
					upcoming.push(e);
				}
			}
		}

		return { live, upcoming, results };
	}

	getResultsForDate(date) {
		const football = Array.isArray(this.recentResults?.football) ? this.recentResults.football : [];
		if (football.length === 0) return [];
		const dayStart = this._startOfDay(date);
		const dateKey = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, '0')}-${String(dayStart.getDate()).padStart(2, '0')}`;
		return football.filter(m => m.date && m.date.startsWith(dateKey));
	}

	renderDayNav() {
		const el = document.getElementById('day-nav');
		if (!el) return;

		const viewDate = this._getSelectedDate();
		const isToday = this._isViewingToday();

		let label;
		if (isToday) {
			label = 'Today';
		} else if (this._isYesterday(viewDate)) {
			label = 'Yesterday';
		} else if (this._isTomorrow(viewDate)) {
			label = 'Tomorrow';
		} else {
			label = viewDate.toLocaleDateString('en-US', {
				weekday: 'short', month: 'short', day: 'numeric',
				timeZone: 'Europe/Oslo'
			});
		}

		// Format for the hidden date input (YYYY-MM-DD)
		const y = viewDate.getFullYear();
		const m = String(viewDate.getMonth() + 1).padStart(2, '0');
		const d = String(viewDate.getDate()).padStart(2, '0');
		const inputValue = `${y}-${m}-${d}`;

		el.innerHTML = `
			<button class="day-nav-arrow" data-dir="-1" aria-label="Previous day">\u2190</button>
			<button class="day-nav-label" aria-label="Pick a date">
				${this.esc(label)}
				<input type="date" class="day-nav-date-input" value="${inputValue}" tabindex="-1">
			</button>
			<button class="day-nav-arrow" data-dir="1" aria-label="Next day">\u2192</button>
		`;

		this.bindDayNav();
	}

	bindDayNav() {
		const el = document.getElementById('day-nav');
		if (!el) return;

		// Arrow buttons
		el.querySelectorAll('.day-nav-arrow').forEach(btn => {
			btn.addEventListener('click', () => {
				const dir = parseInt(btn.dataset.dir, 10);
				const current = this._getSelectedDate();
				const next = new Date(current);
				next.setDate(next.getDate() + dir);
				this.selectedDate = this._isToday(next) ? null : this._startOfDay(next);
				this.render();
			});
		});

		// Label click → open date picker
		const label = el.querySelector('.day-nav-label');
		const dateInput = el.querySelector('.day-nav-date-input');
		if (label && dateInput) {
			label.addEventListener('click', (e) => {
				if (e.target === dateInput) return;
				dateInput.showPicker ? dateInput.showPicker() : dateInput.click();
			});
			dateInput.addEventListener('change', () => {
				if (!dateInput.value) return;
				const [y, m, d] = dateInput.value.split('-').map(Number);
				const picked = new Date(y, m - 1, d);
				this.selectedDate = this._isToday(picked) ? null : this._startOfDay(picked);
				this.render();
			});
		}
	}

	// --- Date briefing loading ---

	_dateKey(date) {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	async loadDateBriefing(dateKey) {
		// Check session cache first (5 min TTL)
		const cached = this._cacheGet('featured_' + dateKey, 5 * 60 * 1000);
		if (cached) return cached;

		try {
			const resp = await fetch(`data/featured-${dateKey}.json?t=${Date.now()}`);
			if (!resp.ok) return null;
			const data = await resp.json();
			this._cacheSet('featured_' + dateKey, data);
			return data;
		} catch {
			return null;
		}
	}

	// --- Day Snapshots ---

	async loadDaySnapshot(dateKey) {
		// Check session cache first (5 min TTL)
		const cached = this._cacheGet('snapshot_' + dateKey, 5 * 60 * 1000);
		if (cached) return cached;

		try {
			const resp = await fetch(`data/days/${dateKey}.json?t=${Date.now()}`);
			if (!resp.ok) return this.buildClientSnapshot(dateKey);
			const data = await resp.json();
			this._cacheSet('snapshot_' + dateKey, data);
			return data;
		} catch {
			return this.buildClientSnapshot(dateKey);
		}
	}

	buildClientSnapshot(dateKey) {
		const [y, m, d] = dateKey.split('-').map(Number);
		const date = new Date(y, m - 1, d);
		const { upcoming, results } = this.getEventsForDate(date);
		const matchResults = this.getResultsForDate(date);

		return {
			schemaVersion: 1,
			date: dateKey,
			generatedAt: new Date().toISOString(),
			events: { upcoming, results },
			matchResults,
			standings: null,
			watchPlan: null,
			rssHighlights: null,
			meta: {
				eventCount: upcoming.length + results.length,
				sportsCovered: [...new Set([...upcoming, ...results].map(e => e.sport).filter(Boolean))],
				hasResults: matchResults.length > 0,
				hasStandings: false,
			},
		};
	}

	async renderFromSnapshot(snapshot, dateKey) {
		// Render structured content immediately (fast, always available)
		this.renderSnapshotEvents(snapshot);

		// Show standings and RSS from snapshot if available
		if (snapshot.standings) {
			this.renderSnapshotStandings(snapshot.standings);
		}

		// Async-load editorial overlay (enhances but not required)
		const briefing = await this.loadDateBriefing(dateKey);
		if (briefing) {
			this.renderEditorial(briefing);
		} else {
			this.renderAutoEditorial(snapshot);
		}
	}

	renderSnapshotEvents(snapshot) {
		const container = document.getElementById('events');
		if (!container) return;

		const upcoming = snapshot.events?.upcoming || [];
		const results = snapshot.events?.results || [];

		// Convert match results to result pseudo-events
		const matchResults = (snapshot.matchResults || []).map(m => ({
			id: `result-${m.homeTeam}-${m.awayTeam}-${m.date}`.replace(/\s+/g, '-').toLowerCase(),
			title: `${m.homeTeam} ${m.homeScore}\u2013${m.awayScore} ${m.awayTeam}`,
			sport: 'football',
			time: m.date,
			tournament: m.league || '',
			venue: m.venue || '',
			_isResult: true,
			_goalScorers: m.goalScorers || [],
			_isFavorite: m.isFavorite || false,
			_recapHeadline: m.recapHeadline || '',
		}));

		// Merge event-based results with match results (dedupe)
		const existingKeys = new Set(results.map(e => `${e.homeTeam}-${e.awayTeam}`));
		const newResults = matchResults.filter(r => !existingKeys.has(`${r.title.split(' ')[0]}-${r.title.split(' ').slice(-1)[0]}`));
		const allResults = [...results, ...newResults];

		let html = '';
		html += this.renderBand('Events', upcoming, {});
		html += this.renderBand('Results', allResults, { cssClass: 'results' });

		if (!html) {
			html = '<p class="date-empty">No events on this date.</p>';
		}

		container.innerHTML = html;
		this.bindEventRows();
		this.bindBandToggles();
		this.bindFeedbackButtons();
	}

	renderSnapshotStandings(standings) {
		// Render standings in the featured-sections area if available
		const sectionsEl = document.getElementById('featured-sections');
		if (!sectionsEl || !standings) return;

		let html = '';

		if (standings.premierLeague?.length > 0) {
			html += '<div class="featured-section">';
			html += '<div class="feat-header">Premier League</div>';
			for (const team of standings.premierLeague) {
				const text = `${team.rank || ''} ${team.team || team.name || ''} — ${team.points || 0} pts`;
				html += `<div class="feat-item text">${this.esc(text)}</div>`;
			}
			html += '</div>';
		}

		if (standings.golf?.pga?.leaderboard?.length > 0) {
			html += '<div class="featured-section">';
			html += `<div class="feat-header">${this.esc(standings.golf.pga.name || 'PGA Tour')}</div>`;
			for (const entry of standings.golf.pga.leaderboard) {
				const text = `${entry.position || ''} ${entry.player || entry.name || ''} (${entry.score || ''})`;
				html += `<div class="feat-item text">${this.esc(text)}</div>`;
			}
			html += '</div>';
		}

		if (html) {
			sectionsEl.innerHTML += html;
			sectionsEl.style.display = '';
		}
	}

	renderAutoEditorial(snapshot) {
		const briefEl = document.getElementById('the-brief');
		const sectionsEl = document.getElementById('featured-sections');
		if (!briefEl) return;

		const events = [...(snapshot.events?.upcoming || []), ...(snapshot.events?.results || [])];
		const matchResults = snapshot.matchResults || [];

		if (events.length === 0 && matchResults.length === 0) {
			briefEl.innerHTML = '';
			briefEl.style.display = 'none';
			if (sectionsEl) { sectionsEl.innerHTML = ''; sectionsEl.style.display = ''; }
			return;
		}

		// Build a deterministic editorial from the snapshot data
		const sportCounts = {};
		events.forEach(e => { sportCounts[e.sport] = (sportCounts[e.sport] || 0) + 1; });

		const sportLabels = {
			football: 'football', golf: 'golf', tennis: 'tennis',
			formula1: 'F1', chess: 'chess', esports: 'esports', olympics: 'Olympics'
		};

		const parts = Object.entries(sportCounts)
			.map(([sport, count]) => `${count} ${sportLabels[sport] || sport}`)
			.join(', ');

		let html = '';

		// Summary line
		if (events.length > 0) {
			html += `<div class="block-event-line editorial-line">${events.length} event${events.length !== 1 ? 's' : ''} \u2014 ${this.esc(parts)}</div>`;
		}

		// Top importance events as event-lines
		const topEvents = [...events]
			.filter(e => e.importance >= 4)
			.sort((a, b) => (b.importance || 0) - (a.importance || 0))
			.slice(0, 3);

		for (const e of topEvents) {
			const sportConfig = typeof SPORT_CONFIG !== 'undefined' ? SPORT_CONFIG.find(s => s.id === e.sport) : null;
			const emoji = sportConfig ? sportConfig.emoji : '';
			const time = new Date(e.time).toLocaleTimeString('en-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' });
			const text = `${emoji} ${time} ${e.title}${e.summary ? ' \u2014 ' + e.summary : ''}`;
			html += `<div class="block-event-line editorial-line">${this.renderBriefLine(text)}</div>`;
		}

		// Match results summary
		if (matchResults.length > 0) {
			const favResults = matchResults.filter(m => m.isFavorite);
			const displayResults = favResults.length > 0 ? favResults : matchResults.slice(0, 3);
			for (const m of displayResults) {
				const text = `${m.homeTeam} ${m.homeScore}\u2013${m.awayScore} ${m.awayTeam}`;
				html += `<div class="block-event-line editorial-line">${this.esc(text)}</div>`;
			}
		}

		briefEl.innerHTML = html;
		briefEl.style.display = '';
		if (sectionsEl) { sectionsEl.innerHTML = ''; sectionsEl.style.display = ''; }
	}

	// --- Rendering ---

	render() {
		this.renderDayNav();
		this.renderDateLine();
		const isToday = this._isViewingToday();

		if (isToday) {
			// Today: existing full behavior (live polling, dynamic briefs, etc.)
			this.renderEditorial();
			this.renderWatchPlan();
			this.renderEvents();
			this.renderNews();
		} else {
			// Other dates: snapshot-driven rendering
			const dateKey = this._dateKey(this._getSelectedDate());
			this.loadDaySnapshot(dateKey).then(snapshot => {
				this.renderFromSnapshot(snapshot, dateKey);
			});
		}

		this.renderFeedbackPanel();

		// Hide today-centric sections on non-today dates
		const todayOnlySections = ['watch-plan', 'news', 'feedback-panel'];
		for (const id of todayOnlySections) {
			const section = document.getElementById(id);
			if (section) section.style.display = isToday ? '' : 'none';
		}
	}

	renderDateLine() {
		const el = document.getElementById('date-line');
		if (!el) return;
		const viewDate = this._getSelectedDate();
		let text = viewDate.toLocaleDateString('en-US', {
			weekday: 'long', month: 'long', day: 'numeric',
			timeZone: 'Europe/Oslo'
		});
		let suffix = '';
		if (this._isViewingToday() && this.meta && this.meta.lastUpdate) {
			const now = new Date();
			const updated = new Date(this.meta.lastUpdate);
			const diffMin = Math.round((now - updated) / 60000);
			let ago;
			if (diffMin < 1) ago = 'just now';
			else if (diffMin < 60) ago = `${diffMin}m ago`;
			else if (diffMin < 1440) ago = `${Math.round(diffMin / 60)}h ago`;
			else ago = `${Math.round(diffMin / 1440)}d ago`;
			suffix = `  \u00b7  Updated ${ago}  \u00b7  <a href="data/events.ics" class="cal-link" title="Subscribe to calendar">iCal</a>`;
		}
		el.innerHTML = this.esc(text) + suffix;
	}

	// --- Editorial (Block-based layout) ---

	getEditorialBlocks() {
		if (!this.featured || !Array.isArray(this.featured.blocks)) return [];
		return this.featured.blocks;
	}

	renderEditorial(dateBriefing) {
		const briefEl = document.getElementById('the-brief');
		const sectionsEl = document.getElementById('featured-sections');
		const isToday = this._isViewingToday();

		// For non-today dates with a date-specific briefing
		if (!isToday && dateBriefing) {
			const blocks = Array.isArray(dateBriefing.blocks) ? dateBriefing.blocks : [];
			const mode = dateBriefing._meta?.mode;
			const viewDate = this._getSelectedDate();
			const modeLabel = (mode === 'recap' && this._isYesterday(viewDate)) ? "Yesterday's Recap"
				: (mode === 'preview' && this._isTomorrow(viewDate)) ? "Tomorrow's Preview"
				: null;

			let html = modeLabel ? `<div class="briefing-mode-label">${this.esc(modeLabel)}</div>` : '';
			html += blocks.filter(b => b.type !== 'section').map(block => this.renderBlock(block)).join('');
			briefEl.innerHTML = html;
			briefEl.style.display = '';

			const sectionBlocks = blocks.filter(b => b.type === 'section');
			if (sectionBlocks.length > 0) {
				sectionsEl.innerHTML = sectionBlocks.map(block => this.renderSection(block)).join('');
				sectionsEl.style.display = '';
				this.bindSectionExpands();
			} else {
				sectionsEl.innerHTML = '';
				sectionsEl.style.display = '';
			}
			return;
		}

		// Non-today with no briefing: hide brief area (auto-editorial from snapshot handles this)
		if (!isToday && !dateBriefing) {
			briefEl.innerHTML = '';
			briefEl.style.display = 'none';
			sectionsEl.innerHTML = '';
			sectionsEl.style.display = '';
			return;
		}

		// Today: original behavior
		let blocks = this.getEditorialBlocks();

		if (blocks.length === 0) {
			// Fallback: generate brief lines
			const lines = this.generateBriefLines();
			blocks = lines.map(line => ({ type: 'event-line', text: line }));
		}

		// Dynamic adjustment: replace first event-line with live context
		const dynamicLine = this.generateDynamicBriefLine();
		if (dynamicLine) {
			const firstEventIdx = blocks.findIndex(b => b.type === 'event-line');
			if (firstEventIdx >= 0) {
				blocks = [...blocks];
				blocks[firstEventIdx] = { type: 'event-line', text: dynamicLine };
			}
		}

		// Prepend live score lines as event-line blocks
		const liveLines = this.generateLiveBriefLines();
		if (liveLines.length > 0) {
			const liveBlocks = liveLines.map(line => ({ type: 'event-line', text: line, _live: true }));
			blocks = [...liveBlocks, ...blocks];
		}

		if (blocks.length === 0) {
			briefEl.style.display = 'none';
			sectionsEl.innerHTML = '';
			return;
		}

		briefEl.style.display = '';

		// Split: section blocks go to #featured-sections, all others to #the-brief
		const briefBlocks = blocks.filter(b => b.type !== 'section');
		const sectionBlocks = blocks.filter(b => b.type === 'section');

		// Render brief blocks
		briefEl.innerHTML = briefBlocks.map(block => this.renderBlock(block)).join('');

		// Render section blocks
		if (sectionBlocks.length > 0) {
			sectionsEl.innerHTML = sectionBlocks.map(block => this.renderSection(block)).join('');
			this.bindSectionExpands();
		} else {
			sectionsEl.innerHTML = '';
		}
	}

	renderBlock(block) {
		switch (block.type) {
			case 'headline':
				return `<div class="block-headline">${this.renderBriefLine(block.text || '')}</div>`;
			case 'event-line': {
				const isLive = block._live || (block.text && (block.text.startsWith('LIVE:') || block.text.startsWith('\u26f3')));
				const cls = isLive ? ' brief-live' : '';
				return `<div class="block-event-line editorial-line${cls}">${this.renderBriefLine(block.text || '')}</div>`;
			}
			case 'event-group': {
				let html = `<div class="block-event-group">`;
				html += `<div class="block-group-label">${this.esc(block.label || '')}</div>`;
				const items = Array.isArray(block.items) ? block.items : [];
				for (const item of items) {
					const text = typeof item === 'string' ? item : (item?.text || '');
					html += `<div class="block-group-item">${this.renderBriefLine(text)}</div>`;
				}
				html += `</div>`;
				return html;
			}
			case 'narrative':
				return `<div class="block-narrative">${this.renderBriefLine(block.text || '')}</div>`;
			case 'divider':
				return `<div class="block-divider">${this.esc(block.text || '')}</div>`;
			case 'section':
				return ''; // Sections rendered separately
			default:
				return '';
		}
	}

	generateDynamicBriefLine() {
		const now = new Date();
		const bands = this.categorizeEvents();

		// If something is live, the dynamic line leads with that
		if (bands.live.length > 0) return null; // generateLiveBriefLines handles this

		// If something starts within 30 minutes, highlight it
		const soonEvents = bands.today.filter(e => {
			const diff = (new Date(e.time) - now) / 60000;
			return diff > 0 && diff <= 30;
		});
		if (soonEvents.length > 0) {
			const e = soonEvents[0];
			const mins = Math.round((new Date(e.time) - now) / 60000);
			const sportConfig = typeof SPORT_CONFIG !== 'undefined' ? SPORT_CONFIG.find(s => s.id === e.sport) : null;
			const emoji = sportConfig ? sportConfig.emoji : '';
			if (e.sport === 'football' && e.homeTeam && e.awayTeam) {
				return `${emoji} ${this.shortName(e.homeTeam)} v ${this.shortName(e.awayTeam)} kicks off in ${mins}m`;
			}
			return `${emoji} ${e.title} starts in ${mins}m`;
		}

		// If all today events have ended, say so
		if (bands.today.length === 0 && bands.results.length > 0 && bands.live.length === 0) {
			const nextUp = bands.tomorrow.length > 0 ? bands.tomorrow[0] : null;
			if (nextUp) {
				const sportConfig = typeof SPORT_CONFIG !== 'undefined' ? SPORT_CONFIG.find(s => s.id === nextUp.sport) : null;
				const emoji = sportConfig ? sportConfig.emoji : '';
				return `Today's events wrapped — next up: ${emoji} ${nextUp.title} tomorrow`;
			}
			return "Today's events have wrapped up";
		}

		return null; // Use the static editorial line
	}

	generateBriefLines() {
		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const todayEnd = new Date(todayStart.getTime() + 86400000);

		const todayEvents = this.allEvents.filter(e => isEventInWindow(e, todayStart, todayEnd));

		if (todayEvents.length === 0) return [];

		const sportCounts = {};
		todayEvents.forEach(e => { sportCounts[e.sport] = (sportCounts[e.sport] || 0) + 1; });

		const sportLabels = {
			football: 'football', golf: 'golf', tennis: 'tennis',
			formula1: 'F1', chess: 'chess', esports: 'esports', olympics: 'Olympics'
		};

		const parts = Object.entries(sportCounts)
			.map(([sport, count]) => `${count} ${sportLabels[sport] || sport}`)
			.join(', ');

		return [`${todayEvents.length} events today \u2014 ${parts}.`];
	}

	generateLiveBriefLines() {
		const lines = [];

		// Live football matches
		const liveMatches = Object.entries(this.liveScores)
			.map(([eventId, score]) => {
				if (score.state !== 'in') return null;
				const event = this.allEvents.find(e => e.id === eventId);
				if (!event) return null;
				return { event, score };
			})
			.filter(Boolean);

		if (liveMatches.length > 0) {
			const m = liveMatches[0];
			lines.push(`LIVE: ${this.shortName(m.event.homeTeam)} ${m.score.home}-${m.score.away} ${this.shortName(m.event.awayTeam)} (${m.score.clock})`);
		}

		// Recently finished matches
		if (liveMatches.length === 0) {
			const finished = Object.entries(this.liveScores)
				.map(([eventId, score]) => {
					if (score.state !== 'post') return null;
					const event = this.allEvents.find(e => e.id === eventId);
					if (!event) return null;
					return { event, score };
				})
				.filter(Boolean);

			if (finished.length > 0) {
				const m = finished[0];
				lines.push(`FT: ${this.shortName(m.event.homeTeam)} ${m.score.home}-${m.score.away} ${this.shortName(m.event.awayTeam)}`);
			}
		}

		// Live golf leaderboard
		if (this.liveLeaderboard && this.liveLeaderboard.state === 'in' && this.liveLeaderboard.players?.length > 0) {
			const norPlayer = this.liveLeaderboard.players.slice(0, 15).find(p => {
				const last = p.player.split(' ').pop().toLowerCase();
				return ['hovland', 'aberg', 'ventura', 'olesen'].includes(last);
			});

			const name = this.liveLeaderboard.name || 'PGA Tour';
			if (norPlayer) {
				lines.push(`\u26f3 ${name}: ${norPlayer.player} ${norPlayer.position} (${norPlayer.score})`);
			} else {
				const leader = this.liveLeaderboard.players[0];
				lines.push(`\u26f3 ${name}: ${leader.player} leads at ${leader.score}`);
			}
		}

		return lines;
	}

	// --- Featured Sections ---

	renderSection(section) {
		const styleClass = section.style === 'highlight' ? ' highlight' : '';
		const items = (section.items || []).map(item => this.renderSectionItem(item)).join('');

		const hasExpand = section.expandLabel && section.expandItems && section.expandItems.length > 0;
		const expandHtml = hasExpand ? `
			<button class="feat-expand" data-section="${this.esc(section.id)}" aria-expanded="false">${this.esc(section.expandLabel)}</button>
			<div class="feat-expand-content" data-expand="${this.esc(section.id)}">
				${section.expandItems.map(item => this.renderSectionItem(item)).join('')}
			</div>
		` : '';

		return `
			<div class="featured-section${styleClass}">
				<div class="feat-header">${section.emoji || ''} ${this.esc(section.title)}</div>
				${items}
				${expandHtml}
			</div>
		`;
	}

	renderSectionItem(item) {
		const typeClass = item.type || 'text';
		return `<div class="feat-item ${typeClass}">${this.esc(item.text)}</div>`;
	}

	bindSectionExpands() {
		document.querySelectorAll('.feat-expand').forEach(btn => {
			btn.addEventListener('click', () => {
				const sectionId = btn.dataset.section;
				const content = document.querySelector(`.feat-expand-content[data-expand="${sectionId}"]`);
				if (content) {
					content.classList.toggle('open');
					const isOpen = content.classList.contains('open');
					btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
					btn.textContent = isOpen
						? btn.textContent.replace('\u25b8', '\u25be')
						: btn.textContent.replace('\u25be', '\u25b8');
				}
			});
		});
	}

	// --- Watch Plan ---

	renderWatchPlan() {
		const container = document.getElementById('watch-plan');
		if (!container) return;

		if (!this.watchPlan || !Array.isArray(this.watchPlan.picks) || this.watchPlan.picks.length === 0) {
			container.innerHTML = '';
			return;
		}

		const picks = [...this.watchPlan.picks].sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));

		let html = '<div class="watch-plan-header">What to Watch</div>';

		const now = new Date();
		picks.forEach((pick, i) => {
			const sportConfig = typeof SPORT_CONFIG !== 'undefined' ? SPORT_CONFIG.find(s => s.id === pick.sport) : null;
			const emoji = sportConfig ? sportConfig.emoji : '';

			const pickTime = pick.time ? new Date(pick.time) : null;
			let timeLabel = '';
			let relLabel = '';
			if (pickTime) {
				timeLabel = pickTime.toLocaleTimeString('en-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' });
				relLabel = this.relativeTime(pickTime) || '';
			}

			// Live status from polling data or time-based inference
			let statusHtml = '';
			const live = pick.eventId ? this.liveScores[pick.eventId] : null;
			if (live && live.state === 'in') {
				statusHtml = '<span class="pick-status pick-live"><span class="live-dot"></span>LIVE</span>';
			} else if (live && live.state === 'post') {
				statusHtml = '<span class="pick-status pick-ended">FT</span>';
			} else if (pickTime && pickTime < now && (now - pickTime) > 3 * 60 * 60 * 1000) {
				statusHtml = '<span class="pick-status pick-ended">FT</span>';
			}

			const reasons = Array.isArray(pick.reasons) ? pick.reasons : [];
			const streams = Array.isArray(pick.streaming) ? pick.streaming : [];

			html += `<div class="watch-pick" data-pick-index="${i}" role="button" tabindex="0">`;
			html += `<span class="pick-time">${this.esc(timeLabel)}${relLabel ? `<span class="row-rel">${this.esc(relLabel)}</span>` : ''}</span>`;
			html += `<div class="pick-body">`;
			html += `<div class="pick-title">${emoji} ${this.esc(pick.title || '')}${statusHtml}</div>`;
			if (reasons.length > 0 || streams.length > 0) {
				html += '<div class="pick-reasons">';
				reasons.forEach(r => { html += `<span class="pick-reason">${this.esc(r)}</span>`; });
				streams.forEach(s => { html += `<span class="pick-stream">${this.esc(s.platform || s)}</span>`; });
				html += '</div>';
			}
			if (typeof pick.score === 'number' && pick.score > 0) {
				const pct = Math.min(100, Math.round((pick.score / 150) * 100));
				html += `<div class="pick-confidence" title="Match score: ${pick.score}"><div class="pick-confidence-bar" style="width:${pct}%"></div></div>`;
			}
			html += `</div>`;
			html += `</div>`;
		});

		container.innerHTML = html;

		// Bind pick clicks and keyboard to scroll to matching event
		const handlePickActivate = (el) => {
			const idx = parseInt(el.dataset.pickIndex, 10);
			const pick = picks[idx];
			if (!pick) return;
			const matchedEvent = this.allEvents.find(e =>
				e.title === pick.title || (pick.eventId && e.id === pick.eventId)
			);
			if (matchedEvent) {
				this.expandedId = matchedEvent.id;
				this.render();
				const row = document.querySelector(`.event-row[data-id="${matchedEvent.id}"]`);
				if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		};
		container.querySelectorAll('.watch-pick').forEach(el => {
			el.addEventListener('click', () => handlePickActivate(el));
			el.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePickActivate(el); }
			});
		});
	}

	// --- News ---

	renderNews() {
		const container = document.getElementById('news');
		if (!container) return;

		if (!this.rssDigest || !Array.isArray(this.rssDigest.items) || this.rssDigest.items.length === 0) {
			container.innerHTML = '';
			return;
		}

		const items = this.rssDigest.items.slice(0, 8);

		// Group by sport
		const groups = new Map();
		for (const item of items) {
			const sport = item.sport || 'general';
			if (!groups.has(sport)) groups.set(sport, []);
			groups.get(sport).push(item);
		}

		let contentHtml = '';
		for (const [sport, sportItems] of groups) {
			const sportConfig = typeof SPORT_CONFIG !== 'undefined' ? SPORT_CONFIG.find(s => s.id === sport) : null;
			const label = sportConfig ? `${sportConfig.emoji} ${sportConfig.name}` : sport;
			contentHtml += `<div class="news-sport-group">`;
			contentHtml += `<div class="news-sport-label">${this.esc(label)}</div>`;
			for (const item of sportItems) {
				const source = item.source || '';
				const title = item.title || '';
				const link = item.link || '#';
				contentHtml += `<div class="news-item">`;
				contentHtml += `<span class="news-source">${this.esc(source)}</span>`;
				contentHtml += `<a href="${this.esc(link)}" target="_blank" rel="noopener noreferrer" class="news-link">${this.esc(title)}</a>`;
				contentHtml += `</div>`;
			}
			contentHtml += `</div>`;
		}

		let html = `<button class="news-toggle" data-expanded="false" aria-expanded="false">Latest News \u25b8</button>`;
		html += `<div class="news-content">${contentHtml}</div>`;

		container.innerHTML = html;

		const toggle = container.querySelector('.news-toggle');
		const content = container.querySelector('.news-content');
		if (toggle && content) {
			toggle.addEventListener('click', () => {
				const isOpen = content.classList.contains('open');
				content.classList.toggle('open');
				toggle.textContent = isOpen ? 'Latest News \u25b8' : 'Latest News \u25be';
				toggle.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
			});
		}
	}

	// --- Temporal band event layout ---

	categorizeEvents() {
		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const tomorrowStart = new Date(todayStart);
		tomorrowStart.setDate(tomorrowStart.getDate() + 1);
		const dayAfterTomorrow = new Date(tomorrowStart);
		dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
		const weekEnd = new Date(todayStart);
		weekEnd.setDate(weekEnd.getDate() + 7);

		const bands = { live: [], today: [], results: [], tomorrow: [], week: [], later: [] };

		for (const e of this.allEvents) {
			const t = new Date(e.time);
			const live = this.liveScores[e.id];

			// Has live score data — use state directly
			if (live && live.state === 'in') {
				bands.live.push(e);
			} else if (live && live.state === 'post') {
				bands.results.push(e);
			} else if (isEventInWindow(e, todayStart, tomorrowStart)) {
				// Active today (includes multi-day events that started before today)
				const hoursAgo = (now - t) / (1000 * 60 * 60);
				if (t >= todayStart && hoursAgo > 3) {
					bands.results.push(e); // Single-day event, likely finished
				} else {
					bands.today.push(e);
				}
			} else if (t >= tomorrowStart && t < dayAfterTomorrow) {
				bands.tomorrow.push(e);
			} else if (t >= dayAfterTomorrow && t < weekEnd) {
				bands.week.push(e);
			} else if (t >= weekEnd) {
				bands.later.push(e);
			}
			// Past events (before today) with no live data are dropped
		}

		return bands;
	}

	renderBand(label, events, options = {}) {
		if (events.length === 0) return '';

		const { cssClass = '', collapsed = false, showDay = false, showDate = false } = options;
		const bandId = label.toLowerCase().replace(/\s+/g, '-');

		let html = '';

		if (collapsed) {
			// Build preview line from first event
			const first = events[0];
			const firstSport = SPORT_CONFIG.find(s => s.id === first.sport);
			const firstEmoji = firstSport ? firstSport.emoji : '';
			const firstDate = new Date(first.time);
			const dayStr = firstDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Europe/Oslo' });
			const timeStr = firstDate.toLocaleTimeString('en-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' });
			const previewTitle = first.title.length > 32 ? first.title.slice(0, 30) + '\u2026' : first.title;
			const previewLine = `${firstEmoji} ${dayStr} ${timeStr} ${this.esc(previewTitle)}`;

			html += `<div class="band-label ${cssClass} collapsible" data-band="${bandId}" role="button" tabindex="0" aria-expanded="false">${this.esc(label)} \u25b8</div>`;
			html += `<div class="band-preview" data-band-preview="${bandId}">${previewLine}</div>`;
			html += `<div class="band-content collapsed" data-band-content="${bandId}">`;
		} else {
			html += `<div class="band-label ${cssClass}">${this.esc(label)}</div>`;
			html += `<div class="band-content ${cssClass ? 'band-' + cssClass.split(' ')[0] : ''}">`;
		}

		// Sort events by sport preference, then chronologically within sport.
		// Engagement clicks take priority; fallback weights from user preferences
		// ensure sensible ordering for new users with no engagement data.
		const SPORT_WEIGHT = { football: 3, golf: 3, tennis: 2, formula1: 2, chess: 2, esports: 1, olympics: 3 };
		const engagement = this.preferences ? this.preferences.getEngagement() : {};
		const sportClicks = {};
		for (const [sport, data] of Object.entries(engagement)) {
			sportClicks[sport] = data.clicks || 0;
		}
		const sorted = [...events].sort((a, b) => {
			const aPri = (sportClicks[a.sport] || 0) + (SPORT_WEIGHT[a.sport] || 0) * 0.1;
			const bPri = (sportClicks[b.sport] || 0) + (SPORT_WEIGHT[b.sport] || 0) * 0.1;
			if (aPri !== bPri) return bPri - aPri;
			return new Date(a.time) - new Date(b.time);
		});

		for (const e of sorted) {
			const sport = SPORT_CONFIG.find(s => s.id === e.sport) || { emoji: '', name: e.sport, color: '#888' };
			html += `<div class="sport-section compact" style="border-left-color:${sport.color}">`;
			html += this.renderRow(e, showDay || showDate, showDate, sport.emoji);
			html += `</div>`;
		}

		html += `</div>`;
		return html;
	}

	renderEvents() {
		const container = document.getElementById('events');

		if (!this._isViewingToday()) {
			// Non-today: show events for the selected date only
			const { live, upcoming, results } = this.getEventsForDate(this.selectedDate);

			// For past dates, also pull football results from recent-results.json
			const matchResults = this.getResultsForDate(this.selectedDate);
			const resultEvents = matchResults.map(m => ({
				id: `result-${m.homeTeam}-${m.awayTeam}-${m.date}`.replace(/\s+/g, '-').toLowerCase(),
				title: `${m.homeTeam} ${m.homeScore}\u2013${m.awayScore} ${m.awayTeam}`,
				sport: 'football',
				time: m.date,
				tournament: m.league || '',
				venue: m.venue || '',
				_isResult: true,
				_goalScorers: m.goalScorers || [],
				_isFavorite: m.isFavorite || false,
				_recapHeadline: m.recapHeadline || '',
			}));

			// Merge: combine event-based results with recent-results (dedupe by teams+date)
			const existingResultKeys = new Set(results.map(e => `${e.homeTeam}-${e.awayTeam}`));
			const newResults = resultEvents.filter(r => !existingResultKeys.has(r.title.split(' ')[0] + '-' + r.title.split(' ').slice(-1)[0]));
			const allResults = [...results, ...newResults];

			let html = '';
			html += this.renderBand('Live now', live, { cssClass: 'live' });
			html += this.renderBand('Events', upcoming, {});
			html += this.renderBand('Results', allResults, { cssClass: 'results' });

			if (!html) {
				html = '<p class="date-empty">No events on this date.</p>';
			}

			container.innerHTML = html;
			this.bindEventRows();
			this.bindBandToggles();
			this.bindFeedbackButtons();
			return;
		}

		// Today: full 6-band layout
		const bands = this.categorizeEvents();

		let html = '';

		html += this.renderBand('Live now', bands.live, { cssClass: 'live' });
		html += this.renderBand('Today', bands.today, {});
		html += this.renderBand('Results', bands.results, { cssClass: 'results' });
		html += this.renderInlinePLTable();
		html += this.renderBand('Tomorrow', bands.tomorrow, { showDay: true });
		html += this.renderBand('This week', bands.week, { collapsed: true, showDay: true });
		html += this.renderBand('Later', bands.later, { collapsed: true, showDate: true });

		if (!html) {
			html = '<p class="empty">No upcoming events.</p>';
		}

		container.innerHTML = html;
		this.bindEventRows();
		this.bindBandToggles();
		this.bindFeedbackButtons();
	}

	renderRow(event, showDay, showDate, inlineSportEmoji = null) {
		// Recent result pseudo-events: show FT and score title directly
		if (event._isResult) {
			const isMustWatch = event._isFavorite;
			const sport = SPORT_CONFIG.find(s => s.id === event.sport) || { emoji: '', name: event.sport, color: '#888' };
			const emojiPrefix = inlineSportEmoji ? `${inlineSportEmoji} ` : '';
			let subtitleHtml = '';
			if (event.tournament) {
				subtitleHtml = `<span class="row-subtitle">${this.esc(event.tournament)}</span>`;
			}
			const recapHtml = event._recapHeadline ? `<span class="row-recap">${this.esc(event._recapHeadline)}</span>` : '';
			return `
				<div class="event-row${isMustWatch ? ' must-watch' : ''}" data-id="${this.esc(event.id)}">
					<div class="row-main">
						<span class="row-time"><span class="row-ft">FT</span></span>
						<span class="row-title${isMustWatch ? ' must-watch-title' : ''}"><span class="row-title-text">${emojiPrefix}${this.esc(event.title)}</span>${recapHtml}${subtitleHtml}</span>
					</div>
				</div>
			`;
		}

		let date = new Date(event.time);
		const now = new Date();

		// Golf: use Norwegian player's tee time instead of tournament first-tee
		if (event.sport === 'golf' && event.norwegianPlayers?.length > 0) {
			const teeUTC = event.norwegianPlayers.find(p => p.teeTimeUTC)?.teeTimeUTC;
			if (teeUTC) date = new Date(teeUTC);
		}

		let timeStr;
		let isEnded = false;

		if (showDate) {
			timeStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Europe/Oslo' }) + ' ' +
				date.toLocaleTimeString('en-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' });
		} else if (showDay) {
			timeStr = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Europe/Oslo' }) + ' ' +
				date.toLocaleTimeString('en-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' });
		} else {
			timeStr = date.toLocaleTimeString('en-NO', {
				hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo'
			});
		}

		let iconHtml = '';
		let title = event.title;

		if (event.sport === 'football' && event.homeTeam && event.awayTeam) {
			const hLogo = typeof getTeamLogo === 'function' ? getTeamLogo(event.homeTeam) : null;
			const aLogo = typeof getTeamLogo === 'function' ? getTeamLogo(event.awayTeam) : null;
			if (hLogo && aLogo) {
				iconHtml = `<img src="${hLogo}" alt="${this.esc(event.homeTeam)}" class="row-logo" loading="lazy"><img src="${aLogo}" alt="${this.esc(event.awayTeam)}" class="row-logo" loading="lazy">`;
			}
			const live = this.liveScores[event.id];
			if (live) {
				title = `${this.esc(this.shortName(event.homeTeam))} <strong>${live.home} - ${live.away}</strong> ${this.esc(this.shortName(event.awayTeam))}`;
				if (live.state === 'in') {
					timeStr = `<span class="live-dot"></span>${this.esc(live.clock)}`;
				} else if (live.state === 'post') {
					timeStr = '<span class="row-ft">FT</span>';
				}
			} else {
				title = `${this.shortName(event.homeTeam)} v ${this.shortName(event.awayTeam)}`;
			}
		} else if (event.sport === 'golf' && event.norwegianPlayers && event.norwegianPlayers.length > 0) {
			const headshot = typeof getGolferHeadshot === 'function' ? getGolferHeadshot(event.norwegianPlayers[0].name) : null;
			if (headshot) {
				iconHtml = `<img src="${headshot}" alt="${this.esc(event.norwegianPlayers[0].name)}" class="row-headshot" loading="lazy">`;
			}
		}

		// "Ended" indicator: past events without live data
		// For multi-day events (golf), use endTime; otherwise use 3h heuristic
		const hoursAgo = (now - date) / (1000 * 60 * 60);
		const hasLiveScore = this.liveScores[event.id];
		const endTime = event.endTime ? new Date(event.endTime) : null;
		const isActuallyEnded = endTime ? now > endTime : hoursAgo > 3;
		if (!hasLiveScore && isActuallyEnded) {
			timeStr = '<span class="row-ended">Ended</span>';
			isEnded = true;
		}

		// Relative time for today's future events (not live, not ended)
		let relHtml = '';
		const diffMin = (date - now) / 60000;
		const isStartingSoon = !hasLiveScore && !isEnded && diffMin > 0 && diffMin <= 30;
		if (!hasLiveScore && !isEnded && date > now) {
			const rel = this.relativeTime(date);
			if (rel) {
				const relCls = isStartingSoon ? ' row-rel-soon' : (diffMin > 120 ? ' row-rel-far' : '');
				relHtml = `<span class="row-rel${relCls}">${this.esc(rel)}</span>`;
			}
		}

		const isExpanded = this.expandedId === event.id;
		const isMustWatch = event.importance >= 4;

		// If title contains live score HTML (<strong>), render raw; otherwise escape
		const titleHtml = hasLiveScore ? title : this.esc(title);

		// Inline sport emoji prefix for single-event sport groups
		const emojiPrefix = inlineSportEmoji ? `${inlineSportEmoji} ` : '';

		// Norwegian interest badge
		const isNorwegian = event.norwegian || event.norwegianPlayers?.length > 0 || event.norwegianRelevance >= 4;
		const norBadge = isNorwegian ? '<span class="row-nor" title="Norsk interesse">🇳🇴</span>' : '';

		// Tournament subtitle (skip if title already contains tournament name)
		let subtitleHtml = '';
		if (event.tournament && !event.title.toLowerCase().includes(event.tournament.toLowerCase())) {
			subtitleHtml = `<span class="row-subtitle">${this.esc(event.tournament)}</span>`;
		}

		return `
			<div class="event-row${isExpanded ? ' expanded' : ''}${isMustWatch ? ' must-watch' : ''}${isStartingSoon ? ' starting-soon' : ''}" data-id="${this.esc(event.id)}" role="button" tabindex="0" aria-expanded="${isExpanded}">
				<div class="row-main">
					<span class="row-time">${timeStr}${relHtml}</span>
					${iconHtml ? `<span class="row-icons">${iconHtml}</span>` : ''}
					<span class="row-title${isMustWatch ? ' must-watch-title' : ''}"><span class="row-title-text">${emojiPrefix}${titleHtml}</span>${norBadge}${subtitleHtml}</span>
				</div>
				${isExpanded ? this.renderExpanded(event) : ''}
			</div>
		`;
	}

	shortName(name) {
		if (!name) return '';
		return name.replace(/ FC$| AFC$| CF$| FK$/i, '').replace(/^FC |^AFC /i, '').trim();
	}

	renderFeedbackButtons(eventId, sport, tournament) {
		if (!this.feedback) return '';
		return `<div class="fb-row" data-fb-id="${this.esc(eventId)}" data-fb-sport="${this.esc(sport || '')}" data-fb-tournament="${this.esc(tournament || '')}">` +
			`<button class="fb-btn fb-flag" data-fb="flag" title="Report an issue with this event">Report issue</button>` +
			`</div>`;
	}

	renderFeedbackPanel() {
		const el = document.getElementById('feedback-panel');
		if (!el || !this.feedback) return;

		const count = this.feedback.pendingCount();
		const hasFavorites = this.preferences &&
			(Object.values(this.preferences.getPreferences().favoriteTeams || {}).some(t => t.length > 0) ||
			 Object.values(this.preferences.getPreferences().favoritePlayers || {}).some(p => p.length > 0));
		const canSubmit = count > 0 || hasFavorites;

		el.innerHTML = `
			<div class="fb-section-label">Feedback</div>
			<div class="fb-panel-row">
				<input type="text" id="fb-suggest-input" placeholder="Suggest a sport, event, or feature..." maxlength="200">
				<button id="fb-suggest-btn">Add</button>
			</div>
			${count > 0 ? `<div class="fb-pending">${count} pending item${count > 1 ? 's' : ''}</div>` : ''}
			<div class="fb-panel-row">
				<button class="fb-submit" id="fb-submit-btn" ${canSubmit ? '' : 'disabled'}>
					Send feedback via GitHub
				</button>
			</div>
			<div class="fb-hint">Includes your starred favorites, reports, and suggestions</div>
		`;

		document.getElementById('fb-suggest-btn')?.addEventListener('click', () => {
			const input = document.getElementById('fb-suggest-input');
			if (input?.value?.trim()) {
				this.feedback.suggest(input.value);
				input.value = '';
				this.renderFeedbackPanel();
			}
		});

		document.getElementById('fb-suggest-input')?.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				document.getElementById('fb-suggest-btn')?.click();
			}
		});

		document.getElementById('fb-submit-btn')?.addEventListener('click', () => {
			this.feedback.submit();
			this.renderFeedbackPanel();
			this.renderEvents();
		});
	}

	bindFeedbackButtons() {
		if (!this.feedback) return;

		document.querySelectorAll('.fb-row').forEach(row => {
			row.querySelectorAll('.fb-btn').forEach(btn => {
				btn.addEventListener('click', (e) => {
					e.stopPropagation();
					const eventId = row.dataset.fbId;
					const action = btn.dataset.fb;

					if (action === 'flag') {
						const eventTitle = row.closest('.event-row')?.querySelector('.row-title-text')?.textContent || eventId;
						const sport = row.dataset.fbSport || null;
						const tournament = row.dataset.fbTournament || null;
						const msg = prompt('What\'s wrong with this event?');
						if (msg) {
							this.feedback.report(eventId, eventTitle, msg, sport, tournament);
							btn.textContent = 'Reported';
							btn.classList.add('active');
							this.renderFeedbackPanel();
						}
					}
				});
			});
		});
	}

	renderExpanded(event) {
		let content = '<div class="row-expanded">';

		// Venue
		if (event.venue && event.venue !== 'TBD') {
			content += `<div class="exp-venue">${this.esc(event.venue)}</div>`;
		}

		// Multi-day progress (golf tournaments, Olympics sessions)
		if (event.endTime) {
			content += this.renderMultiDayProgress(event);
		}

		// Olympics context bar (discipline + medal badge)
		if (event.context === 'olympics-2026') {
			content += this.renderOlympicsContext(event);
		}

		// AI summary
		if (event.summary) {
			content += `<div class="exp-summary">${this.esc(event.summary)}</div>`;
		}

		// Importance reason
		if (event.importanceReason) {
			content += `<div class="exp-importance-reason">Why this matters: ${this.esc(event.importanceReason)}</div>`;
		}

		// Tags
		if (event.tags && event.tags.length > 0) {
			const editorial = ['must-watch', 'rivalry', 'derby', 'final', 'major', 'title-race', 'norwegian-player', 'upset-potential'];
			const shown = event.tags.filter(t => editorial.includes(t)).slice(0, 3);
			if (shown.length > 0) {
				content += '<div class="exp-tags">';
				shown.forEach(tag => { content += `<span class="exp-tag">${this.esc(tag)}</span>`; });
				content += '</div>';
			}
		}

		// Football: team logos
		if (event.sport === 'football' && event.homeTeam && event.awayTeam) {
			const homeLogo = typeof getTeamLogo === 'function' ? getTeamLogo(event.homeTeam) : null;
			const awayLogo = typeof getTeamLogo === 'function' ? getTeamLogo(event.awayTeam) : null;
			content += '<div class="exp-teams">';
			content += `<div class="exp-team">
				${homeLogo ? `<img src="${homeLogo}" alt="${this.esc(event.homeTeam)}" class="exp-logo" loading="lazy">` : '<span class="exp-logo-placeholder">\u26bd</span>'}
				<span>${this.esc(event.homeTeam)}</span>
			</div>`;
			content += '<span class="exp-vs">vs</span>';
			content += `<div class="exp-team">
				${awayLogo ? `<img src="${awayLogo}" alt="${this.esc(event.awayTeam)}" class="exp-logo" loading="lazy">` : '<span class="exp-logo-placeholder">\u26bd</span>'}
				<span>${this.esc(event.awayTeam)}</span>
			</div>`;
			content += '</div>';
		}

		// Football: live match details OR recent result for completed matches
		if (event.sport === 'football') {
			const liveDetails = this.renderMatchDetails(event);
			content += liveDetails || this.renderRecentResult(event);
		}

		// Football: mini league table
		if (event.sport === 'football' && this.standings?.football) {
			content += this.renderFootballStandings(event);
		}

		// Golf: Norwegian players with headshots
		if (event.sport === 'golf' && event.norwegianPlayers && event.norwegianPlayers.length > 0) {
			content += '<div class="exp-golfers">';
			event.norwegianPlayers.forEach(player => {
				const headshot = typeof getGolferHeadshot === 'function' ? getGolferHeadshot(player.name) : null;
				const teeTime = player.teeTime || '';
				content += `<div class="exp-golfer">
					<div class="exp-golfer-info">
						${headshot ? `<img src="${headshot}" alt="${this.esc(player.name)}" class="exp-headshot" loading="lazy">` : '<span class="exp-headshot-placeholder">\u26f3</span>'}
						<span>${this.esc(player.name)}</span>
					</div>
					${teeTime ? `<span class="exp-tee-time">${this.esc(teeTime)}</span>` : ''}
				${(() => {
					const fg = (event.featuredGroups || []).find(g => g.player === player.name);
					if (!fg?.groupmates?.length) return '';
					return `<div class="exp-playing-with">Playing with: ${fg.groupmates.map(g => this.esc(g.name)).join(', ')}</div>`;
				})()}
				</div>`;
			});
			if (event.link) {
				content += `<a href="${this.esc(event.link)}" target="_blank" rel="noopener noreferrer" class="exp-link">\ud83d\udcca Leaderboard \u2197</a>`;
			}
			content += '</div>';
		}

		// Non-golf: Norwegian athletes (Olympics, esports, etc.)
		if (event.sport !== 'golf' && event.norwegianPlayers?.length > 0) {
			const isOlympics = event.context === 'olympics-2026';
			content += '<div class="exp-athletes">';
			content += `<div class="exp-athletes-header">${isOlympics ? '\ud83c\uddf3\ud83c\uddf4 Norwegian Athletes' : 'Norwegian Players'}</div>`;
			event.norwegianPlayers.forEach(player => {
				const name = typeof player === 'string' ? player : player.name;
				content += `<div class="exp-athlete">${this.esc(name)}</div>`;
			});
			content += '</div>';
		}

		// Golf: tournament leaderboard
		if (event.sport === 'golf' && this.standings?.golf) {
			content += this.renderGolfLeaderboard(event);
		}

		// F1: driver standings
		if (event.sport === 'formula1' && this.standings?.f1?.drivers?.length > 0) {
			content += this.renderF1Standings();
		}

		// Participants (chess, tennis) — structured vertical list
		if (event.participants && event.participants.length > 0 && (event.sport === 'chess' || event.sport === 'tennis')) {
			content += '<div class="exp-athletes">';
			content += `<div class="exp-athletes-header">${event.sport === 'chess' ? 'Players' : 'Draw'}</div>`;
			event.participants.forEach(p => {
				const name = typeof p === 'string' ? p : p.name;
				content += `<div class="exp-athlete">${this.esc(name)}</div>`;
			});
			content += '</div>';
		}

		// Event link (non-golf — golf renders its own link above)
		if (event.link && event.sport !== 'golf') {
			content += `<a href="${this.esc(event.link)}" target="_blank" rel="noopener noreferrer" class="exp-link">More details \u2197</a>`;
		}

		// Streaming
		if (event.streaming && event.streaming.length > 0) {
			content += '<div class="exp-streaming">';
			event.streaming.forEach(s => {
				if (s.url) {
					content += `<a href="${this.esc(s.url)}" target="_blank" rel="noopener noreferrer" class="exp-stream-badge" aria-label="Watch on ${this.esc(s.platform)}">\ud83d\udcfa ${this.esc(s.platform)}</a>`;
				} else {
					content += `<span class="exp-stream-badge">\ud83d\udcfa ${this.esc(s.platform)}</span>`;
				}
			});
			content += '</div>';
		}

		// Favorite actions
		if (event.sport === 'football' && (event.homeTeam || event.awayTeam)) {
			const teams = [event.homeTeam, event.awayTeam].filter(Boolean);
			content += '<div class="exp-fav-actions">';
			teams.forEach(team => {
				const isTeamFav = this.preferences && this.preferences.isTeamFavorite('football', team);
				content += `<button class="exp-fav-btn" data-action="team" data-sport="football" data-name="${this.esc(team)}" aria-label="${isTeamFav ? 'Remove' : 'Add'} ${this.esc(team)} ${isTeamFav ? 'from' : 'to'} favorites">${isTeamFav ? '\u2605' : '\u2606'} ${this.esc(team)}</button>`;
			});
			content += '</div>';
		} else if (event.norwegianPlayers?.length > 0) {
			content += '<div class="exp-fav-actions">';
			event.norwegianPlayers.forEach(player => {
				const name = typeof player === 'string' ? player : player.name;
				const isPlayerFav = this.preferences?.isPlayerFavorite(event.sport, name);
				content += `<button class="exp-fav-btn" data-action="player" data-sport="${this.esc(event.sport)}" data-name="${this.esc(name)}" aria-label="${isPlayerFav ? 'Remove' : 'Add'} ${this.esc(name)} ${isPlayerFav ? 'from' : 'to'} favorites">${isPlayerFav ? '\u2605' : '\u2606'} ${this.esc(name)}</button>`;
			});
			content += '</div>';
		}

		// Feedback actions
		content += this.renderFeedbackButtons(event.id, event.sport, event.tournament);

		content += '</div>';
		return content;
	}

	renderMultiDayProgress(event) {
		const start = new Date(event.time);
		const end = new Date(event.endTime);
		const totalMs = end.getTime() - start.getTime();
		const totalDays = Math.round(totalMs / (24 * 60 * 60 * 1000)) + 1;
		if (totalDays <= 1) return '';

		const now = new Date();
		if (now < start) {
			return `<div class="exp-multiday">${totalDays}-day event</div>`;
		} else if (now > end) {
			return '<div class="exp-multiday">Completed</div>';
		}
		const elapsedMs = now.getTime() - start.getTime();
		const currentDay = Math.floor(elapsedMs / (24 * 60 * 60 * 1000)) + 1;
		return `<div class="exp-multiday">Day ${currentDay} of ${totalDays}</div>`;
	}

	renderOlympicsContext(event) {
		const parts = event.title.split(' \u2014 ');
		const discipline = parts.length > 1 ? parts[0] : null;
		const titleLower = event.title.toLowerCase();
		const isCeremony = titleLower.includes('ceremony') || titleLower.includes('opening') || titleLower.includes('closing');

		let html = '<div class="exp-context-bar">';
		if (discipline) {
			html += `<span class="exp-context-label">${this.esc(discipline)}</span>`;
		}
		if (!isCeremony) {
			html += '<span class="exp-medal-badge">\ud83c\udfc5 Medal Event</span>';
		}
		html += '</div>';
		return html;
	}

	// --- Match details (football) ---

	renderMatchDetails(event) {
		const live = this.liveScores[event.id];
		if (!live || (live.state !== 'in' && live.state !== 'post')) return '';

		let html = '';

		// Stats comparison (possession, shots)
		const possession = live.stats?.home_possessionPct;
		if (possession) {
			const homePoss = parseFloat(possession) || 50;
			const awayPoss = 100 - homePoss;
			html += '<div class="match-stats">';
			html += `<div class="stat-bar"><span class="stat-bar-label">Possession</span></div>`;
			html += `<div class="stat-bar-values"><span>${homePoss}%</span><span>${awayPoss}%</span></div>`;
			html += `<div class="stat-bar"><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${homePoss}%"></div></div></div>`;

			// Shots
			const homeShots = parseInt(live.stats?.home_totalShots, 10) || 0;
			const awayShots = parseInt(live.stats?.away_totalShots, 10) || 0;
			const homeOnTarget = parseInt(live.stats?.home_shotsOnTarget, 10) || 0;
			const awayOnTarget = parseInt(live.stats?.away_shotsOnTarget, 10) || 0;
			html += `<div style="margin-top:6px;font-size:0.65rem;color:var(--muted)">${homeShots} shots (${homeOnTarget} on target) \u2014 ${awayShots} shots (${awayOnTarget} on target)</div>`;

			html += '</div>';
		}

		// Key events (goals, cards)
		if (live.keyEvents && live.keyEvents.length > 0) {
			html += '<div class="match-events">';
			for (const ke of live.keyEvents) {
				let icon = '';
				if (ke.type.includes('Goal') || ke.type.includes('Penalty')) icon = '\u26bd';
				else if (ke.type === 'Yellow Card') icon = '\ud83d\udfe8';
				else if (ke.type === 'Red Card') icon = '\ud83d\udfe5';
				const playerText = ke.player ? `${this.esc(ke.player)} (${this.esc(this.shortName(ke.team))})` : this.esc(this.shortName(ke.team));
				html += `<div class="match-event-item"><span class="match-event-minute">${this.esc(ke.minute)}</span><span class="match-event-icon">${icon}</span><span class="match-event-text">${playerText}</span></div>`;
			}
			html += '</div>';
		}

		return html;
	}

	renderRecentResult(event) {
		const football = Array.isArray(this.recentResults?.football) ? this.recentResults.football : [];
		if (!football.length || !event.homeTeam || !event.awayTeam) return '';

		const eventDate = event.time ? new Date(event.time) : null;
		if (!eventDate) return '';
		const eventDateKey = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;

		const homeL = event.homeTeam.toLowerCase();
		const awayL = event.awayTeam.toLowerCase();

		const match = football.find(m => {
			if (!m.date) return false;
			const matchDate = m.date.slice(0, 10);
			if (matchDate !== eventDateKey) return false;
			const mHome = (m.homeTeam || '').toLowerCase();
			const mAway = (m.awayTeam || '').toLowerCase();
			return (mHome.includes(homeL) || homeL.includes(mHome)) &&
				(mAway.includes(awayL) || awayL.includes(mAway));
		});

		if (!match || match.homeScore == null) return '';

		let html = '<div class="exp-result">';
		html += `<div class="exp-result-score">${this.esc(match.homeTeam)} ${match.homeScore} – ${match.awayScore} ${this.esc(match.awayTeam)}</div>`;

		if (match.goalScorers?.length > 0) {
			html += '<div class="exp-result-scorers">';
			for (const gs of match.goalScorers) {
				const scorer = gs.player ? `${this.esc(gs.player)} (${this.esc(this.shortName(gs.team))})` : this.esc(this.shortName(gs.team));
				html += `<div class="exp-scorer">\u26bd ${this.esc(gs.minute)} ${scorer}</div>`;
			}
			html += '</div>';
		}

		html += '</div>';
		return html;
	}

	// --- Standings renderers ---

	renderInlinePLTable() {
		const table = this.standings?.football?.premierLeague;
		if (!Array.isArray(table) || table.length === 0) return '';

		// Show top 5 rows + any favorite teams not already in top 5
		const prefs = this.preferences ? this.preferences.getPreferences() : {};
		const favTeams = prefs.favoriteTeams?.football || [];
		const favorites = favTeams.map(t => t.toLowerCase());
		const top5 = table.slice(0, 5);
		const favRows = table.filter(t =>
			favorites.some(fav =>
				t.team.toLowerCase().includes(fav) || fav.includes(t.team.toLowerCase())
			) && !top5.includes(t)
		);

		const rows = [...top5, ...favRows].sort((a, b) => a.position - b.position);

		let html = '<div class="inline-standings">';
		html += '<div class="band-label collapsible" data-band="pl-table" role="button" tabindex="0" aria-expanded="false">Premier League \u25b8</div>';
		html += '<div class="band-content collapsed" data-band-content="pl-table">';
		html += '<table class="exp-mini-table"><thead><tr><th>#</th><th>Team</th><th>Pts</th><th>GD</th></tr></thead><tbody>';

		let lastPos = 0;
		for (const row of rows) {
			if (row.position - lastPos > 1 && lastPos > 0) {
				html += '<tr class="ellipsis"><td colspan="4">\u2026</td></tr>';
			}
			const isFav = favorites.some(fav =>
				row.team.toLowerCase().includes(fav) || fav.includes(row.team.toLowerCase())
			);
			const cls = isFav ? ' class="highlight"' : '';
			const gd = row.gd > 0 ? `+${row.gd}` : row.gd;
			html += `<tr${cls}><td>${row.position}</td><td>${this.esc(row.teamShort)}</td><td>${row.points}</td><td>${gd}</td></tr>`;
			lastPos = row.position;
		}

		html += '</tbody></table></div></div>';
		return html;
	}

	renderFootballStandings(event) {
		const tournament = (event.tournament || '').toLowerCase();
		const isSpanish = tournament.includes('la liga') || tournament.includes('copa del rey');
		const tableKey = isSpanish ? 'laLiga' : 'premierLeague';
		const tableName = isSpanish ? 'La Liga' : 'Premier League';
		const table = this.standings.football[tableKey];
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
			html += `<tr${cls}><td>${row.position}</td><td>${this.esc(row.teamShort)}</td><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${gd}</td><td>${row.points}</td></tr>`;
			lastPos = row.position;
		}

		html += '</tbody></table></div>';
		return html;
	}

	renderGolfLeaderboard(event) {
		// Try to match tournament to PGA or DP World Tour
		const tourKey = (event.tournament || '').toLowerCase().includes('dp world') ? 'dpWorld' : 'pga';
		const tour = this.standings.golf[tourKey];
		if (!tour?.leaderboard?.length) return '';

		let html = `<div class="exp-standings"><div class="exp-standings-header">${this.esc(tour.name || 'Leaderboard')}</div>`;
		html += '<table class="exp-mini-table"><thead><tr><th>#</th><th>Player</th><th>Score</th><th>Today</th><th>Thru</th></tr></thead><tbody>';

		const top5 = tour.leaderboard.slice(0, 5);
		for (const p of top5) {
			html += `<tr><td>${p.position || '-'}</td><td>${this.esc(p.player)}</td><td>${this.esc(p.score)}</td><td>${this.esc(p.today)}</td><td>${this.esc(p.thru)}</td></tr>`;
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
					html += `<tr class="highlight"><td>${p.position || '-'}</td><td>${this.esc(p.player)}</td><td>${this.esc(p.score)}</td><td>${this.esc(p.today)}</td><td>${this.esc(p.thru)}</td></tr>`;
				}
			}
		}

		html += '</tbody></table></div>';
		return html;
	}

	renderF1Standings() {
		const drivers = this.standings.f1.drivers.slice(0, 5);
		if (drivers.length === 0) return '';
		// Hide standings when all drivers have zero points (pre-season or stale data)
		if (drivers.every(d => !d.points)) return '';

		let html = '<div class="exp-standings"><div class="exp-standings-header">Driver Standings</div>';
		html += '<table class="exp-mini-table"><thead><tr><th>#</th><th>Driver</th><th>Team</th><th>Pts</th></tr></thead><tbody>';

		for (const d of drivers) {
			html += `<tr><td>${d.position}</td><td>${this.esc(d.driver)}</td><td>${this.esc(d.team)}</td><td>${d.points}</td></tr>`;
		}

		html += '</tbody></table></div>';
		return html;
	}

	// --- Live score polling ---

	startLivePolling() {
		if (this._liveInterval) return;
		this._liveInterval = setInterval(() => this.pollLiveScores(), 60 * 1000);
		// Initial poll after short delay
		setTimeout(() => this.pollLiveScores(), 3000);
	}

	hasLiveEvents() {
		const now = Date.now();
		return this.allEvents.some(e => {
			const start = new Date(e.time).getTime();
			// Event could be live: started up to 4h ago (covers golf rounds, football + extra time)
			return start <= now && start > now - 4 * 60 * 60 * 1000 &&
				(e.sport === 'football' || e.sport === 'golf');
		});
	}

	async pollLiveScores() {
		if (!this._liveVisible || !this.hasLiveEvents()) return;
		try {
			await Promise.all([
				this.pollFootballScores(),
				this.pollGolfScores(),
			]);
			// Full re-render so events move between bands (today → live → results)
			this.render();
		} catch (err) {
			// Silent fail — live scores are a nice-to-have
		}
	}

	async pollFootballScores() {
		const now = Date.now();
		const hasLiveFootball = this.allEvents.some(e =>
			e.sport === 'football' && new Date(e.time).getTime() <= now &&
			new Date(e.time).getTime() > now - 3 * 60 * 60 * 1000
		);
		if (!hasLiveFootball) return;

		const LIVE_TTL = 30 * 1000; // 30 seconds
		// Keep in sync with scripts/config/sports-config.js football.sources[0].leagues
		const leagues = ['eng.1', 'esp.1', 'esp.copa_del_rey'];
		const fetches = leagues.map(league => {
			const cached = this._cacheGet('live_football_' + league, LIVE_TTL);
			if (cached) return Promise.resolve(cached);
			return fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard`)
				.then(r => r.ok ? r.json() : null)
				.then(data => { if (data) this._cacheSet('live_football_' + league, data); return data; })
				.catch(() => null);
		});

		try {
			const results = await Promise.all(fetches);
			for (const data of results) {
				if (!data) continue;
				for (const ev of (data.events || [])) {
					const comp = ev.competitions?.[0];
					if (!comp) continue;
					const state = comp.status?.type?.state; // pre, in, post
					if (state !== 'in' && state !== 'post') continue;

					const home = comp.competitors?.find(c => c.homeAway === 'home');
					const away = comp.competitors?.find(c => c.homeAway === 'away');
					if (!home || !away) continue;

					const homeName = home.team?.displayName || '';
					const awayName = away.team?.displayName || '';

					// Match to our events by team names
					const matched = this.allEvents.find(e =>
						e.sport === 'football' &&
						e.homeTeam && e.awayTeam &&
						this.teamMatch(e.homeTeam, homeName) &&
						this.teamMatch(e.awayTeam, awayName)
					);
					if (!matched) continue;

					// Extract key events (goals, cards)
					const keyEvents = [];
					for (const detail of (comp.details || [])) {
						const type = detail.type?.text || '';
						const minute = detail.clock?.displayValue || '';
						const athletes = (detail.athletesInvolved || []).map(a => a.displayName || '').filter(Boolean);
						const teamId = detail.team?.id;
						const teamName = teamId === home.team?.id ? homeName : awayName;
						if (type.includes('Goal') || type.includes('Penalty') || type === 'Yellow Card' || type === 'Red Card') {
							keyEvents.push({ type, minute, player: athletes[0] || '', team: teamName });
						}
					}

					// Extract statistics
					const stats = {};
					for (const stat of (home.statistics || [])) {
						stats['home_' + stat.name] = stat.displayValue || stat.value;
					}
					for (const stat of (away.statistics || [])) {
						stats['away_' + stat.name] = stat.displayValue || stat.value;
					}

					// Extract team form
					const homeForm = home.records?.find(r => r.type === 'total')?.summary || '';
					const awayForm = away.records?.find(r => r.type === 'total')?.summary || '';

					this.liveScores[matched.id] = {
						home: parseInt(home.score, 10) || 0,
						away: parseInt(away.score, 10) || 0,
						clock: comp.status?.displayClock || '',
						state: state,
						detail: comp.status?.type?.shortDetail || '',
						keyEvents,
						stats,
						homeForm,
						awayForm,
						homeName,
						awayName,
					};
				}
			}
		} catch (e) { console.debug('Football live poll failed:', e.message); }
	}

	async pollGolfScores() {
		const now = Date.now();
		const hasActiveGolf = this.allEvents.some(e => {
			if (e.sport !== 'golf') return false;
			const start = new Date(e.time).getTime();
			const end = e.endTime ? new Date(e.endTime).getTime() : start + 4 * 24 * 60 * 60 * 1000;
			return start <= now && now <= end;
		});
		if (!hasActiveGolf) return;

		const LIVE_TTL = 30 * 1000; // 30 seconds
		const cached = this._cacheGet('live_golf_pga', LIVE_TTL);

		try {
			let data;
			if (cached) {
				data = cached;
			} else {
				const resp = await fetch('https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard');
				if (!resp.ok) return;
				data = await resp.json();
				this._cacheSet('live_golf_pga', data);
			}
			const ev = data.events?.[0];
			const comp = ev?.competitions?.[0];
			const state = ev?.status?.type?.state;
			if (!comp || state === 'pre') return;

			const competitors = comp.competitors || [];
			this.liveLeaderboard = {
				name: ev.name || '',
				state: state,
				players: competitors.slice(0, 15).map((c, idx) => ({
					position: c.order || (idx + 1),
					player: c.athlete?.displayName || c.athlete?.fullName || 'Unknown',
					score: typeof c.score === 'object' ? (c.score?.displayValue || 'E') : (c.score?.toString() || 'E'),
					today: c.linescores?.[c.linescores.length - 1]?.displayValue || '-',
					thru: c.status?.thru?.toString() || '-',
				})),
			};
		} catch (e) { console.debug('Golf live poll failed:', e.message); }
	}

	teamMatch(a, b) {
		const normalize = s => s.toLowerCase().replace(/ fc$| afc$| cf$| fk$/i, '').replace(/^fc |^afc /i, '').trim();
		return normalize(a) === normalize(b) || a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());
	}

	// --- Event handlers ---

	bindEventRows() {
		const container = document.getElementById('events');
		if (!container || container._ssDelegated) return;
		container._ssDelegated = true;

		container.addEventListener('click', (e) => {
			// Handle favorite buttons
			const favBtn = e.target.closest('.exp-fav-btn');
			if (favBtn) {
				e.stopPropagation();
				if (!this.preferences) return;
				const action = favBtn.dataset.action;
				const sport = favBtn.dataset.sport;
				const name = favBtn.dataset.name;

				if (action === 'team') {
					if (this.preferences.isTeamFavorite(sport, name)) {
						this.preferences.removeFavoriteTeam(sport, name);
					} else {
						this.preferences.addFavoriteTeam(sport, name);
					}
				} else if (action === 'player') {
					if (this.preferences.isPlayerFavorite(sport, name)) {
						this.preferences.removeFavoritePlayer(sport, name);
					} else {
						this.preferences.addFavoritePlayer(sport, name);
					}
				}
				this.render();
				return;
			}

			// Ignore clicks on interactive elements inside expanded rows
			if (e.target.closest('.exp-stream-badge') || e.target.closest('.exp-link')) return;

			// Handle event row expand/collapse
			const row = e.target.closest('.event-row');
			if (row) {
				const id = row.dataset.id;
				const expanding = this.expandedId !== id;
				this.expandedId = expanding ? id : null;
				if (expanding && this.preferences) {
					const event = this.allEvents.find(ev => ev.id === id);
					if (event?.sport) this.preferences.trackEngagement(event.sport);
				}
				this.render();
			}
		});

		container.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter' && e.key !== ' ') return;
			const row = e.target.closest('.event-row');
			if (!row) return;
			e.preventDefault();
			row.click();
		});
	}

	bindBandToggles() {
		document.querySelectorAll('.band-label.collapsible[data-band]').forEach(label => {
			label.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					label.click();
				}
			});
			label.addEventListener('click', () => {
				const bandId = label.dataset.band;
				const content = document.querySelector(`.band-content[data-band-content="${bandId}"]`);
				const preview = document.querySelector(`.band-preview[data-band-preview="${bandId}"]`);
				if (!content) return;
				const isCollapsed = content.classList.contains('collapsed');
				content.classList.toggle('collapsed');

				// Toggle preview visibility
				if (preview) {
					preview.style.display = isCollapsed ? 'none' : '';
				}

				// Update arrow and aria-expanded
				label.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');
				label.innerHTML = label.innerHTML.replace(
					isCollapsed ? '\u25b8' : '\u25be',
					isCollapsed ? '\u25be' : '\u25b8'
				);
			});
		});
	}

	bindThemeToggle() {
		const btn = document.getElementById('themeToggle');
		if (!btn) return;
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const saved = this.preferences ? this.preferences.getTheme() : 'auto';
		if (saved === 'dark' || (saved === 'auto' && prefersDark)) {
			document.documentElement.classList.add('dark');
			btn.textContent = '\u2600\ufe0f';
		}
		btn.addEventListener('click', () => {
			document.documentElement.classList.toggle('dark');
			const isDark = document.documentElement.classList.contains('dark');
			btn.textContent = isDark ? '\u2600\ufe0f' : '\ud83c\udf19';
			if (this.preferences) this.preferences.setTheme(isDark ? 'dark' : 'light');
		});
	}

	// --- Brief line rendering with inline logos ---

	renderBriefLine(line) {
		// Build a lookup of known team names from loaded events
		const knownTeams = new Map();
		for (const e of this.allEvents) {
			if (e.homeTeam && typeof getTeamLogo === 'function') {
				const logo = getTeamLogo(e.homeTeam);
				if (logo) knownTeams.set(e.homeTeam, logo);
			}
			if (e.awayTeam && typeof getTeamLogo === 'function') {
				const logo = getTeamLogo(e.awayTeam);
				if (logo) knownTeams.set(e.awayTeam, logo);
			}
		}

		// Build a lookup of known golfer names from loaded events
		const knownGolfers = new Map();
		for (const e of this.allEvents) {
			if (e.norwegianPlayers && typeof getGolferHeadshot === 'function') {
				for (const p of e.norwegianPlayers) {
					const headshot = getGolferHeadshot(p.name);
					if (headshot) knownGolfers.set(p.name, headshot);
				}
			}
		}

		// Escape the full line first
		let escaped = this.esc(line);

		// Sort names by length descending to avoid partial matches
		const teamEntries = Array.from(knownTeams.entries()).sort((a, b) => b[0].length - a[0].length);
		const golferEntries = Array.from(knownGolfers.entries()).sort((a, b) => b[0].length - a[0].length);

		// Collect all name matches on the ORIGINAL escaped string, then build output in one pass.
		// This avoids stale-position bugs from mutating the string during iteration.
		const allEntries = [
			...teamEntries.map(([name, url]) => [name, `<img src="${url}" alt="${this.esc(name)}" class="brief-logo" loading="lazy">`]),
			...golferEntries.map(([name, url]) => [name, `<img src="${url}" alt="${this.esc(name)}" class="brief-logo brief-headshot" loading="lazy">`]),
		];

		const matches = []; // { idx, len, imgHtml }
		for (const [name, imgHtml] of allEntries) {
			const escapedName = this.esc(name);
			const idx = escaped.indexOf(escapedName);
			if (idx === -1) continue;
			// Skip if this range overlaps a previously found match
			const overlaps = matches.some(m => idx < m.idx + m.len && idx + escapedName.length > m.idx);
			if (overlaps) continue;
			matches.push({ idx, len: escapedName.length, imgHtml });
		}

		// Sort by position, build output in one pass
		matches.sort((a, b) => a.idx - b.idx);
		let result = '';
		let cursor = 0;
		for (const m of matches) {
			result += escaped.substring(cursor, m.idx) + m.imgHtml;
			cursor = m.idx; // keep the original name after the logo
		}
		result += escaped.substring(cursor);
		escaped = result;

		return escaped;
	}

	// --- Helpers ---

	relativeTime(date) {
		const now = new Date();
		const diffMs = date - now;
		if (diffMs < 0) return null;
		const mins = Math.round(diffMs / 60000);
		if (mins < 5) return 'now';
		if (mins < 60) return `in ${mins}m`;
		const hrs = Math.floor(mins / 60);
		const remMins = mins % 60;
		if (remMins === 0 || remMins < 5) return `in ${hrs}h`;
		return `in ${hrs}h ${remMins}m`;
	}

	esc(str) {
		if (typeof str !== 'string') return '';
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
	window.dashboard = new Dashboard();
});
