# SportSync Self-Hosted GitHub Actions Runner

Docker-based runner for the data pipeline (`update-sports-data.yml`). Runs on any Docker host (tested on Raspberry Pi 4 ARM64).

## Setup

1. Generate a registration token:

```bash
gh api -X POST repos/CHaerem/SportSync/actions/runners/registration-token --jq '.token'
```

2. Create `.env` in this directory:

```bash
cp .env.example .env
# Edit .env and paste the token
```

3. Build and start:

```bash
docker compose up -d --build
```

4. Verify the runner appears in GitHub: **Settings > Actions > Runners**

## Management

```bash
# View logs
docker logs -f sportsync-runner

# Restart
docker compose restart

# Stop and deregister
docker compose down

# Rebuild after Dockerfile changes
docker compose up -d --build
```

## Resource usage

- Memory limit: 2GB (Pi 4 has 8GB, ~6.5GB available)
- Disk per job: ~200MB (checkout + node_modules), cleaned after each run
- CPU: uses all available cores during `npm install` and parallel steps

## Notes

- **Registration tokens expire after 1 hour.** Generate a fresh one right before `docker compose up`.
- **Runner auto-updates** are enabled. The container handles GitHub runner version upgrades.
- **Only the data pipeline** runs here. The autopilot (`claude-autopilot.yml`) stays on `ubuntu-latest`.
- **Fallback**: trigger the workflow manually with `runner: ubuntu-latest` if the Pi is offline.
- **Offline behavior**: jobs queue for up to 24h, then cancel. The concurrency group prevents pile-up.
