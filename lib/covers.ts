import type { Venue } from './types';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Pages to try for a venue, in order: its own site first, then known listings. */
export function photoPages(v: Venue): string[] {
  return [v.website, ...(v.photo_pages ?? [])].filter((x): x is string => !!x);
}

const LOGO = /logo|favicon|icon|sprite|placeholder|default-share/i;

/** Every candidate image a page declares, best first. Logos sink to the end. */
export function pickImages(html: string, base: string): string[] {
  const out: string[] = [];
  const add = (raw: string | undefined) => {
    if (!raw) return;
    try {
      const u = new URL(raw.trim().replace(/&amp;/g, '&'), base);
      if ((u.protocol === 'https:' || u.protocol === 'http:') && !out.includes(u.toString())) out.push(u.toString());
    } catch { /* ignore malformed */ }
  };
  const tags = [...html.matchAll(/<(?:meta|link)\b[^>]*>/gi)].map(m => m[0]);
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
  for (const key of ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']) {
    for (const tag of tags) {
      const id = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
      if (id === key) add(attr(tag, 'content'));
    }
  }
  for (const tag of tags) if ((attr(tag, 'rel') || '').toLowerCase() === 'image_src') add(attr(tag, 'href'));
  // JSON-LD: Restaurant / LocalBusiness "image" fields.
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (n: unknown): void => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        const o = n as Record<string, unknown>;
        const img = o.image;
        if (typeof img === 'string') add(img);
        else if (Array.isArray(img)) img.forEach(i => add(typeof i === 'string' ? i : (i as { url?: string })?.url));
        else if (img && typeof img === 'object') add((img as { url?: string }).url);
        Object.values(o).forEach(v => typeof v === 'object' && walk(v));
      };
      walk(JSON.parse(m[1]));
    } catch { /* ignore bad JSON-LD */ }
  }
  return [...out.filter(u => !LOGO.test(u)), ...out.filter(u => LOGO.test(u))];
}

async function get(url: string, accept: string, ms: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: ctrl.signal });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** True when the URL answers with an actual image. Catches dead and hotlink-blocked links before we save them. */
async function isImage(url: string): Promise<boolean> {
  const res = await get(url, 'image/*', 6000);
  const ok = !!res && (res.headers.get('content-type') || '').startsWith('image/');
  await res?.body?.cancel().catch(() => {});
  return ok;
}

/** Find a working photo for a venue, or null. Only pages listed in the dataset are ever fetched. */
export async function findCover(v: Venue): Promise<string | null> {
  for (const page of photoPages(v)) {
    const res = await get(page, 'text/html,application/xhtml+xml', 8000);
    if (!res) continue;
    const html = (await res.text()).slice(0, 600_000);
    const imgs = pickImages(html, res.url || page);
    for (const img of imgs.slice(0, 3)) if (await isImage(img)) return img;
  }
  return null;
}

export const MAX_PHOTO_BYTES = 3_500_000;

/** Download an image so it can be kept in Neon. Null if it is not an image or is too large to keep. */
export async function downloadImage(raw: string): Promise<{ type: string; bytes: Uint8Array } | null> {
  const url = safeImageUrl(raw);
  if (!url) return null;
  const res = await get(url.toString(), 'image/*', 10000);
  if (!res) return null;
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!type.startsWith('image/') || type === 'image/svg+xml') { await res.body?.cancel().catch(() => {}); return null; }
  if (Number(res.headers.get('content-length') || 0) > MAX_PHOTO_BYTES) { await res.body?.cancel().catch(() => {}); return null; }
  const bytes = new Uint8Array(await res.arrayBuffer());
  return bytes.byteLength && bytes.byteLength <= MAX_PHOTO_BYTES ? { type, bytes } : null;
}

/** Block requests to obviously internal hosts when relaying a stored image URL. */
export function safeImageUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return null;
    return u;
  } catch {
    return null;
  }
}

export { UA };
