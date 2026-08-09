/**
 * Wire-format test: stub the bridge's socket, drive requestTriggerList +
 * sendTrigger, capture the exact JSON frames, and compare against the docs
 * in VconnectAPI.md.
 *
 * Run: node scripts/wire-test.cjs
 */
const path = require('path')

// ---- polyfills so the bridge can run inside Node ----
globalThis.WebSocket = class FakeWS {}
const storage = new Map()
globalThis.localStorage = {
  getItem: k => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: k => storage.delete(k)
}
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, appendChild() {}, textContent: '' })
}

const mod = require(path.join(__dirname, '..', 'TikfinitySystem.js'))
const TikfinitySystem = mod.default || mod.TikfinitySystem

const system = new TikfinitySystem({ vconnectUrl: 'ws://localhost:39542' })

// Seed one trigger exactly as TriggerListResponse would deliver
system.triggers = [
  { uid: 'a0ce3831-3c3e-4474-b4e4-19ab98dc73dd', name: 'New Follow', enabled: true, nodeCount: 7 }
]

// Capture what would go over the wire
const sent = []
system.vconnectSocket = {
  readyState: WebSocket.OPEN, // 1
  send: msg => sent.push(JSON.parse(msg))
}

system.requestTriggerList()
system.sendTrigger('a0ce3831-3c3e-4474-b4e4-19ab98dc73dd')

console.log('=== TriggerListRequest (wire) ===')
console.log(JSON.stringify(sent[0], null, 2))
console.log('\n=== TriggerActivateRequest (wire) ===')
console.log(JSON.stringify(sent[1], null, 2))

// ---- assertions against VconnectAPI.md ----
const list = sent[0]
const fire = sent[1]
const ok = (c, m) => {
  console.log((c ? 'PASS: ' : 'FAIL: ') + m)
  if (!c) process.exitCode = 1
}

ok(list && list.messageType === 'TriggerListRequest', 'list: messageType=TriggerListRequest')
ok(list && list.requestID === '1', 'list: requestID present (got ' + list.requestID + ')')
ok(fire && fire.messageType === 'TriggerActivateRequest', 'fire: messageType=TriggerActivateRequest')
ok(fire && fire.data && fire.data.uid === 'a0ce3831-3c3e-4474-b4e4-19ab98dc73dd', 'fire: data.uid matches trigger uid')
ok(fire && fire.requestID, 'fire: requestID present')
ok(fire && typeof fire.timestamp === 'string', 'fire: timestamp present')

console.log('\nDONE (exit code ' + process.exitCode + ')')