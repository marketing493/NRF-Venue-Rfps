import { resetOutreach } from '@/lib/db';
import { actorOf, fail, json, noDb, readBody } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const blocked = noDb();
  if (blocked) return blocked;
  const body = await readBody(req);
  if (body.confirm !== 'RESET') return fail('Send {"confirm":"RESET"} to clear outreach');
  try {
    const reset_at = await resetOutreach(Boolean(body.include_shortlist), actorOf(req));
    return json({ ok: true, reset_at });
  } catch (e) {
    console.error(e);
    return fail('Could not reset', 502);
  }
}
