import { NextResponse } from 'next/server';
import { query, one } from '@/lib/db';
import { embeddingsEnabled } from '@/lib/embeddings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// "Find me companies like X" — pgvector cosine similarity when an embedding exists,
// otherwise fall back to pg_trgm fuzzy text similarity (always works, no API call).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Vector path
  if (embeddingsEnabled()) {
    const seed = await one<{ embedding: string | null }>(
      'SELECT embedding::text AS embedding FROM companies WHERE id = $1',
      [id],
    );
    if (seed?.embedding) {
      const similar = await query(
        `SELECT id, name, domain, description, sector, stage, ai_score, logo_url,
                1 - (embedding <=> $1::vector) AS similarity
         FROM companies
         WHERE embedding IS NOT NULL AND id <> $2
         ORDER BY embedding <=> $1::vector ASC
         LIMIT 12`,
        [seed.embedding, id],
      );
      return NextResponse.json({ similar });
    }
  }

  // Fallback: pg_trgm similarity over (name + description + sector + stage).
  // No external API, instant. Quality is decent for keyword overlap.
  const seedRow = await one<{
    name: string;
    description: string | null;
    sector: string | null;
    stage: string | null;
  }>(
    'SELECT name, description, sector, stage FROM companies WHERE id = $1',
    [id],
  );
  if (!seedRow) {
    return NextResponse.json({ similar: [], reason: 'not_found' });
  }
  const seedText = [seedRow.name, seedRow.sector, seedRow.stage, seedRow.description ?? '']
    .filter(Boolean)
    .join(' ');
  const similar = await query(
    `SELECT id, name, domain, description, sector, stage, ai_score, logo_url,
            similarity(coalesce(name,'') || ' ' || coalesce(sector,'') || ' ' ||
                       coalesce(stage,'') || ' ' || coalesce(description,''), $1) AS similarity
     FROM companies
     WHERE id <> $2
     ORDER BY similarity DESC
     LIMIT 12`,
    [seedText, id],
  );
  return NextResponse.json({ similar, reason: 'trgm_fallback' });
}
