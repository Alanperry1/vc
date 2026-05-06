import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { nowSec } from '@/lib/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTRO_STATUSES = ['none', 'requested', 'intro_made', 'met', 'passed'];
const RELATIONSHIPS = ['operator', 'investor', 'angel', 'lp', 'advisor', 'other'];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as {
    intro_status?: string;
    notes?: string;
    relationship?: string;
    person_name?: string;
    person_email?: string;
  };

  const fields: string[] = [];
  const binds: unknown[] = [];
  let i = 1;
  if (body.intro_status !== undefined) {
    if (!INTRO_STATUSES.includes(body.intro_status)) return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    fields.push(`intro_status = $${i++}`); binds.push(body.intro_status);
  }
  if (body.relationship !== undefined) {
    if (!RELATIONSHIPS.includes(body.relationship)) return NextResponse.json({ error: 'invalid relationship' }, { status: 400 });
    fields.push(`relationship = $${i++}`); binds.push(body.relationship);
  }
  if (body.notes !== undefined) { fields.push(`notes = $${i++}`); binds.push(body.notes); }
  if (body.person_name !== undefined) { fields.push(`person_name = $${i++}`); binds.push(body.person_name); }
  if (body.person_email !== undefined) { fields.push(`person_email = $${i++}`); binds.push(body.person_email); }
  if (!fields.length) return NextResponse.json({ error: 'no fields' }, { status: 400 });
  fields.push(`updated_at = $${i++}`); binds.push(nowSec());
  binds.push(id);
  await query(`UPDATE connections SET ${fields.join(', ')} WHERE id = $${i}`, binds);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await query('DELETE FROM connections WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
