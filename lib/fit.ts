import type { Fit, Night, Room, Venue, Verdict } from './types.ts';

export const VERDICT_RANK: Record<Verdict, number> = {
  good: 0, tight: 1, buyout: 2, just_under: 3, too_small: 4, unknown: 5, not_offered: 6,
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  good: 'Good fit',
  tight: 'Tight fit',
  buyout: 'Buyout only',
  just_under: 'Just under',
  too_small: 'Too small',
  unknown: 'Unknown',
  not_offered: 'Not offered',
};

interface Reading { value: number; basis: string; approximate: boolean }

/** The capacity of a room for the night's measure, plus how that number was reached. */
export function readCapacity(
  r: Pick<Room, 'seated' | 'standing' | 'approximate' | 'single_figure'>,
  measure: Night['measure'],
): Reading | null {
  const approx = r.approximate;
  const pre = approx ? 'approximate ' : '';
  if (measure === 'standing') {
    if (r.standing != null && !r.single_figure) return { value: r.standing, basis: `${pre}published standing figure`, approximate: approx };
    if (r.standing != null) return { value: r.standing, basis: `${pre}single published figure`, approximate: approx };
    if (r.seated != null && r.single_figure) {
      // A room that seats N holds at least N standing, so the seated figure is a safe floor.
      return { value: r.seated, basis: `inferred from a ${pre}single published figure (standing is usually higher)`, approximate: approx };
    }
    return null;
  }
  if (r.seated != null && !r.single_figure) return { value: r.seated, basis: `${pre}published seated figure`, approximate: approx };
  if (r.seated != null) return { value: r.seated, basis: `${pre}single published figure, format not stated`, approximate: approx };
  return null; // A standing-only figure says nothing reliable about seating.
}

export function scoreCapacity(cap: number, night: Pick<Night, 'target_min' | 'target_max'>): Verdict {
  const { target_min: min, target_max: max } = night;
  const slack = Math.max(3, Math.ceil(min * 0.1));
  if (cap >= max) return 'good';
  if (cap >= min) return 'tight';
  if (cap >= min - slack) return 'just_under';
  return 'too_small';
}

/**
 * Score every room and keep the best match. Exclusive rooms and buyout figures
 * resolve to "buyout" rather than "good": reaching the headcount by taking the
 * whole restaurant is a different proposition and a different price.
 */
export function computeFit(venue: Venue, night: Night): Fit {
  const noun = night.measure === 'seated' ? 'seated' : 'standing';
  const target = `${night.target_min} to ${night.target_max} ${noun}`;
  if (!venue.nights.includes(night.key)) {
    return { verdict: 'not_offered', room: null, capacity: null, basis: '', approximate: false, oversized: false,
      explanation: `Not offered for ${night.label}.` };
  }

  type Cand = { verdict: Verdict; room: string; reading: Reading };
  const cands: Cand[] = [];
  for (const room of venue.rooms) {
    const reading = readCapacity(room, night.measure);
    if (!reading) continue;
    let verdict = scoreCapacity(reading.value, night);
    if (room.exclusive && (verdict === 'good' || verdict === 'tight')) verdict = 'buyout';
    cands.push({ verdict, room: room.name, reading });
  }
  const privateFits = cands.some(c => c.verdict === 'good' || c.verdict === 'tight');
  if (!privateFits) {
    const reading = readCapacity(venue.buyout, night.measure);
    if (reading && scoreCapacity(reading.value, night) !== 'too_small' && scoreCapacity(reading.value, night) !== 'just_under') {
      cands.push({ verdict: 'buyout', room: 'Full restaurant buyout', reading });
    }
  }
  if (!cands.length) {
    return { verdict: 'unknown', room: null, capacity: null, basis: '', approximate: false, oversized: false,
      explanation: `No ${noun} figure published for any room. Ask in the RFP.` };
  }
  cands.sort((a, b) => {
    const r = VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict];
    if (r) return r;
    // Among rooms that fit, the closest fit wins. Among rooms that fall short, the largest wins.
    return a.verdict === 'good' || a.verdict === 'tight' || a.verdict === 'buyout'
      ? a.reading.value - b.reading.value
      : b.reading.value - a.reading.value;
  });
  const best = cands[0];
  const oversized = best.reading.value > night.target_max * 2.5;
  const cap = `${best.reading.approximate ? '~' : ''}${best.reading.value}`;
  const lead: Record<Verdict, string> = {
    good: 'Covers the full headcount',
    tight: 'Fits the low end, not the top',
    buyout: 'Reaches the headcount only by taking the whole restaurant',
    just_under: 'A few short of the minimum',
    too_small: 'Below the minimum',
    unknown: '', not_offered: '',
  };
  return {
    verdict: best.verdict,
    room: best.room,
    capacity: best.reading.value,
    basis: best.reading.basis,
    approximate: best.reading.approximate,
    oversized,
    explanation: `${lead[best.verdict]}. Judged on ${best.room}: ${cap} (${best.reading.basis}) against ${target}.` +
      (oversized ? ' The room is much larger than the party, so ask how they would scale it.' : ''),
  };
}

export function bestVerdict(venue: Venue, nights: Night[]): Verdict {
  return nights.map(n => computeFit(venue, n).verdict).sort((a, b) => VERDICT_RANK[a] - VERDICT_RANK[b])[0];
}

export function formatRoom(r: Room): string {
  const t = (v: number | null) => (v == null ? '' : `${r.approximate ? '~' : ''}${v}`);
  if (r.single_figure) return r.seated == null ? `${t(r.standing)} standing` : t(r.seated);
  return `${t(r.seated)}·${t(r.standing)}`;
}
