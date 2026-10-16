'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeFit, VERDICT_RANK } from '@/lib/fit';
import type { ActivityItem, Brief, NightKey, OutreachPatch, Status, Venue, VenueMeta } from '@/lib/types';
import { okey, useTracker, type Sync } from '@/lib/useTracker';
import { followUpDue, gotQuote, gotReply, STATUS_LABEL, wasSent } from '@/lib/ui';
import { ActivityPanel } from './ActivityPanel';
import { DraftModal } from './DraftModal';
import { Drawer } from './Drawer';
import { IActivity, IDownload, IImage, IPrint, IReset, ISearch, IStar, IUser } from './Icons';
import { CompareView, ListView } from './Tables';
import { VenueCard, type CardActions } from './VenueCard';

type View = 'cards' | 'list' | 'compare';
type SortKey = 'distance' | 'fit' | 'capacity' | 'recognition' | 'progress' | 'quote' | 'name';
interface Filters {
  night: NightKey; q: string; rfp: string; status: string; fit: string; recognition: string; contact: string;
  walk: boolean; starred: boolean; hideOff: boolean; sort: SortKey; view: View;
}
const DEFAULTS: Filters = { night: 'sat', q: '', rfp: 'all', status: 'all', fit: 'all', recognition: 'all', contact: 'all', walk: false, starred: false, hideOff: true, sort: 'distance', view: 'cards' };
const VIEW_KEY = 'nrf-rfp-view-v1';

const SYNC_LABEL: Record<Sync, string> = {
  loading: 'Loading', synced: 'Saved to Neon', saving: 'Saving', local: 'This browser only', offline: 'Offline, will retry', error: 'Not saved, retrying',
};

const STATUS_RANK: Record<Status, number> = { booked: 0, quoted: 1, replied: 2, sent: 3, not_contacted: 4, declined: 5 };

