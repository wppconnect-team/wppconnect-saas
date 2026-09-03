const memory = new Map()

function base64urlBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function pemBytes(pem) {
  return base64urlBytes(pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
}

async function verifyCredential(token, publicKey, allowOffline = false) {
  const [header, payload, signature] = token.split('.')
  if (!header || !payload || !signature) throw new Error('Malformed license credential')
  const key = await crypto.subtle.importKey('spki', pemBytes(publicKey), { name: 'Ed25519' }, false, ['verify'])
  const valid = await crypto.subtle.verify(
    'Ed25519', key, base64urlBytes(signature), new TextEncoder().encode(`${header}.${payload}`),
  )
  if (!valid) throw new Error('Invalid license signature')
  const claims = JSON.parse(new TextDecoder().decode(base64urlBytes(payload)))
  const now = Math.floor(Date.now() / 1000)
  if ((!allowOffline && claims.exp <= now) || claims.offlineUntil <= now) {
    throw new Error('License credential expired')
  }
  return claims
}

function defaultStorage() {
  if (typeof localStorage !== 'undefined') return localStorage
  return { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) }
}

export class WppLicenseClient {
  configure(options) {
    this.options = { ...options, baseUrl: options.baseUrl.replace(/\/$/, ''), fetch: options.fetch ?? fetch, storage: options.storage ?? defaultStorage() }
    return this
  }

  async verifyLicense(licenseKey, options = {}) {
    if (!this.options) throw new Error('Call configure() before verifyLicense()')
    const installationId = options.installationId ?? this.options.installationId
    const cacheKey = `wpp-license:${this.options.appId}:${installationId ?? 'unbound'}`
    const operation = options.activate ? 'activate' : 'verify'
    try {
      const response = await this.options.fetch(`${this.options.baseUrl}/api/v1/licenses/${operation}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appId: this.options.appId, licenseKey, installationId }),
      })
      const result = await response.json()
      if (!response.ok || !result.valid || !result.token) {
        this.options.storage.removeItem(cacheKey)
        const rejection = new Error(result.error ?? `License server returned HTTP ${response.status}`)
        rejection.name = 'LicenseRejectedError'
        throw rejection
      }
      const claims = await verifyCredential(result.token, this.options.publicKey)
      this.options.storage.setItem(cacheKey, result.token)
      return { valid: true, source: 'server', claims, token: result.token }
    } catch (error) {
      if (error instanceof Error && error.name === 'LicenseRejectedError') throw error
      const cached = this.options.storage.getItem(cacheKey)
      if (!cached) throw error
      const claims = await verifyCredential(cached, this.options.publicKey, true)
      return { valid: true, source: 'offline-cache', claims, token: cached }
    }
  }
}

export const waAuth = new WppLicenseClient()
export { verifyCredential }
