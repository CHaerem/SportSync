# SportSync: Personal Sports Dashboard

A modern, responsive sports dashboard that displays upcoming events for your favorite sports. Built as a static website with automated data updates via GitHub Actions and hosted on GitHub Pages.

## 🏆 Features

- **Real-time Sports Data**: Football, Golf, Tennis, Formula 1, Chess, and Esports
- **Norwegian Focus**: CEST timezone formatting and prioritized Norwegian teams/athletes
- **Automated Updates**: GitHub Actions fetch fresh data every 6 hours
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Zero Dependencies**: Pure HTML, CSS, and JavaScript - no build process required
- **Offline Ready**: Graceful fallback to cached data when APIs are unavailable

## 🚀 Live Demo

Visit your dashboard at: `https://yourusername.github.io/SportSync/`

## 📱 Sports Covered

| Sport | API Source | Coverage |
|-------|------------|----------|
| ⚽ **Football** | TheSportsDB | Premier League, La Liga, Bundesliga, Serie A, Eliteserien |
| 🏌️ **Golf** | ESPN API | PGA Tour, DP World Tour, Major Championships |
| 🎾 **Tennis** | TheSportsDB | ATP, WTA, Grand Slams |
| 🏎️ **Formula 1** | ESPN API | Race Calendar, Practice, Qualifying |
| ♟️ **Chess** | Mock Data* | Major tournaments, titled events |
| 🎮 **Esports** | Mock Data* | CS2, LoL, Valorant, Dota 2 |

*_Chess and Esports use curated mock data - integration with Chess.com API and esports APIs coming soon_

## 🛠️ Setup & Development

### Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/SportSync.git
cd SportSync

# Start local development server
npm run dev

# Open http://localhost:8000 in your browser
```

### GitHub Pages Deployment

1. **Enable GitHub Pages**:
   - Go to repository Settings → Pages
   - Source: Deploy from a branch
   - Branch: `main` → `/docs` folder

2. **Configure Secrets** (Optional for premium APIs):
   - Go to Settings → Secrets and variables → Actions
   - Add API keys if using premium sports APIs

## ⚙️ Automated Data Updates

The dashboard uses GitHub Actions to periodically fetch fresh sports data:

- **Schedule**: Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
- **Manual Trigger**: Available via repository Actions tab
- **Data Storage**: Fetched data is saved to `docs/data/` directory
- **Fallback**: Client-side APIs as backup when cached data is unavailable

## 🏗️ Architecture

```
docs/
├── index.html              # Main dashboard
├── js/
│   ├── sports-api.js       # API integration layer
│   └── dashboard.js        # Dashboard controller
├── data/                   # Pre-fetched API data (generated)
│   ├── football.json
│   ├── golf.json
│   ├── tennis.json
│   ├── f1.json
│   ├── chess.json
│   └── esports.json
└── output/                 # Legacy (can be removed)

.github/workflows/
└── update-sports-data.yml  # Automated data fetching
```

## 🔧 Configuration

### Sports Preferences

Edit `docs/js/sports-api.js` to customize:
- Specific leagues and tournaments
- Norwegian vs international focus
- Number of events displayed per sport
- Time formatting preferences

### API Keys

For enhanced data quality, add these secrets to your repository:

```
THESPORTSDB_API_KEY=your_key_here
API_SPORTS_KEY=your_key_here
SPORTSDATA_API_KEY=your_key_here
```

## 🕒 Time Zone

All events are displayed in Norwegian time (Europe/Oslo timezone) with intelligent relative formatting:
- "Today" / "Tomorrow" for immediate events  
- "X days" for events within a week
- Full date for events further out

## 📊 Data Sources

### Free APIs (Currently Used)
- **TheSportsDB**: Community-driven sports database
- **ESPN Public API**: Official ESPN data endpoints

### Premium APIs (Future Integration)
- **API-Sports**: Comprehensive sports data platform
- **SportsDataIO**: Professional sports data provider
- **Chess.com API**: Official chess platform data

## 🚧 Roadmap

- [ ] Chess.com API integration
- [ ] Live esports data via Twitch/YouTube Gaming APIs
- [ ] Push notifications for favorite team events
- [ ] Calendar export (.ics) functionality
- [ ] Dark mode toggle
- [ ] Customizable sports selection

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and test locally
4. Commit with descriptive messages
5. Push and create a Pull Request

## 📄 License

MIT License - feel free to use this project for your own sports dashboard!

## 🆘 Support

- Check the [GitHub Issues](https://github.com/yourusername/SportSync/issues) for common problems
- Create a new issue for bugs or feature requests
- The dashboard works offline with cached data during API outages