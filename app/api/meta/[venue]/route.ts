import { logActivity, patchMeta } from '@/lib/db';
import { actorOf, checkVenue, fail, json, noDb, parseMetaPatch, readBody } from '@/lib/server';
import type { MetaPatch } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ venue: string }> }) {
  const blocked = noDb();
  if (blocked) return blocked;
  const { venue } = await ctx.params;
  const v = checkVenue(venue);
  if (!v) return fail('Unknown venue', 404);
  let patch: MetaPatch;
  try {
    patch = parseMetaPatch(await readBody(req));
  } catch (e) {
    return fail((e as Error).message);
  }
  const actor = actorOf(req);
  try {
    const meta = await patchMeta(v.id, patch);
    if ('starred' in patch) await logActivity(v.id, null, 'star', patch.starred ? 'Added to shortlist' : 'Removed from shortlist', actor).catch(console.error);
    if ('email_override' in patch) await logActivity(v.id, null, 'email', patch.email_override ? `Events email set to ${patch.email_override}` : 'Events email override cleared', actor).catch(console.error);
    return json(meta);
  } catch (e) {
    console.error(e);
    return fail('Could not save to the database', 502);
  }
}
