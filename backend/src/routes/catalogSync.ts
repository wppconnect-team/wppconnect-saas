import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Elysia, t } from 'elysia';
import { sql } from '../db';
import { decryptSecret, encryptSecret } from '../lib/encryptedSecret';
import { acceptsBearerSecret } from '../lib/internalAuth';
import { assertPublicUrl, isPrivateUrl } from '../lib/urlSafety';
import { authPlugin } from '../plugins/auth';
import { processCatalogSyncBatch, processCatalogWebhookBatch } from '../workers/catalogSyncWorker';

const hash = (value:string) => createHash('sha256').update(value).digest('hex');
const safeHttps = (value:string) => {
  try { const url=new URL(value); return url.protocol==='https:' && !url.username && !url.password && !isPrivateUrl(value); }
  catch { return false; }
};
const slugShop = (value:string) => {
  const host = value.includes('://') ? new URL(value).hostname : value;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(host)) throw new Error('Invalid myshopify.com store');
  return `https://${host.toLowerCase()}`;
};

async function createConnection(input: {
  workspaceId:string; name:string; provider:'shopify'|'woocommerce'; storeUrl:string;
  sourceCredentials:Record<string,string>; wppServerUrl:string; wppSession:string; wppToken:string; webhookUrl?:string;
}) {
  const signingSecret = input.webhookUrl ? `whsec_${randomBytes(32).toString('base64url')}` : null;
  const [connection] = await sql`
    INSERT INTO catalog_connections (workspace_id,name,provider,store_url,encrypted_source_credentials,
      wpp_server_url,wpp_session,encrypted_wpp_token,webhook_url,encrypted_webhook_secret)
    VALUES (${input.workspaceId},${input.name},${input.provider},${input.storeUrl},${encryptSecret(JSON.stringify(input.sourceCredentials))},
      ${input.wppServerUrl},${input.wppSession},${encryptSecret(input.wppToken)},${input.webhookUrl ?? null},
      ${signingSecret ? encryptSecret(signingSecret) : null})
    RETURNING id,name,provider,store_url AS "storeUrl",wpp_server_url AS "wppServerUrl",wpp_session AS "wppSession",
      webhook_url AS "webhookUrl",status,created_at AS "createdAt"`;
  return { connection, signingSecret };
}

const connectionBody = t.Object({
  name:t.String({minLength:2,maxLength:160}), provider:t.Union([t.Literal('shopify'),t.Literal('woocommerce')]),
  storeUrl:t.String({format:'uri',maxLength:2048}), sourceCredentials:t.Record(t.String({maxLength:80}),t.String({maxLength:1000})),
  wppServerUrl:t.String({format:'uri',maxLength:2048}),wppSession:t.String({minLength:1,maxLength:120}),
  wppToken:t.String({minLength:8,maxLength:1000}),webhookUrl:t.Optional(t.String({format:'uri',maxLength:2048})),
});