export default function Board({ venues, brief }: { venues: Venue[]; brief: Brief }) {
  const t = useTracker();
  const { outreach, meta } = t;
  const [f, setF] = useState<Filters>(DEFAULTS);
  const [openId, setOpenId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; night: NightKey } | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string; undo?: () => void }[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [fetchingPhotos, setFetchingPhotos] = useState(false);
  const toastId = useRef(0);
  const byId = useMemo(() => new Map(venues.map(v => [v.id, v])), [venues]);

  // Restore view preferences.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEW_KEY);
      if (raw) setF({ ...DEFAULTS, ...JSON.parse(raw), q: '' });
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(f)); } catch { /* ignore */ }
  }, [f]);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF(x => ({ ...x, [k]: v }));

  const toast = useCallback((text: string, undo?: () => void) => {
    const id = ++toastId.current;
    setToasts(ts => [...ts.slice(-2), { id, text, undo }]);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), undo ? 6000 : 3000);
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const r = await fetch('/api/activity', { cache: 'no-store' });
      if (r.ok) setActivity((await r.json()).items);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { if (t.db) void loadActivity(); }, [t.db, loadActivity]);

  // First visit after deploy: fetch any missing venue photos on the server and save them in Neon.
  // The server runs this at most once every six hours, however many people open the board.
  const autoPhotos = useRef(false);
  useEffect(() => {
    if (!t.db || t.sync === 'loading' || autoPhotos.current) return;
    autoPhotos.current = true;
    if (venues.every(v => meta[v.id]?.cover_url || (!v.website && !v.photo_pages?.length))) return;
    (async () => {
      try {
        const r = await fetch('/api/covers', { method: 'POST', headers: t.headers(), body: JSON.stringify({ auto: true }) });
        if (!r.ok) return;
        const j = await r.json();
        if (Object.keys(j.found ?? {}).length) {
          t.applyCovers(j.found);
          void loadActivity();
        }
      } catch { /* photos are a nicety; never block the board */ }
    })();
  }, [t.db, t.sync]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (t.error) toast(t.error); }, [t.error, toast]);

  // Refs so the actions object stays stable and memoized cards skip re-rendering.
  const stateRef = useRef({ outreach, meta });
  stateRef.current = { outreach, meta };

  const update = useCallback((venue: string, night: NightKey, patch: OutreachPatch, debounce = 0) => {
    t.updateOutreach(venue, night, patch, debounce);
    if (!debounce) setTimeout(loadActivity, 1200);
  }, [t.updateOutreach, loadActivity]); // eslint-disable-line react-hooks/exhaustive-deps

  const actions: CardActions = useMemo(() => ({
    open: id => setOpenId(id),
    preview: (id, night) => setPreview({ id, night }),
    setStatus: (id, night, s) => {
      const prev = stateRef.current.outreach[okey(id, night)];
      const patch: OutreachPatch = { status: s };
      if (s !== 'not_contacted' && !prev?.sent_at) patch.sent_at = new Date().toISOString();
      update(id, night, patch);
      toast(`${byId.get(id)?.name}: ${STATUS_LABEL[s]}`, () => update(id, night, { status: prev?.status ?? 'not_contacted', sent_at: prev?.sent_at ?? null }));
    },
    markSent: (id, night) => {
      const prev = stateRef.current.outreach[okey(id, night)];
      if (!prev || prev.status === 'not_contacted') update(id, night, { status: 'sent', sent_at: new Date().toISOString() });
      toast(`Gmail draft opened for ${byId.get(id)?.name}. Marked as sent.`, prev && prev.status !== 'not_contacted' ? undefined
        : () => update(id, night, { status: 'not_contacted', sent_at: null }));
    },
    toggleSent: (id, night) => {
      const prev = stateRef.current.outreach[okey(id, night)];
      const name = byId.get(id)?.name;
      if (prev && prev.status !== 'not_contacted') {
        update(id, night, { status: 'not_contacted', sent_at: null });
        toast(`${name} set back to not contacted`, () => update(id, night, { status: prev.status, sent_at: prev.sent_at }));
      } else {
        update(id, night, { status: 'sent', sent_at: new Date().toISOString() });
        toast(`${name} marked as sent`, () => update(id, night, { status: 'not_contacted', sent_at: null }));
      }
    },
    star: id => {
      const on = !stateRef.current.meta[id]?.starred;
      t.updateMeta(id, { starred: on });
      toast(on ? `${byId.get(id)?.name} added to shortlist` : `${byId.get(id)?.name} removed from shortlist`);
      setTimeout(loadActivity, 1200);
    },
    copy: (text, what) => {
      navigator.clipboard?.writeText(text).then(() => toast(`${what} copied`), () => toast('Copy failed. Select the text instead.'));
    },
  }), [update, toast, byId, t.updateMeta, loadActivity]); // eslint-disable-line react-hooks/exhaustive-deps

  const night = brief.nights[f.night];

  // ----- Stats -----
  const stats = useMemo(() => {
    const per = (k: NightKey) => {
      const list = venues.filter(v => v.nights.includes(k));
      const recs = list.map(v => outreach[okey(v.id, k)]);
      return {
        total: list.length,
        sent: recs.filter(r => wasSent(r?.status)).length,
        replied: recs.filter(r => gotReply(r?.status)).length,
        quoted: recs.filter(r => gotQuote(r?.status)).length,
        fits: list.filter(v => ['good', 'tight'].includes(computeFit(v, brief.nights[k]).verdict)).length,
        due: recs.filter(r => followUpDue(r)).length,
      };
    };
    const sat = per('sat');
    const sun = per('sun');
    const all = Object.values(outreach);
    return {
      sat, sun,
      sent: all.filter(r => wasSent(r.status)).length,
      replied: all.filter(r => gotReply(r.status)).length,
      quoted: all.filter(r => gotQuote(r.status)).length,
      starred: Object.values(meta).filter(m => m.starred).length,
      due: sat.due + sun.due,
    };
  }, [venues, outreach, meta, brief]);

  // ----- Filter + sort -----
  const shown = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const list = venues.filter(v => {
      const offered = v.nights.includes(f.night);
      if (f.hideOff && !offered) return false;
      const r = outreach[okey(v.id, f.night)];
      const m = meta[v.id];
      const status = r?.status ?? 'not_contacted';
      if (q) {
        const hay = [v.name, v.area, v.specialty ?? '', v.contact.email ?? '', m?.email_override ?? '', ...v.rooms.map(x => x.name), r?.notes ?? ''].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (f.rfp === 'yes' && !wasSent(status)) return false;
      if (f.rfp === 'no' && wasSent(status)) return false;
      if (f.status === 'follow_up') { if (!followUpDue(r)) return false; }
      else if (f.status !== 'all' && status !== f.status) return false;
      if (f.fit !== 'all') {
        const v2 = computeFit(v, night).verdict;
        if (f.fit === 'fits' ? !(v2 === 'good' || v2 === 'tight') : v2 !== f.fit) return false;
      }
      const ms = v.awards.michelin_stars;
      const jbf = v.awards.james_beard;
      if (f.recognition === 'michelin' && !ms) return false;
      if (f.recognition === 'michelin3' && ms < 3) return false;
      if (f.recognition === 'jbf' && !jbf) return false;
      if (f.recognition === 'any' && !ms && !jbf) return false;
      if (f.recognition === 'none' && (ms || jbf)) return false;
      const email = m?.email_override || v.contact.email;
      if (f.contact === 'email' && !email) return false;
      if (f.contact === 'form' && email) return false;
      if (f.walk && v.travel.mode !== 'walk') return false;
      if (f.starred && !m?.starred) return false;
      return true;
    });
    const fitOf = new Map(list.map(v => [v.id, computeFit(v, night)]));
    const cmp: Record<SortKey, (a: Venue, b: Venue) => number> = {
      distance: (a, b) => a.order - b.order,
      fit: (a, b) => VERDICT_RANK[fitOf.get(a.id)!.verdict] - VERDICT_RANK[fitOf.get(b.id)!.verdict] || a.order - b.order,
      capacity: (a, b) => (fitOf.get(b.id)!.capacity ?? -1) - (fitOf.get(a.id)!.capacity ?? -1),
      recognition: (a, b) => (b.awards.michelin_stars * 2 + +b.awards.james_beard) - (a.awards.michelin_stars * 2 + +a.awards.james_beard) || a.order - b.order,
      progress: (a, b) => STATUS_RANK[outreach[okey(a.id, f.night)]?.status ?? 'not_contacted'] - STATUS_RANK[outreach[okey(b.id, f.night)]?.status ?? 'not_contacted'] || a.order - b.order,
      quote: (a, b) => {
        const c = (v: Venue) => { const r = outreach[okey(v.id, f.night)]; return r?.all_in ?? r?.fb_minimum ?? Infinity; };
        return c(a) - c(b) || a.order - b.order;
      },
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return list.sort(cmp[f.sort]);
  }, [venues, outreach, meta, f, night]);

  const filtersActive = f.q || f.rfp !== 'all' || f.status !== 'all' || f.fit !== 'all' || f.recognition !== 'all' || f.contact !== 'all' || f.walk || f.starred;
  const offeredCount = venues.filter(v => v.nights.includes(f.night)).length;

  // ----- Top bar actions -----
  const fetchPhotos = async () => {
    if (!t.db) { toast('Connect Neon first. Photos are cached in the database.'); return; }
    const missing = venues.filter(v => !meta[v.id]?.cover_url).length;
    const force = missing === 0;
    if (force && !window.confirm('Every venue already has a photo. Fetch fresh photos for all of them?')) return;
    setFetchingPhotos(true);
    toast(`Pulling ${force ? 'every' : missing} venue photo${missing === 1 ? '' : 's'} from their own sites. This takes up to a minute.`);
    try {
      const r = await fetch('/api/covers', { method: 'POST', headers: t.headers(), body: JSON.stringify({ force }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Photo fetch failed');
      t.applyCovers(j.found);
      toast(j.checked ? `Found ${Object.keys(j.found).length} of ${j.checked} photos${j.unchecked?.length ? `. Click again for the remaining ${j.unchecked.length}.` : ''}` : 'Every venue already has a photo');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setFetchingPhotos(false);
    }
  };

  const doReset = async () => {
    const sentCount = stats.sent;
    if (!window.confirm(`Reset outreach for every venue?\n\nThis clears ${sentCount} sent RFP${sentCount === 1 ? '' : 's'}, every status, quote and note, for everyone using the board. Shortlist stars stay.`)) return;
    if (window.prompt('Type RESET to confirm') !== 'RESET') { toast('Reset cancelled'); return; }
    try {
      await t.reset(false);
      toast('Outreach reset. Every venue is back to not contacted.');
      void loadActivity();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const setName = () => {
    const name = window.prompt('Your name, shown next to the changes you make', t.actor);
    if (name !== null) { t.setActor(name.trim()); toast(name.trim() ? `Signed changes as ${name.trim()}` : 'Changes are now unsigned'); }
  };

  const openVenue = openId ? byId.get(openId) : null;
  const previewVenue = preview ? byId.get(preview.id) : null;

  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ia-logo.png" alt="Impact Analytics" width={200} height={66} />
            <span className="divider" />
            <div className="product"><b>NRF 2027 Venue RFPs</b>Outreach board</div>
          </div>
          <span className="spacer" />
          <div className="top-actions">
            <span className="sync" data-s={t.sync} title={t.db === false ? 'Set DATABASE_URL to share tracking across devices' : undefined}><i />{SYNC_LABEL[t.sync]}</span>
            <button className="btn sm ghost" onClick={setName} title="Sign your changes"><IUser /> {t.actor || 'Add your name'}</button>
            <button className="btn sm" onClick={() => { setShowActivity(true); void loadActivity(); }}><IActivity /> Activity</button>
            <button className="btn sm" onClick={fetchPhotos} disabled={fetchingPhotos}><IImage /> {fetchingPhotos ? 'Fetching' : 'Photos'}</button>
            <a className="btn sm" href="/api/export?format=csv" download><IDownload /> CSV</a>
            <button className="btn sm" onClick={() => window.print()}><IPrint /> Print</button>
            <button className="btn sm ghost" onClick={doReset} title="Reset all outreach"><IReset /> Reset</button>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <div className="eyebrow"><span>{brief.event.name}</span><span className="dot" /><span>{brief.event.dates}</span><span className="dot" /><span>Ranked by distance from Javits</span></div>
          <h1>Two evenings in New York. {venues.length} vetted venues, <em>one</em> click each.</h1>
          <p className="lede">Every capacity shows its source. Every fit names the room it judged. Send each RFP from Gmail in one click and track replies and quotes here.</p>
          <div className="nights">
            {(['sat', 'sun'] as NightKey[]).map(k => {
              const n = brief.nights[k];
              const s = stats[k];
              const pct = (x: number) => `${s.total ? (x / s.total) * 100 : 0}%`;
              return (
                <button key={k} className="glass" aria-pressed={f.night === k} onClick={() => set('night', k)}>
                  <span className="n-active">Working this night</span>
                  <div className="n-top"><span className="n-label">{n.label}</span><span className="n-date">{n.date_label.replace(`${n.label}, `, '')}</span></div>
                  <p className="n-sum">{n.summary}</p>
                  <div className="n-facts">
                    <span><b>{n.group}</b></span>
                    <span>Judged on {n.measure} capacity</span>
                    <span>{s.fits} venues fit outright</span>
                  </div>
                  <div className="funnel">
                    <div><b>{s.total}</b>Venues</div>
                    <div><b>{s.sent}</b>RFPs sent</div>
                    <div><b>{s.replied}</b>Replies</div>
                    <div><b>{s.quoted}</b>Quotes</div>
                  </div>
                  <div className="bar" aria-hidden="true">
                    <span className="b-quoted" style={{ width: pct(s.quoted) }} />
                    <span className="b-replied" style={{ width: pct(s.replied - s.quoted) }} />
                    <span className="b-sent" style={{ width: pct(s.sent - s.replied) }} />
                  </div>
                  {n.steer && <div className="steer">{n.steer}</div>}
                </button>
              );
            })}
          </div>
          <div className="kpis">
            <div><b>{venues.length}</b><span>Venues researched</span></div>
            <div><b>{stats.sent}</b><span>RFPs sent</span></div>
            <div><b>{stats.replied}</b><span>Replies</span></div>
            <div><b>{stats.quoted}</b><span>Quotes in</span></div>
            <div><b>{stats.starred}</b><span>Shortlisted</span></div>
            <div className={stats.due ? 'warn' : ''}><b>{stats.due}</b><span>Follow-ups due</span></div>
          </div>
        </div>
      </section>

      <div className="toolbar">
        <div className="wrap">
          <div className="seg blue" role="group" aria-label="Night">
            {(['sat', 'sun'] as NightKey[]).map(k => (
              <button key={k} aria-pressed={f.night === k} onClick={() => set('night', k)}>{brief.nights[k].label} {brief.nights[k].date.slice(8).replace(/^0/, '')} Jan</button>
            ))}
          </div>
          <div className="search">
            <ISearch />
            <input type="search" placeholder="Search venue, area, room, notes" value={f.q} onChange={e => set('q', e.target.value)} aria-label="Search venues" />
          </div>
          <select className={`select${f.rfp !== 'all' ? ' active' : ''}`} value={f.rfp} onChange={e => set('rfp', e.target.value)} aria-label="RFP sent filter">
            <option value="all">RFP sent: any</option>
            <option value="yes">RFP sent: yes</option>
            <option value="no">RFP sent: no</option>
          </select>
          <select className={`select${f.status !== 'all' ? ' active' : ''}`} value={f.status} onChange={e => set('status', e.target.value)} aria-label="Status filter">
            <option value="all">Any status</option>
            <option value="not_contacted">Not contacted</option>
            <option value="sent">Awaiting reply</option>
            <option value="follow_up">Follow-up due</option>
            <option value="replied">Replied</option>
            <option value="quoted">Quote in</option>
            <option value="booked">Booked</option>
            <option value="declined">Declined</option>
          </select>
          <select className={`select${f.fit !== 'all' ? ' active' : ''}`} value={f.fit} onChange={e => set('fit', e.target.value)} aria-label="Fit filter">
            <option value="all">Any fit</option>
            <option value="fits">Fits (good or tight)</option>
            <option value="good">Good fit</option>
            <option value="tight">Tight fit</option>
            <option value="buyout">Buyout only</option>
            <option value="just_under">Just under</option>
          </select>
          <select className={`select${f.recognition !== 'all' ? ' active' : ''}`} value={f.recognition} onChange={e => set('recognition', e.target.value)} aria-label="Recognition filter">
            <option value="all">Any recognition</option>
            <option value="any">MICHELIN or James Beard</option>
            <option value="michelin">MICHELIN starred</option>
            <option value="michelin3">Three MICHELIN stars</option>
            <option value="jbf">James Beard</option>
            <option value="none">No awards</option>
          </select>
          <select className={`select${f.contact !== 'all' ? ' active' : ''}`} value={f.contact} onChange={e => set('contact', e.target.value)} aria-label="Contact filter">
            <option value="all">Email or form</option>
            <option value="email">Has events email</option>
            <option value="form">Form only</option>
          </select>
          <button className="chip-toggle" aria-pressed={f.walk} onClick={() => set('walk', !f.walk)}>Walkable</button>
          <button className="chip-toggle" aria-pressed={f.starred} onClick={() => set('starred', !f.starred)}><IStar filled={f.starred} /> Shortlist</button>
          <select className="select" value={f.sort} onChange={e => set('sort', e.target.value as SortKey)} aria-label="Sort">
            <option value="distance">Sort: nearest Javits</option>
            <option value="fit">Sort: best fit</option>
            <option value="capacity">Sort: largest room</option>
            <option value="recognition">Sort: most recognised</option>
            <option value="progress">Sort: furthest along</option>
            <option value="quote">Sort: lowest quote</option>
            <option value="name">Sort: A to Z</option>
          </select>
          <div className="seg" role="group" aria-label="View">
            {(['cards', 'list', 'compare'] as View[]).map(v => (
              <button key={v} aria-pressed={f.view === v} onClick={() => set('view', v)}>{v === 'cards' ? 'Cards' : v === 'list' ? 'List' : 'Compare'}</button>
            ))}
          </div>
          <span className="count" aria-live="polite">
            Showing {shown.length} of {f.hideOff ? offeredCount : venues.length}
            {filtersActive && <> · <button className="clear" onClick={() => setF(x => ({ ...DEFAULTS, night: x.night, view: x.view, sort: x.sort }))}>Clear filters</button></>}
          </span>
        </div>
      </div>

      <main>
        <div className="wrap">
          <div className="section-head">
            <div>
              <h2>{night.label}, {night.date_label.replace(`${night.label}, `, '')}</h2>
              <p>{night.format} · {night.headcount_label} guests · {night.window} · {night.group}</p>
            </div>
            <button className="chip-toggle no-print" aria-pressed={!f.hideOff} onClick={() => set('hideOff', !f.hideOff)}>
              {f.hideOff ? `Show ${venues.length - offeredCount} not offered for ${night.label}` : `Hide venues not offered for ${night.label}`}
            </button>
          </div>

          {t.sync === 'loading' ? (
            <div className="grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" />)}</div>
          ) : f.view === 'compare' ? (
            <CompareView venues={shown} night={f.night} brief={brief} outreach={outreach} meta={meta} actions={actions} />
          ) : !shown.length ? (
            <div className="empty">
              <h3>No venues match</h3>
              <p>Loosen a filter or clear them all.</p>
              <button className="btn primary sm" onClick={() => setF(x => ({ ...DEFAULTS, night: x.night, view: x.view }))}>Clear filters</button>
            </div>
          ) : f.view === 'list' ? (
            <ListView venues={shown} night={f.night} brief={brief} outreach={outreach} meta={meta} actions={actions} />
          ) : (
            <div className="grid">
              {shown.map(v => (
                <VenueCard key={v.id} venue={v} night={f.night} brief={brief} record={outreach[okey(v.id, f.night)]} meta={meta[v.id]} actions={actions} />
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="foot">
        <div className="wrap">
          <span>Capacities come from search-indexed venue pages, checked September 2026, unless marked as confirmed by the venue.</span>
          <span>RFPs send from {brief.sender.email} via Gmail. No mail leaves this server.</span>
        </div>
      </footer>

      {openVenue && (
        <Drawer venue={openVenue} brief={brief} night={f.night} outreach={outreach} meta={meta[openVenue.id]} activity={activity}
          onClose={() => setOpenId(null)} update={update}
          updateMeta={(p, d) => { t.updateMeta(openVenue.id, p as Partial<VenueMeta>, d); setTimeout(loadActivity, 1200); }}
          onPreview={n => setPreview({ id: openVenue.id, night: n })}
          onSent={n => actions.markSent(openVenue.id, n)} />
      )}
      {previewVenue && preview && (
        <DraftModal venue={previewVenue} night={preview.night} brief={brief} meta={meta[previewVenue.id]}
          onClose={() => setPreview(null)} onSent={() => actions.markSent(previewVenue.id, preview.night)} onCopy={actions.copy}
          onEmail={email => { t.updateMeta(previewVenue.id, { email_override: email }); toast(email ? `Saved ${email} for ${previewVenue.name}` : 'Using the researched address'); }} />
      )}
      {showActivity && (
        <ActivityPanel items={activity} venues={byId} brief={brief} db={t.db} onClose={() => setShowActivity(false)}
          onOpen={id => { setShowActivity(false); setOpenId(id); }} />
      )}
      <div className="toast-stack" aria-live="polite">
        {toasts.map(x => (
          <div key={x.id} className="toast">
            <span>{x.text}</span>
            {x.undo && <button onClick={() => { x.undo!(); setToasts(ts => ts.filter(y => y.id !== x.id)); }}>Undo</button>}
          </div>
        ))}
      </div>
    </>
  );
}
