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
		const prefs = this.preferencesManager.get();
		const isFirstVisit = !localStorage.getItem('sportSync.visited');
		
		if (isFirstVisit) {
			localStorage.setItem('sportSync.visited', 'true');
			
			// Try to detect user location and suggest template
			const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
			
			if (timezone.includes('Oslo') || timezone.includes('Stockholm')) {
				this.suggestTemplate('norwegian');
			} else if (timezone.includes('London') || timezone.includes('Dublin')) {
				this.suggestTemplate('uk');
			} else if (timezone.includes('America')) {
				this.suggestTemplate('us');
			}
		}
	}

	suggestTemplate(template) {
		const message = `Welcome to SportSync! Would you like to use the ${template} sports template?`;
		if (confirm(message)) {
			this.preferencesManager.applyTemplate(template);
			this.applyPreferences();
		}
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
		
		// Render favorite events first
		if (grouped.favorites.length > 0) {
			html += '<div class="events-section"><h3>⭐ Your Favorites</h3>';
			html += grouped.favorites.map(event => this.createEventCardHTML(event, true)).join('');
			html += '</div>';
		}
		
		// Render relevant events
		if (grouped.relevant.length > 0) {
			html += '<div class="events-section">';
			if (grouped.favorites.length > 0) {
				html += '<h3>Other Events</h3>';
			}
			html += grouped.relevant.map(event => this.createEventCardHTML(event, false)).join('');
			html += '</div>';
		}
		
		// Optionally show other events
		if (grouped.other.length > 0 && prefs.display.showOtherEvents !== false) {
			html += '<div class="events-section"><h3>More Events</h3>';
			html += grouped.other.map(event => this.createEventCardHTML(event, false, true)).join('');
			html += '</div>';
		}
		
		container.innerHTML = html || this.getEmptyState();
		
		// Add personalization indicators
		this.addPersonalizationIndicators();
	}

	createEventCardHTML(event, isFavorite = false, isOther = false) {
		const eventTime = new Date(event.time);
		const prefs = this.preferencesManager.get();
		const timeStr = this.formatEventTime(eventTime, prefs.display.timezone);
		const dayStr = this.formatEventDay(event.time);
		
		const sportBadge = this.sportDisplayName(event.sport);
		const favoriteIndicator = isFavorite ? '<span class="favorite-indicator">⭐</span>' : '';
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
		// Add subtle indicators for personalized content
		const favoriteEvents = document.querySelectorAll('.favorite-event');
		favoriteEvents.forEach(card => {
			if (!card.querySelector('.personalized-badge')) {
				const badge = document.createElement('div');
				badge.className = 'personalized-badge';
				badge.title = 'This matches your preferences';
				card.appendChild(badge);
			}
		});
	}

	getEmptyState() {
		const prefs = this.preferencesManager.get();
		const hasPreferences = Object.values(prefs.teams).some(t => t.length > 0) ||
							  Object.values(prefs.players).some(p => p.length > 0);
		
		if (this.currentFilter === 'favorites' && !hasPreferences) {
			return `
				<div class="empty-state">
					<p>No favorite teams or players set.</p>
					<button onclick="settingsUI.open()" class="action-btn">
						⚙️ Add Favorites in Settings
					</button>
				</div>
			`;
		}
		
		return `
			<div class="empty-state">
				<p>No events found matching your preferences.</p>
				<button onclick="settingsUI.open()" class="action-btn">
					⚙️ Adjust Settings
				</button>
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

// Add styles for personalization features
const personalizedStyles = document.createElement('style');
personalizedStyles.textContent = `
	.events-section {
		margin-bottom: 30px;
	}
	
	.events-section h3 {
		margin: 20px 0 15px 0;
		color: var(--text);
		font-size: 18px;
		font-weight: 600;
	}
	
	.favorite-event {
		border: 2px solid #4CAF50;
		box-shadow: 0 2px 8px rgba(76, 175, 80, 0.2);
	}
	
	.favorite-indicator {
		color: #FFD700;
		font-size: 18px;
	}
	
	.other-event {
		opacity: 0.8;
	}
	
	.norwegian-info {
		margin-top: 8px;
		padding: 4px 8px;
		background: rgba(76, 175, 80, 0.1);
		border-radius: 4px;
		font-size: 13px;
		color: var(--text);
	}
	
	.personalized-badge {
		position: absolute;
		top: 10px;
		right: 10px;
		width: 8px;
		height: 8px;
		background: #4CAF50;
		border-radius: 50%;
		animation: pulse 2s infinite;
	}
	
	@keyframes pulse {
		0% { opacity: 1; }
		50% { opacity: 0.5; }
		100% { opacity: 1; }
	}
	
	.empty-state {
		text-align: center;
		padding: 60px 20px;
		color: var(--muted);
	}
	
	.empty-state .action-btn {
		margin-top: 20px;
		padding: 10px 20px;
		background: #4CAF50;
		color: white;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		font-size: 16px;
	}
	
	.empty-state .action-btn:hover {
		background: #45a049;
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