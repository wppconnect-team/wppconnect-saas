import { generateKeyPairSync, randomBytes, sign, verify } from 'crypto';
import { hashOpaqueToken } from './platform';

export interface LicenseClaims {
  v: 1;
  appId: string;
  licenseId: string;
  installationHash?: string;
  entitlements: Record<string, unknown>;
  limits: Record<string, unknown>;
  iat: number;
  exp: number;
  offlineUntil: number;
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

export function createLicenseSigningKeys(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export function createLicenseKey(environment = 'sandbox') {
  const plain = `lic_${environment === 'active' ? 'live' : 'test'}_${randomBytes(24).toString('base64url')}`;
  return { plain, hash: hashOpaqueToken(plain), prefix: plain.slice(0, 20) };
}

export function installationHash(appId: string, installationId: string): string {
  return hashOpaqueToken(`${appId}:${installationId}`);
}

export function issueLicenseCredential(privateKey: string, claims: LicenseClaims): string {
  const header = encode(JSON.stringify({ alg: 'EdDSA', typ: 'WPP-LICENSE', v: 1 }));
  const payload = encode(JSON.stringify(claims));
  const input = `${header}.${payload}`;
  return `${input}.${sign(null, Buffer.from(input), privateKey).toString('base64url')}`;
}

export function verifyLicenseCredential(token: string, publicKey: string, now = Date.now()): LicenseClaims {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) throw new Error('Malformed license credential');
  const input = `${header}.${payload}`;
  if (!verify(null, Buffer.from(input), publicKey, Buffer.from(signature, 'base64url'))) {
    throw new Error('Invalid license signature');
  }
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as LicenseClaims;
  if (claims.v !== 1 || claims.exp * 1000 <= now) throw new Error('Expired license credential');
  return claims;
}
