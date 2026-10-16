import { safeImageUrl, UA } from '@/lib/covers';
import { dbConfigured, getCoverUrl } from '@/lib/db';
import { checkVenue } from '@/lib/server';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 4_000_000; // Stay under Vercel's response limit; larger images are served by redirect.

/**
 * Relay a venue's saved photo through our own domain. Venue sites often block hotlinking
 * or serve plain http, which browsers refuse on an https page. Cached at the edge for a day.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ venue: string }> }) {
  const { venue } = await ctx.params;
  if (!checkVenue(venue) || !dbConfigured()) return new Response('Not found', { status: 404 });
  const stored = await getCoverUrl(venue).catch(() => null);
  const url = stored ? safeImageUrl(stored) : null;
  if (!url) return new Response('Not found', { status: 404 });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*' }, redirect: 'follow', signal: ctrl.signal });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.startsWith('image/')) return new Response('Not found', { status: 404 });
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) {
      await res.body?.cancel().catch(() => {});
      return Response.redirect(url.toString().replace(/^http:/, 'https:'), 302);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return Response.redirect(url.toString().replace(/^http:/, 'https:'), 302);
    return new Response(buf, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  } finally {
    clearTimeout(t);
  }
}
