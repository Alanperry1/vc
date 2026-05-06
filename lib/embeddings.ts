// Voyage AI embeddings — Anthropic's recommended embedding provider for Claude users.
// 1024-dim, multilingual, strong on technical content. https://docs.voyageai.com
//
// Gracefully no-ops if VOYAGE_API_KEY is not set so the rest of the app still works.

import { createHash } from 'crypto';
import { query } from './db';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const MODEL = 'voyage-3-lite'; // 1024-dim
export const EMBEDDING_DIM = 1024;

export function embeddingsEnabled(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
}

export async function embed(texts: string[]): Promise<number[][] | null> {
  if (!embeddingsEnabled()) return null;
  if (texts.length === 0) return [];
  const cleaned = texts.map((t) => (t || '').slice(0, 4000));
  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: cleaned, model: MODEL, input_type: 'document' }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    console.error('[voyage] embed failed', res.status, body);
    return null;
  }
  const data = (await res.json()) as VoyageResponse;
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedQuery(text: string): Promise<number[] | null> {
  if (!embeddingsEnabled()) return null;
  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: [text.slice(0, 4000)], model: MODEL, input_type: 'query' }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as VoyageResponse;
  return data.data[0]?.embedding ?? null;
}

/** pgvector accepts the Postgres array literal: '[0.1, 0.2, ...]' */
export function toVectorLiteral(vec: number[]): string {
  return '[' + vec.join(',') + ']';
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** Build the canonical embedding text for a company. */
function companyEmbedText(c: {
  name: string;
  description: string | null;
  sector: string | null;
  stage: string | null;
}): string {
  return [
    c.name,
    c.sector ? `Sector: ${c.sector}` : null,
    c.stage ? `Stage: ${c.stage}` : null,
    c.description ?? '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Embed a company iff content has changed since the last embedding.
 * Skips silently if VOYAGE_API_KEY is missing.
 */
export async function embedCompanyIfNeeded(companyId: string): Promise<boolean> {
  if (!embeddingsEnabled()) return false;
  const rows = await query<{
    name: string;
    description: string | null;
    sector: string | null;
    stage: string | null;
    embedding_text_hash: string | null;
  }>(
    `SELECT name, description, sector, stage, embedding_text_hash
     FROM companies WHERE id = $1`,
    [companyId],
  );
  const c = rows[0];
  if (!c) return false;
  const text = companyEmbedText(c);
  const hash = hashText(text);
  if (c.embedding_text_hash === hash) return false;

  const out = await embed([text]);
  if (!out || !out[0]) return false;
  await query(
    `UPDATE companies SET embedding = $1::vector, embedding_text_hash = $2 WHERE id = $3`,
    [toVectorLiteral(out[0]), hash, companyId],
  );
  return true;
}

/**
 * Backfill embeddings for the N oldest unembedded companies.
 * Returns the count actually embedded. Bounded so it stays inside Vercel's 60s budget.
 */
export async function backfillCompanyEmbeddings(limit = 25): Promise<number> {
  if (!embeddingsEnabled()) return 0;
  const rows = await query<{
    id: string;
    name: string;
    description: string | null;
    sector: string | null;
    stage: string | null;
  }>(
    `SELECT id, name, description, sector, stage
     FROM companies
     WHERE embedding IS NULL
     ORDER BY updated_at DESC
     LIMIT $1`,
    [limit],
  );
  if (rows.length === 0) return 0;
  const texts = rows.map(companyEmbedText);
  const vecs = await embed(texts);
  if (!vecs) return 0;
  let count = 0;
  for (let i = 0; i < rows.length; i++) {
    const vec = vecs[i];
    if (!vec) continue;
    await query(
      `UPDATE companies SET embedding = $1::vector, embedding_text_hash = $2 WHERE id = $3`,
      [toVectorLiteral(vec), hashText(texts[i]), rows[i].id],
    );
    count++;
  }
  return count;
}
