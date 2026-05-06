import { NextResponse } from 'next/server';
import { backfillCompanyEmbeddings, embeddingsEnabled } from '@/lib/embeddings';
import { adminGuard } from '@/lib/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const guard = adminGuard(req);
  if (guard) return guard;
  if (!embeddingsEnabled()) {
    return NextResponse.json({ ok: false, reason: 'VOYAGE_API_KEY not set' }, { status: 400 });
  }
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 25), 1), 100);
  const embedded = await backfillCompanyEmbeddings(limit);
  return NextResponse.json({ ok: true, embedded });
}
