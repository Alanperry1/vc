import { NextResponse } from 'next/server';
import { one, query } from '@/lib/db';
import { CLAUDE_MODEL, generateMemo } from '@/lib/claude';
import { uid } from '@/lib/util';

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
  homepage: string | null;
  github_url: string | null;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await one<CompanyRow>('SELECT * FROM companies WHERE id = $1', [id]);
  if (!company) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const signals = await query<{ title: string; signal_type: string; url: string | null }>(
    'SELECT title, signal_type, url FROM signals WHERE company_id = $1 ORDER BY occurred_at DESC LIMIT 12',
    [id],
  );

  try {
    const markdown = await generateMemo({ ...company, signals });
    const memoId = uid('memo');
    await query(
      'INSERT INTO memos (id, company_id, markdown, model) VALUES ($1, $2, $3, $4)',
      [memoId, id, markdown, CLAUDE_MODEL],
    );
    return NextResponse.json({ id: memoId, markdown, model: CLAUDE_MODEL });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
