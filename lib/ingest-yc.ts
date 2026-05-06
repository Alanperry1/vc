// Y Combinator — uses the community-maintained yc-oss/api JSON dump.
// No auth required, no rate limit. https://yc-oss.github.io/api/companies/all.json
//
// We pull the full corpus (~5800 companies), then upsert only N per call so
// we stay inside Vercel's 60s budget. The cron rotates through the rest.

import { insertSignal, upsertCompany } from './store';
import { domainOf } from './util';

interface YcCompany {
  id: number;
  name: string;
  slug: string;
  small_logo_thumb_url?: string | null;
  website?: string | null;
  all_locations?: string | null;
  long_description?: string | null;
  one_liner?: string | null;
  team_size?: number | null;
  industry?: string | null;
  subindustry?: string | null;
  launched_at?: number | null;
  tags?: string[];
  batch?: string | null;
  status?: string | null;
  industries?: string[];
  stage?: string | null;
  url?: string | null;
  top_company?: boolean;
}

const ALL_URL = 'https://yc-oss.github.io/api/companies/all.json';

function mapSector(c: YcCompany): string | null {
  const blob = (c.industries ?? [])
    .concat(c.tags ?? [])
    .concat([c.industry ?? '', c.subindustry ?? ''])
    .join(' ')
    .toLowerCase();
  if (/\b(ai|machine learning|ml|llm|nlp|computer vision|generative)\b/.test(blob)) return 'ai';
  if (/\b(developer|devtools|infrastructure|api|sdk|open source)\b/.test(blob)) return 'devtools';
  if (/\b(fintech|finance|banking|payments|insurance|lending|trading|wealth)\b/.test(blob)) return 'fintech';
  if (/\b(security|cybersecurity|privacy|infosec|fraud)\b/.test(blob)) return 'security';
  if (/\b(crypto|web3|blockchain|defi|nft)\b/.test(blob)) return 'crypto';
  if (/\b(health|biotech|medical|healthcare|life sciences|pharma|diagnostic|therapeutic)\b/.test(blob)) return 'health';
  return null;
}

function inferStage(c: YcCompany): string | null {
  const s = (c.stage ?? '').toLowerCase();
  if (s === 'growth' || s === 'late') return 'series-c';
  if (!c.batch) return 'pre-seed';
  const m = c.batch.match(/(\d{4})/);
  if (!m) return 'pre-seed';
  const year = Number(m[1]);
  const ageYears = new Date().getFullYear() - year;
  if (ageYears <= 0) return 'pre-seed';
  if (ageYears <= 1) return 'seed';
  if (ageYears <= 3) return 'series-a';
  if (ageYears <= 5) return 'series-b';
  return 'series-c';
}

let CACHE: { at: number; data: YcCompany[] } | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchAll(): Promise<YcCompany[]> {
  if (CACHE && Date.now() - CACHE.at < CACHE_TTL_MS) return CACHE.data;
  const res = await fetch(ALL_URL, {
    headers: { 'user-agent': 'founderlens/0.1' },
    cache: 'no-store',
  });
  if (!res.ok) {
    console.warn('[yc] fetch failed', res.status);
    return [];
  }
  const data = (await res.json()) as YcCompany[];
  CACHE = { at: Date.now(), data };
  return data;
}

function batchYear(c: YcCompany): number {
  return Number(c.batch?.match(/\d{4}/)?.[0] ?? 0);
}

function pickBalanced(active: YcCompany[], take: number): YcCompany[] {
  const stageBuckets: Record<string, YcCompany[]> = {
    'pre-seed': [],
    seed: [],
    'series-a': [],
    'series-b': [],
    'series-c': [],
  };

  for (const company of active) {
    const stage = inferStage(company) ?? 'seed';
    (stageBuckets[stage] ?? stageBuckets.seed).push(company);
  }

  for (const bucket of Object.values(stageBuckets)) {
    bucket.sort((a, b) => batchYear(b) - batchYear(a));
  }

  const bucketNames = Object.keys(stageBuckets);
  const baseQuota = Math.max(1, Math.floor(take / bucketNames.length));
  const selected: YcCompany[] = [];
  const seen = new Set<number>();
  const rotation = Math.floor(Date.now() / (60 * 60 * 1000));

  for (const [index, stage] of bucketNames.entries()) {
    const bucket = stageBuckets[stage];
    if (bucket.length === 0) continue;
    const quota = Math.min(bucket.length, baseQuota);
    const start = (rotation * quota + index * quota) % bucket.length;
    for (let i = 0; i < quota; i++) {
      const company = bucket[(start + i) % bucket.length];
      if (seen.has(company.id)) continue;
      seen.add(company.id);
      selected.push(company);
    }
  }

  if (selected.length >= take) return selected.slice(0, take);

  const recent = active.slice().sort((a, b) => batchYear(b) - batchYear(a));
  const start = (rotation * Math.max(1, take)) % recent.length;
  for (let i = 0; i < recent.length && selected.length < take; i++) {
    const company = recent[(start + i) % recent.length];
    if (seen.has(company.id)) continue;
    seen.add(company.id);
    selected.push(company);
  }

  return selected;
}

/**
 * Upsert up to `take` YC companies per call. Defaults to 200. Subsequent calls
 * rotate through a different slice of the active corpus so we eventually cover
 * everything without blowing the request budget.
 */
export async function ingestYC(take = 200): Promise<number> {
  const all = await fetchAll();
  if (all.length === 0) return 0;

  const active = all.filter((c) => (c.status ?? 'Active') === 'Active');
  const slice = pickBalanced(active, take);

  const POOL = 8;
  let cursor = 0;
  let count = 0;
  async function worker() {
    while (cursor < slice.length) {
      const hit = slice[cursor++];
      if (!hit?.name) continue;
      const homepage = hit.website || null;
      const sector = mapSector(hit);
      const stage = inferStage(hit);
      const launchedAt = hit.launched_at ?? Math.floor(Date.now() / 1000);
      const ycUrl = hit.url || `https://www.ycombinator.com/companies/${hit.slug}`;

      try {
        const { id, created } = await upsertCompany({
          name: hit.name,
          domain: domainOf(homepage),
          description: hit.one_liner || hit.long_description?.slice(0, 240) || null,
          sector,
          stage,
          location: hit.all_locations || null,
          team_size: hit.team_size ?? null,
          homepage,
          logo_url: hit.small_logo_thumb_url || null,
          source: 'yc',
        });
        if (created) {
          await insertSignal({
            company_id: id,
            source: 'yc',
            signal_type: 'launch',
            title: `${hit.name} (YC ${hit.batch ?? ''}) — ${hit.one_liner ?? 'YC-backed company'}`,
            url: ycUrl,
            payload: {
              batch: hit.batch,
              industries: hit.industries,
              status: hit.status,
              top: hit.top_company,
            },
            weight: hit.top_company ? 5 : 3,
            occurred_at: launchedAt,
          });
        }
        count++;
      } catch (err) {
        console.warn('[yc] upsert failed for', hit.name, err instanceof Error ? err.message : err);
      }
    }
  }
  await Promise.all(Array.from({ length: POOL }, worker));
  return count;
}
