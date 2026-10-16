import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { findCover, pickImages, safeImageUrl } from '../lib/covers.ts';
import type { Venue } from '../lib/types.ts';

test('pickImages prefers og:image and pushes logos last', () => {
  const html = `<head>
    <meta property="og:image" content="/assets/logo-white.png">
    <meta name="twitter:image" content="https://cdn.example.com/dining-room.jpg?w=1200&amp;h=630">
    <script type="application/ld+json">{"@type":"Restaurant","image":["https://cdn.example.com/bar.jpg"]}</script>
  </head>`;
  assert.deepEqual(pickImages(html, 'https://venue.example.com/'), [
    'https://cdn.example.com/dining-room.jpg?w=1200&h=630',
    'https://cdn.example.com/bar.jpg',
    'https://venue.example.com/assets/logo-white.png',
  ]);
});

test('safeImageUrl refuses internal hosts', () => {
  assert.equal(safeImageUrl('http://localhost/x.jpg'), null);
  assert.equal(safeImageUrl('http://169.254.169.254/latest'), null);
  assert.equal(safeImageUrl('file:///etc/passwd'), null);
  assert.ok(safeImageUrl('https://images.squarespace-cdn.com/a.jpg'));
});

test('findCover skips a dead image and falls through to the next page', async () => {
  const srv = createServer((req, res) => {
    if (req.url === '/site') { res.end('<meta property="og:image" content="/missing.jpg">'); return; }
    if (req.url === '/listing') { res.end('<meta property="og:image" content="/room.jpg">'); return; }
    if (req.url === '/room.jpg') { res.writeHead(200, { 'content-type': 'image/jpeg' }); res.end('jpg'); return; }
    res.writeHead(404); res.end();
  });
  await new Promise<void>(r => srv.listen(0, r));
  const port = (srv.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const v = { id: 'x', website: `${base}/site`, photo_pages: [`${base}/listing`] } as Venue;
  try {
    assert.equal(await findCover(v), `${base}/room.jpg`);
  } finally {
    srv.close();
  }
});

test('Closed venues are flagged with a source', () => {
  const all: Venue[] = JSON.parse(readFileSync(new URL('../data/venues.json', import.meta.url), 'utf8')).venues;
  const closed = all.filter(v => v.closed);
  assert.deepEqual(closed.map(v => v.id), ['trattoria-one-fifth']);
  assert.match(closed[0].closed!.source, /^https:\/\//);
});
