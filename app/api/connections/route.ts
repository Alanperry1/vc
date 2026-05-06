import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { nowSec, uid } from '@/lib/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTRO_STATUSES = ['none', 'requested', 'intro_made', 'met', 'passed'];
const RELATIONSHIPS = ['operator', 'investor', 'angel', 'lp', 'advisor', 'other'];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const companyId = url.searchParams.get('company_id');
  const founderId = url.searchParams.get('founder_id');
  const search = url.searchParams.get('q');

  const where: string[] = [];
  const binds: unknown[] = [];
  let i = 1;
  if (status) { where.push(`c.intro_status = $${i++}`); binds.push(status); }
  if (companyId) { where.push(`c.company_id = $${i++}`); binds.push(companyId); }
  if (founderId) { where.push(`c.founder_id = $${i++}`); binds.push(founderId); }
  if (search) {
    where.push(`(
      c.person_name % $${i}
      OR c.person_name ILIKE $${i + 1}
      OR c.person_email ILIKE $${i + 1}
      OR c.person_handle ILIKE $${i + 1}
      OR c.notes ILIKE $${i + 1}
      OR comp.name ILIKE $${i + 1}
      OR f.name ILIKE $${i + 1}
    )`);
    binds.push(search, `%${search}%`);
    i += 2;
  }

  const rows = await query(
    `SELECT c.*,
            comp.name AS company_name, comp.logo_url AS company_logo,
            f.name AS founder_name, f.avatar_url AS founder_avatar
     FROM connections c
     LEFT JOIN companies comp ON comp.id = c.company_id
     LEFT JOIN founders f ON f.id = c.founder_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY c.updated_at DESC
     LIMIT 200`,
    binds,
  );
  return NextResponse.json({ connections: rows, intro_statuses: INTRO_STATUSES, relationships: RELATIONSHIPS });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    person_name?: string;
    person_email?: string;
    person_handle?: string;
    relationship?: string;
    company_id?: string;
    founder_id?: string;
    intro_status?: string;
    notes?: string;
  };
  if (!body.person_name) return NextResponse.json({ error: 'person_name required' }, { status: 400 });

  const relationship = body.relationship && RELATIONSHIPS.includes(body.relationship) ? body.relationship : 'operator';
  const intro = body.intro_status && INTRO_STATUSES.includes(body.intro_status) ? body.intro_status : 'none';
  const id = uid('conn');
  const ts = nowSec();

  await query(
    `INSERT INTO connections (id, person_name, person_email, person_handle, relationship,
                              company_id, founder_id, intro_status, notes, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
    [
      id,
      body.person_name,
      body.person_email ?? null,
      body.person_handle ?? null,
      relationship,
      body.company_id ?? null,
      body.founder_id ?? null,
      intro,
      body.notes ?? null,
      ts,
    ],
  );
  return NextResponse.json({ ok: true, id });
}
