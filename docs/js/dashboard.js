// Dashboard controller for SportSync with tournament support and calendar view
class SportsDashboard {
    constructor() {
        this.api = new SportsAPI();
        this.lastUpdate = new Date();
        this.currentView = 'sports'; // 'sports', 'calendar', or 'api-sources'
        this.filters = {
            mode: 'all', // 'all', 'today', 'norway', 'streaming'
            sports: new Set(['football', 'golf', 'tennis', 'f1', 'chess', 'esports']),
            tournaments: new Set([
                'Premier League', 'Eliteserien', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1',
                'PGA Tour', 'DP World Tour', 'ATP Tour', 'WTA Tour',
                'Formula 1 2025', 'FIDE Grand Prix', 'Norway Chess', 'CS2 Major', 'IEM Pro League'
            ])
        };
        this.allSportsData = null;
        this.init();
    }

    async init() {
        this.setupViewToggle();
        this.setupFilters();
        this.setupSettings();
        await this.updateLastUpdatedTime();
        await this.loadDashboardView();
        
        // Refresh data every 30 minutes
        setInterval(() => {
            this.refreshCurrentView();
            this.updateLastUpdatedTime();
        }, 30 * 60 * 1000);
    }

    setupViewToggle() {
        const sportsBtn = document.getElementById('sportsViewBtn');
        const calendarBtn = document.getElementById('calendarViewBtn');
        const apiSourcesBtn = document.getElementById('apiSourcesBtn');
        const sportsView = document.getElementById('sportsView');
        const calendarView = document.getElementById('calendarView');
        const apiSourcesView = document.getElementById('apiSourcesView');

        const hideAllViews = () => {
            sportsView.classList.add('hidden');
            calendarView.classList.add('hidden');
            apiSourcesView.classList.add('hidden');
        };

        const removeAllActive = () => {
            sportsBtn.classList.remove('active');
            calendarBtn.classList.remove('active');
            apiSourcesBtn.classList.remove('active');
        };

        sportsBtn.addEventListener('click', () => {
            if (this.currentView !== 'sports') {
                this.currentView = 'sports';
                removeAllActive();
                hideAllViews();
                sportsBtn.classList.add('active');
                sportsView.classList.remove('hidden');
                this.loadSportsView();
            }
        });

        calendarBtn.addEventListener('click', () => {
            if (this.currentView !== 'calendar') {
                this.currentView = 'calendar';
                removeAllActive();
                hideAllViews();
                calendarBtn.classList.add('active');
                calendarView.classList.remove('hidden');
                this.loadCalendarView();
            }
        });

        apiSourcesBtn.addEventListener('click', () => {
            if (this.currentView !== 'api-sources') {
                this.currentView = 'api-sources';
                removeAllActive();
                hideAllViews();
                apiSourcesBtn.classList.add('active');
                apiSourcesView.classList.remove('hidden');
                this.loadApiSourcesView();
            }
        });
    }

    setupFilters() {
        // Setup filter chips
        const chips = {
            'allEventsChip': 'all',
            'todayChip': 'today', 
            'norwayChip': 'norway',
            'streamingChip': 'streaming'
        };

        Object.entries(chips).forEach(([chipId, mode]) => {
            const chip = document.getElementById(chipId);
            chip.addEventListener('click', () => {
                // Remove active from all chips
                Object.keys(chips).forEach(id => {
                    document.getElementById(id).classList.remove('active');
                });
                
                // Add active to clicked chip
                chip.classList.add('active');
                
                // Update filter and apply
                this.filters.mode = mode;
                this.applyFilters();
            });
        });
    }

