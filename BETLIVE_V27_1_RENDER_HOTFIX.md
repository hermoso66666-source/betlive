# BetLive V27.1 — Render startup hotfix

- Health check `/api/health` responds immediately while PostgreSQL is connecting.
- PostgreSQL pool has bounded connection/idle timeouts and an error listener.
- Database bootstrap failures are logged without killing the HTTP process, preventing Render restart loops.
- Service still retries database initialization on the next deployment/restart.
- Service worker cache bumped to v27.1 so browsers do not keep the previous frontend shell.

## Render
Build: `npm install`
Start: `npm start`
Health: `/api/health`
