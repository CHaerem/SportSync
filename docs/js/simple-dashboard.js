// Simple Sports Dashboard for CALM design
class SimpleSportsDashboard {
	constructor() {
		this.api = new SportsAPI();
		this.currentFilter = "all";
		this.selectedSports = new Set(); // Track multiple selected sports
		this.allEvents = [];
		this.viewMode = 'list'; // Default view mode
		this.init();
	}

	async init() {
		this.setupSimpleFilters();
		await this.updateLastUpdatedTime();
		await this.loadAllEvents();

		// Refresh data every 30 minutes
		setInterval(() => {
			this.loadAllEvents();
			this.updateLastUpdatedTime();
		}, 30 * 60 * 1000);
	}

	setupSimpleFilters() {
		const sportButtons = document.querySelectorAll(".sport-filter");
		const timeButtons = document.querySelectorAll(".filter-btn:not(.sport-filter)");

		// Handle time-based filters (All, Today, Week, Favorites)
		timeButtons.forEach((btn) => {
			btn.addEventListener("click", (e) => {
				// Remove active from time filter buttons
				timeButtons.forEach((b) => b.classList.remove("active"));
				// Add active to clicked button
				e.target.classList.add("active");

				this.currentFilter = e.target.dataset.filter;
				this.renderFilteredEvents();
				this.updateFilterCount();
			});
		});

		// Handle sport filters (allow multiple selection)
		sportButtons.forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const sport = e.target.dataset.filter;
				
				if (this.selectedSports.has(sport)) {
					// Remove sport from selection
					this.selectedSports.delete(sport);
					e.target.classList.remove("active");
				} else {
					// Add sport to selection
					this.selectedSports.add(sport);
					e.target.classList.add("active");
				}

				this.renderFilteredEvents();
				this.updateFilterCount();
			});
		});
	}

	updateFilterCount() {
		// Optional: Could add a subtle event count indicator
		// Could display filtered count somewhere if desired
	}

	async updateLastUpdatedTime() {
		try {
			const metaResponse = await fetch(
				"data/meta.json?t=" + Date.now()
			);
			if (metaResponse.ok) {
				const meta = await metaResponse.json();
				const lastUpdate = new Date(meta.lastUpdate);
				const timeString = lastUpdate.toLocaleString("en-NO", {
					weekday: "short",
					month: "short",
					day: "numeric",
					hour: "2-digit",
					minute: "2-digit",
					timeZone: "Europe/Oslo",
				});

				document.getElementById("lastUpdate").textContent = timeString;
				return;
			}
		} catch (error) {
			console.log("No metadata available, using current time");
		}

		const now = new Date();
		const timeString = now.toLocaleString("en-NO", {
			weekday: "short",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			timeZone: "Europe/Oslo",
		});

		document.getElementById("lastUpdate").textContent = timeString;
	}

	async loadAllEvents() {
		const container = document.getElementById("eventsContainer");

		try {
			// Single aggregated file load (relative path for local or GitHub Pages subpath)
			const resp = await fetch("data/events.json?t=" + Date.now());
			if (!resp.ok) throw new Error("Failed to load aggregated events");
			const data = await resp.json();
			// Map aggregated events into internal format
			this.allEvents = data
				.map((ev) => ({
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
				}))
				.sort((a, b) => new Date(a.time) - new Date(b.time));
			this.renderFilteredEvents();
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

	sportDisplayName(code) {
		switch (code) {
			case "football":
				return "⚽ Football";
			case "golf":
				return "⛳ Golf";
			case "tennis":
				return "🎾 Tennis";
			case "f1":
			case "formula1":
				return "🏎️ F1";
			case "chess":
				return "♟️ Chess";
			case "esports":
				return "🎮 Esports";
			default:
				return code;
		}
	}

	renderFilteredEvents() {
		const container = document.getElementById("eventsContainer");

		if (!this.allEvents || this.allEvents.length === 0) {
			container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #999;">
                    <p>No events found.</p>
                </div>
            `;
			return;
		}

		let filteredEvents = this.allEvents.filter((event) =>
			this.passesFilter(event)
		);

		// Limit to next 20 events to keep it simple
		filteredEvents = filteredEvents.slice(0, 20);

		if (filteredEvents.length === 0) {
			container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #999;">
                    <p>No events found for this filter.</p>
                </div>
            `;
			return;
		}

		const eventsHTML = filteredEvents
			.map((event, index) => {
				const timeDisplay = this.formatEventTime(event.time);
				const relativeTime = this.getRelativeTime(event.time);
				
				// Special handling for football teams with logos - CALM DESIGN
				let teamsDisplay = '';
				if (event.sport === 'football' && event.homeTeam && event.awayTeam) {
					const homeLogo = this.getTeamLogo(event.homeTeam);
					const awayLogo = this.getTeamLogo(event.awayTeam);
					
					teamsDisplay = `
						<div class="teams-display">
							<div class="team-block">
								${homeLogo ? `<img src="${homeLogo}" alt="${this.escapeHtml(event.homeTeam)}" class="team-logo">` : `<div style="width: 56px; height: 56px; background: white; border: 1px solid var(--border); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px;">⚽</div>`}
								<span class="team-name">${this.escapeHtml(event.homeTeam)}</span>
							</div>
							<span class="vs-separator">vs</span>
							<div class="team-block">
								${awayLogo ? `<img src="${awayLogo}" alt="${this.escapeHtml(event.awayTeam)}" class="team-logo">` : `<div style="width: 56px; height: 56px; background: white; border: 1px solid var(--border); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px;">⚽</div>`}
								<span class="team-name">${this.escapeHtml(event.awayTeam)}</span>
							</div>
						</div>
					`;
				}
				
				// Special handling for golf events with Norwegian players - CLEAN DESIGN
				const norwegianPlayersLine = event.sport === 'golf' && event.norwegianPlayers && event.norwegianPlayers.length
					? `<div class="tee-times">
						<div style="font-size: 0.85rem; font-weight: 600; color: var(--muted); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Tee Times</div>
						${event.norwegianPlayers.map(player => {
							const teeTimeDisplay = player.teeTime 
								? `${this.escapeHtml(player.teeTime)}`
								: 'TBD';
							
							return `
								<div class="tee-time-player">
									<span class="player-name">${this.escapeHtml(player.name)}</span>
									<span class="player-time">${teeTimeDisplay}</span>
								</div>
							`;
						}).join('')}
					</div>`
					: "";
					
				// Minimal venue display
				const venueDisplay = event.venue && event.venue !== 'TBD' 
					? `<span class="event-meta-item">📍 ${this.escapeHtml(event.venue.split(',')[0])}</span>`
					: '';
				
				// Minimal tournament display (only if not redundant with title)
				const tournamentDisplay = event.tournament && !event.title.includes(event.tournament)
					? `<span class="event-meta-item">${this.escapeHtml(event.tournament)}</span>`
					: '';
				
				return `
                <div class="event-card ${event.sport}" data-event-id="${index}">
                    <div class="sport-line ${event.sport}"></div>
                    <div class="sport-badge ${event.sport}">${this.escapeHtml(event.sportName)}</div>
                    <div class="event-header">
                        <div class="event-time-info">
                            <div class="event-time-relative">${this.escapeHtml(relativeTime)}</div>
                            <div class="event-time-exact">${this.escapeHtml(timeDisplay)}</div>
                        </div>
                    </div>
                    <div class="event-content">
                        <h3 class="event-title">${this.escapeHtml(event.title)}</h3>
                        ${teamsDisplay}
                        ${
							(venueDisplay || tournamentDisplay) 
								? `<div class="event-meta">
									${tournamentDisplay}
									${venueDisplay}
								</div>`
								: ''
						}
                        ${norwegianPlayersLine}
                    </div>
                </div>
            `;
			})
			.join("");

		container.innerHTML = eventsHTML;
	}

	passesFilter(event) {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);
		const weekEnd = new Date(today);
		weekEnd.setDate(today.getDate() + 7);
		const eventDate = new Date(event.time);

		// Apply time-based filter first
		let passesTimeFilter = false;
		switch (this.currentFilter) {
			case "all":
				passesTimeFilter = true;
				break;
			case "today":
				passesTimeFilter = eventDate >= today && eventDate < tomorrow;
				break;
			case "week":
				passesTimeFilter = eventDate >= today && eventDate < weekEnd;
				break;
			case "favorites":
				passesTimeFilter = this.isFavoriteEvent(event);
				break;
			default:
				passesTimeFilter = true;
		}

		// If no time filter passes, event is filtered out
		if (!passesTimeFilter) return false;

		// Apply sport filter if any sports are selected
		if (this.selectedSports.size === 0) {
			// No sport filters selected, show all sports
			return true;
		}

		// Check if event's sport matches any selected sports
		return this.selectedSports.has("golf") && event.sport === "golf" ||
			   this.selectedSports.has("football") && event.sport === "football" ||
			   this.selectedSports.has("tennis") && event.sport === "tennis" ||
			   this.selectedSports.has("formula1") && (event.sport === "f1" || event.sport === "formula1") ||
			   this.selectedSports.has("chess") && event.sport === "chess" ||
			   this.selectedSports.has("esports") && event.sport === "esports";
	}

	isFavoriteEvent(event) {
		// Check for favorite football teams: Lyn and Barcelona
		if (event.sport === "football") {
			const title = event.title.toLowerCase();
			const homeTeam = event.homeTeam?.toLowerCase() || "";
			const awayTeam = event.awayTeam?.toLowerCase() || "";
			
			// Check for Barcelona (various spellings)
			const isBarca = title.includes("barcelona") || title.includes("barça") || 
							homeTeam.includes("barcelona") || awayTeam.includes("barcelona");
			
			// Check for Lyn (various formats)
			const isLyn = title.includes("lyn") || 
						  homeTeam.includes("lyn") || awayTeam.includes("lyn");
			
			return isBarca || isLyn;
		}
		
		// Check for favorite esports team: FaZe
		if (event.sport === "esports") {
			const title = event.title.toLowerCase();
			return title.includes("faze");
		}
		
		// Check for golf tournaments with Norwegian players
		if (event.sport === "golf") {
			return event.norwegian === true && event.norwegianPlayers && event.norwegianPlayers.length > 0;
		}
		
		return false;
	}

	getRelativeTime(timeString) {
		if (!timeString) return "Soon";
		
		const now = new Date();
		const eventTime = new Date(timeString);
		const diffMs = eventTime - now;
		const diffHours = diffMs / (1000 * 60 * 60);
		const diffDays = diffMs / (1000 * 60 * 60 * 24);
		
		if (diffHours < 0) return "Started";
		if (diffHours < 1) {
			const mins = Math.round(diffHours * 60);
			return mins < 5 ? "Starting now" : `In ${mins} min`;
		}
		if (diffHours < 24) {
			const hours = Math.round(diffHours);
			return hours === 1 ? "In 1 hour" : `In ${hours} hours`;
		}
		if (diffDays < 2) return "Tomorrow";
		if (diffDays < 7) {
			return eventTime.toLocaleDateString('en-US', { weekday: 'long' });
		}
		return `In ${Math.round(diffDays)} days`;
	}
	
	getTeamLogo(teamName) {
		// Map common team names to logo URLs
		const logos = {
			'Barcelona': 'https://media.api-sports.io/football/teams/529.png',
			'FC Barcelona': 'https://media.api-sports.io/football/teams/529.png',
			'Real Madrid': 'https://media.api-sports.io/football/teams/541.png',
			'Manchester United': 'https://media.api-sports.io/football/teams/33.png',
			'Manchester City': 'https://media.api-sports.io/football/teams/50.png',
			'Liverpool': 'https://media.api-sports.io/football/teams/40.png',
			'Chelsea': 'https://media.api-sports.io/football/teams/49.png',
			'Arsenal': 'https://media.api-sports.io/football/teams/42.png',
			'Tottenham': 'https://media.api-sports.io/football/teams/47.png',
			'Lyn': 'https://upload.wikimedia.org/wikipedia/en/1/1c/FK_Lyn_Oslo_logo.svg',
			'FK Lyn': 'https://upload.wikimedia.org/wikipedia/en/1/1c/FK_Lyn_Oslo_logo.svg',
		};
		
		return logos[teamName] || null;
	}
	
	renderTimelineView() {
		const container = document.getElementById('eventsContainer');
		
		if (!this.allEvents || this.allEvents.length === 0) {
			container.innerHTML = `<div style="text-align: center; padding: 40px; color: #999;"><p>No events found.</p></div>`;
			return;
		}

		let filteredEvents = this.allEvents.filter(event => this.passesFilter(event));
		
		// Group events by day and time slot
		const eventsByDayAndTime = {};
		const days = new Set();
		const timeSlots = ['Morning\n(6-12)', 'Afternoon\n(12-18)', 'Evening\n(18-24)', 'Night\n(0-6)'];
		
		filteredEvents.forEach(event => {
			const date = new Date(event.time);
			const dayKey = date.toLocaleDateString('en-NO', { weekday: 'short', month: 'short', day: 'numeric' });
			const hour = date.getHours();
			
			let timeSlot;
			if (hour >= 6 && hour < 12) timeSlot = 0;
			else if (hour >= 12 && hour < 18) timeSlot = 1;
			else if (hour >= 18 && hour < 24) timeSlot = 2;
			else timeSlot = 3;
			
			days.add(dayKey);
			
			const key = `${dayKey}-${timeSlot}`;
			if (!eventsByDayAndTime[key]) eventsByDayAndTime[key] = [];
			eventsByDayAndTime[key].push(event);
		});
		
		const sortedDays = Array.from(days).slice(0, 7); // Show only next 7 days
		
		let timelineHTML = `
			<div class="timeline-wrapper">
				<div class="timeline-grid">
					<div class="timeline-header">
						<div class="timeline-corner"></div>
						${sortedDays.map(day => `<div class="timeline-day-header">${day}</div>`).join('')}
					</div>
		`;
		
		timeSlots.forEach((slot, slotIndex) => {
			timelineHTML += `
				<div class="timeline-row">
					<div class="timeline-time-label">${slot}</div>
			`;
			
			sortedDays.forEach(day => {
				const key = `${day}-${slotIndex}`;
				const events = eventsByDayAndTime[key] || [];
				
				timelineHTML += `<div class="timeline-cell">`;
				events.forEach(event => {
					const time = new Date(event.time).toLocaleTimeString('en-NO', { hour: '2-digit', minute: '2-digit', hour12: false });
					timelineHTML += `
						<div class="timeline-event ${event.sport}">
							<div class="timeline-event-time">${time}</div>
							<div class="timeline-event-title">${this.escapeHtml(event.title)}</div>
						</div>
					`;
				});
				timelineHTML += `</div>`;
			});
			
			timelineHTML += `</div>`;
		});
		
		timelineHTML += `</div></div>`; // Close timeline-grid and timeline-wrapper
		container.innerHTML = timelineHTML;
	}
	
	setViewMode(mode) {
		this.viewMode = mode;
		const viewBtns = document.querySelectorAll('.view-btn');
		
		viewBtns.forEach(btn => {
			if (btn.dataset.view === mode) {
				btn.classList.add('active');
			} else {
				btn.classList.remove('active');
			}
		});
		
		if (mode === 'timeline') {
			this.renderTimelineView();
		} else {
			this.renderFilteredEvents();
		}
	}

	formatEventTime(timeString) {
		if (!timeString) return "TBD";

		const date = new Date(timeString);

		// Return actual time of day in 24-hour format
		return date.toLocaleTimeString("en-NO", {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
			timeZone: "Europe/Oslo",
		});
	}

	renderStreamingInfo(streaming) {
		if (!streaming || streaming.length === 0) {
			return "";
		}

		const streamingBadges = streaming
			.slice(0, 3)
			.map((stream) => {
				const url = stream.url ? `href="${stream.url}" target="_blank"` : "";
				const tag = url ? "a" : "span";

				return `<${tag} ${url} style="
                display: inline-block;
                background: #f0f0f0;
                color: #666;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 0.7rem;
                margin-right: 6px;
                margin-top: 6px;
                text-decoration: none;
                border: 1px solid #ddd;
            ">${this.escapeHtml(stream.platform)}</${tag}>`;
			})
			.join("");

		return `<div style="margin-top: 8px;">${streamingBadges}</div>`;
	}

	escapeHtml(unsafe) {
		if (typeof unsafe !== "string") return "";
		return unsafe
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
	setTimeout(() => {
		try {
			// Always initialize SimpleDashboard for now
			console.log("Initializing Simple SportsDashboard...");
			window.simpleDashboard = new SimpleSportsDashboard();
		} catch (error) {
			console.error("Error initializing dashboard:", error);
			const container = document.getElementById("eventsContainer");
			if (container) {
				container.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #999;">
                        <p>Error loading dashboard. Please refresh the page.</p>
                    </div>
                `;
			}
		}
	}, 100);
});
