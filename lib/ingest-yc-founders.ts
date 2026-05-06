import { query } from './db';
import { linkFounder, upsertFounder } from './store';
import { domainOf } from './util';

interface YcCompanyRecord {
  id: number;
  name: string;
  slug: string;
  website?: string | null;
  all_locations?: string | null;
  url?: string | null;
}

interface YcFounderRecord {
  full_name: string;
  founder_bio?: string | null;
  title?: string | null;
  avatar_thumb_url?: string | null;
  twitter_url?: string | null;
  linkedin_url?: string | null;
}

const ALL_URL = 'https://yc-oss.github.io/api/companies/all.json';
let CACHE: { at: number; data: YcCompanyRecord[] } | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchAllCompanies(): Promise<YcCompanyRecord[]> {
  if (CACHE && Date.now() - CACHE.at < CACHE_TTL_MS) return CACHE.data;
  const res = await fetch(ALL_URL, {
    headers: { 'user-agent': 'founderlens/0.1' },
    cache: 'no-store',
  });
  if (!res.ok) {
    console.warn('[yc-founders] fetch failed', res.status);
    return [];
  }
  const data = (await res.json()) as YcCompanyRecord[];
  CACHE = { at: Date.now(), data };
  return data;
}

function decodeHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractJsonStringByKey(text: string, key: string): string | null {
  const marker = `"${key}":"`;
  const start = text.indexOf(marker);
  if (start === -1) return null;
  let value = '';
  let escaped = false;
  for (let i = start + marker.length; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      value += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      value += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      try {
        return JSON.parse(`"${value}"`) as string;
      } catch {
        return value;
      }
    }
    value += ch;
  }
  return null;
}

function extractJsonArrayByKey(text: string, key: string): string | null {
  const marker = `"${key}":[`;
  const start = text.indexOf(marker);
  if (start === -1) return null;
  const arrayStart = start + marker.length - 1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = arrayStart; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return text.slice(arrayStart, i + 1);
    }
  }
  return null;
}

function parseFounders(decodedHtml: string): YcFounderRecord[] {
  const raw = extractJsonArrayByKey(decodedHtml, 'founders');
  if (!raw) return [];
  try {
    return JSON.parse(raw) as YcFounderRecord[];
  } catch {
    return [];
  }
}

function normalizeSocial(url: string | null | undefined): string | null {
  if (!url) return null;
  const cleaned = url.trim();
  return cleaned || null;
}

export async function ingestYcFounders(limit = 16): Promise<number> {
  const all = await fetchAllCompanies();
  if (all.length === 0) return 0;

  const companies = await query<{
    id: string;
    name: string;
    homepage: string | null;
    location: string | null;
  }>(
    `SELECT id, name, homepage, location
     FROM companies
     WHERE source = 'yc'
     ORDER BY updated_at DESC
     LIMIT $1`,
    [limit],
  );
  if (companies.length === 0) return 0;

  const byDomain = new Map<string, YcCompanyRecord>();
  const byName = new Map<string, YcCompanyRecord>();
  for (const company of all) {
    const domain = domainOf(company.website ?? null);
    if (domain) byDomain.set(domain, company);
    byName.set(company.name.toLowerCase(), company);
  }

  const jobs = companies
    .map((company) => ({
      company,
      yc:
        (company.homepage ? byDomain.get(domainOf(company.homepage) ?? '') : undefined) ??
        byName.get(company.name.toLowerCase()),
    }))
    .filter((row): row is { company: (typeof companies)[number]; yc: YcCompanyRecord } => Boolean(row.yc));

  const POOL = 4;
  let cursor = 0;
  let count = 0;

  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const url = job.yc.url || `https://www.ycombinator.com/companies/${job.yc.slug}`;
      try {
        const res = await fetch(url, { headers: { 'user-agent': 'founderlens/0.1' } });
        if (!res.ok) continue;
        const html = await res.text();
        const decodedHtml = decodeHtml(html);
        const founders = parseFounders(decodedHtml);
        const companyLinkedin = normalizeSocial(extractJsonStringByKey(decodedHtml, 'linkedin_url'));
        if (companyLinkedin) {
          await query(
            `UPDATE companies
             SET linkedin_url = COALESCE($1, linkedin_url)
             WHERE id = $2`,
            [companyLinkedin, job.company.id],
          );
        }
        for (const founder of founders) {
          if (!founder.full_name) continue;
          const { id } = await upsertFounder({
            name: founder.full_name,
            bio: founder.founder_bio ?? null,
            linkedin: normalizeSocial(founder.linkedin_url),
            twitter: normalizeSocial(founder.twitter_url),
            avatar_url: founder.avatar_thumb_url ?? null,
            location: job.yc.all_locations || job.company.location || null,
            source: 'yc',
          });
          await linkFounder(job.company.id, id, founder.title || 'founder');
          count++;
        }
      } catch (err) {
        console.warn('[yc-founders] scrape failed for', job.company.name, err instanceof Error ? err.message : err);
      }
    }
  }

  await Promise.all(Array.from({ length: POOL }, worker));
  return count;
}