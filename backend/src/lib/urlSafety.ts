export function isPrivateUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return true;
  }

  if (!['http:', 'https:'].includes(url.protocol)) return true;

  const hostname = url.hostname;
  if (hostname === 'localhost') return true;
  if (/^127\./.test(hostname)) return true;
  if (hostname === '::1' || hostname === '[::1]') return true;
  if (/^0\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true;
  if (/^fe80:/i.test(hostname)) return true;
  if (/^\[?::1\]?$/.test(hostname)) return true;

  return false;
}
