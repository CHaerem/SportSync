// Enhanced Sports Dashboard with Personalization
class PersonalizedDashboard extends SimpleSportsDashboard {
	constructor() {
		super();
		
		// Initialize preferences and filters
		this.preferencesManager = new PreferencesManager();
		this.eventFilter = new EventFilter(this.preferencesManager);
		this.settingsUI = null;
		
		// Store original events before filtering
		this.originalEvents = [];
		
		// Initialize personalization features
		this.initPersonalization();
	}

	initPersonalization() {
		// Initialize settings UI
		this.settingsUI = new SettingsUI(this.preferencesManager);
		this.settingsUI.init();
		window.settingsUI = this.settingsUI;
		
		// Listen for preference changes
		window.addEventListener('preferencesChanged', () => {
			this.applyPreferences();
		});
		
		// Apply initial preferences
		this.applyPreferences();
		
		// Check if first visit
		this.checkFirstVisit();
	}

	checkFirstVisit() {
		// Disabled - too intrusive for CALM design
		// Users can discover settings on their own
		localStorage.setItem('sportSync.visited', 'true');
	}

	suggestTemplate(template) {
		// Disabled - let users choose templates manually from settings
	}

	async loadAllEvents() {
		const container = document.getElementById("eventsContainer");
		container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading events...</div>';

		try {
			// Use relative path for GitHub Pages
			const response = await fetch("data/events.json?t=" + Date.now());
			if (!response.ok) throw new Error("Failed to load events");

			const data = await response.json();
			
			// Format events like the parent class does
			const events = data.map((ev) => ({
				title: ev.title,
				time: ev.time,
				timeFormatted: this.formatEventTime(ev.time),
				sport: ev.sport,
				sportName: this.sportDisplayName(ev.sport),
				tournament: ev.tournament,
				venue: ev.venue,
				norwegian: ev.norwegian || false,
				streaming: ev.streaming || [],
				participants: ev.participants || [],
				norwegianPlayers: ev.norwegianPlayers || [],
				totalPlayers: ev.totalPlayers || null,
				link: ev.link || null,
				status: ev.status || null,
				featuredGroups: ev.featuredGroups || [],
				meta: ev.meta || ev.tournament,
				homeTeam: ev.homeTeam,
				awayTeam: ev.awayTeam
			})).sort((a, b) => new Date(a.time) - new Date(b.time));
			
			// Store both original and current events
			this.originalEvents = events;
			this.allEvents = events;
			
			// Apply preferences-based filtering
			this.applyPreferences();
		} catch (error) {
			console.error("Error loading events:", error);
			container.innerHTML = `
				<div style="text-align: center; padding: 40px; color: #999;">
					<p>Unable to load events right now.</p>
					<p style="font-size: 0.9rem; margin-top: 10px;">Please check your connection and try again.</p>
				</div>
			`;
		}
	}

	applyPreferences() {
		const prefs = this.preferencesManager.get();
		
		// Apply theme
		this.applyTheme(prefs.display.theme);
		
		// Apply compact mode
		document.body.classList.toggle('compact-mode', prefs.display.compactMode);
		
		// Filter events based on preferences
		if (this.originalEvents.length > 0) {
			this.allEvents = this.eventFilter.filterEvents(this.originalEvents);
			this.renderFilteredEvents();
		}
	}

	applyTheme(theme) {
		if (theme === 'auto') {
			const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			document.documentElement.classList.toggle('dark', isDark);
		} else {
			document.documentElement.classList.toggle('dark', theme === 'dark');
		}
		
		// Update theme toggle button
		const btn = document.getElementById("toggleTheme");
		if (btn) {
			btn.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
		}
	}

	renderFilteredEvents() {
		let eventsToShow = [...this.allEvents];
		
		// Apply time-based filter using parent class methods
		if (this.currentFilter === "today") {
			const now = new Date();
			const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			const tomorrow = new Date(today);
			tomorrow.setDate(tomorrow.getDate() + 1);
			eventsToShow = eventsToShow.filter(event => {
				const eventDate = new Date(event.time);
				return eventDate >= today && eventDate < tomorrow;
			});
		} else if (this.currentFilter === "week") {
			const now = new Date();
			const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			const weekEnd = new Date(today);
			weekEnd.setDate(today.getDate() + 7);
			eventsToShow = eventsToShow.filter(event => {
				const eventDate = new Date(event.time);
				return eventDate >= today && eventDate < weekEnd;
			});
		} else if (this.currentFilter === "favorites") {
			eventsToShow = this.eventFilter.getFavoriteEvents(eventsToShow);
		}
		
		// Apply sport filters if any are selected
		if (this.selectedSports.size > 0) {
			eventsToShow = eventsToShow.filter(event => 
				this.selectedSports.has(event.sport)
			);
		}
		
		// Group events by relevance
		const grouped = this.eventFilter.groupByRelevance(eventsToShow);
		
		// Render events with relevance indicators
		this.renderEventsWithRelevance(grouped);
		this.updateFilterCount(eventsToShow.length);
	}

