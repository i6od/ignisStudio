import { useCallback, useEffect, useRef, useState } from 'react'
import TikfinitySystem, {
  type Trigger,
  type LikeMapping,
  type StatusEvent
} from '@tikfinity'

export interface FeedEvent {
  type: 'gift' | 'follow' | 'subscribe' | 'like' | 'comment' | 'trigger'
  message: string
  detail: string
  ts: number
}

export interface SupporterSummary {
  total: number
  topGifter: { nickname: string | null; count: number } | null
  topLiker: { nickname: string | null; count: number } | null
  topCommenter: { nickname: string | null; count: number } | null
}

export type FireStatus = 'pending' | 'success' | 'error' | 'idle'

export interface FireResult {
  uid: string
  status: FireStatus
  error?: string
  ts: number
}

const URL_STORAGE_KEY = 'vconnectTikTokUrls'

function loadUrls(): { vconnectUrl?: string; titsUrl?: string; tiktokUrl?: string } {
  try {
    const raw = localStorage.getItem(URL_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // VConnect serves on the bare port (no path) — strip any /websocket path
      // saved by an older build so the migration is seamless. (TITS DOES use a
      // /websocket path, so its URL is never stripped.)
      if (parsed.vconnectUrl) {
        try {
          const u = new URL(parsed.vconnectUrl)
          u.pathname = ''
          u.search = ''
          u.hash = ''
          parsed.vconnectUrl = u.toString().replace(/\/$/, '')
        } catch {
          /* keep as-is */
        }
      }
      // Old builds used the LAN Tikfinity address — migrate to localhost default
      if (parsed.tiktokUrl && parsed.tiktokUrl.includes('192.168.12.22')) {
        delete parsed.tiktokUrl
      }
      return parsed
    }
  } catch {
    /* ignore */
  }
  return {}
}

