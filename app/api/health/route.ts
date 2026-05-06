import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await query<{ n: string }>('SELECT COUNT(*)::text AS n FROM companies');
    return NextResponse.json({ ok: true, companies: Number(rows[0]?.n ?? 0) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg, hint: 'Run POST /api/migrate first' }, { status: 500 });
  }
}
