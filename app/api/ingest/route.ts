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
import { adminGuard } from '@/lib/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GITHUB_TOPICS = ['ai', 'llm', 'agents', 'fintech', 'security', 'cybersecurity', 'crypto', 'web3', 'health', 'biotech', 'devtools'];
const HN_QUERIES = ['Show HN', 'Launch HN', 'Ask HN raise', 'fintech', 'security', 'crypto', 'health'];

export async function POST(req: Request) {
  const guard = adminGuard(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const sourceFilter = url.searchParams.get('source'); // 'github' | 'hn' | 'producthunt' | 'reddit' | null

  const results: Record<string, number> = {};
  const errors: string[] = [];

  async function safe(label: string, fn: () => Promise<number>) {
    try {
      results[label] = await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${label}: ${msg}`);
    }
  }

  // Run all sources in parallel — they hit different APIs so there's no shared rate-limit.
  // Wrapped in safe() so one failure doesn't kill the rest.
  const tasks: Promise<void>[] = [];
  if (!sourceFilter || sourceFilter === 'github') {
    for (const topic of GITHUB_TOPICS) {
      tasks.push(safe(`github:${topic}`, () => ingestGithubTopic(topic)));
    }
  }
  if (!sourceFilter || sourceFilter === 'hn') {
    for (const q of HN_QUERIES) {
      tasks.push(safe(`hn:${q}`, () => ingestHn(q)));
    }
  }
  if (!sourceFilter || sourceFilter === 'producthunt') {
    tasks.push(safe('producthunt', () => ingestProductHunt()));
  }
  if (!sourceFilter || sourceFilter === 'reddit') {
    tasks.push(safe('reddit', () => ingestReddit()));
  }
  if (!sourceFilter || sourceFilter === 'yc') {
    tasks.push(safe('yc', () => ingestYC(200)));
  }
  await Promise.all(tasks);

  if (!sourceFilter || sourceFilter === 'yc') {
    await safe('yc:founders', () => ingestYcFounders(16));
  }

  const total = Object.values(results).reduce((a, b) => a + b, 0);

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
       FROM companies WHERE ai_score IS NULL ORDER BY updated_at DESC LIMIT 12`,
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
       FROM founders WHERE ai_score IS NULL ORDER BY updated_at DESC LIMIT 8`,
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

  // Embed the freshest unembedded companies so semantic search stays warm.
  // Bounded so the request stays inside the 60s function budget.
  let embedded = 0;
  if (embeddingsEnabled()) {
    try {
      embedded = await backfillCompanyEmbeddings(128);
    } catch (err) {
      errors.push(`embed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ ok: true, total, scored, foundersScored, embedded, results, errors });
}
