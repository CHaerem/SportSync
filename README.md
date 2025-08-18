# SportSync: Personal Sports Dashboard

A beautifully simple sports dashboard following the CALM principle - instantly understandable at a glance, yet elegant and informative. Built as a static website with automated data updates via GitHub Actions and hosted on GitHub Pages.

## 🎯 Design Philosophy

SportSync follows the **CALM principle** - designed to be:

- **Non-intrusive** and helpful with a simple glance
- **Obviously functional** that even your grandparents would understand
- **Elegant yet informative** for tech-savvy users too
- **Instantly scannable** for quick daily sports updates

## ✨ Key Features

### 🕒 **Crystal Clear Time Display**

- **24-hour format** (e.g., "14:30", "19:45") - no AM/PM confusion
- **Day indicators** (TODAY, TOMORROW, MONDAY, etc.)
- **Norwegian timezone** (Europe/Oslo) for accurate local times

### 🏆 **Sport Type Indicators**

- **Color-coded sport badges** for instant recognition:
  - 🟢 **Football** (Green)
  - 🔵 **Tennis** (Blue)
  - 🟡 **Golf** (Amber)
  - 🔴 **Formula 1** (Red)
  - ⚫ **Chess** (Gray)
  - 🟣 **Esports** (Purple)

### 📱 **Extremely Simple Interface**

- **Single chronological list** of all upcoming events
- **Just 3 filters**: All, Today, This Week
- **Clean event cards** with essential info only
- **Perfect mobile responsiveness**

### 🔄 **Automated Updates**

- **Fresh data every 6 hours** via GitHub Actions
- **Offline graceful fallback** to cached data
- **Zero maintenance** once set up

## 🚀 Live Demo

Visit your dashboard at: [https://CHaerem.github.io/SportSync/](https://CHaerem.github.io/SportSync/)

## 📱 Sports Covered

| Sport            | Data Source     | Coverage                                                  |
| ---------------- | --------------- | --------------------------------------------------------- |
| ⚽ **Football**  | ESPN API        | Premier League, La Liga, Bundesliga, Serie A, Eliteserien |
| 🎾 **Tennis**    | ESPN API        | ATP, WTA, Grand Slams, with Norwegian focus               |
| 🏌️ **Golf**      | ESPN API        | PGA Tour, DP World Tour, Major Championships              |
| 🏎️ **Formula 1** | ESPN Racing API | Race Calendar, Practice, Qualifying                       |
| ♟️ **Chess**     | Curated Data + Lichess probe | Major tournaments, Norwegian focus                        |
| 🎮 **Esports**   | HLTV community API | CS2 focus (FaZe / rain)                                    |

## 🛠️ Quick Setup

### Deploy to GitHub Pages

1. **Fork this repository**
2. **Enable GitHub Pages**:
   - Go to Settings → Pages
   - Source: Deploy from a branch
   - Branch: `main` → `/docs` folder
3. **Visit `https://yourusername.github.io/SportSync/`**
4. **Done!** Data updates automatically every 6 hours

### Local Development

```bash
# Clone and serve locally
git clone https://github.com/yourusername/SportSync.git
cd SportSync/docs
python -m http.server 8000

# Open http://localhost:8000
```

## ⚙️ How It Works

### 🤖 Automated Data Pipeline

```
GitHub Actions (every 6 hours)
    ↓
Fetch fresh sports data from ESPN APIs
    ↓
Save to docs/data/*.json files
    ↓
Commit & push to repository
    ↓
GitHub Pages automatically updates
```

### 🏗️ Simple Architecture

```
docs/
├── index.html                  # Clean, minimal dashboard
├── js/
│   ├── sports-api.js           # Legacy per-sport fetch helpers (kept for reference)
│   └── simple-dashboard.js     # UI (now consumes aggregated events.json)
├── data/                       # Auto-generated data (GitHub Action)
│   ├── events.json             # Unified sorted list consumed by UI
│   ├── football.json           # Per-sport source files
│   ├── tennis.json
│   ├── golf.json
│   ├── f1.json
│   ├── chess.json              # Includes chess rounds with participants[]
│   └── esports.json
└── sw.js                       # Service worker for caching

scripts/
├── fetch/                      # Modular fetchers (football, f1, chess, etc.)
├── config/                     # Curated configs (chess tournaments, players)
├── build-events.js             # Produces aggregated events.json
└── validate-events.js          # Lightweight integrity checks
```

The dashboard loads only `events.json`, reducing network round-trips and simplifying logic. Chess rounds contain a `participants` array which is displayed when present.

## 🎨 Design Highlights

### Event Card Structure

```
┌─────────────────────────────────────┐
│ TODAY              🟢 FOOTBALL      │  ← Header: Day + Sport Badge
├─────────────────────────────────────┤
│ 14:30                               │  ← Large, clear time
│                                     │
│ Arsenal vs Manchester City          │  ← Event title
│ Premier League • Emirates Stadium   │  ← Details
│ [Discovery+] [Sky Sports]          │  ← Streaming (if available)
└─────────────────────────────────────┘
```

### Perfect for Everyone

- **Grandparents**: Large text, obvious controls, no confusing elements
- **Tech users**: Efficient scanning, clean design, comprehensive info
- **Mobile users**: Touch-friendly, readable on small screens
- **Quick checks**: Essential info visible at a glance

## 🔧 Customization

### Change Sports Focus / Add Curated Events / Calendar

To adjust curated chess tournaments or Norwegian focus:

1. Edit `scripts/config/chess-tournaments.json` (add rounds / participantsHint / venue)
2. Run locally:

```bash
node scripts/fetch/index.js
node scripts/build-events.js
node scripts/validate-events.js
```

3. Commit changes (GitHub Action normally handles scheduled runs).

Edit `scripts/fetch/*.js` to add logic for new sports or enrich existing ones. The validation script warns about malformed or past events without failing the pipeline unless structural errors occur. Download or subscribe to the calendar feed via `docs/data/events.ics` (UI link provided).

### Styling Tweaks

All styles are in `docs/index.html` for easy customization:

- Colors and spacing
- Typography choices
- Mobile breakpoints
- Sport badge colors

## 🕒 Time Display

All events show in Norwegian time (Europe/Oslo) using 24-hour format:

- **Today's events**: "TODAY 14:30"
- **Tomorrow's events**: "TOMORROW 19:45"
- **This week**: "MONDAY 16:00"
- **Future events**: "SUN, DEC 15 12:30"

## 🚧 Future Enhancements

- [x] Unified aggregated events.json feed
- [x] Chess round participants display
- [x] Real esports feed (HLTV community API)
- [x] Dark mode toggle
- [x] Calendar export (.ics) including participants
- [ ] Live chess round times from broadcast APIs
- [ ] Liquipedia integration for broader esports
- [ ] Push notifications for favorite events
- [ ] Favorite teams/players tracking

## 🤝 Contributing

This project welcomes contributions that maintain the CALM principle:

1. Fork the repository
2. Keep changes simple and user-focused
3. Test on both mobile and desktop
4. Ensure accessibility and readability
5. Create a Pull Request with clear description

## 📄 License

MIT License - feel free to create your own sports dashboard!

## 💡 Why SportSync?

In a world of cluttered sports apps and overwhelming dashboards, SportSync returns to simplicity. It answers one question perfectly: **"What sports are happening when?"**

No notifications, no social features, no premium subscriptions. Just clean, reliable sports information that respects your time and attention.

Perfect for checking your daily sports schedule over morning coffee or planning your weekend viewing. ☕️🏆
