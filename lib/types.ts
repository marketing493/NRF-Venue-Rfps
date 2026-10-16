export type NightKey = 'sat' | 'sun';

export interface Night {
  key: NightKey;
  label: string;
  date: string;
  date_label: string;
  window: string;
  headcount_label: string;
  target_min: number;
  target_max: number;
  measure: 'seated' | 'standing';
  format: string;
  group: string;
  verb: string;
  summary: string;
  steer?: string;
}

export interface Brief {
  event: { name: string; dates: string; anchor: string; anchor_address: string };
  nights: Record<NightKey, Night>;
  sender: { name: string; email: string; company: string };
}

export interface Room {
  name: string;
  seated: number | null;
  standing: number | null;
  approximate: boolean;
  /** Only one figure was published and its format (seated or standing) was not stated. */
  single_figure: boolean;
  /** The room is the whole restaurant, so booking it is a buyout. */
  exclusive: boolean;
  /** The figure came from the venue itself, so it supersedes research. */
  confirmed?: boolean;
}

export interface Buyout {
  seated: number | null;
  standing: number | null;
  approximate: boolean;
  single_figure: boolean;
  confirmed?: boolean;
}

export interface Venue {
  id: string;
  name: string;
  area: string;
  travel: { minutes: number; mode: 'walk' | 'car' };
  order: number;
  contact: { method: 'email' | 'form'; email: string | null };
  website: string | null;
  awards: { michelin_stars: number; james_beard: boolean };
  nights: NightKey[];
  rooms: Room[];
  buyout: Buyout;
  highlight: string | null;
  /** Why the venue is on the list, in one or two sentences. */
  specialty: string | null;
  notes: string[];
  capacity_source: string;
  verified_on: string;
  /** Other public pages that carry the venue's photo, tried after the website. */
  photo_pages?: string[];
  /** Set when the venue has shut. Closed venues stay in the data file for the record but leave the board. */
  closed?: { on: string; source: string };
}

export type Verdict = 'good' | 'tight' | 'buyout' | 'just_under' | 'too_small' | 'unknown' | 'not_offered';

export interface Fit {
  verdict: Verdict;
  room: string | null;
  capacity: number | null;
  basis: string;
  approximate: boolean;
  oversized: boolean;
  explanation: string;
}

export const STATUSES = ['not_contacted', 'sent', 'replied', 'quoted', 'declined', 'booked'] as const;
export type Status = (typeof STATUSES)[number];

export interface OutreachRecord {
  venue_id: string;
  night: NightKey;
  status: Status;
  fb_minimum: number | null;
  all_in: number | null;
  fees: string | null;
  notes: string | null;
  sent_at: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface VenueMeta {
  venue_id: string;
  starred: boolean;
  cover_url: string | null;
  email_override: string | null;
  updated_at: string;
}

export interface ActivityItem {
  id: number;
  venue_id: string;
  night: NightKey | null;
  action: string;
  detail: string | null;
  actor: string | null;
  at: string;
}

export interface AppState {
  db: boolean;
  reset_at: string | null;
  outreach: OutreachRecord[];
  meta: VenueMeta[];
}

export interface SeedRecord {
  venue_id: string;
  night: NightKey;
  status: Status;
  fb_minimum?: number;
  all_in?: number;
  fees?: string;
  notes?: string;
}

export interface OutreachSeed {
  id: string;
  source: string;
  records: SeedRecord[];
}

export type OutreachPatch = Partial<Pick<OutreachRecord, 'status' | 'fb_minimum' | 'all_in' | 'fees' | 'notes' | 'sent_at'>>;
export type MetaPatch = Partial<Pick<VenueMeta, 'starred' | 'cover_url' | 'email_override'>>;
