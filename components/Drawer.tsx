'use client';

import { useEffect, useState } from 'react';
import { computeFit, formatRoom, VERDICT_LABEL } from '@/lib/fit';
import type { ActivityItem, Brief, NightKey, OutreachPatch, OutreachRecord, Venue, VenueMeta } from '@/lib/types';
import { STATUSES } from '@/lib/types';
import { okey } from '@/lib/useTracker';
import { followUpDue, money, relTime, searchUrl, STATUS_LABEL, travelLabel } from '@/lib/ui';
import { CoverArt } from './Cover';
import { IExternal, IEye, IForm, IMail, ISend, IStar, IX } from './Icons';
import { Awards } from './VenueCard';
import { buildDraft } from '@/lib/mailer';

/** Text field that keeps its own draft while typing and reports each change for a per-field debounced save. */
function useField(value: string, onChange: (v: string) => void) {
  const [v, setV] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setV(value); }, [value, focused]);
  return {
    value: v,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onChange: (e: { target: { value: string } }) => { setV(e.target.value); onChange(e.target.value); },
  };
}

function NightTracker({ venue, night, brief, record, meta, update, onPreview, onSent }: {
  venue: Venue; night: NightKey; brief: Brief; record?: OutreachRecord; meta?: VenueMeta;
  update: (patch: OutreachPatch, debounce?: number) => void; onPreview: () => void; onSent: () => void;
}) {
  const n = brief.nights[night];
  const toNum = (s: string) => { const x = Number(s.replace(/[$,\s]/g, '')); return s.trim() === '' || !Number.isFinite(x) ? null : x; };
  // Logging a figure means a quote arrived, so move earlier statuses forward to "Quote in".
  const withQuote = (patch: OutreachPatch, value: number | null): OutreachPatch => {
    const st = record?.status ?? 'not_contacted';
    if (value == null || !['not_contacted', 'sent', 'replied'].includes(st)) return patch;
    return { ...patch, status: 'quoted', ...(record?.sent_at ? {} : { sent_at: new Date().toISOString() }) };
  };
  const minF = useField(record?.fb_minimum != null ? String(record.fb_minimum) : '', s => update(withQuote({ fb_minimum: toNum(s) }, toNum(s)), 700));
  const allF = useField(record?.all_in != null ? String(record.all_in) : '', s => update(withQuote({ all_in: toNum(s) }, toNum(s)), 700));
  const feesF = useField(record?.fees ?? '', s => update({ fees: s || null }, 800));
  const notesF = useField(record?.notes ?? '', s => update({ notes: s || null }, 800));
  const allIn = toNum(allF.value);
  const draft = buildDraft(venue, n, brief, meta?.email_override);
  const email = meta?.email_override || venue.contact.email;

  return (
    <div>
      <div className="row2">
        <div className="field">
          <label htmlFor={`s-${night}`}>Status</label>
          <select id={`s-${night}`} value={record?.status ?? 'not_contacted'}
            onChange={e => {
              const s = e.target.value as OutreachRecord['status'];
              update(s !== 'not_contacted' && !record?.sent_at ? { status: s, sent_at: new Date().toISOString() } : { status: s });
            }}>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`d-${night}`}>Sent on</label>
          <input id={`d-${night}`} type="date" value={record?.sent_at ? record.sent_at.slice(0, 10) : ''}
            onChange={e => update({ sent_at: e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : null })} />
        </div>
      </div>
      {followUpDue(record) && <div className="warn-box">No reply after four days. A short follow-up usually moves it.</div>}
      <div className="row2">
        <div className="field">
          <label htmlFor={`m-${night}`}>F&amp;B minimum</label>
          <div className="money"><span>$</span><input id={`m-${night}`} inputMode="decimal" placeholder="0" {...minF} /></div>
        </div>
        <div className="field">
          <label htmlFor={`a-${night}`}>All-in estimate</label>
          <div className="money"><span>$</span><input id={`a-${night}`} inputMode="decimal" placeholder="0" {...allF} /></div>
        </div>
      </div>
      {allIn != null && allIn > 0 && (
        <p className="per-head">Per guest: <b>{money(allIn / n.target_max)}</b> at {n.target_max} · <b>{money(allIn / n.target_min)}</b> at {n.target_min}</p>
      )}
      <div className="field">
        <label htmlFor={`f-${night}`}>Fees and terms</label>
        <input id={`f-${night}`} placeholder="22% service, 8.875% tax, room fee, deposit terms" {...feesF} />
      </div>
      <div className="field">
        <label htmlFor={`n-${night}`}>Notes</label>
        <textarea id={`n-${night}`} placeholder="What they said, who to call, menu thoughts" {...notesF} />
        <span className="hint">Saves as you type. Shared with everyone on the board.</span>
      </div>
      <div className="foot-row">
        {email ? (
          <a className="btn primary sm" href={draft.gmailUrl} target="_blank" rel="noopener noreferrer" onClick={onSent}><ISend /> Send RFP for {n.label}</a>
        ) : (
          <a className="btn primary sm" href={venue.website ?? searchUrl(venue)} target="_blank" rel="noopener noreferrer"><IForm /> Events form</a>
        )}
        <button className="btn sm" onClick={onPreview}><IEye /> Preview email</button>
      </div>
    </div>
  );
}

