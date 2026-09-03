import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'
import { WppLicenseClient, verifyCredential } from '../src/index.js'

function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'WPP-LICENSE', v: 1 })).toString('base64url')
  const claims = { v: 1, appId: 'app', licenseId: 'license', entitlements: { pro: true }, limits: {}, iat: 1, exp: Math.floor(Date.now() / 1000) + 300, offlineUntil: Math.floor(Date.now() / 1000) + 3600 }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const input = `${header}.${payload}`
  return { claims, token: `${input}.${sign(null, Buffer.from(input), privateKey).toString('base64url')}`, publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString() }
}

test('verifies Ed25519 credentials locally', async () => {
  const data = fixture()
  assert.deepEqual(await verifyCredential(data.token, data.publicKey), data.claims)
  await assert.rejects(() => verifyCredential(`${data.token}x`, data.publicKey), /signature/)
})

test('uses bounded offline cache only after a transport failure', async () => {
  const data = fixture()
  const storage = new Map()
  let online = true
  const client = new WppLicenseClient().configure({
    baseUrl: 'https://licenses.example', appId: 'app', publicKey: data.publicKey, installationId: 'device',
    storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    fetch: async () => { if (!online) throw new TypeError('network down'); return new Response(JSON.stringify({ valid: true, token: data.token })) },
  })
  assert.equal((await client.verifyLicense('key')).source, 'server')
  online = false
  assert.equal((await client.verifyLicense('key')).source, 'offline-cache')
})

test('does not mask an explicit server revocation with cached data', async () => {
  const data = fixture()
  const storage = new Map()
  let revoked = false
  const client = new WppLicenseClient().configure({
    baseUrl: 'https://licenses.example', appId: 'app', publicKey: data.publicKey,
    storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    fetch: async () => revoked
      ? new Response(JSON.stringify({ valid: false, error: 'revoked' }), { status: 403 })
      : new Response(JSON.stringify({ valid: true, token: data.token })),
  })
  await client.verifyLicense('key')
  revoked = true
  await assert.rejects(() => client.verifyLicense('key'), /revoked/)
})
