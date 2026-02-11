# SportSync Data Fetching Scripts

This directory contains the data fetching infrastructure for SportSync, a sports dashboard that aggregates events from multiple APIs.

## 🚀 Quick Start

```bash
# Fetch all sports data
node scripts/fetch/index.js

# Build unified events file
node scripts/build-events.js

# Generate calendar export
node scripts/build-ics.js

# Validate data integrity
node scripts/validate-events.js
```

## Directory Structure

```
scripts/
├── config/                         # Auto-discovered curated event configs
├── lib/                            # Core libraries and utilities
│   ├── response-validator.js       # API response schema validation
│   ├── ai-quality-gates.js         # AI enrichment quality gates
│   └── ...                         # helpers, LLM client, normalizer, filters
├── fetch/                          # Sport-specific fetchers
├── fetch-standings.js              # ESPN standings → standings.json
├── fetch-rss.js                    # RSS digest → rss-digest.json
├── build-events.js                 # Aggregates all sports into events.json
├── enrich-events.js                # AI enrichment (importance, tags, summaries)
├── generate-featured.js            # Claude CLI → featured.json
├── pipeline-health.js              # Pipeline health report → health-report.json
├── check-quality-regression.js     # AI quality regression detection
├── detect-coverage-gaps.js         # RSS vs events blind spot detection
├── validate-events.js              # Data integrity checks
└── build-ics.js                    # Calendar export generator
```

## 🏗️ Architecture

SportSync uses a **modular, object-oriented architecture** with configuration-driven fetchers:

- **Base Classes**: Shared functionality through inheritance
- **Configuration**: Centralized settings for all sports
- **Robust Error Handling**: Multiple fallback layers
- **Future-Ready**: Prepared for user personalization

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed documentation.

## ⚙️ Configuration

All sports are configured in `config/sports-config.js`:

```javascript
{
  football: {
    sources: [...],     // API endpoints
    filters: {...},     // Filtering rules
    norwegian: {...}    // Norwegian focus
  }
}
```

## 🏃‍♂️ Sports Supported

| Sport | Primary API | Fetcher | Norwegian Focus |
|-------|------------|---------|-----------------|
| Sport | Primary API | Fetcher | Norwegian Focus |
|-------|------------|---------|-----------------|
| Football | ESPN + fotball.no | `football.js` | FK Lyn Oslo, Barcelona, Liverpool |
| Tennis | ESPN | `tennis.js` | Casper Ruud |
| Golf | ESPN + PGA Tour | `golf.js` | Viktor Hovland |
| F1 | ESPN | `f1.js` | None |
| Chess | Curated configs | `chess.js` | Magnus Carlsen |
| Esports | PandaScore | `esports.js` | CS2 competitions |

## Data Pipeline

1. **Fetch**: API calls to all sports (ESPN, PGA Tour, PandaScore, fotball.no)
2. **Validate**: Response validators filter invalid items, log warnings
3. **Transform**: Convert to normalized event structure
4. **Filter**: Apply sport-specific rules (Norwegian focus, date range)
5. **Aggregate**: Combine into unified events.json (with curated configs)
6. **Enrich**: AI adds importance, summaries, tags (OpenAI/Anthropic)
7. **Generate**: Claude CLI creates featured.json (brief, sections, radar)
8. **Monitor**: Pipeline health, quality regression, coverage gap detection
9. **Export**: Generate calendar file (.ics)

## Error Handling & Self-Healing

The system includes multiple layers of resilience:

- **Response validation** — schema checks filter invalid items without rejecting entire responses
- **API retries** with exponential backoff
- **Retain last good** data on total failure
- **Pipeline health monitoring** — detects sport drops, stale data, RSS/standings issues
- **Quality regression gate** — alerts when AI enrichment or featured scores drop
- **Coverage gap detection** — finds blind spots by cross-referencing RSS vs events

## Testing

```bash
# Run all tests (279 tests across 18 files)
npm test

# Validate output structure
node scripts/validate-events.js

# Run pipeline health check
node scripts/pipeline-health.js

# Check quality regression
node scripts/check-quality-regression.js

# Detect coverage gaps
node scripts/detect-coverage-gaps.js
```

## 🔧 Adding a New Sport

1. **Configure** in `config/sports-config.js`:
```javascript
basketball: {
  sport: "basketball",
  sources: [{
    api: "espn",
    url: "https://site.api.espn.com/.../nba/scoreboard"
  }]
}
```

2. **Create fetcher** extending base class:
```javascript
// fetch/basketball-refactored.js
import { ESPNAdapter } from "../lib/adapters/espn-adapter.js";

export class BasketballFetcher extends ESPNAdapter {
  constructor() {
    super(sportsConfig.basketball);
  }
}
```

3. **Add to pipeline** in `fetch/index.js`

## 📊 Output Format

All fetchers produce consistent JSON structure:

```json
{
  "lastUpdated": "2025-08-20T12:00:00Z",
  "source": "ESPN API",
  "tournaments": [
    {
      "name": "Premier League",
      "events": [
        {
          "title": "Arsenal vs Chelsea",
          "time": "2025-08-21T19:00:00Z",
          "venue": "Emirates Stadium",
          "sport": "football",
          "norwegian": false
        }
      ]
    }
  ]
}
```

## 🔍 Debugging

Enable verbose logging:
```javascript
// In any fetcher
console.log(`Fetching ${this.config.sport}...`);
```

Check fetcher status:
```bash
node scripts/fetch/index.js | grep "Refactored fetchers"
```

## 🚀 Performance

- **Parallel fetching** for all sports
- **60-second cache** for API responses
- **Rate limiting** (150ms between calls)
- **Data deduplication**

## Environment Variables

```bash
CLAUDE_CODE_OAUTH_TOKEN=...  # Claude Max subscription for featured generation
OPENAI_API_KEY=...           # OpenAI for event enrichment
PANDASCORE_API_KEY=...       # Esports CS2 competitions
```

## 🤝 Contributing

1. Follow the established architecture patterns
2. Extend base classes rather than duplicating code
3. Update configuration instead of hardcoding values
4. Add error handling and logging
5. Test both refactored and legacy paths

## 📄 License

MIT - See root LICENSE file