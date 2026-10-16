import { brief, venues } from '@/lib/data';
import { dbConfigured, getState } from '@/lib/db';
import { computeFit, VERDICT_LABEL } from '@/lib/fit';
import type { AppState } from '@/lib/types';

export const dynamic = 'force-dynamic';

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const format = new URL(req.url).searchParams.get('format') || 'json';
  const state: AppState = dbConfigured() ? await getState() : { db: false, reset_at: null, outreach: [], meta: [] };
  const rec = new Map(state.outreach.map(o => [`${o.venue_id}/${o.night}`, o]));
  const meta = new Map(state.meta.map(m => [m.venue_id, m]));
  const stamp = new Date().toISOString().slice(0, 10);

  const rows = venues.flatMap(v => v.nights.map(n => {
    const night = brief.nights[n];
    const fit = computeFit(v, night);
    const o = rec.get(`${v.id}/${n}`);
    const m = meta.get(v.id);
    return {
      venue: v.name, area: v.area, night: night.label, travel: `${v.travel.minutes} min ${v.travel.mode}`,
      email: m?.email_override || v.contact.email || 'Contact form',
      michelin_stars: v.awards.michelin_stars || '', james_beard: v.awards.james_beard ? 'Yes' : '',
      fit: VERDICT_LABEL[fit.verdict], fit_room: fit.room ?? '', fit_capacity: fit.capacity ?? '', fit_basis: fit.basis,
      shortlisted: m?.starred ? 'Yes' : '', status: o?.status ?? 'not_contacted', sent_at: o?.sent_at ?? '',
      fb_minimum: o?.fb_minimum ?? '', all_in: o?.all_in ?? '',
      per_head: o?.all_in ? Math.round(o.all_in / night.target_max) : '',
      fees: o?.fees ?? '', notes: o?.notes ?? '', updated_by: o?.updated_by ?? '', updated_at: o?.updated_at ?? '',
    };
  }));

  if (format === 'csv') {
    const head = Object.keys(rows[0]);
    const csv = [head.join(','), ...rows.map(r => head.map(h => csvCell((r as Record<string, unknown>)[h])).join(','))].join('\n');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="nrf-venue-tracker-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  return new Response(JSON.stringify({ exported_at: new Date().toISOString(), brief, state, rows }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="nrf-venue-tracker-${stamp}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
