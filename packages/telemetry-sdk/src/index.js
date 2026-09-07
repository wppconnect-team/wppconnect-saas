import { validateSnapshot } from './validation.js'

const SDK_VERSION = '0.1.1'
const COUNTERS = ['messages.sent', 'messages.received', 'messages.deleted', 'errors.total']
const SOURCE_ID = /^[a-zA-Z][a-zA-Z0-9._:-]{0,119}$/
const queueLocks = new Map()

async function queueLock(key, work) {
  if (globalThis.navigator?.locks) return navigator.locks.request(key, work)
  const previous = queueLocks.get(key) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(work)
  queueLocks.set(key, current)
  try { return await current } finally { if (queueLocks.get(key) === current) queueLocks.delete(key) }
}

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
    if (this.options) throw new Error('Use a new telemetry client to change credentials or configuration')
    if (!options?.endpoint || !options?.apiKey || typeof options?.sourceId !== 'string' || !SOURCE_ID.test(options.sourceId)) throw new Error('endpoint, apiKey, and a non-identifying sourceId are required')
    const endpoint = new URL(options.endpoint)
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Telemetry endpoint must be HTTPS without credentials, query or fragment')
    const configured = { flushIntervalMs: 60_000, maxQueue: 100, requestTimeoutMs: 10_000, compression: true, fetch: globalThis.fetch, ...options }
    for (const [key, minimum, maximum] of [['flushIntervalMs',1000,86400000],['maxQueue',1,1000],['requestTimeoutMs',100,60000]]) {
      if (!Number.isSafeInteger(configured[key]) || configured[key] < minimum || configured[key] > maximum) throw new Error(`Invalid ${key}`)
    }
    if (typeof configured.apiKey !== 'string' || typeof configured.fetch !== 'function') throw new Error('Invalid apiKey or fetch implementation')
    this.options = { ...configured, endpoint: endpoint.toString().replace(/\/$/, ''), storage: configured.storage ?? globalThis.localStorage ?? memoryStorage() }
    // Do not persist a plaintext credential or reuse another account's offline queue.
    this.keyReady = crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([this.options.endpoint,options.sourceId,options.apiKey])))
      .then(bytes => { this.key = `wpp.telemetry.v2.${Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('')}` })
    this.reset()
    if (options.autoFlush !== false) {
      this.timer = setInterval(() => void this.flush().catch(error => { try { this.options.onError?.(error) } catch {} }), this.options.flushIntervalMs)
      this.timer.unref?.()
    }
    return this
  }

  reset(preserveConnection = false) {
    const wasConnected = preserveConnection && this.connected
    this.startedAt = Date.now()
    this.stateChangedAt = this.startedAt
    this.connected = Boolean(wasConnected)
    this.connectedMs = 0
    this.counters = Object.fromEntries(COUNTERS.map(key => [key, 0]))
    this.latency = { sumMs: 0, count: 0, buckets: [100, 250, 500, 1000, 2500, 5000, 1e15], counts: [0, 0, 0, 0, 0, 0, 0] }
    this.functions = new Map()
  }

  increment(key, quantity = 1) {
    this.assertRecording()
    if (!COUNTERS.includes(key) || !Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Unsupported counter or quantity')
    if (this.counters[key]+quantity>1e9) throw new Error('Counter limit reached; flush telemetry first')
    this.counters[key] += quantity
  }
  recordMessage(direction, quantity = 1) { this.increment(`messages.${direction}`, quantity) }
  recordDeletedMessage(quantity = 1) { this.increment('messages.deleted', quantity) }
  recordError(quantity = 1) { this.increment('errors.total', quantity) }
  recordResponseLatency(durationMs) {
    this.assertRecording()
    if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error('durationMs must be non-negative')
    if (this.latency.sumMs+durationMs>1e15 || this.latency.count>=1e9) throw new Error('Latency limit reached; flush telemetry first')
    this.latency.sumMs += durationMs; this.latency.count++
    const index = this.latency.buckets.findIndex(bucket => durationMs <= bucket)
    this.latency.counts[index < 0 ? this.latency.counts.length - 1 : index]++
  }
  recordFunction(name, durationMs, ok = true) {
    this.assertRecording()
    if (typeof name !== 'string' || !SOURCE_ID.test(name) || typeof ok !== 'boolean' || !Number.isFinite(durationMs) || durationMs < 0) throw new Error('Invalid aggregate function metric')
    const metric = this.functions.get(name) ?? { name, calls: 0, errors: 0, durationMsSum: 0 }
    if ((!this.functions.has(name) && this.functions.size>=200) || metric.calls>=1e9 || metric.durationMsSum+durationMs>1e15) throw new Error('Function metric limit reached; flush telemetry first')
    metric.calls++; if (!ok) metric.errors++; metric.durationMsSum += durationMs
    this.functions.set(name, metric)
  }
  setConnected(connected) {
    this.assertRecording()
    if (typeof connected !== 'boolean') throw new Error('connected must be boolean')
    const now = Date.now()
    if (this.connected) this.connectedMs += now - this.stateChangedAt
    this.connected = Boolean(connected); this.stateChangedAt = now
  }

  queue() {
    const parsed = JSON.parse(this.options.storage.getItem(this.key) ?? '[]')
    if (!Array.isArray(parsed) || parsed.length > 1000) throw new Error('Invalid stored telemetry queue; refusing to overwrite it')
    return parsed.map(validateSnapshot)
  }
  save(queue) { this.options.storage.setItem(this.key, JSON.stringify(queue)) }

  snapshot() {
    const now = Math.max(Date.now(), this.startedAt + 1000)
    const connectedMs = this.connectedMs + (this.connected ? Date.now() - this.stateChangedAt : 0)
    return validateSnapshot({
      schemaVersion: '1', idempotencyKey: crypto.randomUUID(), sourceId: this.options.sourceId,
      sdkVersion: SDK_VERSION, ...(this.options.waVersion ? { waVersion: this.options.waVersion } : {}),
      observedFrom: new Date(this.startedAt).toISOString(), observedTo: new Date(now).toISOString(),
      counters: { ...this.counters }, responseLatency: { ...this.latency, buckets:[...this.latency.buckets],counts:[...this.latency.counts] },
      availability: { connectedSeconds: Math.min(Math.round((now - this.startedAt) / 1000), Math.round(connectedMs / 1000)), observedSeconds: Math.round((now - this.startedAt) / 1000) },
      functions: [...this.functions.values()].map(metric=>({...metric})),
    })
  }

  flush() {
    if (this.inFlight) return this.inFlight
    this.inFlight = this.flushPending().finally(() => { this.inFlight = undefined })
    return this.inFlight
  }

  async flushPending() {
    if (!this.options) throw new Error('Telemetry client is not configured')
    await this.keyReady
    return queueLock(this.key, () => this.deliverPending())
  }

  async deliverPending() {
    const pending = this.queue()
    const queueFull = pending.length >= this.options.maxQueue
    if (!queueFull) {
      pending.push(this.snapshot())
      this.save(pending)
      this.reset(true)
    }
    const result = extra => ({...extra,...(queueFull ? {queueFull:true} : {})})
    let delivered = 0
    while (pending.length) {
      let batchSize = Math.min(25, pending.length)
      let json
      do {
        json = new TextEncoder().encode(JSON.stringify({schemaVersion:'1',snapshots:pending.slice(0,batchSize)}))
        if (json.byteLength <= 250000) break
        if (batchSize === 1) throw new Error('Telemetry snapshot exceeds transport limit')
        batchSize = Math.max(1,Math.floor(batchSize / 2))
      } while (true)
      const compressed = this.options.compression && typeof CompressionStream !== 'undefined'
      const body = compressed ? await gzip(json) : json
      let response
      try {
        response = await this.options.fetch(`${this.options.endpoint.replace(/\/$/, '')}/api/v1/telemetry/snapshots`, {
          method: 'POST', headers: { authorization: `Bearer ${this.options.apiKey}`,
            'content-type': 'application/octet-stream', ...(compressed ? { 'content-encoding': 'gzip' } : {}) }, body,
          redirect:'error', credentials:'omit', signal:AbortSignal.timeout(this.options.requestTimeoutMs),
        })
      } catch { this.save(pending); return result({ delivered, pending: pending.length }) }
      if (!response.ok) { await response.body?.cancel(); this.save(pending); return result({ delivered, pending: pending.length, status: response.status }) }
      const acknowledgement = await response.json().catch(() => null)
      if (!Number.isSafeInteger(acknowledgement?.accepted) || !Number.isSafeInteger(acknowledgement?.duplicates) ||
          acknowledgement.accepted < 0 || acknowledgement.duplicates < 0 || acknowledgement.accepted + acknowledgement.duplicates !== batchSize) {
        return result({ delivered, pending: pending.length, error: 'INVALID_ACKNOWLEDGEMENT' })
      }
      pending.splice(0, batchSize); delivered += batchSize; this.save(pending)
    }
    return result({ delivered, pending: 0 })
  }

  assertRecording() {
    if (!this.options || this.closing) throw new Error('Telemetry client is not configured or is closing')
  }

  close() {
    if (this.closePromise) return this.closePromise
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    this.closing = true
    this.closePromise = Promise.resolve(this.inFlight).then(() => this.flush())
    return this.closePromise
  }
}

export const wppTelemetry = new WppTelemetryClient()
