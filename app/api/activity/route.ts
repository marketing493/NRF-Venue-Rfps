import { dbConfigured, getActivity } from '@/lib/db';
import { fail, json } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!dbConfigured()) return json({ items: [] });
  try {
    return json({ items: await getActivity(80) });
  } catch (e) {
    console.error(e);
    return fail('Could not load activity', 502);
  }
}
