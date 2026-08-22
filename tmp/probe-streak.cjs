'use strict';
// Headless probe: gift combo (repeatEnd), flush-on-timeout, replay dedup, socket guards.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {}, scrollTop: 0 }) };

class FakeSocket {
  static instances = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.sent = [];
    this.closed = false;
    FakeSocket.instances.push(this);
    setTimeout(() => {
      if (this.closed) return;
      this.readyState = 1;
      this.onopen && this.onopen();
    }, 5);
  }
  send(data) { this.sent.push(data); }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    if (this.onclose) this.onclose({ code: 1000, reason: '' });
  }
}
globalThis.WebSocket = FakeSocket;

import('file:///D:/VConnectApp/TikfinitySystem.js').then(mod => {
  const system = new mod.TikfinitySystem({ vconnectUrl: 'ws://vc:1', tiktokUrl: 'ws://tt:1' });
  system.connectTikfinity();
  system.connectVConnect();

  setTimeout(() => {
    system.addGiftMapping('Rose', 'uid-rose-1');

    const tt = FakeSocket.instances.find(s => s.url.includes('tt'));
    const vc = FakeSocket.instances.find(s => s.url.includes('vc'));
    const gift = extra => JSON.stringify({ event: 'gift', data: { nickname: 'bob', uniqueId: 'bob', userId: 'u1', giftName: 'Rose', diamondCount: 1, ...extra } });
    const activations = () => vc.sent.filter(m => { try { return JSON.parse(m).messageType === 'TriggerActivateRequest'; } catch { return false; } }).length;
    const giftEmits = [];
    system.on('gift', g => giftEmits.push(g));

    const checks = [];
    const check = (name, ok, info) => checks.push([name, ok, info]);

    // 1: streakable combo — 3 in-progress + 1 final repeatEnd => ONE emit/fire
    tt.onmessage({ data: gift({ giftType: 1, repeatCount: 1, repeatEnd: false, timestamp: 1000 }) });
    tt.onmessage({ data: gift({ giftType: 1, repeatCount: 5, repeatEnd: false, timestamp: 2000 }) });
    tt.onmessage({ data: gift({ giftType: 1, repeatCount: 9, repeatEnd: false, timestamp: 3000 }) });
    tt.onmessage({ data: gift({ giftType: 1, repeatCount: 12, repeatEnd: true, timestamp: 4000 }) });
    check('streak combo -> one fire', activations() === 1, activations());
    check('streak combo -> one feed emit', giftEmits.length === 1, giftEmits.length);

    // 2: non-streak gift fires immediately
    tt.onmessage({ data: gift({ giftType: 2, repeatCount: 1, timestamp: 5000 }) });
    check('non-streak gift fires (total 2)', activations() === 2, activations());

    // 3: byte-identical replay with identity field dropped
    tt.onmessage({ data: gift({ giftType: 2, repeatCount: 1, timestamp: 5000 }) });
    check('replay with same timestamp dropped', activations() === 2, activations());

    // 4: legit identical gift, new timestamp, fires
    tt.onmessage({ data: gift({ giftType: 2, repeatCount: 1, timestamp: 6000 }) });
    check('legit repeat fires (total 3)', activations() === 3, activations());

    // 5: legacy payload with no streak fields fires immediately
    tt.onmessage({ data: gift({ repeatCount: 1 }) });
    check('legacy no-field gift fires (total 4)', activations() === 4, activations());

    // 6: byte-identical payload WITHOUT any id field is dropped (payload-hash dedup)
    tt.onmessage({ data: gift({ repeatCount: 2 }) });
    tt.onmessage({ data: gift({ repeatCount: 2 }) });
    check('identical id-less payload fires once (total 5)', activations() === 5, activations());

    // 7: connectTikfinity during CONNECTING must not spawn a second socket
    const before = FakeSocket.instances.filter(s => s.url.includes('tt')).length;
    tt.readyState = 0;
    system.connectTikfinity();
    const after = FakeSocket.instances.filter(s => s.url.includes('tt')).length;
    check('connect while CONNECTING no-ops', before === after, `${before}->${after}`);
    tt.readyState = 1;

    // 8 (async): combo that never sends repeatEnd flushes after ~10s and fires ONCE;
    // a late repeatEnd for that combo is dropped.
    tt.onmessage({ data: gift({ giftType: 1, repeatCount: 7, repeatEnd: false, userId: 'u2', timestamp: 7000 }) });
    check('open combo holds fire', activations() === 5, activations());

    setTimeout(() => {
      check('orphan combo flushed once (total 6)', activations() === 6, activations());
      tt.onmessage({ data: gift({ giftType: 1, repeatCount: 7, repeatEnd: true, userId: 'u2', timestamp: 8000 }) });
      check('late repeatEnd after flush dropped', activations() === 6, activations());

      let failed = 0;
      for (const [name, ok, info] of checks) {
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${info})`);
        if (!ok) failed++;
      }
      console.log(failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`);
      process.exit(failed === 0 ? 0 : 1);
    }, 11000);
  }, 50);
});
