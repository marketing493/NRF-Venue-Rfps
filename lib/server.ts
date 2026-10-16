import { NextResponse } from 'next/server';
import { dbConfigured } from './db';
import { NIGHT_KEYS, venueById } from './data';
import { STATUSES, type MetaPatch, type NightKey, type OutreachPatch } from './types';

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export const fail = (message: string, status = 400) => json({ error: message }, status);

export function noDb() {
  return dbConfigured() ? null : fail('Database not configured. Set DATABASE_URL to enable shared tracking.', 503);
}

export function actorOf(req: Request): string | null {
  const raw = req.headers.get('x-actor');
  if (!raw) return null;
  const name = decodeURIComponent(raw).trim().slice(0, 60);
  return name || null;
}

export function checkVenue(id: string) {
  return venueById.get(id) ?? null;
}

export function checkNight(n: string): NightKey | null {
  return (NIGHT_KEYS as string[]).includes(n) ? (n as NightKey) : null;
}

const money = (v: unknown) => {
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new Error('Amounts must be a positive number');
  return Math.round(n * 100) / 100;
};
const text = (v: unknown, max: number) => (v === null || v === undefined ? null : String(v).slice(0, max));

export function parseOutreachPatch(body: Record<string, unknown>): OutreachPatch {
  const out: OutreachPatch = {};
  if ('status' in body) {
    if (!(STATUSES as readonly string[]).includes(String(body.status))) throw new Error('Unknown status');
    out.status = body.status as OutreachPatch['status'];
  }
  if ('fb_minimum' in body) out.fb_minimum = money(body.fb_minimum);
  if ('all_in' in body) out.all_in = money(body.all_in);
  if ('fees' in body) out.fees = text(body.fees, 2000);
  if ('notes' in body) out.notes = text(body.notes, 5000);
  if ('sent_at' in body) {
    if (body.sent_at === null) out.sent_at = null;
    else {
      const d = new Date(String(body.sent_at));
      if (Number.isNaN(d.getTime())) throw new Error('Invalid sent_at');
      out.sent_at = d.toISOString();
    }
  }
  if (!Object.keys(out).length) throw new Error('Nothing to update');
  return out;
}

export function parseMetaPatch(body: Record<string, unknown>): MetaPatch {
  const out: MetaPatch = {};
  if ('starred' in body) out.starred = Boolean(body.starred);
  if ('cover_url' in body) {
    const v = body.cover_url ? String(body.cover_url).trim() : null;
    if (v && !/^https?:\/\//i.test(v)) throw new Error('Cover must be an http(s) URL');
    out.cover_url = v ? v.slice(0, 1000) : null;
  }
  if ('email_override' in body) {
    const v = body.email_override ? String(body.email_override).trim() : null;
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('That is not a valid email address');
    out.email_override = v;
  }
  if (!Object.keys(out).length) throw new Error('Nothing to update');
  return out;
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? b : {};
  } catch {
    return {};
  }
}
