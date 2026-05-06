import { query } from './db';
import { nowSec, slugify, uid } from './util';

// Embeddings are intentionally NOT triggered per-upsert. Voyage's free tier is
// 3 RPM, so spamming one call per company gets us 429'd. Batched embedding is
// done by the ingest endpoint and the 6h cron via backfillCompanyEmbeddings(),
// which packs many companies into a single API call.

export interface UpsertCompanyInput {
  name: string;
  domain?: string | null;
  description?: string | null;
  sector?: string | null;
  stage?: string | null;
  location?: string | null;
  founded_year?: number | null;
  homepage?: string | null;
  github_url?: string | null;
  hn_url?: string | null;
  logo_url?: string | null;
  raised_usd?: number | null;
  team_size?: number | null;
  momentum_score?: number | null;
  source: string;
}

// Fire-and-forget embedding after every upsert; never throws.
function autoEmbed(_id: string): void {
  // intentional no-op — see top-of-file note about Voyage rate limits.
}

/**
 * Idempotent upsert keyed on (domain || github_url).
 * Returns the resolved company id and whether it was newly created.
 */
export async function upsertCompany(
  input: UpsertCompanyInput,
): Promise<{ id: string; created: boolean }> {
  const ts = nowSec();

  let existing: { id: string } | undefined;
  if (input.domain) {
    const rows = await query<{ id: string }>(
      'SELECT id FROM companies WHERE domain = $1 LIMIT 1',
      [input.domain],
    );
    existing = rows[0];
  }
  if (!existing && input.github_url) {
    const rows = await query<{ id: string }>(
      'SELECT id FROM companies WHERE github_url = $1 LIMIT 1',
      [input.github_url],
    );
    existing = rows[0];
  }

  if (existing) {
    await query(
      `UPDATE companies SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         sector = COALESCE($3, sector),
         stage = COALESCE($4, stage),
         location = COALESCE($5, location),
         founded_year = COALESCE($6, founded_year),
         homepage = COALESCE($7, homepage),
         github_url = COALESCE($8, github_url),
         hn_url = COALESCE($9, hn_url),
         logo_url = COALESCE($10, logo_url),
         raised_usd = COALESCE($11, raised_usd),
         team_size = COALESCE($12, team_size),
         momentum_score = COALESCE($13, momentum_score),
         updated_at = $14
       WHERE id = $15`,
      [
        input.name ?? null,
        input.description ?? null,
        input.sector ?? null,
        input.stage ?? null,
        input.location ?? null,
        input.founded_year ?? null,
        input.homepage ?? null,
        input.github_url ?? null,
        input.hn_url ?? null,
        input.logo_url ?? null,
        input.raised_usd ?? null,
        input.team_size ?? null,
        input.momentum_score ?? null,
        ts,
        existing.id,
      ],
    );
    autoEmbed(existing.id);
    return { id: existing.id, created: false };
  }

  const id = `co_${slugify(input.name) || uid()}`;
  await query(
    `INSERT INTO companies
       (id, name, domain, description, sector, stage, location, founded_year,
        homepage, github_url, hn_url, logo_url, raised_usd, team_size,
        momentum_score, source, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      input.name,
      input.domain ?? null,
      input.description ?? null,
      input.sector ?? null,
      input.stage ?? null,
      input.location ?? null,
      input.founded_year ?? null,
      input.homepage ?? null,
      input.github_url ?? null,
      input.hn_url ?? null,
      input.logo_url ?? null,
      input.raised_usd ?? null,
      input.team_size ?? null,
      input.momentum_score ?? null,
      input.source,
      ts,
      ts,
    ],
  );

  await query(
    `INSERT INTO pipeline_deals (id, company_id, stage, position)
     VALUES ($1, $2, 'sourced', 0)
     ON CONFLICT (id) DO NOTHING`,
    [`deal_${id}`, id],
  );

  autoEmbed(id);
  return { id, created: true };
}

export async function insertSignal(s: {
  company_id: string;
  source: string;
  signal_type: string;
  title: string;
  url?: string | null;
  payload?: unknown;
  weight?: number;
  occurred_at: number;
}): Promise<void> {
  await query(
    `INSERT INTO signals (id, company_id, source, signal_type, title, url, payload, weight, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      uid('sig'),
      s.company_id,
      s.source,
      s.signal_type,
      s.title,
      s.url ?? null,
      s.payload ? JSON.stringify(s.payload) : null,
      s.weight ?? 1,
      s.occurred_at,
    ],
  );
}

export interface UpsertFounderInput {
  name: string;
  github_login?: string | null;
  twitter?: string | null;
  linkedin?: string | null;
  bio?: string | null;
  location?: string | null;
  avatar_url?: string | null;
  github_followers?: number | null;
  github_public_repos?: number | null;
  github_account_age_days?: number | null;
  source: string;
}

export async function upsertFounder(input: UpsertFounderInput): Promise<{ id: string; created: boolean }> {
  const ts = nowSec();
  const lookups: Array<[string, string | null | undefined]> = [
    ['github_login', input.github_login],
    ['linkedin', input.linkedin],
    ['twitter', input.twitter],
  ];

  for (const [field, value] of lookups) {
    if (!value) continue;
    const rows = await query<{ id: string }>(
      `SELECT id FROM founders WHERE ${field} = $1 LIMIT 1`,
      [value],
    );
    if (!rows[0]) continue;
    await query(
      `UPDATE founders SET
          name = COALESCE($1, name),
          bio = COALESCE($2, bio),
          location = COALESCE($3, location),
          avatar_url = COALESCE($4, avatar_url),
          github_followers = COALESCE($5, github_followers),
          github_public_repos = COALESCE($6, github_public_repos),
          github_account_age_days = COALESCE($7, github_account_age_days),
          twitter = COALESCE($8, twitter),
          linkedin = COALESCE($9, linkedin),
          github_login = COALESCE($10, github_login),
          updated_at = $11
       WHERE id = $12`,
      [
        input.name ?? null,
        input.bio ?? null,
        input.location ?? null,
        input.avatar_url ?? null,
        input.github_followers ?? null,
        input.github_public_repos ?? null,
        input.github_account_age_days ?? null,
        input.twitter ?? null,
        input.linkedin ?? null,
        input.github_login ?? null,
        ts,
        rows[0].id,
      ],
    );
    return { id: rows[0].id, created: false };
  }
  const id = `fdr_${slugify(input.name) || uid()}`;
  await query(
    `INSERT INTO founders
       (id, name, github_login, twitter, linkedin, bio, location, avatar_url,
        github_followers, github_public_repos, github_account_age_days, source,
        created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      input.name,
      input.github_login ?? null,
      input.twitter ?? null,
      input.linkedin ?? null,
      input.bio ?? null,
      input.location ?? null,
      input.avatar_url ?? null,
      input.github_followers ?? null,
      input.github_public_repos ?? null,
      input.github_account_age_days ?? null,
      input.source,
      ts,
      ts,
    ],
  );
  return { id, created: true };
}

export async function linkFounder(companyId: string, founderId: string, role?: string): Promise<void> {
  await query(
    `INSERT INTO company_founders (company_id, founder_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (company_id, founder_id) DO NOTHING`,
    [companyId, founderId, role ?? null],
  );
}
