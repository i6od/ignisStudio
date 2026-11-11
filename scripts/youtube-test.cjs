/**
 * Offline end-to-end test for the YouTube gift tracker (runs inside Electron):
 *
 *   npx electron scripts/youtube-test.cjs
 *
 * fetch() is replaced with a scripted YouTube Data API mock, so this exercises
 * the real main-process code - liveChatId resolution, quota charging, key
 * rotation after a rate limit, combo merging, SQLite storage and supporter
 * recording - without touching the network or your real API keys.
 */

const { app } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(os.tmpdir(), 'vc-youtube-test-result.txt')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-youtube-test-'))

process.env.VCONNECT_DB_PATH = path.join(dir, 'youtube-test.db')
app.setPath('userData', path.join(dir, 'userData'))

let failures = 0
const calls = []

function report(line) {
  fs.appendFileSync(OUT, line + '\n')
  console.log(line)
}

function check(name, condition, detail) {
  if (condition) {
    report(`PASS: ${name}`)
  } else {
    failures++
    report(`FAIL: ${name}${detail !== undefined ? ` - got ${detail}` : ''}`)
  }
}

setTimeout(() => {
  report('TIMEOUT: test did not finish in 90s')
  app.exit(2)
}, 90000)

/* ---------------- scripted API mock ---------------- */

function giftMessage(id, name, jewels, comboCount, author, channelId, publishedAt) {
  return {
    id,
    snippet: {
      liveChatId: 'LC_TEST',
      type: 'giftEvent',
      publishedAt,
      authorChannelId: channelId,
      giftDetails: {
        giftName: name,
        jewelsAmount: String(jewels),
        comboCount: String(comboCount),
        giftUrl: 'https://www.gstatic.com/youtube/img/tv/gift_heart_1x.png',
        hasVisualEffect: comboCount > 0,
        giftDuration: { seconds: '15' },
        altText: `${name} x${comboCount + 1}`,
        language: 'en'
      }
    },
    authorDetails: {
      displayName: author,
      channelId,
      channelUrl: `https://www.youtube.com/channel/${channelId}`,
      profileImageUrl: 'https://yt3.ggpht.com/avatar.jpg',
      isChatOwner: 'false',
      isChatModerator: 'false'
    }
  }
}

const PAGE_ONE = {
  pollingIntervalMillis: 1000,
  items: [
    giftMessage('m1', 'Heart', 30, 1, 'Alice', 'UC_alice', '2026-11-01T10:00:00.000Z'),
    giftMessage('m2', 'Rocket', 10, 0, 'Alice', 'UC_alice', '2026-11-01T10:00:05.000Z'),
    {
      id: 't1',
      snippet: {
        liveChatId: 'LC_TEST',
        type: 'textMessageEvent',
        publishedAt: '2026-11-01T10:00:06.000Z',
        textMessageDetails: { messageText: 'hello' }
      },
      authorDetails: { displayName: 'Bob', channelId: 'UC_bob' }
    }
  ],
  nextPageToken: 'PAGE2'
}

// YouTube reuses m1 to raise its combo: same message id, higher comboCount.
const PAGE_TWO = {
  pollingIntervalMillis: 1000,
  items: [giftMessage('m1', 'Heart', 30, 5, 'Alice', 'UC_alice', '2026-11-01T10:00:00.000Z')]
}

const LIVE_POLL = {
  pollingIntervalMillis: 1000,
  items: [giftMessage('m3', 'Heart', 30, 0, 'Carol', 'UC_carol', '2026-11-01T10:01:00.000Z')]
}

