# VConnect WebSocket API

VConnect exposes a WebSocket server (enable it in Settings → WebSocket) that external tools can use
to query and control the running instance in real time, and to receive live events. The wire format
is deliberately close to the older [T.I.T.S. API](https://github.com/Remasuri/TITSAPI) — same envelope
shape and `Request`/`Response`/`Event` naming convention — so existing TITS integrators have a head
start. It isn't a strict clone: VConnect uses its own `uid` identity convention throughout instead of
TITS's `ID`/`itemID`/`triggerID`.

## Endpoint

Connect to the bare WS URL — `ws://<host>:<port>` (default `ws://localhost:39542`). Unlike the TITS
API there is **no `/websocket` path suffix**; the server listens on the root path of that port.

## Envelope

Every message — request, response, or broadcast event — is a JSON object with these fields:

```json
{
  "apiName": "VConnectPublicApi",
  "apiVersion": "1.0",
  "requestID": "some-id",
  "messageType": "TriggerListRequest",
  "timestamp": "2026-07-30T18:04:12.000Z",
  "data": { }
}
```

- `requestID` — client-supplied on requests; the server echoes the same value back on the matching
  response, so you can correlate replies to requests (and, if you ever need it, dedupe). Broadcast
  events aren't replies to anything, so they carry a fresh, server-generated `requestID`.
- `messageType` — discriminates what kind of message this is. See the full list below.
- `timestamp` — UTC, ISO-8601.
- `data` — payload, shape depends on `messageType`.

Responses are sent **only to the client that sent the request** (not broadcast). Broadcast events go
out to every connected client.

## Requests / Responses

### TriggerActivateRequest / TriggerActivateResponse

Fires a trigger on demand — equivalent to clicking "Test" on it in the UI, but **without** cancelling
any other run already in flight on that trigger's graph.

```json
// → request
{
  "messageType": "TriggerActivateRequest",
  "requestID": "1",
  "data": {
    "uid": "a0ce3831-3c3e-4474-b4e4-19ab98dc73dd"
  }
}
```

`data.uid` or `data.name` identifies the trigger (either works; `uid` is checked first).

```json
// ← response
{
  "messageType": "TriggerActivateResponse",
  "requestID": "1",
  "data": {
    "uid": "a0ce3831-3c3e-4474-b4e4-19ab98dc73dd",
    "name": "New Follow",
    "success": true,
    "error": null
  }
}
```

The response acknowledges that the trigger was found and started — it does not wait for the fired
graph to finish (some triggers loop or wait indefinitely). Watch for `TriggerActivatedEvent`/
`TriggerEndedEvent` (below) if you need the full lifecycle.

### TriggerListRequest / TriggerListResponse

Lists every trigger in the active profile.

```json
// → request
{
  "messageType": "TriggerListRequest",
  "requestID": "2"
}
```

```json
// ← response
{
  "messageType": "TriggerListResponse",
  "requestID": "2",
  "data": {
    "triggers": [
      {
        "uid": "a0ce3831-3c3e-4474-b4e4-19ab98dc73dd",
        "name": "New Follow",
        "enabled": true,
        "nodeCount": 7
      },
      {
        "uid": "ebb7170b-40e6-4832-8b05-bc6c809d79f1",
        "name": "Throw Bananas",
        "enabled": true,
        "nodeCount": 12
      }
    ]
  }
}
```

### AssetListRequest / AssetListResponse

Lists every asset in the library.

```json
// → request
{
  "messageType": "AssetListRequest",
  "requestID": "3",
  "data": {
    "includeScreenshots": false
  }
}
```

`data.includeScreenshots` (default `false`) — set `true` to embed a base64 PNG per asset. This can be
slow for a large library (each 3D/VRM asset may need to render a fresh snapshot), so it's opt-in.

```json
// ← response
{
  "messageType": "AssetListResponse",
  "requestID": "3",
  "data": {
    "assets": [
      {
        "uid": "60c678fc-60d1-4740-92d8-30f8bf42afc9",
        "name": "apple",
        "type": "ThreeDObjectAsset"
      },
      {
        "uid": "16d75b54-f4f4-4f97-a946-8ddb21eb2820",
        "name": "banana",
        "type": "PNGAsset"
      }
    ]
  }
}
```

### AssetInfoRequest / AssetInfoResponse

Gets details for a single asset by uid, optionally with a screenshot.

```json
// → request
{
  "messageType": "AssetInfoRequest",
  "requestID": "4",
  "data": {
    "uid": "60c678fc-60d1-4740-92d8-30f8bf42afc9",
    "includeScreenshot": true
  }
}
```

```json
// ← response
{
  "messageType": "AssetInfoResponse",
  "requestID": "4",
  "data": {
    "uid": "60c678fc-60d1-4740-92d8-30f8bf42afc9",
    "name": "apple",
    "type": "ThreeDObjectAsset",
    "screenshot": "iVBORw0KGgoAAAANSU..."
  }
}
```

`screenshot` reuses the asset's cached preview when available; otherwise a fresh one is rendered on
the spot. Screenshot support currently covers 3D/VRM model assets (rendered via the in-editor preview
camera) and PNG assets (their own texture, directly). Other asset types (GIF, audio, video, particle
systems) return `screenshot: null`.

### ErrorResponse

Sent instead of the expected `...Response` when a request is malformed, names an unknown
`messageType`, or references something that doesn't exist:

```json
{
  "messageType": "ErrorResponse",
  "requestID": "4",
  "data": {
    "message": "No asset found with uid '...'."
  }
}
```

## Broadcast events

These go out to every connected client — not replies to a specific request.

### TriggerActivatedEvent / TriggerEndedEvent

Fired whenever a trigger starts and finishes running, **from any source** — a real event (Twitch
follow, YouTube super chat, etc.), a manual "Test" click in the UI, or a `TriggerActivateRequest`.

```json
{
  "messageType": "TriggerActivatedEvent",
  "data": {
    "uid": "a0ce3831-3c3e-4474-b4e4-19ab98dc73dd",
    "name": "New Follow"
  }
}
```

```json
{
  "messageType": "TriggerEndedEvent",
  "data": {
    "uid": "a0ce3831-3c3e-4474-b4e4-19ab98dc73dd",
    "name": "New Follow",
    "success": true,
    "error": null
  }
}
```

### AssetSpawnEvent / AssetHitEvent / AssetDespawnEvent

Fired when a spawned item appears, is hit, and is removed — VConnect's equivalent of TITS's
`TITSHitEvent` family. `triggerUid`/`triggerNodeUid` identify which trigger (and which specific
trigger node inside it) caused the item to spawn in the first place; both are `null` when there's no
trigger involved (e.g. a manual spawn from the UI, or a `Test()` run with no trigger node upstream).

```json
{
  "messageType": "AssetSpawnEvent",
  "data": {
    "itemUid": "d1a7f8d2-...",
    "itemName": "banana",
    "triggerUid": "ebb7170b-...",
    "triggerNodeUid": "3fa2..."
  }
}
```

```json
{
  "messageType": "AssetHitEvent",
  "data": {
    "itemUid": "d1a7f8d2-...",
    "itemName": "banana",
    "triggerUid": "ebb7170b-...",
    "triggerNodeUid": "3fa2...",
    "point": {
      "x": 0.1,
      "y": 0.4,
      "z": 0.0
    },
    "normal": {
      "x": 0.0,
      "y": 1.0,
      "z": 0.0
    },
    "relativeVelocity": {
      "x": 0.33,
      "y": 0.93,
      "z": 0.19
    },
    "forceEstimate": 24.5
  }
}
```

```json
{
  "messageType": "AssetDespawnEvent",
  "data": {
    "itemUid": "d1a7f8d2-...",
    "itemName": "banana",
    "triggerUid": "ebb7170b-...",
    "triggerNodeUid": "3fa2..."
  }
}
```

## Custom pub/sub (`websocket_node`)

Beyond the built-in calls above, node graphs can send and receive arbitrary custom messages via the
**Send WebSocket Message** and **On WebSocket Receive** nodes. These always use `messageType:
"websocket_node"`, with the payload shaped as `{ "channel": string, "data": [...] }`:

```json
{
  "messageType": "websocket_node",
  "data": {
    "channel": "my-event",
    "data": [
      "arg1",
      42,
      true
    ]
  }
}
```

Send a message in this exact shape to trigger a matching **On WebSocket Receive** node (filtered by
`channel`) in any running graph. This is the escape hatch for anything project-specific that doesn't
warrant a built-in API call.

## Roadmap

More broadcast event types will land here as they're added. If you're integrating against this API and
find yourself wanting an event or call that doesn't exist yet, you can always ask me for changes!