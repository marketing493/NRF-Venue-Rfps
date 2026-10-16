import { brief } from '@/lib/data';
import { buildDraft } from '@/lib/mailer';
import { checkNight, checkVenue, fail, json } from '@/lib/server';

export async function GET(req: Request, ctx: { params: Promise<{ venue: string; night: string }> }) {
  const { venue, night } = await ctx.params;
  const v = checkVenue(venue);
  const n = checkNight(night);
  if (!v || !n) return fail('Unknown venue or night', 404);
  const to = new URL(req.url).searchParams.get('to');
  return json(buildDraft(v, brief.nights[n], brief, to));
}
