/**
 * Adapter test for the built-in TikTok feed (node scripts/adapter-test.mjs).
 *
 * Feeds synthetic raw-protobuf events (the shape tiktok-live-connector v2 emits)
 * through the normalizer and into TikfinitySystem.ingestTikfinityFrame(), then
 * checks the bridge sees Tikfinity-shaped data. These are the failure modes
 * that would otherwise go unnoticed in a live stream:
 *   - diamonds counted twice (per-unit vs pre-multiplied)
 *   - streak gifts firing once per intermediate event (the 0.4.6 duplicate bug)
 *   - non-streak gifts held 10s by the combo buffer
 *   - NaN like totals / every viewer collapsing into one like bucket
 */

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
const { normalizers } = await import('../src/main/tiktok-live.ts')

let failures = 0
function check(name, condition, detail) {
  if (condition) {
    console.log(`PASS: ${name}`)
  } else {
    failures++
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const user = {
  id: '1234567890123',
  nickname: 'FanOne',
  displayId: 'fanone',
  avatarLarge: { urlList: ['https://cdn.example/pic.jpg'] }
}

function rawGift({ repeatCount, repeatEnd, giftType = 1, diamondCount = 1, msgId }) {
  return {
    common: { msgId: String(msgId), createTime: '1730000000000' },
    giftId: '5983',
    repeatCount,
    repeatEnd,
    gift: {
      id: '5983',
      name: 'Rose',
      diamondCount,
      type: giftType,
      image: { urlList: ['https://cdn.example/rose.png'] }
    },
    user
  }
}

const system = new TikfinitySystem({ feedSource: 'embedded' })
const gifts = []
const likes = []
const comments = []
const follows = []
const subscribes = []

system.on('gift', (d) => gifts.push(d))
system.on('like', (d) => likes.push(d))
system.on('comment', (d) => comments.push(d))
system.on('follow', (d) => follows.push(d))
system.on('subscribe', (d) => subscribes.push(d))

const ingest = (frame) => system.ingestTikfinityFrame(frame)

/* 1. streak: two intermediates + one final -> exactly one processed gift     */
ingest(normalizers.gift(rawGift({ repeatCount: 1, repeatEnd: 0, msgId: 101 })))
ingest(normalizers.gift(rawGift({ repeatCount: 2, repeatEnd: 0, msgId: 102 })))
ingest(normalizers.gift(rawGift({ repeatCount: 3, repeatEnd: 1, msgId: 103 })))

check('streak holds intermediates and processes the final only', gifts.length === 1, `got ${gifts.length}`)
check('streak total is the final repeatCount', gifts[0]?.repeatCount === 3, JSON.stringify(gifts[0]?.repeatCount))
check('repeatEnd arrives as a real boolean', gifts[0]?.repeatEnd === true, typeof gifts[0]?.repeatEnd)
check('giftType survives the mapping', gifts[0]?.giftType === 1, JSON.stringify(gifts[0]?.giftType))

/* 2. diamonds stay per-unit so db.ts can multiply them once                  */
const perUnit = normalizers.gift(rawGift({ repeatCount: 4, repeatEnd: 1, diamondCount: 5, msgId: 104 }))
check('diamondCount stays per-unit', perUnit.data.diamondCount === 5, JSON.stringify(perUnit.data.diamondCount))
ingest(perUnit)
check(
  'supporter record math = diamondCount x repeatCount',
  gifts[1]?.diamondCount * gifts[1]?.repeatCount === 20,
  JSON.stringify(gifts[1])
)

/* 3. replay of the same message id is dropped                                */
const before = gifts.length
ingest(normalizers.gift(rawGift({ repeatCount: 3, repeatEnd: 1, msgId: 103 })))
check('replayed streak-end is deduped', gifts.length === before, `got ${gifts.length}`)

/* 4. non-streak gift (giftType 2) must not sit in the combo buffer           */
ingest(normalizers.gift(rawGift({ repeatCount: 1, repeatEnd: 0, giftType: 2, diamondCount: 10, msgId: 105 })))
check('giftType 2 fires immediately, not after the 10s flush', gifts.length === before + 1, `got ${gifts.length}`)
check('combo buffer is empty', system._pendingCombos.size === 0, `size ${system._pendingCombos.size}`)

/* 5. like fields: count -> likeCount, total -> totalLikeCount, keyed by user */
const likeFrame = normalizers.like({
  common: { msgId: '201', createTime: '1730000000000' },
  count: 7,
  total: '421',
  user
})
check('likeCount mapped from count', likeFrame.data.likeCount === 7, JSON.stringify(likeFrame.data.likeCount))
check('totalLikeCount mapped from total', likeFrame.data.totalLikeCount === 421, JSON.stringify(likeFrame.data.totalLikeCount))
ingest(likeFrame)
ingest(
  normalizers.like({
    common: { msgId: '202' },
    count: 3,
    total: '424',
    user
  })
)
check('likes accumulate per user', system.userLikeTotals.get('1234567890123') === 10, JSON.stringify([...system.userLikeTotals]))
check('no NaN like totals', !Number.isNaN(system.userLikeTotals.get('1234567890123')))

/* 6. a like with no user at all must not poison the tracker                  */
ingest(normalizers.like({ common: { msgId: '203' }, count: 2, total: '426' }))
check('anonymous like does not create a NaN entry', !Number.isNaN(system.userLikeTotals.get(undefined) ?? 0))

/* 6b. the bridge has to hear the like at all: without emit('like') the feed,
      the shared timeline and the supporter like totals stay empty             */
check('like events reach the bridge', likes.length === 3, `got ${likes.length}`)
check(
  'like event carries userId + likeCount',
  likes[0]?.likeCount === 7 && likes[0]?.userId === '1234567890123',
  JSON.stringify(likes[0])
)

/* 6c. a redelivered like message must not count twice                         */
const likeTotalBefore = system.userLikeTotals.get('1234567890123')
ingest(normalizers.like({ common: { msgId: '202' }, count: 3, total: '424', user }))
check('replayed like does not change the total', system.userLikeTotals.get('1234567890123') === likeTotalBefore, `got ${system.userLikeTotals.get('1234567890123')}`)
check('replayed like does not emit again', likes.length === 3, `got ${likes.length}`)

/* 6d. like goals: the list must reach the UI, and crossing it fires once      */
const goalLists = []
system.on('likeMappingChanged', (m) => goalLists.push(m))
system.addLikeMapping(20, 'TRIG_TEST')
check('addLikeMapping emits the new goal list', goalLists.length === 1 && goalLists[0]?.[0]?.likeCount === 20, JSON.stringify(goalLists))
ingest(normalizers.like({ common: { msgId: '204' }, count: 10, total: '436', user }))
check(
  'like goal fires when the user crosses it',
  system.triggeredLikeGoals.get('1234567890123')?.has(20) === true,
  JSON.stringify([...(system.triggeredLikeGoals.get('1234567890123') ?? [])])
)
ingest(normalizers.like({ common: { msgId: '205' }, count: 5, total: '441', user }))
check('the same goal does not fire twice for one user', likes.length === 5 && system.triggeredLikeGoals.get('1234567890123')?.has(20) === true, `likes ${likes.length}`)
system.removeLikeMapping(0)
check('removeLikeMapping emits the shortened list', goalLists.length === 2 && goalLists[1].length === 0, JSON.stringify(goalLists[1]))

/* 7. comment / follow / subscribe identity fields                            */
ingest(
  normalizers.comment({
    common: { msgId: '301' },
    content: 'first comment!',
    user
  })
)
check('comment text mapped from content', comments[0]?.comment === 'first comment!', JSON.stringify(comments[0]))
check('comment carries uniqueId', comments[0]?.uniqueId === 'fanone', JSON.stringify(comments[0]?.uniqueId))

ingest(
  normalizers.follow({
    common: { msgId: '401' },
    followCount: '1001',
    user
  })
)
check('follow carries userId + uniqueId + avatar', follows[0]?.userId === '1234567890123' && follows[0]?.uniqueId === 'fanone' && follows[0]?.profilePictureUrl === 'https://cdn.example/pic.jpg', JSON.stringify(follows[0]))

ingest(
  normalizers.subscribe({
    common: { msgId: '501' },
    subMonth: '3',
    subscribeType: 1,
    user
  })
)
check('subMonth is numeric', subscribes[0]?.subMonth === 3, JSON.stringify(subscribes[0]?.subMonth))

/* 8. identity fallback: no user.id -> handle keeps users separate             */
const stripped = normalizers.gift({
  common: { msgId: '602' },
  giftId: '5983',
  repeatCount: 1,
  repeatEnd: 1,
  gift: { name: 'Tulip', diamondCount: 2, type: 2 },
  user: { nickname: 'NoId', displayId: 'noid' }
})
check('userId falls back to the handle', stripped.data.userId === 'noid', JSON.stringify(stripped.data.userId))

/* 9. diamond value rules: greater than / less than / between, on the combo total */
const fired = []
system.on('triggerFired', (t) => fired.push(t.uid))
const titsFired = []
system.on('titsTriggerFired', (t) => titsFired.push(t.uid))
system.triggers = [
  { uid: 'TRIG_BIG', name: 'big gift' },
  { uid: 'TRIG_SMALL', name: 'small gift' },
  { uid: 'TRIG_RANGE', name: 'mid gift' }
]
system.titsTriggers = [{ uid: 'TITS_BIG', name: 'tits big gift' }]
const OPEN = globalThis.WebSocket?.OPEN ?? 1
system.vconnectSocket = { readyState: OPEN, send: () => {} }
system.titsSocket = { readyState: OPEN, send: () => {} }

check('bad range is rejected', system.addDiamondRule('range', 500, 100, 'TRIG_RANGE') === false)
check('rule with no trigger is rejected', system.addDiamondRule('above', 500, null, '') === false)
check('unknown comparison is rejected', system.addDiamondRule('over', 500, null, 'TRIG_BIG') === false)
check('greater-than rule added', system.addDiamondRule('above', 500, null, 'TRIG_BIG') === true)
check('less-than rule added', system.addDiamondRule('below', 10, null, 'TRIG_SMALL') === true)
check('range rule added', system.addDiamondRule('range', 100, 1000, 'TRIG_RANGE') === true)
check(
  'rule list reads back the three rules',
  system.getDiamondRules().length === 3,
  JSON.stringify(system.getDiamondRules())
)

fired.length = 0
ingest(normalizers.gift(rawGift({ repeatCount: 100, repeatEnd: 1, diamondCount: 5, msgId: 701 })))
check('exactly 500 skips "greater than 500" but matches the range', fired.join(',') === 'TRIG_RANGE', fired.join(','))

fired.length = 0
ingest(normalizers.gift(rawGift({ repeatCount: 120, repeatEnd: 1, diamondCount: 5, msgId: 702 })))
check('600 diamonds matches both greater-than and range', fired.join(',') === 'TRIG_BIG,TRIG_RANGE', fired.join(','))

fired.length = 0
ingest(normalizers.gift(rawGift({ repeatCount: 1, repeatEnd: 1, diamondCount: 5, msgId: 703 })))
check('5 diamonds matches "less than 10"', fired.join(',') === 'TRIG_SMALL', fired.join(','))

fired.length = 0
ingest(normalizers.gift(rawGift({ repeatCount: 2, repeatEnd: 1, diamondCount: 5, msgId: 704 })))
check('exactly 10 skips "less than 10"', fired.length === 0, fired.join(','))

fired.length = 0
ingest(normalizers.gift(rawGift({ repeatCount: 15, repeatEnd: 1, diamondCount: 5, msgId: 705 })))
check('75 diamonds matches nothing', fired.length === 0, fired.join(','))

fired.length = 0
ingest(normalizers.gift(rawGift({ repeatCount: 200, repeatEnd: 1, diamondCount: 5, msgId: 706 })))
check('1000 diamonds matches the top end of the range', fired.join(',') === 'TRIG_BIG,TRIG_RANGE', fired.join(','))

titsFired.length = 0
system.addTitsDiamondRule('above', 300, null, 'TITS_BIG')
ingest(normalizers.gift(rawGift({ repeatCount: 120, repeatEnd: 1, diamondCount: 5, msgId: 707 })))
check('TITS diamond rule fires on the same gift', titsFired.join(',') === 'TITS_BIG', titsFired.join(','))

system.removeDiamondRule(0)
system.removeDiamondRule(0)
system.removeDiamondRule(0)
check('rules can be removed', system.getDiamondRules().length === 0, JSON.stringify(system.getDiamondRules()))
fired.length = 0
ingest(normalizers.gift(rawGift({ repeatCount: 120, repeatEnd: 1, diamondCount: 5, msgId: 708 })))
check('no rules means no value triggers', fired.length === 0, fired.join(','))

/* 10. rules are stored with the rest of the mapping config                    */
system.addDiamondRule('above', 2000, null, 'TRIG_BIG')
system.addTitsDiamondRule('range', 50, 90, 'TITS_BIG')
const reloaded = new TikfinitySystem({ feedSource: 'embedded' })
check(
  'diamond rules survive a restart',
  reloaded.getDiamondRules().length === 1 && reloaded.getDiamondRules()[0].min === 2000,
  JSON.stringify(reloaded.getDiamondRules())
)
check(
  'TITS diamond rules survive a restart',
  reloaded.getTitsDiamondRules().length === 2 &&
    reloaded.getTitsDiamondRules().some(r => r.op === 'range' && r.min === 50 && r.max === 90),
  JSON.stringify(reloaded.getTitsDiamondRules())
)


console.log('')
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