export function Drawer({ venue, brief, night, outreach, meta, activity, onClose, update, updateMeta, onPreview, onSent }: {
  venue: Venue; brief: Brief; night: NightKey; outreach: Record<string, OutreachRecord>; meta?: VenueMeta; activity: ActivityItem[];
  onClose: () => void;
  update: (venue: string, night: NightKey, patch: OutreachPatch, debounce?: number) => void;
  updateMeta: (patch: Partial<VenueMeta>, debounce?: number) => void;
  onPreview: (night: NightKey) => void; onSent: (night: NightKey) => void;
}) {
  const [tab, setTab] = useState<NightKey>(venue.nights.includes(night) ? night : venue.nights[0]);
  const emailF = useField(meta?.email_override ?? '', () => {});
  const [emailErr, setEmailErr] = useState<string | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const saveEmail = () => {
    emailF.onBlur();
    const v = emailF.value.trim();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setEmailErr('That is not a valid email address'); return; }
    setEmailErr(null);
    if ((meta?.email_override ?? '') !== v) updateMeta({ email_override: v || null });
  };
  const nights = (['sat', 'sun'] as NightKey[]).map(k => brief.nights[k]);
  const mine = activity.filter(a => a.venue_id === venue.id).slice(0, 12);
  const starred = !!meta?.starred;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={venue.name}>
        <div className="cover">
          <CoverArt venue={venue} url={meta?.cover_url} />
          <div className="tl"><Awards venue={venue} /></div>
          <div className="close"><button className="iconbtn" onClick={onClose} aria-label="Close"><IX /></button></div>
          <div className="bl">
            <span className="tag glassy">{travelLabel(venue)} from Javits</span>
            {venue.highlight && <span className="tag pick">{venue.highlight}</span>}
          </div>
        </div>
        <div className="d-head">
          <h2>{venue.name}</h2>
          <div className="sub">
            <span>{venue.area}</span>
            {venue.website && <a href={venue.website} target="_blank" rel="noopener noreferrer">Website <IExternal style={{ width: 12, height: 12, verticalAlign: '-1px' }} /></a>}
            <span style={{ flex: 1 }} />
            <button className={`btn sm${starred ? ' primary' : ''}`} onClick={() => updateMeta({ starred: !starred })}>
              <IStar filled={starred} /> {starred ? 'Shortlisted' : 'Shortlist'}
            </button>
          </div>
        </div>

        {(venue.highlight || venue.specialty || venue.notes.length > 0) && (
          <section className="d-sec">
            <h4>What we know</h4>
            {venue.highlight && <p className="callout">{venue.highlight}</p>}
            {venue.specialty && <p>{venue.specialty}</p>}
            <ul className="notes-list">{venue.notes.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </section>
        )}

        <section className="d-sec">
          <h4>Fit by night</h4>
          <div className="fit-pair">
            {nights.map(n => {
              const f = computeFit(venue, n);
              return (
                <div key={n.key}>
                  <div className="fp-n">{n.label} <span className={`badge v-${f.verdict}`}>{VERDICT_LABEL[f.verdict]}</span></div>
                  <div className="fp-x">{f.explanation}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="d-sec">
          <h4>Rooms</h4>
          <table className="rooms-t">
            <thead><tr><th>Space</th><th>Seated</th><th>Standing</th></tr></thead>
            <tbody>
              {venue.rooms.map(r => (
                <tr key={r.name}>
                  <td>{r.name}{r.confirmed && <span className="flag">Confirmed by venue</span>}{r.exclusive && <span className="flag">Buyout only</span>}{r.approximate && <span className="flag">Approximate</span>}{r.single_figure && <span className="flag">Format not stated</span>}</td>
                  <td>{r.seated != null ? `${r.approximate ? '~' : ''}${r.seated}` : '·'}</td>
                  <td>{r.standing != null ? `${r.approximate ? '~' : ''}${r.standing}` : '·'}</td>
                </tr>
              ))}
              {!venue.rooms.length && !venue.buyout.seated && !venue.buyout.standing && (
                <tr><td colSpan={3}>No capacity on file yet. Confirm the room and headcount with the venue.</td></tr>
              )}
              {(venue.buyout.seated || venue.buyout.standing) && (
                <tr>
                  <td>Full restaurant buyout{venue.buyout.confirmed && <span className="flag">Confirmed by venue</span>}{venue.buyout.single_figure && <span className="flag">Format not stated</span>}</td>
                  <td colSpan={venue.buyout.single_figure ? 2 : 1}>{formatRoom({ ...venue.buyout, name: '', exclusive: true }).split('·')[0]}</td>
                  {!venue.buyout.single_figure && <td>{venue.buyout.approximate ? '~' : ''}{venue.buyout.standing}</td>}
                </tr>
              )}
            </tbody>
          </table>
          <p className="source" style={{ marginTop: 12 }}>Source: {venue.capacity_source} Checked {venue.verified_on}.</p>
        </section>

        <section className="d-sec">
          <h4>Contact</h4>
          <div className="contact" style={{ marginBottom: 12 }}>
            {venue.contact.email ? <><IMail /><span className="addr">{venue.contact.email}</span><span className="flag">From research</span></>
              : <><IForm /><span className="addr">No public events address. Enquiries go through their form.</span></>}
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="override">Send to a different address</label>
            <input id="override" type="email" placeholder={venue.contact.email ?? 'events@venue.com'} {...emailF}
              onChange={e => emailF.onChange(e)} onBlur={saveEmail} />
            <span className="hint" style={emailErr ? { color: '#b54500' } : undefined}>{emailErr ?? 'Use this when a venue replies from a named planner. Every RFP draft will use it.'}</span>
          </div>
        </section>

        <section className="d-sec">
          <h4>Outreach</h4>
          {venue.nights.length > 1 && (
            <div className="tabs">
              <div className="seg blue">
                {venue.nights.map(k => (
                  <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
                    {brief.nights[k].label} · {STATUS_LABEL[outreach[okey(venue.id, k)]?.status ?? 'not_contacted']}
                  </button>
                ))}
              </div>
            </div>
          )}
          <NightTracker key={tab} venue={venue} night={tab} brief={brief} record={outreach[okey(venue.id, tab)]} meta={meta}
            update={(p, d) => update(venue.id, tab, p, d)} onPreview={() => onPreview(tab)} onSent={() => onSent(tab)} />
        </section>

        {mine.length > 0 && (
          <section className="d-sec">
            <h4>History</h4>
            <ul className="timeline">
              {mine.map(a => (
                <li key={a.id}><time>{relTime(a.at)}</time><span>{a.detail}{a.night ? ` · ${brief.nights[a.night].label}` : ''}{a.actor ? ` · ${a.actor}` : ''}</span></li>
              ))}
            </ul>
          </section>
        )}

        <section className="d-sec no-print">
          <h4>Cover photo</h4>
          <CoverField meta={meta} onSave={url => updateMeta({ cover_url: url })} />
        </section>
        <div style={{ height: 24 }} />
      </aside>
    </>
  );
}

function CoverField({ meta, onSave }: { meta?: VenueMeta; onSave: (u: string | null) => void }) {
  const [v, setV] = useState(meta?.cover_url ?? '');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label htmlFor="cover">Image URL</label>
      <input id="cover" value={v} placeholder="https://…/photo.jpg" onChange={e => setV(e.target.value)}
        onBlur={() => {
          const t = v.trim();
          if (t && !/^https?:\/\//i.test(t)) { setErr('Use a full http(s) link to an image'); return; }
          setErr(null);
          if (t !== (meta?.cover_url ?? '')) onSave(t || null);
        }} />
      <span className="hint" style={err ? { color: '#b54500' } : undefined}>{err ?? 'Paste any image link, or use Photos in the top bar to pull each venue’s own image.'}</span>
    </div>
  );
}
