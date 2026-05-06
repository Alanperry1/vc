import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function makePool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  // Vercel Postgres / Neon need SSL; local dev usually doesn't.
  const ssl =
    /sslmode=require/.test(connectionString) ||
    /\.vercel\.app|neon\.tech|railway\.app/.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined;
  return new Pool({ connectionString, ssl, max: 5 });
}

export function db(): Pool {
  if (!global.__pgPool) global.__pgPool = makePool();
  return global.__pgPool;
}

export async function query<T = unknown>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await db().query(text, params as never[]);
  return res.rows as T[];
}

export async function one<T = unknown>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
