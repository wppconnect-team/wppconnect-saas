# `@wppconnect/telemetry-sdk`

Explicit, opt-in aggregate telemetry for WPPConnect-based applications. Importing
the package does nothing; the host must configure it and deliberately record
counters, latency, function outcomes, and connection availability.

The public API cannot receive message content, JIDs, phone numbers, names, media,
or filenames. Failed deliveries remain in bounded local storage and reuse the
same idempotency key. Batches use gzip when `CompressionStream` is available.

```js
import { wppTelemetry } from '@wppconnect/telemetry-sdk'

wppTelemetry.configure({
  endpoint: 'https://control-plane.example',
  apiKey: 'wpp_live_...',
  sourceId: 'support-node-01',
  waVersion: '2.3000.1',
})

wppTelemetry.recordMessage('sent')
wppTelemetry.recordFunction('sendText', 182, true)
```
