import { assertPublicUrl, isPrivateUrl } from './urlSafety';
import { normalizeShopifyProduct, normalizeWooProduct, type CanonicalProduct } from './catalogSync';

export type CatalogFetch = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;
export type CatalogUrlCheck = (url:string)=>Promise<unknown>;

const assertBaseUrl = (raw: string) => {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || isPrivateUrl(raw)) throw new Error('Connection URL must be public HTTPS');
  return url.toString().replace(/\/$/, '');
};

async function checkedJson(response: Response) {
  if (!response.ok) throw new Error(`Remote API returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.json() as Promise<any>;
}

export async function fetchShopifyProducts(storeUrl: string, credentials: Record<string, string>, fetcher: CatalogFetch = fetch, urlCheck:CatalogUrlCheck=assertPublicUrl): Promise<CanonicalProduct[]> {
  const base = assertBaseUrl(storeUrl);
  await urlCheck(base);
  if (!credentials.accessToken) throw new Error('Shopify accessToken is required');
  const version = /^20\d\d-(01|04|07|10)$/.test(credentials.apiVersion ?? '') ? credentials.apiVersion : '2026-07';
  const products: CanonicalProduct[] = [];
  let cursor: string | null = null;
  do {
    const query = `query CatalogProducts($cursor:String){products(first:100,after:$cursor){pageInfo{hasNextPage endCursor}nodes{id title descriptionHtml status onlineStoreUrl priceRangeV2{minVariantPrice{currencyCode}} images(first:10){nodes{url}} variants(first:100){nodes{id title sku price availableForSale}}}}}`;
    const payload = await checkedJson(await fetcher(`${base}/admin/api/${version}/graphql.json`, {
      method: 'POST', headers: { 'content-type':'application/json', 'x-shopify-access-token':credentials.accessToken },
      body: JSON.stringify({ query, variables:{ cursor } }), signal: AbortSignal.timeout(30_000),
    }));
    if (payload.errors?.length) throw new Error(`Shopify GraphQL: ${JSON.stringify(payload.errors).slice(0, 500)}`);
    const connection = payload.data?.products;
    if (!connection?.nodes) throw new Error('Shopify response did not contain products');
    for (const product of connection.nodes) {
      const currencyCode = product.priceRangeV2?.minVariantPrice?.currencyCode;
      for (const variant of product.variants?.nodes ?? []) variant.currencyCode = currencyCode;
      products.push(...normalizeShopifyProduct(product));
    }
    cursor = connection.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);
  return products;
}

export async function fetchWooProducts(storeUrl: string, credentials: Record<string, string>, fetcher: CatalogFetch = fetch, urlCheck:CatalogUrlCheck=assertPublicUrl): Promise<CanonicalProduct[]> {
  const base = assertBaseUrl(storeUrl);
  await urlCheck(base);
  if (!credentials.consumerKey || !credentials.consumerSecret || !/^[A-Z]{3}$/.test(credentials.currency ?? '')) throw new Error('WooCommerce credentials and currency are required');
  const authorization = `Basic ${Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString('base64')}`;
  const products: CanonicalProduct[] = [];
  for (let page = 1; page <= 100; page++) {
    const response = await fetcher(`${base}/wp-json/wc/v3/products?per_page=100&page=${page}`, {
      headers:{ authorization }, signal:AbortSignal.timeout(30_000),
    });
    if (response.status === 400 && page > 1) break;
    const rows = await checkedJson(response);
    if (!Array.isArray(rows)) throw new Error('WooCommerce response did not contain products');
    for (const product of rows) {
      product._currency = credentials.currency;
      if (Array.isArray(product.variations) && product.variations.length) {
        const variants = await Promise.all(product.variations.slice(0, 100).map(async (id: number) =>
          checkedJson(await fetcher(`${base}/wp-json/wc/v3/products/${product.id}/variations/${id}`, { headers:{ authorization }, signal:AbortSignal.timeout(30_000) }))));
        product._variations = variants;
      }
      products.push(...normalizeWooProduct(product));
    }
    if (rows.length < 100) break;
  }
  return products;
}

async function imageDataUrl(raw: string, fetcher: CatalogFetch, urlCheck:CatalogUrlCheck): Promise<string> {
  const target = assertBaseUrl(raw);
  await urlCheck(target);
  const response = await fetcher(target, { redirect:'error', signal:AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Image returned ${response.status}`);
  const mime = response.headers.get('content-type')?.split(';')[0] ?? '';
  if (!mime.startsWith('image/')) throw new Error('Catalog image is not an image');
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > 5_242_880) throw new Error('Catalog image exceeds 5 MiB');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > 5_242_880) throw new Error('Catalog image exceeds 5 MiB');
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

