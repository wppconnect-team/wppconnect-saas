import { timingSafeEqual } from 'crypto';

export function acceptsBearerSecret(authorization: string | null, expected: string): boolean {
  if (!expected || !authorization?.startsWith('Bearer ')) return false;
  const received = authorization.slice(7);
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length
    && timingSafeEqual(expectedBytes, receivedBytes);
}
