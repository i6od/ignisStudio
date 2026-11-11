/**
 * Live probe for the built-in TikTok feed (run with: node scripts/probe-tiktok-live.mjs).
 *
 * It drives the real main-process module against a real stream and pipes every
 * frame into TikfinitySystem.ingestTikfinityFrame(), i.e. the exact path the app
 * uses — so a mapping that fires over the relay must also fire from the
 * built-in feed. Nothing here is mocked except the browser globals the vendored
 * bridge expects.
 */

// TikfinitySystem.js is a browser script: it touches document/localStorage.
globalThis.localStorage = {
  _s: new Map(),
  getItem(k) {
    return this._s.has(k) ? this._s.get(k) : null
  },
  setItem(k, v) {
    this._s.set(k, String(v))
  },
  removeItem(k) {
    this._s.delete(k)
  }
}
globalThis.document = { getElementById: () => null, querySelector: () => null }

const { TikfinitySystem } = await import('../TikfinitySystem.js')
const live = await import('../src/main/tiktok-live.ts')

const username = process.argv[2] || 'xuhsy'
const windowMs = Number(process.argv[3] || 25000)

const system = new TikfinitySystem({ feedSource: 'embedded' })

const counts = { gift: 0, like: 0, comment: 0, follow: 0, subscribe: 0 }
let frames = 0

system.on('gift', (d) => {
  counts.gift++
  console.log(
    `[gift] ${d.nickname} (@${d.uniqueId}) ${d.giftName} x${d.repeatCount} ` +
      `@${d.diamondCount}/ea type=${d.giftType} repeatEnd=${d.repeatEnd}`
  )
})
system.on('like', (d) => {
  counts.like++
  console.log(`[like] ${d.nickname} +${d.likeCount} total=${d.totalLikeCount} userId=${d.userId}`)
})
system.on('comment', (d) => {
  counts.comment++
  console.log(`[comment] ${d.nickname}: ${String(d.comment).slice(0, 40)}`)
})
system.on('follow', (d) => {
  counts.follow++
  console.log(`[follow] ${d.nickname} (@${d.uniqueId})`)
})
system.on('subscribe', (d) => {
  counts.subscribe++
  console.log(`[subscribe] ${d.nickname} month=${d.subMonth}`)
})
system.on('log', (entry) => {
  const e = entry
  if (e && typeof e.message === 'string' && (e.isError || /feed source|replayed|combo/i.test(e.message))) {
    console.log(`  bridge: ${e.message}`)
  }
})

live.setTikTokLiveHandlers({
  onFrame: (frame) => {
    frames++
    const accepted = system.ingestTikfinityFrame(frame)
    if (!accepted) console.log('REJECTED FRAME:', JSON.stringify(frame))
    else if (frames <= 3) console.log('frame ->', JSON.stringify(frame).slice(0, 240))
  },
  onStatus: (status) => {
    console.log(`status: ${status.status}${status.error ? ` (${status.error})` : ''}${status.roomId ? ` room=${status.roomId}` : ''}`)
  }
})

console.log(`connecting to @${username} for ${windowMs / 1000}s ...`)
await live.startTikTokLive(username)

await new Promise((resolve) => setTimeout(resolve, windowMs))
live.stopTikTokLive()

console.log('\n=== probe result ===')
console.log('frames emitted:', frames)
console.log('bridge consumed:', counts)
console.log('skipped relay socket:', system.tiktokSocket === null)
process.exit(0)
