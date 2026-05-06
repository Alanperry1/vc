import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { scoreCompany } from '@/lib/claude';
import { adminGuard } from '@/lib/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface CompanyRow {
  id: string;
  name: string;
  description: string | null;
  sector: string | null;
  stage: string | null;
  raised_usd: number | null;
  team_size: number | null;
}

/**
 * Batch-score the N most recent unscored companies.
 * Bounded so we stay within the 60s function budget.
 *   POST /api/companies/score-batch?limit=8
 */
export async function POST(req: Request) {
  const guard = adminGuard(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 8), 1), 15);

  const companies = await query<CompanyRow>(
    `SELECT id, name, description, sector, stage, raised_usd, team_size
     FROM companies
     WHERE ai_score IS NULL
     ORDER BY updated_at DESC
     LIMIT $1`,
    [limit],
  );

  const scored: { id: string; composite: number }[] = [];
  const errors: string[] = [];

  for (const company of companies) {
    try {
      const signals = await query<{ title: string; signal_type: string }>(
        'SELECT title, signal_type FROM signals WHERE company_id = $1 ORDER BY occurred_at DESC LIMIT 8',
        [company.id],
      );
      const score = await scoreCompany({ ...company, signals });
      await query(
        `UPDATE companies
           SET ai_score = $1, ai_score_breakdown = $2::jsonb,
               updated_at = EXTRACT(EPOCH FROM NOW())::bigint
         WHERE id = $3`,
        [score.composite, JSON.stringify(score), company.id],
      );
      scored.push({ id: company.id, composite: score.composite });
    } catch (err) {
      errors.push(`${company.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ ok: true, scored: scored.length, results: scored, errors });
}
