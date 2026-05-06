import { NextResponse } from 'next/server';
import { ingestGithubTopic } from '@/lib/ingest-github';
import { ingestHn } from '@/lib/ingest-hn';
import { ingestProductHunt } from '@/lib/ingest-producthunt';
import { ingestReddit } from '@/lib/ingest-reddit';
import { ingestYC } from '@/lib/ingest-yc';
import { ingestYcFounders } from '@/lib/ingest-yc-founders';
import { backfillCompanyEmbeddings, embeddingsEnabled } from '@/lib/embeddings';
import { query } from '@/lib/db';
import { scoreCompany } from '@/lib/claude';
import { scoreFounder } from '@/lib/founders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Vercel automatically sends this header on cron invocations.
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
function authorized(req: Request): boolean {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (secret) return auth === `Bearer ${secret}`;
  // No secret set — allow only if coming from Vercel's cron infrastructure.
  // In production Vercel sets x-vercel-signature; locally we allow open.
  return process.env.NODE_ENV !== 'production';
}

const GITHUB_TOPICS = ['ai', 'llm', 'agents', 'fintech', 'security', 'cybersecurity', 'crypto', 'web3', 'health', 'biotech', 'devtools'];
const HN_QUERIES = ['Show HN', 'Launch HN', 'fintech', 'security', 'crypto', 'health'];

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const results: Record<string, number> = {};
  const errors: string[] = [];

  async function safe(label: string, fn: () => Promise<number>) {
    try {
      results[label] = await fn();
    } catch (err) {
      errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 1. Ingest — all sources in parallel (different APIs, no shared rate limit).
  const tasks: Promise<void>[] = [];
  for (const topic of GITHUB_TOPICS) {
    tasks.push(safe(`github:${topic}`, () => ingestGithubTopic(topic)));
  }
  for (const q of HN_QUERIES) {
    tasks.push(safe(`hn:${q}`, () => ingestHn(q)));
  }
  tasks.push(safe('producthunt', () => ingestProductHunt()));
  tasks.push(safe('reddit', () => ingestReddit()));
  tasks.push(safe('yc', () => ingestYC(200)));
  await Promise.all(tasks);
  await safe('yc:founders', () => ingestYcFounders(16));

  // 2. Score unscored companies (up to 5 to stay within budget)
  let scored = 0;
  try {
    interface CompanyRow {
      id: string;
      name: string;
      description: string | null;
      sector: string | null;
      stage: string | null;
      raised_usd: number | null;
      team_size: number | null;
    }
    const unscoredCompanies = await query<CompanyRow>(
      `SELECT id, name, description, sector, stage, raised_usd, team_size
       FROM companies WHERE ai_score IS NULL ORDER BY updated_at DESC LIMIT 5`,
    );
    for (const company of unscoredCompanies) {
      const signals = await query<{ title: string; signal_type: string }>(
        'SELECT title, signal_type FROM signals WHERE company_id = $1 LIMIT 8',
        [company.id],
      );
      const score = await scoreCompany({ ...company, signals });
      await query(
        `UPDATE companies SET ai_score = $1, ai_score_breakdown = $2::jsonb,
           updated_at = EXTRACT(EPOCH FROM NOW())::bigint WHERE id = $3`,
        [score.composite, JSON.stringify(score), company.id],
      );
      scored++;
    }
  } catch (err) {
    errors.push(`score: ${err instanceof Error ? err.message : String(err)}`);
  }

  let foundersScored = 0;
  try {
    interface FounderRow {
      id: string;
      name: string;
      bio: string | null;
      github_login: string | null;
      github_followers: number | null;
      github_public_repos: number | null;
      github_account_age_days: number | null;
      prior_companies: string[] | null;
    }
    const unscoredFounders = await query<FounderRow>(
      `SELECT id, name, bio, github_login, github_followers, github_public_repos,
              github_account_age_days, prior_companies
       FROM founders WHERE ai_score IS NULL ORDER BY updated_at DESC LIMIT 5`,
    );
    for (const founder of unscoredFounders) {
      const related = await query<{ name: string; description: string | null }>(
        `SELECT c.name, c.description
         FROM companies c
         JOIN company_founders cf ON cf.company_id = c.id
         WHERE cf.founder_id = $1
         LIMIT 5`,
        [founder.id],
      );
      const score = await scoreFounder({ ...founder, related_companies: related });
      await query(
        `UPDATE founders SET ai_score = $1, ai_score_breakdown = $2::jsonb,
           updated_at = EXTRACT(EPOCH FROM NOW())::bigint WHERE id = $3`,
        [score.composite, JSON.stringify(score), founder.id],
      );
      foundersScored++;
    }
  } catch (err) {
    errors.push(`founders-score: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Embed new companies
  let embedded = 0;
  if (embeddingsEnabled()) {
    try {
      embedded = await backfillCompanyEmbeddings(128);
    } catch (err) {
      errors.push(`embed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const total = Object.values(results).reduce((a, b) => a + b, 0);
  return NextResponse.json({ ok: true, total, scored, foundersScored, embedded, results, errors });
}
