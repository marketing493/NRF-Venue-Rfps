import briefJson from '@/data/brief.json';
import venuesJson from '@/data/venues.json';
import type { Brief, NightKey, Venue } from './types';

export const brief = briefJson as Brief;
const allVenues = (venuesJson as { venues: Venue[] }).venues;
export const closedVenues = allVenues.filter(v => v.closed);
export const venues = allVenues.filter(v => !v.closed);
export const venueById = new Map(venues.map(v => [v.id, v]));
export const NIGHT_KEYS: NightKey[] = ['sat', 'sun'];
