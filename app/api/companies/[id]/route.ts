import { NextResponse } from 'next/server';
import { one, query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await one('SELECT * FROM companies WHERE id = $1', [id]);
  if (!company) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const signals = await query(
    'SELECT * FROM signals WHERE company_id = $1 ORDER BY occurred_at DESC LIMIT 30',
    [id],
  );
  const memo = await one(
    'SELECT * FROM memos WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1',
    [id],
  );
  return NextResponse.json({ company, signals, memo });
}
