# SportSync: AI-Powered Personalized Sports Calendar

This project generates a static, personalized sports calendar using OpenAI and publishes it via GitHub Pages. It is fully automated with a daily GitHub Actions workflow.

## Features

- LLM-powered filtering of sports events based on user interests
- Daily automation (07:00 CEST)
- Weekly table and today view
- Norway-centric prioritization
- Pure code, no external workflow tools

## Usage

- Configure your interests and OpenAI API key
- The workflow will update the calendar daily

## Structure

- `src/` — scripts for parsing interests, fetching events, formatting output
- `docs/` — static site (index.html, output/)
- `.github/workflows/` — GitHub Actions workflow
- `prompt_templates/` — prompt templates for LLM
- `interest.schema.json` — schema for interests

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key (required)
- `OPENAI_MODEL`: Model to use (default: o3)
- `TZ`: Timezone (default: Europe/Oslo)
- `MAX_DAILY_TOKENS`: Max OpenAI tokens per day (default: 2000)

## ICS Export

An `.ics` file is generated for calendar integration.

## Cost Guard

The workflow will abort if estimated token usage exceeds `MAX_DAILY_TOKENS`.

## Setup

1. Install dependencies: `npm install`
2. Add your OpenAI API key as a secret in GitHub
3. Customize your interests

## License

MIT
