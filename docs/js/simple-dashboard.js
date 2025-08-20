// Simple Sports Dashboard for CALM design
class SimpleSportsDashboard {
	constructor() {
		this.api = new SportsAPI();
		this.currentFilter = "all";
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
		const filterButtons = document.querySelectorAll(".filter-btn");
		filterButtons.forEach((btn) => {
			btn.addEventListener("click", (e) => {
				// Remove active from all buttons
				filterButtons.forEach((b) => b.classList.remove("active"));
				// Add active to clicked button
				e.target.classList.add("active");

				this.currentFilter = e.target.dataset.filter;
				this.renderFilteredEvents();
			});
		});
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
				
				// Special handling for golf events with Norwegian players - make tee times PROMINENT
				const norwegianPlayersLine = event.sport === 'golf' && event.norwegianPlayers && event.norwegianPlayers.length
					? `<div class="norwegian-players" style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border: 2px solid #f59e0b; border-radius: 8px; padding: 12px; margin-top: 8px;">
						<div style="font-weight: 600; color: #b45309; margin-bottom: 8px; display: flex; align-items: center;">
							🇳🇴 Norwegian Players - Tee Times
						</div>
						${event.norwegianPlayers.map(player => {
							const teeTimeDisplay = player.teeTime 
								? `${this.escapeHtml(player.teeTime)}`
								: 'TBD - Times usually released 24-48hrs before';
							
							const teeTimeStyle = player.teeTime 
								? 'font-weight: 700; font-size: 1.1em; color: #dc2626; background: #fef2f2; padding: 4px 8px; border-radius: 4px; border: 1px solid #fca5a5;'
								: 'font-weight: 500; color: #6b7280; font-style: italic;';
								
							const featuredGroupLine = player.featuredGroup 
								? `<div style="background: #fbbf24; color: #92400e; padding: 3px 6px; border-radius: 3px; font-size: 0.75em; font-weight: 600; margin-top: 4px; display: inline-block;">
									📺 ${this.escapeHtml(player.featuredGroup.groupName)}
									${player.featuredGroup.coverage ? ` • ${this.escapeHtml(player.featuredGroup.coverage)}` : ''}
								</div>` : '';
								
							return `
								<div style="margin-bottom: 8px; padding: 8px; background: white; border-radius: 6px; border-left: 4px solid #f59e0b; ${player.featuredGroup ? 'box-shadow: 0 2px 4px rgba(251, 191, 36, 0.2);' : ''}">
									<div style="font-weight: 600; color: #1f2937; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
										<span>🏌️‍♂️ ${this.escapeHtml(player.name)}</span>
										${player.featuredGroup ? '<span style="font-size: 0.8em; color: #dc2626;">⭐ FEATURED</span>' : ''}
									</div>
									<div style="${teeTimeStyle}">
										⏰ ${teeTimeDisplay}
									</div>
									${player.startingTee ? `<div style="font-size: 0.8em; color: #6b7280; margin-top: 4px;">Starting from Tee ${player.startingTee}</div>` : ''}
									${featuredGroupLine}
									${player.featuredGroup && player.featuredGroup.players && player.featuredGroup.players.length > 1 ? 
										`<div style="font-size: 0.75em; color: #6b7280; margin-top: 4px;">Playing with: ${player.featuredGroup.players.filter(p => p !== player.name).map(p => this.escapeHtml(p)).join(', ')}</div>` : ''}
								</div>
							`;
						}).join('')}
						<div style="font-size: 0.85em; color: #6b7280; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
							📊 Field: ${event.totalPlayers} players total
							${event.link ? `<a href="${this.escapeHtml(event.link)}" target="_blank" style="margin-left: 12px; color: #f59e0b; text-decoration: none;">📖 View Leaderboard</a>` : ''}
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

		switch (this.currentFilter) {
			case "all":
				return true;
			case "today":
				return eventDate >= today && eventDate < tomorrow;
			case "week":
				return eventDate >= today && eventDate < weekEnd;
			case "favorites":
				return this.isFavoriteEvent(event);
			default:
				return true;
		}
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
