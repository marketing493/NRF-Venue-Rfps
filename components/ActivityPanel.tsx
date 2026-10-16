'use client';

import { useEffect } from 'react';
import type { ActivityItem, Brief, Venue } from '@/lib/types';
import { relTime } from '@/lib/ui';
import { IX } from './Icons';

export function ActivityPanel({ items, venues, brief, db, onClose, onOpen }: {
  items: ActivityItem[]; venues: Map<string, Venue>; brief: Brief; db: boolean | null; onClose: () => void; onOpen: (id: string) => void;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Activity">
        <div className="d-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8 }}>
          <h2 style={{ fontSize: 34 }}>Activity</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><IX /></button>
        </div>
        <section className="d-sec">
          {!db ? <p>Activity is recorded once the board is connected to Neon.</p>
            : !items.length ? <p>Nothing yet. Every RFP sent, reply, quote and shortlist change will show here.</p>
              : (
                <ul className="timeline">
                  {items.map(a => {
                    const v = venues.get(a.venue_id);
                    return (
                      <li key={a.id}>
                        <time>{relTime(a.at)}</time>
                        <span>
                          {v ? <a href="#" onClick={e => { e.preventDefault(); onOpen(v.id); }}>{v.name}</a> : null}
                          {v ? ': ' : ''}{a.detail}{a.night ? ` · ${brief.nights[a.night].label}` : ''}
                          {a.actor && <span className="muted" style={{ color: 'var(--ink-3)' }}> · {a.actor}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
        </section>
      </aside>
    </>
  );
}
