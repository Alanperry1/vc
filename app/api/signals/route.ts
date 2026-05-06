import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
  const signals = await query(
    `SELECT s.*, c.name AS company_name, c.logo_url, c.sector
     FROM signals s
     LEFT JOIN companies c ON c.id = s.company_id
     ORDER BY s.occurred_at DESC
     LIMIT $1`,
    [limit],
  );
  return NextResponse.json({ signals });
}
