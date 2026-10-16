'use client';

import { useEffect, useState } from 'react';
import type { Venue } from '@/lib/types';
import { initials, tone } from '@/lib/ui';

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/**
 * Venue photo, or a branded placeholder that never breaks.
 * Tries our image relay first (beats hotlink blocking and http-only images), then the
 * original URL, then the placeholder.
 */
export function CoverArt({ venue, url }: { venue: Venue; url: string | null | undefined }) {
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [url]);
  const sources = url ? [`/api/img/${venue.id}?v=${hash(url)}`, url] : [];
  const src = sources[attempt];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img key={src} src={src} alt={`${venue.name}, ${venue.area}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setAttempt(a => a + 1)} />;
  }
  return (
    <div className="gen" data-tone={tone(venue)} aria-hidden="true">
      <div className="mono">{initials(venue.name)}</div>
    </div>
  );
}
