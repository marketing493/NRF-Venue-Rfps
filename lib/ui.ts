import type { OutreachRecord, Status, Venue } from './types';

export const STATUS_LABEL: Record<Status, string> = {
  not_contacted: 'Not contacted',
  sent: 'RFP sent',
  replied: 'Replied',
  quoted: 'Quote in',
  declined: 'Declined',
  booked: 'Booked',
};

export const FOLLOW_UP_DAYS = 4;

export function followUpDue(r: OutreachRecord | undefined, now = Date.now()): boolean {
  if (!r || r.status !== 'sent' || !r.sent_at) return false;
  return now - new Date(r.sent_at).getTime() > FOLLOW_UP_DAYS * 86_400_000;
}

/** Statuses that mean the RFP went out. Counting is cumulative so the funnel never shrinks as replies arrive. */
export const wasSent = (s: Status | undefined) => !!s && s !== 'not_contacted';
export const gotReply = (s: Status | undefined) => s === 'replied' || s === 'quoted' || s === 'declined' || s === 'booked';
export const gotQuote = (s: Status | undefined) => s === 'quoted' || s === 'booked';

export const money = (n: number | null | undefined) =>
  n == null ? '' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function shortDate(iso: string | null | undefined) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function relTime(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return shortDate(iso);
}

export function initials(name: string) {
  const words = name.replace(/&/g, ' ').split(/\s+/).filter(w => /^[A-Za-z]/.test(w) && !/^(the|and|of)$/i.test(w));
  return (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '');
}

export function tone(v: Venue) {
  return String((v.order % 3) + 1);
}

export function searchUrl(v: Venue) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${v.name} New York private events`)}`;
}

export function travelLabel(v: Venue) {
  return `${v.travel.minutes} min ${v.travel.mode === 'walk' ? 'walk' : 'by car'}`;
}
