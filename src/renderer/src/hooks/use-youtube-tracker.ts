import { useCallback, useEffect, useRef, useState } from 'react'

import type { useTikfinity } from '@/hooks/use-tikfinity'

type Tk = ReturnType<typeof useTikfinity>

const EMPTY_STATS: YouTubeStats = {
  giftCount: 0,
  totalJewels: 0,
  uniqueSenders: 0,
  maxCombo: 0,
  messageCount: 0,
  byGift: [],
  bySender: []
}

/** Electron wraps a main-process throw in an IPC prefix; the user only needs the sentence. */
function readableError(error: unknown): string {
  const raw = String((error as Error)?.message ?? error)
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^(YouTubeApiError|Error):\s*/, '')
}

const EMPTY_CONFIG: YouTubeConfig = {
  keys: [],
  quotaCap: 10000,
  hl: 'en',
  maxResults: 100,
  pollSec: 30,
  typeFilter: 'all',
  jewelValue: 0.01,
  videoInput: '',
  liveChatId: '',
  handle: ''
}

export interface TrackerNotice {
  text: string
  kind: 'info' | 'ok' | 'err'
}

/**
 * Renderer side of the YouTube gift tracker. The main process owns polling,
 * keys and storage; this hook mirrors the state, streams new messages in, and
 * fires VConnect / TITS triggers for mapped YouTube gifts - which has to happen
 * in the renderer because that is where the VConnect and TITS sockets live.
 */
