import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/util';
import { db } from '@/lib/db';
import { SCHEMA_SQL } from '@/lib/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const guard = adminGuard(req);
  if (guard) return guard;
  try {
    await db().query(SCHEMA_SQL);
    return NextResponse.json({ ok: true, message: 'schema applied' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
