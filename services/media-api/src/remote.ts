import { assertPublicHttpsUrl } from './security';

export async function downloadBounded(source: string, maxBytes: number, redirects = 0): Promise<{ bytes: Buffer; mime: string | null }> {
  if (redirects > 3) throw new Error('Too many redirects');
  const url = await assertPublicHttpsUrl(source);
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) throw new Error('Redirect did not include a location');
    return downloadBounded(new URL(location, url).toString(), maxBytes, redirects + 1);
  }
  if (!response.ok || !response.body) throw new Error(`Source download returned ${response.status}`);
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new Error('Source exceeds the configured size limit');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new Error('Source exceeds the configured size limit'); }
    chunks.push(value);
  }
  return { bytes: Buffer.concat(chunks), mime: response.headers.get('content-type') };
}
