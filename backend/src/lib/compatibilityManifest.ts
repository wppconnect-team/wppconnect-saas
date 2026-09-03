import { createPublicKey, generateKeyPairSync, sign, verify } from 'crypto';

export type CapabilityState = 'supported' | 'degraded' | 'disabled' | 'unknown';

export interface CompatibilityManifestPayload {
  v: 1;
  id: string;
  revision: number;
  package: string;
  whatsappVersion: string;
  minimumPackageVersion: string;
  recommendedPackageVersion: string;
  capabilities: Record<string, CapabilityState>;
  featureFlags: Record<string, boolean>;
  workaroundUrl?: string;
  notes?: string;
  issuedAt: string;
  expiresAt: string;
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

export function createCompatibilityManifestKeys(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export function compatibilityManifestPublicKey(privateKey: string): string {
  return createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
}

export function issueCompatibilityManifest(
  privateKey: string,
  keyId: string,
  payload: CompatibilityManifestPayload,
): string {
  const header = encode(JSON.stringify({ alg: 'EdDSA', typ: 'WPP-COMPATIBILITY', v: 1, kid: keyId }));
  const encodedPayload = encode(JSON.stringify(payload));
  const input = `${header}.${encodedPayload}`;
  return `${input}.${sign(null, Buffer.from(input), privateKey).toString('base64url')}`;
}

export function verifyCompatibilityManifest(
  token: string,
  publicKey: string,
  now = Date.now(),
): CompatibilityManifestPayload {
  const [header, encodedPayload, signature] = token.split('.');
  if (!header || !encodedPayload || !signature) throw new Error('Malformed compatibility manifest');
  const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as Record<string, unknown>;
  if (decodedHeader.alg !== 'EdDSA' || decodedHeader.typ !== 'WPP-COMPATIBILITY' || decodedHeader.v !== 1) {
    throw new Error('Unsupported compatibility manifest header');
  }
  const input = `${header}.${encodedPayload}`;
  if (!verify(null, Buffer.from(input), publicKey, Buffer.from(signature, 'base64url'))) {
    throw new Error('Invalid compatibility manifest signature');
  }
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as CompatibilityManifestPayload;
  if (payload.v !== 1 || !payload.id || !payload.package || !Number.isSafeInteger(payload.revision)) {
    throw new Error('Invalid compatibility manifest payload');
  }
  if (Date.parse(payload.expiresAt) <= now) throw new Error('Expired compatibility manifest');
  return payload;
}
