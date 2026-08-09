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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})