export function useYouTubeTracker(tk: Tk) {
  const api = window.vconnect?.youtube

  const [config, setConfigState] = useState<YouTubeConfig>(EMPTY_CONFIG)
  const [status, setStatus] = useState<YouTubeStatus | null>(null)
  const [stats, setStats] = useState<YouTubeStats>(EMPTY_STATS)
  const [quota, setQuota] = useState<YouTubeQuotaSnapshot | null>(null)
  const [messages, setMessages] = useState<YouTubeMessageRow[]>([])
  const [mappings, setMappings] = useState<YouTubeMappingRow[]>([])
  const [giftNames, setGiftNames] = useState<string[]>([])
  const [notice, setNotice] = useState<TrackerNotice>({
    text: 'Add a YouTube Data API v3 key and a live video URL or a channel handle (@name), then Start tracking.',
    kind: 'info'
  })
  const [previewTarget, setPreviewTarget] = useState<YouTubeLiveTarget | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // The IPC subscription is registered once for the app's lifetime, so it has
  // to read the newest tk / config through refs instead of closing over them.
  const tkRef = useRef(tk)
  tkRef.current = tk
  const configRef = useRef(config)
  configRef.current = config
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleDerivedRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null
      if (!api) return
      void api.getStats().then(setStats).catch(() => {})
      void api.getQuota().then(setQuota).catch(() => {})
      tkRef.current.refreshSupporterSummary()
    }, 250)
  }, [api])

  const reloadAll = useCallback(async () => {
    if (!api) return
    const [nextConfig, nextStats, nextQuota, nextMappings, names] = await Promise.all([
      api.getConfig().catch(() => EMPTY_CONFIG),
      api.getStats().catch(() => EMPTY_STATS),
      api.getQuota().catch(() => null),
      api.listMappings().catch(() => []),
      api.getGiftNames().catch(() => [])
    ])
    setConfigState(nextConfig)
    setStats(nextStats)
    setQuota(nextQuota)
    setMappings(nextMappings)
    setGiftNames(names)
  }, [api])

  const reloadMessages = useCallback(async () => {
    if (!api) return
    const rows = await api.listMessages(2000).catch(() => [])
    setMessages(rows)
  }, [api])

  useEffect(() => {
    if (!api) return
    void Promise.all([reloadAll(), reloadMessages()]).finally(() => setLoaded(true))
    void api.getStatus().then(setStatus).catch(() => {})
  }, [api, reloadAll, reloadMessages])

  // Mounted for the whole app, so tracking keeps running when another tab is open.
  useEffect(() => {
    if (!api) return

    const offEvent = api.onEvent((payload) => {
      setMessages((prev) => {
        const index = prev.findIndex((row) => row.id === payload.message.id)
        if (payload.kind === 'combo') {
          if (index < 0) return [payload.message, ...prev]
          const next = prev.slice()
          next[index] = payload.message
          return next
        }
        if (index >= 0) {
          const next = prev.slice()
          next[index] = payload.message
          return next
        }
        return [payload.message, ...prev].slice(0, 2000)
      })

      if (payload.kind === 'new' && payload.mapping) {
        const bridge = tkRef.current
        if (payload.mapping.vconnect_uid && bridge.vconnectEnabled) {
          bridge.activateTrigger(payload.mapping.vconnect_uid)
        }
        if (payload.mapping.tits_uid && bridge.titsEnabled) {
          bridge.activateTitsTrigger(payload.mapping.tits_uid)
        }
      }

      scheduleDerivedRefresh()
    })

    const offStatus = api.onStatus((next) => {
      setStatus(next)
      if (next.error) setNotice({ text: next.error, kind: 'err' })
      else if (next.polling) setNotice({ text: 'Tracking live.', kind: 'ok' })
    })

    return () => {
      offEvent()
      offStatus()
    }
  }, [api, scheduleDerivedRefresh])

  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
  }, [])

  const saveConfig = useCallback(
    async (partial: Partial<YouTubeConfig>) => {
      if (!api) return null
      const next = await api.setConfig(partial).catch(() => null)
      if (next) {
        setConfigState(next)
        const quotaSnapshot = await api.getQuota().catch(() => null)
        if (quotaSnapshot) setQuota(quotaSnapshot)
      }
      return next
    },
    [api]
  )

  const start = useCallback(
    async (partial?: Partial<YouTubeConfig>) => {
      if (!api) return
      setBusy(true)
      setNotice({ text: 'Resolving liveChatId and pulling recent chat history...', kind: 'info' })
      const next = await api.start(partial).catch((error: unknown) => {
        setNotice({ text: readableError(error), kind: 'err' })
        return null
      })
      if (next) setStatus(next)
      await Promise.all([reloadMessages(), reloadAll()])
      setNotice((current) =>
        current.kind === 'err'
          ? current
          : { text: 'Reading chat history, then polling on the API interval.', kind: 'ok' }
      )
      setBusy(false)
    },
    [api, reloadAll, reloadMessages]
  )

  const stop = useCallback(async () => {
    if (!api) return
    const next = await api.stop().catch(() => null)
    if (next) setStatus(next)
    setNotice({ text: 'Polling stopped. Captured gifts stay in the log.', kind: 'info' })
  }, [api])

  /** "Who is live right now?" - resolves the handle without starting the poll. */
  const preview = useCallback(
    async (partial?: Partial<YouTubeConfig>) => {
      if (!api) return null
      setBusy(true)
      setNotice({ text: 'Looking up the channel and whatever is live right now...', kind: 'info' })
      const target = await api.preview(partial).catch((error: unknown) => {
        setNotice({ text: readableError(error), kind: 'err' })
        return null
      })
      if (target) {
        setPreviewTarget(target)
        setNotice({ text: `${target.channelTitle} is live: ${target.title}`, kind: 'ok' })
        const next = await api.getStatus().catch(() => null)
        if (next) setStatus(next)
      }
      setBusy(false)
      return target
    },
    [api]
  )

  const clearLog = useCallback(async () => {
    if (!api) return
    const nextStats = await api.clearLog().catch(() => null)
    if (nextStats) setStats(nextStats)
    setMessages([])
    setGiftNames([])
    const next = await api.getStatus().catch(() => null)
    if (next) setStatus(next)
    setNotice({ text: 'Gift log cleared. Supporters and mappings were left untouched.', kind: 'ok' })
  }, [api])

  const resetQuota = useCallback(async () => {
    if (!api) return
    const next = await api.resetQuota().catch(() => null)
    if (next) setQuota(next)
    setNotice({ text: 'Quota counter reset for the current Pacific-time day; key cooldowns cleared.', kind: 'ok' })
  }, [api])

  const exportLog = useCallback(
    async (format: 'csv' | 'json') => {
      if (!api) return
      const result = await api.export(format).catch(() => null)
      if (!result) return
      setNotice({
        text: result.saved
          ? `Exported ${result.count} message(s) to ${result.path}.`
          : `Export cancelled (${result.count} message(s) in the log).`,
        kind: result.saved ? 'ok' : 'info'
      })
    },
    [api]
  )

  const setMapping = useCallback(
    async (giftName: string, vconnectUid: string | null, titsUid: string | null) => {
      if (!api || !giftName.trim()) return
      const rows = await api.setMapping(giftName.trim(), vconnectUid, titsUid).catch(() => null)
      if (rows) setMappings(rows)
    },
    [api]
  )

  const deleteMapping = useCallback(
    async (giftName: string) => {
      if (!api) return
      const rows = await api.deleteMapping(giftName).catch(() => null)
      if (rows) setMappings(rows)
    },
    [api]
  )

  const mappingFor = useCallback(
    (giftName: string) => mappings.find((row) => row.gift_name.toLowerCase() === giftName.toLowerCase()) ?? null,
    [mappings]
  )

  return {
    available: !!api,
    config,
    status,
    stats,
    quota,
    messages,
    mappings,
    giftNames,
    notice,
    previewTarget,
    busy,
    loaded,
    saveConfig,
    start,
    preview,
    stop,
    clearLog,
    resetQuota,
    exportLog,
    setMapping,
    deleteMapping,
    mappingFor,
    reloadMessages,
    reloadAll
  }
}

export type YouTubeTracker = ReturnType<typeof useYouTubeTracker>
