# Auth Broker (storageState vault + minimal API)

Purpose: provide a simple, cheap, self-hosted broker for Playwright `storageState` blobs. Fits the browser auth standard in `.cursor/rules/072-WORKFLOW-browser-auth-standard.mdc` and `docs/BROWSER_AUTH_PROTOCOL.md`.

Run inside WSL2 as a Linux service (no Docker required):
```
cd .cursor/auth-broker
cp env.sample .env   # edit secrets
npm install
npm run dev          # or npm start
```

Systemd template (WSL2):
```
[Unit]
Description=Auth Broker
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/stay/GithubRepos/Content Creation/.cursor/auth-broker
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
Environment=NODE_ENV=production
EnvironmentFile=/home/stay/GithubRepos/Content Creation/.cursor/auth-broker/.env

[Install]
WantedBy=default.target
```
Place as `/etc/systemd/system/auth-broker.service`, then `systemctl daemon-reload && systemctl enable --now auth-broker`.

Endpoints (X-Auth-Token required):
- `GET /health` → `{ ok: true }`
- `GET /auth/state?tenant=...&domain=...` → latest state+metadata
- `POST /auth/state` → store state `{ tenant, domain, state, metadata }`
- `POST /auth/mark-stale` → `{ tenant, domain, reason }`

Data:
- File-backed in `DATA_DIR` (default `./data`), AES-256-GCM using `AUTH_BROKER_SECRET` hex key.
- Keeps previous version for rollback.

Refresh worker stub:
- `refresh-worker.js` logs in with Playwright, captures `storageState`, posts to broker. Fill domain-specific login steps and creds via env.

Notes:
- Enforce `ALLOWED_DOMAINS`.
- Use HTTPS/ingress auth in production.
- Replace AES helper with KMS if available; keep data dir on encrypted volume.

