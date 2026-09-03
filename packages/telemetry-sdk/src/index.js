const SDK_VERSION = '0.1.0'
const COUNTERS = ['messages.sent', 'messages.received', 'messages.deleted', 'errors.total']
const SOURCE_ID = /^[a-zA-Z][a-zA-Z0-9._:-]{0,119}$/

const memoryStorage = () => {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}

async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export class WppTelemetryClient {
  configure(options) {
    if (!options?.endpoint || !options?.apiKey || !SOURCE_ID.test(options?.sourceId ?? '')) throw new Error('endpoint, apiKey, and a non-identifying sourceId are required')
    this.options = { flushIntervalMs: 60_000, maxQueue: 100, compression: true, fetch: globalThis.fetch, storage: globalThis.localStorage ?? memoryStorage(), ...options }
    this.key = `wpp.telemetry.v1.${options.sourceId}`
    this.reset()
    if (options.autoFlush !== false) this.timer = setInterval(() => void this.flush(), this.options.flushIntervalMs)
    return this
  }

  reset(preserveConnection = false) {
    const wasConnected = preserveConnection && this.connected
    this.startedAt = Date.now()
    this.stateChangedAt = this.startedAt
    this.connected = Boolean(wasConnected)
    this.connectedMs = 0
    this.counters = Object.fromEntries(COUNTERS.map(key => [key, 0]))
    this.latency = { sumMs: 0, count: 0, buckets: [100, 250, 500, 1000, 2500, 5000], counts: [0, 0, 0, 0, 0, 0] }
    this.functions = new Map()
  }

  increment(key, quantity = 1) {
    if (!COUNTERS.includes(key) || !Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Unsupported counter or quantity')
    this.counters[key] += quantity
  }
  recordMessage(direction, quantity = 1) { this.increment(`messages.${direction}`, quantity) }
  recordDeletedMessage(quantity = 1) { this.increment('messages.deleted', quantity) }
  recordError(quantity = 1) { this.increment('errors.total', quantity) }
  recordResponseLatency(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error('durationMs must be non-negative')
    this.latency.sumMs += durationMs; this.latency.count++
    const index = this.latency.buckets.findIndex(bucket => durationMs <= bucket)
    this.latency.counts[index < 0 ? this.latency.counts.length - 1 : index]++
  }
  recordFunction(name, durationMs, ok = true) {
    if (!SOURCE_ID.test(name) || !Number.isFinite(durationMs) || durationMs < 0) throw new Error('Invalid aggregate function metric')
    const metric = this.functions.get(name) ?? { name, calls: 0, errors: 0, durationMsSum: 0 }
    metric.calls++; if (!ok) metric.errors++; metric.durationMsSum += durationMs
    this.functions.set(name, metric)
  }
  setConnected(connected) {
    const now = Date.now()
    if (this.connected) this.connectedMs += now - this.stateChangedAt
    this.connected = Boolean(connected); this.stateChangedAt = now
  }

  queue() {
    try { const parsed = JSON.parse(this.options.storage.getItem(this.key) ?? '[]'); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
  }
  save(queue) { this.options.storage.setItem(this.key, JSON.stringify(queue.slice(-this.options.maxQueue))) }

  snapshot() {
    const now = Math.max(Date.now(), this.startedAt + 1000)
    const connectedMs = this.connectedMs + (this.connected ? Date.now() - this.stateChangedAt : 0)
    return {
      schemaVersion: '1', idempotencyKey: crypto.randomUUID(), sourceId: this.options.sourceId,
      sdkVersion: SDK_VERSION, ...(this.options.waVersion ? { waVersion: this.options.waVersion } : {}),
      observedFrom: new Date(this.startedAt).toISOString(), observedTo: new Date(now).toISOString(),
      counters: { ...this.counters }, responseLatency: { ...this.latency },
      availability: { connectedSeconds: Math.min(Math.round((now - this.startedAt) / 1000), Math.round(connectedMs / 1000)), observedSeconds: Math.round((now - this.startedAt) / 1000) },
      functions: [...this.functions.values()],
    }
  }

  async flush() {
    if (!this.options) throw new Error('Telemetry client is not configured')
    const pending = this.queue()
    pending.push(this.snapshot())
    this.save(pending)
    this.reset(true)
    let delivered = 0
    while (pending.length) {
      const json = new TextEncoder().encode(JSON.stringify({ schemaVersion: '1', snapshots: pending.slice(0, 25) }))
      const compressed = this.options.compression && typeof CompressionStream !== 'undefined'
      const body = compressed ? await gzip(json) : json
      let response
      try {
        response = await this.options.fetch(`${this.options.endpoint.replace(/\/$/, '')}/api/v1/telemetry/snapshots`, {
          method: 'POST', headers: { authorization: `Bearer ${this.options.apiKey}`,
            'content-type': 'application/octet-stream', ...(compressed ? { 'content-encoding': 'gzip' } : {}) }, body,
        })
      } catch { this.save(pending); return { delivered: 0, pending: pending.length } }
      if (!response.ok) { this.save(pending); return { delivered: 0, pending: pending.length, status: response.status } }
      const batchSize = Math.min(25, pending.length)
      pending.splice(0, batchSize); delivered += batchSize; this.save(pending)
    }
    return { delivered, pending: 0 }
  }

  async close() { if (this.timer) clearInterval(this.timer); this.timer = undefined; return this.flush() }
}

export const wppTelemetry = new WppTelemetryClient()
