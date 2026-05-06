import { NextResponse } from 'next/server';
import { one, query } from '@/lib/db';
import { scoreCompany } from '@/lib/claude';

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

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await one<CompanyRow>('SELECT * FROM companies WHERE id = $1', [id]);
  if (!company) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const signals = await query<{ title: string; signal_type: string }>(
    'SELECT title, signal_type FROM signals WHERE company_id = $1 ORDER BY occurred_at DESC LIMIT 8',
    [id],
  );

  try {
    const score = await scoreCompany({ ...company, signals });
    await query(
      `UPDATE companies
         SET ai_score = $1, ai_score_breakdown = $2::jsonb, updated_at = EXTRACT(EPOCH FROM NOW())::bigint
       WHERE id = $3`,
      [score.composite, JSON.stringify(score), id],
    );
    return NextResponse.json({ ok: true, score });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
