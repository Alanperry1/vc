import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get('limit') ?? 24);
  const rawPage = Number(url.searchParams.get('page') ?? 1);
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : 24, 200));
  const page = Math.max(1, Number.isFinite(rawPage) ? Math.floor(rawPage) : 1);
  const offset = (page - 1) * limit;
  const sort = url.searchParams.get('sort') ?? 'score';
  const search = url.searchParams.get('q')?.trim();

  const binds: unknown[] = [];
  let where = '';
  let order: string;

  if (search) {
    where = `WHERE name % $1
      OR github_login ILIKE $2
      OR twitter ILIKE $2
      OR linkedin ILIKE $2
      OR bio ILIKE $2`;
    binds.push(search);
    binds.push(`%${search}%`);
    order = 'similarity(name, $1) DESC, github_followers DESC NULLS LAST';
  } else {
    order =
      sort === 'followers' ? 'github_followers DESC NULLS LAST'
      : sort === 'recent' ? 'updated_at DESC'
      : 'ai_score DESC NULLS LAST, github_followers DESC NULLS LAST';
  }

  const [{ total }] = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM founders ${where}`,
    binds,
  );

  const founders = await query(
    `SELECT * FROM founders ${where} ORDER BY ${order} LIMIT $${binds.length + 1} OFFSET $${binds.length + 2}`,
    [...binds, limit, offset],
  );

  return NextResponse.json({
    founders,
    total,
    page,
    pageSize: limit,
    hasNext: offset + founders.length < total,
  });
}
