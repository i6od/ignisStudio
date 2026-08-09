// VConnect WebSocket API test driver
//
// Usage:
//   node test-api.mjs                 # list triggers, fire the first one
//   node test-api.mjs <uid-or-name>   # fire a specific trigger
//   VCONNECT_WS=ws://host:port node test-api.mjs
//
// Notes from live testing (2026-08-08, VConnect on localhost:39542):
//  - Endpoint is the bare ws://port — NO "/websocket" path.
//  - The server answers only the FIRST request per connection; later requests get an empty
//    frame and silence. Workaround (used here): one socket per request + a passive listener
//    socket for broadcast events.
//  - Empty frames are keepalives — skipped.
//  - Triggers that actually DO work in the app (graph has a websocket/node upstream) fire
//    and broadcast TriggerActivatedEvent to every client (incl. the sending socket) with a
//    server-generated requestID — but the TriggerActivateResponse ack may NEVER arrive for
//    such triggers (observed: no ack in 15s, no TriggerEndedEvent — graph loops/was running).
//    Earlier, with a 1-node stub trigger, the ack came back instantly. So: time out the ack,
//    trust the broadcast event as the real signal that the fire landed.
const url = process.env.VCONNECT_WS || 'ws://localhost:39542';
const target = process.argv[2];
const t0 = Date.now();
const log = (...a) => console.log(`+${((Date.now() - t0) / 1000).toFixed(2)}s`, ...a);

const envelope = (messageType, requestID, data = {}) => ({
  apiName: 'VConnectPublicApi',
  apiVersion: '1.0',
  requestID,
  messageType,
  timestamp: new Date().toISOString(),
  data,
});

/** One request per socket. Resolves with the parsed response message. */
function request(messageType, data = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const requestID = 'req-' + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => { ws.close(); reject(new Error(`timeout: ${messageType}`)); }, 8000);
    ws.onopen = () => ws.send(JSON.stringify(envelope(messageType, requestID, data)));
    ws.onmessage = (ev) => {
      let raw = ev.data;
      if (raw instanceof ArrayBuffer) raw = new TextDecoder().decode(raw);
      if (typeof raw !== 'string' || raw.length === 0) return; // skip empty frames
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.requestID !== requestID) return; // broadcast event on this socket — ignore here
      clearTimeout(timer);
      ws.close();
      resolve(msg);
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('ws error')); };
  });
}

/** Passive socket that logs broadcast events until closed. */
function listen(seconds, label) {
  const ws = new WebSocket(url);
  const shutdown = () => ws.close();
  ws.onmessage = (ev) => {
    let raw = ev.data;
    if (raw instanceof ArrayBuffer) raw = new TextDecoder().decode(raw);
    if (typeof raw !== 'string' || raw.length === 0) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.messageType?.endsWith('Response')) return; // skip request-replies; keep events/pubsub
    const label2 = msg.messageType === 'websocket_node' ? 'pubsub' : 'EVENT';
    log(`[${label}] ${label2} << ${msg.messageType} ${JSON.stringify(msg.data).slice(0, 400)}`);
  };
  ws.onerror = (e) => log(`${label} listener error`);
  setTimeout(shutdown, seconds * 1000);
  return ws;
}

(async () => {
  const listResp = await request('TriggerListRequest', {});
  const triggers = listResp.data?.triggers ?? [];
  log(`${triggers.length} trigger(s) loaded:`);
  for (const t of triggers) log(`- ${t.name} | uid: ${t.uid} | enabled: ${t.enabled} | nodes: ${t.nodeCount}`);

  let chosen = triggers[0];
  if (target) {
    chosen = triggers.find((t) => t.uid === target || t.name === target) ?? null;
    if (!chosen) { log(`no trigger matches '${target}'`); process.exit(1); }
  }
  if (!chosen) { log('no triggers loaded'); process.exit(1); }

  log(`firing: ${chosen.name} (${chosen.uid})`);
  // listener FIRST — broadcast events can arrive instantly after the request
  const listener = listen(10, 'main');
  // ack may never arrive for graphs that run/loop; don't treat that as failure
  try {
    const fireResp = await request('TriggerActivateRequest', { uid: chosen.uid, name: chosen.name });
    log(`TriggerActivateResponse: success=${fireResp.data?.success} error=${fireResp.data?.error ?? 'null'}`);
  } catch (e) {
    log(`no TriggerActivateResponse within 8s (${e.message}) — waiting on broadcast events instead`);
  }

  log('listening for broadcast events (10s)...');
  setTimeout(() => { log('done'); listener.close(); process.exit(0); }, 10500);
})();