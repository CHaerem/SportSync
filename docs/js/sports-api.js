// Sports API integration for fetching live data with tournament support
class SportsAPI {
    constructor() {
        this.apiKeys = {
            // Add your API keys here when available
            theSportsDB: null,
            apiSports: null,
            sportsData: null
        };
    }

    // Football API - multiple leagues support
    async fetchFootballEvents() {
        try {
            // Try pre-fetched data first
            const cachedResponse = await fetch('data/football.json');
            if (cachedResponse.ok) {
                const cachedData = await cachedResponse.json();
                console.log('Using cached football data from:', cachedData.lastUpdated);
                return this.formatTournamentData(cachedData.tournaments || []);
            }
        } catch (error) {
            console.log('No cached football data, trying live API...');
        }
        
        try {
            // Fetch multiple leagues in parallel
            const leagues = [
                { id: '4328', name: 'Premier League' },
                { id: '4335', name: 'La Liga' },
                { id: '4331', name: 'Serie A' },
                { id: '4332', name: 'Bundesliga' },
                { id: '4334', name: 'Ligue 1' },
                { id: '4370', name: 'Eliteserien' }
            ];

            const promises = leagues.map(async league => {
                try {
                    const response = await fetch(
                        `https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=${league.id}`
                    );
                    const data = await response.json();
                    
                    return {
                        tournament: league.name,
                        events: this.formatFootballEvents(data.events || [])
                    };
                } catch (error) {
                    console.warn(`Error fetching ${league.name}:`, error);
                    return { tournament: league.name, events: [] };
                }
            });

            const results = await Promise.all(promises);
            return results.filter(league => league.events.length > 0);
        } catch (error) {
            console.error('Error fetching football events:', error);
            return this.getMockFootballTournaments();
        }
    }

    // Golf events - multiple tours support
    async fetchGolfEvents() {
        try {
            // Try pre-fetched data first
            const cachedResponse = await fetch('data/golf.json');
            if (cachedResponse.ok) {
                const cachedData = await cachedResponse.json();
                console.log('Using cached golf data from:', cachedData.lastUpdated);
                return this.formatTournamentData(cachedData.tournaments || []);
            }
        } catch (error) {
            console.log('No cached golf data, trying live API...');
        }
        
        try {
            // Fetch PGA Tour and DP World Tour data
            const tours = [
                { url: 'http://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard', name: 'PGA Tour' },
                { url: 'http://site.api.espn.com/apis/site/v2/sports/golf/eur/scoreboard', name: 'DP World Tour' }
            ];

            const promises = tours.map(async tour => {
                try {
                    const response = await fetch(tour.url);
                    const data = await response.json();
                    
                    return {
                        tournament: tour.name,
                        events: this.formatGolfEvents(data.events || [])
                    };
                } catch (error) {
                    console.warn(`Error fetching ${tour.name}:`, error);
                    return { tournament: tour.name, events: [] };
                }
            });

            const results = await Promise.all(promises);
            return results.filter(tour => tour.events.length > 0);
        } catch (error) {
            console.error('Error fetching golf events:', error);
            return this.getMockGolfTournaments();
        }
    }

    // Tennis events - multiple tour support
    async fetchTennisEvents() {
        try {
            // Try pre-fetched data first
            const cachedResponse = await fetch('data/tennis.json');
            if (cachedResponse.ok) {
                const cachedData = await cachedResponse.json();
                console.log('Using cached tennis data from:', cachedData.lastUpdated);
                return this.formatTournamentData(cachedData.tournaments || []);
            }
        } catch (error) {
            console.log('No cached tennis data, trying live API...');
        }
        
        try {
            // ATP and WTA events
            const tours = [
                { id: '4424', name: 'ATP Tour' },
                { id: '4425', name: 'WTA Tour' }
            ];

            const promises = tours.map(async tour => {
                try {
                    const response = await fetch(
                        `https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=${tour.id}`
                    );
                    const data = await response.json();
                    
                    return {
                        tournament: tour.name,
                        events: this.formatTennisEvents(data.events || [])
                    };
                } catch (error) {
                    console.warn(`Error fetching ${tour.name}:`, error);
                    return { tournament: tour.name, events: [] };
                }
            });

            const results = await Promise.all(promises);
            return results.filter(tour => tour.events.length > 0);
        } catch (error) {
            console.error('Error fetching tennis events:', error);
            return this.getMockTennisTournaments();
        }
    }

