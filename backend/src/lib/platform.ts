import { createHash, randomBytes } from 'crypto';

export const PLATFORM_PRODUCTS = [
  'cloud-runtime',
  'compatibility-monitor',
  'extension-licensing',
  'media-api',
  'telemetry',
  'catalog-sync',
] as const;

export type PlatformProduct = (typeof PLATFORM_PRODUCTS)[number];

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createApiCredential(environment: string): {
  plain: string;
  hash: string;
  prefix: string;
} {
  const kind = environment === 'production' ? 'live' : 'test';
  const plain = `wpp_${kind}_${randomBytes(24).toString('base64url')}`;
  return {
    plain,
    hash: hashOpaqueToken(plain),
    prefix: plain.slice(0, 18),
  };
}

export function grantsScope(granted: readonly string[], required: string): boolean {
  if (granted.includes('*') || granted.includes(required)) return true;
  const separator = required.indexOf(':');
  return separator > 0 && granted.includes(`${required.slice(0, separator)}:*`);
}

export function entitlementForScope(required: string): {
  product: PlatformProduct;
  entitlement: string;
} | null {
  const namespace = required.split(':', 1)[0];
  if (['sessions', 'messages', 'groups', 'numbers', 'webhooks'].includes(namespace)) {
    return { product: 'cloud-runtime', entitlement: 'api-access' };
  }
  return null;
}

export function normalizeScopes(scopes: readonly string[]): string[] {
  return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))].sort();
}

export function assertUsageQuantity(quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1_000_000_000) {
    throw new Error('Usage quantity must be a positive safe integer up to 1,000,000,000');
  }
  return quantity;
}
