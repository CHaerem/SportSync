// SportSync Dashboard — Sport-organized layout
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
		this.preferences = window.PreferencesManager ? new PreferencesManager() : null;
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
		const STATIC_TTL = 5 * 60 * 1000; // 5 minutes — data only changes every 2h
		const cachedEvents = this._cacheGet('events', STATIC_TTL);
		const cachedFeatured = this._cacheGet('featured', STATIC_TTL);
		const cachedStandings = this._cacheGet('standings', STATIC_TTL);
		const cachedWatchPlan = this._cacheGet('watchPlan', STATIC_TTL);
		const cachedRssDigest = this._cacheGet('rssDigest', STATIC_TTL);

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
			this.render();
			return;
		}

		try {
			const [eventsResp, featuredResp, standingsResp, watchPlanResp, rssDigestResp, metaResp] = await Promise.all([
				fetch('data/events.json?t=' + Date.now()),
				fetch('data/featured.json?t=' + Date.now()).catch(() => null),
				fetch('data/standings.json?t=' + Date.now()).catch(() => null),
				fetch('data/watch-plan.json?t=' + Date.now()).catch(() => null),
				fetch('data/rss-digest.json?t=' + Date.now()).catch(() => null),
				fetch('data/meta.json?t=' + Date.now()).catch(() => null)
			]);

			if (!eventsResp.ok) throw new Error('Failed to load events');
			const data = await eventsResp.json();
			this.allEvents = data
				.map(ev => ({
					id: `${ev.sport}-${ev.title}-${ev.time}`.replace(/\s+/g, '-').toLowerCase(),
					title: ev.title,
					time: ev.time,
					sport: ev.sport === 'f1' ? 'formula1' : ev.sport,
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

			this._cacheSet('events', this.allEvents);
			this._cacheSet('featured', this.featured);
			this._cacheSet('standings', this.standings);
			this._cacheSet('watchPlan', this.watchPlan);
			this._cacheSet('rssDigest', this.rssDigest);

			this.render();
		} catch (err) {
			console.error('Error loading events:', err);
			document.getElementById('events').innerHTML =
				'<p class="empty">Unable to load events. Please refresh.</p>';
		}
	}

	// --- Rendering ---

	render() {
		this.renderDateLine();
		this.renderEditorial();
		this.renderWatchPlan();
		this.renderEvents();
		this.renderNews();
	}

	renderDateLine() {
		const el = document.getElementById('date-line');
		if (!el) return;
		const now = new Date();
		let text = now.toLocaleDateString('en-US', {
			weekday: 'long', month: 'long', day: 'numeric',
			timeZone: 'Europe/Oslo'
		});
		if (this.meta && this.meta.lastUpdate) {
			const updated = new Date(this.meta.lastUpdate);
			const diffMin = Math.round((now - updated) / 60000);
			let ago;
			if (diffMin < 1) ago = 'just now';
			else if (diffMin < 60) ago = `${diffMin}m ago`;
			else if (diffMin < 1440) ago = `${Math.round(diffMin / 60)}h ago`;
			else ago = `${Math.round(diffMin / 1440)}d ago`;
			text += `  ·  Updated ${ago}`;
		}
		el.textContent = text;
	}

	// --- Editorial (Block-based layout) ---

	getEditorialBlocks() {
		if (!this.featured || !Array.isArray(this.featured.blocks)) return [];
		return this.featured.blocks;
	}

	renderEditorial() {
		const briefEl = document.getElementById('the-brief');
		const sectionsEl = document.getElementById('featured-sections');

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
		const todayEnd = new Date(todayStart);
		todayEnd.setDate(todayEnd.getDate() + 1);

		const todayEvents = this.allEvents.filter(e => {
			const t = new Date(e.time);
			return t >= todayStart && t < todayEnd;
		});

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

		const picks = this.watchPlan.picks;

		let html = '<div class="watch-plan-header">What to Watch</div>';

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

			const reasons = Array.isArray(pick.reasons) ? pick.reasons : [];
			const streams = Array.isArray(pick.streaming) ? pick.streaming : [];

			html += `<div class="watch-pick" data-pick-index="${i}">`;
			html += `<span class="pick-time">${this.esc(timeLabel)}${relLabel ? `<span class="row-rel">${this.esc(relLabel)}</span>` : ''}</span>`;
			html += `<div class="pick-body">`;
			html += `<div class="pick-title">${emoji} ${this.esc(pick.title || '')}</div>`;
			if (reasons.length > 0 || streams.length > 0) {
				html += '<div class="pick-reasons">';
				reasons.forEach(r => { html += `<span class="pick-reason">${this.esc(r)}</span>`; });
				streams.forEach(s => { html += `<span class="pick-stream">${this.esc(s.platform || s)}</span>`; });
				html += '</div>';
			}
			html += `</div>`;
			html += `</div>`;
		});

		container.innerHTML = html;

		// Bind pick clicks to scroll to matching event
		container.querySelectorAll('.watch-pick').forEach(el => {
			el.addEventListener('click', () => {
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

		let html = `<button class="news-toggle" data-expanded="false">Latest News \u25b8</button>`;
		html += `<div class="news-content">${contentHtml}</div>`;

		container.innerHTML = html;

		const toggle = container.querySelector('.news-toggle');
		const content = container.querySelector('.news-content');
		if (toggle && content) {
			toggle.addEventListener('click', () => {
				const isOpen = content.classList.contains('open');
				content.classList.toggle('open');
				toggle.textContent = isOpen ? 'Latest News \u25b8' : 'Latest News \u25be';
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
			} else if (t >= todayStart && t < tomorrowStart) {
				// Today, no live data
				const hoursAgo = (now - t) / (1000 * 60 * 60);
				if (hoursAgo > 3) {
					bands.results.push(e); // Likely finished
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

		// Group events within band by sport
		const sportGroups = new Map();
		for (const e of events) {
			if (!sportGroups.has(e.sport)) sportGroups.set(e.sport, []);
			sportGroups.get(e.sport).push(e);
		}

		// Build sport config index for ordered lookup
		const sportIndex = new Map();
		for (let i = 0; i < SPORT_CONFIG.length; i++) sportIndex.set(SPORT_CONFIG[i].id, i);

		// Sort sport groups by SPORT_CONFIG order, then render only groups with events
		const sortedSports = [...sportGroups.keys()].sort((a, b) => (sportIndex.get(a) ?? 999) - (sportIndex.get(b) ?? 999));

		for (const sportId of sortedSports) {
			const group = sportGroups.get(sportId);
			const sport = SPORT_CONFIG[sportIndex.get(sportId)] || { emoji: '🏆', name: sportId, color: '#888' };

			// Single-event sport groups: skip header, use compact, pass inline emoji
			if (group.length === 1) {
				html += `<div class="sport-section compact" style="border-left-color:${sport.color}">`;
				html += this.renderRow(group[0], showDay || showDate, showDate, sport.emoji);
				html += `</div>`;
				continue;
			}

			html += `<div class="sport-section" style="border-left-color:${sport.color}">`;
			html += `<div class="sport-header">
				<span class="sport-name">${sport.emoji} ${this.esc(sport.name)}</span>
			</div>`;

			for (const e of group) {
				html += this.renderRow(e, showDay || showDate, showDate);
			}

			html += `</div>`;
		}

		html += `</div>`;
		return html;
	}

	renderEvents() {
		const container = document.getElementById('events');
		const bands = this.categorizeEvents();

		let html = '';

		html += this.renderBand('Live now', bands.live, { cssClass: 'live' });
		html += this.renderBand('Today', bands.today, {});
		html += this.renderBand('Results', bands.results, { cssClass: 'results' });
		html += this.renderBand('Tomorrow', bands.tomorrow, { showDay: true });
		html += this.renderBand('This week', bands.week, { collapsed: true, showDay: true });
		html += this.renderBand('Later', bands.later, { collapsed: true, showDate: true });

		if (!html) {
			html = '<p class="empty">No upcoming events.</p>';
		}

		container.innerHTML = html;
		this.bindEventRows();
		this.bindBandToggles();
	}

	renderRow(event, showDay, showDate, inlineSportEmoji = null) {
		const date = new Date(event.time);
		const now = new Date();

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
					<span class="row-title${isMustWatch ? ' must-watch-title' : ''}"><span class="row-title-text">${emojiPrefix}${titleHtml}</span>${subtitleHtml}</span>
				</div>
				${isExpanded ? this.renderExpanded(event) : ''}
			</div>
		`;
	}

	shortName(name) {
		if (!name) return '';
		return name.replace(/ FC$| AFC$| CF$| FK$/i, '').replace(/^FC |^AFC /i, '').trim();
	}

	renderExpanded(event) {
		let content = '<div class="row-expanded">';

		// Venue
		if (event.venue && event.venue !== 'TBD') {
			content += `<div class="exp-venue">${this.esc(event.venue)}</div>`;
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

		// Football: match details (stats + key events)
		if (event.sport === 'football') {
			content += this.renderMatchDetails(event);
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

		// Golf: tournament leaderboard
		if (event.sport === 'golf' && this.standings?.golf) {
			content += this.renderGolfLeaderboard(event);
		}

		// F1: driver standings
		if (event.sport === 'formula1' && this.standings?.f1?.drivers?.length > 0) {
			content += this.renderF1Standings();
		}

		// Participants (chess, tennis)
		if (event.participants && event.participants.length > 0 && (event.sport === 'chess' || event.sport === 'tennis')) {
			content += `<div class="exp-participants">Players: ${event.participants.map(p => this.esc(typeof p === 'string' ? p : p.name)).join(', ')}</div>`;
		}

		// Streaming
		if (event.streaming && event.streaming.length > 0) {
			content += '<div class="exp-streaming">';
			event.streaming.forEach(s => {
				if (s.url) {
					content += `<a href="${this.esc(s.url)}" target="_blank" rel="noopener noreferrer" class="exp-stream-badge">\ud83d\udcfa ${this.esc(s.platform)}</a>`;
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
				content += `<button class="exp-fav-btn" data-action="team" data-sport="football" data-name="${this.esc(team)}">${isTeamFav ? '\u2605' : '\u2606'} ${this.esc(team)}</button>`;
			});
			content += '</div>';
		} else if (event.sport === 'golf' && event.norwegianPlayers && event.norwegianPlayers.length > 0) {
			content += '<div class="exp-fav-actions">';
			event.norwegianPlayers.forEach(player => {
				const isPlayerFav = this.preferences && this.preferences.isPlayerFavorite('golf', player.name);
				content += `<button class="exp-fav-btn" data-action="player" data-sport="golf" data-name="${this.esc(player.name)}">${isPlayerFav ? '\u2605' : '\u2606'} ${this.esc(player.name)}</button>`;
			});
			content += '</div>';
		}

		content += '</div>';
		return content;
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
			const homeShots = live.stats?.home_totalShots || '0';
			const awayShots = live.stats?.away_totalShots || '0';
			const homeOnTarget = live.stats?.home_shotsOnTarget || '0';
			const awayOnTarget = live.stats?.away_shotsOnTarget || '0';
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

	// --- Standings renderers ---

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
		} catch { /* silent */ }
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
		} catch { /* silent */ }
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

		// Track which positions have been replaced to avoid overlapping
		const replaced = new Set();

		const insertLogo = (escapedLine, name, imgHtml) => {
			const escapedName = this.esc(name);
			const idx = escapedLine.indexOf(escapedName);
			if (idx === -1) return escapedLine;
			// Check no overlap with already-replaced regions
			for (const [start, end] of replaced) {
				if (idx < end && idx + escapedName.length > start) return escapedLine;
			}
			replaced.add([idx, idx + escapedName.length]);
			return escapedLine.substring(0, idx) + imgHtml + escapedLine.substring(idx);
		};

		// Inject team logos
		for (const [name, logo] of teamEntries) {
			const imgHtml = `<img src="${logo}" alt="" class="brief-logo" loading="lazy">`;
			escaped = insertLogo(escaped, name, imgHtml);
		}

		// Inject golfer headshots
		for (const [name, headshot] of golferEntries) {
			const imgHtml = `<img src="${headshot}" alt="" class="brief-logo brief-headshot" loading="lazy">`;
			escaped = insertLogo(escaped, name, imgHtml);
		}

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
