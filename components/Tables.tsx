'use client';

import { computeFit, VERDICT_LABEL } from '@/lib/fit';
import { buildDraft } from '@/lib/mailer';
import type { Brief, NightKey, OutreachRecord, Status, Venue, VenueMeta } from '@/lib/types';
import { STATUSES } from '@/lib/types';
import { okey } from '@/lib/useTracker';
import { followUpDue, money, searchUrl, shortDate, STATUS_LABEL, travelLabel } from '@/lib/ui';
import type { CardActions } from './VenueCard';
import { IStar } from './Icons';

interface Props {
  venues: Venue[]; night: NightKey; brief: Brief;
  outreach: Record<string, OutreachRecord>; meta: Record<string, VenueMeta>; actions: CardActions;
}

export function ListView({ venues, night, brief, outreach, meta, actions }: Props) {
  const n = brief.nights[night];
  return (
    <div className="table-wrap">
      <table className="t">
        <thead>
          <tr>
            <th aria-label="Shortlist" />
            <th>Venue</th><th>From Javits</th><th>Recognition</th><th>{n.label} fit</th><th>Judged on</th>
            <th>Contact</th><th>RFP sent</th><th>Status</th><th className="num">All-in</th><th />
          </tr>
        </thead>
        <tbody>
          {venues.map(v => {
            const f = computeFit(v, n);
            const r = outreach[okey(v.id, night)];
            const m = meta[v.id];
            const email = m?.email_override || v.contact.email;
            const offered = v.nights.includes(night);
            const d = buildDraft(v, n, brief, m?.email_override);
            return (
              <tr key={v.id} data-venue={v.id}>
                <td><button className="mini-star" aria-pressed={!!m?.starred} aria-label="Shortlist" onClick={() => actions.star(v.id)}><IStar filled={!!m?.starred} /></button></td>
                <td><div className="name" onClick={() => actions.open(v.id)}>{v.name}</div><div className="muted">{v.area}</div></td>
                <td className="muted">{travelLabel(v)}</td>
                <td className="muted">{[v.awards.michelin_stars ? `MICHELIN ${'★'.repeat(v.awards.michelin_stars)}` : '', v.awards.james_beard ? 'James Beard' : ''].filter(Boolean).join(' · ')}</td>
                <td title={f.explanation}><span className={`badge v-${f.verdict}`}>{VERDICT_LABEL[f.verdict]}</span></td>
                <td className="muted">{f.room ? `${f.room} · ${f.approximate ? '~' : ''}${f.capacity}` : ''}</td>
                <td className="muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email ?? 'Events form'}</td>
                <td className="muted">{r && r.status !== 'not_contacted' ? `Yes${r.sent_at ? `, ${shortDate(r.sent_at)}` : ''}` : 'No'}</td>
                <td>
                  <select className={`status-sel s-${r?.status ?? 'not_contacted'}`} value={r?.status ?? 'not_contacted'} disabled={!offered}
                    aria-label={`Status for ${v.name}`} onChange={e => actions.setStatus(v.id, night, e.target.value as Status)}>
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                  {followUpDue(r) ? <div className="due" style={{ fontSize: 12, marginTop: 4 }}>Follow up</div>
                    : r?.sent_at ? <div className="muted" style={{ marginTop: 4 }}>Sent {shortDate(r.sent_at)}</div> : null}
                </td>
                <td className="num">{money(r?.all_in)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {email
                    ? <a className="btn primary xs" href={d.gmailUrl} target="_blank" rel="noopener noreferrer" aria-disabled={!offered} onClick={() => actions.markSent(v.id, night)}>Send RFP</a>
                    : <a className="btn xs" href={v.website ?? searchUrl(v)} target="_blank" rel="noopener noreferrer" aria-disabled={!offered}>Form</a>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CompareView({ venues, night, brief, outreach, meta, actions }: Props) {
  const n = brief.nights[night];
  const rows = venues
    .filter(v => v.nights.includes(night))
    .map(v => ({ v, r: outreach[okey(v.id, night)], m: meta[v.id], f: computeFit(v, n) }))
    .filter(x => x.m?.starred || (x.r && x.r.status !== 'not_contacted' && x.r.status !== 'sent') || x.r?.all_in != null || x.r?.fb_minimum != null)
    // Rank on the all-in figure when we have one, otherwise on the F&B minimum the venue quoted.
    .map(x => ({ ...x, cost: x.r?.all_in ?? x.r?.fb_minimum ?? null }))
    .sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity) || a.v.order - b.v.order);
  const priced = rows.map(x => x.cost).filter((x): x is number => x != null);
  const max = Math.max(1, ...priced);
  const min = priced.length ? Math.min(...priced) : null;

  if (!rows.length) {
    return (
      <div className="empty">
        <h3>Nothing to compare yet</h3>
        <p>Shortlist venues with the star, or log a reply or quote. They line up here by all-in cost for {n.label}.</p>
      </div>
    );
  }
  return (
    <>
      <p className="compare-note">Shortlisted venues and every venue that replied for {n.label}, cheapest first. Ranked on the all-in estimate where logged, otherwise the F&amp;B minimum. Per guest assumes {n.target_max} guests.</p>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr><th>Venue</th><th>Fit</th><th>Status</th><th className="num">F&amp;B minimum</th><th className="num">All-in</th><th className="num">Per guest</th><th>Cost</th><th>Fees and terms</th></tr>
          </thead>
          <tbody>
            {rows.map(({ v, r, m, f, cost }) => (
              <tr key={v.id}>
                <td>
                  <div className="name" onClick={() => actions.open(v.id)}>{m?.starred ? '★ ' : ''}{v.name}</div>
                  <div className="muted">{v.area} · {travelLabel(v)}</div>
                </td>
                <td title={f.explanation}><span className={`badge v-${f.verdict}`}>{VERDICT_LABEL[f.verdict]}</span><div className="muted" style={{ marginTop: 4 }}>{f.room}</div></td>
                <td><span className={`status-sel s-${r?.status ?? 'not_contacted'}`} style={{ display: 'inline-flex', alignItems: 'center', backgroundImage: 'none', paddingRight: 12 }}>{STATUS_LABEL[r?.status ?? 'not_contacted']}</span></td>
                <td className="num">{money(r?.fb_minimum) || <span className="muted">·</span>}</td>
                <td className="num"><b style={{ fontWeight: 500 }}>{money(r?.all_in) || <span className="muted">·</span>}</b></td>
                <td className="num">{cost ? <>{money(cost / n.target_max)}{r?.all_in == null && <div className="muted">from minimum</div>}</> : <span className="muted">·</span>}</td>
                <td>{cost != null && <div className={`qbar${cost === min ? ' best' : ''}`}><span style={{ width: `${(cost / max) * 100}%` }} /></div>}</td>
                <td className="muted" style={{ maxWidth: 300 }} title={[r?.fees, r?.notes].filter(Boolean).join('\n\n')}>{[r?.fees, r?.notes].filter(Boolean).join(' · ').slice(0, 220)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
