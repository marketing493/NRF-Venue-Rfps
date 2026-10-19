import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { computeFit } from '../lib/fit.ts';
import { buildDraft, rfpBody } from '../lib/mailer.ts';
import type { Brief, Venue } from '../lib/types.ts';

const brief: Brief = JSON.parse(readFileSync(new URL('../data/brief.json', import.meta.url), 'utf8'));
const venues: Venue[] = JSON.parse(readFileSync(new URL('../data/venues.json', import.meta.url), 'utf8')).venues;
const v = (id: string) => venues.find(x => x.id === id)!;
const { sat, sun } = brief.nights;

test('dataset has 44 venues ordered by distance with unique ids', () => {
  assert.equal(venues.length, 44);
  assert.equal(new Set(venues.map(x => x.id)).size, 44);
  for (let i = 1; i < venues.length; i++) {
    const a = venues[i - 1].travel, b = venues[i].travel;
    assert.ok(a.mode === b.mode ? a.minutes <= b.minutes : a.mode === 'walk', `${venues[i].id} is out of distance order`);
  }
  assert.deepEqual(venues.map(x => x.order), venues.map((_, i) => i + 1));
});

test('Hudson VU is judged on the Sunroom, not the 250 rooftop', () => {
  const f = computeFit(v('hudson-vu'), sun);
  assert.equal(f.room, 'Sunroom');
  assert.equal(f.verdict, 'good');
});

test('Marea private rooms do not cover a 40 to 60 reception; the buyout does', () => {
  const f = computeFit(v('marea'), sat);
  assert.equal(f.verdict, 'buyout');
  assert.equal(f.room, 'Full restaurant buyout');
});

test('An exclusive room resolves to buyout, not good', () => {
  assert.equal(computeFit(v('hav-mar'), sat).verdict, 'buyout');
  assert.equal(computeFit(v('markette'), sun).verdict, 'buyout');
});

test('Semma and Eleven Madison Park read as just under, not too small', () => {
  assert.equal(computeFit(v('semma'), sun).verdict, 'just_under');
  assert.equal(computeFit(v('eleven-madison-park'), sun).verdict, 'just_under');
});

test('Greywind is Saturday only', () => {
  assert.equal(computeFit(v('greywind'), sun).verdict, 'not_offered');
  assert.equal(computeFit(v('greywind'), sat).verdict, 'good');
});

test('Jungsik reaches Sunday only on a buyout', () => {
  const f = computeFit(v('jungsik'), sun);
  assert.equal(f.verdict, 'buyout');
});

test('Standing fit uses the standing figure', () => {
  const f = computeFit(v('ci-siamo'), sat);
  assert.equal(f.capacity, 75);
  assert.match(f.basis, /standing/);
});

test('A capacity confirmed by the venue overrides research', () => {
  const f = computeFit(v('gramercy-tavern'), sun);
  assert.equal(f.verdict, 'too_small');
  assert.equal(f.capacity, 20);
  assert.match(f.basis, /confirmed by the venue/);
});

test("L'Artusi reaches Sunday on its confirmed 55-guest buyout", () => {
  assert.equal(computeFit(v('lartusi'), sun).verdict, 'buyout');
});

test('Venues with no capacity on file read as unknown, not as a fit', () => {
  for (const id of ['union-square-cafe', 'daniel', 'zaytinya']) assert.equal(computeFit(v(id), sun).verdict, 'unknown');
});

test('Every seed record names a real venue on a night it is offered', () => {
  const file = JSON.parse(readFileSync(new URL('../data/outreach-seed.json', import.meta.url), 'utf8'));
  assert.deepEqual(file.seeds.map((s: { records: unknown[] }) => s.records.length), [13, 3, 1]);
  assert.equal(new Set(file.seeds.map((s: { id: string }) => s.id)).size, file.seeds.length);
  for (const r of file.seeds.flatMap((s: { records: { venue_id: string; night: 'sat' | 'sun'; status?: string }[] }) => s.records)) {
    assert.ok(v(r.venue_id), `unknown venue ${r.venue_id}`);
    assert.ok(v(r.venue_id).nights.includes(r.night), `${r.venue_id} not offered on ${r.night}`);
    if (r.status) assert.ok(['not_contacted', 'sent', 'replied', 'quoted', 'declined', 'booked'].includes(r.status));
  }
});

test('Bazaar Meat fits Sunday on the Tapas section the venue offered', () => {
  const f = computeFit(v('bazaar-meat'), sun);
  assert.equal(f.verdict, 'good');
  assert.equal(f.room, 'Tapas section, Main Dining Room');
  assert.match(f.basis, /confirmed by the venue/);
});

const expectedSunday = `Hello Amali events team,

I'm writing from Impact Analytics about a private event we're planning in New York:

* Event: Seated dinner in a private space, opening with cocktails
* Date: Sunday, 10 January 2027
* Guests: 30–35
* Timing: Cocktails 6:00–6:30, dinner 6:30–9:00
* Space: Skylight Room
* Group: Senior Executives

Could you please get back to me on the following?

1. Availability on the date and times above
2. Which room you'd put us in, whether it's fully private, and what else would be running alongside it
3. Confirmation that the space seats this many guests comfortably in this format, not at capacity
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
Garvit Sindhwani
Impact Analytics`;

test('Sunday RFP body matches the supplied wording byte for byte', () => {
  const d = buildDraft(v('amali'), sun, brief);
  assert.equal(d.space, 'Skylight Room');
  assert.equal(d.body, expectedSunday);
});

test('Saturday swaps only "holds" and the group line', () => {
  const satBody = rfpBody('Amali', sat, 'Fireplace Room', 'Garvit Sindhwani', 'Impact Analytics');
  assert.match(satBody, /the space holds this many guests/);
  assert.match(satBody, /\* Group: International colleagues and partners/);
});

test('Gmail URL is a compose link from the right account with no "+" for spaces', () => {
  const d = buildDraft(v('greywind'), sat, brief);
  const u = new URL(d.gmailUrl);
  assert.equal(u.hostname, 'mail.google.com');
  assert.equal(u.searchParams.get('view'), 'cm');
  assert.equal(u.searchParams.get('to'), 'hello@greywindnyc.com');
  assert.equal(u.searchParams.get('authuser'), 'garvit.sindhwani@impactanalytics.co');
  assert.equal(u.searchParams.get('su'), 'Private event enquiry — Saturday, 9 January 2027 · 40–60 guests · Impact Analytics');
  assert.equal(u.searchParams.get('body'), d.body);
  assert.ok(!d.gmailUrl.includes('+'));
});