export const catalogSyncRoutes = new Elysia({prefix:'/api/catalog'})
  .use(authPlugin)
  .get('/connections',async ({workspaceId}) => ({data:await sql`
    SELECT id,name,provider,store_url AS "storeUrl",wpp_server_url AS "wppServerUrl",wpp_session AS "wppSession",
      webhook_url AS "webhookUrl",status,created_at AS "createdAt",updated_at AS "updatedAt"
    FROM catalog_connections WHERE workspace_id=${workspaceId} ORDER BY created_at DESC`}))
  .post('/connections',async ({workspaceId,body,set}) => {
    if (!safeHttps(body.storeUrl)||!safeHttps(body.wppServerUrl)||(body.webhookUrl&&!safeHttps(body.webhookUrl))) {
      set.status=422;return {error:'Only public HTTPS connection URLs are accepted'};
    }
    if (body.provider==='shopify'&&!body.sourceCredentials.accessToken) {set.status=422;return {error:'Shopify accessToken is required'};}
    if (body.provider==='woocommerce'&&(!body.sourceCredentials.consumerKey||!body.sourceCredentials.consumerSecret||!/^[A-Z]{3}$/.test(body.sourceCredentials.currency??''))) {
      set.status=422;return {error:'WooCommerce consumerKey, consumerSecret, and currency are required'};
    }
    try {await Promise.all([assertPublicUrl(body.storeUrl),assertPublicUrl(body.wppServerUrl),...(body.webhookUrl?[assertPublicUrl(body.webhookUrl)]:[])]);}
    catch(error){set.status=422;return {error:String(error)};}
    let storeUrl=body.storeUrl;
    if(body.provider==='shopify'){try{storeUrl=slugShop(body.storeUrl);}catch(error){set.status=422;return {error:String(error)};}}
    const result=await createConnection({workspaceId,...body,storeUrl});set.status=201;return {data:result.connection,signingSecret:result.signingSecret};
  },{body:connectionBody})
  .post('/connections/shopify/oauth/start',async ({workspaceId,body,set}) => {
    const clientId=process.env.SHOPIFY_CLIENT_ID??'';
    const publicUrl=process.env.CONTROL_PLANE_PUBLIC_URL??'';
    if (!clientId||!process.env.SHOPIFY_CLIENT_SECRET||!safeHttps(publicUrl)) {set.status=503;return {error:'Shopify OAuth is not configured'};}
    let storeUrl:string;
    try {storeUrl=slugShop(body.shop);}catch(error){set.status=422;return {error:String(error)};}
    if (!safeHttps(body.wppServerUrl)||(body.webhookUrl&&!safeHttps(body.webhookUrl))) {set.status=422;return {error:'Only public HTTPS URLs are accepted'};}
    try {await Promise.all([assertPublicUrl(storeUrl),assertPublicUrl(body.wppServerUrl),...(body.webhookUrl?[assertPublicUrl(body.webhookUrl)]:[])]);}
    catch(error){set.status=422;return {error:String(error)};}
    const state=randomBytes(32).toString('base64url');
    await sql`INSERT INTO catalog_shopify_oauth_states (state_hash,workspace_id,name,store_url,wpp_server_url,wpp_session,
      encrypted_wpp_token,webhook_url,expires_at) VALUES (${hash(state)},${workspaceId},${body.name},${storeUrl},${body.wppServerUrl},
      ${body.wppSession},${encryptSecret(body.wppToken)},${body.webhookUrl??null},NOW()+INTERVAL '10 minutes')`;
    const redirect=`${publicUrl.replace(/\/$/,'')}/api/catalog/shopify/oauth/callback`;
    const authorize=new URL(`${storeUrl}/admin/oauth/authorize`);authorize.searchParams.set('client_id',clientId);
    authorize.searchParams.set('scope','read_products');authorize.searchParams.set('redirect_uri',redirect);authorize.searchParams.set('state',state);
    return {authorizeUrl:authorize.toString(),expiresIn:600};
  },{body:t.Object({name:t.String({minLength:2,maxLength:160}),shop:t.String({minLength:5,maxLength:255}),
    wppServerUrl:t.String({format:'uri'}),wppSession:t.String({minLength:1,maxLength:120}),wppToken:t.String({minLength:8,maxLength:1000}),
    webhookUrl:t.Optional(t.String({format:'uri'}))})})
  .post('/connections/:id/preview-sync',async ({workspaceId,params,body,set}) => {
    const [connection]=await sql`SELECT id FROM catalog_connections WHERE id=${params.id} AND workspace_id=${workspaceId} AND status='active'`;
    if(!connection){set.status=404;return {error:'Connection not found'};}
    const [run]=await sql`INSERT INTO catalog_sync_runs (connection_id,idempotency_key,mode) VALUES (${params.id},${body.idempotencyKey},'preview')
      ON CONFLICT (connection_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
      RETURNING id,mode,status,counts,created_at AS "createdAt"`;
    set.status=run.status==='queued'?202:200;return {data:run};
  },{body:t.Object({idempotencyKey:t.String({minLength:8,maxLength:200})})})
  .post('/connections/:id/run-sync',async ({workspaceId,params,body,set}) => {
    const result=await sql.begin(async tx=>{
      const [preview]=await tx`SELECT run.id FROM catalog_sync_runs run JOIN catalog_connections connection ON connection.id=run.connection_id
        WHERE run.id=${body.previewRunId} AND run.connection_id=${params.id} AND connection.workspace_id=${workspaceId}
          AND run.mode='preview' AND run.status='succeeded'`;
      if(!preview)return null;
      const [run]=await tx`INSERT INTO catalog_sync_runs (connection_id,preview_run_id,idempotency_key,mode)
        VALUES (${params.id},${body.previewRunId},${body.idempotencyKey},'apply') ON CONFLICT (connection_id,idempotency_key)
        DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING id,mode,status,counts,created_at AS "createdAt"`;
      const [existing]=await tx<{count:number}[]>`SELECT COUNT(*)::int AS count FROM catalog_sync_operations WHERE run_id=${run.id as string}`;
      if(!existing.count)await tx`INSERT INTO catalog_sync_operations (run_id,source_product_id,wpp_product_id,action,canonical_product,fingerprint,previous_image_urls)
        SELECT ${run.id as string},source_product_id,wpp_product_id,action,canonical_product,fingerprint,previous_image_urls
        FROM catalog_sync_operations WHERE run_id=${body.previewRunId}`;
      return run;
    });
    if(!result){set.status=422;return {error:'A completed preview from this connection is required'};}
    set.status=result.status==='queued'?202:200;return {data:result};
  },{body:t.Object({previewRunId:t.String({format:'uuid'}),idempotencyKey:t.String({minLength:8,maxLength:200})})})
  .get('/runs/:id',async ({workspaceId,params,set})=>{
    const [run]=await sql`SELECT run.id,run.connection_id AS "connectionId",run.preview_run_id AS "previewRunId",run.mode,run.status,
      run.counts,run.error_message AS error,run.started_at AS "startedAt",run.completed_at AS "completedAt",run.created_at AS "createdAt"
      FROM catalog_sync_runs run JOIN catalog_connections connection ON connection.id=run.connection_id
      WHERE run.id=${params.id} AND connection.workspace_id=${workspaceId}`;
    if(!run){set.status=404;return {error:'Sync run not found'};}
    const operations=await sql`SELECT id,source_product_id AS "sourceProductId",wpp_product_id AS "wppProductId",action,status,attempts,
      error_message AS error,canonical_product AS product FROM catalog_sync_operations WHERE run_id=${params.id} ORDER BY created_at`;
    return {data:{...run,operations}};
  })
  .delete('/connections/:id',async ({workspaceId,params,set})=>{
    const [row]=await sql`UPDATE catalog_connections SET status='disabled',updated_at=NOW() WHERE id=${params.id} AND workspace_id=${workspaceId} RETURNING id`;
    if(!row){set.status=404;return {error:'Connection not found'};}set.status=204;return null;
  });

