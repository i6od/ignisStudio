# Brij Studio

Tikfinity → VConnect bridge desktop app. Listens to Tikfinity LIVE events (via a local Tikfinity
WebSocket) and fires named triggers on a VConnect API WebSocket server.

Built with Electron, React 19, Tailwind v4, and shadcn/ui.

## Features

- **Connections** — one-click connect/disconnect to both endpoints (VConnect API + Tikfinity feed),
  with an advanced panel for custom hosts/ports/paths
- **Triggers** — live trigger list from VConnect, fire any trigger on demand, per-trigger status
  feedback (pending / fired / error)
- **Mappings** — map gift names, follows, and subscribes to triggers
- **Like Goals** — per-user like thresholds that auto-fire triggers
- **Supporters** — persistent leaderboard (top gifters / likers / commenters) in local SQLite
- **Logs** — full bridge event log with auto-scroll

## Dev

```bash
npm install
npm run dev          # electron-vite dev mode
npm run typecheck    # TS checks (node + web)
```

## Deploy

Auto-updates via GitHub Releases (`electron-updater`). See `DEPLOY.md`:

```bash
npm run electron:build    # local build (obfuscated, installers in release/)
npm run electron:deploy   # build + publish release to GitHub
```