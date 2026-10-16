'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import seedJson from '@/data/outreach-seed.json';
import type { AppState, MetaPatch, NightKey, OutreachPatch, OutreachRecord, OutreachSeed, VenueMeta } from './types';

const seed = seedJson as OutreachSeed;

export type Sync = 'loading' | 'synced' | 'saving' | 'local' | 'offline' | 'error';

const LS_KEY = 'nrf-rfp-tracker-v1';
const ACTOR_KEY = 'nrf-rfp-actor';

interface Mirror {
  outreach: Record<string, OutreachRecord>;
  meta: Record<string, VenueMeta>;
  /** Writes the server has not acknowledged yet, keyed like the timers. Replayed on next load. */
  pending: Record<string, { kind: 'outreach' | 'meta'; venue: string; night?: NightKey; patch: Record<string, unknown> }>;
  reset_at: string | null;
  /** Seed files already applied in browser-only mode. */
  seeds?: string[];
}

const emptyMirror = (): Mirror => ({ outreach: {}, meta: {}, pending: {}, reset_at: null, seeds: [] });

function readMirror(): Mirror {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return emptyMirror();
    return { ...emptyMirror(), ...JSON.parse(raw) };
  } catch {
    return emptyMirror();
  }
}

function writeMirror(m: Mirror) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(m));
  } catch { /* storage full or blocked: the server still has it */ }
}

export const okey = (venue: string, night: NightKey) => `${venue}/${night}`;

export function blankRecord(venue: string, night: NightKey): OutreachRecord {
  return { venue_id: venue, night, status: 'not_contacted', fb_minimum: null, all_in: null, fees: null, notes: null, sent_at: null, updated_at: new Date(0).toISOString(), updated_by: null };
}

