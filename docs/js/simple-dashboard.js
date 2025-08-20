// Simple Sports Dashboard for CALM design
class SimpleSportsDashboard {
	constructor() {
		this.api = new SportsAPI();
		this.currentFilter = "all";
		this.selectedSports = new Set(); // Track multiple selected sports
		this.allEvents = [];
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
				return "Football";
			case "golf":
				return "Golf";
			case "tennis":
				return "Tennis";
			case "f1":
			case "formula1":
				return "Formula 1";
			case "chess":
				return "Chess";
			case "esports":
				return "Esports";
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
			.map((event) => {
				const streamingHTML = this.renderStreamingInfo(event.streaming);
				const dayDisplay = this.formatEventDay(event.time);
				const timeDisplay = this.formatEventTime(event.time);

				const participantsLine =
					event.participants && event.participants.length
						? `<div>👥 ${this.escapeHtml(event.participants.join(", "))}</div>`
						: "";
				
				// Special handling for golf events with Norwegian players - CALM design
				const norwegianPlayersLine = event.sport === 'golf' && event.norwegianPlayers && event.norwegianPlayers.length
					? `<div style="border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin-top: 8px; background: var(--card-bg);">
						<div style="font-weight: 500; color: var(--text); margin-bottom: 8px;">
							🇳🇴 Norwegian Players
						</div>
						${event.norwegianPlayers.map(player => {
							const teeTimeDisplay = player.teeTime 
								? `${this.escapeHtml(player.teeTime)}`
								: 'TBD';
							
							return `
								<div style="margin-bottom: 6px; padding-bottom: 6px; ${event.norwegianPlayers.indexOf(player) < event.norwegianPlayers.length - 1 ? 'border-bottom: 1px solid var(--border);' : ''}">
									<div style="font-weight: 500; color: var(--text);">
										${this.escapeHtml(player.name)}
									</div>
									<div style="font-weight: 600; margin-top: 2px;">
										${teeTimeDisplay}
									</div>
									${player.startingTee ? `<div style="font-size: 0.85em; color: var(--muted); margin-top: 2px;">Tee ${player.startingTee}</div>` : ''}
									${player.featuredGroup ? `<div style="font-size: 0.8em; color: var(--muted); margin-top: 2px;">📺 ${this.escapeHtml(player.featuredGroup.groupName)}</div>` : ''}
								</div>
							`;
						}).join('')}
						<div style="font-size: 0.85em; color: var(--muted); margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--border);">
							Field: ${event.totalPlayers} players
							${event.link ? `<a href="${this.escapeHtml(event.link)}" target="_blank" style="margin-left: 12px; color: var(--muted); text-decoration: none;">View leaderboard →</a>` : ''}
						</div>
					</div>`
					: "";
					
				return `
                <div class="event-card">
                    <div class="event-header">
                        <div class="event-day-time">
                            <div class="event-day">${this.escapeHtml(
															dayDisplay
														)}</div>
                            <div class="event-time">${this.escapeHtml(
															timeDisplay
														)}</div>
                        </div>
                        <div class="event-sport-badge ${event.sport}">
                            ${this.escapeHtml(event.sportName)}
                        </div>
                    </div>
                    <div class="event-content">
                        <h3 class="event-title">${this.escapeHtml(
													event.title
												)}</h3>
                        <div class="event-details">
                            <div>${this.escapeHtml(event.tournament)}</div>
                            ${
															event.venue
																? `<div>📍 ${this.escapeHtml(
																		event.venue
																  )}</div>`
																: ""
														}
                            ${event.norwegian ? "<div>🇳🇴 Norway</div>" : ""}
                            ${participantsLine}
                            ${norwegianPlayersLine}
                        </div>
                        ${streamingHTML}
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

	formatEventDay(timeString) {
		if (!timeString) return "TBD";

		const date = new Date(timeString);
		const now = new Date();

		const eventDay = new Date(
			date.getFullYear(),
			date.getMonth(),
			date.getDate()
		);
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const tomorrow = new Date(today);
		tomorrow.setDate(today.getDate() + 1);

		if (eventDay.getTime() === today.getTime()) return "Today";
		if (eventDay.getTime() === tomorrow.getTime()) return "Tomorrow";

		const timeDiff = eventDay - today;
		const daysDiff = Math.round(timeDiff / (1000 * 60 * 60 * 24));

		if (daysDiff > 0 && daysDiff <= 7) {
			return date.toLocaleDateString("en-NO", { weekday: "long" });
		}

		return date.toLocaleDateString("en-NO", {
			weekday: "short",
			month: "short",
			day: "numeric",
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
