import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'

import {
  getSummary,
  getTopSupporters,
  recordEvent,
  resetSupporters,
  type RecordEventInput,
  type SupporterMetric
} from './db'
import {
  getTikTokLiveStatus,
  setTikTokLiveHandlers,
  startTikTokLive,
  stopTikTokLive
} from './tiktok-live'
import {
  clearYouTubeLog,
  exportYouTubeLog,
  getQuotaSnapshot,
  getYouTubeConfig,
  getYouTubeRawPage,
  getYouTubeSession,
  getYouTubeStats,
  getStatus as getYouTubeStatus,
  listYouTubeGiftNames,
  listYouTubeMessages,
  loadYouTubeSettings,
  previewYouTubeLive,
  resetSession as resetYouTubeSession,
  resetYouTubeQuota,
  setYouTubeConfig,
  setYouTubeHandlers,
  shutdownYouTube,
  startYouTube,
  stopYouTubePolling,
  type YouTubeConfig
} from './youtube-live'
import { deleteMapping, listMappings, upsertMapping } from './youtube-db'
import { appendEvent, clearEventLog, getEventLogStats, listEventLog, type EventLogInput } from './event-log'

let mainWindow: BrowserWindow | null = null

function registerIpcHandlers(): void {
  ipcMain.handle('supporters:record', (_e, input: RecordEventInput) => {
    recordEvent(input)
    return getSummary()
  })

  ipcMain.handle('supporters:top', (_e, metric: SupporterMetric, limit: number) => {
    return getTopSupporters(metric, limit ?? 10)
  })

  ipcMain.handle('supporters:summary', () => {
    return getSummary()
  })

  ipcMain.handle('supporters:reset', () => {
    resetSupporters()
    return getSummary()
  })

  ipcMain.handle('update:check', () => {
    if (!app.isPackaged) return { success: false, error: 'Updates not available in dev mode' }
    const { autoUpdater } = require('electron-updater') as typeof import('electron-updater')
    autoUpdater.checkForUpdates()
    return { success: true }
  })

  ipcMain.handle('update:getVersion', () => app.getVersion())

  // Built-in TikTok LIVE feed (the in-app alternative to the Tikfinity relay).
  // Frames arrive already normalized to the relay's wire shape, so the
  // renderer pipes them into the same handlers either way.
  setTikTokLiveHandlers({
    onFrame: (frame) => sendToRenderer('tiktok:event', frame),
    onStatus: (status) => sendToRenderer('tiktok:status', status)
  })

  ipcMain.handle('tiktok:start', (_e, username: string) => startTikTokLive(username))
  ipcMain.handle('tiktok:stop', () => {
    stopTikTokLive()
    return getTikTokLiveStatus()
  })
  ipcMain.handle('tiktok:getStatus', () => getTikTokLiveStatus())

  // YouTube gift tracker. Polling, key rotation and quota accounting all live
  // here so the tracker keeps running when the tab is not mounted, and the API
  // keys never reach the renderer bundle.
  setYouTubeHandlers({
    onEvent: (payload) => sendToRenderer('youtube:event', payload),
    onStatus: (status) => sendToRenderer('youtube:status', status)
  })
  loadYouTubeSettings()

  ipcMain.handle('youtube:getConfig', () => getYouTubeConfig())
  ipcMain.handle('youtube:setConfig', (_e, partial: Partial<YouTubeConfig>) => setYouTubeConfig(partial))
  ipcMain.handle('youtube:start', (_e, partial?: Partial<YouTubeConfig>) => startYouTube(partial))
  ipcMain.handle('youtube:preview', (_e, partial?: Partial<YouTubeConfig>) => previewYouTubeLive(partial))
  ipcMain.handle('youtube:stop', () => stopYouTubePolling())
  ipcMain.handle('youtube:reset', () => {
    resetYouTubeSession()
    return getYouTubeStatus()
  })
  ipcMain.handle('youtube:getStatus', () => getYouTubeStatus())
  ipcMain.handle('youtube:listMessages', (_e, limit?: number) => listYouTubeMessages(limit ?? 1000))
  ipcMain.handle('youtube:getStats', () => getYouTubeStats())
  ipcMain.handle('youtube:getGiftNames', () => listYouTubeGiftNames())
  ipcMain.handle('youtube:getSession', () => getYouTubeSession())
  ipcMain.handle('youtube:getRaw', () => getYouTubeRawPage())
  ipcMain.handle('youtube:getQuota', () => getQuotaSnapshot())
  ipcMain.handle('youtube:resetQuota', () => resetYouTubeQuota())
  ipcMain.handle('youtube:clearLog', () => clearYouTubeLog())
  ipcMain.handle('youtube:export', (_e, format: 'csv' | 'json') => exportYouTubeLog(format))
  ipcMain.handle('youtube:listMappings', () => listMappings())
  ipcMain.handle(
    'youtube:setMapping',
    (_e, giftName: string, vconnectUid: string | null, titsUid: string | null) =>
      upsertMapping(giftName, vconnectUid, titsUid)
  )
  ipcMain.handle('youtube:deleteMapping', (_e, giftName: string) => deleteMapping(giftName))

  // Combined TikTok + YouTube timeline. TikTok events are pushed from the
  // renderer because the bridge handlers live there.
  ipcMain.handle('events:append', (_e, input: EventLogInput) => appendEvent(input))
  ipcMain.handle('events:list', (_e, limit?: number) => listEventLog(limit ?? 300))
  ipcMain.handle('events:stats', () => getEventLogStats())
  ipcMain.handle('events:clear', () => {
    clearEventLog()
    return getEventLogStats()
  })
}

function sendToRenderer(channel: string, payload?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

function setupAutoUpdater(): void {
  if (!app.isPackaged) return
  if (process.env['VCONNECT_DISABLE_UPDATES'] === '1') return

  const { autoUpdater } = require('electron-updater') as typeof import('electron-updater')

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    sendToRenderer('update:checking')
  })
  autoUpdater.on('update-available', (info) => {
    sendToRenderer('update:available', { version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    sendToRenderer('update:not-available')
  })
  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('update:progress', Math.round(progress.percent))
  })
  autoUpdater.on('update-downloaded', (info) => {
    sendToRenderer('update:downloaded', { version: info.version })
    // Automatic: quit and install shortly after the download finishes
    setTimeout(() => {
      autoUpdater.quitAndInstall()
    }, 3000)
  })
  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err?.message ?? err)
    sendToRenderer('update:error', err?.message ?? 'Unknown update error')
  })

  // Check 5s after launch, then every hour
  setTimeout(() => autoUpdater.checkForUpdates(), 5000)
  setInterval(() => autoUpdater.checkForUpdates(), 60 * 60 * 1000)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    autoHideMenuBar: true,
    title: 'Brij Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// A second instance would open its own Tikfinity/VConnect sockets and
// double-fire every mapping — refuse to run alongside the first.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.on('window-all-closed', () => {
  // The TikTok socket and the YouTube poll timer are both held by the main
  // process, so they have to be closed here — otherwise a reconnect or poll
  // timer keeps the app alive with no window.
  stopTikTokLive()
  shutdownYouTube()
  if (process.platform !== 'darwin') app.quit()
})