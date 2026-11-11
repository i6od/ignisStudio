// Find a currently-live TikTok account so the feed probe can be tested for real.
const mod = await import('tiktok-live-connector')

const candidates = [
  'xuhsy', 'xqc', 'ninja', 'issacyang', 'danbd', 'lauradiana', 'bilibili',
  'tiktok', 'justin_woo', 'kallmeekris', 'wSzkola', 'gawrish', 'lolutzz'
]

for (const name of candidates) {
  try {
    const client = new mod.TikTokLiveConnection(name, { fetchRoomInfoOnConnect: false })
    const live = await client.fetchIsLive()
    console.log(`${live ? 'LIVE' : 'offline'}  @${name}`)
  } catch (err) {
    console.log(`error     @${name}: ${err?.message ?? String(err)}`)
  }
}
process.exit(0)