    setupSettings() {
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsPanel = document.getElementById('settingsPanel');
        const settingsOverlay = document.getElementById('settingsOverlay');
        const closeSettings = document.getElementById('closeSettings');

        // Open settings
        settingsBtn.addEventListener('click', () => {
            settingsPanel.classList.add('open');
            settingsOverlay.classList.add('open');
        });

        // Close settings
        const closeSettingsPanel = () => {
            settingsPanel.classList.remove('open');
            settingsOverlay.classList.remove('open');
        };

        closeSettings.addEventListener('click', closeSettingsPanel);
        settingsOverlay.addEventListener('click', closeSettingsPanel);

        // Setup sports toggles
        ['football', 'golf', 'tennis', 'f1', 'chess', 'esports'].forEach(sport => {
            const checkbox = document.getElementById(`toggle-${sport}`);
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.filters.sports.add(sport);
                } else {
                    this.filters.sports.delete(sport);
                }
                this.applyFilters();
            });
        });

        // Setup tournament toggles
        const tournaments = [
            'premier-league', 'eliteserien', 'la-liga', 'serie-a', 'bundesliga', 'ligue-1',
            'pga-tour', 'dp-world-tour', 'atp-tour', 'wta-tour'
        ];
        
        const tournamentNames = {
            'premier-league': 'Premier League',
            'eliteserien': 'Eliteserien',
            'la-liga': 'La Liga',
            'serie-a': 'Serie A',
            'bundesliga': 'Bundesliga',
            'ligue-1': 'Ligue 1',
            'pga-tour': 'PGA Tour',
            'dp-world-tour': 'DP World Tour',
            'atp-tour': 'ATP Tour',
            'wta-tour': 'WTA Tour'
        };

        tournaments.forEach(tournament => {
            const checkbox = document.getElementById(`toggle-${tournament}`);
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    const tournamentName = tournamentNames[tournament];
                    if (e.target.checked) {
                        this.filters.tournaments.add(tournamentName);
                    } else {
                        this.filters.tournaments.delete(tournamentName);
                    }
                    this.applyFilters();
                });
            }
        });

        // Setup streaming preferences
        const streamingOnly = document.getElementById('show-streaming-only');
        streamingOnly.addEventListener('change', (e) => {
            this.filters.streamingOnly = e.target.checked;
            this.applyFilters();
        });

        const norwayPriority = document.getElementById('norway-priority');
        norwayPriority.addEventListener('change', (e) => {
            this.filters.norwayPriority = e.target.checked;
            this.applyFilters();
        });
    }

    applyFilters() {
        if (!this.allSportsData) return;

        if (this.currentView === 'dashboard') {
            this.renderFilteredSportsView();
            this.loadTodayHighlights();
            await this.loadWeeklyCalendar();
        }
    }

    async updateLastUpdatedTime() {
        try {
            // Try to get the last update time from GitHub Actions with cache busting
            const cacheBuster = new Date().getTime();
            const metaResponse = await fetch(`data/meta.json?v=${cacheBuster}`, {
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            if (metaResponse.ok) {
                const meta = await metaResponse.json();
                const lastUpdate = new Date(meta.lastUpdate);
                const timeString = lastUpdate.toLocaleTimeString('en-NO', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Europe/Oslo'
                });
                const dateString = lastUpdate.toLocaleDateString('en-NO', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'Europe/Oslo'
                });
                
                document.getElementById('lastUpdate').textContent = `${dateString} at ${timeString} (CEST) via GitHub Actions`;
                return;
            }
        } catch (error) {
            console.log('No metadata available, using current time');
        }
        
        // Fallback to current time
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-NO', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Oslo'
        });
        const dateString = now.toLocaleDateString('en-NO', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'Europe/Oslo'
        });
        
        document.getElementById('lastUpdate').textContent = `${dateString} at ${timeString} (CEST)`;
        this.lastUpdate = now;
    }

    async loadDashboardView() {
        const sports = [
            { id: 'football', method: 'fetchFootballEvents', name: 'Football' },
            { id: 'golf', method: 'fetchGolfEvents', name: 'Golf' },
            { id: 'tennis', method: 'fetchTennisEvents', name: 'Tennis' },
            { id: 'f1', method: 'fetchF1Events', name: 'Formula 1' },
            { id: 'chess', method: 'fetchChessEvents', name: 'Chess' },
            { id: 'esports', method: 'fetchEsportsEvents', name: 'Esports' }
        ];

        // Load all sports data and store for filtering
        const promises = sports.map(async sport => {
            try {
                const tournaments = await this.api[sport.method]();
                return { ...sport, tournaments };
            } catch (error) {
                console.error(`Error loading ${sport.name}:`, error);
                return { ...sport, tournaments: [] };
            }
        });

        this.allSportsData = await Promise.all(promises);
        this.renderFilteredSportsView();
        this.loadTodayHighlights();
        await this.loadWeeklyCalendar();
    }

    renderFilteredSportsView() {
        if (!this.allSportsData) return;

        this.allSportsData.forEach(sport => {
            const container = document.getElementById(`${sport.id}-content`);
            if (!this.filters.sports.has(sport.id)) {
                // Hide the entire sport card
                container.closest('.sport-card').style.display = 'none';
                return;
            } else {
                container.closest('.sport-card').style.display = 'block';
            }

            const filteredTournaments = this.filterTournaments(sport.tournaments);
            this.renderTournaments(container, filteredTournaments, sport.name);
        });
    }

    filterTournaments(tournaments) {
        return tournaments.filter(tournament => {
            // Tournament filter
            if (!this.filters.tournaments.has(tournament.tournament)) {
                return false;
            }

            // Filter events within tournament based on current mode
            let filteredEvents = tournament.events.filter(event => {
                return this.passesFilterMode(event);
            });

            // For ALL sports: if no events pass filters, show next upcoming event
            if (filteredEvents.length === 0 && tournament.events.length > 0) {
                // Find the next upcoming event (closest future date)
                const futureEvents = tournament.events.filter(event => {
                    const eventDate = new Date(event.time);
                    return eventDate > new Date();
                }).sort((a, b) => new Date(a.time) - new Date(b.time));
                
                if (futureEvents.length > 0) {
                    // For fallback, show next event regardless of other filters
                    filteredEvents = [futureEvents[0]];
                }
            }

            tournament.events = filteredEvents;
            return tournament.events.length > 0;
        });
    }

    passesFilterMode(event) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const eventDate = new Date(event.time);

        switch (this.filters.mode) {
            case 'all':
                return true;
            case 'today':
                return eventDate >= today && eventDate < tomorrow;
            case 'norway':
                return event.norwegian === true;
            case 'streaming':
                return event.streaming && event.streaming.length > 0;
            default:
                return true;
        }
    }

    async loadCalendarView() {
        const calendarGrid = document.getElementById('calendarGrid');
        const weekRange = document.getElementById('weekRange');
        
        // Show loading state
        calendarGrid.innerHTML = '<div class="loading"><div class="spinner"></div>Loading weekly calendar...</div>';
        
        try {
            const weeklyEvents = await this.api.getAllEventsForWeek();
            this.renderCalendarGrid(weeklyEvents);
            this.updateWeekRange();
        } catch (error) {
            console.error('Error loading calendar view:', error);
            calendarGrid.innerHTML = '<div style="text-align: center; padding: 40px; color: #e53e3e;">Error loading calendar data</div>';
        }
    }

    renderCalendarGrid(weeklyEvents) {
        const calendarGrid = document.getElementById('calendarGrid');
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const today = new Date();
        
        // Get dates for the week starting from today
        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            weekDates.push(date);
        }

        const dayColumns = weekDates.map((date, index) => {
            const dateKey = date.toISOString().split('T')[0];
            const dayName = date.toLocaleDateString('en-NO', { weekday: 'long' });
            const dayNumber = date.getDate();
            const monthName = date.toLocaleDateString('en-NO', { month: 'short' });
            const isToday = dateKey === today.toISOString().split('T')[0];
            
            const dayEvents = weeklyEvents[dateKey]?.events || [];
            
            const eventsHtml = dayEvents.map(event => `
                <div class="calendar-event ${event.sport}">
                    <div class="calendar-event-time">${event.timeFormatted || 'TBD'}</div>
                    <div class="calendar-event-title">${this.escapeHtml(event.title)}</div>
                    <div class="calendar-event-meta">${this.escapeHtml(event.tournament || event.meta)}</div>
                </div>
            `).join('');

            return `
                <div class="day-column">
                    <div class="day-header ${isToday ? 'today' : ''}">
                        <div>${dayName}</div>
                        <div>${monthName} ${dayNumber}</div>
                    </div>
                    <div class="day-events">
                        ${eventsHtml || '<div style="text-align: center; color: #a0aec0; font-size: 0.8rem; padding: 20px;">No events</div>'}
                    </div>
                </div>
            `;
        });

        calendarGrid.innerHTML = dayColumns.join('');
    }

    updateWeekRange() {
        const weekRange = document.getElementById('weekRange');
        const today = new Date();
        const weekEnd = new Date(today);
        weekEnd.setDate(today.getDate() + 6);
        
        const startString = today.toLocaleDateString('en-NO', {
            month: 'short',
            day: 'numeric',
            timeZone: 'Europe/Oslo'
        });
        
        const endString = weekEnd.toLocaleDateString('en-NO', {
            month: 'short',
            day: 'numeric',
            timeZone: 'Europe/Oslo'
        });
        
        weekRange.textContent = `${startString} - ${endString}`;
    }

    // Legacy method - now handled by loadSportsView and filtering
    async loadSportTournaments(sportId, methodName, sportName) {
        // This method is now handled by the filtering system
        return;
    }

    renderTournaments(container, tournaments, sportName) {
        if (!tournaments || tournaments.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #718096;">
                    No upcoming ${sportName.toLowerCase()} events found
                </div>
            `;
            return;
        }

        const tournamentsHtml = tournaments.map(tournament => {
            const eventsHtml = tournament.events.map(event => {
                const streamingHtml = this.renderStreamingInfo(event.streaming);
                
                return `
                    <div class="event-item">
                        <div class="event-title">${this.escapeHtml(event.title)}</div>
                        <div class="event-meta">
                            <span class="event-time">${this.escapeHtml(event.timeFormatted || event.time)}</span>
                            ${event.venue ? `<span>📍 ${this.escapeHtml(event.venue)}</span>` : ''}
                            ${event.norwegian ? '<span>🇳🇴</span>' : ''}
                        </div>
                        ${streamingHtml}
                    </div>
                `;
            }).join('');

            return `
                <div class="tournament-section">
                    <div class="tournament-header">${this.escapeHtml(tournament.tournament)}</div>
                    <div class="event-list">${eventsHtml}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = tournamentsHtml;
    }

    renderStreamingInfo(streaming) {
        if (!streaming || streaming.length === 0) {
            return '';
        }

        // Sort streaming platforms with Norwegian platforms first if priority is enabled
        let sortedStreaming = [...streaming];
        if (this.filters.norwayPriority) {
            const norwegianPlatforms = ['tv2', 'viaplay', 'discovery', 'nrk'];
            sortedStreaming.sort((a, b) => {
                const aIsNorwegian = norwegianPlatforms.includes(a.type);
                const bIsNorwegian = norwegianPlatforms.includes(b.type);
                if (aIsNorwegian && !bIsNorwegian) return -1;
                if (!aIsNorwegian && bIsNorwegian) return 1;
                return 0;
            });
        }

        const streamingBadges = sortedStreaming.map(stream => {
            const url = stream.url ? `href="${stream.url}" target="_blank"` : '';
            const tag = url ? 'a' : 'span';
            
            return `<${tag} class="streaming-platform ${stream.type}" ${url}>
                ${this.escapeHtml(stream.platform)}
            </${tag}>`;
        }).join('');

        return `<div class="event-streaming">${streamingBadges}</div>`;
    }

    renderError(container, message) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #e53e3e;">
                ⚠️ ${this.escapeHtml(message)}
                <br><small style="color: #718096; margin-top: 8px; display: block;">
                    Showing cached data if available
                </small>
            </div>
        `;
    }

    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Method to manually refresh current view
    async refreshCurrentView() {
        if (this.currentView === 'dashboard') {
            // Show loading state for sports cards
            const sportIds = ['football', 'golf', 'tennis', 'f1', 'chess', 'esports'];
            sportIds.forEach(id => {
                const container = document.getElementById(`${id}-content`);
                if (container && this.filters.sports.has(id)) {
                    container.innerHTML = `
                        <div class="loading">
                            <div class="spinner"></div>
                            Refreshing...
                        </div>
                    `;
                }
            });
            
            await this.loadDashboardView();
        } else if (this.currentView === 'debug') {
            await this.loadApiSourcesView();
        }
    }

    // Method to manually refresh data
    async refresh() {
        await this.refreshCurrentView();
        await this.updateLastUpdatedTime();
    }

    // Method to get Norwegian time for events
    formatTimeForNorway(utcTime) {
        if (!utcTime) return 'TBD';
        
        const date = new Date(utcTime);
        return date.toLocaleString('en-NO', {
            timeZone: 'Europe/Oslo',
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    async loadApiSourcesView() {
        const content = document.getElementById('apiSourcesContent');
        content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading API sources...</div>';

        try {
            // Load metadata from all sports data files
            const [footballMeta, golfMeta, tennisMeta, f1Meta, chessMeta, esportsMeta] = await Promise.all([
                this.api.fetchFootballEvents(),
                this.api.fetchGolfEvents(),
                this.api.fetchTennisEvents(),
                this.api.fetchF1Events(),
                this.api.fetchChessEvents(),
                this.api.fetchEsportsEvents()
            ]);

            const apiSources = [
                {
                    name: 'Football Data',
                    icon: '⚽',
                    endpoint: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard',
                    source: footballMeta.source || 'ESPN API',
                    lastUpdated: footballMeta.lastUpdated,
                    status: 'active',
                    description: 'Premier League, La Liga, and international football matches',
                    dataFile: '/SportSync/data/football.json',
                    rawData: footballMeta
                },
                {
                    name: 'Golf Tournaments',
                    icon: '🏌️',
                    endpoint: 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
                    source: golfMeta.source || 'ESPN API',
                    lastUpdated: golfMeta.lastUpdated,
                    status: 'active',
                    description: 'PGA Tour and DP World Tour events',
                    dataFile: '/SportSync/data/golf.json',
                    rawData: golfMeta
                },
                {
                    name: 'Tennis Events',
                    icon: '🎾',
                    endpoint: 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard',
                    source: tennisMeta.source || 'ESPN API',
                    lastUpdated: tennisMeta.lastUpdated,
                    status: 'active',
                    description: 'ATP and WTA tournaments with Casper Ruud focus',
                    dataFile: '/SportSync/data/tennis.json',
                    rawData: tennisMeta
                },
                {
                    name: 'Formula 1',
                    icon: '🏎️',
                    endpoint: 'https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard',
                    source: f1Meta.source || 'ESPN Racing API',
                    lastUpdated: f1Meta.lastUpdated,
                    status: 'active',
                    description: 'F1 race calendar and upcoming Grand Prix',
                    dataFile: '/SportSync/data/f1.json',
                    rawData: f1Meta
                },
                {
                    name: 'Chess Tournaments',
                    icon: '♟️',
                    endpoint: 'Curated Tournament Schedule',
                    source: chessMeta.source || 'Chess Tournament Calendar',
                    lastUpdated: chessMeta.lastUpdated,
                    status: 'active',
                    description: 'Major chess tournaments with Magnus Carlsen',
                    dataFile: '/SportSync/data/chess.json',
                    rawData: chessMeta
                },
                {
                    name: 'CS2 Esports',
                    icon: '🎮',
                    endpoint: 'Tournament Schedule with Norwegian Focus',
                    source: esportsMeta.source || 'CS2 Tournament Calendar',
                    lastUpdated: esportsMeta.lastUpdated,
                    status: 'active',
                    description: 'Counter-Strike 2 matches featuring FaZe Clan and rain',
                    dataFile: '/SportSync/data/esports.json',
                    rawData: esportsMeta
                }
            ];

            const html = apiSources.map((source, index) => {
                const lastUpdateTime = source.lastUpdated ? 
                    new Date(source.lastUpdated).toLocaleString('en-NO', { timeZone: 'Europe/Oslo' }) : 
                    'Unknown';

                // Get the raw data for debugging
                const rawData = source.rawData ? this.formatJsonForDisplay(JSON.stringify(source.rawData, null, 2)) : 'No raw data available';

                return `
                    <div class="api-source-card">
                        <div class="api-source-header">
                            <div class="api-source-name">
                                <span>${source.icon}</span>
                                ${source.name}
                            </div>
                            <div class="api-status ${source.status}">${source.status}</div>
                        </div>
                        <div class="api-source-details">
                            <div class="api-detail-item">
                                <div class="api-detail-label">Source</div>
                                <div class="api-detail-value">${source.source}</div>
                            </div>
                            <div class="api-detail-item">
                                <div class="api-detail-label">Last Updated</div>
                                <div class="api-detail-value">${lastUpdateTime}</div>
                            </div>
                        </div>
                        <div class="api-detail-item">
                            <div class="api-detail-label">Description</div>
                            <div class="api-detail-value" style="font-family: inherit;">${source.description}</div>
                        </div>
                        <div class="api-detail-item">
                            <div class="api-detail-label">API Endpoint</div>
                            <div class="api-endpoint">${source.endpoint}</div>
                        </div>
                        <div class="api-detail-item">
                            <div class="api-detail-label">Data File</div>
                            <div class="api-endpoint"><a href="${source.dataFile}" target="_blank" style="color: #4a5568; text-decoration: none;">${source.dataFile}</a></div>
                        </div>
                        <div class="raw-data-section">
                            <button class="raw-data-toggle" onclick="window.sportsDashboard.toggleRawData(${index})">
                                <span class="toggle-icon" id="toggle-icon-${index}">▶</span>
                                Raw JSON Data (Debug)
                            </button>
                            <div class="raw-data-content" id="raw-data-${index}">
                                <pre class="json-data">${rawData}</pre>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            content.innerHTML = html;
        } catch (error) {
            console.error('Error loading API sources:', error);
            content.innerHTML = `
                <div class="error-message">
                    <h3>Error Loading API Sources</h3>
                    <p>Unable to load API source information. Please try again later.</p>
                </div>
            `;
        }
    }

    toggleRawData(index) {
        const content = document.getElementById(`raw-data-${index}`);
        const toggle = document.querySelector(`button[onclick="window.sportsDashboard.toggleRawData(${index})"]`);
        const icon = document.getElementById(`toggle-icon-${index}`);
        
        if (content.classList.contains('expanded')) {
            content.classList.remove('expanded');
            toggle.classList.remove('expanded');
            icon.textContent = '▶';
        } else {
            content.classList.add('expanded');
            toggle.classList.add('expanded');
            icon.textContent = '▼';
        }
    }

    formatJsonForDisplay(jsonString) {
        // Simple JSON syntax highlighting
        return jsonString
            .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
                let cls = 'json-number';
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'json-key';
                    } else {
                        cls = 'json-string';
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'json-boolean';
                } else if (/null/.test(match)) {
                    cls = 'json-null';
                }
                return '<span class="' + cls + '">' + match + '</span>';
            });
    }

    loadTodayHighlights() {
        const container = document.getElementById('today-highlights');
        if (!container || !this.allSportsData) return;
        
        try {
            const today = new Date();
            const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const todayEnd = new Date(todayStart);
            todayEnd.setDate(todayEnd.getDate() + 1);
            
            // Collect today's events from already loaded sports data
            const todayEvents = [];
            
            this.allSportsData.forEach(sport => {
                sport.tournaments.forEach(tournament => {
                    tournament.events.forEach(event => {
                        const eventDate = new Date(event.time);
                        if (eventDate >= todayStart && eventDate < todayEnd) {
                            todayEvents.push({
                                ...event,
                                sport: sport.id,
                                tournament: tournament.tournament,
                                sportName: sport.name,
                                timeFormatted: this.api.formatDateTime(event.time)
                            });
                        }
                    });
                });
            });
            
            // Sort by time
            todayEvents.sort((a, b) => new Date(a.time) - new Date(b.time));
            
            if (todayEvents.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #718096;">
                        <div style="font-size: 2rem; margin-bottom: 10px;">📅</div>
                        <div>No events scheduled for today</div>
                        <div style="font-size: 0.9rem; margin-top: 8px; color: #a0aec0;">Check back tomorrow or view the weekly calendar below</div>
                    </div>
                `;
                return;
            }
            
            const highlightsHtml = todayEvents.slice(0, 6).map(event => {
                const streamingHtml = this.renderStreamingInfo(event.streaming);
                return `
                    <div class="highlight-event">
                        <div class="event-title" style="font-weight: 600; margin-bottom: 4px;">${this.escapeHtml(event.title)}</div>
                        <div class="event-meta" style="font-size: 0.85rem; color: #718096; margin-bottom: 8px;">
                            <span style="font-weight: 600; color: #667eea;">${this.escapeHtml(event.timeFormatted)}</span>
                            <span style="margin: 0 8px;">•</span>
                            <span>${this.escapeHtml(event.tournament)}</span>
                            ${event.venue ? `<span style="margin: 0 8px;">•</span><span>📍 ${this.escapeHtml(event.venue)}</span>` : ''}
                            ${event.norwegian ? ' <span>🇳🇴</span>' : ''}
                        </div>
                        ${streamingHtml}
                    </div>
                `;
            }).join('');
            
            container.innerHTML = `<div class="highlight-events">${highlightsHtml}</div>`;
            
        } catch (error) {
            console.error('Error loading today\'s highlights:', error);
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #e53e3e;">Error loading today\'s highlights</div>';
        }
    }
    
    async loadWeeklyCalendar() {
        const calendarGrid = document.getElementById('calendarGrid');
        const weekRange = document.getElementById('weekRange');
        if (!calendarGrid) return;
        
        // Show loading state
        calendarGrid.innerHTML = '<div class="loading"><div class="spinner"></div>Loading weekly calendar...</div>';
        
        try {
            const weeklyEvents = await this.api.getAllEventsForWeek();
            this.renderCalendarGrid(weeklyEvents);
            this.updateWeekRange();
        } catch (error) {
            console.error('Error loading weekly calendar:', error);
            calendarGrid.innerHTML = '<div style="text-align: center; padding: 40px; color: #e53e3e;">Error loading calendar data</div>';
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.sportsDashboard = new SportsDashboard();
});

// Add keyboard shortcut for manual refresh (Ctrl+R or Cmd+R)
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        if (window.sportsDashboard) {
            window.sportsDashboard.refresh();
        }
    }
});

// Add service worker registration for offline support (future enhancement)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Register service worker when available
        // navigator.serviceWorker.register('/sw.js');
    });
}