# SportSync Development Guide

## Overview

SportSync is a **static sports dashboard** that displays upcoming events from various sports APIs. The architecture is designed for simplicity, robustness, and future extensibility.

## System Architecture

```
GitHub Actions → Fetch APIs → Validate → Enrich → Health Check → GitHub Pages → User Browser
     ↑                                                                ↓
     └──────── Every 2 hours ─────────────────────────────────────────┘
```

## Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: None (static site)
- **Data Pipeline**: Node.js scripts
- **Hosting**: GitHub Pages
- **CI/CD**: GitHub Actions
- **APIs**: ESPN, PGA Tour, PandaScore, fotball.no

## Development Setup

### Prerequisites

- Node.js 20+
- Git
- Python 3 (for local server)

### Local Development

```bash
# Clone repository
git clone https://github.com/chaerem/SportSync.git
cd SportSync

# Install dependencies (minimal)
npm install

# Start local server
npm run dev
# Opens at http://localhost:8000

# Fetch fresh data
npm run update:data
npm run build:events
```

## Project Structure

```
SportSync/
├── docs/                 # GitHub Pages root (frontend)
│   ├── index.html       # Main dashboard (HTML + embedded CSS, 480px max-width)
│   ├── js/              # Client-side JavaScript
│   │   ├── dashboard.js          # Dashboard controller (~860 lines): brief, events, live polling
│   │   ├── asset-maps.js         # Team logos + golfer headshot URLs
│   │   ├── sport-config.js       # Sport metadata (emoji, color, aliases for 7 sports)
│   │   └── preferences-manager.js # Favorites storage (localStorage)
│   ├── data/            # Auto-generated JSON data
│   └── sw.js            # Service worker
│
├── scripts/             # Data fetching & monitoring (backend)
│   ├── config/          # Auto-discovered curated event configs
│   ├── lib/             # Core libraries (helpers, validators, LLM client)
│   ├── fetch/           # Sport-specific fetchers
│   ├── pipeline-health.js        # Pipeline health monitoring
│   ├── check-quality-regression.js # AI quality regression gate
│   ├── detect-coverage-gaps.js   # RSS vs events blind spot detection
│   └── build-*.js       # Build scripts
│
├── tests/               # 279 tests across 18 files (vitest)
├── .github/workflows/   # GitHub Actions (data pipeline + autopilot)
└── package.json         # Project metadata
```

## Data Flow

### 1. Automated Fetching (GitHub Actions)

Every 2 hours, GitHub Actions:

1. Fetches data from ESPN, PGA Tour, PandaScore, fotball.no (with response validation)
2. Generates individual sport JSON files + fetches standings and RSS
3. Runs `scripts/build-events.js` to create unified events.json (auto-discovers curated configs)
4. AI enrichment adds importance, summaries, tags to events
5. Claude CLI generates featured.json (brief, sections, radar)
6. Validates data, runs pipeline health check and quality regression gate
7. Detects coverage gaps (RSS headlines vs events)
8. Commits updated files, GitHub Pages automatically deploys

### 2. Client-Side Loading

When user visits the site:

1. `dashboard.js` loads `events.json`, `featured.json`, `standings.json`
2. Renders AI-generated editorial brief and featured sections
3. Events grouped into temporal bands (Today/Tomorrow/This Week/Later), organized by sport
4. Click-to-expand shows venue, team logos, standings mini-tables, streaming, favorites
5. Live polling fetches ESPN football scores + golf leaderboard every 60s
6. Service worker caches static assets for offline access

## Adding New Features

### Adding a New Sport

#### 1. Configure the Sport

Edit `scripts/config/sports-config.js`:

```javascript
export const sportsConfig = {
  // ... existing sports
  
  basketball: {
    sport: "basketball",
    enabled: true,
    source: "ESPN NBA API",
    sources: [{
      api: "espn",
      type: "scoreboard",
      url: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
    }],
    filters: {
      timeRange: 7,
      maxEvents: 10
    }
  }
};
```

#### 2. Create the Fetcher

Create `scripts/fetch/basketball-refactored.js`:

```javascript
import { ESPNAdapter } from "../lib/adapters/espn-adapter.js";
import { sportsConfig } from "../config/sports-config.js";

export class BasketballFetcher extends ESPNAdapter {
  constructor() {
    super(sportsConfig.basketball);
  }
  
  // Add any basketball-specific logic here
}

export async function fetchBasketball() {
  const fetcher = new BasketballFetcher();
  return await fetcher.fetch();
}
```

#### 3. Add to Pipeline

Update `scripts/fetch/index.js`:

```javascript
import { fetchBasketball } from "./basketball-refactored.js";

const fetchers = [
  // ... existing fetchers
  { 
    name: "basketball",
    refactored: fetchBasketball,
    legacy: null
  }
];
```

#### 4. Update Frontend

Add filter dot in `docs/index.html`:

```html
<button class="filter-dot" data-sport="basketball" aria-label="Basketball" title="Basketball">🏀</button>
```

### User Preferences

Preferences are managed by `docs/js/preferences-manager.js` and stored in localStorage:

- Favorite teams (by sport)
- Favorite players (by sport)
- Individual event favorites
- Theme preference (dark/light/auto)

