'use client';

import { useEffect, useState } from 'react';
import type { Venue } from '@/lib/types';
import { initials, tone } from '@/lib/ui';

/** Venue photo from its own Open Graph tag, or a branded placeholder that never breaks. */
export function CoverArt({ venue, url }: { venue: Venue; url: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (url && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={`${venue.name}, ${venue.area}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  }
  return (
    <div className="gen" data-tone={tone(venue)} aria-hidden="true">
      <div className="mono">{initials(venue.name)}</div>
    </div>
  );
}