export function useTikfinity() {
  const systemRef = useRef<TikfinitySystem | null>(null)

  const [urls, setUrls] = useState<{ vconnectUrl: string; titsUrl: string; tiktokUrl: string }>(() => {
    const saved = loadUrls()
    return {
      vconnectUrl: saved.vconnectUrl || 'ws://localhost:39542',
      titsUrl: saved.titsUrl || 'ws://localhost:42069/websocket',
      tiktokUrl: saved.tiktokUrl || 'ws://localhost:21213'
    }
  })

  const [vconnectStatus, setVconnectStatus] = useState('Disconnected')
  const [titsStatus, setTitsStatus] = useState('Disconnected')
  const [tiktokStatus, setTiktokStatus] = useState('Disconnected')
  const [triggers, setTriggers] = useState<Trigger[]>([])
  const [giftMappings, setGiftMappings] = useState<[string, string][]>([])
  const [likeMappings, setLikeMappings] = useState<LikeMapping[]>([])
  const [followUid, setFollowUidState] = useState<string | null>(null)
  const [subscribeUid, setSubscribeUidState] = useState<string | null>(null)
  const [titsTriggers, setTitsTriggers] = useState<Trigger[]>([])
  const [titsGiftMappings, setTitsGiftMappings] = useState<[string, string][]>([])
  const [titsLikeMappings, setTitsLikeMappings] = useState<LikeMapping[]>([])
  const [titsFollowId, setTitsFollowIdState] = useState<string | null>(null)
  const [titsSubscribeId, setTitsSubscribeIdState] = useState<string | null>(null)
  const [titsUsersTracked, setTitsUsersTracked] = useState(0)
  const [titsTopLiker, setTitsTopLiker] = useState<{ name: string; count: number } | null>(null)
  const [vconnectEnabled, setVconnectEnabledState] = useState(true)
  const [titsEnabled, setTitsEnabledState] = useState(true)
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [usersTracked, setUsersTracked] = useState(0)
  const [topLiker, setTopLiker] = useState<{ name: string; count: number } | null>(null)
  const [supporterSummary, setSupporterSummary] = useState<SupporterSummary | null>(null)
  const [fireResults, setFireResults] = useState<Record<string, FireResult>>({})
  const [fireResultsTits, setFireResultsTits] = useState<Record<string, FireResult>>({})

  useEffect(() => {
    window.vconnect?.supporters
      .summary()
      .then(s => {
        setSupporterSummary({
          total: s.total,
          topGifter: s.topGifter ? { nickname: s.topGifter.nickname, count: s.topGifter.diamonds } : null,
          topLiker: s.topLiker ? { nickname: s.topLiker.nickname, count: s.topLiker.likes_count } : null,
          topCommenter: s.topCommenter ? { nickname: s.topCommenter.nickname, count: s.topCommenter.comments_count } : null
        })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const system = new TikfinitySystem({
      vconnectUrl: urls.vconnectUrl,
      titsUrl: urls.titsUrl,
      tiktokUrl: urls.tiktokUrl
    })
    systemRef.current = system

    const pushEvent = (evt: Omit<FeedEvent, 'ts'>) => {
      setEvents(prev => [...prev.slice(-49), { ...evt, ts: Date.now() }])
    }

    const onVcStatus = (data: unknown) => setVconnectStatus((data as StatusEvent).status)
    const onTtStatus = (data: unknown) => setTiktokStatus((data as StatusEvent).status)
    const onTriggers = (data: unknown) => setTriggers(data as Trigger[])
    const onMappingChanged = (data: unknown) => {
      const map = data as Map<string, string>
      setGiftMappings(Array.from(map.entries()))
    }
    const refreshSupporterSummary = () => {
      window.vconnect?.supporters.summary().then(s => {
        setSupporterSummary({
          total: s.total,
          topGifter: s.topGifter ? { nickname: s.topGifter.nickname, count: s.topGifter.diamonds } : null,
          topLiker: s.topLiker ? { nickname: s.topLiker.nickname, count: s.topLiker.likes_count } : null,
          topCommenter: s.topCommenter ? { nickname: s.topCommenter.nickname, count: s.topCommenter.comments_count } : null
        })
      }).catch(() => {})
    }

    const onGift = (data: unknown) => {
      const g = data as { nickname?: string; uniqueId?: string; userId?: string; profilePictureUrl?: string; giftName?: string; repeatCount?: number; diamondCount?: number }
      pushEvent({ type: 'gift', message: 'Gift', detail: `${g.nickname ?? '?'} sent ${g.giftName ?? '?'} x${g.repeatCount ?? 1}` })
      window.vconnect?.supporters.record({
        type: 'gift',
        userId: g.userId,
        uniqueId: g.uniqueId,
        nickname: g.nickname,
        profilePictureUrl: g.profilePictureUrl,
        repeatCount: g.repeatCount,
        diamondCount: g.diamondCount
      }).then(refreshSupporterSummary).catch(() => {})
    }
    const onFollow = (data: unknown) => {
      const f = data as { nickname?: string; uniqueId?: string; userId?: string; profilePictureUrl?: string }
      pushEvent({ type: 'follow', message: 'Follow', detail: `${f.uniqueId ?? f.nickname ?? '?'} followed` })
      window.vconnect?.supporters.record({
        type: 'follow',
        userId: f.userId,
        uniqueId: f.uniqueId,
        nickname: f.nickname,
        profilePictureUrl: f.profilePictureUrl
      }).then(refreshSupporterSummary).catch(() => {})
    }
    const onSubscribe = (data: unknown) => {
      const s = data as { nickname?: string; uniqueId?: string; userId?: string; profilePictureUrl?: string; subMonth?: number }
      pushEvent({ type: 'subscribe', message: 'Subscribe', detail: `${s.nickname ?? s.uniqueId ?? '?'} subscribed` })
      window.vconnect?.supporters.record({
        type: 'subscribe',
        userId: s.userId,
        uniqueId: s.uniqueId,
        nickname: s.nickname,
        profilePictureUrl: s.profilePictureUrl
      }).then(refreshSupporterSummary).catch(() => {})
    }
    const onLike = (data: unknown) => {
      const l = data as { nickname?: string; uniqueId?: string; userId?: string; profilePictureUrl?: string; likeCount?: number }
      pushEvent({ type: 'like', message: 'Like', detail: `${l.nickname ?? l.uniqueId ?? '?'} liked x${l.likeCount ?? 1}` })
      window.vconnect?.supporters.record({
        type: 'like',
        userId: l.userId,
        uniqueId: l.uniqueId,
        nickname: l.nickname,
        profilePictureUrl: l.profilePictureUrl,
        likeCount: l.likeCount
      }).then(refreshSupporterSummary).catch(() => {})
    }
    const onComment = (data: unknown) => {
      const c = data as { nickname?: string; uniqueId?: string; userId?: string; profilePictureUrl?: string; comment?: string; message?: string }
      const text = (c.comment ?? c.message ?? '').toString()
      pushEvent({ type: 'comment', message: 'Comment', detail: `${c.nickname ?? c.uniqueId ?? '?'}: ${text.length > 60 ? text.slice(0, 57) + '...' : text}` })
      window.vconnect?.supporters.record({
        type: 'comment',
        userId: c.userId,
        uniqueId: c.uniqueId,
        nickname: c.nickname,
        profilePictureUrl: c.profilePictureUrl
      }).then(refreshSupporterSummary).catch(() => {})
    }
    const onTriggerFired = (data: unknown) => {
      const t = data as { uid?: string; name?: string }
      pushEvent({ type: 'trigger', message: 'Trigger fired', detail: `${t.name ?? t.uid ?? '?'}` })
      const uid = t.uid
      if (uid) {
        setFireResults(prev => ({
          ...prev,
          [uid]: { uid, status: 'pending', ts: Date.now() }
        }))
      }
    }
    const onTriggerActivated = (data: unknown) => {
      const t = data as { uid?: string; name?: string; success?: boolean; error?: string | null; message?: string }
      const uid = t.uid
      if (uid) {
        setFireResults(prev => ({
          ...prev,
          [uid]: {
            uid,
            status: t.success === false ? 'error' : 'success',
            error: t.error ?? t.message ?? undefined,
            ts: Date.now()
          }
        }))
      }
    }
    const onTriggerStarted = (data: unknown) => {
      const t = data as { uid?: string; name?: string }
      const uid = t.uid
      if (uid) {
        setFireResults(prev => ({
          ...prev,
          [uid]: { uid, status: 'success', ts: Date.now() }
        }))
      }
      pushEvent({ type: 'trigger', message: 'Trigger running', detail: `${t.name ?? t.uid ?? '?'}` })
    }
    const onTriggerEnded = (data: unknown) => {
      const t = data as { uid?: string; name?: string; success?: boolean; error?: string | null }
      const uid = t.uid
      if (uid) {
        setFireResults(prev => ({
          ...prev,
          [uid]: {
            uid,
            status: t.success === false ? 'error' : 'success',
            error: t.error ?? undefined,
            ts: Date.now()
          }
        }))
      }
    }
    const onVconnectError = (data: unknown) => {
      const e = data as { message?: string }
      pushEvent({ type: 'trigger', message: 'VConnect error', detail: e.message ?? 'Unknown error' })
    }
    const onLikeStats = (data: unknown) => {
      const stats = data as { usersTracked: number; topLikerName: string; topLikerCount: number }
      setUsersTracked(stats.usersTracked)
      setTopLiker({ name: stats.topLikerName, count: stats.topLikerCount })
    }

    const onTitsStatus = (data: unknown) => setTitsStatus((data as StatusEvent).status)
    const onTitsTriggers = (data: unknown) => setTitsTriggers(data as Trigger[])
    const onTitsMappingChanged = (data: unknown) => {
      const map = data as Map<string, string>
      setTitsGiftMappings(Array.from(map.entries()))
    }
    const onTitsTriggerFired = (data: unknown) => {
      const t = data as { uid?: string; name?: string }
      pushEvent({ type: 'trigger', message: 'TITS trigger fired', detail: `${t.name ?? t.uid ?? '?'}` })
      const uid = t.uid
      if (uid) {
        // TITS has no activate-response message — mark success as soon as the
        // request went out on the socket.
        setFireResultsTits(prev => ({
          ...prev,
          [uid]: { uid, status: 'success', ts: Date.now() }
        }))
      }
    }
    const onTitsTriggerActivated = (data: unknown) => {
      const t = data as { triggerID?: string; uid?: string; success?: boolean; error?: string | null; message?: string }
      const uid = t.triggerID ?? t.uid
      if (uid) {
        setFireResultsTits(prev => ({
          ...prev,
          [uid]: {
            uid,
            status: t.success === false ? 'error' : 'success',
            error: t.error ?? t.message ?? undefined,
            ts: Date.now()
          }
        }))
      }
    }
    const onTitsLikeStats = (data: unknown) => {
      const stats = data as { usersTracked: number; topLikerName: string; topLikerCount: number }
      setTitsUsersTracked(stats.usersTracked)
      setTitsTopLiker({ name: stats.topLikerName, count: stats.topLikerCount })
    }
    const onApiToggles = (data: unknown) => {
      const t = data as { vconnectEnabled: boolean; titsEnabled: boolean }
      setVconnectEnabledState(t.vconnectEnabled)
      setTitsEnabledState(t.titsEnabled)
    }

    system.on('vconnectStatus', onVcStatus)
    system.on('titsStatus', onTitsStatus)
    system.on('tiktokStatus', onTtStatus)
    system.on('triggersLoaded', onTriggers)
    system.on('titsTriggersLoaded', onTitsTriggers)
    system.on('mappingChanged', onMappingChanged)
    system.on('titsMappingChanged', onTitsMappingChanged)
    system.on('gift', onGift)
    system.on('follow', onFollow)
    system.on('subscribe', onSubscribe)
    system.on('like', onLike)
    system.on('comment', onComment)
    system.on('triggerFired', onTriggerFired)
    system.on('triggerActivated', onTriggerActivated)
    system.on('triggerStarted', onTriggerStarted)
    system.on('triggerEnded', onTriggerEnded)
    system.on('vconnectError', onVconnectError)
    system.on('likeStats', onLikeStats)
    system.on('titsTriggerFired', onTitsTriggerFired)
    system.on('titsTriggerActivated', onTitsTriggerActivated)
    system.on('titsLikeStats', onTitsLikeStats)
    system.on('apiTogglesChanged', onApiToggles)

    setTriggers(system.getTriggers())
    setGiftMappings(Array.from(system.getGiftMappings().entries()))
    setLikeMappings(system.getLikeMappings())
    setFollowUidState(system.followUid)
    setSubscribeUidState(system.subscribeUid)
    setTitsTriggers(system.getTitsTriggers())
    setTitsGiftMappings(Array.from(system.getTitsGiftMappings().entries()))
    setTitsLikeMappings(system.getTitsLikeMappings())
    setTitsFollowIdState(system.titsFollowId)
    setTitsSubscribeIdState(system.titsSubscribeId)
    setVconnectEnabledState(system.vconnectEnabled)
    setTitsEnabledState(system.titsEnabled)

    return () => {
    system.off('vconnectStatus', onVcStatus)
    system.off('titsStatus', onTitsStatus)
    system.off('tiktokStatus', onTtStatus)
    system.off('triggersLoaded', onTriggers)
    system.off('titsTriggersLoaded', onTitsTriggers)
    system.off('mappingChanged', onMappingChanged)
    system.off('titsMappingChanged', onTitsMappingChanged)
      system.off('gift', onGift)
      system.off('follow', onFollow)
      system.off('subscribe', onSubscribe)
      system.off('like', onLike)
      system.off('comment', onComment)
      system.off('triggerFired', onTriggerFired)
      system.off('triggerActivated', onTriggerActivated)
      system.off('triggerStarted', onTriggerStarted)
      system.off('triggerEnded', onTriggerEnded)
    system.off('vconnectError', onVconnectError)
    system.off('likeStats', onLikeStats)
    system.off('titsTriggerFired', onTitsTriggerFired)
    system.off('titsTriggerActivated', onTitsTriggerActivated)
    system.off('titsLikeStats', onTitsLikeStats)
    system.off('apiTogglesChanged', onApiToggles)
    // KILL the old sockets too — otherwise every effect re-run (e.g. saving
    // endpoints) leaves the previous system's WebSockets open against the same
    // relay/VConnect, and a single gift gets processed by BOTH systems -> the
    // trigger fires twice. Disconnect nulls onclose before close(), so the
    // auto-reconnect loop doesn't resurrect it.
    system.disconnectVConnect()
    system.disconnectTits()
    system.disconnectTikfinity()
    }
  }, [urls.vconnectUrl, urls.titsUrl, urls.tiktokUrl])

  const connect = useCallback(() => {
    const system = systemRef.current
    if (!system) return
    if (system.vconnectEnabled) system.connectVConnect()
    if (system.titsEnabled) system.connectTits()
    system.connectTikfinity()
  }, [])

  const disconnect = useCallback(() => {
    systemRef.current?.disconnectVConnect()
    systemRef.current?.disconnectTits()
    systemRef.current?.disconnectTikfinity()
  }, [])

  const setVconnectEnabled = useCallback((enabled: boolean) => {
    const system = systemRef.current
    if (!system) return
    system.setVconnectEnabled(enabled)
    setVconnectEnabledState(enabled)
    if (enabled) system.connectVConnect()
  }, [])

  const setTitsEnabled = useCallback((enabled: boolean) => {
    const system = systemRef.current
    if (!system) return
    system.setTitsEnabled(enabled)
    setTitsEnabledState(enabled)
    if (enabled) system.connectTits()
  }, [])

  const refreshTriggers = useCallback(() => {
    systemRef.current?.requestTriggerList()
  }, [])

  const activateTrigger = useCallback((uid: string) => {
    systemRef.current?.sendTrigger(uid)
  }, [])

  const refreshTitsTriggers = useCallback(() => {
    systemRef.current?.requestTitsTriggerList()
  }, [])

  const activateTitsTrigger = useCallback((uid: string) => {
    systemRef.current?.sendTitsTrigger(uid)
  }, [])

  const applyUrls = useCallback((vc: string, tits: string, tt: string) => {
    setUrls({ vconnectUrl: vc, titsUrl: tits, tiktokUrl: tt })
    localStorage.setItem(URL_STORAGE_KEY, JSON.stringify({ vconnectUrl: vc, titsUrl: tits, tiktokUrl: tt }))
  }, [])

  const addGiftMapping = useCallback((giftName: string, triggerId: string) => {
    return systemRef.current?.addGiftMapping(giftName, triggerId) ?? false
  }, [])

  const removeGiftMapping = useCallback((giftName: string) => {
    systemRef.current?.removeGiftMapping(giftName)
  }, [])

  const setFollowUid = useCallback((uid: string | null) => {
    systemRef.current?.setFollowUid(uid)
    setFollowUidState(uid)
  }, [])

  const setSubscribeUid = useCallback((uid: string | null) => {
    systemRef.current?.setSubscribeUid(uid)
    setSubscribeUidState(uid)
  }, [])

  const addLikeMapping = useCallback((count: number, triggerId: string) => {
    return systemRef.current?.addLikeMapping(count, triggerId) ?? false
  }, [])

  const removeLikeMapping = useCallback((index: number) => {
    systemRef.current?.removeLikeMapping(index)
  }, [])

  const clearLikeTracking = useCallback(() => {
    systemRef.current?.clearLikeTracking()
  }, [])

  const getTriggerName = useCallback((uid: string) => {
    return systemRef.current?.getTriggerName(uid) ?? uid
  }, [])

  const addTitsGiftMapping = useCallback((giftName: string, triggerId: string) => {
    return systemRef.current?.addTitsGiftMapping(giftName, triggerId) ?? false
  }, [])

  const removeTitsGiftMapping = useCallback((giftName: string) => {
    systemRef.current?.removeTitsGiftMapping(giftName)
  }, [])

  const setTitsFollowId = useCallback((uid: string | null) => {
    systemRef.current?.setTitsFollowId(uid)
    setTitsFollowIdState(uid)
  }, [])

  const setTitsSubscribeId = useCallback((uid: string | null) => {
    systemRef.current?.setTitsSubscribeId(uid)
    setTitsSubscribeIdState(uid)
  }, [])

  const addTitsLikeMapping = useCallback((count: number, triggerId: string) => {
    return systemRef.current?.addTitsLikeMapping(count, triggerId) ?? false
  }, [])

  const removeTitsLikeMapping = useCallback((index: number) => {
    systemRef.current?.removeTitsLikeMapping(index)
  }, [])

  const clearTitsLikeTracking = useCallback(() => {
    systemRef.current?.clearTitsLikeTracking()
  }, [])

  const getTitsTriggerName = useCallback((uid: string) => {
    return systemRef.current?.getTitsTriggerName(uid) ?? uid
  }, [])

  const getTopSupporters = useCallback(async (metric: 'gifts' | 'likes' | 'comments', limit = 10) => {
    try {
      return (await window.vconnect?.supporters.top(metric, limit)) ?? []
    } catch {
      return []
    }
  }, [])

  return {
    urls,
    vconnectStatus,
    titsStatus,
    tiktokStatus,
    triggers,
    giftMappings,
    likeMappings,
    followUid,
    subscribeUid,
    titsTriggers,
    titsGiftMappings,
    titsLikeMappings,
    titsFollowId,
    titsSubscribeId,
    titsUsersTracked,
    titsTopLiker,
    vconnectEnabled,
    titsEnabled,
    events,
    usersTracked,
    topLiker,
    connect,
    disconnect,
    setVconnectEnabled,
    setTitsEnabled,
    refreshTriggers,
    activateTrigger,
    refreshTitsTriggers,
    activateTitsTrigger,
    applyUrls,
    addGiftMapping,
    removeGiftMapping,
    setFollowUid,
    setSubscribeUid,
    addTitsGiftMapping,
    removeTitsGiftMapping,
    setTitsFollowId,
    setTitsSubscribeId,
    addTitsLikeMapping,
    removeTitsLikeMapping,
    addLikeMapping,
    removeLikeMapping,
    clearLikeTracking,
    clearTitsLikeTracking,
    getTriggerName,
    getTitsTriggerName,
    fireResults,
    fireResultsTits,
    supporterSummary,
    getTopSupporters,
    refreshSupporterSummary: () => {
      window.vconnect?.supporters.summary().then(s => {
        setSupporterSummary({
          total: s.total,
          topGifter: s.topGifter ? { nickname: s.topGifter.nickname, count: s.topGifter.diamonds } : null,
          topLiker: s.topLiker ? { nickname: s.topLiker.nickname, count: s.topLiker.likes_count } : null,
          topCommenter: s.topCommenter ? { nickname: s.topCommenter.nickname, count: s.topCommenter.comments_count } : null
        })
      }).catch(() => {})
    }
  }
}