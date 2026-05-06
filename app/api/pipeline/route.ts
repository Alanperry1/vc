import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAGES = ['sourced', 'contacted', 'diligence', 'term_sheet', 'closed', 'passed'];

export async function GET() {
  const rows = await query<{ stage: string }>(
    `SELECT d.*, c.name AS company_name, c.sector, c.ai_score, c.logo_url, c.homepage
     FROM pipeline_deals d
     JOIN companies c ON c.id = d.company_id
     ORDER BY d.stage, d.position, d.updated_at DESC`,
  );
  const grouped: Record<string, unknown[]> = Object.fromEntries(STAGES.map((s) => [s, []]));
  for (const row of rows) if (grouped[row.stage]) grouped[row.stage].push(row);
  return NextResponse.json({ stages: STAGES, deals: grouped });
}