	renderEventsWithRelevance(grouped) {
		const container = document.getElementById("eventsContainer");
		const prefs = this.preferencesManager.get();
		
		if (grouped.favorites.length === 0 && grouped.relevant.length === 0 && grouped.other.length === 0) {
			container.innerHTML = this.getEmptyState();
			return;
		}
		
		let html = '';
		
		// Render all events in order, but with subtle styling differences
		// Favorites first (with subtle highlight), then relevant, then others
		const allEvents = [
			...grouped.favorites.map(e => ({...e, isFavorite: true})),
			...grouped.relevant.map(e => ({...e, isFavorite: false})),
			...grouped.other.map(e => ({...e, isFavorite: false, isOther: true}))
		];
		
		html = allEvents.map(event => 
			this.createEventCardHTML(event, event.isFavorite, event.isOther)
		).join('');
		
		container.innerHTML = html || this.getEmptyState();
	}

	createEventCardHTML(event, isFavorite = false, isOther = false) {
		const eventTime = new Date(event.time);
		const prefs = this.preferencesManager.get();
		const timeStr = this.formatEventTime(eventTime, prefs.display.timezone);
		const dayStr = this.formatEventDay(event.time);
		
		const sportBadge = this.sportDisplayName(event.sport);
		const favoriteIndicator = ''; // Remove star indicator for cleaner look
		const otherClass = isOther ? 'other-event' : '';
		
		// Check if event has Norwegian players/teams
		let norwegianInfo = '';
		if (event.norwegianPlayers && event.norwegianPlayers.length > 0) {
			const players = event.norwegianPlayers.map(p => p.name).join(', ');
			norwegianInfo = `<div class="norwegian-info">🇳🇴 ${players}</div>`;
		}
		
		return `
			<div class="event-card ${otherClass} ${isFavorite ? 'favorite-event' : ''}" data-sport="${event.sport}">
				<div class="event-header">
					<span class="event-day">${dayStr}</span>
					${favoriteIndicator}
					<span class="sport-badge ${event.sport}">${sportBadge}</span>
				</div>
				<div class="event-time">${timeStr}</div>
				<div class="event-title">${event.title}</div>
				<div class="event-meta">${event.meta || ''} ${event.venue ? `• ${event.venue}` : ''}</div>
				${norwegianInfo}
				${this.renderStreamingInfo(event.streaming)}
			</div>
		`;
	}

	formatEventTime(timeString, timezone) {
		if (!timeString) return "TBD";
		
		const date = new Date(timeString);
		const options = {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		};
		
		if (timezone && timezone !== 'local') {
			options.timeZone = timezone;
		} else {
			options.timeZone = 'Europe/Oslo';
		}
		
		return date.toLocaleTimeString('en-NO', options);
	}
	
	formatEventDay(timeString) {
		// Use parent class method
		return super.formatEventDay(timeString);
	}

	addPersonalizationIndicators() {
		// Removed - too intrusive for CALM design
	}

	getEmptyState() {
		const prefs = this.preferencesManager.get();
		const hasPreferences = Object.values(prefs.teams).some(t => t.length > 0) ||
							  Object.values(prefs.players).some(p => p.length > 0);
		
		if (this.currentFilter === 'favorites' && !hasPreferences) {
			return `
				<div class="empty-state">
					<p>No favorite teams or players set.</p>
					<p style="font-size: 0.9rem; margin-top: 10px; color: var(--muted);">
						Use the ⚙️ button to add favorites
					</p>
				</div>
			`;
		}
		
		return `
			<div class="empty-state">
				<p>No events found.</p>
			</div>
		`;
	}

	// Override the filter setup to work with preferences
	setupSimpleFilters() {
		super.setupSimpleFilters();
		
		// Add favorites button functionality
		const favBtn = document.querySelector('[data-filter="favorites"]');
		if (favBtn) {
			// Update favorites count
			this.updateFavoritesCount();
		}
	}

	updateFavoritesCount() {
		const favBtn = document.querySelector('[data-filter="favorites"]');
		if (favBtn && this.allEvents.length > 0) {
			const favorites = this.eventFilter.getFavoriteEvents(this.allEvents);
			if (favorites.length > 0) {
				favBtn.innerHTML = `⭐ Favorites (${favorites.length})`;
			}
		}
	}
	
	updateFilterCount(count) {
		// Optional: Update UI with filter count if needed
		// For now, just log it
		console.log(`Showing ${count} events`);
	}
}

// Initialize the personalized dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
	// Use PersonalizedDashboard instead of SimpleSportsDashboard
	window.dashboard = new PersonalizedDashboard();
});

// Add subtle styles for personalization features
const personalizedStyles = document.createElement('style');
personalizedStyles.textContent = `
	.favorite-event {
		border-left: 3px solid var(--border);
		border-left-color: #4CAF50;
	}
	
	.other-event {
		opacity: 0.85;
	}
	
	.empty-state {
		text-align: center;
		padding: 40px 20px;
		color: var(--muted);
	}
	
	.empty-state .action-btn {
		margin-top: 20px;
		padding: 8px 16px;
		background: var(--card-bg);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 6px;
		cursor: pointer;
		font-size: 14px;
		transition: opacity 0.2s;
	}
	
	.empty-state .action-btn:hover {
		opacity: 0.8;
	}
	
	.compact-mode .event-card {
		padding: 10px;
	}
	
	.compact-mode .event-time {
		font-size: 18px;
	}
	
	.compact-mode .event-title {
		font-size: 14px;
	}
`;
document.head.appendChild(personalizedStyles);