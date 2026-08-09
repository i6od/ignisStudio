# Brij Studio — Deployment Guide

Auto-updates via GitHub Releases using `electron-updater`, matching the pipeline in
`E:\YTStudio\deploy_doc.md`. Flow: obfuscate main/preload bundles → package installers →
publish to GitHub Releases → clients auto-update.

## Quick Deploy

```powershell
# 1. Clean previous build
Remove-Item -Recurse -Force "release" -ErrorAction SilentlyContinue
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force

# 2. Set token from .env (create it first — see below)
$env:GH_TOKEN = (Get-Content .env | ForEach-Object { ($_ -split '=',2)[1].Trim().Trim('"') })

# 3. Ensure Python is in PATH (needed if better-sqlite3 must recompile)
$env:PATH = "C:\Users\xavier\AppData\Local\Programs\Python\Python312;C:\Users\xavier\AppData\Local\Programs\Python\Python312\Scripts;" + $env:PATH

# 4. Build (obfuscates) + publish
npm run electron:deploy
```

## First-Time Setup

### 1. Create the GitHub repository

1. Go to https://github.com/new
2. Name: `ignisStudio`
3. Add a README.md
4. Create repo

### 2. GitHub token

Generate a **Classic PAT** at https://github.com/settings/tokens:
- Scope: `repo` (full control)
- Save in `D:\VConnectApp\.env` as:

```
GH_TOKEN = "ghp_..."
```

**OR** a fine-grained token with:
- Contents: Read and write
- Metadata: Read-only

### 3. Point the app at your repo

Already set in `package.json` → `build.publish`:

```json
"publish": {
  "provider": "github",
  "owner": "i6od",
  "repo": "ignisStudio"
}
```

## Build Outputs (`release/`)

| File | Purpose |
|------|---------|
| `Brij Studio X.X.X.exe` | Portable (no install needed) |
| `Brij Studio Setup X.X.X.exe` | NSIS installer |
| `Brij Studio Setup X.X.X.exe.blockmap` | Differential update map |
| `latest.yml` | Version metadata for auto-updater |

## Version Bump + Deploy

1. Edit `package.json`: `"version": "X.X.X"`
2. Run the Quick Deploy commands above (`npm run electron:deploy`)

## Build Pipeline

```
npm run electron:deploy
  → npm run build          (electron-vite builds src/ → out/)
  → node obfuscate.js      (obfuscates out/main/index.js + out/preload/index.js → obfuscated/)
  → electron-builder --win --publish always
      → release/Brij Studio Setup X.X.X.exe  (+ portable, blockmap, latest.yml)
      → uploads assets to GitHub Releases (draft)
```

## Obfuscation

- `obfuscate.js` — runs `javascript-obfuscator` on the **built** main + preload bundles
  (same config as `E:\YTStudio\obfuscate.js`). Source files in `src/` are never shipped.
- The `build.files` override `{ "from": "obfuscated", "to": "" }` replaces the clean
  bundles inside the asar with the obfuscated ones.
- `renameGlobals: false` is critical — renaming globals breaks `require`, `process`,
  `__dirname`, `ipcRenderer`, etc.
- Verify after building:
  ```powershell
  Select-String -Path "release\win-unpacked\resources\app.asar.unpacked\..\app.asar" -Pattern "vconnectTikTikUrls" -Quiet
  ```

## Auto-Update Flow

1. User launches the packaged app
2. After 5s, `autoUpdater.checkForUpdates()` runs (also every hour)
3. Fetches `latest.yml` from GitHub Releases → compares versions
4. If newer: downloads update (progress in Settings → Check for Updates)
5. On complete: quits and installs after 3s

## Files Involved

| File | Role |
|------|------|
| `src/main/index.ts` | `setupAutoUpdater()` — config, events, periodic checks + `update:*` IPC |
| `src/preload/index.ts` | Exposes `window.vconnect.updates` bridge |
| `src/renderer/src/pages/settings.tsx` | Settings page with update UI (version, check, progress) |
| `src/renderer/src/vite-env.d.ts` | Renderer-side types for the update API |
| `obfuscate.js` | Pre-pack obfuscation of main/preload bundles |
| `package.json` | `build.files` override, `build.publish`, `electron:build`/`electron:deploy` scripts |

## Troubleshooting

### Electron-updater: "Cannot find latest.yml" / "No published versions"
The GitHub release is a **draft** — publish it via the GitHub UI or API.

### 403 Forbidden on upload
Token lacks `repo` scope — regenerate with full `repo` scope.

### Auto-updater says update not available in dev
`setupAutoUpdater()` returns when `!app.isPackaged` — updates only run in the
installed/packaged build, never `npm run dev`.

### "Cannot find module 'electron-updater'"
It must stay in `dependencies` (runtime), not `devDependencies` — the packaged
app loads it from `node_modules`. Note `electron-builder` externalizes it via
`externalizeDepsPlugin` in `electron.vite.config.ts`.

### EPERM during packaging
`"electronDist": "node_modules/electron/dist"` (already set) skips the electron
download and works around Windows Defender locking.