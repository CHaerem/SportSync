<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

This project is a calm, static sports dashboard for a Norwegian sports fan, hosted on GitHub Pages (no build step). Data comes from an hourly static pipeline (ESPN + fotball.no + Liquipedia CS2 + tvkampen TV listings) plus nine scheduled Claude agents (research, verify, editorial, scout, coverage-critic, visual-qa, ui-fix, self-repair, improve) that run on GitHub Actions — see [CLAUDE.md](../CLAUDE.md) for the full architecture and [DESIGN.md](../DESIGN.md) for the normative UI contract (the Apple-native baseline visual identity every flate must honour). The frontend is vanilla JS (no framework); Norwegian-language UI, Europe/Oslo timezone.

Key frontend files:
- `docs/js/dashboard.js` — the `Dashboard` controller core (data load, hero, the day-grouped agenda), extended across a shared prototype by `live.js` (live polling), `detail.js` (expand/detail), `followed.js` ("Hva vi følger"), `chrome.js` (clock/date/footer)
- `docs/js/edit.js` — the "rediger" page that builds a follow-request GitHub issue (the human-initiated, OWNER-gated path to interests.json)
- `docs/js/shared-constants.js`, `docs/js/theme.js` — shared utilities + the 3-step theme toggle
- `docs/css/base.css` (tokens/type), `layout.css` (single column), `cards.css` (agenda rows)

Conventions: never edit `scripts/config/interests.json` (user-owned; a hook blocks it); filter event times with `isEventInWindow` (never manual date comparisons); escape data strings with `escapeHtml` in client rendering; run `npm test` before committing.
