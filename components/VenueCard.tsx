'use client';

import { memo } from 'react';
import { computeFit, formatRoom, VERDICT_LABEL } from '@/lib/fit';
import { buildDraft } from '@/lib/mailer';
import type { Brief, NightKey, OutreachRecord, Status, Venue, VenueMeta } from '@/lib/types';
import { STATUSES } from '@/lib/types';
import { followUpDue, money, searchUrl, shortDate, STATUS_LABEL, travelLabel } from '@/lib/ui';
import { CoverArt } from './Cover';
import { ICheck, IEye, IForm, IMail, ISend, IStar } from './Icons';

export interface CardActions {
  open: (id: string) => void;
  preview: (id: string, night: NightKey) => void;
  setStatus: (id: string, night: NightKey, s: Status) => void;
  markSent: (id: string, night: NightKey) => void;
  toggleSent: (id: string, night: NightKey) => void;
  star: (id: string) => void;
  copy: (text: string, what: string) => void;
}

export function Awards({ venue }: { venue: Venue }) {
  const m = venue.awards.michelin_stars;
  return (
    <>
      {m > 0 && <span className="tag michelin" title={`${m} MICHELIN star${m > 1 ? 's' : ''}`}>MICHELIN <span className="stars">{'★'.repeat(m)}</span></span>}
      {venue.awards.james_beard && <span className="tag jbf" title="James Beard recognition">James Beard</span>}
    </>
  );
}

function VenueCardInner({ venue, night, brief, record, meta, actions }: {
  venue: Venue; night: NightKey; brief: Brief; record?: OutreachRecord; meta?: VenueMeta; actions: CardActions;
}) {
  const n = brief.nights[night];
  const fit = computeFit(venue, n);
  const offered = venue.nights.includes(night);
  const status = record?.status ?? 'not_contacted';
  const email = meta?.email_override || venue.contact.email;
  const draft = buildDraft(venue, n, brief, meta?.email_override);
  const starred = !!meta?.starred;
  const sent = status !== 'not_contacted';
  const due = followUpDue(record);
  const otherNight = venue.nights.length === 1 ? (venue.nights[0] === 'sat' ? 'Saturday only' : 'Sunday only') : 'Both nights';

  return (
    <article className={`card${starred ? ' is-starred' : ''}${offered ? '' : ' is-off'}`} data-venue={venue.id}>
      <div className="cover" onClick={() => actions.open(venue.id)}>
        <CoverArt venue={venue} url={meta?.cover_url} />
        <div className="tl"><Awards venue={venue} /></div>
        <div className="tr">
          <button className="star" aria-pressed={starred} aria-label={starred ? `Remove ${venue.name} from shortlist` : `Shortlist ${venue.name}`}
            onClick={e => { e.stopPropagation(); actions.star(venue.id); }}>
            <IStar filled={starred} />
          </button>
        </div>
        <div className="bl">
          <span className="tag glassy">{travelLabel(venue)}</span>
          {venue.highlight && <span className="tag pick">{venue.highlight}</span>}
        </div>
      </div>

      <div className="card-body">
        <div className="card-title">
          <h3 onClick={() => actions.open(venue.id)}>{venue.name}</h3>
          <div className="sub"><span>{venue.area}</span><span className="sep" /><span>{otherNight}</span></div>
        </div>

        <div className="fit" title={fit.explanation}>
          <span className={`badge v-${fit.verdict}`}>{VERDICT_LABEL[fit.verdict]}</span>
          <div className="fit-main">
            {offered ? (
              <>
                <div className="fit-room">{fit.room ?? 'No figure published'}{fit.capacity != null && <> · {fit.approximate ? '~' : ''}{fit.capacity} {n.measure}</>}</div>
                <div className="fit-basis">{fit.basis ? `Basis: ${fit.basis}` : 'Ask for capacity in the RFP'}</div>
              </>
            ) : (
              <div className="fit-basis">Not offered for {n.label}. Switch nights to work it.</div>
            )}
          </div>
        </div>

        <div className="rooms" aria-label="Rooms, seated and standing">
          {venue.rooms.map(r => (
            <span key={r.name} className={`room${r.name === fit.room ? ' judged' : ''}${r.exclusive ? ' excl' : ''}`}
              title={r.exclusive ? 'Whole restaurant: booking it is a buyout' : r.single_figure ? 'One figure published, format not stated' : 'Seated · standing'}>
              {r.name} <b>{formatRoom(r)}</b>
            </span>
          ))}
          {(venue.buyout.seated || venue.buyout.standing) && (
            <span className={`room excl${fit.room === 'Full restaurant buyout' ? ' judged' : ''}`} title="Full restaurant buyout">
              Buyout <b>{formatRoom({ ...venue.buyout, name: '', exclusive: true })}</b>
            </span>
          )}
        </div>

        <div className="contact">
          {email ? (
            <>
              <IMail />
              <span className="addr" title={email}>{email}</span>
              <button className="copy" onClick={() => actions.copy(email, 'Email')}>Copy</button>
            </>
          ) : (
            <>
              <IForm />
              <span className="addr">Events form only</span>
              <a className="copy" href={venue.website ?? searchUrl(venue)} target="_blank" rel="noopener noreferrer">Open site</a>
            </>
          )}
        </div>

        <div className="card-foot">
          <div className="foot-row">
            <label className="sr" htmlFor={`st-${venue.id}`}>Status for {n.label}</label>
            <select id={`st-${venue.id}`} className={`status-sel s-${status}`} value={status} disabled={!offered}
              onChange={e => actions.setStatus(venue.id, night, e.target.value as Status)}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            {record?.all_in != null && <span className="quote-pill" title="All-in estimate">{money(record.all_in)}</span>}
            <span className="grow" />
            <button className="btn xs" disabled={!offered} aria-pressed={sent}
              onClick={() => actions.toggleSent(venue.id, night)}
              title={sent ? 'Mark as not contacted' : 'Mark as sent without opening Gmail'}>
              {sent ? <><ICheck /> Sent</> : 'Mark sent'}
            </button>
          </div>
          {(record?.sent_at || due) && (
            <div className="meta-line">
              {record?.sent_at && <span>Sent {shortDate(record.sent_at)}{record.updated_by ? ` by ${record.updated_by}` : ''}</span>}
              {due && <span className="due">Follow up due</span>}
            </div>
          )}
          <div className="foot-row">
            {email ? (
              <a className="btn primary sm" href={draft.gmailUrl} target="_blank" rel="noopener noreferrer" aria-disabled={!offered}
                onClick={() => actions.markSent(venue.id, night)}>
                <ISend /> {sent ? 'Send again' : 'Send RFP'}
              </a>
            ) : (
              <a className="btn primary sm" href={venue.website ?? searchUrl(venue)} target="_blank" rel="noopener noreferrer" aria-disabled={!offered}>
                <IForm /> Events form
              </a>
            )}
            <button className="btn sm" onClick={() => actions.preview(venue.id, night)} disabled={!offered}><IEye /> Preview</button>
            <span className="grow" />
            <button className="btn ghost sm" onClick={() => actions.open(venue.id)}>Details</button>
          </div>
        </div>
      </div>
    </article>
  );
}

export const VenueCard = memo(VenueCardInner);
