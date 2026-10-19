import { downloadImage, safeImageUrl } from '@/lib/covers';
import { dbConfigured, getCoverUrl, getPhoto, savePhoto } from '@/lib/db';
import { checkVenue } from '@/lib/server';

export const dynamic = 'force-dynamic';

const KEEP = { 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' };

const serve = (type: string, data: Uint8Array) =>
  new Response(Buffer.from(data), { headers: { 'Content-Type': type, ...KEEP } });

/**
 * A venue's photo, served from our own copy in Neon. If the saved copy is missing or was
 * taken from a different link than the current cover, fetch the cover once and keep it.
 * When the venue's site later breaks, the saved copy still serves.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ venue: string }> }) {
  const { venue } = await ctx.params;
  if (!checkVenue(venue) || !dbConfigured()) return new Response('Not found', { status: 404 });
  const [cover, stored] = await Promise.all([getCoverUrl(venue).catch(() => null), getPhoto(venue).catch(() => null)]);
  if (stored && (!cover || stored.source_url === cover)) return serve(stored.content_type, stored.data);

  if (cover && safeImageUrl(cover)) {
    const img = await downloadImage(cover);
    if (img) {
      await savePhoto(venue, img.type, img.bytes, cover).catch(console.error);
      return serve(img.type, img.bytes);
    }
  }
  // The new link failed: keep showing the photo we already had rather than nothing.
  if (stored) return serve(stored.content_type, stored.data);
  if (cover && safeImageUrl(cover)) return Response.redirect(cover.replace(/^http:/, 'https:'), 302);
  return new Response('Not found', { status: 404 });
}
