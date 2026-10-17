# Browser Demo Runner (service-mode, no Docker)

Purpose: given a transcript + target domains, fetch storageState from Auth Broker, preflight, call Browserless to render/record, return video/status. Lives in `.cursor/runner/` so MACF installs carry it by default. Runs fine as a WSL2/Linux service (systemd example below).

## Quick start
```
cd .cursor/runner
cp env.sample .env   # fill broker token/url, browserless token, domains
npm install
npm run dev          # or npm start
```

Systemd template:
```
[Unit]
Description=Browser Demo Runner
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/stay/GithubRepos/Content Creation/.cursor/runner
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
Environment=NODE_ENV=production
EnvironmentFile=/home/stay/GithubRepos/Content Creation/.cursor/runner/.env

[Install]
WantedBy=default.target
```
Place at `/etc/systemd/system/browser-runner.service`, then `systemctl daemon-reload && systemctl enable --now browser-runner`.

## Endpoints (MVP)
- `POST /generate` → body: `{ transcript, domains?:[], tenant?:string }`  
  - Fetches storageState from Auth Broker per domain; if missing returns `{ need_connect:true, domains:[...] }`.  
  - If present, calls Browserless `/function` with injected storageState (ESM script). Returns `{ ok:true, jobId, video, meta }` in this scaffold (synchronous).  
- `GET /status/:jobId` → stub (returns 404 if unknown).  
- `GET /connect-link?domain=` → stub (returns placeholder URL for one-click connect page).

## Notes
- This is a scaffold: recording script is minimal; replace `buildScript` in `src/script.js` with your production screencast logic.  
- Uses `node-fetch` to call Auth Broker and Browserless; no Playwright locally (Browserless runs Playwright).  
- OUTPUT_DIR stores returned videos (base64-decoded).  
- Enforce `ALLOWED_DOMAINS` to prevent misuse.

## Files
- `src/server.js` — API, broker integration, Browserless call, preflight stub.
- `src/script.js` — builds the ESM function string sent to Browserless.

