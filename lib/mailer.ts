import { computeFit } from './fit.ts';
import type { Brief, Night, Venue } from './types.ts';

export interface Draft {
  to: string;
  subject: string;
  body: string;
  space: string;
  gmailUrl: string;
}

/** The space line names the room the fit calculation judged, so the venue knows what we are asking about. */
export function spaceFor(venue: Venue, night: Night): string {
  const fit = computeFit(venue, night);
  if (!fit.room) return 'Your private dining options';
  if (fit.room === 'Full restaurant buyout') return 'Full restaurant buyout';
  const room = venue.rooms.find(r => r.name === fit.room);
  return room?.exclusive ? `${fit.room} (full buyout)` : fit.room;
}

/** Wording supplied verbatim by the sender. Only the braces change per venue and per night. */
export function rfpBody(venueName: string, night: Night, space: string, signer: string, company: string): string {
  return `Hello ${venueName} events team,

I'm writing from ${company} about a private event we're planning in New York:

* Event: ${night.format}
* Date: ${night.date_label}
* Guests: ${night.headcount_label}
* Timing: ${night.window}
* Space: ${space}
* Group: ${night.group}

Could you please get back to me on the following?

1. Availability on the date and times above
2. Which room you'd put us in, whether it's fully private, and what else would be running alongside it
3. Confirmation that the space ${night.verb} this many guests comfortably in this format, not at capacity
4. The food & beverage minimum for that space on that date
5. Food and drink formats you'd recommend at this headcount
6. Beverage packages, including a substantial non-alcoholic selection
7. Dietary accommodation — expect vegetarian, vegan, halal, and gluten-free guests
8. All other charges — room/facility fee, service charge, administrative fee, tax,
   staffing, coat check, AV, overtime — so we can compare venues on a genuine all-in figure
9. Deposit schedule, payment terms, and cancellation policy

If that date is already committed, I'd still welcome the minimum and fee structure —
we have some flexibility. A PDF pack or a call both work, whichever is easier for you.

Best regards,
${signer}
${company}`;
}

export function rfpSubject(night: Night, company: string): string {
  return `Private event enquiry — ${night.date_label} · ${night.headcount_label} guests · ${company}`;
}

export function gmailComposeUrl(to: string, subject: string, body: string, authuser: string): string {
  const q = new URLSearchParams({ view: 'cm', fs: '1', to, su: subject, body, authuser });
  // URLSearchParams encodes spaces as "+", which Gmail renders literally in the body. Use %20.
  return `https://mail.google.com/mail/?${q.toString().replace(/\+/g, '%20')}`;
}

export function buildDraft(venue: Venue, night: Night, brief: Brief, emailOverride?: string | null): Draft {
  const to = (emailOverride || venue.contact.email || '').trim();
  const space = spaceFor(venue, night);
  const subject = rfpSubject(night, brief.sender.company);
  const body = rfpBody(venue.name, night, space, brief.sender.name, brief.sender.company);
  return { to, subject, body, space, gmailUrl: gmailComposeUrl(to, subject, body, brief.sender.email) };
}
