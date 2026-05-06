import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { nowSec } from '@/lib/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAGES = ['sourced', 'contacted', 'diligence', 'term_sheet', 'closed', 'passed'];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { stage?: string; position?: number; notes?: string; owner?: string };
  if (body.stage && !STAGES.includes(body.stage)) {
    return NextResponse.json({ error: 'invalid stage' }, { status: 400 });
  }
  const fields: string[] = [];
  const binds: unknown[] = [];
  let i = 1;
  if (body.stage !== undefined) { fields.push(`stage = $${i++}`); binds.push(body.stage); }
  if (body.position !== undefined) { fields.push(`position = $${i++}`); binds.push(body.position); }
  if (body.notes !== undefined) { fields.push(`notes = $${i++}`); binds.push(body.notes); }
  if (body.owner !== undefined) { fields.push(`owner = $${i++}`); binds.push(body.owner); }
  if (!fields.length) return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  fields.push(`updated_at = $${i++}`);
  binds.push(nowSec());
  binds.push(id);

  await query(`UPDATE pipeline_deals SET ${fields.join(', ')} WHERE id = $${i}`, binds);
  return NextResponse.json({ ok: true });
}