function installFetch() {
  let livePolls = 0
  let phase = 'history'
  const mock = { noLive: false, endChatOnPoll: null, livePollCount: 0 }

  globalThis.fetch = async (url) => {
    const u = new URL(url)
    const endpoint = u.pathname.replace('/youtube/v3/', '')
    const key = u.searchParams.get('key')
    const pageToken = u.searchParams.get('pageToken')
    calls.push({
      endpoint,
      key,
      pageToken,
      at: Date.now(),
      forHandle: u.searchParams.get('forHandle'),
      channelId: u.searchParams.get('channelId'),
      id: u.searchParams.get('id'),
      playlistId: u.searchParams.get('playlistId'),
      broadcastStatus: u.searchParams.get('broadcastStatus')
    })

    const json = (body, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body)
    })

    if (endpoint === 'channels') {
      if (u.searchParams.get('forHandle') !== '@xuhsy') {
        return json({ error: { message: 'No channel for that handle.', errors: [{ reason: 'channelNotFound' }] } }, 404)
      }
      return json({ items: [{ id: 'UC_chan', snippet: { title: 'Xuhsy' } }] })
    }

    if (endpoint === 'playlistItems') {
      if (mock.noLive) return json({ items: [] })
      return json({ items: [{ contentDetails: { videoId: 'VIDTEST1234' } }] })
    }

    if (endpoint === 'search') {
      if (mock.noLive) return json({ items: [] })
      return json({
        items: [{ id: { kind: 'video', videoId: 'VIDTEST1234' }, snippet: { title: 'Friday night stream' } }]
      })
    }

    if (endpoint === 'videos') {
      return json({
        items: [
          {
            id: 'VIDTEST1234',
            snippet: { title: 'Friday night stream', channelId: 'UC_chan', liveBroadcastContent: 'live' },
            liveStreamingDetails: { activeLiveChatId: 'LC_TEST' }
          }
        ]
      })
    }

    if (endpoint === 'liveChat/messages') {
      if (pageToken === 'PAGE2') {
        phase = 'live'
        return json(PAGE_TWO)
      }
      if (pageToken) return json({ pollingIntervalMillis: 1000, items: [] })
      if (phase === 'history') return json(PAGE_ONE)

      livePolls++
      mock.livePollCount = livePolls
      // "The broadcast just ended" - armed by the handle-mode test so it lands
      // on a scheduled poll, not on the history pull that opens a session.
      if (mock.endChatOnPoll && livePolls === mock.endChatOnPoll) {
        mock.endChatOnPoll = null
        return json(
          { error: { message: 'Live chat has ended', errors: [{ reason: 'liveChatEnded' }] } },
          403
        )
      }
      // First live poll: key 1 is rate limited, so the pool must rotate to key 2.
      if (livePolls === 1) {
        return json({ error: { message: 'Quota per day exceeded.', errors: [{ reason: 'quotaExceeded' }] } }, 403)
      }
      return json(LIVE_POLL)
    }

    return json({ error: { message: `unexpected endpoint ${endpoint}` } }, 400)
  }

  return mock
}

/* ---------------- run ---------------- */