export function useTracker() {
  const [outreach, setOutreach] = useState<Record<string, OutreachRecord>>({});
  const [meta, setMeta] = useState<Record<string, VenueMeta>>({});
  const [sync, setSync] = useState<Sync>('loading');
  const [db, setDb] = useState<boolean | null>(null);
  const [actor, setActorState] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const mirror = useRef<Mirror>(emptyMirror());
  // One timer per venue/night/field. A shared timer let typing in notes cancel a pending quote save.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inflight = useRef(0);
  const dbRef = useRef<boolean | null>(null);
  const actorRef = useRef('');

  const persist = useCallback(() => writeMirror(mirror.current), []);

  const headers = useCallback((): HeadersInit => ({
    'Content-Type': 'application/json',
    ...(actorRef.current ? { 'X-Actor': encodeURIComponent(actorRef.current) } : {}),
  }), []);

  const send = useCallback(async (pkey: string) => {
    const job = mirror.current.pending[pkey];
    if (!job || !dbRef.current) return;
    inflight.current++;
    setSync('saving');
    try {
      const url = job.kind === 'outreach' ? `/api/outreach/${job.venue}/${job.night}` : `/api/meta/${job.venue}`;
      const res = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(job.patch) });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error || `Save failed (${res.status})`;
        if (res.status >= 400 && res.status < 500) delete mirror.current.pending[pkey]; // Will never succeed; do not replay.
        throw new Error(msg);
      }
      const saved = await res.json();
      // Only clear the job if nothing newer was queued while this one was in flight.
      if (mirror.current.pending[pkey] === job) delete mirror.current.pending[pkey];
      if (job.kind === 'outreach') {
        const k = okey(job.venue, job.night!);
        if (!Object.keys(mirror.current.pending).some(p => p.startsWith(k + '/'))) {
          mirror.current.outreach[k] = saved;
          setOutreach(o => ({ ...o, [k]: saved }));
        }
      } else if (!Object.keys(mirror.current.pending).some(p => p.startsWith(`meta/${job.venue}/`))) {
        mirror.current.meta[job.venue] = saved;
        setMeta(m => ({ ...m, [job.venue]: saved }));
      }
      persist();
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      persist();
      setSync(navigator.onLine ? 'error' : 'offline');
      inflight.current--;
      return;
    }
    inflight.current--;
    if (!inflight.current) setSync(Object.keys(mirror.current.pending).length ? 'saving' : 'synced');
  }, [headers, persist]);

  const schedule = useCallback((pkey: string, delay: number) => {
    const t = timers.current.get(pkey);
    if (t) clearTimeout(t);
    if (!dbRef.current) return;
    timers.current.set(pkey, setTimeout(() => {
      timers.current.delete(pkey);
      void send(pkey);
    }, delay));
  }, [send]);

  const load = useCallback(async (initial: boolean) => {
    let state: AppState;
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not load state');
      state = await res.json();
    } catch (e) {
      if (initial) {
        setOutreach({ ...mirror.current.outreach });
        setMeta({ ...mirror.current.meta });
        setSync(navigator.onLine ? 'error' : 'offline');
        setError((e as Error).message);
      }
      return;
    }
    dbRef.current = state.db;
    setDb(state.db);
    const m = mirror.current;
    if (!state.db) {
      // No database: the browser mirror is the source of truth. Apply the sheet import once here too.
      if (!(m.seeds ?? []).includes(seed.id)) {
        const now = new Date().toISOString();
        for (const r of seed.records) {
          const k = okey(r.venue_id, r.night);
          const base = m.outreach[k] ?? blankRecord(r.venue_id, r.night);
          const notes = !base.notes ? r.notes ?? null : r.notes && !base.notes.includes(r.notes) ? `${base.notes}\n\n${r.notes}` : base.notes;
          m.outreach[k] = { ...base, status: r.status, fb_minimum: r.fb_minimum ?? base.fb_minimum, all_in: r.all_in ?? base.all_in,
            fees: r.fees ?? base.fees, notes, updated_at: now, updated_by: 'Sheet import' };
        }
        m.seeds = [...(m.seeds ?? []), seed.id];
        persist();
      }
      setOutreach({ ...m.outreach });
      setMeta({ ...m.meta });
      setSync('local');
      return;
    }
    // A reset on the server wins over anything this browser recorded before it.
    if (state.reset_at && state.reset_at !== m.reset_at) {
      const cutoff = new Date(state.reset_at).getTime();
      for (const [k, r] of Object.entries(m.outreach)) if (new Date(r.updated_at).getTime() <= cutoff) delete m.outreach[k];
      for (const [k, j] of Object.entries(m.pending)) {
        if (j.kind === 'outreach' && new Date(m.outreach[okey(j.venue, j.night!)]?.updated_at ?? 0).getTime() <= cutoff) delete m.pending[k];
      }
      m.reset_at = state.reset_at;
    }
    const serverO: Record<string, OutreachRecord> = {};
    for (const r of state.outreach) serverO[okey(r.venue_id, r.night)] = r;
    const serverM: Record<string, VenueMeta> = {};
    for (const r of state.meta) serverM[r.venue_id] = r;

    if (initial) {
      // Anything the browser has that the server lost gets pushed back.
      for (const [k, r] of Object.entries(m.outreach)) {
        if (serverO[k]) continue;
        const { status, fb_minimum, all_in, fees, notes, sent_at } = r;
        const pkey = `${k}/restore`;
        if (!Object.keys(m.pending).some(p => p.startsWith(k + '/'))) {
          m.pending[pkey] = { kind: 'outreach', venue: r.venue_id, night: r.night, patch: { status, fb_minimum, all_in, fees, notes, sent_at } };
        }
      }
      for (const [k, r] of Object.entries(m.meta)) {
        if (serverM[k]) continue;
        m.pending[`meta/${k}/restore`] = { kind: 'meta', venue: k, patch: { starred: r.starred, cover_url: r.cover_url, email_override: r.email_override } };
      }
    }
    // Keep local values for anything with a write still pending; take the server for everything else.
    const pendingO = new Set(Object.values(m.pending).filter(j => j.kind === 'outreach').map(j => okey(j.venue, j.night!)));
    const pendingM = new Set(Object.values(m.pending).filter(j => j.kind === 'meta').map(j => j.venue));
    const nextO = { ...serverO };
    for (const k of pendingO) if (m.outreach[k]) nextO[k] = m.outreach[k];
    const nextM = { ...serverM };
    for (const k of pendingM) if (m.meta[k]) nextM[k] = m.meta[k];
    m.outreach = nextO;
    m.meta = nextM;
    persist();
    setOutreach({ ...nextO });
    setMeta({ ...nextM });
    if (initial) for (const pkey of Object.keys(m.pending)) void send(pkey);
    if (!Object.keys(m.pending).length && !inflight.current) setSync('synced');
  }, [persist, send]);

  useEffect(() => {
    mirror.current = readMirror();
    try {
      const a = localStorage.getItem(ACTOR_KEY) || '';
      actorRef.current = a;
      setActorState(a);
    } catch { /* ignore */ }
    void load(true);
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible' && dbRef.current) void load(false);
    }, 20000);
    const onFocus = () => { if (dbRef.current) void load(false); };
    const onOnline = () => { for (const p of Object.keys(mirror.current.pending)) void send(p); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    // Flush debounced saves if the tab is closing.
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      for (const [pkey, t] of timers.current) {
        clearTimeout(t);
        const job = mirror.current.pending[pkey];
        if (!job || !dbRef.current) continue;
        const url = job.kind === 'outreach' ? `/api/outreach/${job.venue}/${job.night}` : `/api/meta/${job.venue}`;
        fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(job.patch), keepalive: true }).catch(() => {});
      }
      timers.current.clear();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(tick);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [load, send, headers]);

  const updateOutreach = useCallback((venue: string, night: NightKey, patch: OutreachPatch, debounceMs = 0) => {
    const k = okey(venue, night);
    const m = mirror.current;
    const base = m.outreach[k] ?? blankRecord(venue, night);
    const next: OutreachRecord = { ...base, ...patch, updated_at: new Date().toISOString(), updated_by: actorRef.current || null };
    m.outreach[k] = next;
    // Merge into one pending job per field so the latest value always wins.
    for (const field of Object.keys(patch)) {
      const pkey = `${k}/${field}`;
      m.pending[pkey] = { kind: 'outreach', venue, night, patch: { [field]: (patch as Record<string, unknown>)[field] } };
      schedule(pkey, debounceMs);
    }
    persist();
    setOutreach(o => ({ ...o, [k]: next }));
    if (dbRef.current) setSync('saving');
  }, [persist, schedule]);

  const updateMeta = useCallback((venue: string, patch: MetaPatch, debounceMs = 0) => {
    const m = mirror.current;
    const base: VenueMeta = m.meta[venue] ?? { venue_id: venue, starred: false, cover_url: null, email_override: null, updated_at: new Date(0).toISOString() };
    const next = { ...base, ...patch, updated_at: new Date().toISOString() };
    m.meta[venue] = next;
    for (const field of Object.keys(patch)) {
      const pkey = `meta/${venue}/${field}`;
      m.pending[pkey] = { kind: 'meta', venue, patch: { [field]: (patch as Record<string, unknown>)[field] } };
      schedule(pkey, debounceMs);
    }
    persist();
    setMeta(x => ({ ...x, [venue]: next }));
    if (dbRef.current) setSync('saving');
  }, [persist, schedule]);

  const reset = useCallback(async (includeShortlist: boolean) => {
    for (const t of timers.current.values()) clearTimeout(t);
    timers.current.clear();
    const m = mirror.current;
    m.pending = {};
    m.outreach = {};
    if (includeShortlist) for (const v of Object.values(m.meta)) v.starred = false;
    if (dbRef.current) {
      const res = await fetch('/api/reset', { method: 'POST', headers: headers(), body: JSON.stringify({ confirm: 'RESET', include_shortlist: includeShortlist }) });
      if (!res.ok) throw new Error('Reset failed');
      const { reset_at } = await res.json();
      m.reset_at = reset_at;
    }
    persist();
    setOutreach({});
    setMeta({ ...m.meta });
    if (dbRef.current) await load(false);
  }, [headers, load, persist]);

  const setActor = useCallback((name: string) => {
    actorRef.current = name;
    setActorState(name);
    try { localStorage.setItem(ACTOR_KEY, name); } catch { /* ignore */ }
  }, []);

  const applyCovers = useCallback((found: Record<string, string>) => {
    const m = mirror.current;
    for (const [venue, url] of Object.entries(found)) {
      const base: VenueMeta = m.meta[venue] ?? { venue_id: venue, starred: false, cover_url: null, email_override: null, updated_at: new Date().toISOString() };
      m.meta[venue] = { ...base, cover_url: url };
    }
    persist();
    setMeta({ ...m.meta });
  }, [persist]);

  return { outreach, meta, sync, db, error, actor, setActor, updateOutreach, updateMeta, reset, reload: () => load(false), applyCovers, headers };
}
