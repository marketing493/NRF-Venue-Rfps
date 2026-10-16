import briefJson from '@/data/brief.json';
import venuesJson from '@/data/venues.json';
import type { Brief, NightKey, Venue } from './types';

export const brief = briefJson as Brief;
export const venues = (venuesJson as { venues: Venue[] }).venues;
export const venueById = new Map(venues.map(v => [v.id, v]));
export const NIGHT_KEYS: NightKey[] = ['sat', 'sun'];
