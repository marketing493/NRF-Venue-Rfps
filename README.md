# NRF 2027 Venue RFPs

An outreach board for two Impact Analytics evenings around NRF 2027 (Javits Center, 10 to 12 January 2027).
41 New York venues, ranked by distance from Javits. One click per venue opens a prefilled Gmail
draft. Status, quotes, notes and the shortlist are stored in Neon Postgres and shared by everyone using the board.

| | |
|---|---|
| **Stack** | Next.js 15 (App Router), React 19, TypeScript |
| **Data** | `data/venues.json` and `data/brief.json`. Outreach state in Neon Postgres, mirrored to `localStorage` |
| **Sending** | No mail leaves the server. "Send RFP" is a real link to a Gmail compose URL |
| **Hosting** | Vercel, with the Neon integration |

## What it does

- **Two nights, judged differently.** Saturday is a standing reception for 40 to 60. Sunday is a seated dinner for 30 to 35.
  Each venue gets a fit verdict per night: `good`, `tight`, `buyout`, `just_under`, `too_small` or `unknown`.
- **Every number shows its basis.** The fit badge names the room it judged and whether the figure was published,
  approximate, or inferred. Exclusive rooms and buyout figures never read as a private-room fit.
- **One-click RFPs.** The email wording is the sender's own, substituted per venue and per night
  (`holds` vs `seats`, the group line, the room). Preview, copy, or open straight in Gmail.
- **Shared tracking.** Status per venue per night (Not contacted, RFP sent, Replied, Quote in, Declined, Booked),
  F&B minimum, all-in estimate with per-guest cost, fees, notes, a shortlist star, and an email override.
- **Views for the CMO.** Cards, a dense list, and a Compare view that lines up shortlisted and quoted venues by all-in cost.
- **Filters** by night, status (including follow-ups due after four days), fit, MICHELIN / James Beard, contact method,
  walking distance and shortlist. Sorting by distance, fit, size, recognition, progress or quote.
- **Activity feed**, CSV/JSON export, print stylesheet, optional shared password.

## Deploy to Vercel with Neon

1. **Import the repo** at [vercel.com/new](https://vercel.com/new). Framework preset: Next.js. No build settings to change.
2. **Add Neon.** In the Vercel project, open **Storage → Create Database → Neon** (or **Marketplace → Neon**),
   and connect it to the project for all environments. This sets `DATABASE_URL` automatically.
   If you already have a Neon project, add its pooled connection string as `DATABASE_URL` under
   **Settings → Environment Variables** instead.
3. **Optional password.** Add `APP_PASSWORD` to require a shared password (any username) before anyone sees the board.
4. **Redeploy** so the variables take effect.

Tables are created automatically on the first request. There is no migration step.
The top bar shows **Saved to Neon** when the database is connected, or **This browser only** when it is not.

**Venue photos load themselves.** The first time anyone opens the board after a deploy, the server reads each venue's photo
from its own website (Open Graph, Twitter card or JSON-LD image), falling back to a known listing page, checks the image actually
loads, and saves the URL in Neon so everyone sees the same covers. It runs at most once every six hours. Images are relayed through
`/api/img/:venue` so hotlink-blocking and http-only venue sites still display. **Photos** in the top bar fills any gaps (or refreshes
all of them), **Find photo** in a venue's drawer retries one venue, and any cover can be pasted by hand.

## Local development

```bash
npm install
cp .env.example .env.local   # add a Neon DATABASE_URL, or leave it out to run in browser-only mode
npm run dev
npm test                      # fit calculation, email wording and Gmail URL
```

## API

| Route | Does |
|---|---|
| `GET /api/state` | Every outreach record and venue meta row |
| `POST /api/outreach/:venue/:night` | Field-level patch of status, `fb_minimum`, `all_in`, `fees`, `notes`, `sent_at` |
| `POST /api/meta/:venue` | Star, cover image URL, email override |
| `GET /api/draft/:venue/:night` | Prefilled subject, body and Gmail URL |
| `POST /api/covers` | Fetch venue photos (`{}` missing only, `{"force":true}` all, `{"venue":id}` one) and save them in Neon |
| `GET /api/img/:venue` | The venue's saved photo, relayed and cached for a day |
| `POST /api/reset` | Clear outreach (`{"confirm":"RESET"}`) |
| `GET /api/activity` | Latest 80 changes |
| `GET /api/export?format=csv\|json` | The whole tracker |

## Editing the data

- **The brief** (dates, headcounts, timing, sender) lives in `data/brief.json`. Change it there and every badge and email follows.
- **Venues** live in `data/venues.json`. Each room has `seated`, `standing`, `approximate`, `single_figure` and `exclusive`.
  Keep private-room figures and buyout figures separate. Record the source and the date you checked.
- **Bulk status updates** go in `data/outreach-seed.json`. Give the file a new `id` and deploy: on the next page load the
  server applies it once (status and prices overwrite, notes are appended), logs it in Activity, and never applies that `id` again.
  A room or buyout marked `"confirmed": true` came from the venue itself and overrides research in the fit badge.
- **The email wording** is in `lib/mailer.ts`. `tests/fit.test.ts` holds the expected text, so any change is deliberate.

## Known limits

- Capacities come from search-indexed venue pages checked September 2026. Nothing is confirmed until a venue replies.
- Gmail may append the sending account's signature after the sign-off. Turn it off in Gmail or remove the sign-off in `lib/mailer.ts`.
- Venues marked "Events form" have no public events address. Use Preview to copy the RFP into their form,
  or set an email override once a planner replies.
