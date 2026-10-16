import { logActivity, patchOutreach } from '@/lib/db';
import { actorOf, checkNight, checkVenue, fail, json, noDb, parseOutreachPatch, readBody } from '@/lib/server';
import type { OutreachPatch } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STATUS_WORD: Record<string, string> = {
  not_contacted: 'Marked not contacted', sent: 'RFP sent', replied: 'Venue replied',
  quoted: 'Quote received', declined: 'Venue unavailable', booked: 'Booked',
};

function describe(p: OutreachPatch): { action: string; detail: string | null } | null {
  if (p.status) return { action: 'status', detail: STATUS_WORD[p.status] };
  if ('all_in' in p) return { action: 'quote', detail: p.all_in == null ? 'All-in estimate cleared' : `All-in estimate $${p.all_in.toLocaleString('en-US')}` };
  if ('fb_minimum' in p) return { action: 'quote', detail: p.fb_minimum == null ? 'F&B minimum cleared' : `F&B minimum $${p.fb_minimum.toLocaleString('en-US')}` };
  return null; // Notes and fee text autosave constantly; keep them out of the feed.
}

export async function POST(req: Request, ctx: { params: Promise<{ venue: string; night: string }> }) {
  const blocked = noDb();
  if (blocked) return blocked;
  const { venue, night } = await ctx.params;
  const v = checkVenue(venue);
  const n = checkNight(night);
  if (!v || !n) return fail('Unknown venue or night', 404);
  let patch: OutreachPatch;
  try {
    patch = parseOutreachPatch(await readBody(req));
  } catch (e) {
    return fail((e as Error).message);
  }
  const actor = actorOf(req);
  try {
    const record = await patchOutreach(v.id, n, patch, actor);
    const d = describe(patch);
    if (d) await logActivity(v.id, n, d.action, d.detail, actor).catch(console.error);
    return json(record);
  } catch (e) {
    console.error(e);
    return fail('Could not save to the database', 502);
  }
}
