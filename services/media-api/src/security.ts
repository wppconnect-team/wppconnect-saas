import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');

export function signPayload(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

export function signResult(secret: string, jobId: string, expires: number): string {
  return createHmac('sha256', secret).update(`${jobId}.${expires}`).digest('hex');
}

export function verifyResult(secret: string, jobId: string, expires: number, provided: string): boolean {
  if (!Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const expected = signResult(secret, jobId, expires);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function privateAddress(address: string): boolean {
  if (address === '::1' || address === '::' || address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true;
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function assertPublicHttpsUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) {
    throw new Error('Only credential-free HTTPS URLs are accepted');
  }
  const results = await lookup(url.hostname, { all: true, verbatim: true });
  if (!results.length || results.some(({ address }) => privateAddress(address))) {
    throw new Error('Private or unresolved destinations are not accepted');
  }
  return url;
}
