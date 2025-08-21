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
					homeTeam: ev.homeTeam || null,
					awayTeam: ev.awayTeam || null,
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

		// Group events by day for adding dividers
		let lastDateString = null;
		
		const eventsHTML = filteredEvents
			.map((event, index) => {
				const eventDate = new Date(event.time);
				const dateString = eventDate.toLocaleDateString('en-US', { 
					weekday: 'long', 
					month: 'long', 
					day: 'numeric'
				});
				
				// Add day divider if this is a new day
				let dayDivider = '';
				if (dateString !== lastDateString) {
					// Get relative day label
					const today = new Date();
					today.setHours(0, 0, 0, 0);
					const tomorrow = new Date(today);
					tomorrow.setDate(tomorrow.getDate() + 1);
					const eventDay = new Date(eventDate);
					eventDay.setHours(0, 0, 0, 0);
					
					let dayLabel = dateString;
					if (eventDay.getTime() === today.getTime()) {
						dayLabel = `Today, ${dateString}`;
					} else if (eventDay.getTime() === tomorrow.getTime()) {
						dayLabel = `Tomorrow, ${dateString}`;
					}
					
					dayDivider = `
						<div class="day-divider">
							<span class="day-label">${dayLabel}</span>
						</div>
					`;
					lastDateString = dateString;
				}
				
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
							
							const headshot = this.getGolferHeadshot(player.name);
							
							return `
								<div class="tee-time-player">
									<div class="player-info">
										${headshot 
											? `<img src="${headshot}" alt="${this.escapeHtml(player.name)}" class="golfer-headshot">` 
											: `<div class="golfer-headshot-placeholder">⛳</div>`
										}
										<span class="player-name">${this.escapeHtml(player.name)}</span>
									</div>
									<span class="player-time">${teeTimeDisplay}</span>
								</div>
							`;
						}).join('')}
						${this.getGolfLeaderboardLink(event)}
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
				${dayDivider}
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
                        ${this.renderStreamingInfo(event.streaming, event.sport, event.tournament)}
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
	
	getGolferHeadshot(golferName) {
		if (!golferName) return null;
		
		const normalized = golferName.trim();
		
		// Map golfer names to PGA Tour headshot URLs
		const headshots = {
			// Norwegian golfers
			'Viktor Hovland': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_46717.jpg',
			'Viktor HOVLAND': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_46717.jpg',
			'Kristoffer Reitan': null, // No official headshot available
			'Kristoffer REITAN': null, // No official headshot available  
			'REITAN, Kristoffer': null, // No official headshot available
			'Andreas Halvorsen': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_40226.jpg',
			'Andreas HALVORSEN': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_40226.jpg',
			'HALVORSEN, Andreas': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_40226.jpg',
			// Top PGA Tour players
			'Scottie Scheffler': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_46046.jpg',
			'Rory McIlroy': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_28237.jpg',
			'Patrick Cantlay': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_35450.jpg',
			'Xander Schauffele': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_48081.jpg',
			'Collin Morikawa': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_50525.jpg',
			'Justin Thomas': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_33448.jpg',
			'Jon Rahm': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_46970.jpg',
			'Jordan Spieth': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_34046.jpg',
			'Hideki Matsuyama': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_32839.jpg',
			'Ludvig Åberg': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_52955.jpg',
			'Ludvig Aberg': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_52955.jpg',
			'Tommy Fleetwood': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_30911.jpg',
			'Shane Lowry': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_33204.jpg',
			'Matt Fitzpatrick': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_40098.jpg',
			'Cameron Young': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_50633.jpg',
			'Sungjae Im': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_39971.jpg',
			'Russell Henley': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_32366.jpg',
			'Brian Harman': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_27644.jpg',
			'Sam Burns': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_47504.jpg',
			'Keegan Bradley': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_33141.jpg',
			'Corey Conners': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_39997.jpg',
			'Robert MacIntyre': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_45150.jpg',
			'Justin Rose': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_22405.jpg',
			'Sepp Straka': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_36910.jpg',
			'Akshay Bhatia': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_53165.jpg',
			'Nick Taylor': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_25632.jpg',
			'Chris Gotterup': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_55182.jpg',
			'Jacob Bridgeman': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_55790.jpg',
			'Harry Hall': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_51766.jpg',
			'Andrew Novak': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_46565.jpg',
			'Harris English': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_34709.jpg',
			'Maverick McNealy': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_46442.jpg',
			'Ben Griffin': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_49924.jpg',
			'J.J. Spaun': 'https://pga-tour-res.cloudinary.com/image/upload/c_fill,d_headshots_default.png,f_auto,g_face:center,h_120,q_auto,w_120/headshots_39324.jpg',
			
			// European Tour players
			'Alex Noren': 'https://images.europeantour.com/media/img/players/160x160/27365.jpg',
			'Rasmus Højgaard': 'https://images.europeantour.com/media/img/players/160x160/55175.jpg',
			'Rasmus Hojgaard': 'https://images.europeantour.com/media/img/players/160x160/55175.jpg',
			'Nicolai Højgaard': 'https://images.europeantour.com/media/img/players/160x160/55176.jpg',
			'Nicolai Hojgaard': 'https://images.europeantour.com/media/img/players/160x160/55176.jpg',
		};
		
		return headshots[normalized] || null;
	}
	
	getTeamLogo(teamName) {
		if (!teamName) return null;
		
		// Normalize team name for matching
		const normalized = teamName.trim();
		
		// Map common team names to logo URLs using API-Sports logos
		const logos = {
			// Premier League
			'Arsenal': 'https://media.api-sports.io/football/teams/42.png',
			'Arsenal FC': 'https://media.api-sports.io/football/teams/42.png',
			'Aston Villa': 'https://media.api-sports.io/football/teams/66.png',
			'Bournemouth': 'https://media.api-sports.io/football/teams/35.png',
			'AFC Bournemouth': 'https://media.api-sports.io/football/teams/35.png',
			'Brentford': 'https://media.api-sports.io/football/teams/55.png',
			'Brentford FC': 'https://media.api-sports.io/football/teams/55.png',
			'Brighton': 'https://media.api-sports.io/football/teams/51.png',
			'Brighton & Hove Albion': 'https://media.api-sports.io/football/teams/51.png',
			'Chelsea': 'https://media.api-sports.io/football/teams/49.png',
			'Chelsea FC': 'https://media.api-sports.io/football/teams/49.png',
			'Crystal Palace': 'https://media.api-sports.io/football/teams/52.png',
			'Everton': 'https://media.api-sports.io/football/teams/45.png',
			'Everton FC': 'https://media.api-sports.io/football/teams/45.png',
			'Fulham': 'https://media.api-sports.io/football/teams/36.png',
			'Fulham FC': 'https://media.api-sports.io/football/teams/36.png',
			'Ipswich': 'https://media.api-sports.io/football/teams/57.png',
			'Ipswich Town': 'https://media.api-sports.io/football/teams/57.png',
			'Leicester': 'https://media.api-sports.io/football/teams/46.png',
			'Leicester City': 'https://media.api-sports.io/football/teams/46.png',
			'Liverpool': 'https://media.api-sports.io/football/teams/40.png',
			'Liverpool FC': 'https://media.api-sports.io/football/teams/40.png',
			'Manchester City': 'https://media.api-sports.io/football/teams/50.png',
			'Man City': 'https://media.api-sports.io/football/teams/50.png',
			'Manchester United': 'https://media.api-sports.io/football/teams/33.png',
			'Man United': 'https://media.api-sports.io/football/teams/33.png',
			'Newcastle': 'https://media.api-sports.io/football/teams/34.png',
			'Newcastle United': 'https://media.api-sports.io/football/teams/34.png',
			'Nottingham Forest': 'https://media.api-sports.io/football/teams/65.png',
			"Nott'm Forest": 'https://media.api-sports.io/football/teams/65.png',
			'Southampton': 'https://media.api-sports.io/football/teams/41.png',
			'Southampton FC': 'https://media.api-sports.io/football/teams/41.png',
			'Tottenham': 'https://media.api-sports.io/football/teams/47.png',
			'Tottenham Hotspur': 'https://media.api-sports.io/football/teams/47.png',
			'Spurs': 'https://media.api-sports.io/football/teams/47.png',
			'West Ham': 'https://media.api-sports.io/football/teams/48.png',
			'West Ham United': 'https://media.api-sports.io/football/teams/48.png',
			'Wolves': 'https://media.api-sports.io/football/teams/39.png',
			'Wolverhampton': 'https://media.api-sports.io/football/teams/39.png',
			'Wolverhampton Wanderers': 'https://media.api-sports.io/football/teams/39.png',
			
			// Championship teams that might appear
			'Leeds': 'https://media.api-sports.io/football/teams/63.png',
			'Leeds United': 'https://media.api-sports.io/football/teams/63.png',
			'Sunderland': 'https://media.api-sports.io/football/teams/62.png',
			'Sunderland AFC': 'https://media.api-sports.io/football/teams/62.png',
			'Burnley': 'https://media.api-sports.io/football/teams/44.png',
			'Burnley FC': 'https://media.api-sports.io/football/teams/44.png',
			
			// La Liga
			'Barcelona': 'https://media.api-sports.io/football/teams/529.png',
			'FC Barcelona': 'https://media.api-sports.io/football/teams/529.png',
			'Barça': 'https://media.api-sports.io/football/teams/529.png',
			'Real Madrid': 'https://media.api-sports.io/football/teams/541.png',
			'Atletico Madrid': 'https://media.api-sports.io/football/teams/530.png',
			'Atlético Madrid': 'https://media.api-sports.io/football/teams/530.png',
			'Sevilla': 'https://media.api-sports.io/football/teams/536.png',
			'Sevilla FC': 'https://media.api-sports.io/football/teams/536.png',
			'Real Betis': 'https://media.api-sports.io/football/teams/543.png',
			'Betis': 'https://media.api-sports.io/football/teams/543.png',
			'Real Sociedad': 'https://media.api-sports.io/football/teams/548.png',
			'Villarreal': 'https://media.api-sports.io/football/teams/533.png',
			'Villarreal CF': 'https://media.api-sports.io/football/teams/533.png',
			'Athletic Bilbao': 'https://media.api-sports.io/football/teams/531.png',
			'Athletic Club': 'https://media.api-sports.io/football/teams/531.png',
			'Valencia': 'https://media.api-sports.io/football/teams/532.png',
			'Valencia CF': 'https://media.api-sports.io/football/teams/532.png',
			'Getafe': 'https://media.api-sports.io/football/teams/546.png',
			'Getafe CF': 'https://media.api-sports.io/football/teams/546.png',
			'Girona': 'https://media.api-sports.io/football/teams/547.png',
			'Girona FC': 'https://media.api-sports.io/football/teams/547.png',
			'Rayo Vallecano': 'https://media.api-sports.io/football/teams/728.png',
			'Celta Vigo': 'https://media.api-sports.io/football/teams/538.png',
			'RC Celta': 'https://media.api-sports.io/football/teams/538.png',
			'Mallorca': 'https://media.api-sports.io/football/teams/798.png',
			'RCD Mallorca': 'https://media.api-sports.io/football/teams/798.png',
			'Alaves': 'https://media.api-sports.io/football/teams/542.png',
			'Alavés': 'https://media.api-sports.io/football/teams/542.png',
			'Deportivo Alavés': 'https://media.api-sports.io/football/teams/542.png',
			'Las Palmas': 'https://media.api-sports.io/football/teams/715.png',
			'UD Las Palmas': 'https://media.api-sports.io/football/teams/715.png',
			'Espanyol': 'https://media.api-sports.io/football/teams/540.png',
			'RCD Espanyol': 'https://media.api-sports.io/football/teams/540.png',
			'Valladolid': 'https://media.api-sports.io/football/teams/720.png',
			'Real Valladolid': 'https://media.api-sports.io/football/teams/720.png',
			'Leganes': 'https://media.api-sports.io/football/teams/539.png',
			'Leganés': 'https://media.api-sports.io/football/teams/539.png',
			'CD Leganés': 'https://media.api-sports.io/football/teams/539.png',
			'Osasuna': 'https://media.api-sports.io/football/teams/727.png',
			'CA Osasuna': 'https://media.api-sports.io/football/teams/727.png',
			'Levante': 'https://media.api-sports.io/football/teams/539.png',
			'Levante UD': 'https://media.api-sports.io/football/teams/539.png',
			'Elche': 'https://media.api-sports.io/football/teams/797.png',
			'Elche CF': 'https://media.api-sports.io/football/teams/797.png',
			
			// Norwegian teams - OBOS-ligaen
			'Lyn': 'https://tmssl.akamaized.net/images/wappen/head/175.png',
			'FK Lyn': 'https://tmssl.akamaized.net/images/wappen/head/175.png',
			'Lyn 1896': 'https://tmssl.akamaized.net/images/wappen/head/175.png',
			'FK Lyn Oslo': 'https://tmssl.akamaized.net/images/wappen/head/175.png',
			'Skeid': 'https://tmssl.akamaized.net/images/wappen/head/6469.png',
			'Skeid Menn 1': 'https://tmssl.akamaized.net/images/wappen/head/6469.png',
			'Skeid Fotball': 'https://tmssl.akamaized.net/images/wappen/head/6469.png',
			'Vålerenga': 'https://tmssl.akamaized.net/images/wappen/head/369.png',
			'Vålerenga Fotball': 'https://tmssl.akamaized.net/images/wappen/head/369.png',
			'Stabæk': 'https://tmssl.akamaized.net/images/wappen/head/2053.png',
			'Stabæk Fotball': 'https://tmssl.akamaized.net/images/wappen/head/2053.png',
			'Mjøndalen': 'https://tmssl.akamaized.net/images/wappen/head/3678.png',
			'Mjøndalen IF': 'https://tmssl.akamaized.net/images/wappen/head/3678.png',
			'Sandnes Ulf': 'https://tmssl.akamaized.net/images/wappen/head/3822.png',
			'Kongsvinger': 'https://tmssl.akamaized.net/images/wappen/head/3677.png',
			'Kongsvinger IL': 'https://tmssl.akamaized.net/images/wappen/head/3677.png',
			'Start': 'https://tmssl.akamaized.net/images/wappen/head/1070.png',
			'IK Start': 'https://tmssl.akamaized.net/images/wappen/head/1070.png',
			'Ranheim': 'https://tmssl.akamaized.net/images/wappen/head/7236.png',
			'Ranheim IL': 'https://tmssl.akamaized.net/images/wappen/head/7236.png',
			'Sogndal': 'https://tmssl.akamaized.net/images/wappen/head/2093.png',
			'Sogndal IL': 'https://tmssl.akamaized.net/images/wappen/head/2093.png',
			'Egersund': 'https://tmssl.akamaized.net/images/wappen/head/57869.png',
			'Egersund IK': 'https://tmssl.akamaized.net/images/wappen/head/57869.png',
			'Egersund Menn Senior A': 'https://tmssl.akamaized.net/images/wappen/head/57869.png',
			'Bryne': 'https://tmssl.akamaized.net/images/wappen/head/9394.png',
			'Bryne FK': 'https://tmssl.akamaized.net/images/wappen/head/9394.png',
			'Moss': 'https://tmssl.akamaized.net/images/wappen/head/30728.png',
			'Moss FK': 'https://tmssl.akamaized.net/images/wappen/head/30728.png',
			'Raufoss': 'https://tmssl.akamaized.net/images/wappen/head/7238.png',
			'Åsane': 'https://tmssl.akamaized.net/images/wappen/head/21070.png',
			'Åsane Fotball': 'https://tmssl.akamaized.net/images/wappen/head/21070.png',
			'Levanger': 'https://tmssl.akamaized.net/images/wappen/head/57868.png',
			'Levanger FK': 'https://tmssl.akamaized.net/images/wappen/head/57868.png',
			
			// Norwegian teams - Eliteserien
			'Bodø/Glimt': 'https://media.api-sports.io/football/teams/305.png',
			'FK Bodø/Glimt': 'https://media.api-sports.io/football/teams/305.png',
			'Molde': 'https://media.api-sports.io/football/teams/304.png',
			'Molde FK': 'https://media.api-sports.io/football/teams/304.png',
			'Rosenborg': 'https://media.api-sports.io/football/teams/436.png',
			'Rosenborg BK': 'https://media.api-sports.io/football/teams/436.png',
			'Viking': 'https://media.api-sports.io/football/teams/308.png',
			'Viking FK': 'https://media.api-sports.io/football/teams/308.png',
			'Lillestrøm': 'https://media.api-sports.io/football/teams/306.png',
			'Lillestrøm SK': 'https://media.api-sports.io/football/teams/306.png',
			'Brann': 'https://media.api-sports.io/football/teams/303.png',
			'SK Brann': 'https://media.api-sports.io/football/teams/303.png',
			'Strømsgodset': 'https://media.api-sports.io/football/teams/307.png',
			'Strømsgodset IF': 'https://media.api-sports.io/football/teams/307.png',
			'Haugesund': 'https://media.api-sports.io/football/teams/302.png',
			'FK Haugesund': 'https://media.api-sports.io/football/teams/302.png',
			'Odd': 'https://media.api-sports.io/football/teams/435.png',
			'Odds BK': 'https://media.api-sports.io/football/teams/435.png',
			'Sarpsborg': 'https://media.api-sports.io/football/teams/439.png',
			'Sarpsborg 08': 'https://media.api-sports.io/football/teams/439.png',
			'Tromsø': 'https://media.api-sports.io/football/teams/301.png',
			'Tromsø IL': 'https://media.api-sports.io/football/teams/301.png',
			'HamKam': 'https://tmssl.akamaized.net/images/wappen/head/2092.png',
			'Sandefjord': 'https://media.api-sports.io/football/teams/2093.png',
			'KFUM Oslo': 'https://media.api-sports.io/football/teams/12758.png',
			'Kristiansund': 'https://media.api-sports.io/football/teams/415.png',
			'Kristiansund BK': 'https://media.api-sports.io/football/teams/415.png',
			'Fredrikstad': 'https://media.api-sports.io/football/teams/440.png',
			'Fredrikstad FK': 'https://media.api-sports.io/football/teams/440.png',
			'Aalesund': 'https://media.api-sports.io/football/teams/2091.png',
			'Aalesunds FK': 'https://media.api-sports.io/football/teams/2091.png'
		};
		
		return logos[normalized] || null;
	}
	
	getGolfLeaderboardLink(event) {
		if (!event || event.sport !== 'golf') return '';
		
		// If there's already a link from the API, use it
		if (event.link) {
			return `
				<div style="margin-top: 12px;">
					<a href="${this.escapeHtml(event.link)}" target="_blank" rel="noopener noreferrer" 
					   style="display: inline-flex; align-items: center; gap: 6px; color: var(--muted); text-decoration: none; font-size: 0.85rem; font-weight: 500; transition: color 0.2s ease;"
					   onmouseover="this.style.color='var(--text-secondary)';"
					   onmouseout="this.style.color='var(--muted)';">
						<span>Leaderboard</span>
						<span style="font-size: 0.75rem; opacity: 0.7;">↗</span>
					</a>
				</div>
			`;
		}
		
		// Otherwise, generate automatic link based on tour type
		const tourName = event.tournament || event.meta || '';
		let leaderboardUrl = null;
		
		if (tourName.toLowerCase().includes('pga tour')) {
			// For PGA Tour events, link to the main leaderboard page
			leaderboardUrl = 'https://www.pgatour.com/leaderboard';
		} else if (tourName.toLowerCase().includes('dp world') || tourName.toLowerCase().includes('european')) {
			// For DP World Tour (formerly European Tour)
			leaderboardUrl = 'https://www.europeantour.com/dpworld-tour/leaderboard/';
		} else if (tourName.toLowerCase().includes('liv')) {
			// For LIV Golf
			leaderboardUrl = 'https://www.livgolf.com/leaderboard';
		} else if (tourName.toLowerCase().includes('korn ferry')) {
			// For Korn Ferry Tour
			leaderboardUrl = 'https://www.pgatour.com/korn-ferry-tour/leaderboard';
		} else if (tourName.toLowerCase().includes('champions')) {
			// For PGA Tour Champions
			leaderboardUrl = 'https://www.pgatour.com/champions/leaderboard';
		}
		
		if (leaderboardUrl) {
			return `
				<div style="margin-top: 12px;">
					<a href="${leaderboardUrl}" target="_blank" rel="noopener noreferrer" 
					   style="display: inline-flex; align-items: center; gap: 6px; color: var(--muted); text-decoration: none; font-size: 0.85rem; font-weight: 500; transition: color 0.2s ease;"
					   onmouseover="this.style.color='var(--text-secondary)';"
					   onmouseout="this.style.color='var(--muted)';">
						<span>Leaderboard</span>
						<span style="font-size: 0.75rem; opacity: 0.7;">↗</span>
					</a>
				</div>
			`;
		}
		
		return '';
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

	renderStreamingInfo(streaming, sport, tournament) {
		// Map Norwegian streaming services based on sport and tournament
		let services = [];
		
		if (sport === 'football') {
			if (tournament && tournament.toLowerCase().includes('premier league')) {
				services.push({ platform: 'Viaplay', url: 'https://viaplay.no' });
			} else if (tournament && (tournament.toLowerCase().includes('obos') || tournament.toLowerCase().includes('eliteserien'))) {
				services.push({ platform: 'TV2 Play', url: 'https://play.tv2.no' });
			} else if (tournament && tournament.toLowerCase().includes('la liga')) {
				services.push({ platform: 'TV2 Play', url: 'https://play.tv2.no' });
			}
		} else if (sport === 'golf') {
			if (tournament && tournament.toLowerCase().includes('dp world')) {
				services.push({ platform: 'TV2 Play', url: 'https://play.tv2.no' });
			} else if (tournament && tournament.toLowerCase().includes('pga')) {
				services.push({ platform: 'Discovery+', url: 'https://www.discoveryplus.no' });
			}
		} else if (sport === 'tennis') {
			services.push({ platform: 'Discovery+', url: 'https://www.discoveryplus.no' });
		} else if (sport === 'f1' || sport === 'formula1') {
			services.push({ platform: 'Viaplay', url: 'https://viaplay.no' });
		}
		
		// Use provided streaming data if available, otherwise use our mappings
		const streamingSources = (streaming && streaming.length > 0) ? streaming : services;
		
		if (!streamingSources || streamingSources.length === 0) {
			return "";
		}

		const streamingBadges = streamingSources
			.slice(0, 3)
			.map((stream) => {
				const url = stream.url ? `href="${stream.url}" target="_blank"` : "";
				const tag = url ? "a" : "span";
				
				return `<${tag} ${url} style="
                display: inline-block;
                background: transparent;
                color: var(--muted);
                padding: 3px 8px;
                border: 1px solid var(--border);
                border-radius: 10px;
                font-size: 0.65rem;
                font-weight: 400;
                margin-right: 5px;
                margin-top: 12px;
                text-decoration: none;
                opacity: 0.7;
                transition: all 0.2s;
            " onmouseover="this.style.opacity='1'; this.style.borderColor='var(--text-secondary)'" onmouseout="this.style.opacity='0.7'; this.style.borderColor='var(--border)'">${this.escapeHtml(stream.platform)}</${tag}>`;
			})
			.join("");

		return `<div class="streaming-badges">${streamingBadges}</div>`;
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
