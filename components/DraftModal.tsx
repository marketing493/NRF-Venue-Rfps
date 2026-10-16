'use client';

import { useEffect, useState } from 'react';
import { buildDraft } from '@/lib/mailer';
import type { Brief, NightKey, Venue, VenueMeta } from '@/lib/types';
import { searchUrl } from '@/lib/ui';
import { ICheck, IExternal, ISend, IX } from './Icons';

export function DraftModal({ venue, night, brief, meta, onClose, onSent, onCopy, onEmail }: {
  venue: Venue; night: NightKey; brief: Brief; meta?: VenueMeta;
  onClose: () => void; onSent: () => void; onCopy: (t: string, what: string) => void; onEmail: (email: string | null) => void;
}) {
  const n = brief.nights[night];
  const [to, setTo] = useState(meta?.email_override || venue.contact.email || '');
  const draft = buildDraft(venue, n, brief, to);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const saveTo = () => {
    const t = to.trim();
    const original = venue.contact.email || '';
    if (t === (meta?.email_override || original)) return;
    if (t && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return;
    onEmail(t && t !== original ? t : null);
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="draft-title">
        <div className="modal-head">
          <div>
            <h3 id="draft-title">RFP to {venue.name}</h3>
            <p>{n.date_label} · {n.headcount_label} guests · Sent as {brief.sender.name} ({brief.sender.email})</p>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><IX /></button>
        </div>
        <div className="modal-body">
          {!venue.contact.email && (
            <div className="warn-box">
              {venue.name} takes enquiries through a form. Copy the RFP into their form, or add an events address below if you have one.
            </div>
          )}
          <div className="mail-field">
            <span>To</span>
            <input value={to} onChange={e => setTo(e.target.value)} onBlur={saveTo} placeholder="events@venue.com"
              style={{ border: 0, padding: 0, outline: 'none', background: 'transparent', minWidth: 0 }} aria-label="Recipient" />
            <button className="copy" onClick={() => onCopy(to, 'Email')} disabled={!to}>Copy</button>
          </div>
          <div className="mail-field">
            <span>Subject</span>
            <div>{draft.subject}</div>
            <button className="copy" onClick={() => onCopy(draft.subject, 'Subject')}>Copy</button>
          </div>
          <div className="mail-body">{draft.body}</div>
        </div>
        <div className="modal-foot">
          <button className="btn sm" onClick={() => onCopy(draft.body, 'Email body')}>Copy body</button>
          {!venue.contact.email && (
            <a className="btn sm" href={venue.website ?? searchUrl(venue)} target="_blank" rel="noopener noreferrer"><IExternal /> Open events form</a>
          )}
          <button className="btn sm" onClick={() => { onSent(); onClose(); }}><ICheck /> Mark as sent</button>
          <a className="btn primary sm" href={draft.gmailUrl} target="_blank" rel="noopener noreferrer" aria-disabled={!valid}
            onClick={() => { saveTo(); onSent(); onClose(); }}>
            <ISend /> Open in Gmail
          </a>
        </div>
      </div>
    </>
  );
}
