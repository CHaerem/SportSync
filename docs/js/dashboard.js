// SportSync Dashboard — Sport-organized layout
// Constants & utilities loaded from shared-constants.js (isEventInWindow, escapeHtml, ssShortName, etc.)

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
		this.brackets = null; // tournament bracket data (esports etc.)
		this._editorialCoverage = { sports: new Set(), matchKeys: new Set() }; // tracks what editorial components cover
		this.activeSportFilter = null; // null = all sports; string = sport id filter
		this.preferences = window.PreferencesManager ? new PreferencesManager() : null;
		window._ssPreferences = this.preferences;
		this.feedback = window.FeedbackManager ? new FeedbackManager() : null;
		this.githubSync = window.GitHubSync ? new GitHubSync() : null;
		if (this.preferences) this.preferences.trackSessionStart();
		this.init();
	}

	async init() {
		this.bindThemeToggle();
		this._monitorBrokenImages();
		this._initPullToRefresh();
		// Request persistent storage to prevent auto-eviction of preferences
		if (navigator.storage?.persist) {
			navigator.storage.persist().catch(() => {});
		}
		// On page reload (e.g. pull-to-refresh), clear session cache so fresh data is fetched
		try {
			const navEntry = performance.getEntriesByType?.('navigation')?.[0];
			if (navEntry?.type === 'reload') {
				['events','featured','standings','watchPlan','rssDigest','recentResults','leagueConfig','brackets']
					.forEach(k => sessionStorage.removeItem('ss_' + k));
			}
		} catch { /* ignore — performance API not available */ }
		await this.loadEvents();
		setInterval(() => this.loadEvents(), 15 * 60 * 1000);
		this.startLivePolling();
		if (this.githubSync) this.githubSync.startAutoSync();
		document.addEventListener('visibilitychange', () => {
			this._liveVisible = !document.hidden;
			if (document.hidden && this.preferences) this.preferences.trackSessionEnd();
		});
		window.addEventListener('beforeunload', () => {
			if (this.preferences) this.preferences.trackSessionEnd();
		});
	}

	/** Log broken images so screenshot validator / console monitoring can detect them */
	_monitorBrokenImages() {
		document.addEventListener('error', (e) => {
			if (e.target.tagName === 'IMG') {
				console.warn('[SportSync] Broken image:', e.target.src, 'class:', e.target.className);
			}
		}, true);
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
		const cachedLeagueConfig = this._cacheGet('leagueConfig', STATIC_TTL);
		const cachedBrackets = this._cacheGet('brackets', STATIC_TTL);

		// Always fetch meta.json for freshness display (tiny, not cached)
		fetch('data/meta.json?t=' + Date.now()).then(r => r.ok ? r.json() : null)
			.then(m => { this.meta = m; this.renderDateLine(); })
			.catch(() => {});

		// Fetch system status (runner health from GitHub-hosted monitor)
		fetch('data/system-status.json?t=' + Date.now()).then(r => r.ok ? r.json() : null)
			.then(s => { this._systemStatus = s; this.renderDateLine(); })
			.catch(() => {});

		if (cachedEvents) {
			this.allEvents = cachedEvents;
			this.featured = cachedFeatured;
			this.standings = cachedStandings;
			this.watchPlan = cachedWatchPlan;
			this.rssDigest = cachedRssDigest;
			this.recentResults = cachedRecentResults;
			this.leagueConfig = cachedLeagueConfig;
			this.brackets = cachedBrackets;
			this.render();
			return;
		}

		try {
			const [eventsResp, featuredResp, standingsResp, watchPlanResp, rssDigestResp, metaResp, recentResultsResp, insightsResp, healthResp, leagueConfigResp, bracketsResp, userPrefsResp] = await Promise.all([
				fetch('data/events.json?t=' + Date.now()),
				fetch('data/featured.json?t=' + Date.now()).catch(() => null),
				fetch('data/standings.json?t=' + Date.now()).catch(() => null),
				fetch('data/watch-plan.json?t=' + Date.now()).catch(() => null),
				fetch('data/rss-digest.json?t=' + Date.now()).catch(() => null),
				fetch('data/meta.json?t=' + Date.now()).catch(() => null),
				fetch('data/recent-results.json?t=' + Date.now()).catch(() => null),
				fetch('data/insights.json?t=' + Date.now()).catch(() => null),
				fetch('data/health-report.json?t=' + Date.now()).catch(() => null),
				fetch('data/league-config.json?t=' + Date.now()).catch(() => null),
				fetch('data/brackets.json?t=' + Date.now()).catch(() => null),
				fetch('data/user-preferences.json?t=' + Date.now()).catch(() => null)
			]);

			if (!eventsResp.ok) throw new Error('Failed to load events');
			const data = await eventsResp.json();
			this.allEvents = data
				.map(ev => ({
					id: `${ev.sport}-${ev.title}-${ev.time}`.replace(/\s+/g, '-').toLowerCase(),
					title: ev.title,
					time: ev.time,
					endTime: ev.endTime || null,
					sport: normalizeClientSportId(ev.sport === 'cs2' ? 'esports' : ev.sport),
					tournament: ev.tournament || '',
					venue: ev.venue || '',
					norwegian: ev.norwegian || false,
					streaming: ev.streaming || [],
					participants: ev.participants || [],
					norwegianPlayers: ev.norwegianPlayers || [],
					totalPlayers: ev.totalPlayers || null,
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
				format: ev.format || null,
				stage: ev.stage || null,
				result: ev.result || null,
				meta: ev.meta || null,
				isFavorite: ev.isFavorite || false,
				tier: ev.tier || null,
				prizePool: ev.prizePool || null,
				_isTournament: ev._isTournament || false,
				_bracketId: ev._bracketId || null,
				}))
				.sort((a, b) => new Date(a.time) - new Date(b.time));

			if (featuredResp && featuredResp.ok) {
				try { this.featured = await featuredResp.json(); } catch { this.featured = null; }
			}

			// Staleness guard: if featured.json is from a previous day, prefer today's date-specific briefing
			if (this.featured) {
				const genAt = this.featured.generatedAt || this.featured._meta?.generatedAt;
				const featuredDay = genAt ? genAt.substring(0, 10) : null;
				const todayKey = this._dateKey(new Date());
				if (featuredDay && featuredDay !== todayKey) {
					try {
						const todayResp = await fetch(`data/featured-${todayKey}.json?t=${Date.now()}`);
						if (todayResp.ok) {
							const todayData = await todayResp.json();
							if (todayData && Array.isArray(todayData.blocks)) {
								console.log(`[SportSync] featured.json stale (${featuredDay}), using featured-${todayKey}.json`);
								this.featured = todayData;
							}
						}
					} catch { /* keep stale featured.json as fallback */ }
				}
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

			if (insightsResp && insightsResp.ok) {
				try { this.insights = await insightsResp.json(); } catch { this.insights = null; }
			}

			if (healthResp && healthResp.ok) {
				try { this.healthReport = await healthResp.json(); } catch { this.healthReport = null; }
			}

			if (leagueConfigResp && leagueConfigResp.ok) {
				try { this.leagueConfig = await leagueConfigResp.json(); } catch { this.leagueConfig = null; }
			}

			if (bracketsResp && bracketsResp.ok) {
				try { this.brackets = await bracketsResp.json(); } catch { this.brackets = null; }
			}

			// Load server preferences into PreferencesManager for accurate favorites
			if (userPrefsResp && userPrefsResp.ok) {
				try {
					this._userPreferences = await userPrefsResp.json();
					if (this.preferences && this._userPreferences) {
						this.preferences._serverPrefs = this._userPreferences;
						// Merge server data if not yet synced
						if (!this.preferences.preferences._serverSynced) {
							await this.preferences.loadServerPreferences();
						}
					}
				} catch { this._userPreferences = null; }
			}

			this._cacheSet('events', this.allEvents);
			this._cacheSet('featured', this.featured);
			this._cacheSet('standings', this.standings);
			this._cacheSet('watchPlan', this.watchPlan);
			this._cacheSet('rssDigest', this.rssDigest);
			this._cacheSet('recentResults', this.recentResults);
			this._cacheSet('leagueConfig', this.leagueConfig);
			this._cacheSet('brackets', this.brackets);

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
		const dayEnd = new Date(dayStart.getTime() + SS_CONSTANTS.MS_PER_DAY);
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

		const today = this._startOfDay(new Date());
		const viewDate = this._getSelectedDate();

		// Generate 7-day strip centered on today (3 past + today + 3 future)
		const days = [];
		for (let i = -3; i <= 3; i++) {
			const d = new Date(today);
			d.setDate(d.getDate() + i);
			days.push(d);
		}

		// Determine which sports have events on each day
		const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

		let html = '';
		for (const day of days) {
			const isT = this._isSameDay(day, today);
			const isPast = day < today && !isT;
			const isSelected = this._isSameDay(day, viewDate);
			const cls = isT ? 'is-today' : isPast ? 'is-past' : '';
			const selectedCls = (!isT && isSelected) ? ' is-selected' : '';

			// Find events for this day
			const dayStart = this._startOfDay(day);
			const dayEnd = new Date(dayStart.getTime() + SS_CONSTANTS.MS_PER_DAY);
			const dayEvents = this.allEvents.filter(e => isEventInWindow(e, dayStart, dayEnd));
			const sports = [...new Set(dayEvents.map(e => e.sport))];

			// Detect favorite-team matches on this day (personalization signal)
			const favSports = new Set();
			if (this.preferences) {
				for (const ev of dayEvents) {
					if (this.preferences.isEventFavorite(ev, ev.id)) {
						favSports.add(ev.sport);
					}
				}
			}
			const hasFavorite = favSports.size > 0;
			const hasMustWatch = dayEvents.some(e => e.importance >= 4);

			// Sport dots
			const sportVars = {
				football: 'var(--sport-football)',
				golf: 'var(--sport-golf)',
				tennis: 'var(--sport-tennis)',
				formula1: 'var(--sport-f1)',
				chess: 'var(--sport-chess)',
				esports: 'var(--sport-esports)',
				olympics: 'var(--sport-olympics)',
				cycling: 'var(--sport-cycling)',
			};
			const dotsHtml = sports.slice(0, 4).map(s => {
				const isFav = favSports.has(s);
				const clsAttr = isFav ? ' day-dot-fav' : '';
				return `<span class="day-dot${clsAttr}" style="background:${sportVars[s] || 'var(--muted)'}"></span>`;
			}).join('');

			const emptyCls = dayEvents.length === 0 ? ' has-no-events' : '';
			const favCls = hasFavorite ? ' has-favorite' : '';
			const mustWatchCls = hasMustWatch ? ' has-must-watch' : '';
			const emptyTitle = dayEvents.length === 0 ? ' title="No events scheduled"' : '';
			const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
			const mustWatchAriaSuffix = hasMustWatch ? ', has must-watch events' : '';
			const favAriaSuffix = hasFavorite ? ', includes favorites' : '';
			const dayAriaLabel = `${dayNames[day.getDay()]} ${monthNames[day.getMonth()]} ${day.getDate()}, ${dayEvents.length} event${dayEvents.length !== 1 ? 's' : ''}${favAriaSuffix}${mustWatchAriaSuffix}`;
			html += `<div class="day-item ${cls}${selectedCls}${emptyCls}${favCls}${mustWatchCls}"${emptyTitle} data-date="${this._dateKey(day)}" role="button" tabindex="0" aria-label="${dayAriaLabel}">`;
			html += `<div class="day-label">${dayNames[day.getDay()]}</div>`;
			html += `<div class="day-num">${day.getDate()}</div>`;
			html += `<div class="day-dots">${dotsHtml}</div>`;
			html += `</div>`;
		}

		// Hidden date input for date picker
		const y = viewDate.getFullYear();
		const m = String(viewDate.getMonth() + 1).padStart(2, '0');
		const d = String(viewDate.getDate()).padStart(2, '0');
		html += `<input type="date" class="day-nav-date-input" value="${y}-${m}-${d}" tabindex="-1">`;

		el.innerHTML = html;
		this.bindDayNav();
	}

	bindDayNav() {
		const el = document.getElementById('day-nav');
		if (!el) return;

		// Day item clicks (and keyboard activation)
		el.querySelectorAll('.day-item').forEach(item => {
			item.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					item.click();
				}
			});
			item.addEventListener('click', () => {
				const dateKey = item.dataset.date;
				if (!dateKey) return;
				const [y, m, d] = dateKey.split('-').map(Number);
				const picked = new Date(y, m - 1, d);
				const isToday = this._isToday(picked);
				this.selectedDate = isToday ? null : this._startOfDay(picked);
				if (this.preferences) {
					const dir = isToday ? 'today' : picked < this._startOfDay(new Date()) ? 'past' : 'future';
					this.preferences.trackDayNavigation(dir);
				}
				this.render();
			});
		});

		// Long-press on today item → open date picker
		const todayItem = el.querySelector('.day-item.is-today');
		const dateInput = el.querySelector('.day-nav-date-input');
		if (todayItem && dateInput) {
			let longPressTimer = null;
			todayItem.addEventListener('mousedown', () => {
				longPressTimer = setTimeout(() => {
					dateInput.showPicker ? dateInput.showPicker() : dateInput.click();
				}, 500);
			});
			todayItem.addEventListener('mouseup', () => clearTimeout(longPressTimer));
			todayItem.addEventListener('mouseleave', () => clearTimeout(longPressTimer));
			todayItem.addEventListener('touchstart', () => {
				longPressTimer = setTimeout(() => {
					dateInput.showPicker ? dateInput.showPicker() : dateInput.click();
				}, 500);
			}, { passive: true });
			todayItem.addEventListener('touchend', () => clearTimeout(longPressTimer));

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

		let html = '<div class="brief-label">Brief</div>';

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
		this.renderMasthead();
		this.renderDayNav();
		this.renderSportPills();
		const isToday = this._isViewingToday();

		if (isToday) {
			// Today: editorial brief + card feed
			this.renderEditorial();
			this.renderWatchPlan();
			this.renderInsights();
			this.renderEvents();
			this.renderNews();
		} else {
			// Other dates: snapshot-driven rendering
			const dateKey = this._dateKey(this._getSelectedDate());
			this.loadDaySnapshot(dateKey).then(snapshot => {
				this.renderFromSnapshot(snapshot, dateKey);
			});
		}

		this.renderDateLine();

		// Hide today-centric sections on non-today dates
		const todayOnlySections = ['news', 'watch-plan', 'insights'];
		for (const id of todayOnlySections) {
			const section = document.getElementById(id);
			if (section) section.style.display = isToday ? '' : 'none';
		}
	}

	renderDateLine() {
		const el = document.getElementById('date-line');
		if (!el) return;
		let parts = [];
		if (this._isViewingToday() && this.meta && this.meta.lastUpdate) {
			const now = new Date();
			const updated = new Date(this.meta.lastUpdate);
			const diffMin = Math.round((now - updated) / SS_CONSTANTS.MS_PER_MINUTE);
			let ago;
			if (diffMin < 1) ago = 'just now';
			else if (diffMin < 60) ago = `${diffMin}m ago`;
			else if (diffMin < 1440) ago = `${Math.round(diffMin / 60)}h ago`;
			else ago = `${Math.round(diffMin / 1440)}d ago`;
			parts.push(`Updated ${ago}`);
			// Next update estimate (1h cycle, 06-22 UTC)
			const nextMin = 60 - (diffMin % 60);
			if (nextMin > 0 && nextMin < 60) {
				const h = Math.floor(nextMin / 60);
				const m = nextMin % 60;
				parts.push(`Next update in ${h > 0 ? h + 'h ' : ''}${m}m`);
			}
			parts.push(`<a href="data/events.ics" class="cal-link" title="Subscribe to calendar">iCal</a>`);

			// Staleness alarm: if data is >3 hours old, show warning banner
			this.renderStalenessWarning(diffMin);
		}
		el.innerHTML = parts.join(' \u00b7 ');
	}

	renderStalenessWarning(diffMin) {
		const STALE_THRESHOLD = 180; // 3 hours
		let banner = document.getElementById('staleness-banner');
		if (diffMin < STALE_THRESHOLD) {
			if (banner) banner.remove();
			return;
		}
		if (!banner) {
			banner = document.createElement('div');
			banner.id = 'staleness-banner';
			banner.className = 'staleness-banner';
			const brief = document.getElementById('the-brief');
			if (brief) brief.parentNode.insertBefore(banner, brief);
		}
		const hours = Math.round(diffMin / 60);
		const runnerInfo = this._systemStatus;
		let msg = `\u26a0\ufe0f Data is ${hours}h old \u2014 pipeline may have stopped`;
		if (runnerInfo && runnerInfo.runner === 'offline') {
			msg = `\u26a0\ufe0f Pipeline runner is offline \u2014 data is ${hours}h old`;
		}
		banner.textContent = msg;
	}

	// --- Masthead ---

	renderMasthead() {
		const el = document.getElementById('masthead-meta');
		if (!el) return;
		// Count live events
		const liveCount = Object.values(this.liveScores).filter(s => s.state === 'in').length;
		const golfLive = this.liveLeaderboard?.state === 'in' ? 1 : 0;
		const total = liveCount + golfLive;
		if (total > 0) {
			el.innerHTML = `<span class="pulse-dot"></span><span>${total} live</span>`;
		} else {
			el.innerHTML = '';
		}
	}

	// --- Sport pills ---

	renderSportPills() {
		const el = document.getElementById('sport-pills');
		if (!el) return;

		// Determine which sports have events on the selected date
		const viewDate = this._getSelectedDate();
		const dayStart = this._startOfDay(viewDate);
		const dayEnd = new Date(dayStart.getTime() + SS_CONSTANTS.MS_PER_DAY);
		const todayEvents = this.allEvents.filter(e => isEventInWindow(e, dayStart, dayEnd));
		const activeSports = [...new Set(todayEvents.map(e => e.sport))];

		if (typeof SPORT_CONFIG === 'undefined' || activeSports.length <= 1) {
			el.innerHTML = '';
			return;
		}

		const sportVars = {
			football: 'var(--sport-football)', golf: 'var(--sport-golf)', tennis: 'var(--sport-tennis)',
			formula1: 'var(--sport-f1)', chess: 'var(--sport-chess)', esports: 'var(--sport-esports)', olympics: 'var(--sport-olympics)',
			cycling: 'var(--sport-cycling)',
		};

		let html = '<div class="pills-scroll" role="toolbar" aria-label="Filter by sport">';
		html += `<button class="pill${!this.activeSportFilter ? ' active' : ''}" data-sport="" aria-label="Show all sports" aria-pressed="${!this.activeSportFilter}">All</button>`;
		for (const sportId of activeSports) {
			const sc = SPORT_CONFIG.find(s => s.id === sportId);
			if (!sc) continue;
			const isActive = this.activeSportFilter === sportId;
			const dotColor = sportVars[sportId] || sc.color;
			const count = todayEvents.filter(e => e.sport === sportId).length;
			html += `<button class="pill${isActive ? ' active' : ''}" data-sport="${this.esc(sportId)}" aria-pressed="${isActive}"><span class="pill-dot" style="background:${dotColor}"></span>${this.esc(sc.name)}<span class="pill-count">${count}</span></button>`;
		}
		html += '</div>';
		el.innerHTML = html;
		this.bindSportPills();
	}

	bindSportPills() {
		const el = document.getElementById('sport-pills');
		if (!el) return;
		el.querySelectorAll('.pill').forEach(btn => {
			btn.addEventListener('click', () => {
				const sport = btn.dataset.sport || null;
				this.activeSportFilter = sport || null;
				this.renderSportPills();
				this.renderEditorial();
				this.renderEvents();
				this.renderNews();
			});
		});
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

			let html = `<div class="brief-label">${this.esc(modeLabel || 'Brief')}</div>`;
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

		// Filter out "For You" section — content already covered by editorial + watch plan
		blocks = blocks.filter(b => !(b.type === 'section' && b.id === 'for-you'));

		if (blocks.length === 0) {
			// Fallback: generate brief lines
			const lines = this.generateBriefLines();
			blocks = lines.map(line => ({ type: 'event-line', text: line }));
		}

		// Client-side result surfacing: if no result lines in blocks but we have noteworthy results
		// Surfaces both favorite team results AND Norwegian clubs in UEFA competitions
		if (this.recentResults?.football?.length > 0) {
			const hasResultLine = blocks.some(b => b.type === 'event-line' && /\bFT:/.test(b.text || ''))
				|| blocks.some(b => b.type === 'match-result');
			if (!hasResultLine) {
				const now = new Date();
				const cutoff = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
				const favResults = this.recentResults.football
					.filter(m => (m.isFavorite || isNoteworthyNorwegianResult(m)) && new Date(m.date) >= cutoff)
					.sort((a, b) => new Date(b.date) - new Date(a.date))
					.slice(0, 2);
				if (favResults.length > 0) {
					const resultBlocks = favResults.map(r => {
						const scorers = (r.goalScorers || []).slice(0, 2);
						const scorerText = scorers.length > 0
							? ' \u2014 ' + scorers.map(g => g.player + ' ' + g.minute).join(', ')
							: '';
						return { type: 'event-line', text: '\u26bd FT: ' + r.homeTeam + ' ' + r.homeScore + '-' + r.awayScore + ' ' + r.awayTeam + scorerText };
					});
					// Insert after headline (if any), before other event-lines
					const headlineIdx = blocks.findIndex(b => b.type === 'headline');
					const insertAt = headlineIdx >= 0 ? headlineIdx + 1 : 0;
					blocks = [...blocks.slice(0, insertAt), ...resultBlocks, ...blocks.slice(insertAt)];
				}
			}
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

		// Brief blocks: all non-section blocks (component blocks render inline in the editorial brief)
		const briefOnly = blocks.filter(b => b.type !== 'section');
		let briefHtml = '<div class="brief-label">Today\'s Brief</div>';
		briefHtml += briefOnly.map(block => this.renderBlock(block)).join('');

		// Auto-generate narrative when LLM didn't produce one (fallback provider)
		// Skip if brief already has match-preview/result blocks — they ARE the narrative
		const hasNarrative = briefOnly.some(b => b.type === 'narrative');
		const hasComponentBlocks = briefOnly.some(b =>
			b.type === 'match-preview' || b.type === 'match-result'
			|| (b.type === 'event-line' && /\bFT:/.test(b.text || b._fallbackText || ''))
		);
		if (!hasNarrative && !hasComponentBlocks && this._isViewingToday()) {
			const autoNarrative = this._generateAutoNarrative();
			if (autoNarrative) {
				briefHtml += `<p class="brief-narrative">${autoNarrative}</p>`;
			}
		}

		// At-a-glance bar with live/event/sport/result counts
		if (this._isViewingToday()) {
			const bands = this.categorizeEvents();
			const liveCount = bands.live.length;
			const todayCount = bands.today.length + bands.live.length;
			const sportSet = new Set([...bands.live, ...bands.today].map(e => e.sport));
			const resultCount = bands.results.length;
			let glance = '<div class="brief-glance">';
			if (liveCount > 0) glance += `<span class="glance-item g-live"><span class="g-dot"></span>${liveCount} live</span>`;
			if (todayCount > 0) glance += `<span class="glance-item">${todayCount} events today</span>`;
			if (sportSet.size > 1) glance += `<span class="glance-item">${sportSet.size} sports</span>`;
			if (resultCount > 0) glance += `<span class="glance-item">${resultCount} results</span>`;
			glance += '</div>';
			briefHtml += glance;
		}
		briefEl.innerHTML = briefHtml;

		// Featured sections: skip for today (match-previews + event cards already cover them)
		// For date-specific briefings, sections are rendered in renderEditorial(dateBriefing)
		sectionsEl.innerHTML = '';
	}

	// Component renderer registry — delegates to block-renderers.js
	_componentRenderers = {
		'match-result':      (block) => window.BLOCK_RENDERERS['match-result'](block, this._rendererCtx()),
		'match-preview':     (block) => window.BLOCK_RENDERERS['match-preview'](block, this._rendererCtx()),
		'event-schedule':    (block) => window.BLOCK_RENDERERS['event-schedule'](block, this._rendererCtx()),
		'golf-status':       (block) => window.BLOCK_RENDERERS['golf-status'](block, this._rendererCtx()),
		'chess-status':      (block) => window.BLOCK_RENDERERS['chess-status'](block, this._rendererCtx()),
	};

	_rendererCtx() {
		return {
			allEvents: this.allEvents,
			recentResults: this.recentResults,
			standings: this.standings,
			liveScores: this.liveScores,
			liveLeaderboard: this.liveLeaderboard,
			renderBriefLine: (line) => this.renderBriefLine(line),
			relativeTime: (d) => this.relativeTime(d),
			_isSameDay: (a, b) => this._isSameDay(a, b),
			_getTrackedGolferNames: () => this._getTrackedGolferNames(),
		};
	}

	renderBlock(block) {
		// Check component registry first
		const renderer = this._componentRenderers[block.type];
		if (renderer) {
			const html = renderer(block);
			if (html !== null) return html;
			// Component couldn't resolve data — fall back to _fallbackText if present
			if (block._fallbackText) {
				return `<div class="block-event-line editorial-line">${this.renderBriefLine(block._fallbackText)}</div>`;
			}
			return '';
		}

		switch (block.type) {
			case 'headline': {
				const headlineMatchState = this._getHeadlineMatchState(block.text || '');
				const headlineStateBadge = this._renderHeadlineStateBadge(headlineMatchState);
				const headlineCls = headlineMatchState?.state === 'in' ? ' brief-headline-live' : '';
				return `<h1 class="block-headline brief-headline${headlineCls}">${this.renderBriefLine(block.text || '')}${headlineStateBadge}</h1>`;
			}
			case 'event-line': {
				const isLive = block._live || (block.text && (block.text.startsWith('LIVE:') || block.text.startsWith('\u26f3')));
				const isResult = !isLive && block.text && /\bFT:/.test(block.text);
				const cls = isLive ? ' brief-live' : isResult ? ' result-line' : '';
				const sportId = this._detectSportFromText(block.sport, block.text || '');
				const sportAttr = sportId ? ` data-sport="${this.esc(sportId)}"` : '';
				return `<div class="block-event-line editorial-line${cls}"${sportAttr}>${this.renderBriefLine(block.text || '')}</div>`;
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
				return `<p class="brief-narrative">${this.renderBriefLine(block.text || '')}</p>`;
			case 'divider':
				return `<div class="block-divider">${this.esc(block.text || '')}</div>`;
			case 'section':
				return ''; // Sections rendered separately
			default:
				return '';
		}
	}

	// Block renderers (match-result, match-preview, event-schedule, golf-status)
	// are in block-renderers.js — delegated via _componentRenderers + _rendererCtx()

	/**
	 * Given the text of a headline block, find any football match referenced in it
	 * (by team name mention) and return its live state from liveScores.
	 * Returns { state: 'in'|'post', home, away, clock, homeTeam, awayTeam } or null.
	 */
	_getHeadlineMatchState(headlineText) {
		if (!headlineText || Object.keys(this.liveScores).length === 0) return null;
		const text = headlineText.toLowerCase();
		for (const event of this.allEvents) {
			if (event.sport !== 'football' || !event.homeTeam || !event.awayTeam) continue;
			const score = this.liveScores[event.id];
			if (!score || (score.state !== 'in' && score.state !== 'post')) continue;
			// Check if headline mentions either team
			const homeMatch = text.includes(event.homeTeam.toLowerCase());
			const awayMatch = text.includes(event.awayTeam.toLowerCase());
			if (homeMatch || awayMatch) {
				return {
					state: score.state,
					home: score.home,
					away: score.away,
					clock: score.clock,
					homeTeam: event.homeTeam,
					awayTeam: event.awayTeam,
				};
			}
		}
		return null;
	}

	/**
	 * Render a live or FT badge for a headline, given the match state from _getHeadlineMatchState.
	 * Returns an HTML string to append after the headline text, or '' if no state.
	 */
	_renderHeadlineStateBadge(matchState) {
		if (!matchState) return '';
		if (matchState.state === 'in') {
			const clock = matchState.clock ? ` ${this.esc(matchState.clock)}` : '';
			return ` <span class="headline-live-badge"><span class="live-dot"></span>LIVE ${matchState.home}\u2013${matchState.away}${clock}</span>`;
		}
		if (matchState.state === 'post') {
			return ` <span class="headline-ft-badge">FT ${matchState.home}\u2013${matchState.away}</span>`;
		}
		return '';
	}

	generateDynamicBriefLine() {
		const now = new Date();
		const bands = this.categorizeEvents();

		// If something is live, the dynamic line leads with that
		if (bands.live.length > 0) return null; // generateLiveBriefLines handles this

		// If something starts within 30 minutes, highlight it
		const soonEvents = bands.today.filter(e => {
			const diff = (new Date(e.time) - now) / SS_CONSTANTS.MS_PER_MINUTE;
			return diff > 0 && diff <= 30;
		});
		if (soonEvents.length > 0) {
			const e = soonEvents[0];
			const mins = Math.round((new Date(e.time) - now) / SS_CONSTANTS.MS_PER_MINUTE);
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
		const todayEnd = new Date(todayStart.getTime() + SS_CONSTANTS.MS_PER_DAY);

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

		// Live golf leaderboard — use tracked names from standings data
		if (this.liveLeaderboard && this.liveLeaderboard.state === 'in' && this.liveLeaderboard.players?.length > 0) {
			const trackedNames = this._getTrackedGolferNames();
			const norPlayer = this.liveLeaderboard.players.find(p => {
				const last = p.player.split(' ').pop().toLowerCase();
				return trackedNames.has(last);
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

		// Check overlap with editorial blocks — collapse if >80% of picks already appear
		const editorialBlocks = this.getEditorialBlocks();
		const editorialTexts = editorialBlocks
			.filter(b => b.type === 'event-line' || b.type === 'event-group' || b.type === 'section')
			.map(b => {
				const parts = [b.text || '', b.label || '', b.title || ''];
				if (Array.isArray(b.items)) parts.push(...b.items.map(i => typeof i === 'string' ? i : (i?.text || '')));
				return parts.join(' ').toLowerCase();
			})
			.join(' ');
		// Also check component coverage (event-schedule covers entire sports)
		const coveredSports = editorialBlocks
			.filter(b => b.type === 'event-schedule' && b.filter?.sport)
			.map(b => b.filter.sport);
		const picks = [...this.watchPlan.picks].sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));
		const overlapping = picks.filter(p => {
			const title = (p.title || '').toLowerCase();
			if (title && editorialTexts.includes(title)) return true;
			if (p.sport && coveredSports.includes(p.sport)) return true;
			return false;
		});
		const overlapRate = picks.length > 0 ? overlapping.length / picks.length : 0;
		if (overlapRate > 0.95) {
			container.innerHTML = '<div class="watch-plan-collapsed"><span class="watch-plan-collapsed-label">What to Watch</span> <span class="watch-plan-collapsed-count">' + picks.length + ' picks \u2014 already in brief above</span></div>';
			return;
		}

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
			const streams = (Array.isArray(pick.streaming) ? pick.streaming : []).filter(s => ['streaming', 'stream', 'tv'].includes(s.type));

			html += `<div class="watch-pick" data-pick-index="${i}" role="button" tabindex="0">`;
			html += `<span class="pick-time">${this.esc(timeLabel)}${relLabel ? `<span class="row-rel">${this.esc(relLabel)}</span>` : ''}</span>`;
			html += `<div class="pick-body">`;
			html += `<div class="pick-title">${emoji} ${this.esc(pick.title || '')}${statusHtml}</div>`;
			if (reasons.length > 0) html += `<div class="pick-reason-subtitle">${this.esc(reasons.join(' · '))}</div>`;
			if (streams.length > 0) {
				html += '<div class="pick-reasons">';
				streams.forEach(s => { html += `<span class="pick-stream">${this.esc(s.platform || s)}</span>`; });
				html += '</div>';
			}
			// Thumbs-up/down feedback
			const pickKey = `${(pick.title || '').replace(/[^a-zA-Z0-9]/g, '_')}_${(pick.time || '').slice(0, 10)}`;
			const fb = this.preferences ? this.preferences.getWatchFeedback(pickKey) : null;
			html += `<div class="pick-feedback" data-pick-key="${this.esc(pickKey)}">`;
			html += `<button class="pick-fb-btn${fb === 'up' ? ' active' : ''}" data-fb="up" title="Good pick" aria-label="Thumbs up">\u25b2</button>`;
			html += `<button class="pick-fb-btn${fb === 'down' ? ' active' : ''}" data-fb="down" title="Not for me" aria-label="Thumbs down">\u25bc</button>`;
			html += `</div>`;
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
			el.addEventListener('click', (e) => {
				// Don't navigate if clicking a feedback button
				if (e.target.closest('.pick-feedback')) return;
				handlePickActivate(el);
			});
			el.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePickActivate(el); }
			});
		});

		// Bind feedback buttons
		container.querySelectorAll('.pick-fb-btn').forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				if (!this.preferences) return;
				const feedbackEl = btn.closest('.pick-feedback');
				const pickKey = feedbackEl?.dataset.pickKey;
				if (!pickKey) return;
				const value = btn.dataset.fb;
				const current = this.preferences.getWatchFeedback(pickKey);
				// Toggle: clicking same button clears it
				this.preferences.setWatchFeedback(pickKey, current === value ? null : value);
				// Update button states
				feedbackEl.querySelectorAll('.pick-fb-btn').forEach(b => b.classList.remove('active'));
				if (current !== value) btn.classList.add('active');
			});
		});
	}

	// --- Insights ---

	renderInsights() {
		const container = document.getElementById('insights');
		if (!container) return;

		if (!this.insights || !Array.isArray(this.insights.insights) || this.insights.insights.length === 0) {
			container.innerHTML = '';
			return;
		}

		// Prioritize insights matching user sport preferences
		let allInsights = this.insights.insights;
		const sportPrefs = this.preferences ? this.preferences.getAllSportPreferences() : {};
		const hasSportPrefs = Object.keys(sportPrefs).length > 0;
		if (hasSportPrefs) {
			const preferredSports = new Set(Object.keys(sportPrefs));
			// Also check canonical alias (e.g. 'f1' → 'formula1')
			for (const sp of [...preferredSports]) {
				const canonical = typeof normalizeClientSportId === 'function' ? normalizeClientSportId(sp) : sp;
				if (canonical !== sp) preferredSports.add(canonical);
			}
			const preferred = allInsights.filter(i => i.sport && preferredSports.has(i.sport));
			const rest = allInsights.filter(i => !i.sport || !preferredSports.has(i.sport));
			// Use preferred-first ordering, but ensure at least 3 insights total
			allInsights = preferred.length >= 3 ? [...preferred, ...rest] : [...preferred, ...rest];
		}
		const top = allInsights.slice(0, 5);
		let html = '<div class="insights-header">Key Numbers</div>';
		for (const insight of top) {
			// Highlight leading numbers/stats with accent monospace styling
			const text = this.esc(insight.text);
			const highlighted = text.replace(
				/^(\d[\d\.,\+\-\/\%]*(?:\s*[\-–]\s*\d[\d\.,\+\-\/\%]*)?)/,
				'<span class="insight-stat">$1</span>'
			);
			html += `<div class="insight-line">${highlighted}</div>`;
		}
		container.innerHTML = html;
	}

	// --- News ---

	renderNews() {
		const container = document.getElementById('news');
		if (!container) return;

		if (!this.rssDigest || !Array.isArray(this.rssDigest.items) || this.rssDigest.items.length === 0) {
			container.innerHTML = '';
			return;
		}

		let items = this.rssDigest.items.map(item => {
			if (!item._inferredSport && (!item.sport || item.sport === 'general')) {
				item._inferredSport = this._inferSportFromHeadline(item);
			}
			return item;
		});
		// Apply sport filter if active (checks both original and inferred sport)
		if (this.activeSportFilter) {
			items = items.filter(item => {
				const sport = item._inferredSport || item.sport;
				return sport === this.activeSportFilter;
			});
		}
		items = items.slice(0, 8);

		if (items.length === 0) {
			container.innerHTML = '';
			return;
		}

		// Sport color map
		const sportColors = {
			football: 'var(--sport-football)', golf: 'var(--sport-golf)', tennis: 'var(--sport-tennis)',
			formula1: 'var(--sport-f1)', chess: 'var(--sport-chess)', esports: 'var(--sport-esports)',
			olympics: 'var(--sport-olympics)',
		};

		// Show 5 items by default, rest behind "show more"
		const visibleCount = 5;
		const visibleItems = items.slice(0, visibleCount);
		const hiddenItems = items.slice(visibleCount);

		// Build news cards
		let contentHtml = '<div class="news-grid">';
		for (const item of visibleItems) {
			contentHtml += this._renderNewsCard(item, sportColors);
		}
		if (hiddenItems.length > 0) {
			contentHtml += '<div class="news-more-items" id="news-more-items">';
			for (const item of hiddenItems) {
				contentHtml += this._renderNewsCard(item, sportColors);
			}
			contentHtml += '</div>';
			contentHtml += `<button class="news-show-more" aria-expanded="false" aria-controls="news-more-items">${hiddenItems.length} more headlines</button>`;
		}
		contentHtml += '</div>';

		// Flow label header for news
		let html = `<div class="flow-label"><span class="flow-text">Headlines</span><span class="flow-line"></span><span class="flow-count">${items.length}</span></div>`;
		html += contentHtml;

		container.innerHTML = html;

		// Bind show-more toggle
		const showMore = container.querySelector('.news-show-more');
		if (showMore) {
			showMore.addEventListener('click', () => {
				const hidden = container.querySelector('.news-more-items');
				if (hidden) {
					const isOpen = hidden.classList.toggle('open');
					showMore.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
					showMore.textContent = isOpen
						? 'Show less'
						: `${hiddenItems.length} more headlines`;
				}
			});
		}
	}

	_renderNewsCard(item, sportColors) {
		const sport = item._inferredSport || item.sport || 'general';
		const barColor = sportColors[sport] || 'var(--muted)';
		const source = item.source || '';
		const title = item.title || '';
		const link = item.link || '#';

		let timeAgo = '';
		if (item.pubDate) {
			const diff = (Date.now() - new Date(item.pubDate).getTime()) / SS_CONSTANTS.MS_PER_MINUTE;
			if (diff < 60) timeAgo = `${Math.round(diff)}m ago`;
			else if (diff < 1440) timeAgo = `${Math.round(diff / 60)}h ago`;
			else timeAgo = `${Math.round(diff / 1440)}d ago`;
		}

		let html = `<a href="${this.esc(link)}" target="_blank" rel="noopener noreferrer" class="news-card" style="text-decoration:none" aria-label="${this.esc(title)}">`;
		html += `<div class="news-sport-bar" style="background:${barColor}"></div>`;
		html += `<div class="news-body">`;
		html += `<div class="news-headline">${this.esc(title)}</div>`;
		html += `<div class="news-meta">`;
		html += `<span class="news-src-tag">${this.esc(source)}</span>`;
		if (timeAgo) html += `<span class="news-time">${this.esc(timeAgo)}</span>`;
		html += `</div></div></a>`;
		return html;
	}

	/**
	 * Infer a sport from headline text when item.sport is "general".
	 * Checks title + description against sport-specific keywords.
	 * Returns a canonical sport ID or null if no match.
	 */
	_inferSportFromHeadline(item) {
		const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
		// Order matters: check more specific patterns first to avoid false positives.
		// Each entry: [sportId, keywords[]] — first sport to match wins.
		const sportKeywords = [
			['formula1', [
				'formel 1', 'formula 1', 'grand prix', ' f1 ', 'f1-', 'red bull racing',
				'verstappen', 'hamilton', 'leclerc', 'norris', 'sainz', 'piastri',
				'mclaren', 'ferrari', 'mercedes', 'alonso',
			]],
			['tennis', [
				'tennis', ' atp ', ' wta ', 'roland garros', 'roland-garros', 'wimbledon',
				'us open tennis', 'australian open', 'ruud', 'djokovic', 'sinner',
				'alcaraz', 'medvedev', 'swiatek', 'sabalenka', 'budkov',
				'masters 1000', 'tennistalentet',
			]],
			['golf', [
				'golf', ' pga ', 'pga tour', 'dp world', 'masters', 'open championship',
				'the open', 'ryder cup', 'hovland', 'rahm', 'scheffler', 'mcilroy',
				'koepka', 'spieth', 'augusta', 'birdie', 'bogey', 'eagle',
			]],
			['chess', [
				'chess', 'sjakk', ' fide', 'carlsen', 'magnus carlsen', 'candidates',
				'tari', 'grandmaster', 'stormester',
			]],
			['esports', [
				'esport', 'e-sport', 'counter-strike', ' cs2', 'cs2 ', ' csgo',
				'hltv', 'blast', 'iem ', 'esl ', 'major cs', 'navi', 'faze clan',
			]],
			['cycling', [
				'cycling', 'sykkel', 'sykling', 'tour de france', 'giro', 'vuelta',
				'monument', 'etappeseier', 'sykkelstjerne', 'uno-x', 'visma-lease',
				'klassiker', 'peloton', 'rittet', 'etappe',
				'johannessen', 'tobias halland',
			]],
			['football', [
				'premier league', 'champions league', 'europa league', 'la liga',
				'serie a', 'bundesliga', 'ligue 1', 'eliteserien', 'obos-ligaen',
				'toppserien', 'fotball', 'football', 'soccer',
				' vm ', 'vm-', 'fotball-vm', 'world cup',
				'arsenal', 'chelsea', 'liverpool', 'manchester city', 'manchester united',
				'man city', 'man united', 'tottenham', 'spurs', 'newcastle',
				'brighton', 'aston villa', 'west ham', 'everton', 'leicester',
				'barcelona', 'real madrid', 'atletico',
				'haaland', 'odegaard', 'ødegaard', 'salah', 'palmer',
				'brann', 'rosenborg', 'vålerenga', 'molde', 'bodø/glimt',
				'lyn oslo', 'seriegull', 'nedrykk', 'opprykk', 'tabellen',
				'cup-', 'cupfinale', 'straffespark', 'offside', ' var ',
				'inter', 'milan', 'como', 'lens', 'toulouse',
				'slot', 'knutsen', 'rekdal',
			]],
		];

		for (const [sportId, keywords] of sportKeywords) {
			for (const kw of keywords) {
				if (text.includes(kw)) {
					return sportId;
				}
			}
		}
		return null;
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
				const hasEndInFuture = e.endTime && new Date(e.endTime) > now;
				if (t >= todayStart && hoursAgo > 3 && !hasEndInFuture) {
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
		const isLive = cssClass.includes('live');
		const countText = String(events.length);

		let html = '';

		if (label) {
			const bandId = label.toLowerCase().replace(/\s+/g, '-');
			if (collapsed) {
				const first = events[0];
				const firstSport = SPORT_CONFIG.find(s => s.id === first.sport);
				const firstEmoji = firstSport ? firstSport.emoji : '';
				const firstDate = new Date(first.time);
				const dayStr = firstDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Europe/Oslo' });
				const dateStr = firstDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' });
				const timeStr = firstDate.toLocaleTimeString('en-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' });
				const previewTitle = first.title.length > 32 ? first.title.slice(0, 30) + '\u2026' : first.title;
				const previewLine = `${firstEmoji} ${dayStr} ${dateStr} ${timeStr} ${this.esc(previewTitle)}`;

				html += `<div class="flow-label band-label ${cssClass} collapsible" data-band="${bandId}" role="button" tabindex="0" aria-expanded="false" aria-label="${this.esc(label)} (${countText} event${events.length !== 1 ? 's' : ''}, collapsed)"><span class="flow-text">${this.esc(label)}</span><span class="flow-line"></span><span class="flow-count">${countText} \u25b8</span></div>`;
				html += `<div class="band-preview" data-band-preview="${bandId}">${previewLine}</div>`;
				html += `<div class="band-content collapsed" data-band-content="${bandId}">`;
			} else {
				html += `<div class="flow-label${isLive ? ' is-live' : ''} band-label ${cssClass}" role="region" aria-label="${this.esc(label)}"><span class="flow-text">${this.esc(label)}</span><span class="flow-line"></span>${events.length > 1 ? `<span class="flow-count">${countText}</span>` : ''}</div>`;
				html += `<div class="band-content ${cssClass ? 'band-' + cssClass.split(' ')[0] : ''}">`;
			}
		} else {
			// No label — just a content wrapper
			html += '<div class="band-content">';
		}

		// Sort events by sport preference, then chronologically within sport.
		// User sport preferences (high/medium/low) take priority, then engagement
		// clicks, then static fallback weights for new users with no data.
		const SPORT_WEIGHT = { football: 3, golf: 3, tennis: 2, formula1: 2, chess: 2, esports: 1, olympics: 3, cycling: 2 };
		const PREF_WEIGHT = { high: 4, medium: 3, low: 2 };
		const sportPrefs = this.preferences ? this.preferences.getAllSportPreferences() : {};
		const engagement = this.preferences ? this.preferences.getEngagement() : {};
		const sportClicks = {};
		for (const [sport, data] of Object.entries(engagement)) {
			sportClicks[sport] = data.clicks || 0;
		}
		const sorted = [...events].sort((a, b) => {
			const aPrefW = PREF_WEIGHT[sportPrefs[a.sport]] || 0;
			const bPrefW = PREF_WEIGHT[sportPrefs[b.sport]] || 0;
			if (aPrefW !== bPrefW) return bPrefW - aPrefW;
			const aPri = (sportClicks[a.sport] || 0) + (SPORT_WEIGHT[a.sport] || 0) * 0.1;
			const bPri = (sportClicks[b.sport] || 0) + (SPORT_WEIGHT[b.sport] || 0) * 0.1;
			if (aPri !== bPri) return bPri - aPri;
			// Group same-sport events by tournament so cards form correctly
			if (a.sport === b.sport && a.tournament !== b.tournament) {
				return (a.tournament || '').localeCompare(b.tournament || '');
			}
			return new Date(a.time) - new Date(b.time);
		});

		// Group events into visual cards
		// 1. Football 2+ matches same tournament → matchday card (with featured match)
		// 2. Golf/Olympics 1+ events → sport-group card
		// 3. Any sport 2+ events same tournament → sport-group card
		// 4. Single importance 5 → lead card
		// 5. Everything else → regular event rows
		const groups = [];
		let sportBuf = { sport: null, tournament: null, events: [] };

		const flushBuf = () => {
			if (sportBuf.events.length === 0) return;
			const n = sportBuf.events.length;
			const hasTeams = sportBuf.events[0].homeTeam && sportBuf.events[0].awayTeam;
			const isCardSport = ['olympics', 'golf', 'esports', 'cycling'].includes(sportBuf.sport);

			if (sportBuf.sport === 'football' && hasTeams && n >= 2) {
				// 2+ football matches → matchday card
				groups.push({ type: 'matchday', tournament: sportBuf.tournament, events: sportBuf.events });
			} else if (isCardSport && n >= 1) {
				// Golf/olympics/esports events → card per tournament (rich data worth showing)
				groups.push({ type: 'sport-group', sport: sportBuf.sport, tournament: sportBuf.tournament, events: sportBuf.events });
			} else if (n >= 2) {
				// 2+ same-tournament events → grouped card
				groups.push({ type: 'sport-group', sport: sportBuf.sport, tournament: sportBuf.tournament, events: sportBuf.events });
			} else {
				// Individual rows (lead only for truly special events)
				for (const e of sportBuf.events) {
					groups.push({ type: e.importance >= 5 ? 'lead' : 'row', events: [e] });
				}
			}
			sportBuf = { sport: null, tournament: null, events: [] };
		};

		for (const e of sorted) {
			const perTournament = !!e.tournament;
			const key = perTournament ? `${e.sport}:${e.tournament}` : e.sport;
			const bufPerTournament = !!sportBuf.tournament;
			const bufKey = bufPerTournament ? `${sportBuf.sport}:${sportBuf.tournament}` : sportBuf.sport;
			if (key === bufKey) {
				sportBuf.events.push(e);
			} else {
				flushBuf();
				sportBuf = { sport: e.sport, tournament: e.tournament || '', events: [e] };
			}
		}
		flushBuf();

		// Render each group — batch adjacent row groups into a single card
		let rowBatch = [];
		const flushRows = () => {
			if (rowBatch.length === 0) return;
			html += '<div class="event-card">';
			for (const e of rowBatch) {
				html += this.renderRow(e, showDay || showDate, showDate);
			}
			html += '</div>';
			rowBatch = [];
		};
		for (const group of groups) {
			if (group.type === 'matchday') {
				flushRows();
				html += this.renderMatchdayGroup(group.events, group.tournament, showDay, showDate);
			} else if (group.type === 'sport-group') {
				flushRows();
				html += this.renderSportGroupCard(group.events, group.sport, group.tournament, showDay, showDate);
			} else if (group.type === 'lead') {
				flushRows();
				html += this.renderLeadWrapper(group.events[0], showDay, showDate);
			} else {
				for (const e of group.events) {
					rowBatch.push(e);
				}
			}
		}
		flushRows();

		html += `</div>`;
		return html;
	}

	renderMatchdayGroup(matches, tournament, showDay, showDate) {
		const sportCfg = SPORT_CONFIG.find(s => s.id === 'football') || { color: '#2d8a4e' };
		const league = this.getLeagueStyle(tournament);
		const color = league ? league.color : sportCfg.color;

		// Pick featured match: prioritize Norwegian interest, then highest importance
		const featured = [...matches].sort((a, b) => {
			const aNor = (a.norwegian || a.norwegianRelevance >= 4) ? 1 : 0;
			const bNor = (b.norwegian || b.norwegianRelevance >= 4) ? 1 : 0;
			if (aNor !== bNor) return bNor - aNor;
			return (b.importance || 0) - (a.importance || 0);
		})[0];
		const others = matches.filter(m => m !== featured);

		// Day context for the card header
		const firstDate = new Date(featured.time);
		const today = this._startOfDay(new Date());
		const tomorrow = new Date(today.getTime() + SS_CONSTANTS.MS_PER_DAY);
		let dayLabel = '';
		if (this._isSameDay(firstDate, new Date())) {
			dayLabel = 'Today';
		} else if (firstDate >= tomorrow && firstDate < new Date(tomorrow.getTime() + SS_CONSTANTS.MS_PER_DAY)) {
			dayLabel = 'Tomorrow';
		} else {
			dayLabel = firstDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' });
		}

		const tourLogo = typeof getTournamentLogo === 'function' ? getTournamentLogo(tournament) : null;
		const logoImg = tourLogo ? `<img class="matchday-logo" src="${tourLogo}" alt="${this.esc(tournament)}" loading="lazy">` : '';

		let html = '<div class="matchday">';
		html += `<div class="matchday-accent" style="background:${color}"></div>`;
		html += '<div class="matchday-header">';
		html += `<span class="matchday-title">${logoImg}${this.esc(tournament)}</span>`;
		html += `<span class="matchday-count">${this.esc(dayLabel)} \u00b7 ${matches.length} match${matches.length !== 1 ? 'es' : ''}</span>`;
		html += '</div>';

		// Featured match — prominent display with logos
		const hLogo = typeof getTeamLogo === 'function' ? getTeamLogo(featured.homeTeam) : null;
		const aLogo = typeof getTeamLogo === 'function' ? getTeamLogo(featured.awayTeam) : null;
		const fDate = new Date(featured.time);
		const fTime = fDate.toLocaleTimeString('en-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' });
		const isNor = featured.norwegian || featured.norwegianRelevance >= 4;
		const live = this.liveScores[featured.id];

		html += `<div class="md-featured" data-id="${this.esc(featured.id)}" role="button" tabindex="0">`;
		html += '<div class="md-featured-row">';
		html += '<div class="md-featured-logos">';
		if (hLogo) html += `<img class="md-featured-logo" src="${hLogo}" alt="${this.esc(featured.homeTeam)}" loading="lazy">`;
		if (aLogo) html += `<img class="md-featured-logo" src="${aLogo}" alt="${this.esc(featured.awayTeam)}" loading="lazy">`;
		html += '</div>';
		html += '<div class="md-featured-info">';
		html += `<div class="md-featured-teams">${this.esc(this.shortName(featured.homeTeam))} v ${this.esc(this.shortName(featured.awayTeam))}`;
		if (isNor) html += ' <span class="md-nor">\ud83c\uddf3\ud83c\uddf4</span>';
		html += '</div>';
		if (featured.venue) html += `<div class="md-featured-meta">${this.esc(featured.venue)}</div>`;
		html += '</div>';
		if (live && live.state === 'in') {
			html += `<span class="md-featured-time"><span class="live-dot"></span>${this.esc(live.clock)}</span>`;
		} else if (live && live.state === 'post') {
			html += `<span class="md-featured-time"><strong>${live.home} - ${live.away}</strong></span>`;
		} else {
			html += `<span class="md-featured-time">${fTime}</span>`;
		}
		html += '</div>';
		if (featured.summary || featured.importanceReason) {
			html += `<div class="md-featured-context">${this.esc(featured.summary || featured.importanceReason)}</div>`;
		}
		const featuredStreams = (featured.streaming || []).filter(s => ['streaming', 'stream', 'tv'].includes(s.type));
		if (featuredStreams.length > 0) {
			html += '<div class="md-featured-stream">';
			for (const s of featuredStreams.slice(0, 3)) {
				const url = s.url || '#';
				const name = s.platform || s;
				html += `<a class="stream-link" href="${this.esc(url)}" target="_blank" rel="noopener">${this.esc(name)}</a>`;
			}
			html += '</div>';
		}
		// Expanded view for featured match
		if (this.expandedId === featured.id) {
			html += this.renderExpanded(featured);
		}
		html += '</div>'; // md-featured

		// Other matches — compact rows inside the card
		if (others.length > 0) {
			html += '<div class="matchday-list">';
			for (const m of others) {
				html += this.renderRow(m, showDay || showDate, showDate);
			}
			html += '</div>';
		}

		html += '</div>'; // matchday
		return html;
	}

	renderLeadWrapper(event, showDay, showDate) {
		const sport = SPORT_CONFIG.find(s => s.id === event.sport) || { color: '#888', name: event.sport, emoji: '' };
		const color = sport.color;
		const tourneyText = event.tournament ? ` \u00b7 ${this.esc(event.tournament)}` : '';

		let html = '<div class="lead">';
		html += `<div class="lead-accent" style="background:${color}"></div>`;
		html += '<div class="lead-body">';
		html += `<div class="lead-sport" style="color:${color}">${sport.emoji} ${this.esc(sport.name)}${tourneyText}</div>`;
		html += this.renderRow(event, showDay || showDate, showDate);
		if (event.summary) {
			html += `<div class="lead-lede">${this.esc(event.summary)}</div>`;
		}
		const leadStreams = (event.streaming || []).filter(s => ['streaming', 'stream', 'tv'].includes(s.type));
		if (leadStreams.length > 0) {
			html += '<div class="lead-stream">';
			for (const s of leadStreams.slice(0, 3)) {
				const url = s.url || '#';
				const name = s.platform || s;
				html += `<a class="stream-link" href="${this.esc(url)}" target="_blank" rel="noopener">${this.esc(name)}</a>`;
			}
			html += '</div>';
		}
		html += '</div></div>';
		return html;
	}

	/** Render a group of same-sport events as a single lead card with event rows inside */
	renderSportGroupCard(events, sportId, tournament, showDay, showDate) {
		const sport = SPORT_CONFIG.find(s => s.id === sportId) || { color: '#888', name: sportId, emoji: '' };
		const color = sport.color;
		const now = new Date();

		// Pick the most important event for the card's headline
		const headline = [...events].sort((a, b) => {
			const aNor = (a.norwegian || a.norwegianRelevance >= 4) ? 1 : 0;
			const bNor = (b.norwegian || b.norwegianRelevance >= 4) ? 1 : 0;
			if (aNor !== bNor) return bNor - aNor;
			return (b.importance || 0) - (a.importance || 0);
		})[0];

		// Day context — check if events span today (multi-day events like golf tournaments)
		const today = this._startOfDay(now);
		const todayEnd = new Date(today.getTime() + SS_CONSTANTS.MS_PER_DAY);
		const tomorrow = todayEnd;
		const tomorrowEnd = new Date(tomorrow.getTime() + SS_CONSTANTS.MS_PER_DAY);
		const spansToday = events.some(e => {
			const start = new Date(e.time).getTime();
			const end = e.endTime ? new Date(e.endTime).getTime() : start;
			return start < todayEnd.getTime() && end >= today.getTime();
		});
		let dayLabel = '';
		if (spansToday || this._isSameDay(new Date(events[0].time), now)) {
			dayLabel = 'Today';
		} else {
			const firstDate = new Date(events[0].time);
			if (firstDate >= tomorrow && firstDate < tomorrowEnd) dayLabel = 'Tomorrow';
			else dayLabel = firstDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' });
		}

		// Tournament logo
		const tourLogo = typeof getTournamentLogo === 'function' ? getTournamentLogo(tournament) : null;
		const logoImg = tourLogo ? `<img class="lead-tour-logo" src="${tourLogo}" alt="${this.esc(tournament)}" loading="lazy">` : '';

		let html = '<div class="lead">';
		html += `<div class="lead-accent" style="background:${color}"></div>`;
		html += '<div class="lead-body">';
		html += '<div class="lead-meta">';
		html += `<span class="lead-sport" style="color:${color}">${logoImg}${sport.emoji} ${this.esc(sport.name)}</span>`;
		html += `<span class="lead-time">${this.esc(dayLabel)} \u00b7 ${events.length} event${events.length !== 1 ? 's' : ''}</span>`;
		html += '</div>';

		// Headline title and lede from the most important event
		if (headline.title) {
			html += `<div class="lead-title">${this.esc(headline.title)}</div>`;
		}
		if (headline.summary || headline.importanceReason) {
			html += `<div class="lead-lede">${this.esc(headline.summary || headline.importanceReason)}</div>`;
		}

		// Golf: show pairing snippet in card header (e.g. "Hovland with Harman · 18:20")
		if (sportId === 'golf') {
			const norPlayersWithGroup = events.flatMap(e => (e.norwegianPlayers || []).filter(p => {
				const fg = (e.featuredGroups || []).find(g => g.player === p.name);
				return fg?.groupmates?.length > 0;
			}).map(p => ({ player: p, event: e })));
			if (norPlayersWithGroup.length > 0) {
				const { player, event: golfEv } = norPlayersWithGroup[0];
				const fg = (golfEv.featuredGroups || []).find(g => g.player === player.name);
				const partner = fg.groupmates[0]?.name || fg.groupmates[0];
				const tee = player.teeTime ? ` \u00b7 ${player.teeTime}` : '';
				const partnerShort = partner ? partner.split(' ').pop() : '';
				html += `<div class="lead-pairing">${this.esc(player.name.split(' ').pop())} with ${this.esc(partnerShort)}${this.esc(tee)}</div>`;
			}
		}

		// Cycling: show Norwegian rider names below the lede
		if (sportId === 'cycling') {
			const riderNames = [...new Set(events.flatMap(e => (e.norwegianPlayers || []).map(p => typeof p === 'string' ? p : p.name).filter(Boolean)))];
			if (riderNames.length > 0) {
				html += `<div class="lead-pairing">\ud83c\uddf3\ud83c\uddf4 ${this.esc(riderNames.join(', '))}</div>`;
			}
		}

		// Event rows inside the card
		for (const e of events) {
			const date = new Date(e.time);
			const isNor = e.norwegian || e.norwegianRelevance >= 4;
			const isMedal = e.tags?.includes('medal-event');
			// For multi-day events in progress, show "In progress" instead of start time
			const isMultiDay = e.endTime && new Date(e.endTime) > date;
			const isInProgress = isMultiDay && date < now && new Date(e.endTime) > now;
			let timeLabel;
			if (showDay) {
				timeLabel = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Europe/Oslo' });
			} else if (isInProgress) {
				timeLabel = 'Live';
			} else {
				timeLabel = date.toLocaleTimeString('en-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' });
			}
			// Show individual tournament label if different events have different tournaments
			const evtTour = e.tournament && e.tournament !== tournament ? ` \u00b7 ${this.esc(e.tournament)}` : '';

			html += `<div class="lead-event" data-id="${this.esc(e.id)}" role="button" tabindex="0">`;
			html += `<span class="lead-event-time${isInProgress ? ' is-live' : ''}">${timeLabel}</span>`;
			html += `<span class="lead-event-name">${this.esc(e.title)}${evtTour}</span>`;
			if (isNor) html += '<span class="lead-event-flag">\ud83c\uddf3\ud83c\uddf4</span>';
			if (isMedal) html += '<span class="lead-event-badge">Medal</span>';
			html += '</div>';

			// Expanded view inside card
			if (this.expandedId === e.id) {
				html += this.renderExpanded(e);
			}
		}


		// Golf: Norwegian player tee times on the card (most useful at-a-glance info)
		if (sportId === 'golf') {
			const norPlayers = events.flatMap(e => (e.norwegianPlayers || []).filter(p => p.teeTime));
			if (norPlayers.length > 0) {
				// Build a flat leaderboard lookup across all golf tours
				// Include trackedPlayers so Norwegian golfers outside top-15 still show their position
				const golfTours = this.standings?.golf || {};
				const allLbEntries = Object.values(golfTours).flatMap(tour => [
					...(tour.leaderboard || []),
					...(tour.trackedPlayers || []),
				]);

				html += '<div class="lead-tee-times">';
				for (const p of norPlayers) {
					// Case-insensitive substring match against leaderboard player names
					const playerNameLower = (p.name || '').toLowerCase();
					const lbEntry = allLbEntries.find(entry => {
						const entryNameLower = (entry.player || '').toLowerCase();
						return entryNameLower === playerNameLower ||
							entryNameLower.includes(playerNameLower) ||
							playerNameLower.includes(entryNameLower);
					});

					// Resolve headshot: standings entry first, then asset-map fallback
					const hsUrl = (lbEntry && lbEntry.headshot) ||
						(typeof getGolferHeadshot === 'function' ? getGolferHeadshot(p.name) : null);
					const hsImg = hsUrl
						? `<img class="lead-tee-hs" src="${this.esc(hsUrl)}" alt="${this.esc(p.name)}" loading="lazy">`
						: '<span class="lead-tee-hs lead-tee-hs-placeholder"></span>';

					html += `<div class="lead-tee-time">`;
					html += hsImg;
					html += `<span class="lead-tee-name">${this.esc(p.name)}</span>`;
					if (lbEntry) {
						const pos = lbEntry.positionDisplay || `T${lbEntry.position}`;
						const score = lbEntry.score || 'E';
						html += `<span class="lead-tee-standing">${this.esc(pos)} (${this.esc(score)})</span>`;
					}
					html += `<span class="lead-tee-clock">${this.esc(p.teeTime)}</span>`;
					html += `</div>`;
				}
				html += '</div>';
			}
		}

		// Leaderboard for golf cards — live polling first, standings fallback
		if (sportId === 'golf') {
			if (this.liveLeaderboard && this.liveLeaderboard.state === 'in' && this.liveLeaderboard.players?.length > 0) {
				html += this.renderLiveLeaderboard();
			} else if (this.standings?.golf) {
				html += this.renderStandingsLeaderboard(tournament);
			}
		}

		// Streaming links from the first event that has them (tv/streaming only, not betting platforms)
		const groupStreams = events.flatMap(e => (e.streaming || []).filter(s => ['streaming', 'stream', 'tv'].includes(s.type)));
		if (groupStreams.length > 0) {
			html += '<div class="lead-stream">';
			for (const s of groupStreams.slice(0, 3)) {
				const url = s.url || '#';
				const name = s.platform || s;
				html += `<a class="stream-link" href="${this.esc(url)}" target="_blank" rel="noopener">${this.esc(name)}</a>`;
			}
			html += '</div>';
		}

		html += '</div></div>';
		return html;
	}

	/** Get tracked player last names from standings data (data-driven, not hardcoded).
	 *  Falls back to names from leaderboard entries with tracked flag. */
	_getTrackedGolferNames() {
		const names = new Set();
		const tours = this.standings?.golf || {};
		for (const tourKey of Object.keys(tours)) {
			const tour = tours[tourKey];
			for (const p of (tour.leaderboard || [])) {
				if (p.tracked) names.add(p.player.split(' ').pop().toLowerCase());
			}
			for (const p of (tour.trackedPlayers || [])) {
				names.add(p.player.split(' ').pop().toLowerCase());
			}
		}
		return names;
	}

	renderLiveLeaderboard() {
		const lb = this.liveLeaderboard;
		if (!lb || !lb.players?.length) return '';

		// Tracked player names derived from standings data (norwegian-golfers.json pipeline)
		const trackedNames = this._getTrackedGolferNames();

		let html = '<div class="lead-lb">';
		html += '<div class="lead-lb-header">';
		html += `<span class="lead-lb-title">Leaderboard</span>`;
		const roundLabel = lb.round || 'Live';
		html += `<span class="lead-lb-badge"><span class="lead-lb-badge-dot"></span> ${this.esc(roundLabel)}</span>`;
		html += '</div>';

		// Show top 3 + tracked players (Norwegian golfers) from anywhere in the field
		const top3 = lb.players.slice(0, 3);
		const trackedInField = lb.players.filter(p => {
			const last = p.player.split(' ').pop().toLowerCase();
			return trackedNames.has(last) && !top3.includes(p);
		});
		const showPlayers = [...top3, ...trackedInField];

		for (const p of showPlayers) {
			const isTracked = trackedNames.has(p.player.split(' ').pop().toLowerCase());
			const scoreNum = parseFloat(p.score);
			const scoreCls = p.score.startsWith('-') ? ' under-par' : (scoreNum > 0 ? ' over-par' : '');

			// Headshot: prefer ESPN CDN from data, fall back to manual map
			const headshot = p.headshot || (typeof getGolferHeadshot === 'function' ? getGolferHeadshot(p.player) : null);
			const imgHtml = headshot
				? `<img class="lb-img" src="${headshot}" alt="${this.esc(p.player)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display=''">`
				  + '<span class="lb-img-placeholder" style="display:none">\u26f3</span>'
				: '<span class="lb-img-placeholder">\u26f3</span>';

			html += `<div class="lb-row${isTracked ? ' is-you' : ''}">`;
			html += `<span class="lb-pos">${this.esc(String(p.position))}</span>`;
			html += imgHtml;
			html += `<span class="lb-name">${this.esc(p.player)}</span>`;
			if (isTracked) html += '<span class="lb-flag">\ud83c\uddf3\ud83c\uddf4</span>';
			html += `<span class="lb-score${scoreCls}">${this.esc(p.score)}</span>`;
			if (p.thru && p.thru !== '-') html += `<span class="lb-thru">F${p.thru === '18' ? '' : p.thru}</span>`;
			html += '</div>';
		}

		// Footer with venue
		if (lb.venue) {
			html += `<div class="lb-footer">${this.esc(lb.venue)}</div>`;
		}

		html += '</div>';
		return html;
	}

	// Standings leaderboard — delegated to standings-renderer.js
	renderStandingsLeaderboard(tournament) {
		return window.StandingsRenderer.renderStandingsLeaderboard(tournament, this.standings);
	}

	renderEmptySportNotes(allEvents) {
		const PREF_MAP = this._userPreferences?.sportPreferences || { football: 'high', golf: 'high', formula1: 'medium', tennis: 'medium', chess: 'medium', esports: 'medium', cycling: 'low' };
		const activeSports = new Set(allEvents.map(e => e.sport));
		const missing = SPORT_CONFIG
			.filter(s => {
				const pref = PREF_MAP[s.id];
				return (pref === 'high' || pref === 'medium') && !activeSports.has(s.id);
			});
		if (missing.length === 0) return '';
		return missing.map(s => {
			const reason = this._getEmptySportReason(s.id);
			const suffix = reason ? ` \u2014 ${reason}` : '';
			return `<div class="empty-sport-note">${s.emoji} No upcoming ${s.name.toLowerCase()} events${suffix}</div>`;
		}).join('');
	}

	/** Auto-generate a brief narrative from today's events when the LLM didn't provide one */
	_generateAutoNarrative() {
		const bands = this.categorizeEvents();
		const todayEvents = [...bands.live, ...bands.today];
		if (todayEvents.length === 0) return '';

		// Find highlights: Norwegian interest first, then highest importance
		const highlights = todayEvents
			.filter(e => e.importance >= 4)
			.sort((a, b) => {
				const aNor = (a.norwegian || a.norwegianRelevance >= 4) ? 1 : 0;
				const bNor = (b.norwegian || b.norwegianRelevance >= 4) ? 1 : 0;
				if (aNor !== bNor) return bNor - aNor;
				return (b.importance || 0) - (a.importance || 0);
			});

		// Build a concise editorial teaser — one sentence per highlight, max 2
		const parts = [];
		for (const e of highlights.slice(0, 2)) {
			if (e.homeTeam && e.awayTeam) {
				const isNor = e.norwegian || e.norwegianRelevance >= 4;
				const flag = isNor ? ' \ud83c\uddf3\ud83c\uddf4' : '';
				parts.push(`<strong>${this.esc(this.shortName(e.homeTeam))} v ${this.esc(this.shortName(e.awayTeam))}</strong>${flag}`);
			} else if (e.summary) {
				// Use first sentence of summary, truncate at word boundary
				let s = e.summary;
				const dot = s.indexOf('. ');
				if (dot > 0 && dot < 80) {
					s = s.slice(0, dot + 1);
				} else if (s.length > 80) {
					let cut = s.lastIndexOf(' ', 77);
					if (cut > 30) {
						s = s.slice(0, cut).replace(/[\s\u2014\u2013,;:\-]+$/, '') + '\u2026';
					} else {
						s = s.slice(0, 77).replace(/[\s\u2014\u2013,;:\-]+$/, '') + '\u2026';
					}
				}
				parts.push(this.esc(s));
			} else if (e.title) {
				const sport = SPORT_CONFIG.find(c => c.id === e.sport);
				parts.push(`${sport?.emoji || ''} ${this.esc(e.title)}`);
			}
		}

		if (parts.length === 0) {
			const sportSet = new Set(todayEvents.map(e => e.sport));
			return `${todayEvents.length} events across ${sportSet.size} sports today.`;
		}

		// Add a result teaser if there are recent results
		const results = this._getRecentMatchResults();
		if (results.length > 0) {
			const r = results[0];
			if (r._resultSport === 'golf') {
				const winner = (r._golfLeaderboard || [])[0];
				if (winner) parts.push(`Latest: ${this.esc(winner.player || winner.name)} wins ${this.esc(r._golfTournament || '')}`);
			} else if (r.homeScore != null) {
				parts.push(`Latest: ${this.esc(this.shortName(r.homeTeam))} ${r.homeScore}\u2013${r.awayScore} ${this.esc(this.shortName(r.awayTeam))}`);
			}
		}

		// Join parts — use '. ' but avoid '…. ' (ellipsis then period)
		return parts.map((p, i) => {
			if (i === 0) return p;
			const prev = parts[i - 1];
			const sep = prev.endsWith('\u2026') || prev.endsWith('.') ? ' ' : '. ';
			return sep + p;
		}).join('');
	}

	_getEmptySportReason(sportId) {
		const h = this.healthReport;
		if (!h) return '';
		const dataKey = normalizePipelineSportId(sportId);
		const freshness = h.dataFreshness && h.dataFreshness[dataKey + '.json'];
		const coverage = h.sportCoverage && h.sportCoverage[dataKey];
		if (freshness && freshness.stale) return 'data source stale';
		if (coverage && coverage.count === 0 && freshness && !freshness.stale) {
			if (dataKey === 'tennis') return 'no Norwegian player matches scheduled';
			if (dataKey === 'esports') return 'data source unavailable';
			return 'off-season or no scheduled events';
		}
		return '';
	}

	/** Get recent match results from recent-results.json for result cards */
	_getRecentMatchResults() {
		const now = new Date();
		const cutoff = new Date(now.getTime() - 72 * 60 * 60 * 1000); // last 72h
		const results = [];

		// Football results
		if (this.recentResults?.football?.length) {
			for (const m of this.recentResults.football) {
				if (m.homeScore != null && new Date(m.date) >= cutoff) {
					results.push({ ...m, _resultSport: 'football' });
				}
			}
		}

		// Golf results — only show previous tournament if no current golf events are active
		const hasActiveGolf = (this.allEvents || []).some(e =>
			e.sport === 'golf' && e.endTime && new Date(e.endTime) >= now && new Date(e.time) <= now
		);
		if (!hasActiveGolf) {
			const pgaData = this.recentResults?.golf?.pga;
			if (pgaData?.status === 'final') {
				const pga = pgaData;
				const nor = (pga.norwegianPlayers || [])[0] || null;
				results.push({
					_resultSport: 'golf',
					_golfTournament: pga.tournamentName,
					_golfStatus: pga.status,
					_golfLeaderboard: (pga.topPlayers || []).slice(0, 3),
					_golfNorwegian: nor,
					league: 'PGA Tour',
					date: pga.lastUpdated || now.toISOString(),
					homeTeam: pga.tournamentName,
				});
			}
		}

		// DP World Tour golf results (same pattern as PGA)
		if (!hasActiveGolf) {
			const dpData = this.recentResults?.golf?.dpWorld;
			if (dpData?.status === 'final') {
				const nor = (dpData.norwegianPlayers || [])[0] || null;
				results.push({
					_resultSport: 'golf',
					_golfTournament: dpData.tournamentName,
					_golfStatus: dpData.status,
					_golfLeaderboard: (dpData.topPlayers || []).slice(0, 3),
					_golfNorwegian: nor,
					_golfTour: 'DP World Tour',
					league: 'DP World Tour',
					date: dpData.lastUpdated || now.toISOString(),
					homeTeam: dpData.tournamentName,
				});
			}
		}

		// F1 race results
		if (this.recentResults?.f1?.length) {
			for (const race of this.recentResults.f1) {
				if (race.raceName && race.topDrivers?.length && new Date(race.date) >= cutoff) {
					results.push({
						_resultSport: 'f1',
						_f1RaceName: race.raceName,
						_f1TopDrivers: race.topDrivers.slice(0, 3),
						_f1Circuit: race.circuit || '',
						_f1Type: race.type || 'Race',
						league: 'Formula 1',
						date: race.date,
					});
				}
			}
		}

		// Sort: favorites first, then by date (most recent)
		results.sort((a, b) => {
			const aFav = a.isFavorite ? 1 : 0;
			const bFav = b.isFavorite ? 1 : 0;
			if (aFav !== bFav) return bFav - aFav;
			return new Date(b.date) - new Date(a.date);
		});
		return results.slice(0, 5); // max 5 result items
	}

	/** Render results section with grouped tournament cards */
	_renderUpcomingHint(futureEvents) {
		// Count distinct sports represented in future events so we can summarise
		// them concisely ("Chess, Football +2 more").
		const sportCounts = new Map();
		for (const e of futureEvents) {
			const id = e.sport || 'other';
			sportCounts.set(id, (sportCounts.get(id) || 0) + 1);
		}
		const sortedSports = Array.from(sportCounts.entries()).sort((a, b) => b[1] - a[1]);
		const nameFor = (id) => {
			const sp = SPORT_CONFIG.find(s => s.id === id);
			return sp ? sp.name : id;
		};
		const topNames = sortedSports.slice(0, 2).map(([id]) => nameFor(id));
		const extraSportCount = Math.max(0, sortedSports.length - topNames.length);
		const sportText = topNames.join(', ') + (extraSportCount > 0 ? ` +${extraSportCount} more` : '');
		const eventWord = futureEvents.length === 1 ? 'event' : 'events';
		return `<button type="button" class="upcoming-hint" data-upcoming-hint aria-label="Jump to upcoming days">` +
			`<span class="upcoming-hint-count">${futureEvents.length}</span> more ${eventWord} on upcoming days` +
			(sportText ? ` · <span class="upcoming-hint-sports">${this.esc(sportText)}</span>` : '') +
			` <span class="upcoming-hint-arrow">→</span></button>`;
	}

	_renderResultsSection(matchResults, resultEvents) {
		const totalCount = matchResults.length + resultEvents.filter(e => !e._isResult).length;
		const countBadge = totalCount > 0 ? `<span class="results-count-badge">${totalCount}</span>` : '';
		let html = `<div class="flow-label band-label results"><span class="flow-text">What you missed</span><span class="flow-line"></span>${countBadge}</div>`;
		html += '<div class="band-content">';

		// Group match results by tournament
		const groups = [];
		let buf = { league: null, sport: null, matches: [] };
		const flushBuf = () => {
			if (buf.matches.length === 0) return;
			groups.push({ league: buf.league, sport: buf.sport, matches: [...buf.matches] });
			buf = { league: null, sport: null, matches: [] };
		};
		for (const m of matchResults) {
			const key = m.league || m._resultSport || 'other';
			if (key === (buf.league || buf.sport || 'other')) {
				buf.matches.push(m);
			} else {
				flushBuf();
				buf = { league: m.league, sport: m._resultSport, matches: [m] };
			}
		}
		flushBuf();

		for (const group of groups) {
			if (group.sport === 'golf') {
				// Golf results rendered individually
				for (const m of group.matches) {
					html += this._renderGolfResultCard(m);
				}
			} else if (group.sport === 'f1') {
				for (const m of group.matches) {
					html += this._renderF1ResultCard(m);
				}
			} else if (group.matches.length >= 2) {
				// 2+ same-tournament results → grouped card with featured + compact rows
				html += this._renderGroupedResultCard(group.league, group.matches);
			} else {
				// Single result → individual card
				html += this._renderFootballResultCard(group.matches[0]);
			}
		}

		// Event-based results (non-football, like ended tournaments)
		const eventResults = resultEvents.filter(e => !e._isResult);
		if (eventResults.length > 0) {
			html += '<div class="event-card">';
			for (const e of eventResults) {
				html += this.renderRow(e, false, false);
			}
			html += '</div>';
		}

		html += '</div>';
		return html;
	}

	_renderGroupedResultCard(league, matches) {
		const leagueLogo = typeof getTournamentLogo === 'function' ? getTournamentLogo(league) : null;
		const leagueImg = leagueLogo ? `<img class="result-league-logo" src="${leagueLogo}" alt="${this.esc(league || '')}" loading="lazy">` : '';
		const hasFavorite = matches.some(m => m.isFavorite);
		let html = `<div class="result-card${hasFavorite ? ' result-fav' : ''}">`;
		html += '<div class="result-accent" style="background:var(--sport-football)"></div>';
		html += '<div class="result-body">';
		html += '<div class="result-header">';
		html += `<span class="result-sport">${leagueImg}${this.esc(league || '')}</span>`;
		html += `<span class="result-ft-badge">${matches.length} results</span>`;
		html += '</div>';
		// Featured: first match with full detail
		const feat = matches[0];
		const fhLogo = typeof getTeamLogo === 'function' ? getTeamLogo(feat.homeTeam) : null;
		const faLogo = typeof getTeamLogo === 'function' ? getTeamLogo(feat.awayTeam) : null;
		const fhImg = fhLogo ? `<img class="result-team-logo" src="${fhLogo}" alt="${this.esc(feat.homeTeam)}" loading="lazy">` : '';
		const faImg = faLogo ? `<img class="result-team-logo" src="${faLogo}" alt="${this.esc(feat.awayTeam)}" loading="lazy">` : '';
		const featHomeWins = feat.homeScore > feat.awayScore;
		const featAwayWins = feat.awayScore > feat.homeScore;
		html += '<div class="result-match">';
		html += `<div class="result-team${featHomeWins ? ' result-winner' : ''}">${fhImg}<span class="result-team-name">${this.esc(this.shortName(feat.homeTeam))}</span></div>`;
		html += `<span class="result-score">${feat.homeScore} - ${feat.awayScore}</span>`;
		html += `<div class="result-team${featAwayWins ? ' result-winner' : ''}">${faImg}<span class="result-team-name">${this.esc(this.shortName(feat.awayTeam))}</span></div>`;
		html += '</div>';
		if (feat.recapHeadline) {
			html += `<div class="result-summary">${this.esc(feat.recapHeadline)}</div>`;
		}
		const scorers = (feat.goalScorers || []).slice(0, 4);
		if (scorers.length > 0) {
			html += `<div class="result-scorers">${scorers.map(g => this.esc(`${g.player} ${g.minute}`)).join(', ')}</div>`;
		}
		// Remaining matches as compact rows
		if (matches.length > 1) {
			for (let i = 1; i < matches.length; i++) {
				html += this._renderCompactResultRow(matches[i]);
			}
		}
		html += '</div></div>';
		return html;
	}

	_renderFootballResultCard(m) {
		// Look up event tags from allEvents by team name match (tags are enriched there but not on recentResults)
		const matchedEvent = (this.allEvents || []).find(e =>
			e.sport === 'football' && e.homeTeam === m.homeTeam && e.awayTeam === m.awayTeam
		);
		if (matchedEvent?.tags?.length) m = { ...m, tags: matchedEvent.tags };
		const hLogo = typeof getTeamLogo === 'function' ? getTeamLogo(m.homeTeam) : null;
		const aLogo = typeof getTeamLogo === 'function' ? getTeamLogo(m.awayTeam) : null;
		const hImg = hLogo ? `<img class="result-team-logo" src="${hLogo}" alt="${this.esc(m.homeTeam)}" loading="lazy">` : '';
		const aImg = aLogo ? `<img class="result-team-logo" src="${aLogo}" alt="${this.esc(m.awayTeam)}" loading="lazy">` : '';
		const favClass = m.isFavorite ? ' result-fav' : '';
		let html = `<div class="result-card${favClass}">`;
		html += '<div class="result-accent" style="background:var(--sport-football)"></div>';
		html += '<div class="result-body">';
		const leagueLogo = typeof getTournamentLogo === 'function' ? getTournamentLogo(m.league) : null;
		const leagueImg = leagueLogo ? `<img class="result-league-logo" src="${leagueLogo}" alt="${this.esc(m.league || '')}" loading="lazy">` : '';
		html += '<div class="result-header">';
		html += `<span class="result-sport">${leagueImg}${this.esc(m.league || '')}</span>`;
		html += '<span class="result-ft-badge">FT</span>';
		html += '</div>';
		const homeWins = m.homeScore > m.awayScore;
		const awayWins = m.awayScore > m.homeScore;
		html += '<div class="result-match">';
		html += `<div class="result-team${homeWins ? ' result-winner' : ''}">${hImg}<span class="result-team-name">${this.esc(this.shortName(m.homeTeam))}</span></div>`;
		html += `<span class="result-score">${m.homeScore} - ${m.awayScore}</span>`;
		html += `<div class="result-team${awayWins ? ' result-winner' : ''}">${aImg}<span class="result-team-name">${this.esc(this.shortName(m.awayTeam))}</span></div>`;
		html += '</div>';
		const goalScorers = m.goalScorers || [];
		const scorers = goalScorers.slice(0, 4);
		if (m.recapHeadline) {
			html += `<div class="result-summary">${this.esc(m.recapHeadline)}</div>`;
		} else {
			// Fallback: build a context-aware one-liner using tags + goalscorer data
			const tags = m.tags || [];
			const tagLabels = { 'title-race': 'Title race', 'relegation': 'Relegation battle', 'rivalry': 'Rivalry', 'derby': 'Derby', 'final': 'Final', 'knockout': 'Knockout' };
			const contextTag = tags.find(t => tagLabels[t]);
			const lastScorer = goalScorers[goalScorers.length - 1];
			const winner = m.homeScore > m.awayScore ? this.shortName(m.homeTeam) : m.awayScore > m.homeScore ? this.shortName(m.awayTeam) : null;
			let summaryText = '';
			if (contextTag && scorers.length > 0 && lastScorer?.player) {
				summaryText = `${tagLabels[contextTag]}: ${lastScorer.player} ${lastScorer.minute} decides it`;
			} else if (contextTag && winner) {
				summaryText = `${tagLabels[contextTag]}: ${winner} win`;
			} else if (scorers.length > 0 && lastScorer?.player) {
				summaryText = `${lastScorer.player} ${lastScorer.minute} seals it`;
			} else if (winner) {
				summaryText = `${winner} win`;
			}
			if (summaryText) html += `<div class="result-summary">${this.esc(summaryText)}</div>`;
		}
		if (scorers.length > 0) {
			html += `<div class="result-scorers">${scorers.map(g => this.esc(`${g.player} ${g.minute}`)).join(', ')}</div>`;
		}
		html += '</div></div>';
		return html;
	}

	_renderGolfResultCard(m) {
		const lb = m._golfLeaderboard || [];
		const nor = m._golfNorwegian;
		const isFinal = m._golfStatus === 'final';
		let html = '<div class="result-card">';
		html += '<div class="result-accent" style="background:var(--sport-golf)"></div>';
		html += '<div class="result-body">';
		html += '<div class="result-header">';
		html += `<span class="result-sport">${this.esc(m._golfTour || 'PGA Tour')}</span>`;
		html += `<span class="result-ft-badge">${isFinal ? 'Final' : 'In progress'}</span>`;
		html += '</div>';
		html += `<div class="result-golf-title">${this.esc(m._golfTournament || '')}</div>`;
		if (lb.length > 0) {
			html += '<div class="result-golf-lb">';
			for (let i = 0; i < lb.length; i++) {
				const p = lb[i];
				const pName = p.player || p.name || '';
				const headshot = typeof getGolferHeadshot === 'function' ? getGolferHeadshot(pName) : null;
				const img = headshot ? `<img class="result-golfer-img" src="${headshot}" alt="${this.esc(pName)}" loading="lazy">` : `<span class="result-golfer-pos">${p.position || i + 1}</span>`;
				html += `<div class="result-golfer">${img}<span class="result-golfer-name">${this.esc(pName)}</span><span class="result-golfer-score">${this.esc(p.score || p.totalScore || '')}</span></div>`;
			}
			if (nor) {
				const norName = nor.player || nor.name || '';
				const norImg = typeof getGolferHeadshot === 'function' ? getGolferHeadshot(norName) : null;
				const nImg = norImg ? `<img class="result-golfer-img" src="${norImg}" alt="${this.esc(norName)}" loading="lazy">` : `<span class="result-golfer-pos">\ud83c\uddf3\ud83c\uddf4</span>`;
				html += `<div class="result-golfer nor">${nImg}<span class="result-golfer-name">${this.esc(norName)}</span><span class="result-golfer-score">T${nor.position} (${this.esc(nor.score || '')})</span></div>`;
			}
			html += '</div>';
		}
		html += '</div></div>';
		return html;
	}

	_renderF1ResultCard(m) {
		const drivers = m._f1TopDrivers || [];
		let html = '<div class="result-card">';
		html += '<div class="result-accent" style="background:var(--sport-formula1)"></div>';
		html += '<div class="result-body">';
		html += '<div class="result-header">';
		html += '<span class="result-sport">Formula 1</span>';
		html += `<span class="result-ft-badge">${this.esc(m._f1Type || 'Race')}</span>`;
		html += '</div>';
		html += `<div class="result-f1-title">${this.esc(m._f1RaceName || '')}</div>`;
		if (m._f1Circuit) {
			html += `<div class="result-f1-circuit">${this.esc(m._f1Circuit)}</div>`;
		}
		if (drivers.length > 0) {
			html += '<div class="result-f1-podium">';
			const medals = ['\ud83e\udd47', '\ud83e\udd48', '\ud83e\udd49'];
			for (let i = 0; i < drivers.length; i++) {
				const d = drivers[i];
				const driverName = d.driver || d.name || '';
				const medal = medals[i] || `${i + 1}.`;
				html += `<div class="result-f1-driver"><span class="result-f1-pos">${medal}</span><span class="result-f1-name">${this.esc(driverName)}</span></div>`;
			}
			html += '</div>';
		}
		html += '</div></div>';
		return html;
	}

	_renderCompactResultRow(m) {
		const hLogo = typeof getTeamLogo === 'function' ? getTeamLogo(m.homeTeam) : null;
		const aLogo = typeof getTeamLogo === 'function' ? getTeamLogo(m.awayTeam) : null;
		let html = `<div class="result-row" role="button" tabindex="0" aria-label="${this.esc(`${m.homeTeam} ${m.homeScore}\u2013${m.awayScore} ${m.awayTeam}`)}">`;
		html += '<div class="result-row-main">';
		html += '<div class="result-row-logos">';
		if (hLogo) html += `<img class="result-row-logo" src="${hLogo}" alt="${this.esc(m.homeTeam)}" loading="lazy">`;
		if (aLogo) html += `<img class="result-row-logo" src="${aLogo}" alt="${this.esc(m.awayTeam)}" loading="lazy">`;
		html += '</div>';
		html += `<span class="result-row-teams">${this.esc(this.shortName(m.homeTeam))} v ${this.esc(this.shortName(m.awayTeam))}</span>`;
		html += `<span class="result-row-score">${m.homeScore} - ${m.awayScore}</span>`;
		html += '</div>';
		// Expandable details
		const scorers = (m.goalScorers || []).slice(0, 6);
		const hasDetails = scorers.length > 0 || m.recapHeadline || m.venue;
		if (hasDetails) {
			html += '<div class="result-row-details">';
			if (m.recapHeadline) {
				html += `<div class="result-row-recap">${this.esc(m.recapHeadline)}</div>`;
			}
			if (scorers.length > 0) {
				html += `<div class="result-row-scorers">${scorers.map(g => this.esc(`${g.player} ${g.minute}`)).join(', ')}</div>`;
			}
			if (m.venue) {
				html += `<div class="result-row-venue">${this.esc(m.venue)}</div>`;
			}
			html += '</div>';
		}
		html += '</div>';
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

		// Today: card-first feed — fewer sections, clear purpose per card
		const bands = this.categorizeEvents();
		const sf = this.activeSportFilter;
		const filterBand = (arr) => sf ? arr.filter(e => e.sport === sf) : arr;

		let html = '';

		// 1. Live events — only show label if there are live events
		const liveEvents = filterBand(bands.live);
		if (liveEvents.length > 0) {
			html += this.renderBand('Happening now', liveEvents, { cssClass: 'live' });
		}

		// 2. Today's events — label "Today" for clear hierarchy when results follow below
		const todayEvents = filterBand(bands.today);
		if (todayEvents.length > 0) {
			html += this.renderBand('Today', todayEvents, {});
		}

		// 3. Results — render important results as result cards
		const resultEvents = filterBand(bands.results);
		const recentMatches = this._getRecentMatchResults();
		if (recentMatches.length > 0 || resultEvents.length > 0) {
			html += this._renderResultsSection(recentMatches, resultEvents);
		}

		// Future events are accessible via the day navigator — surface a subtle
		// hint so users who haven't discovered the day strip know content exists
		// outside today's window. Honours the active sport filter.
		const futureEvents = filterBand([...bands.tomorrow, ...bands.week, ...bands.later]);
		if (futureEvents.length > 0) {
			html += this._renderUpcomingHint(futureEvents);
		}

		// Standings: collapsible band below events for direct PL table/golf leaderboard access
		const standingsHtml = this.renderStandingsSection();
		if (standingsHtml) html += standingsHtml;

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
				const league = this.getLeagueStyle(event.tournament);
				if (league) {
					subtitleHtml = `<span class="row-league-badge" style="color:${league.color}">${league.abbr}</span>`;
				} else {
					subtitleHtml = `<span class="row-subtitle">${this.esc(event.tournament)}</span>`;
				}
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
			if (hLogo || aLogo) {
				iconHtml = '';
				if (hLogo) iconHtml += `<img src="${hLogo}" alt="${this.esc(event.homeTeam)}" class="row-logo" loading="lazy">`;
				if (aLogo) iconHtml += `<img src="${aLogo}" alt="${this.esc(event.awayTeam)}" class="row-logo" loading="lazy">`;
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
			const norName = event.norwegianPlayers[0].name;
			const rowTourKey = (event.tournament || '').toLowerCase().includes('dp world') ? 'dpWorld' : 'pga';
			const rowHsMap = this.liveLeaderboard?.headshots || this.standings?.golf?.[rowTourKey]?.headshots || {};
			const headshot = rowHsMap[norName] || (typeof getGolferHeadshot === 'function' ? getGolferHeadshot(norName) : null);
			if (headshot) {
				iconHtml = `<img src="${headshot}" alt="${this.esc(norName)}" class="row-headshot" loading="lazy">`;
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
		const diffMin = (date - now) / SS_CONSTANTS.MS_PER_MINUTE;
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

		// Norwegian interest badge — full flag for high relevance, muted NOR for partial relevance
		const isNorwegian = event.norwegian || event.norwegianPlayers?.length > 0 || event.norwegianRelevance >= 4;
		const isPartialNor = !isNorwegian && (event.norwegianRelevance === 2 || event.norwegianRelevance === 3);
		const norBadge = isNorwegian
			? '<span class="row-nor" title="Norsk interesse">🇳🇴</span>'
			: isPartialNor
				? '<span class="row-nor-muted" title="Norsk relevans">NOR</span>'
				: '';

		// Favorite indicator
		const favBadge = event.isFavorite ? '<span class="row-fav" title="Favorite">★</span>' : '';

		// Tournament subtitle: show league badge if configured, else plain subtitle
		let subtitleHtml = '';
		if (event.tournament) {
			const league = this.getLeagueStyle(event.tournament);
			if (league) {
				subtitleHtml = `<span class="row-league-badge" style="color:${league.color}">${league.abbr}</span>`;
			} else if (!event.title.toLowerCase().includes(event.tournament.toLowerCase())) {
				subtitleHtml = `<span class="row-subtitle">${this.esc(event.tournament)}</span>`;
			}
		}

		// Meta subtitle: knockout context, aggregate scores, etc.
		let metaText = '';
		if (event.meta) {
			if (typeof event.meta === 'string') {
				metaText = event.meta;
			} else if (event.sport === 'formula1' && typeof event.meta === 'object') {
				const parts = [];
				if (event.meta.round) parts.push(`Rd ${event.meta.round}`);
				parts.push(event.meta.circuit || event.meta.country || '');
				metaText = parts.filter(Boolean).join(' \u00b7 ');
			} else if (typeof event.meta === 'object') {
				metaText = Object.values(event.meta).filter(Boolean).join(' \u00b7 ');
			}
		}
		const metaHtml = metaText ? `<span class="row-meta">${this.esc(metaText)}</span>` : '';

		// Aggregate pill: must-watch (importance 5) knockout football with an aggregate score
		// surfaces the critical context (e.g., "AGG 2-0") in the collapsed row so users don't
		// need to tap to discover it. See ssExtractAggregate in shared-constants.js.
		let aggregatePillHtml = '';
		if (!isExpanded && event.importance === 5 && event.sport === 'football' && metaText) {
			const agg = typeof ssExtractAggregate === 'function' ? ssExtractAggregate(metaText) : null;
			if (agg) {
				const title = agg.leader
					? `${agg.leader} lead ${agg.score} on aggregate`
					: (agg.tied ? `Tied ${agg.score} on aggregate` : `Aggregate ${agg.score}`);
				aggregatePillHtml = `<span class="row-agg-pill" title="${this.esc(title)}"><span class="row-agg-label">${agg.label}</span> ${this.esc(agg.score)}</span>`;
			}
		}

		// Tennis surface badge (Clay/Grass/Hard/Indoor Hard)
		let surfaceBadgeHtml = '';
		if (event.sport === 'tennis' && event.meta?.surface) {
			const surfaceColors = { 'Clay': '#c97a2e', 'Grass': '#2e8b57', 'Hard': '#4682b4', 'Indoor Hard': '#4682b4' };
			const sColor = surfaceColors[event.meta.surface] || '#888';
			surfaceBadgeHtml = `<span class="surface-badge" style="background:${sColor}">${this.esc(event.meta.surface)}</span>`;
		}

		// Multi-day progress badge (Day X/Y)
		let dayProgressHtml = '';
		if (event.time && event.endTime) {
			const evStart = new Date(event.time);
			const evEnd = new Date(event.endTime);
			const totalDays = Math.ceil((evEnd - evStart) / 86400000) + 1;
			if (totalDays > 1) {
				const currentDay = Math.ceil((now - evStart) / 86400000) + 1;
				if (currentDay >= 1 && currentDay <= totalDays) {
					dayProgressHtml = `<span class="day-progress-badge">Day ${currentDay}/${totalDays}</span>`;
				}
			}
		}

		// Esports tier badge (S-Tier, A-Tier, etc.) in collapsed row
		let tierBadgeHtml = '';
		if (!isExpanded && event.sport === 'esports' && event.tier) {
			tierBadgeHtml = `<span class="row-tier-badge">${this.esc(event.tier)}</span>`;
		}

		// Streaming availability badge (collapsed row hint)
		const hasStreaming = !isExpanded && event.streaming && event.streaming.some(s => ['streaming', 'stream', 'tv'].includes(s.type));
		const streamingBadgeHtml = hasStreaming ? '<span class="row-streaming-badge" title="Available to stream">TV</span>' : '';

		// Sport dot color
		const sportCfg = typeof SPORT_CONFIG !== 'undefined' ? SPORT_CONFIG.find(s => s.id === event.sport) : null;
		const dotColor = sportCfg ? sportCfg.color : 'var(--muted)';

		const summaryHtml = (isMustWatch && !isExpanded && event.summary) ? `<div class="row-summary">${this.esc(event.summary)}</div>` : '';
		const importanceReasonHtml = (isMustWatch && !isExpanded && !event.summary && event.importanceReason) ? `<div class="row-importance-reason">${this.esc(event.importanceReason)}</div>` : '';
		const importanceBadgeHtml = (!isExpanded && event.importance === 5 && event.importanceReason && !this._summaryCoversReason(event.summary, event.importanceReason)) ? `<div class="row-importance-badge">${this.esc(event.importanceReason)}</div>` : '';

		// Must-watch pill badge (visible in collapsed row, accessible without color perception)
		const mustWatchPill = (isMustWatch && !isExpanded) ? '<span class="row-must-watch-pill">Must Watch</span>' : '';

		// Golf: show playing-with subtitle from featuredGroups in collapsed row
		let playingWithHtml = '';
		if (!isExpanded && event.sport === 'golf' && event.featuredGroups?.length > 0) {
			const names = event.featuredGroups.flatMap(g => (g.groupmates || []).map(m => m.name || m)).filter(Boolean);
			if (names.length > 0) playingWithHtml = `<div class="row-playing-with">Playing with ${names.slice(0, 3).map(n => this.esc(n)).join(', ')}</div>`;
		}

		const _ariaLabel = `${event.title}, ${timeStr.replace(/<[^>]+>/g, '')}${isMustWatch ? ', must-watch' : ''}`;
	return `
			<div class="event-row${isExpanded ? ' expanded' : ''}${isMustWatch ? ' must-watch' : ''}${isStartingSoon ? ' starting-soon' : ''}" data-id="${this.esc(event.id)}" role="button" tabindex="0" aria-expanded="${isExpanded}" aria-label="${this.esc(_ariaLabel)}">
				<div class="row-main">
					<span class="event-sport-dot" style="background:${dotColor}"></span>
					<span class="row-time">${timeStr}${surfaceBadgeHtml}${dayProgressHtml}${relHtml}${mustWatchPill}${aggregatePillHtml}</span>
					${iconHtml ? `<span class="row-icons">${iconHtml}</span>` : ''}
					<span class="row-title${isMustWatch ? ' must-watch-title' : ''}"><span class="row-title-text">${titleHtml}</span>${norBadge}${favBadge}${subtitleHtml}${tierBadgeHtml}${streamingBadgeHtml}${metaHtml}</span>
				</div>
				${importanceBadgeHtml}
				${summaryHtml}
				${importanceReasonHtml}
				${playingWithHtml}
				${isExpanded ? this.renderExpanded(event) : ''}
			</div>
		`;
	}

	shortName(name) { return ssShortName(name); }

	renderFeedbackButtons(eventId, sport, tournament) {
		if (!this.feedback) return '';
		return `<div class="fb-row" data-fb-id="${this.esc(eventId)}" data-fb-sport="${this.esc(sport || '')}" data-fb-tournament="${this.esc(tournament || '')}">` +
			`<button class="fb-btn fb-flag" data-fb="flag" title="Report an issue with this event">Report issue</button>` +
			`</div>`;
	}

	_timeAgo(date) {
		const s = Math.floor((Date.now() - date.getTime()) / 1000);
		if (s < 60) return 'just now';
		if (s < 3600) return `${Math.floor(s / 60)}m ago`;
		if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
		return `${Math.floor(s / 86400)}d ago`;
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
						}
					}
				});
			});
		});
	}

	/** Returns true when summary already conveys the key content of importanceReason.
	 *  Uses significant-word overlap: if >50% of the meaningful words in importanceReason
	 *  appear in summary, the two are considered redundant.
	 */
	_summaryCoversReason(summary, importanceReason) {
		if (!summary || !importanceReason) return false;
		const stopwords = new Set(['a', 'an', 'the', 'is', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'with', 'this', 'that', 'it', 'as', 'be', 'by', 'are', 'was', 'will', 'its', 'from']);
		const words = str => str.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopwords.has(w));
		const summaryWords = new Set(words(summary));
		const reasonWords = words(importanceReason);
		if (reasonWords.length === 0) return true;
		const overlap = reasonWords.filter(w => summaryWords.has(w)).length;
		return overlap / reasonWords.length > 0.5;
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

		// Importance reason — suppress when summary already covers the key information
		if (event.importanceReason && !this._summaryCoversReason(event.summary, event.importanceReason)) {
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
			const _liveData = this.liveScores[event.id];
			const homeForm = _liveData?.homeForm || '';
			const awayForm = _liveData?.awayForm || '';
			content += '<div class="exp-teams">';
			content += `<div class="exp-team">
				${homeLogo ? `<img src="${homeLogo}" alt="${this.esc(event.homeTeam)}" class="exp-logo" loading="lazy">` : '<span class="exp-logo-placeholder">\u26bd</span>'}
				<span>${this.esc(event.homeTeam)}</span>
				${homeForm ? `<span class="exp-team-form">${this.esc(homeForm)}</span>` : ''}
			</div>`;
			content += '<span class="exp-vs">vs</span>';
			content += `<div class="exp-team">
				${awayLogo ? `<img src="${awayLogo}" alt="${this.esc(event.awayTeam)}" class="exp-logo" loading="lazy">` : '<span class="exp-logo-placeholder">\u26bd</span>'}
				<span>${this.esc(event.awayTeam)}</span>
				${awayForm ? `<span class="exp-team-form">${this.esc(awayForm)}</span>` : ''}
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

		// Golf: field size
		if (event.sport === 'golf' && event.totalPlayers && event.totalPlayers > 0) {
			content += `<div class="exp-golf-field">${event.totalPlayers} players</div>`;
		}

		// Golf: Norwegian players with headshots
		if (event.sport === 'golf' && event.norwegianPlayers && event.norwegianPlayers.length > 0) {
			// Look up headshots from full competitor map (covers players beyond top 15)
			const tourKey = (event.tournament || '').toLowerCase().includes('dp world') ? 'dpWorld' : 'pga';
			const hsMap = this.liveLeaderboard?.headshots || this.standings?.golf?.[tourKey]?.headshots || {};
			content += '<div class="exp-golfers">';
			event.norwegianPlayers.forEach(player => {
				const headshot = hsMap[player.name] || (typeof getGolferHeadshot === 'function' ? getGolferHeadshot(player.name) : null);
				const teeTime = player.teeTime || '';
				content += `<div class="exp-golfer">
					<div class="exp-golfer-info">
						${headshot ? `<img src="${headshot}" alt="${this.esc(player.name)}" class="exp-headshot" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display=''"><span class="exp-headshot-placeholder" style="display:none">\u26f3</span>` : '<span class="exp-headshot-placeholder">\u26f3</span>'}
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

		// Esports: match result, stage info, and tournament bracket
		if (event.sport === 'esports') {
			content += this.renderEsportsDetails(event);
		}

		// Cycling: Norwegian riders with race context
		if (event.sport === 'cycling' && event.norwegianPlayers?.length > 0) {
			content += '<div class="exp-athletes">';
			content += '<div class="exp-athletes-header">\ud83c\uddf3\ud83c\uddf4 Norwegian Riders</div>';
			event.norwegianPlayers.forEach(player => {
				const name = typeof player === 'string' ? player : player.name;
				const team = (typeof player === 'object' && player.team) ? player.team : null;
				content += `<div class="exp-athlete">${this.esc(name)}${team ? ` <span class="exp-athlete-meta">${this.esc(team)}</span>` : ''}</div>`;
			});
			if (event.link) {
				content += `<a href="${this.esc(event.link)}" target="_blank" rel="noopener noreferrer" class="exp-link">Race details \u2197</a>`;
			}
			content += '</div>';
		}

		// Tennis: structured meta (category + surface) before athlete list
		if (event.sport === 'tennis' && event.meta && typeof event.meta === 'object') {
			const metaBits = [];
			if (event.meta.category) metaBits.push(this.esc(event.meta.category));
			if (event.meta.surface) metaBits.push(this.esc(event.meta.surface));
			if (metaBits.length > 0) {
				content += `<div class="exp-tennis-meta">${metaBits.join(' \u00b7 ')}</div>`;
			}
		}

		// Non-golf, non-cycling: Norwegian athletes (Olympics, esports, etc.)
		if (event.sport !== 'golf' && event.sport !== 'cycling' && event.norwegianPlayers?.length > 0) {
			const isOlympics = event.context === 'olympics-2026';
			content += '<div class="exp-athletes">';
			content += `<div class="exp-athletes-header">${isOlympics ? '\ud83c\uddf3\ud83c\uddf4 Norwegian Athletes' : 'Norwegian Players'}</div>`;
			event.norwegianPlayers.forEach(player => {
				const name = typeof player === 'string' ? player : player.name;
				// Tennis seed display: "(5)" after the name
				const seed = (event.sport === 'tennis' && typeof player === 'object' && player.seed)
					? ` <span class="exp-athlete-seed">(${this.esc(String(player.seed))})</span>` : '';
				content += `<div class="exp-athlete">${this.esc(name)}${seed}</div>`;
			});
			content += '</div>';
		}

		// Golf: tournament leaderboard
		if (event.sport === 'golf' && this.standings?.golf) {
			content += this.renderGolfLeaderboard(event);
		}

		// F1: circuit/round context + driver standings
		if (event.sport === 'formula1' && event.meta && typeof event.meta === 'object') {
			const f1MetaBits = [];
			if (event.meta.round) f1MetaBits.push(`Round ${event.meta.round}`);
			if (event.meta.circuit) f1MetaBits.push(event.meta.circuit);
			if (event.meta.country) f1MetaBits.push(event.meta.country);
			if (f1MetaBits.length > 0) {
				content += `<div class="exp-f1-meta">${f1MetaBits.map(b => this.esc(b)).join(' · ')}</div>`;
			}
		}
		if (event.sport === 'formula1' && this.standings?.[normalizePipelineSportId('formula1')]?.drivers?.length > 0) {
			content += this.renderF1Standings();
		}

		// Chess: tournament standings table
		if (event.sport === 'chess' && this.standings?.chess) {
			const chessKey = Object.keys(this.standings.chess).find(k =>
				event.tournament?.toLowerCase().includes(k) || k === 'candidates'
			);
			if (chessKey && this.standings.chess[chessKey]?.standings?.length > 0) {
				content += window.StandingsRenderer.buildChessMiniTable(this.standings.chess[chessKey]);
			}
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

		// Streaming (filter out betting/unknown platforms — only show tv and streaming)
		const expStreams = (event.streaming || []).filter(s => ['streaming', 'stream', 'tv'].includes(s.type));
		if (expStreams.length > 0) {
			content += '<div class="exp-streaming">';
			expStreams.forEach(s => {
				if (s.url) {
					content += `<a href="${this.esc(s.url)}" target="_blank" rel="noopener noreferrer" class="exp-stream-badge" aria-label="Watch on ${this.esc(s.platform)}">\ud83d\udcfa ${this.esc(s.platform)}</a>`;
				} else {
					content += `<span class="exp-stream-badge">\ud83d\udcfa ${this.esc(s.platform)}</span>`;
				}
			});
			content += '</div>';
		}

		// Favorite actions — team buttons for football and other team sports
		if (event.sport === 'football' && (event.homeTeam || event.awayTeam)) {
			const teams = [event.homeTeam, event.awayTeam].filter(Boolean);
			content += '<div class="exp-fav-actions">';
			teams.forEach(team => {
				const isTeamFav = this.preferences && this.preferences.isTeamFavorite('football', team);
				content += `<button class="exp-fav-btn" data-action="team" data-sport="football" data-name="${this.esc(team)}" aria-label="${isTeamFav ? 'Remove' : 'Add'} ${this.esc(team)} ${isTeamFav ? 'from' : 'to'} favorites">${isTeamFav ? '\u2605' : '\u2606'} ${this.esc(team)}</button>`;
			});
			content += '</div>';
		} else {
			// Non-football: extract team names for esports, F1, cycling
			const extractedTeams = this._extractTeamNames(event);
			const hasFavTeams = extractedTeams.length > 0;
			const hasPlayers = event.norwegianPlayers?.length > 0;
			if (hasFavTeams || hasPlayers) {
				content += '<div class="exp-fav-actions">';
				// Team favorite buttons
				extractedTeams.forEach(team => {
					const isTeamFav = this.preferences?.isTeamFavorite(event.sport, team);
					content += `<button class="exp-fav-btn" data-action="team" data-sport="${this.esc(event.sport)}" data-name="${this.esc(team)}" aria-label="${isTeamFav ? 'Remove' : 'Add'} ${this.esc(team)} ${isTeamFav ? 'from' : 'to'} favorites">${isTeamFav ? '\u2605' : '\u2606'} ${this.esc(team)}</button>`;
				});
				// Player favorite buttons (if not already covered by team buttons)
				if (hasPlayers) {
					event.norwegianPlayers.forEach(player => {
						const name = typeof player === 'string' ? player : player.name;
						const isPlayerFav = this.preferences?.isPlayerFavorite(event.sport, name);
						content += `<button class="exp-fav-btn" data-action="player" data-sport="${this.esc(event.sport)}" data-name="${this.esc(name)}" aria-label="${isPlayerFav ? 'Remove' : 'Add'} ${this.esc(name)} ${isPlayerFav ? 'from' : 'to'} favorites">${isPlayerFav ? '\u2605' : '\u2606'} ${this.esc(name)}</button>`;
					});
				}
				content += '</div>';
			}
		}

		// Related news from RSS
		const relatedHeadlines = this._findRelatedHeadlines(event);
		if (relatedHeadlines.length > 0) {
			content += '<div class="exp-related-news">';
			content += '<div class="exp-related-news-header">Related news</div>';
			relatedHeadlines.forEach(item => {
				content += `<a href="${this.esc(item.link)}" target="_blank" rel="noopener noreferrer" class="exp-related-news-link">${this.esc(item.title)}</a>`;
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

	// --- Esports details (CS2 bracket, results) ---

	renderEsportsDetails(event) {
		let html = '';

		// Tier + prize pool
		if (event.tier || event.prizePool) {
			html += '<div class="exp-esports-meta">';
			if (event.tier) html += `<span class="exp-esports-tier">${this.esc(event.tier)}</span>`;
			if (event.prizePool) html += `<span class="exp-esports-prize">${this.esc(event.prizePool)}</span>`;
			html += '</div>';
		}

		// Stage + format badge
		if (event.stage || event.format) {
			html += '<div class="exp-esports-meta">';
			if (event.stage) html += `<span class="exp-esports-stage">${this.esc(event.stage)}</span>`;
			if (event.format) html += `<span class="exp-esports-format">${this.esc(event.format)}</span>`;
			html += '</div>';
		}

		// Match result
		if (event.result) {
			html += this._renderEsportsResult(event);
		}

		// Tournament bracket (find matching bracket from brackets.json)
		const bracket = this._findBracketForEvent(event);
		if (bracket) {
			html += this._renderTournamentBracket(bracket, event);
		}

		return html;
	}

	_renderEsportsResult(event) {
		const r = event.result;
		if (!r) return '';
		let html = '<div class="exp-esports-result">';

		if (r.maps && r.maps.length > 0) {
			// Bo3/Bo5 with map details
			const teams = event.title.replace(/^.*? - /, '').split(' vs ');
			const t1 = teams[0]?.trim() || 'Team 1';
			const t2 = teams[1]?.trim() || 'Team 2';
			html += `<div class="exp-esports-series-score">${this.esc(r.winner || '')} wins ${this.esc(r.score || '')}</div>`;
			html += '<div class="exp-esports-maps">';
			for (const map of r.maps) {
				const pickerLabel = map.picker ? ` (${this.esc(map.picker)}'s pick)` : '';
				html += `<div class="exp-esports-map">`;
				html += `<span class="exp-esports-map-name">${this.esc(map.map)}${pickerLabel}</span>`;
				html += `<span class="exp-esports-map-score">${map.team1Score}-${map.team2Score}</span>`;
				html += `</div>`;
			}
			html += '</div>';
		} else if (r.winner) {
			// Bo1 result
			const scoreText = r.team1Score != null ? ` ${r.team1Score}-${r.team2Score}` : '';
			const mapText = r.map ? ` on ${r.map}` : '';
			html += `<div class="exp-esports-bo1-result">${this.esc(r.winner)} wins${scoreText}${mapText}</div>`;
		}

		html += '</div>';
		return html;
	}

	// Bracket rendering methods — delegated to bracket-renderer.js
	_findBracketForEvent(event) {
		return window.BracketRenderer.findBracketForEvent(event, this.brackets);
	}

	_renderBracketPath(b, focus) {
		return window.BracketRenderer.renderBracketPath(b, focus, this._bracketCtx());
	}

	_renderTournamentBracket(bracketData, event) {
		return window.BracketRenderer.renderTournamentBracket(bracketData, event, this._bracketCtx());
	}

	_potLabel(m) { return window.BracketRenderer.bracketPotLabel(m); }

	_matchInvolves(match, teamName) { return window.BracketRenderer.bracketMatchInvolves(match, teamName); }

	_bracketCtx() {
		return { esc: escapeHtml, _isSameDay: (a, b) => this._isSameDay(a, b) };
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

	// --- Standings section (consolidated) ---

	// Standings rendering — delegated to standings-renderer.js
	renderStandingsSection() {
		return window.StandingsRenderer.renderStandingsSection(this.standings, this.preferences, this._getTrackedGolferNames());
	}

	_buildMiniTable(opts) { return window.StandingsRenderer.buildMiniTable(opts); }

	renderFootballStandings(event) {
		return window.StandingsRenderer.renderFootballStandings(event, this.standings);
	}

	renderGolfLeaderboard(event) {
		return window.StandingsRenderer.renderGolfLeaderboard(event, this.standings);
	}

	renderF1Standings() {
		return window.StandingsRenderer.renderF1StandingsTable(this.standings);
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
			// For multi-day events (golf), use endTime; for single events, use 4h window
			const end = e.endTime ? new Date(e.endTime).getTime() : start + 4 * 60 * 60 * 1000;
			return start <= now && now <= end &&
				(e.sport === 'football' || e.sport === 'golf');
		});
	}

	async pollLiveScores() {
		if (!this._liveVisible || !this.hasLiveEvents()) return;
		try {
			const prevCount = Object.keys(this.liveScores).length;
			await Promise.all([
				this.pollFootballScores(),
				this.pollGolfScores(),
			]);
			if (Object.keys(this.liveScores).length > prevCount && this.preferences) {
				this.preferences.trackFeatureUse('liveScores');
			}
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
			const roundDetail = ev?.status?.type?.detail || '';
			// Build name→headshot map for ALL competitors (enables Norwegian player lookup beyond top 15)
			const headshots = {};
			for (const c of competitors) {
				const name = c.athlete?.displayName || c.athlete?.fullName;
				if (name && c.id) headshots[name] = `https://a.espncdn.com/i/headshots/golf/players/full/${c.id}.png`;
			}
			this.liveLeaderboard = {
				name: ev.name || '',
				state: state,
				venue: comp?.venue?.fullName || '',
				round: roundDetail,
				headshots,
				players: competitors.slice(0, 15).map((c, idx) => ({
					position: c.status?.position?.displayName || c.order || (idx + 1),
					player: c.athlete?.displayName || c.athlete?.fullName || 'Unknown',
					score: typeof c.score === 'object' ? (c.score?.displayValue || 'E') : (c.score?.toString() || 'E'),
					today: c.linescores?.[c.linescores.length - 1]?.displayValue || '-',
					thru: c.status?.thru?.toString() || '-',
					flag: c.athlete?.flag?.alt || '',
					headshot: c.id ? `https://a.espncdn.com/i/headshots/golf/players/full/${c.id}.png` : null,
				})),
			};
		} catch (e) { console.debug('Golf live poll failed:', e.message); }
	}

	teamMatch(a, b) { return ssTeamMatch(a, b); }

	// --- Event handlers ---

	bindEventRows() {
		const container = document.getElementById('events');
		if (!container || container._ssDelegated) return;
		container._ssDelegated = true;

		container.addEventListener('click', (e) => {
			// Upcoming-days hint — scroll to the day navigator so users can pick a day
			const hint = e.target.closest('[data-upcoming-hint]');
			if (hint) {
				e.stopPropagation();
				const nav = document.getElementById('day-nav');
				if (nav) {
					nav.scrollIntoView({ behavior: 'smooth', block: 'start' });
					const nextItem = nav.querySelector('.day-item:not(.active):not(.has-no-events)');
					if (nextItem) nextItem.focus({ preventScroll: true });
				}
				return;
			}

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

			// Track editorial block engagement
			if (this.preferences) {
				const block = e.target.closest('.block-match-result, .block-match-preview, .block-golf-status, .block-event-schedule');
				if (block) {
					const cls = block.className;
					const type = cls.includes('match-result') ? 'match-result'
						: cls.includes('match-preview') ? 'match-preview'
						: cls.includes('golf-status') ? 'golf-status'
						: cls.includes('event-schedule') ? 'event-schedule' : null;
					if (type) this.preferences.trackBlockEngagement(type);
				}
			}

			// Ignore clicks on interactive elements inside expanded rows
			if (e.target.closest('.exp-stream-badge') || e.target.closest('.exp-link')) return;

			// Handle result row expand/collapse
			const resultRow = e.target.closest('.result-row');
			if (resultRow && resultRow.querySelector('.result-row-details')) {
				resultRow.classList.toggle('expanded');
				return;
			}

			// Handle event row expand/collapse (also handles md-featured clicks)
			const row = e.target.closest('.event-row') || e.target.closest('.md-featured[data-id]') || e.target.closest('.lead-event[data-id]');
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
			const row = e.target.closest('.event-row') || e.target.closest('.result-row');
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

				// Track feature usage on expand
				if (isCollapsed && this.preferences) {
					const featureMap = { standings: 'standings', results: 'resultsBand' };
					const feature = featureMap[bandId] || (bandId.includes('bracket') ? 'brackets' : null);
					if (feature) this.preferences.trackFeatureUse(feature);
				}

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

	_initPullToRefresh() {
		const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
		if (!isStandalone) return;

		const indicator = document.getElementById('ptr-indicator');
		if (!indicator) return;
		const icon = indicator.querySelector('.ptr-icon');

		let startY = 0;
		let pulling = false;
		let pullDist = 0;
		const threshold = 60;
		const maxPull = 80;

		window.addEventListener('touchstart', (e) => {
			if (window.scrollY === 0 && e.touches.length === 1) {
				startY = e.touches[0].clientY;
				pulling = true;
				pullDist = 0;
			}
		}, { passive: true });

		window.addEventListener('touchmove', (e) => {
			if (!pulling) return;
			const dist = e.touches[0].clientY - startY;
			if (dist <= 0 || window.scrollY > 0) {
				pulling = false;
				pullDist = 0;
				indicator.classList.remove('pulling');
				if (icon) icon.style.transform = '';
				return;
			}
			e.preventDefault();
			pullDist = Math.min(dist, maxPull);
			const progress = pullDist / maxPull;
			indicator.classList.add('pulling');
			if (icon) {
				const translateY = progress * maxPull - 40;
				const rotation = progress * 360;
				icon.style.transform = `translateY(${translateY}px) rotate(${rotation}deg)`;
			}
		}, { passive: false });

		window.addEventListener('touchend', () => {
			if (!pulling && !indicator.classList.contains('pulling')) return;
			pulling = false;

			if (pullDist >= threshold) {
				indicator.classList.remove('pulling');
				indicator.classList.add('refreshing');
				if (icon) icon.style.transform = '';
				['events','featured','standings','watchPlan','rssDigest','recentResults','leagueConfig','brackets']
					.forEach(k => sessionStorage.removeItem('ss_' + k));
				setTimeout(() => window.location.reload(), 200);
			} else {
				indicator.classList.remove('pulling');
				if (icon) icon.style.transform = '';
			}
			pullDist = 0;
		}, { passive: true });
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

	// --- Sport detection from block text (for Later-band color cues) ---

	_detectSportFromText(blockSport, text) {
		// If the block carries an explicit sport field, use it
		if (blockSport && typeof SPORT_CONFIG !== 'undefined') {
			const cfg = SPORT_CONFIG.find(s => s.id === blockSport || (s.aliases && s.aliases.includes(blockSport)));
			if (cfg) return cfg.id;
		}
		// Infer from leading emoji in text
		if (typeof SPORT_CONFIG === 'undefined') return null;
		const emojiMap = { '⚽': 'football', '⛳': 'golf', '🎾': 'tennis', '🏎️': 'formula1', '🏎': 'formula1', '♟️': 'chess', '♟': 'chess', '🎮': 'esports', '🚴': 'cycling', '🏅': 'olympics' };
		for (const [emoji, sportId] of Object.entries(emojiMap)) {
			if (text.startsWith(emoji)) return sportId;
		}
		return null;
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
		const mins = Math.round(diffMs / SS_CONSTANTS.MS_PER_MINUTE);
		if (mins < 5) return 'now';
		if (mins < 60) return `in ${mins}m`;
		const hrs = Math.floor(mins / 60);
		const remMins = mins % 60;
		if (remMins === 0 || remMins < 5) return `in ${hrs}h`;
		return `in ${hrs}h ${remMins}m`;
	}

	getLeagueStyle(tournament) {
		if (!tournament || !this.leagueConfig?.leagues) return null;
		const t = tournament.toLowerCase();
		for (const [key, val] of Object.entries(this.leagueConfig.leagues)) {
			if (t.includes(key.toLowerCase())) return val;
		}
		return null;
	}

	/**
	 * Find RSS headlines related to an event by matching team names,
	 * tournament names, and player names against headline text.
	 * Returns up to 2 matching headlines or empty array.
	 */
	_findRelatedHeadlines(event) {
		if (!this.rssDigest?.items?.length) return [];
		const keywords = [];
		if (event.homeTeam) keywords.push(event.homeTeam.toLowerCase());
		if (event.awayTeam) keywords.push(event.awayTeam.toLowerCase());
		if (event.tournament) {
			// Extract meaningful tournament words (skip generic words)
			const skip = new Set(['2026','2025','2024','calendar','season','race','weekend','round','grand','prix','tournaments','championship','world']);
			const words = event.tournament.split(/[\s\-\/]+/).filter(w => w.length > 2 && !skip.has(w.toLowerCase()));
			words.forEach(w => keywords.push(w.toLowerCase()));
		}
		// Add player names (golf, tennis, chess, etc.)
		if (event.norwegianPlayers?.length > 0) {
			event.norwegianPlayers.forEach(p => {
				const name = typeof p === 'string' ? p : p.name;
				if (name) {
					// Use last name for matching (more specific), or full name
					const parts = name.replace(/\s*\(.*?\)\s*/g, '').trim().split(/\s+/);
					if (parts.length > 1) keywords.push(parts[parts.length - 1].toLowerCase());
					keywords.push(name.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase());
				}
			});
		}
		if (keywords.length === 0) return [];

		const matches = [];
		const seenLinks = new Set();
		for (const item of this.rssDigest.items) {
			if (matches.length >= 2) break;
			const haystack = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
			const matched = keywords.some(kw => kw.length > 2 && haystack.includes(kw));
			if (matched && item.link && !seenLinks.has(item.link)) {
				seenLinks.add(item.link);
				matches.push(item);
			}
		}
		return matches;
	}

	/**
	 * Extract team names from a non-football event for favorite buttons.
	 * Looks at title "X vs Y" patterns, participants, and cycling team metadata.
	 */
	_extractTeamNames(event) {
		const teams = [];
		const sport = event.sport;
		// Esports / F1 / cycling: parse "Team A vs Team B" from title
		// Use the last segment after " - " or " – " to handle "Tournament - Team A vs Team B"
		if (event.title) {
			const segments = event.title.split(/\s+[-–—]\s+/);
			const last = segments[segments.length - 1];
			const vsMatch = last.match(/^(.+?)\s+vs\.?\s+(.+?)$/i);
			if (vsMatch) {
				teams.push(vsMatch[1].trim(), vsMatch[2].trim());
			}
		}
		// Esports: participants as team names
		if (sport === 'esports' && event.participants?.length > 0) {
			event.participants.forEach(p => {
				const name = typeof p === 'string' ? p : p.name;
				if (name && !teams.includes(name)) teams.push(name);
			});
		}
		// Cycling: extract rider team names from norwegianPlayers
		if (sport === 'cycling' && event.norwegianPlayers?.length > 0) {
			event.norwegianPlayers.forEach(p => {
				if (typeof p === 'object' && p.team && !teams.includes(p.team)) {
					teams.push(p.team);
				}
			});
		}
		return teams;
	}

	esc(str) { return escapeHtml(str); }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
	window.dashboard = new Dashboard();
});
