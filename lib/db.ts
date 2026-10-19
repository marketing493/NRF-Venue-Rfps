import { neon, neonConfig, type NeonQueryFunction } from '@neondatabase/serverless';
import seedJson from '@/data/outreach-seed.json';
import type { ActivityItem, AppState, MetaPatch, NightKey, OutreachPatch, OutreachRecord, OutreachSeed, SeedFile, VenueMeta } from './types';

const seeds = (seedJson as SeedFile).seeds;

let client: NeonQueryFunction<false, false> | null = null;
let schemaReady: Promise<void> | null = null;
let seeded: Promise<void> | null = null;

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function sql() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  if (!client) {
    // Local development only: route queries to a Neon-compatible HTTP proxy in front of plain Postgres.
    if (process.env.NEON_FETCH_ENDPOINT) neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;
    client = neon(process.env.DATABASE_URL);
  }
  return client;
}

/**
 * Assert the schema before any query. Every statement is idempotent, so a
 * dropped table on a live database heals on the next request instead of 500ing.
 * The promise is cleared on failure so a transient error does not stick.
 */
export async function ensureSchema(force = false): Promise<void> {
  if (schemaReady && !force) return schemaReady;
  const q = sql();
  schemaReady = (async () => {
    await q`CREATE TABLE IF NOT EXISTS outreach (
      venue_id    text        NOT NULL,
      night       text        NOT NULL CHECK (night IN ('sat','sun')),
      status      text        NOT NULL DEFAULT 'not_contacted',
      fb_minimum  numeric,
      all_in      numeric,
      fees        text,
      notes       text,
      sent_at     timestamptz,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  text,
      PRIMARY KEY (venue_id, night)
    )`;
    await q`CREATE TABLE IF NOT EXISTS venue_meta (
      venue_id       text PRIMARY KEY,
      starred        boolean     NOT NULL DEFAULT false,
      cover_url      text,
      email_override text,
      updated_at     timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE TABLE IF NOT EXISTS activity (
      id       bigserial PRIMARY KEY,
      venue_id text NOT NULL,
      night    text,
      action   text NOT NULL,
      detail   text,
      actor    text,
      at       timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE INDEX IF NOT EXISTS activity_at_idx ON activity (at DESC)`;
    await q`CREATE TABLE IF NOT EXISTS app_settings (key text PRIMARY KEY, value text)`;
    // The photo bytes themselves, so a cover survives the venue changing or deleting its image.
    await q`CREATE TABLE IF NOT EXISTS venue_photos (
      venue_id     text PRIMARY KEY,
      content_type text NOT NULL,
      data         text NOT NULL,
      bytes        integer NOT NULL,
      source_url   text,
      updated_at   timestamptz NOT NULL DEFAULT now()
    )`;
  })().catch(err => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

/** Run a query; if a table vanished underneath us, rebuild the schema once and retry. */
async function withSchema<T>(fn: (q: NeonQueryFunction<false, false>) => Promise<T>): Promise<T> {
  await ensureSchema();
  try {
    return await fn(sql());
  } catch (err) {
    if (/relation .* does not exist/i.test(String((err as Error)?.message))) {
      seeded = null; // The database was wiped underneath us; let the import check run again.
      await ensureSchema(true);
      return fn(sql());
    }
    throw err;
  }
}

const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());
const num = (v: unknown) => (v == null ? null : Number(v));

function toOutreach(r: Record<string, unknown>): OutreachRecord {
  return {
    venue_id: r.venue_id as string,
    night: r.night as NightKey,
    status: r.status as OutreachRecord['status'],
    fb_minimum: num(r.fb_minimum),
    all_in: num(r.all_in),
    fees: (r.fees as string) ?? null,
    notes: (r.notes as string) ?? null,
    sent_at: iso(r.sent_at),
    updated_at: iso(r.updated_at)!,
    updated_by: (r.updated_by as string) ?? null,
  };
}

function toMeta(r: Record<string, unknown>): VenueMeta {
  return {
    venue_id: r.venue_id as string,
    starred: Boolean(r.starred),
    cover_url: (r.cover_url as string) ?? null,
    email_override: (r.email_override as string) ?? null,
    updated_at: iso(r.updated_at)!,
  };
}

/**
 * Apply each sheet in data/outreach-seed.json once per database, oldest first. The claim
 * row is written first, so concurrent cold starts cannot apply a sheet twice. Status and
 * prices take the sheet's values; notes are appended so nothing typed on the board is lost.
 */
async function applySeed(): Promise<void> {
  if (!seeded) {
    seeded = (async () => {
      for (const seed of seeds) if (seed.records.length) await applyOneSeed(seed);
    })().catch(err => {
      seeded = null;
      throw err;
    });
  }
  return seeded;
}

async function applyOneSeed(seed: OutreachSeed): Promise<void> {
  const q = sql();
  const key = `seed:${seed.id}`;
  const claim = await q`INSERT INTO app_settings (key, value) VALUES (${key}, ${new Date().toISOString()})
                        ON CONFLICT (key) DO NOTHING RETURNING key`;
  if (!claim.length) return;
  try {
    for (const r of seed.records) {
      const patch: OutreachPatch = r.status ? { status: r.status } : {};
      if (r.fb_minimum != null) patch.fb_minimum = r.fb_minimum;
      if (r.all_in != null) patch.all_in = r.all_in;
      if (r.fees != null) patch.fees = r.fees;
      await patchOutreach(r.venue_id, r.night, patch, 'Sheet import');
      if (r.notes) {
        await q`UPDATE outreach SET notes = CASE
                  WHEN notes IS NULL OR notes = '' THEN ${r.notes}
                  WHEN position(${r.notes} in notes) > 0 THEN notes
                  ELSE notes || E'\n\n' || ${r.notes} END
                WHERE venue_id = ${r.venue_id} AND night = ${r.night}`;
      }
    }
    await q`INSERT INTO activity (venue_id, night, action, detail, actor)
            VALUES ('*', NULL, 'import', ${`Imported ${seed.records.length} statuses from ${seed.source}`}, 'Sheet import')`;
  } catch (err) {
    await q`DELETE FROM app_settings WHERE key = ${key}`;
    throw err;
  }
}

export async function getState(): Promise<AppState> {
  await ensureSchema();
  await applySeed();
  return withSchema(async q => {
    const [outreach, meta, reset] = await Promise.all([
      q`SELECT * FROM outreach`,
      q`SELECT * FROM venue_meta`,
      q`SELECT value FROM app_settings WHERE key = 'reset_at'`,
    ]);
    return {
      db: true,
      reset_at: (reset[0]?.value as string) ?? null,
      outreach: outreach.map(toOutreach),
      meta: meta.map(toMeta),
    };
  });
}

/**
 * Field-level upsert: only keys present in the patch change, so two people
 * editing different fields of the same venue never overwrite each other.
 */
export async function patchOutreach(venueId: string, night: NightKey, patch: OutreachPatch, actor: string | null): Promise<OutreachRecord> {
  const p = JSON.stringify(patch);
  return withSchema(async q => {
    const rows = await q`
      INSERT INTO outreach AS o (venue_id, night, status, fb_minimum, all_in, fees, notes, sent_at, updated_at, updated_by)
      VALUES (
        ${venueId}, ${night},
        COALESCE(${p}::jsonb->>'status', 'not_contacted'),
        (${p}::jsonb->>'fb_minimum')::numeric,
        (${p}::jsonb->>'all_in')::numeric,
        ${p}::jsonb->>'fees',
        ${p}::jsonb->>'notes',
        (${p}::jsonb->>'sent_at')::timestamptz,
        now(), ${actor}
      )
      ON CONFLICT (venue_id, night) DO UPDATE SET
        status     = CASE WHEN ${p}::jsonb ? 'status'     THEN EXCLUDED.status     ELSE o.status     END,
        fb_minimum = CASE WHEN ${p}::jsonb ? 'fb_minimum' THEN EXCLUDED.fb_minimum ELSE o.fb_minimum END,
        all_in     = CASE WHEN ${p}::jsonb ? 'all_in'     THEN EXCLUDED.all_in     ELSE o.all_in     END,
        fees       = CASE WHEN ${p}::jsonb ? 'fees'       THEN EXCLUDED.fees       ELSE o.fees       END,
        notes      = CASE WHEN ${p}::jsonb ? 'notes'      THEN EXCLUDED.notes      ELSE o.notes      END,
        sent_at    = CASE WHEN ${p}::jsonb ? 'sent_at'    THEN EXCLUDED.sent_at    ELSE o.sent_at    END,
        updated_at = now(),
        updated_by = COALESCE(EXCLUDED.updated_by, o.updated_by)
      RETURNING *`;
    return toOutreach(rows[0]);
  });
}

export async function patchMeta(venueId: string, patch: MetaPatch): Promise<VenueMeta> {
  const p = JSON.stringify(patch);
  return withSchema(async q => {
    const rows = await q`
      INSERT INTO venue_meta AS m (venue_id, starred, cover_url, email_override, updated_at)
      VALUES (
        ${venueId},
        COALESCE((${p}::jsonb->>'starred')::boolean, false),
        ${p}::jsonb->>'cover_url',
        ${p}::jsonb->>'email_override',
        now()
      )
      ON CONFLICT (venue_id) DO UPDATE SET
        starred        = CASE WHEN ${p}::jsonb ? 'starred'        THEN EXCLUDED.starred        ELSE m.starred        END,
        cover_url      = CASE WHEN ${p}::jsonb ? 'cover_url'      THEN EXCLUDED.cover_url      ELSE m.cover_url      END,
        email_override = CASE WHEN ${p}::jsonb ? 'email_override' THEN EXCLUDED.email_override ELSE m.email_override END,
        updated_at     = now()
      RETURNING *`;
    return toMeta(rows[0]);
  });
}

export interface StoredPhoto { content_type: string; data: Buffer; source_url: string | null }

export async function getPhoto(venueId: string): Promise<StoredPhoto | null> {
  return withSchema(async q => {
    const rows = await q`SELECT content_type, data, source_url FROM venue_photos WHERE venue_id = ${venueId}`;
    if (!rows[0]) return null;
    return { content_type: rows[0].content_type as string, data: Buffer.from(rows[0].data as string, 'base64'), source_url: (rows[0].source_url as string) ?? null };
  });
}

/** Which venues already have their current cover saved, keyed by venue id → source URL. */
export async function getPhotoSources(): Promise<Map<string, string | null>> {
  return withSchema(async q => {
    const rows = await q`SELECT venue_id, source_url FROM venue_photos`;
    return new Map(rows.map(r => [r.venue_id as string, (r.source_url as string) ?? null]));
  });
}

export async function savePhoto(venueId: string, contentType: string, data: Uint8Array, sourceUrl: string | null): Promise<void> {
  const b64 = Buffer.from(data).toString('base64');
  await withSchema(q => q`
    INSERT INTO venue_photos (venue_id, content_type, data, bytes, source_url, updated_at)
    VALUES (${venueId}, ${contentType}, ${b64}, ${data.byteLength}, ${sourceUrl}, now())
    ON CONFLICT (venue_id) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data,
      bytes = EXCLUDED.bytes, source_url = EXCLUDED.source_url, updated_at = now()`);
}

export async function getCoverUrl(venueId: string): Promise<string | null> {
  return withSchema(async q => {
    const rows = await q`SELECT cover_url FROM venue_meta WHERE venue_id = ${venueId}`;
    return (rows[0]?.cover_url as string) ?? null;
  });
}

/**
 * Claim a named job so only one server instance runs it per window.
 * Returns false when someone else ran it within the given number of minutes.
 */
export async function claimJob(name: string, minutes: number): Promise<boolean> {
  return withSchema(async q => {
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
    const rows = await q`INSERT INTO app_settings (key, value) VALUES (${'job:' + name}, ${now})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      WHERE app_settings.value < ${cutoff}
      RETURNING key`;
    return rows.length > 0;
  });
}

export async function logActivity(venueId: string, night: NightKey | null, action: string, detail: string | null, actor: string | null) {
  await withSchema(q => q`INSERT INTO activity (venue_id, night, action, detail, actor) VALUES (${venueId}, ${night}, ${action}, ${detail}, ${actor})`);
}

export async function getActivity(limit = 60): Promise<ActivityItem[]> {
  return withSchema(async q => {
    const rows = await q`SELECT * FROM activity ORDER BY at DESC LIMIT ${limit}`;
    return rows.map(r => ({
      id: Number(r.id),
      venue_id: r.venue_id as string,
      night: (r.night as NightKey) ?? null,
      action: r.action as string,
      detail: (r.detail as string) ?? null,
      actor: (r.actor as string) ?? null,
      at: iso(r.at)!,
    }));
  });
}

/** Back to not contacted. Stars, covers and email overrides survive unless asked. */
export async function resetOutreach(includeMeta: boolean, actor: string | null): Promise<string> {
  return withSchema(async q => {
    const now = new Date().toISOString();
    await q`DELETE FROM outreach`;
    if (includeMeta) await q`UPDATE venue_meta SET starred = false, updated_at = now()`;
    await q`INSERT INTO app_settings (key, value) VALUES ('reset_at', ${now})
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    await q`INSERT INTO activity (venue_id, night, action, detail, actor) VALUES ('*', NULL, 'reset', ${includeMeta ? 'Outreach and shortlist cleared' : 'Outreach cleared'}, ${actor})`;
    return now;
  });
}