app.whenReady().then(async () => {
  report('STEP: bundling the main-process YouTube modules')
  const { execSync } = require('child_process')
  execSync(
    `${path.join(ROOT, 'node_modules', '.bin', 'esbuild')} scripts/youtube-test-entry.ts ` +
      '--bundle --format=cjs --platform=node --packages=external --outfile=out/main/youtube-test-bundle.cjs',
    { cwd: ROOT, stdio: 'ignore' }
  )

  const mock = installFetch()
  // Handle mode normally waits 60s before looking for the next live; shorten it
  // so the auto-follow path is actually exercised here.
  process.env.VCONNECT_YT_RECHECK_MS = '1500'
  const yt = require('../out/main/youtube-test-bundle.cjs')

  const waitFor = async (predicate, timeoutMs = 12000) => {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const value = predicate()
      if (value) return value
      if (Date.now() > deadline) return null
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  const events = []
  yt.setYouTubeHandlers({ onEvent: (payload) => events.push(payload), onStatus: () => {} })

  // The UI hardcodes these, so the main-process defaults are part of the contract.
  const fresh = yt.getYouTubeConfig()
  check('default quota cap is 10000 per key', fresh.quotaCap === 10000, fresh.quotaCap)
  check('default page size is 100 messages', fresh.maxResults === 100, fresh.maxResults)
  check('default poll interval is 30s', fresh.pollSec === 30, fresh.pollSec)
  check('default capture keeps every chat event type', fresh.typeFilter === 'all', fresh.typeFilter)

  yt.setYouTubeConfig({
    keys: ['KEY_ONE', 'KEY_TWO'],
    quotaCap: 10000,
    pollSec: 5,
    maxResults: 1000,
    hl: 'en',
    typeFilter: 'gifts',
    jewelValue: 0.01,
    videoInput: 'https://www.youtube.com/watch?v=VIDTEST1234',
    liveChatId: ''
  })
  const partial = yt.setYouTubeConfig({ videoInput: 'https://youtu.be/VIDTEST1234' })
  check('omitting a numeric field does not clamp the stored default', partial.maxResults === 1000, partial.maxResults)
  yt.setYouTubeConfig({ maxResults: 1000, pollSec: 5, typeFilter: 'gifts' })
  yt.upsertMapping('Heart', 'trg_heart', 'tits_heart')

  report('STEP: extractVideoId')
  check('watch URL', yt.extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ') === 'dQw4w9WgXcQ')
  check('short URL', yt.extractVideoId('https://youtu.be/dQw4w9WgXcQ') === 'dQw4w9WgXcQ')
  check('shorts URL', yt.extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ') === 'dQw4w9WgXcQ')
  check('live URL', yt.extractVideoId('https://www.youtube.com/live/dQw4w9WgXcQ') === 'dQw4w9WgXcQ')
  check('bare id', yt.extractVideoId('dQw4w9WgXcQ') === 'dQw4w9WgXcQ')
  check('garbage', yt.extractVideoId('not a video') === null)

  report('STEP: starting the tracker')
  yt.startYouTube()

  // videos + history page 1 at t0, history page 2 at ~5s, first live poll at ~10s
  await new Promise((r) => setTimeout(r, 13000))
  yt.stopYouTubePolling()

  report('')
  report('--- API calls ---')
  for (const c of calls) report(`  ${c.endpoint}${c.pageToken ? ` page=${c.pageToken}` : ''} key=${c.key}`)

  const messages = yt.listYouTubeMessages(500)
  const stats = yt.getYouTubeStats()
  const quota = yt.getQuotaSnapshot()
  const status = yt.getStatus()
  const chatCalls = calls.filter((c) => c.endpoint === 'liveChat/messages')
  const m1 = messages.find((m) => m.id === 'm1')

  report(`status: ${JSON.stringify(status)}`)

  check('liveChatId resolved from the video', status.liveChatId === 'LC_TEST', status.liveChatId)
  check('stream title captured', status.streamTitle === 'Friday night stream', status.streamTitle)
  check('videos lookup charged 1 unit', (quota.used['KEY_ONE'] ?? 0) >= 1, quota.used['KEY_ONE'])
  check('liveChatMessages.list charged 5 units per page', (quota.used['KEY_ONE'] ?? 0) >= 11, quota.used['KEY_ONE'])
  check('history walked the nextPageToken once', chatCalls.filter((c) => c.pageToken === 'PAGE2').length === 1)
  check('text messages filtered out', !messages.some((m) => m.type === 'textMessageEvent'))
  check('three distinct gift messages stored', stats.giftCount === 3, stats.giftCount)
  check('no duplicate row for the combo update', messages.length === 3, messages.length)
  check('combo merge kept the highest comboCount', m1?.combo_count === 5, m1?.combo_count)
  check('jewels not double counted on a combo update', stats.totalJewels === 70, stats.totalJewels)
  check('max combo reported', stats.maxCombo === 5, stats.maxCombo)
  check('unique gifters counted', stats.uniqueSenders === 2, stats.uniqueSenders)
  check(
    'byGift breakdown grouped',
    stats.byGift.some((g) => g.label === 'Heart' && g.jewels === 60 && g.count === 2),
    JSON.stringify(stats.byGift)
  )
  check('avatar + gift fields persisted', !!m1?.avatar && m1?.gift_name === 'Heart' && m1?.gift_seconds === 15, m1?.gift_name)
  check('rate limited key was cooled down', quota.cooling.some((c) => c.key === 'KEY_ONE'), JSON.stringify(quota.cooling))
  check('pool rotated to the healthy key', chatCalls.some((c) => c.key === 'KEY_TWO'))
  check('failed call still charged quota', (quota.used['KEY_ONE'] ?? 0) >= 12, quota.used['KEY_ONE'])
  check(
    'live poll respected the 5s floor',
    chatCalls.length >= 3 && chatCalls[2].at - chatCalls[1].at >= 4500,
    chatCalls.length >= 3 ? `${chatCalls[2].at - chatCalls[1].at}ms` : 'not enough calls'
  )

  report('')
  report('--- events pushed to the renderer ---')
  for (const e of events) report(`  ${e.kind} ${e.message.id} mapping=${JSON.stringify(e.mapping)}`)
  const newGifts = events.filter((e) => e.kind === 'new')
  check('every new gift emitted one event', newGifts.length === 3, newGifts.length)
  check('combo update emitted as combo, not new', events.every((e) => e.kind !== 'new' || e.message.id !== 'm1' || e.message.combo_count === 1))
  check(
    'mapped gift carried its trigger mapping',
    newGifts.some((e) => e.message.gift_name === 'Heart' && e.mapping?.vconnect_uid === 'trg_heart' && e.mapping?.tits_uid === 'tits_heart'),
    JSON.stringify(newGifts.map((e) => e.mapping))
  )
  check(
    'unmapped gift carried no mapping',
    newGifts.some((e) => e.message.gift_name === 'Rocket' && e.mapping === null),
    JSON.stringify(newGifts.map((e) => [e.message.gift_name, e.mapping]))
  )

  const summary = yt.getSummary()
  const rows = await yt.getTopSupporters('jewels', 10)
  check('YouTube gifters land in the supporters leaderboard', summary.total === 2, summary.total)
  check('supporters keyed by yt:<channelId>', rows.every((r) => r.user_key.startsWith('yt:')), JSON.stringify(rows.map((r) => r.user_key)))
  check('jewels column populated', summary.topJeweler?.jewels === 40, JSON.stringify(summary.topJeweler))
  check('gifts_count counts gift messages', rows.find((r) => r.user_key === 'yt:UC_alice')?.gifts_count === 2, JSON.stringify(rows))
  check('source column marks youtube rows', rows.every((r) => r.source === 'youtube'), JSON.stringify(rows.map((r) => r.source)))

  report('STEP: handle mode - @name to whoever is live right now')
  check('normalizeHandle adds the @', yt.normalizeHandle('xuhsy') === '@xuhsy', yt.normalizeHandle('xuhsy'))
  check(
    'normalizeHandle reads a channel URL',
    yt.normalizeHandle('https://www.youtube.com/@xuhsy/live') === '@xuhsy',
    yt.normalizeHandle('https://www.youtube.com/@xuhsy/live')
  )
  const channelId = `UC${'a'.repeat(22)}`
  check(
    'normalizeHandle keeps a UC channel id',
    yt.normalizeHandle(channelId) === channelId,
    yt.normalizeHandle(channelId)
  )
  check(
    'normalizeHandle rejects a video URL',
    yt.normalizeHandle('https://www.youtube.com/watch?v=VIDTEST1234') === null,
    yt.normalizeHandle('https://www.youtube.com/watch?v=VIDTEST1234')
  )

  yt.stopYouTubePolling()
  yt.resetSession()

  const quotaBefore = yt.getQuotaSnapshot().total
  const target = await yt.previewYouTubeLive({ handle: '@xuhsy', videoInput: '', liveChatId: '' })
  const quotaAfter = yt.getQuotaSnapshot().total
  check(
    'handle lookup found the live stream',
    target.liveChatId === 'LC_TEST' && target.videoId === 'VIDTEST1234',
    JSON.stringify(target)
  )
  check('handle lookup reported the channel', target.channelTitle === 'Xuhsy', target.channelTitle)
  const playlistCall = calls.find((c) => c.endpoint === 'playlistItems')
  check(
    'handle lookup went through the channel live-uploads playlist',
    playlistCall?.playlistId === 'UU_chan',
    playlistCall?.playlistId
  )
  check(
    'no OAuth-only endpoint is ever requested',
    calls.every((c) => c.endpoint !== 'liveBroadcasts' && c.endpoint !== 'liveStreams'),
    JSON.stringify(Array.from(new Set(calls.map((c) => c.endpoint))))
  )
  check('handle lookup cost 3 quota units', quotaAfter - quotaBefore === 3, quotaAfter - quotaBefore)

  let notLive = null
  mock.noLive = true
  try {
    await yt.previewYouTubeLive({ handle: '@xuhsy' })
  } catch (error) {
    notLive = error
  }
  mock.noLive = false
  check('offline channel reports not live', notLive?.reason === 'notLive', notLive?.reason)

  let badHandle = null
  try {
    await yt.previewYouTubeLive({ handle: 'https://www.youtube.com/watch?v=VIDTEST1234' })
  } catch (error) {
    badHandle = error
  }
  check('a video URL in the handle box is rejected', badHandle?.reason === 'badHandle', badHandle?.reason)

  const liveBefore = mock.livePollCount
  yt.setYouTubeConfig({ handle: '@xuhsy', videoInput: '', liveChatId: '' })
  yt.startYouTube()
  const following = await waitFor(() => {
    const s = yt.getStatus()
    return s.polling && s.watchMode && mock.livePollCount > liveBefore ? s : null
  })
  check('handle mode follows the channel, not a fixed video', !!following && following.watchMode === true, JSON.stringify(following?.state))
  check('handle mode resolved the channel title', !!following && following.channelTitle === 'Xuhsy', following?.channelTitle)
  check('handle mode keeps the resolved video id', !!following && following.videoId === 'VIDTEST1234', following?.videoId)

  // The broadcast ends on the next scheduled poll: handle mode must wait for
  // their next live instead of shutting the tracker down.
  mock.endChatOnPoll = mock.livePollCount + 1
  const waiting = await waitFor(() => (yt.getStatus().state === 'Waiting' ? yt.getStatus() : null), 15000)
  check('stream end waits for the next live instead of stopping', !!waiting, yt.getStatus().state)
  const rearmed = await waitFor(() => {
    const s = yt.getStatus()
    return s.polling && s.liveChatId === 'LC_TEST' && s.state !== 'Waiting' ? s : null
  }, 15000)
  check('handle mode re-resolved the next live', !!rearmed, JSON.stringify(yt.getStatus().state))
  const channelLookups = calls.filter((c) => c.endpoint === 'channels').length
  check('each follow asked channels.list', channelLookups >= 3, channelLookups)

  yt.stopYouTubePolling()

  // Live activity tab: the shared timeline mirrors YouTube rows and accepts
  // TikTok rows pushed from the renderer.
  const timeline = yt.listEventLog(500)
  const ytRows = timeline.filter((r) => r.source === 'youtube')
  check('youtube gifts mirrored into the shared timeline', ytRows.length === 3, JSON.stringify(ytRows.map((r) => r.ref_id)))
  check(
    'combo update raised the timeline row instead of duplicating it',
    ytRows.filter((r) => r.ref_id === 'm1').length === 1 && ytRows.find((r) => r.ref_id === 'm1')?.combo === 5,
    JSON.stringify(ytRows.map((r) => [r.ref_id, r.combo]))
  )
  check('timeline rows are typed for filtering', ytRows.every((r) => r.kind === 'gift'), JSON.stringify(ytRows.map((r) => r.kind)))

  report('STEP: the timeline carries the comment text')
  yt.mirrorYouTubeMessage({
    ...yt.getMessage('m1'),
    id: 'TEXTROW1',
    type: 'textMessageEvent',
    kind: undefined,
    user_comment: '',
    text: 'hi there',
    display_message: 'hi there',
    gift_name: null,
    alt_text: null,
    jewels: 0,
    combo_count: 0,
    author: '@Rafaela-me3gt'
  })
  const mirroredComment = yt.listEventLog(500).find((r) => r.ref_id === 'TEXTROW1')
  check(
    'blank user_comment falls through to the message text',
    mirroredComment?.text === 'hi there' && mirroredComment?.kind === 'comment',
    JSON.stringify([mirroredComment?.text, mirroredComment?.kind])
  )

  // Rows written by the older build have no text at all; they are refilled from
  // the YouTube message log so an existing timeline is not left bare.
  yt.upsertMessage({
    id: 'OLDROW1',
    liveChatId: 'LC_TEST',
    type: 'textMessageEvent',
    publishedAt: Date.now(),
    userComment: '',
    text: 'backfilled hello',
    displayMessage: 'backfilled hello',
    author: '@nightbot',
    authorChannelId: 'UC_nightbot'
  })
  yt.appendEvent({
    source: 'youtube',
    kind: 'comment',
    ts: Date.now(),
    sender: '@nightbot',
    text: '',
    refId: 'OLDROW1'
  })
  yt.backfillYouTubeText()
  const refilled = yt.listEventLog(500).find((r) => r.ref_id === 'OLDROW1')
  check('blank timeline rows are refilled from the message log', refilled?.text === 'backfilled hello', JSON.stringify(refilled?.text))

  const tkTs = Date.now()
  const tkRef = `tk:comment:${tkTs}:alice: hello`
  yt.appendEvent({
    source: 'tiktok',
    kind: 'comment',
    ts: tkTs,
    sender: 'alice',
    text: 'hello from tiktok',
    refId: tkRef
  })
  const dup = yt.appendEvent({
    source: 'tiktok',
    kind: 'comment',
    ts: tkTs,
    sender: 'alice',
    text: 'hello from tiktok',
    refId: tkRef
  })
  const tiktokRows = yt.listEventLog(500).filter((r) => r.source === 'tiktok')
  check('tiktok events append to the same timeline', tiktokRows.length === 1, JSON.stringify(tiktokRows.map((r) => r.text)))
  check('tiktok ref_id dedupes a repeated push', dup?.id === tiktokRows[0].id, JSON.stringify([dup?.id, tiktokRows[0]?.id]))

  const timelineStats = yt.getEventLogStats()
  check('timeline counts both sources', timelineStats.tiktok === 1 && timelineStats.youtube === 5, JSON.stringify(timelineStats))
  check('timeline newest first', yt.listEventLog(1)[0].source === 'tiktok', JSON.stringify(yt.listEventLog(1)[0]?.source))

  yt.clearEventLog()
  check('timeline clears without touching the gift log', yt.getEventLogStats().total === 0 && yt.getYouTubeStats().messageCount === 4, JSON.stringify([yt.getEventLogStats().total, yt.getYouTubeStats().messageCount]))

  report('')
  report(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`)

  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // SQLite still holds the file open on Windows; the OS temp dir cleans up later.
  }
  app.exit(failures === 0 ? 0 : 1)
})
