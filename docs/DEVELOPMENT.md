# SportSync Development Guide

## Overview

SportSync is a **static sports dashboard** that displays upcoming events from various sports APIs. The architecture is designed for simplicity, robustness, and future extensibility.

## System Architecture

```
GitHub Actions → Fetch APIs → Generate JSON → GitHub Pages → User Browser
     ↑                                              ↓
     └──────── Every 6 hours ───────────────────────┘
```

## Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: None (static site)
- **Data Pipeline**: Node.js scripts
- **Hosting**: GitHub Pages
- **CI/CD**: GitHub Actions
- **APIs**: ESPN, HLTV, Lichess, fotball.no

## Development Setup

### Prerequisites

- Node.js 18+ 
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
│   ├── index.html       # Main dashboard (HTML + embedded CSS)
│   ├── js/              # Client-side JavaScript
│   │   ├── dashboard.js          # Dashboard controller (temporal bands, expand)
│   │   ├── dashboard-helpers.js  # Pure utilities (grouping, brief, countdowns)
│   │   ├── asset-maps.js         # Team logos + golfer headshot URLs
│   │   ├── sport-config.js       # Sport metadata (emoji, color, aliases)
│   │   ├── sports-api.js         # API integration
│   │   └── preferences-manager.js # Favorites storage (localStorage)
│   ├── data/            # Auto-generated JSON data
│   └── sw.js            # Service worker
│
├── scripts/             # Data fetching (backend)
│   ├── config/          # Configuration files
│   ├── lib/             # Core libraries
│   ├── fetch/           # Sport fetchers
│   └── build-*.js       # Build scripts
│
├── .github/             # GitHub configuration
│   └── workflows/       # GitHub Actions
│
└── package.json         # Project metadata
```

## Data Flow

### 1. Automated Fetching (GitHub Actions)

Every 6 hours, GitHub Actions:

1. Runs `scripts/fetch/index.js` to fetch from all APIs
2. Generates individual sport JSON files
3. Runs `scripts/build-events.js` to create unified events.json
4. Runs `scripts/build-ics.js` to generate calendar export
5. Commits updated files to repository
6. GitHub Pages automatically deploys

### 2. Client-Side Loading

When user visits the site:

1. `dashboard.js` loads `data/events.json`
2. Events are grouped into temporal bands (Today/Tomorrow/This Week/Later)
3. Within each band, 3+ same-tournament events get a tournament header
4. Click-to-expand shows venue, team logos, streaming, and favorite actions
5. Service worker caches for offline access

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

- **Chess**: Curated JSON + Lichess broadcasts
- **Esports**: HLTV community API
- **Norwegian Football**: fotball.no API

### Rate Limiting

- 150ms delay between requests to same API
- 2 retries with exponential backoff
- 60-second response cache

## Testing

### Manual Testing

```bash
# Test data fetching
node scripts/fetch/index.js

# Test specific sport
node -e "import('./scripts/fetch/football-refactored.js').then(m => m.fetchFootballESPN().then(console.log))"

# Validate data structure
node scripts/validate-events.js

# Test frontend locally
npm run dev
```

### Automated Testing (Future)

```javascript
// scripts/test/football.test.js
import { FootballFetcher } from '../fetch/football-refactored.js';

describe('FootballFetcher', () => {
  test('should fetch Premier League matches', async () => {
    const fetcher = new FootballFetcher();
    const result = await fetcher.fetch();
    expect(result.tournaments).toHaveLength(greaterThan(0));
  });
});
```

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

## Future Roadmap

### Phase 1 (Current)
- ✅ Basic dashboard
- ✅ Automated data fetching
- ✅ Norwegian focus
- ✅ Clean architecture

### Phase 2 (Current)
- [x] User preferences (localStorage)
- [x] Favorite teams/players
- [x] Dark mode persistence
- [x] Ultra-minimal temporal band design
- [x] AI daily brief (template-based)

### Phase 3 (Future)
- [ ] AI daily brief via Claude API call
- [ ] Featured context sections (Olympics, World Cup)
- [ ] Push notifications
- [ ] Live scores

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