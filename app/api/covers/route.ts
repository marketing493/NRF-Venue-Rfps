import { venues } from '@/lib/data';
import { claimJob, dbConfigured, getState, logActivity, patchMeta } from '@/lib/db';
import { findCover, photoPages } from '@/lib/covers';
import { actorOf, fail, json, readBody } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Fetch each venue's photo from its own site (or a known listing) and save the URL in Neon,
 * so every viewer sees the same covers.
 *   {}                 venues without a cover (the Photos button)
 *   {"auto": true}     same, but at most once every 6 hours across all instances (runs on page load)
 *   {"force": true}    re-fetch every venue
 *   {"venue": "<id>"}  one venue
 */
export async function POST(req: Request) {
  if (!dbConfigured()) return fail('Database not configured', 503);
  const body = await readBody(req);
  const force = Boolean(body.force);
  const only = typeof body.venue === 'string' ? body.venue : null;
  const state = await getState();
  const have = new Map(state.meta.map(m => [m.venue_id, m.cover_url]));
  const todo = venues.filter(v => photoPages(v).length && (only ? v.id === only : force || !have.get(v.id)));
  if (!todo.length) return json({ found: {}, missed: [], checked: 0 });
  if (body.auto && !(await claimJob('covers-auto', 360))) return json({ found: {}, missed: [], checked: 0, skipped: true });

  const started = Date.now();
  const found: Record<string, string> = {};
  const missed: string[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < todo.length && Date.now() - started < 48_000) {
      const v = todo[i++];
      const img = await findCover(v);
      if (img) {
        found[v.id] = img;
        await patchMeta(v.id, { cover_url: img });
      } else missed.push(v.id);
    }
  }));
  const unchecked = todo.slice(i).map(v => v.id);
  const n = Object.keys(found).length;
  if (n) await logActivity('*', null, 'photos', `Found ${n} venue photo${n === 1 ? '' : 's'}`, actorOf(req) ?? (body.auto ? 'Automatic' : null)).catch(console.error);
  return json({ found, missed, unchecked, checked: todo.length - unchecked.length });
}
