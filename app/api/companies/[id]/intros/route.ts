import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// "Who in our network can intro us to this company?"
// Surface connections matching company sector or already linked to the company/its founders.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const direct = await query(
    `SELECT * FROM connections WHERE company_id = $1 ORDER BY updated_at DESC`,
    [id],
  );
  const viaFounders = await query(
    `SELECT c.*, f.name AS founder_name
     FROM connections c
     JOIN founders f ON f.id = c.founder_id
     JOIN company_founders cf ON cf.founder_id = f.id
     WHERE cf.company_id = $1`,
    [id],
  );
  return NextResponse.json({ direct, via_founders: viaFounders });
}
