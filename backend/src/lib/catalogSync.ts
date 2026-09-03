import { createHash } from 'crypto';
import { isPrivateUrl } from './urlSafety';

export type CanonicalProduct = {
  id: string; title: string; description: string; priceMinor: number; currency: string;
  available: boolean; url: string; sku: string; images: string[];
};
export type CatalogMapping = { sourceProductId: string; wppProductId: string; fingerprint: string; status: 'active'|'archived'; imageUrls: string[] };
export type CatalogOperation = {
  sourceProductId: string; wppProductId?: string; action: 'create'|'update'|'hide'|'unhide'|'noop';
  product?: CanonicalProduct; fingerprint?: string; previousImageUrls?: string[];
};

const clean = (value: unknown, max: number) => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const url = (value: unknown) => {
  const text = String(value ?? '');
  if (!text) return '';
  const parsed = new URL(text);
  if (!['http:','https:'].includes(parsed.protocol) || isPrivateUrl(text)) throw new Error('Catalog URLs must be public HTTP(S)');
  return parsed.toString();
};
const currency = (value: unknown) => {
  const normalized = String(value ?? '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error('Invalid currency');
  return normalized;
};
const minor = (value: unknown) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 99_999_999_999) throw new Error('Invalid price');
  return Math.round(number * 100);
};

export function normalizeShopifyProduct(product: Record<string, any>): CanonicalProduct[] {
  const images = (product.images?.nodes ?? []).map((entry: any) => url(entry.url)).filter(Boolean).slice(0, 10);
  const variants = product.variants?.nodes ?? [];
  return variants.map((variant: any) => ({
    id: `${product.id}:${variant.id}`, title: clean((variants.length > 1 ? `${product.title} - ${variant.title}` : product.title), 160),
    description: clean(product.descriptionHtml, 1000), priceMinor: minor(variant.price), currency: currency(variant.currencyCode),
    available: product.status === 'ACTIVE' && Boolean(variant.availableForSale), url: url(product.onlineStoreUrl ?? ''),
    sku: clean(variant.sku || variant.id, 100), images,
  }));
}

export function normalizeWooProduct(product: Record<string, any>): CanonicalProduct[] {
  const images = (product.images ?? []).map((entry: any) => url(entry.src)).filter(Boolean).slice(0, 10);
  const variations = Array.isArray(product._variations) && product._variations.length ? product._variations : [product];
  return variations.map((variant: any) => ({
    id: `${product.id}:${variant.id}`, title: clean(variant.name || product.name, 160),
    description: clean(product.description || product.short_description, 1000),
    priceMinor: minor(variant.price || product.price || 0), currency: currency(product._currency),
    available: product.status === 'publish' && (variant.stock_status ?? product.stock_status) !== 'outofstock',
    url: url(product.permalink ?? ''), sku: clean(variant.sku || product.sku || variant.id, 100), images,
  }));
}

export function productFingerprint(product: CanonicalProduct): string {
  return createHash('sha256').update(JSON.stringify(product)).digest('hex');
}

export function planCatalogSync(products: CanonicalProduct[], mappings: CatalogMapping[]): CatalogOperation[] {
  const bySource = new Map(mappings.map((mapping) => [mapping.sourceProductId, mapping]));
  const seen = new Set<string>();
  const operations: CatalogOperation[] = [];
  for (const product of products) {
    if (seen.has(product.id)) throw new Error(`Duplicate canonical product ${product.id}`);
    seen.add(product.id);
    const mapping = bySource.get(product.id);
    const fingerprint = productFingerprint(product);
    if (!mapping) {
      operations.push({ sourceProductId: product.id, action: product.available ? 'create' : 'noop', product, fingerprint });
      continue;
    }
    if (mapping.fingerprint !== fingerprint) operations.push({ sourceProductId: product.id, wppProductId: mapping.wppProductId,
      action: 'update', product, fingerprint, previousImageUrls: mapping.imageUrls });
    if (!product.available && mapping.status === 'active') operations.push({ sourceProductId: product.id, wppProductId: mapping.wppProductId, action: 'hide' });
    else if (product.available && mapping.status === 'archived') operations.push({ sourceProductId: product.id, wppProductId: mapping.wppProductId, action: 'unhide' });
    else if (mapping.fingerprint === fingerprint) operations.push({ sourceProductId: product.id, wppProductId: mapping.wppProductId, action: 'noop' });
  }
  for (const mapping of mappings) {
    if (!seen.has(mapping.sourceProductId) && mapping.status === 'active') {
      operations.push({ sourceProductId: mapping.sourceProductId, wppProductId: mapping.wppProductId, action: 'hide' });
    }
  }
  return operations;
}
