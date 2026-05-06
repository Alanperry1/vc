import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { embedQuery, embeddingsEnabled, toVectorLiteral } from '@/lib/embeddings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CompanyRow = {
  id: string;
  source: string | null;
  [key: string]: unknown;
};

async function attachSources<T extends CompanyRow>(companies: T[]): Promise<(T & { sources: string[] })[]> {
  if (companies.length === 0) return [];
  const ids = companies.map((company) => company.id);
  const rows = await query<{ company_id: string; sources: string[] }>(
    `SELECT company_id, array_agg(DISTINCT source ORDER BY source) AS sources
     FROM signals
     WHERE company_id = ANY($1)
     GROUP BY company_id`,
    [ids],
  );
  const sourceMap = new Map(rows.map((row) => [row.company_id, row.sources ?? []]));
  return companies.map((company) => ({
    ...company,
    sources: sourceMap.get(company.id) ?? (company.source ? [company.source] : []),
  }));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sector = url.searchParams.get('sector');
  const stage = url.searchParams.get('stage');
  const minScore = url.searchParams.get('min_score');
  const source = url.searchParams.get('source');
  const search = url.searchParams.get('q');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const offset = (page - 1) * limit;
  const sort = url.searchParams.get('sort') ?? 'score';
  // mode=semantic forces vector search; mode=lexical forces trigram. Default = auto.
  const mode = url.searchParams.get('mode') ?? 'auto';

  // --- Semantic path: pgvector cosine similarity. ---
  if (search && mode !== 'lexical' && embeddingsEnabled()) {
    const vec = await embedQuery(search);
    if (vec) {
      const where: string[] = ['c.embedding IS NOT NULL'];
      const binds: unknown[] = [toVectorLiteral(vec)];
      let i = 2;
      if (sector) { where.push(`c.sector = $${i++}`); binds.push(sector); }
      if (stage) { where.push(`c.stage = $${i++}`); binds.push(stage); }
      if (source) {
        where.push(`(c.source = $${i} OR EXISTS (SELECT 1 FROM signals s WHERE s.company_id = c.id AND s.source = $${i}))`);
        binds.push(source);
        i++;
      }
      if (minScore) { where.push(`c.ai_score >= $${i++}`); binds.push(Number(minScore)); }

      const totalRows = await query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM companies c
         WHERE ${where.join(' AND ')}`,
        binds,
      );
      const total = Number(totalRows[0]?.count ?? 0);

      const sql = `SELECT c.*, 1 - (c.embedding <=> $1::vector) AS similarity
                   FROM companies c
                   WHERE ${where.join(' AND ')}
                   ORDER BY c.embedding <=> $1::vector ASC
                   LIMIT $${i} OFFSET $${i + 1}`;
      const companies = await query<CompanyRow>(sql, [...binds, limit, offset]);
      return NextResponse.json({
        companies: await attachSources(companies),
        total,
        page,
        pageSize: limit,
        hasNext: offset + companies.length < total,
        mode: 'semantic',
      });
    }
  }

  // --- Lexical path: trigram + ILIKE. ---
  const where: string[] = [];
  const binds: unknown[] = [];
  let i = 1;

  if (sector) { where.push(`c.sector = $${i++}`); binds.push(sector); }
  if (stage) { where.push(`c.stage = $${i++}`); binds.push(stage); }
  if (source) {
    where.push(`(c.source = $${i} OR EXISTS (SELECT 1 FROM signals s WHERE s.company_id = c.id AND s.source = $${i}))`);
    binds.push(source);
    i++;
  }
  if (minScore) { where.push(`c.ai_score >= $${i++}`); binds.push(Number(minScore)); }
  if (search) {
    where.push(`(c.name % $${i} OR c.description % $${i} OR c.name ILIKE $${i + 1} OR c.description ILIKE $${i + 1})`);
    binds.push(search);
    binds.push(`%${search}%`);
    i += 2;
  }

  const totalRows = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM companies c
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
    binds,
  );
  const total = Number(totalRows[0]?.count ?? 0);

  const orderBy = search
    ? `GREATEST(similarity(c.name, $${i}), similarity(COALESCE(c.description, ''), $${i})) DESC`
    : sort === 'momentum' ? 'c.momentum_score DESC NULLS LAST'
    : sort === 'recent' ? 'c.updated_at DESC'
    : 'c.ai_score DESC NULLS LAST, c.momentum_score DESC NULLS LAST';
  if (search) {
    binds.push(search);
    i++;
  }

  const sql = `SELECT c.*
               FROM companies c
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY ${orderBy}
               LIMIT $${i} OFFSET $${i + 1}`;
  binds.push(limit, offset);
  const companies = await query<CompanyRow>(sql, binds);
  return NextResponse.json({
    companies: await attachSources(companies),
    total,
    page,
    pageSize: limit,
    hasNext: offset + companies.length < total,
    mode: search ? 'lexical' : 'sorted',
  });
}
