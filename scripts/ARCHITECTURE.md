# SportSync Data Fetching Architecture

## Overview

SportSync uses a **modular, configuration-driven architecture** for fetching sports data from various APIs. The system is designed to be robust, maintainable, and easily extensible while preparing for future personalization features.

## Core Principles

1. **Configuration-Driven**: All sport-specific settings are centralized in configuration files
2. **Inheritance-Based**: Common functionality is shared through base classes
3. **Robust Error Handling**: Multiple layers of fallbacks and retries
4. **Future-Ready**: Architecture supports user personalization without major refactoring
5. **Backwards Compatible**: Gradual migration system ensures stability

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Configuration Layer                      │
│                    (scripts/config/*.js)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                       Base Classes                           │
│  BaseFetcher → ESPNAdapter → Sport-Specific Fetchers        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                  Validation & Utilities                       │
│   ResponseValidator | APIClient | EventNormalizer | Filters  │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                      Output Layer                            │
│              Normalized JSON files in docs/data/             │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   Monitoring Layer                            │
│   PipelineHealth | QualityRegression | CoverageGapDetection │
└──────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
scripts/
├── config/
│   ├── sports-config.js         # Main configuration for all sports
│   ├── chess-tournaments.json   # Curated chess tournament data
│   └── norwegian-chess-players.json
│
├── lib/
│   ├── base-fetcher.js         # Abstract base class for all fetchers
│   ├── api-client.js           # HTTP client with retry & caching
│   ├── event-normalizer.js     # Ensures consistent event structure
│   ├── response-validator.js   # API response schema validation (ESPN, PandaScore)
│   ├── ai-quality-gates.js     # AI enrichment quality gates and fallbacks
│   ├── filters.js              # Reusable filtering functions
│   ├── helpers.js              # Shared utility functions
│   └── llm-client.js           # LLM abstraction (Anthropic + OpenAI)
│
├── lib/adapters/
│   └── espn-adapter.js         # ESPN API adapter (used by most sports)
│
└── fetch/
    ├── index.js                # Main pipeline orchestrator
    ├── football-refactored.js  # Refactored football fetcher
    ├── tennis-refactored.js    # Refactored tennis fetcher
    ├── golf-refactored.js      # Refactored golf fetcher
    ├── f1-refactored.js        # Refactored F1 fetcher
    ├── chess-refactored.js     # Refactored chess fetcher
    ├── esports-refactored.js   # Refactored esports fetcher
    └── [legacy files]          # Original fetchers (for fallback)
```

## Core Components

### 1. Configuration System (`config/sports-config.js`)

Centralized configuration for all sports:

```javascript
{
  football: {
    sport: "football",
    enabled: true,
    sources: [...],      // API endpoints
    filters: {...},      // Filtering rules
    norwegian: {...},    // Norwegian focus
    streaming: [...]     // Streaming platforms
  }
}
```

### 2. Base Fetcher (`lib/base-fetcher.js`)

Abstract base class providing common functionality:

- **fetch()**: Main entry point
- **fetchFromAPIs()**: Orchestrates API calls
- **applyFilters()**: Applies configured filters
- **normalizeEvents()**: Ensures consistent structure
- **formatResponse()**: Creates final output format

### 3. API Client (`lib/api-client.js`)

Robust HTTP client with:

- **Automatic retries** with exponential backoff
- **Response caching** to reduce API calls
- **Timeout handling**
- **Error recovery** with stale cache fallback

### 4. Event Normalizer (`lib/event-normalizer.js`)

Ensures all events have consistent structure:

- **Field validation** and sanitization
- **ID generation** for deduplication
- **Date normalization** to UTC
- **Participant extraction**

### 5. Filters (`lib/filters.js`)

Reusable filtering functions:

- **Time-based**: Current week, date range
- **Team/Player**: Norwegian focus, favorites
- **League/Tournament**: Specific competitions
- **Deduplication**: Remove duplicate events

## Sport-Specific Implementations

### ESPN Sports (Football, Tennis, Golf, F1)

All ESPN-based sports extend `ESPNAdapter`:

```javascript
class FootballFetcher extends ESPNAdapter {
  constructor() {
    super(sportsConfig.football);
  }
  
  // Override only sport-specific logic
  applyCustomFilters(events) { ... }
}
```

### Custom Sports (Chess, Esports)

Extend `BaseFetcher` directly for non-ESPN sources:

```javascript
class ChessFetcher extends BaseFetcher {
  async fetchFromSource(source) {
    if (source.api === "curated") { ... }
    if (source.api === "lichess") { ... }
  }
}
```

## Data Flow

1. **Configuration Loading**: Sport config defines what to fetch
2. **API Fetching**: Parallel requests to configured endpoints
3. **Data Transformation**: Convert to normalized event structure
4. **Filtering**: Apply sport-specific and global filters
5. **Normalization**: Ensure consistent format and validation
6. **Output Generation**: Group by tournament, add metadata

## Error Handling Strategy

### Multiple Layers of Resilience

1. **Response Validation** (`response-validator.js`):
   - Schema checks for ESPN, PandaScore responses
   - Filters invalid items (missing date, competitions) rather than rejecting entire response
   - Logs warnings for each invalid item

2. **API Level**:
   - Retry failed requests (2 retries, exponential backoff)
   - Return empty result set on total failure

3. **Pipeline Level**:
   - Continue even if individual sports fail
   - Retain last good data if new fetch fails
   - Log all errors for debugging

4. **Monitoring** (post-build):
   - `pipeline-health.js` — detects sport count drops, stale data, RSS/standings issues
   - `check-quality-regression.js` — alerts on AI enrichment/featured score drops
   - `detect-coverage-gaps.js` — finds events mentioned in RSS but missing from pipeline
   - Creates GitHub issues automatically when critical problems are detected

## Migration Strategy

The system supports gradual migration from legacy to refactored code:

```javascript
const fetchers = [
  { 
    name: "football",
    refactored: fetchFootballRefactored,  // New
    legacy: fetchFootballLegacy           // Fallback
  }
];
```

## Future Enhancements

### User Personalization (Phase 2)

The architecture is designed to support:

1. **Local Preferences**: Store user preferences in browser
2. **Client-Side Filtering**: Filter events based on preferences
3. **API Key Support**: Use personal API keys for better rates
4. **Custom Data Sources**: Add user-specific APIs

### Implementation Path

```javascript
// Future: Load preferences from localStorage
const userPrefs = PreferencesManager.load();

// Future: Apply user filters client-side
const filtered = EventFilters.applyUserPreferences(events, userPrefs);

// Future: Fetch with user's API key
const personalData = await PersonalFetcher.fetch(userPrefs.apiKeys);
```

## Configuration Reference

### Sport Configuration Schema

```javascript
{
  sport: String,           // Sport identifier
  enabled: Boolean,        // Enable/disable fetching
  source: String,          // Display name for source
  sources: [{              // API configurations
    api: String,           // API type (espn, custom, etc.)
    type: String,          // Request type
    // ... API-specific config
  }],
  filters: {               // Filtering rules
    timeRange: Number,     // Days ahead to fetch
    maxEvents: Number,     // Maximum events to return
    currentWeek: Boolean,  // Filter to current week
    custom: Boolean        // Enable custom filters
  },
  norwegian: {             // Norwegian focus config
    teams: [String],       // Norwegian teams
    players: [String],     // Norwegian players
    filterMode: String     // exclusive|focused|inclusive
  },
  streaming: [{            // Streaming platforms
    platform: String,
    url: String,
    type: String
  }]
}
```

## Testing

279 tests across 18 files (vitest):

```bash
npm test
```

Key test areas: response validation, pipeline health, quality regression, coverage gaps, dashboard structure, event normalization, enrichment, build-events, fetch-standings, fetch-rss, helpers, filters, preferences, Norwegian streaming, and AI quality gates.

## Performance Considerations

- **Parallel Fetching**: All sports fetch concurrently
- **Caching**: Reduces redundant API calls
- **Rate Limiting**: 150ms delay between same-API calls
- **Data Compression**: Events are deduplicated
- **Selective Fetching**: Only fetch configured sports

## Maintenance Guide

### Adding a New Sport

1. Add configuration to `sports-config.js`
2. Create fetcher extending appropriate base class
3. Add to pipeline in `fetch/index.js`
4. Test with migration helper

### Modifying Filters

1. Update configuration in `sports-config.js`
2. No code changes needed (configuration-driven)

### Changing API Endpoints

1. Update URL in configuration
2. Verify response structure matches expectations
3. Update transformer if needed

## Debugging

### Enable Verbose Logging

```javascript
// In fetcher
console.log(`Fetching ${this.config.sport} from ${source.api}`);
```

### Check Migration Status

```bash
# See which fetchers are refactored
node scripts/fetch/index.js | grep "Refactored fetchers"
```

### Validate Data Structure

```bash
# Check output structure
cat docs/data/football.json | jq '.tournaments[0]'
```

## Best Practices

1. **Always extend base classes** rather than duplicating code
2. **Use configuration** for sport-specific settings
3. **Handle errors gracefully** with appropriate fallbacks
4. **Validate and sanitize** all external data
5. **Log important events** for debugging
6. **Test both paths** (refactored and legacy) during migration
7. **Document API quirks** in sport-specific fetchers

## Support

For issues or questions about the architecture:

1. Check this documentation
2. Review the configuration in `sports-config.js`
3. Enable verbose logging for debugging
4. Test with the migration helper
5. Fall back to legacy fetchers if needed