Favorites are toggled through the expanded event view (click any event row).

## API Integration

### ESPN APIs (Public)

Most sports use ESPN's public APIs:

- **Football**: `/apis/site/v2/sports/soccer/{league}/scoreboard`
- **Tennis**: `/apis/site/v2/sports/tennis/{tour}/scoreboard`
- **Golf**: `/apis/site/v2/sports/golf/{tour}/scoreboard`
- **F1**: `/apis/site/v2/sports/racing/f1/scoreboard`

### Custom Integrations

- **Chess**: Curated configs in `scripts/config/`
- **Esports**: PandaScore API (needs `PANDASCORE_API_KEY`)
- **Golf (enhanced)**: PGA Tour tee times (scraped from pgatour.com)
- **Norwegian Football**: fotball.no API

### Rate Limiting

- 150ms delay between requests to same API
- 2 retries with exponential backoff
- 60-second response cache

## Testing

```bash
# Run all tests (279 tests across 18 files)
npm test

# Validate data structure
node scripts/validate-events.js

# Run pipeline health check locally
node scripts/pipeline-health.js

# Check quality regression
node scripts/check-quality-regression.js

# Detect coverage gaps
node scripts/detect-coverage-gaps.js

# Test frontend locally
npm run dev
```

Test coverage includes: response validation, pipeline health, quality regression, coverage gaps, dashboard structure, event normalization, enrichment, build-events, fetch-standings, fetch-rss, helpers, filters, preferences, Norwegian streaming, and AI quality gates.

## Debugging

### Enable Verbose Logging

```javascript
// In any fetcher
console.log(`[${this.config.sport}] Fetching from ${source.api}...`);
console.log(`[${this.config.sport}] Found ${events.length} events`);
```

### Check GitHub Actions Logs

1. Go to Actions tab in GitHub
2. Click on latest workflow run
3. Expand job steps to see logs

### Inspect Generated Data

```bash
# Check data structure
cat docs/data/football.json | jq '.'

# Check event counts
cat docs/data/events.json | jq 'length'

# Verify timestamps
cat docs/data/meta.json
```

## Performance Optimization

### Current Optimizations

- **Parallel fetching** of all sports
- **Single events.json** reduces HTTP requests
- **Service worker** caching
- **CDN delivery** via GitHub Pages
- **Minimal dependencies** (no framework)

### Future Optimizations

- **IndexedDB** for large datasets
- **Virtual scrolling** for many events
- **Progressive loading** of images
- **WebP images** with fallbacks

## Deployment

### Automatic Deployment

Every push to `main` branch:

1. GitHub Actions runs tests (if any)
2. Updates data if scripts changed
3. GitHub Pages deploys automatically

### Manual Deployment

```bash
# Trigger data update
gh workflow run update-sports-data.yml

# Or push any change
git commit --allow-empty -m "Trigger deploy"
git push
```

## Security Considerations

- **No API keys in code** (use GitHub Secrets)
- **No user data storage** (privacy-first)
- **Content Security Policy** headers
- **HTTPS only** via GitHub Pages

## Browser Compatibility

Supports all modern browsers:

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile browsers

Uses modern JavaScript features:

- ES6 modules
- Async/await
- Fetch API
- CSS Grid

## Contributing Guidelines

### Code Style

- Use ES6+ features
- Async/await over promises
- Descriptive variable names
- Comment complex logic

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/add-basketball

# Make changes
git add .
git commit -m "feat: add basketball sport integration"

# Push and create PR
git push origin feature/add-basketball
```

### Commit Messages

Follow conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Tests
- `chore:` Maintenance

## Troubleshooting

### Common Issues

**Data not updating:**
- Check GitHub Actions logs
- Verify API endpoints are accessible
- Check for rate limiting

**Frontend not displaying events:**
- Check browser console for errors
- Verify events.json exists and is valid
- Clear browser cache

**GitHub Actions failing:**
- Check workflow syntax
- Verify Node.js version
- Check API availability

## Feature Status

### Completed
- ✅ Ultra-minimal editorial dashboard (480px, system-ui, newspaper aesthetic)
- ✅ AI editorial brief, featured sections, and radar via Claude CLI
- ✅ AI event enrichment (importance 1-5, summaries, tags, Norwegian relevance)
- ✅ AI watch plan (ranked "what to watch" windows)
- ✅ Live score polling (ESPN football scores + golf leaderboard every 60s)
- ✅ Autonomous curated configs (Olympics, chess tournaments)
- ✅ Self-healing pipeline (response validation, health monitoring, quality regression, coverage gaps)
- ✅ User preferences, favorites, dark mode (localStorage)
- ✅ Nightly autopilot for continuous improvement
- ✅ 279 tests across 18 files

## Resources

- [ESPN API Documentation](https://gist.github.com/nntrn/ee26cb2a0716de0947a0a4e9a157bc1c)
- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [GitHub Pages Docs](https://docs.github.com/en/pages)
- [MDN Web Docs](https://developer.mozilla.org/)

## Support

For issues or questions:

1. Check existing [GitHub Issues](https://github.com/chaerem/SportSync/issues)
2. Read the [Architecture Documentation](../scripts/ARCHITECTURE.md)
3. Create a new issue with details