    // Formula 1 events - sessions breakdown
    async fetchF1Events() {
        try {
            // Try pre-fetched data first
            const cachedResponse = await fetch('data/f1.json');
            if (cachedResponse.ok) {
                const cachedData = await cachedResponse.json();
                console.log('Using cached F1 data from:', cachedData.lastUpdated);
                return this.formatTournamentData(cachedData.tournaments || []);
            }
        } catch (error) {
            console.log('No cached F1 data, trying live API...');
        }
        
        try {
            const response = await fetch(
                'http://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard'
            );
            const data = await response.json();
            
            return [{
                tournament: 'Formula 1 2025',
                events: this.formatF1Events(data.events || [])
            }];
        } catch (error) {
            console.error('Error fetching F1 events:', error);
            return this.getMockF1Tournaments();
        }
    }

    // Chess events - tournament categories
    async fetchChessEvents() {
        try {
            const cachedResponse = await fetch('data/chess.json');
            if (cachedResponse.ok) {
                const cachedData = await cachedResponse.json();
                console.log('Using cached chess data from:', cachedData.lastUpdated);
                return this.formatTournamentData(cachedData.tournaments || []);
            }
        } catch (error) {
            console.log('No cached chess data, using fallback...');
        }
        
        return this.getMockChessTournaments();
    }

    // Esports events - game categories
    async fetchEsportsEvents() {
        try {
            const cachedResponse = await fetch('data/esports.json');
            if (cachedResponse.ok) {
                const cachedData = await cachedResponse.json();
                console.log('Using cached esports data from:', cachedData.lastUpdated);
                return this.formatTournamentData(cachedData.tournaments || []);
            }
        } catch (error) {
            console.log('No cached esports data, using fallback...');
        }
        
        return this.getMockEsportsTournaments();
    }

    // Format helpers
    formatTournamentData(tournaments) {
        return tournaments.map(tournament => ({
            tournament: tournament.name,
            events: tournament.events.map(event => ({
                title: event.title,
                meta: event.meta,
                time: this.formatDateTime(event.time),
                venue: event.venue,
                sport: event.sport || 'unknown',
                streaming: event.streaming || [],
                norwegian: event.norwegian || false,
                homeTeam: event.homeTeam,
                awayTeam: event.awayTeam
            }))
        }));
    }
    
    formatFootballEvents(events) {
        return events.slice(0, 5).map(event => ({
            title: `${event.strHomeTeam} vs ${event.strAwayTeam}`,
            meta: event.strLeague || 'Football',
            time: event.dateEvent,
            venue: event.strVenue,
            homeTeam: event.strHomeTeam,
            awayTeam: event.strAwayTeam,
            league: event.strLeague,
            sport: 'football'
        }));
    }

    formatGolfEvents(events) {
        return events.slice(0, 3).map(event => ({
            title: event.name || 'Golf Tournament',
            meta: event.shortName || 'Golf',
            time: event.date,
            venue: event.competitions?.[0]?.venue?.fullName || 'TBD',
            sport: 'golf'
        }));
    }

    formatTennisEvents(events) {
        return events.slice(0, 4).map(event => ({
            title: `${event.strPlayer || 'Player'} vs ${event.strPlayer2 || 'Player'}`,
            meta: event.strLeague || 'Tennis',
            time: event.dateEvent,
            venue: event.strVenue,
            sport: 'tennis'
        }));
    }

    formatF1Events(events) {
        return events.slice(0, 4).map(event => ({
            title: event.name || 'F1 Race',
            meta: event.shortName || 'Formula 1',
            time: event.date,
            venue: event.competitions?.[0]?.venue?.fullName || 'TBD',
            sport: 'formula1'
        }));
    }

