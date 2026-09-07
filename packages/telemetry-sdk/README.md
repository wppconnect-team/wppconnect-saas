# `@wppconnect/telemetry-sdk`

Explicit, opt-in aggregate telemetry for WPPConnect-based applications. Importing
the package does nothing; the host must configure it and deliberately record
counters, latency, function outcomes, and connection availability.

The public schema has no message-content, JID, phone, personal-name, media or
filename fields. Do not put identifying data in source/function labels or version
strings. Stored snapshots are validated again before transmission. Failed deliveries
reuse the same idempotency key. Batches use gzip when `CompressionStream` is available.

```js
import { wppTelemetry } from '@wppconnect/telemetry-sdk'

wppTelemetry.configure({
  endpoint: 'https://cloud.wppconnect.io',
  apiKey: 'wpp_live_...',
  sourceId: 'anonymous-worker-a',
  waVersion: '2.3000.1',
})

wppTelemetry.recordMessage('sent')
wppTelemetry.recordFunction('sendText', 182, true)
```

## Reliability and lifecycle

- Configure once per client; create a new client to change credentials. Importing
  does not start collection or network traffic. Recording is always explicit.
- Use a dedicated organization API key with **only `telemetry:write`**. Never
  embed an administrator key in an extension. Client-side credentials can be
  extracted; scope, expire and rotate them accordingly.
- HTTPS is required. Redirects and ambient cookies are disabled. Requests time
  out after 10 seconds (`requestTimeoutMs`, range 100–60000 ms).
- `flush()` coalesces concurrent calls. Clients sharing a queue serialize in one
  JavaScript realm; browsers with Web Locks also serialize across tabs. Without
  Web Locks, use only one writer per source/storage key across tabs/processes.
- Offline storage is isolated by SHA-256 of endpoint, source and API key; no raw
  key is written to storage. Key rotation intentionally does not adopt the old
  key's queue. Drain old queues before rotation when possible.
- Version 0.1.1 does not automatically adopt 0.1.0's source-only storage namespace:
  it cannot safely establish which account owns those records. Export/inspect or
  drain them with the original configuration before upgrading.
- Only `{accepted, duplicates}` counts covering the entire batch confirm delivery.
  HTTP success without that acknowledgement retains the queue. The server must
  deduplicate repeated snapshot IDs after a lost response.
- `maxQueue` defaults to 100 (1–1000). A full queue is **not truncated**. Flush
  reports `queueFull:true`, drains older snapshots, and retains current counters
  in memory until a later flush has room. Unsaved counters can be lost if the host
  exits at this point. Handle this signal and call `flush()` again after draining.
- `delivered` includes duplicates acknowledged by the server, not only newly
  inserted rows. It retains partial progress if a later request fails.
- Storage errors and corrupt/unsupported records throw without resetting counters
  or overwriting the queue. Use `onError` to observe automatic-flush exceptions;
  use manual `flush()` results to inspect HTTP failures or a full queue.
- Browser pages default to localStorage; Node and contexts without localStorage
  use memory only. Supply a persistent synchronous `TelemetryStorage` adapter
  for restart durability. A Chrome service worker needs a compatible persistence
  strategy; memory fallback is not durable MV3 storage.
- Flush observation windows at least every 24 hours. Invalid/overlong intervals
  are rejected, not silently relabeled or discarded. Up to 200 distinct function
  labels per snapshot; exceeding metric limits throws before changing counters.
- `close()` stops the timer, waits for a current delivery and flushes remaining
  counters. Check its result: it does not guarantee delivery while offline.

```js
const result = await wppTelemetry.flush()
if (result.pending || result.queueFull || result.error) {
  // Report operational status locally; retry after connectivity/storage recovers.
}
```

## Validation boundary

`npm test` covers concurrent flushes, credential isolation, bounded queues,
storage failure, corrupted records, gzip, lost acknowledgements and restart.
These are deterministic SDK tests, not proof of three customer pilots or a
privacy/compliance review. This package never activates server retention.
