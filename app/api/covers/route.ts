import { venues } from '@/lib/data';
import { dbConfigured, getState, patchMeta } from '@/lib/db';
import { fail, json, readBody } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function pickImage(html: string, base: string): string | null {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => m[0]);
  const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
  for (const key of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) {
    for (const tag of metas) {
      const id = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
      const content = attr(tag, 'content');
      if (id === key && content) {
        try {
          const url = new URL(content.replace(/&amp;/g, '&'), base);
          if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
        } catch { /* ignore malformed */ }
      }
    }
  }
  return null;
}

async function scrape(site: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(site, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 400_000);
    return pickImage(html, res.url || site);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Fetch each venue's Open Graph image from its own site. Only venue sites from the dataset are ever fetched. */
export async function POST(req: Request) {
  if (!dbConfigured()) return fail('Database not configured', 503);
  const body = await readBody(req);
  const force = Boolean(body.force);
  const only = typeof body.venue === 'string' ? body.venue : null;
  const state = await getState();
  const have = new Map(state.meta.map(m => [m.venue_id, m.cover_url]));
  const todo = venues.filter(v => v.website && (!only || v.id === only) && (force || only || !have.get(v.id)));

  const found: Record<string, string> = {};
  const missed: string[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < todo.length) {
      const v = todo[i++];
      const img = await scrape(v.website!);
      if (img) {
        found[v.id] = img;
        await patchMeta(v.id, { cover_url: img });
      } else missed.push(v.id);
    }
  }));
  return json({ found, missed, checked: todo.length });
}
