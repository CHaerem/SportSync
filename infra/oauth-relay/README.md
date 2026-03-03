# SportSync OAuth Relay

Minimal GitHub OAuth token exchange relay for SportSync. Runs on the serverpi alongside the self-hosted GitHub Actions runner.

## Setup

1. **Register a GitHub OAuth App:**
   - GitHub Settings > Developer settings > OAuth Apps > New OAuth App
   - Homepage URL: `https://chaerem.github.io/SportSync/`
   - Authorization callback URL: `https://<serverpi>.ts.net:3847/callback`

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Fill in GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET
   ```

3. **Expose via Tailscale Funnel:**
   ```bash
   tailscale funnel 3847
   ```

4. **Start the relay:**
   ```bash
   docker compose up -d
   ```

## Endpoints

- `GET /health` — Health check (`{ ok: true }`)
- `GET /auth` — Redirects to GitHub OAuth authorize page
- `GET /callback?code=...` — Exchanges code for token, sends via `postMessage` to opener

## How it works

The relay handles the OAuth code-for-token exchange (which requires the client secret). The token is sent back to the dashboard via `window.opener.postMessage()`, never stored server-side.

If the relay is down, the dashboard sync button shows an appropriate error — the dashboard itself continues to work normally.
