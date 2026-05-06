import { NextResponse } from 'next/server';
import { one, query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const founder = await one('SELECT * FROM founders WHERE id = $1', [id]);
  if (!founder) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const companies = await query(
    `SELECT c.*, cf.role
     FROM companies c
     JOIN company_founders cf ON cf.company_id = c.id
     WHERE cf.founder_id = $1
     ORDER BY c.ai_score DESC NULLS LAST`,
    [id],
  );
  const connections = await query(
    'SELECT * FROM connections WHERE founder_id = $1 ORDER BY updated_at DESC',
    [id],
  );
  return NextResponse.json({ founder, companies, connections });
}
