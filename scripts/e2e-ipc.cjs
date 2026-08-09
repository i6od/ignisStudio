const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const OUT = path.join(os.tmpdir(), 'vc-e2e-result.txt')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-e2e-'))
process.env.VCONNECT_DB_PATH = path.join(dir, 'e2e.db')
// Isolate userData so this test instance never collides with the running app
app.setPath('userData', path.join(dir, 'userData'))

function report(line) {
  fs.appendFileSync(OUT, line + '\n')
}

report('STEP: module loaded ' + new Date().toISOString())

// Hard guard: if anything hangs, dump state and exit
setTimeout(() => {
  report('TIMEOUT: process still alive after 90s')
  app.exit(2)
}, 90000)

// Bundle the DB module fresh (out/main is rebuilt by dev/build and may not contain db.cjs)
const { execSync } = require('child_process')
execSync(
  path.join(__dirname, '..', 'node_modules', '.bin', 'esbuild') +
    ' src/main/db.ts --bundle --format=cjs --platform=node --packages=external --outfile=out/main/db.cjs',
  { cwd: path.join(__dirname, '..'), stdio: 'ignore' }
)

const { recordEvent, getTopSupporters, getSummary, resetSupporters } = require('../out/main/db.cjs')
ipcMain.handle('supporters:record', (_e, input) => { recordEvent(input); return getSummary() })
ipcMain.handle('supporters:top', (_e, metric, limit) => getTopSupporters(metric, limit ?? 10))
ipcMain.handle('supporters:summary', () => getSummary())
ipcMain.handle('supporters:reset', () => { resetSupporters(); return getSummary() })

app.whenReady().then(async () => {
  report('STEP: whenReady')
  try {
    report('STEP: creating window')
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'out', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    report('STEP: loading URL')
    await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'index.html'))
    report('STEP: URL loaded')
    await new Promise(r => setTimeout(r, 1500))
    report('STEP: waiting done')

    // Drive through the real preload bridge (window.vconnect) like the app does
    const result = await win.webContents.executeJavaScript(`
      (async () => {
        await window.vconnect.supporters.record({ type: 'gift', userId: 'e2e-1', nickname: 'streamer_fan', repeatCount: 3, diamondCount: 100 });
        await window.vconnect.supporters.record({ type: 'like', userId: 'e2e-2', nickname: 'clicker', likeCount: 999 });
        await window.vconnect.supporters.record({ type: 'comment', userId: 'e2e-1', nickname: 'streamer_fan' });
        const top = await window.vconnect.supporters.top('gifts', 5);
        const summary = await window.vconnect.supporters.summary();
        return JSON.stringify({ top, summary, hasBridge: typeof window.vconnect === 'object' });
      })()
    `)

    const data = JSON.parse(result)
    const top = data.top
    const summary = data.summary

    const ok = (cond, msg) => report((cond ? 'PASS: ' : 'FAIL: ') + msg)

    ok(data.hasBridge, 'preload bridge exposed as window.vconnect')
    ok(top.length === 1, `top gifters length=1 (got ${top.length})`)
    ok(top[0] && top[0].user_key === 'e2e-1' && top[0].diamonds === 300, `diamonds=300 (got ${top[0] && top[0].diamonds})`)
    ok(summary.total === 2, `summary total=2 (got ${summary.total})`)
    ok(summary.topGifter && summary.topGifter.nickname === 'streamer_fan', 'summary topGifter nickname')

    report('E2E IPC+DB PASSED')
  } catch (e) {
    report('ERROR: ' + (e && e.stack ? e.stack : e))
  }
  app.exit(0)
})