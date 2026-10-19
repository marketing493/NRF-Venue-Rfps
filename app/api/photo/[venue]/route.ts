import { MAX_PHOTO_BYTES } from '@/lib/covers';
import { logActivity, patchMeta, savePhoto } from '@/lib/db';
import { actorOf, checkVenue, fail, json, noDb } from '@/lib/server';

export const dynamic = 'force-dynamic';

const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);

/** Upload a photo from your own computer. The browser shrinks it first; the bytes are kept in Neon. */
export async function POST(req: Request, ctx: { params: Promise<{ venue: string }> }) {
  const blocked = noDb();
  if (blocked) return blocked;
  const { venue } = await ctx.params;
  const v = checkVenue(venue);
  if (!v) return fail('Unknown venue', 404);
  const type = (req.headers.get('content-type') || '').split(';')[0].trim();
  if (!TYPES.has(type)) return fail('Upload a JPEG, PNG, WebP, AVIF or GIF image');
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.byteLength) return fail('The file was empty');
  if (bytes.byteLength > MAX_PHOTO_BYTES) return fail('That image is too large. Keep it under 3.5 MB.');
  const marker = `upload:${new Date().toISOString()}`;
  try {
    await savePhoto(v.id, type, bytes, marker);
    const meta = await patchMeta(v.id, { cover_url: marker });
    await logActivity(v.id, null, 'photo', 'Photo uploaded', actorOf(req)).catch(console.error);
    return json(meta);
  } catch (e) {
    console.error(e);
    return fail('Could not save the photo', 502);
  }
}
