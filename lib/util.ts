// Tiny utility helpers used across the app.

export function uid(prefix = ''): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return prefix ? `${prefix}_${rand}` : rand;
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function extractUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s)<>"']+/);
  return m ? m[0] : null;
}

export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function parseRaiseAmount(text: string): number | null {
  const m = text.match(/\$\s*([\d.]+)\s*(k|m|b|million|billion|thousand)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || '').toLowerCase();
  const mult =
    unit.startsWith('b') ? 1_000_000_000
    : unit.startsWith('m') ? 1_000_000
    : unit.startsWith('k') || unit.startsWith('t') ? 1_000
    : 1;
  return Math.round(n * mult);
}

export function detectStage(text: string): string | null {
  const t = text.toLowerCase();
  if (/pre[- ]?seed/.test(t)) return 'pre-seed';
  if (/seed/.test(t)) return 'seed';
  if (/series\s*a/.test(t)) return 'series-a';
  if (/series\s*b/.test(t)) return 'series-b';
  if (/series\s*c/.test(t)) return 'series-c';
  return null;
}

export function adminGuard(req: Request): Response | null {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return null; // open if not set
  const got = req.headers.get('x-admin-secret') ?? new URL(req.url).searchParams.get('secret');
  if (got !== expected) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  return null;
}