    formatDateTime(date, time) {
        if (!date) return 'TBD';
        
        const eventDate = new Date(date);
        const now = new Date();
        const timeDiff = eventDate - now;
        const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 0) return 'Today';
        if (daysDiff === 1) return 'Tomorrow';
        if (daysDiff > 0 && daysDiff <= 7) return `${daysDiff} days`;
        
        return eventDate.toLocaleDateString('en-NO', {
            month: 'short',
            day: 'numeric',
            hour: time ? '2-digit' : undefined,
            minute: time ? '2-digit' : undefined
        });
    }

    // Get events for calendar view
    async getAllEventsForWeek() {
        try {
            const allSports = await Promise.all([
                this.fetchFootballEvents(),
                this.fetchGolfEvents(),
                this.fetchTennisEvents(),
                this.fetchF1Events(),
                this.fetchChessEvents(),
                this.fetchEsportsEvents()
            ]);

            const events = [];
            const sportNames = ['football', 'golf', 'tennis', 'formula1', 'chess', 'esports'];

            allSports.forEach((sportData, sportIndex) => {
                const sportName = sportNames[sportIndex];
                sportData.forEach(tournament => {
                    tournament.events.forEach(event => {
                        events.push({
                            ...event,
                            sport: sportName,
                            tournament: tournament.tournament
                        });
                    });
                });
            });

            return this.groupEventsByDay(events);
        } catch (error) {
            console.error('Error getting weekly events:', error);
            return this.getMockWeeklyEvents();
        }
    }

    groupEventsByDay(events) {
        const days = {};
        const now = new Date();
        
        // Initialize 7 days starting from today
        for (let i = 0; i < 7; i++) {
            const date = new Date(now);
            date.setDate(now.getDate() + i);
            const dateKey = date.toISOString().split('T')[0];
            days[dateKey] = {
                date: date,
                events: []
            };
        }

        events.forEach(event => {
            if (event.time && event.time !== 'TBD') {
                const eventDate = new Date(event.time);
                const dateKey = eventDate.toISOString().split('T')[0];
                
                if (days[dateKey]) {
                    days[dateKey].events.push({
                        ...event,
                        timeFormatted: eventDate.toLocaleTimeString('en-NO', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Europe/Oslo'
                        })
                    });
                }
            }
        });

        return days;
    }

    // Mock data with tournament structure and streaming info
    getMockFootballTournaments() {
        return [
            {
                tournament: 'Premier League',
                events: [
                    {
                        title: 'Arsenal vs Manchester City',
                        meta: 'Premier League',
                        time: new Date(Date.now() + 86400000).toISOString(),
                        venue: 'Emirates Stadium',
                        sport: 'football',
                        streaming: [
                            { platform: 'Viaplay', url: 'https://viaplay.no', type: 'viaplay' },
                            { platform: 'Sky Sports', url: null, type: 'sky' }
                        ],
                        norwegian: false
                    },
                    {
                        title: 'Liverpool vs Chelsea',
                        meta: 'Premier League',
                        time: new Date(Date.now() + 172800000).toISOString(),
                        venue: 'Anfield',
                        sport: 'football',
                        streaming: [
                            { platform: 'Viaplay', url: 'https://viaplay.no', type: 'viaplay' },
                            { platform: 'NBC Sports', url: null, type: 'nbc' }
                        ],
                        norwegian: false
                    }
                ]
            },
            {
                tournament: 'Eliteserien',
                events: [
                    {
                        title: 'Brann vs Rosenborg',
                        meta: 'Eliteserien',
                        time: new Date(Date.now() + 259200000).toISOString(),
                        venue: 'Brann Stadion',
                        sport: 'football',
                        streaming: [
                            { platform: 'TV2 Play', url: 'https://play.tv2.no', type: 'tv2' },
                            { platform: 'Discovery+', url: 'https://discoveryplus.no', type: 'discovery' }
                        ],
                        norwegian: true
                    }
                ]
            },
            {
                tournament: 'La Liga',
                events: [
                    {
                        title: 'Real Madrid vs Barcelona',
                        meta: 'La Liga',
                        time: new Date(Date.now() + 345600000).toISOString(),
                        venue: 'Santiago Bernabéu',
                        sport: 'football',
                        streaming: [
                            { platform: 'Viaplay', url: 'https://viaplay.no', type: 'viaplay' },
                            { platform: 'ESPN+', url: null, type: 'espn' }
                        ],
                        norwegian: false
                    }
                ]
            }
        ];
    }

    getMockGolfTournaments() {
        return [
            {
                tournament: 'PGA Tour',
                events: [
                    {
                        title: 'The Players Championship',
                        meta: 'PGA Tour',
                        time: new Date(Date.now() + 172800000).toISOString(),
                        venue: 'TPC Sawgrass',
                        sport: 'golf',
                        streaming: [
                            { platform: 'Discovery+', url: 'https://discoveryplus.no', type: 'discovery' },
                            { platform: 'Golf Channel', url: null, type: 'golf' }
                        ],
                        norwegian: false
                    },
                    {
                        title: 'Arnold Palmer Invitational',
                        meta: 'PGA Tour',
                        time: new Date(Date.now() + 604800000).toISOString(),
                        venue: 'Bay Hill Club',
                        sport: 'golf',
                        streaming: [
                            { platform: 'Discovery+', url: 'https://discoveryplus.no', type: 'discovery' },
                            { platform: 'NBC Sports', url: null, type: 'nbc' }
                        ],
                        norwegian: false
                    }
                ]
            },
            {
                tournament: 'DP World Tour',
                events: [
                    {
                        title: 'Dubai Desert Classic',
                        meta: 'DP World Tour',
                        time: new Date(Date.now() + 432000000).toISOString(),
                        venue: 'Emirates Golf Club',
                        sport: 'golf',
                        streaming: [
                            { platform: 'Discovery+', url: 'https://discoveryplus.no', type: 'discovery' },
                            { platform: 'Sky Sports', url: null, type: 'sky' }
                        ],
                        norwegian: false
                    }
                ]
            }
        ];
    }

    getMockTennisTournaments() {
        return [
            {
                tournament: 'ATP Masters 1000',
                events: [
                    {
                        title: 'Casper Ruud vs Novak Djokovic',
                        meta: 'ATP Masters 1000',
                        time: new Date(Date.now() + 86400000).toISOString(),
                        venue: 'Indian Wells',
                        sport: 'tennis',
                        streaming: [
                            { platform: 'Discovery+', url: 'https://discoveryplus.no', type: 'discovery' },
                            { platform: 'Tennis Channel', url: null, type: 'tennis' }
                        ],
                        norwegian: true
                    },
                    {
                        title: 'Carlos Alcaraz vs Daniil Medvedev',
                        meta: 'ATP Masters 1000',
                        time: new Date(Date.now() + 172800000).toISOString(),
                        venue: 'Indian Wells',
                        sport: 'tennis',
                        streaming: [
                            { platform: 'Discovery+', url: 'https://discoveryplus.no', type: 'discovery' },
                            { platform: 'ESPN', url: null, type: 'espn' }
                        ],
                        norwegian: false
                    }
                ]
            },
            {
                tournament: 'WTA 1000',
                events: [
                    {
                        title: 'Iga Swiatek vs Aryna Sabalenka',
                        meta: 'WTA 1000',
                        time: new Date(Date.now() + 259200000).toISOString(),
                        venue: 'Indian Wells',
                        sport: 'tennis',
                        streaming: [
                            { platform: 'Discovery+', url: 'https://discoveryplus.no', type: 'discovery' },
                            { platform: 'WTA TV', url: null, type: 'wta' }
                        ],
                        norwegian: false
                    }
                ]
            }
        ];
    }

    getMockF1Tournaments() {
        return [
            {
                tournament: 'Formula 1 2025',
                events: [
                    {
                        title: 'Bahrain Grand Prix',
                        meta: 'Formula 1 2025',
                        time: new Date(Date.now() + 604800000).toISOString(),
                        venue: 'Bahrain International Circuit',
                        sport: 'formula1',
                        streaming: [
                            { platform: 'Viaplay', url: 'https://viaplay.no', type: 'viaplay' },
                            { platform: 'F1 TV', url: 'https://f1tv.formula1.com', type: 'f1tv' }
                        ],
                        norwegian: false
                    },
                    {
                        title: 'Saudi Arabian Grand Prix',
                        meta: 'Formula 1 2025',
                        time: new Date(Date.now() + 1209600000).toISOString(),
                        venue: 'Jeddah Corniche Circuit',
                        sport: 'formula1',
                        streaming: [
                            { platform: 'Viaplay', url: 'https://viaplay.no', type: 'viaplay' },
                            { platform: 'Sky Sports F1', url: null, type: 'sky' }
                        ],
                        norwegian: false
                    }
                ]
            }
        ];
    }

    getMockChessTournaments() {
        return [
            {
                tournament: 'FIDE Grand Prix',
                events: [
                    {
                        title: 'Magnus Carlsen vs Hikaru Nakamura',
                        meta: 'FIDE Grand Prix',
                        time: new Date(Date.now() + 86400000).toISOString(),
                        venue: 'Chess.com',
                        sport: 'chess',
                        streaming: [
                            { platform: 'Chess.com', url: 'https://chess.com/tv', type: 'chess' },
                            { platform: 'Twitch', url: 'https://twitch.tv/chess', type: 'twitch' }
                        ],
                        norwegian: true
                    }
                ]
            },
            {
                tournament: 'Norway Chess',
                events: [
                    {
                        title: 'Norway Chess 2025',
                        meta: 'Super Tournament',
                        time: new Date(Date.now() + 7776000000).toISOString(),
                        venue: 'Stavanger',
                        sport: 'chess',
                        streaming: [
                            { platform: 'NRK', url: 'https://nrk.no', type: 'nrk' },
                            { platform: 'Chess24', url: 'https://chess24.com', type: 'chess24' }
                        ],
                        norwegian: true
                    }
                ]
            }
        ];
    }

    getMockEsportsTournaments() {
        return [
            {
                tournament: 'CS2 Major',
                events: [
                    {
                        title: 'FaZe Clan vs G2 Esports',
                        meta: 'CS2 Major',
                        time: new Date(Date.now() + 86400000).toISOString(),
                        venue: 'Copenhagen Arena',
                        sport: 'esports',
                        streaming: [
                            { platform: 'Twitch', url: 'https://twitch.tv/esl_csgo', type: 'twitch' },
                            { platform: 'YouTube', url: 'https://youtube.com/@ESL', type: 'youtube' }
                        ],
                        norwegian: false
                    }
                ]
            },
            {
                tournament: 'LoL Worlds',
                events: [
                    {
                        title: 'League of Legends World Championship',
                        meta: 'LoL Worlds 2025',
                        time: new Date(Date.now() + 15552000000).toISOString(),
                        venue: 'London, UK',
                        sport: 'esports',
                        streaming: [
                            { platform: 'Twitch', url: 'https://twitch.tv/riotgames', type: 'twitch' },
                            { platform: 'YouTube', url: 'https://youtube.com/@lolesports', type: 'youtube' }
                        ],
                        norwegian: false
                    }
                ]
            },
            {
                tournament: 'Valorant Champions',
                events: [
                    {
                        title: 'Valorant Champions 2025',
                        meta: 'VCT Champions',
                        time: new Date(Date.now() + 12960000000).toISOString(),
                        venue: 'Los Angeles',
                        sport: 'esports',
                        streaming: [
                            { platform: 'Twitch', url: 'https://twitch.tv/valorant', type: 'twitch' },
                            { platform: 'YouTube', url: 'https://youtube.com/@valorantesports', type: 'youtube' }
                        ],
                        norwegian: false
                    }
                ]
            }
        ];
    }

    getMockWeeklyEvents() {
        const events = {};
        const now = new Date();
        
        for (let i = 0; i < 7; i++) {
            const date = new Date(now);
            date.setDate(now.getDate() + i);
            const dateKey = date.toISOString().split('T')[0];
            
            events[dateKey] = {
                date: date,
                events: i < 3 ? [
                    {
                        title: 'Sample Event',
                        sport: 'football',
                        tournament: 'Premier League',
                        timeFormatted: '15:00'
                    }
                ] : []
            };
        }
        
        return events;
    }
}