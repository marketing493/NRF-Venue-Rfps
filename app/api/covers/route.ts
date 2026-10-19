import { venues } from '@/lib/data';
import { claimJob, dbConfigured, getPhotoSources, getState, logActivity, patchMeta, savePhoto } from '@/lib/db';
import { downloadImage, findCover, photoPages, safeImageUrl } from '@/lib/covers';
import { actorOf, fail, json, readBody } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Find venue photos and keep them. Every photo found, and every cover link already on the
 * board, is downloaded into Neon so it stays even if the venue's site changes.
 *   {}                 venues without a cover, then save copies of every cover (the Photos button)
 *   {"auto": true}     same, at most once every 6 hours across all instances (runs on page load)
 *   {"force": true}    re-find every venue's photo from its site
 *   {"venue": "<id>"}  one venue
 */
export async function POST(req: Request) {
  if (!dbConfigured()) return fail('Database not configured', 503);
  const body = await readBody(req);
  const force = Boolean(body.force);
  const only = typeof body.venue === 'string' ? body.venue : null;
  if (body.auto && !(await claimJob('covers-auto', 360))) return json({ found: {}, missed: [], saved: 0, checked: 0, skipped: true });

  const started = Date.now();
  const inTime = () => Date.now() - started < 48_000;
  const state = await getState();
  const cover = new Map(state.meta.map(m => [m.venue_id, m.cover_url]));
  const scope = venues.filter(v => !only || v.id === only);

  // 1. Find photos for venues that have none (or all of them, when forced).
  const todo = scope.filter(v => photoPages(v).length && (only || force || !cover.get(v.id)));
  const found: Record<string, string> = {};
  const missed: string[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < todo.length && inTime()) {
      const v = todo[i++];
      const img = await findCover(v);
      if (img) {
        found[v.id] = img;
        cover.set(v.id, img);
        await patchMeta(v.id, { cover_url: img });
      } else missed.push(v.id);
    }
  }));
  const unchecked = todo.slice(i).map(v => v.id);

  // 2. Keep a copy of every cover that is not saved yet, including links people pasted by hand.
  const saved = await getPhotoSources();
  const toKeep = scope.filter(v => {
    const url = cover.get(v.id);
    return url && safeImageUrl(url) && saved.get(v.id) !== url;
  });
  let kept = 0;
  let k = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (k < toKeep.length && inTime()) {
      const v = toKeep[k++];
      const url = cover.get(v.id)!;
      const img = await downloadImage(url);
      if (img) {
        await savePhoto(v.id, img.type, img.bytes, url);
        kept++;
      }
    }
  }));

  const n = Object.keys(found).length;
  const actor = actorOf(req) ?? (body.auto ? 'Automatic' : null);
  if (n || kept) {
    const parts = [n ? `found ${n} new photo${n === 1 ? '' : 's'}` : '', kept ? `saved ${kept} to the database` : ''].filter(Boolean).join(', ');
    await logActivity('*', null, 'photos', parts[0].toUpperCase() + parts.slice(1), actor).catch(console.error);
  }
  return json({ found, missed, unchecked, saved: kept, checked: todo.length - unchecked.length });
}