export const publicShopifyOAuthRoutes = new Elysia({prefix:'/api/catalog/shopify/oauth'})
  .get('/callback',async ({query,set})=>{
    const secret=process.env.SHOPIFY_CLIENT_SECRET??'';
    const entries=Object.entries(query).filter(([key])=>key!=='hmac'&&key!=='signature').sort(([a],[b])=>a.localeCompare(b));
    const message=entries.map(([key,value])=>`${key}=${Array.isArray(value)?value.join(','):value}`).join('&');
    const expected=createHmac('sha256',secret).update(message).digest('hex');
    const supplied=String(query.hmac??'');
    if(!secret||supplied.length!==expected.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))){set.status=401;return {error:'Invalid Shopify callback signature'};}
    const [state]=await sql<{workspaceId:string;name:string;storeUrl:string;wppServerUrl:string;wppSession:string;wppToken:string;webhookUrl:string|null}[]>`
      UPDATE catalog_shopify_oauth_states SET used_at=NOW() WHERE state_hash=${hash(String(query.state??''))} AND used_at IS NULL AND expires_at>NOW()
      RETURNING workspace_id AS "workspaceId",name,store_url AS "storeUrl",wpp_server_url AS "wppServerUrl",wpp_session AS "wppSession",
        encrypted_wpp_token AS "wppToken",webhook_url AS "webhookUrl"`;
    if(!state||slugShop(String(query.shop??''))!==state.storeUrl){set.status=422;return {error:'Expired or mismatched OAuth state'};}
    try{await assertPublicUrl(state.storeUrl);}catch(error){set.status=422;return {error:String(error)};}
    const response=await fetch(`${state.storeUrl}/admin/oauth/access_token`,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({client_id:process.env.SHOPIFY_CLIENT_ID,client_secret:secret,code:query.code}),signal:AbortSignal.timeout(20_000)});
    if(!response.ok){set.status=502;return {error:`Shopify token exchange returned ${response.status}`};}
    const token=await response.json() as {access_token?:string};if(!token.access_token){set.status=502;return {error:'Shopify did not return an access token'};}
    const result=await createConnection({workspaceId:state.workspaceId,name:state.name,provider:'shopify',storeUrl:state.storeUrl,
      sourceCredentials:{accessToken:token.access_token,apiVersion:'2026-07'},wppServerUrl:state.wppServerUrl,wppSession:state.wppSession,
      wppToken:decryptSecret(state.wppToken),webhookUrl:state.webhookUrl??undefined});
    return {connected:true,data:result.connection,signingSecret:result.signingSecret};
  });

export const internalCatalogSyncRoutes=new Elysia({prefix:'/api/internal/catalog'})
  .get('/drain',async ({request,set})=>{
    if(!acceptsBearerSecret(request.headers.get('authorization'),process.env.CRON_SECRET??'')){set.status=401;return {error:'Invalid cron credential'};}
    const runs=await processCatalogSyncBatch(20);const webhooks=await processCatalogWebhookBatch(20);return {runs,webhooks};
  });
