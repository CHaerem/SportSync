<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

This project is a calm, static sports dashboard for a Norwegian sports fan, hosted on GitHub Pages (no build step). Data comes from an hourly static pipeline (ESPN + fotball.no + Liquipedia CS2 + tvkampen TV listings) plus nine scheduled Claude agents (research, verify, editorial, scout, coverage-critic, visual-qa, ui-fix, self-repair, improve) that run on GitHub Actions — see [CLAUDE.md](../CLAUDE.md) for the full architecture. The frontend is vanilla JS (no framework); Norwegian-language UI, Europe/Oslo timezone.

Key frontend files:
- `docs/js/dashboard.js` — controller (data load, the day-grouped agenda, live polling)
- `docs/js/shared-constants.js`, `docs/js/sport-config.js`, `docs/js/asset-maps.js` — utilities, sport metadata, logo/flag maps
- `docs/css/base.css` (tokens/type), `layout.css` (single column), `cards.css` (agenda rows)

Conventions: never edit `scripts/config/interests.json` (user-owned; a hook blocks it); filter event times with `isEventInWindow` (never manual date comparisons); escape data strings with `escapeHtml` in client rendering; run `npm test` before committing.
