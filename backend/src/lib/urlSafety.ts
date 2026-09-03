import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function isPrivateAddress(address: string): boolean {
  if (address === '::1' || address === '::' || /^(fc|fd|fe80):/i.test(address)) return true;
  if (address.toLowerCase().startsWith('::ffff:')) return isPrivateAddress(address.slice(7));
  if (isIP(address) !== 4) return false;
  const [a,b]=address.split('.').map(Number);
  return a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||
    (a===192&&b===168)||(a===100&&b>=64&&b<=127);
}

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

export async function assertPublicUrl(raw: string, resolver: typeof lookup = lookup): Promise<URL> {
  if (isPrivateUrl(raw)) throw new Error('Private URL is not allowed');
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password)throw new Error('Only credential-free HTTPS URLs are allowed');
  const addresses=await resolver(url.hostname,{all:true,verbatim:true});
  if(!Array.isArray(addresses)||!addresses.length||addresses.some(({address})=>isPrivateAddress(address)))throw new Error('URL resolves to a private or unavailable address');
  return url;
}
