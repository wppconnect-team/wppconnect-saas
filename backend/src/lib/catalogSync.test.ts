import { describe, expect, test } from 'bun:test';
import { normalizeShopifyProduct, normalizeWooProduct, planCatalogSync, productFingerprint, type CanonicalProduct } from './catalogSync';
import { fetchShopifyProducts, fetchWooProducts, WppCatalogDestination, type CatalogFetch } from './catalogConnectors';
import { assertPublicUrl } from './urlSafety';

const canonical = (id: string, available = true): CanonicalProduct => ({ id, title: `Product ${id}`, description: 'Description', priceMinor: 1990,
  currency: 'BRL', available, url: 'https://shop.example/products/a', sku: `SKU-${id}`, images: ['https://cdn.example/a.jpg'] });

describe('canonical commerce model', () => {
  test('normalizes Shopify and WooCommerce variants to the same contract', () => {
    const shopify = normalizeShopifyProduct({ id:'gid://p/1', title:'Shirt', descriptionHtml:'<p>Cotton</p>', status:'ACTIVE', onlineStoreUrl:'https://shop.example/a',
      images:{nodes:[{url:'https://cdn.example/a.jpg'}]}, variants:{nodes:[{id:'gid://v/2',title:'Blue',sku:'BLUE',price:'19.90',currencyCode:'BRL',availableForSale:true}]} });
    const woo = normalizeWooProduct({ id:1,name:'Shirt',description:'<p>Cotton</p>',status:'publish',stock_status:'instock',price:'19.90',sku:'BLUE',
      permalink:'https://shop.example/a',images:[{src:'https://cdn.example/a.jpg'}],_currency:'BRL' });
    for (const product of [shopify[0], woo[0]]) expect(product).toMatchObject({ description:'Cotton',priceMinor:1990,currency:'BRL',available:true,sku:'BLUE' });
  });

  test('paginates both provider contracts through injected clients', async () => {
    const shopifyCalls:string[]=[];
    const shopify=await fetchShopifyProducts('https://demo.myshopify.com',{accessToken:'token',apiVersion:'2026-07'},async (input,init)=>{
      shopifyCalls.push(String(input));expect((init?.headers as Record<string,string>)['x-shopify-access-token']).toBe('token');
      return new Response(JSON.stringify({data:{products:{pageInfo:{hasNextPage:false},nodes:[{id:'p',title:'A',descriptionHtml:'A',status:'ACTIVE',
        onlineStoreUrl:'https://demo.example/a',priceRangeV2:{minVariantPrice:{currencyCode:'USD'}},images:{nodes:[{url:'https://cdn.example/a.jpg'}]},
        variants:{nodes:[{id:'v',title:'Default',sku:'A',price:'1.25',availableForSale:true}]}}]}}}));
    },async()=>{});
    expect(shopify).toHaveLength(1);expect(shopify[0].priceMinor).toBe(125);expect(shopifyCalls).toHaveLength(1);

    const woo=await fetchWooProducts('https://woo.example',{consumerKey:'key',consumerSecret:'secret',currency:'BRL'},async (_input,init)=>{
      expect((init?.headers as Record<string,string>).authorization).toStartWith('Basic ');
      return new Response(JSON.stringify([{id:1,name:'A',description:'A',status:'publish',stock_status:'instock',price:'2.50',sku:'A',
        permalink:'https://woo.example/a',images:[{src:'https://cdn.example/a.jpg'}]}]));
    },async()=>{});
    expect(woo).toHaveLength(1);expect(woo[0].priceMinor).toBe(250);
  });
});

describe('idempotent sync planning', () => {
  test('creates new products, updates changes, toggles visibility, and never deletes', () => {
    const changed = canonical('changed');
    const operations = planCatalogSync([canonical('new'), changed, canonical('returning'), canonical('unavailable', false)], [
      { sourceProductId:'changed',wppProductId:'w1',fingerprint:'old',status:'active',imageUrls:[] },
      { sourceProductId:'returning',wppProductId:'w2',fingerprint:productFingerprint(canonical('returning')),status:'archived',imageUrls:[] },
      { sourceProductId:'unavailable',wppProductId:'w3',fingerprint:productFingerprint(canonical('unavailable', false)),status:'active',imageUrls:[] },
      { sourceProductId:'removed',wppProductId:'w4',fingerprint:'old',status:'active',imageUrls:[] },
    ]);
    expect(operations.map(({sourceProductId,action}) => `${sourceProductId}:${action}`)).toEqual([
      'new:create','changed:update','returning:unhide','unavailable:hide','removed:hide'
    ]);
    expect(operations.some((operation) => (operation.action as string) === 'delete')).toBe(false);
  });

  test('is a no-op when canonical state and mapping fingerprint match', () => {
    const product = canonical('same');
    expect(planCatalogSync([product], [{sourceProductId:'same',wppProductId:'w',fingerprint:productFingerprint(product),status:'active',imageUrls:product.images}]))
      .toEqual([{sourceProductId:'same',wppProductId:'w',action:'noop'}]);
  });
});

describe('WPPConnect destination contract', () => {
  test('reconciles by SKU before creating and sends price in minor units', async () => {
    const requests:Array<{url:string;method:string;body?:any}>=[];
    const fetcher:CatalogFetch=async (input,init)=>{
      const target=String(input);requests.push({url:target,method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):undefined});
      if(target.endsWith('/get-products'))return new Response(JSON.stringify({response:[]}));
      if(target.startsWith('https://cdn.example/'))return new Response('image',{headers:{'content-type':'image/jpeg'}});
      if(target.endsWith('/add-product'))return new Response(JSON.stringify({response:{id:'wpp-1'}}));
      return new Response('{}');
    };
    const destination=new WppCatalogDestination('https://wpp.example','store','secret-token',fetcher,async()=>{});
    expect(await destination.create(canonical('new'))).toBe('wpp-1');
    expect(requests.find((request)=>request.url.endsWith('/add-product'))?.body).toMatchObject({price:'1990',retailerId:'SKU-new',currency:'BRL'});
  });

  test('returns an existing SKU without duplicating the destination product', async () => {
    let calls=0;
    const destination=new WppCatalogDestination('https://wpp.example','store','secret-token',async ()=>{calls++;return new Response(JSON.stringify({response:[{id:'existing',retailerId:'SKU-same'}]}));},async()=>{});
    expect(await destination.create(canonical('same'))).toBe('existing');expect(calls).toBe(1);
  });
});

test('rejects hostnames that resolve to private addresses before connector access', async () => {
  const resolver = (async () => [{address:'10.0.0.5',family:4}]) as any;
  await expect(assertPublicUrl('https://public-looking.example',resolver)).rejects.toThrow(/private/);
});
