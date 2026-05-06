import { NextResponse } from 'next/server';
import { one, query } from '@/lib/db';
import { scoreFounder } from '@/lib/founders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const founder = await one<FounderRow>('SELECT * FROM founders WHERE id = $1', [id]);
  if (!founder) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const related = await query<{ name: string; description: string | null }>(
    `SELECT c.name, c.description
     FROM companies c
     JOIN company_founders cf ON cf.company_id = c.id
     WHERE cf.founder_id = $1
     LIMIT 5`,
    [id],
  );

  try {
    const score = await scoreFounder({ ...founder, related_companies: related });
    await query(
      `UPDATE founders
         SET ai_score = $1, ai_score_breakdown = $2::jsonb,
             updated_at = EXTRACT(EPOCH FROM NOW())::bigint
       WHERE id = $3`,
      [score.composite, JSON.stringify(score), id],
    );
    return NextResponse.json({ ok: true, score });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
