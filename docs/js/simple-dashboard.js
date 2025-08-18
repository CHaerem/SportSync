// Simple Sports Dashboard for CALM design
class SimpleSportsDashboard {
    constructor() {
        this.api = new SportsAPI();
        this.currentFilter = 'all';
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
        const filterButtons = document.querySelectorAll('.filter-btn');
        filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Remove active from all buttons
                filterButtons.forEach(b => b.classList.remove('active'));
                // Add active to clicked button
                e.target.classList.add('active');
                
                this.currentFilter = e.target.dataset.filter;
                this.renderFilteredEvents();
            });
        });
    }

    async updateLastUpdatedTime() {
        try {
            const metaResponse = await fetch('/SportSync/data/meta.json?t=' + Date.now());
            if (metaResponse.ok) {
                const meta = await metaResponse.json();
                const lastUpdate = new Date(meta.lastUpdate);
                const timeString = lastUpdate.toLocaleString('en-NO', {
                    weekday: 'short',
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Europe/Oslo'
                });
                
                document.getElementById('lastUpdate').textContent = timeString;
                return;
            }
        } catch (error) {
            console.log('No metadata available, using current time');
        }
        
        const now = new Date();
        const timeString = now.toLocaleString('en-NO', {
            weekday: 'short',
            month: 'short',
            day: 'numeric', 
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Oslo'
        });
        
        document.getElementById('lastUpdate').textContent = timeString;
    }

    async loadAllEvents() {
        const container = document.getElementById('eventsContainer');
        
        try {
            // Load all sports data
            const [football, golf, tennis, f1, chess, esports] = await Promise.all([
                this.api.fetchFootballEvents(),
                this.api.fetchGolfEvents(), 
                this.api.fetchTennisEvents(),
                this.api.fetchF1Events(),
                this.api.fetchChessEvents(),
                this.api.fetchEsportsEvents()
            ]);

            // Combine all events into one simple list
            this.allEvents = [];
            
            const sportsData = [
                { data: football, sport: 'football', name: 'Football' },
                { data: golf, sport: 'golf', name: 'Golf' },
                { data: tennis, sport: 'tennis', name: 'Tennis' },
                { data: f1, sport: 'formula1', name: 'Formula 1' },
                { data: chess, sport: 'chess', name: 'Chess' },
                { data: esports, sport: 'esports', name: 'Esports' }
            ];

            sportsData.forEach(sportInfo => {
                sportInfo.data.forEach(tournament => {
                    tournament.events.forEach(event => {
                        this.allEvents.push({
                            title: event.title,
                            time: event.time,
                            timeFormatted: this.formatEventTime(event.time),
                            sport: sportInfo.sport,
                            sportName: sportInfo.name,
                            tournament: tournament.tournament,
                            venue: event.venue,
                            norwegian: event.norwegian || false,
                            streaming: event.streaming || []
                        });
                    });
                });
            });

            // Sort all events by time
            this.allEvents.sort((a, b) => new Date(a.time) - new Date(b.time));
            
            this.renderFilteredEvents();
            
        } catch (error) {
            console.error('Error loading events:', error);
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #999;">
                    <p>Unable to load events right now.</p>
                    <p style="font-size: 0.9rem; margin-top: 10px;">Please check your connection and try again.</p>
                </div>
            `;
        }
    }

    renderFilteredEvents() {
        const container = document.getElementById('eventsContainer');
        
        if (!this.allEvents || this.allEvents.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #999;">
                    <p>No events found.</p>
                </div>
            `;
            return;
        }

        let filteredEvents = this.allEvents.filter(event => this.passesFilter(event));
        
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

        const eventsHTML = filteredEvents.map(event => {
            const streamingHTML = this.renderStreamingInfo(event.streaming);
            const dayDisplay = this.formatEventDay(event.time);
            const timeDisplay = this.formatEventTime(event.time);
            
            return `
                <div class="event-card">
                    <div class="event-header">
                        <div class="event-day-time">
                            <div class="event-day">${this.escapeHtml(dayDisplay)}</div>
                            <div class="event-time">${this.escapeHtml(timeDisplay)}</div>
                        </div>
                        <div class="event-sport-badge ${event.sport}">
                            ${this.escapeHtml(event.sportName)}
                        </div>
                    </div>
                    <div class="event-content">
                        <h3 class="event-title">${this.escapeHtml(event.title)}</h3>
                        <div class="event-details">
                            <div>${this.escapeHtml(event.tournament)}</div>
                            ${event.venue ? `<div>📍 ${this.escapeHtml(event.venue)}</div>` : ''}
                            ${event.norwegian ? '<div>🇳🇴 Norway</div>' : ''}
                        </div>
                        ${streamingHTML}
                    </div>
                </div>
            `;
        }).join('');

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
            case 'all':
                return true;
            case 'today':
                return eventDate >= today && eventDate < tomorrow;
            case 'week':
                return eventDate >= today && eventDate < weekEnd;
            default:
                return true;
        }
    }

    formatEventTime(timeString) {
        if (!timeString) return 'TBD';
        
        const date = new Date(timeString);
        
        // Return actual time of day in 24-hour format
        return date.toLocaleTimeString('en-NO', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Europe/Oslo'
        });
    }

    formatEventDay(timeString) {
        if (!timeString) return 'TBD';
        
        const date = new Date(timeString);
        const now = new Date();
        
        const eventDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        
        if (eventDay.getTime() === today.getTime()) return 'Today';
        if (eventDay.getTime() === tomorrow.getTime()) return 'Tomorrow';
        
        const timeDiff = eventDay - today;
        const daysDiff = Math.round(timeDiff / (1000 * 60 * 60 * 24));
        
        if (daysDiff > 0 && daysDiff <= 7) {
            return date.toLocaleDateString('en-NO', { weekday: 'long' });
        }
        
        return date.toLocaleDateString('en-NO', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    }

    renderStreamingInfo(streaming) {
        if (!streaming || streaming.length === 0) {
            return '';
        }

        const streamingBadges = streaming.slice(0, 3).map(stream => {
            const url = stream.url ? `href="${stream.url}" target="_blank"` : '';
            const tag = url ? 'a' : 'span';
            
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
        }).join('');

        return `<div style="margin-top: 8px;">${streamingBadges}</div>`;
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
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try {
            console.log('Initializing Simple SportsDashboard...');
            window.simpleDashboard = new SimpleSportsDashboard();
        } catch (error) {
            console.error('Error initializing dashboard:', error);
            const container = document.getElementById('eventsContainer');
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