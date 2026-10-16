import { dbConfigured, getState } from '@/lib/db';
import { fail, json } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!dbConfigured()) return json({ db: false, reset_at: null, outreach: [], meta: [] });
  try {
    return json(await getState());
  } catch (e) {
    console.error(e);
    return fail('Could not reach the database', 502);
  }
}
