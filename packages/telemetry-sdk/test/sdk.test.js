import assert from 'node:assert/strict'
import test from 'node:test'
import { WppTelemetryClient } from '../src/index.js'

const store = () => {
  const data = new Map()
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
}

test('collects aggregate metrics only and sends the closed schema', async () => {
  const storage = store()
  let payload
  const client = new WppTelemetryClient().configure({ endpoint: 'https://control.example', apiKey: 'wpp_test_key', sourceId: 'server-a',
    autoFlush: false, compression: false, storage, fetch: async (_url, init) => { payload = JSON.parse(new TextDecoder().decode(init.body)); return new Response('{}', { status: 202 }) } })
  client.recordMessage('sent', 2); client.recordMessage('received'); client.recordDeletedMessage()
  client.recordError(); client.recordResponseLatency(120); client.recordFunction('sendText', 50, true)
  client.setConnected(true)
  const result = await client.flush()
  assert.deepEqual(result, { delivered: 1, pending: 0 })
  const snapshot = payload.snapshots[0]
  assert.deepEqual(Object.keys(snapshot).sort(), ['availability','counters','functions','idempotencyKey','observedFrom','observedTo','responseLatency','schemaVersion','sdkVersion','sourceId'].sort())
  assert.equal(JSON.stringify(snapshot).includes('messageContent'), false)
  assert.equal(snapshot.counters['messages.sent'], 2)
  assert.deepEqual(snapshot.functions[0], { name: 'sendText', calls: 1, errors: 0, durationMsSum: 50 })
})

test('retains an offline batch and retries it idempotently before newer data', async () => {
  const storage = store()
  let online = false
  const delivered = []
  const client = new WppTelemetryClient().configure({ endpoint: 'https://control.example', apiKey: 'wpp_test_key', sourceId: 'server-a',
    autoFlush: false, compression: false, storage, fetch: async (_url, init) => {
      if (!online) throw new TypeError('offline')
      delivered.push(JSON.parse(new TextDecoder().decode(init.body))); return new Response('{}', { status: 202 })
    } })
  client.recordMessage('sent')
  assert.deepEqual(await client.flush(), { delivered: 0, pending: 1 })
  const firstId = JSON.parse([...storage.data.values()][0])[0].idempotencyKey
  online = true
  await client.flush()
  assert.equal(delivered[0].snapshots[0].idempotencyKey, firstId)
  assert.equal(JSON.parse([...storage.data.values()][0]).length, 0)
})

test('does not expose APIs that accept content or identifiers', () => {
  const client = new WppTelemetryClient()
  for (const method of ['recordContent','recordPhone','recordJid','recordMedia','recordName']) assert.equal(client[method], undefined)
  assert.throws(() => client.configure({ endpoint: 'https://x', apiKey: 'key', sourceId: '551199999999@c.us' }))
})