export class WppCatalogDestination {
  private base: string;
  constructor(baseUrl: string, private session: string, private token: string, private fetcher: CatalogFetch = fetch, private urlCheck:CatalogUrlCheck=assertPublicUrl) {
    this.base = assertBaseUrl(baseUrl);
    if (!session || !token) throw new Error('WPPConnect session and token are required');
  }
  private async post(path: string, body: unknown) {
    await this.urlCheck(this.base);
    return checkedJson(await this.fetcher(`${this.base}/api/${encodeURIComponent(this.session)}/${path}`, {
      method:'POST', headers:{authorization:`Bearer ${this.token}`,'content-type':'application/json'},
      body:JSON.stringify(body), signal:AbortSignal.timeout(30_000),
    }));
  }
  private async get(path: string) {
    await this.urlCheck(this.base);
    return checkedJson(await this.fetcher(`${this.base}/api/${encodeURIComponent(this.session)}/${path}`, {
      headers:{authorization:`Bearer ${this.token}`},signal:AbortSignal.timeout(30_000),
    }));
  }
  async create(product: CanonicalProduct): Promise<string> {
    if (!product.images[0]) throw new Error('A primary image is required to create a WhatsApp catalog product');
    const current = await this.get('get-products');
    const candidates = Array.isArray(current?.response) ? current.response
      : Array.isArray(current?.response?.products) ? current.response.products
      : Array.isArray(current?.response?.productCollection) ? current.response.productCollection : [];
    const existing = candidates.find((entry:any) => String(entry.retailerId ?? entry.retailer_id ?? '') === product.sku);
    if (existing?.id) return String(existing.id);
    const response = await this.post('add-product', { name:product.title, image:await imageDataUrl(product.images[0], this.fetcher, this.urlCheck),
      description:product.description, price:String(product.priceMinor), url:product.url, retailerId:product.sku, currency:product.currency });
    const id = response?.response?.id ?? response?.response?.productId ?? response?.response?.product?.id;
    if (!id) throw new Error('WPPConnect did not return the created product id');
    for (const image of product.images.slice(1)) await this.post('add-product-image', { id:String(id), base64:await imageDataUrl(image, this.fetcher, this.urlCheck) });
    return String(id);
  }
  async update(id: string, product: CanonicalProduct, previousImages: string[]) {
    await this.post('edit-product', { id, options:{ name:product.title, description:product.description, price:String(product.priceMinor),
      url:product.url, retailerId:product.sku, currency:product.currency } });
    if (JSON.stringify(previousImages) !== JSON.stringify(product.images) && product.images[0]) {
      await this.post('change-product-image', { id, base64:await imageDataUrl(product.images[0], this.fetcher, this.urlCheck) });
      for (let index = Math.max(0, previousImages.length - 2); index >= 0 && previousImages.length > 1; index--) {
        await this.post('remove-product-image', { id, index });
      }
      for (const image of product.images.slice(1)) await this.post('add-product-image', { id, base64:await imageDataUrl(image, this.fetcher, this.urlCheck) });
    }
  }
  async setHidden(id: string, hidden: boolean) { await this.post('set-product-visibility', { id, value:hidden }); }
}
