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

## 📁 Directory Structure

```
scripts/
├── config/          # Configuration files
├── lib/             # Core libraries and utilities
├── fetch/           # Sport-specific fetchers
├── build-events.js  # Aggregates all sports into events.json
├── build-ics.js     # Generates calendar file
└── validate-events.js # Data validation
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
| ⚽ Football | ESPN | `football-refactored.js` | FK Lyn Oslo |
| 🎾 Tennis | ESPN | `tennis-refactored.js` | Casper Ruud |
| 🏌️ Golf | ESPN/LiveGolf | `golf-refactored.js` | Viktor Hovland |
| 🏎️ F1 | ESPN | `f1-refactored.js` | None |
| ♟️ Chess | Curated/Lichess | `chess-refactored.js` | Magnus Carlsen |
| 🎮 Esports | HLTV | `esports-refactored.js` | FaZe (rain) |

## 🔄 Data Pipeline

1. **Fetch**: Parallel API calls to all sports
2. **Transform**: Convert to normalized event structure
3. **Filter**: Apply sport-specific rules
4. **Aggregate**: Combine into unified events.json
5. **Export**: Generate calendar file (.ics)

## 🛡️ Error Handling

The system includes multiple layers of resilience:

- **API retries** with exponential backoff
- **Response caching** to reduce API calls
- **Fallback to legacy** fetchers if refactored fail
- **Retain last good** data on total failure

## 🧪 Testing

```bash
# Test refactored fetchers
node scripts/test-refactored.js

# Validate output structure
node scripts/validate-events.js
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

## 📝 Environment Variables

Optional API keys for enhanced data:

```bash
LIVEGOLF_API_KEY=your_key_here  # Premium golf data with tee times
```

## 🤝 Contributing

1. Follow the established architecture patterns
2. Extend base classes rather than duplicating code
3. Update configuration instead of hardcoding values
4. Add error handling and logging
5. Test both refactored and legacy paths

## 📄 License

MIT - See root LICENSE file