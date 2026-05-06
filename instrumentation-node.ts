// Split out so pg + ingest libs are only required when we're certain
// we're on the Node.js runtime. Importing them at module scope in
// instrumentation.ts would pull them into the edge bundle.

import { query } from './lib/db';
import { SCHEMA_SQL } from './lib/schema';

export async function bootstrap(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn('[bootstrap] DATABASE_URL not set — skipping auto-migrate/ingest');
    return;
  }

  // 1. Migrate (idempotent)
  try {
    await query(SCHEMA_SQL);
    console.log('[bootstrap] schema ready');
  } catch (err) {
    console.warn(
      '[bootstrap] migrate failed:',
      err instanceof Error ? err.message : String(err),
    );
    return;
  }

  // 2. First-time ingest only — skip if we already have data.
  const rows = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM companies');
  const count = Number(rows[0]?.count ?? '0');
  if (count > 0) {
    console.log(`[bootstrap] ${count} companies already indexed — skipping initial ingest`);
    return;
  }

  if (!process.env.GITHUB_TOKEN) {
    console.warn('[bootstrap] GITHUB_TOKEN not set — skipping initial ingest');
    return;
  }

  console.log('[bootstrap] empty database — running initial ingest…');
  const { ingestGithubTopic } = await import('./lib/ingest-github');
  const { ingestHn } = await import('./lib/ingest-hn');
  const { ingestProductHunt } = await import('./lib/ingest-producthunt');
  const { ingestReddit } = await import('./lib/ingest-reddit');
  const { ingestYC } = await import('./lib/ingest-yc');

  let total = 0;
  for (const topic of ['ai', 'llm', 'agents']) {
    try {
      total += await ingestGithubTopic(topic);
    } catch (err) {
      console.warn(`[bootstrap] github:${topic} failed:`, err instanceof Error ? err.message : err);
    }
  }
  for (const q of ['Show HN', 'Launch HN']) {
    try {
      total += await ingestHn(q);
    } catch (err) {
      console.warn(`[bootstrap] hn:${q} failed:`, err instanceof Error ? err.message : err);
    }
  }
  try { total += await ingestProductHunt(); } catch (err) {
    console.warn('[bootstrap] producthunt failed:', err instanceof Error ? err.message : err);
  }
  try { total += await ingestReddit(); } catch (err) {
    console.warn('[bootstrap] reddit failed:', err instanceof Error ? err.message : err);
  }
  try { total += await ingestYC(); } catch (err) {
    console.warn('[bootstrap] yc failed:', err instanceof Error ? err.message : err);
  }
  console.log(`[bootstrap] initial ingest complete — ${total} new rows`);
}
