// API routes are colocated in this Next.js app under /api/*.
export const API_BASE = '/api';

export interface ScoreBreakdown {
  market: number;
  differentiation: number;
  timing: number;
  team: number;
  traction: number;
  composite: number;
  rationale: string;
}

export interface FounderScoreBreakdown {
  track_record: number;
  domain_expertise: number;
  founder_market_fit: number;
  execution_velocity: number;
  network_strength: number;
  composite: number;
  rationale: string;
  red_flags: string[];
}

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  description: string | null;
  sector: string | null;
  stage: string | null;
  homepage: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  hn_url: string | null;
  logo_url: string | null;
  raised_usd: number | null;
  team_size: number | null;
  ai_score: number | null;
  ai_score_breakdown: ScoreBreakdown | null;
  momentum_score: number | null;
  source: string | null;
  sources?: string[];
  updated_at: number;
  similarity?: number;
}

type MomentumContext = {
  source?: string | null;
  github_url?: string | null;
};

export interface Signal {
  id: string;
  company_id: string;
  company_name?: string;
  source: string;
  signal_type: string;
  title: string;
  url: string | null;
  payload: string | null;
  occurred_at: number;
  logo_url?: string | null;
  sector?: string | null;
}

export interface Deal {
  id: string;
  company_id: string;
  company_name: string;
  sector: string | null;
  source: string | null;
  github_url: string | null;
  raised_usd: number | null;
  momentum_score: number | null;
  ai_score: number | null;
  logo_url: string | null;
  homepage: string | null;
  stage: string;
  position: number;
  notes: string | null;
  owner: string | null;
}

export interface Founder {
  id: string;
  name: string;
  github_login: string | null;
  twitter: string | null;
  linkedin: string | null;
  bio: string | null;
  location: string | null;
  avatar_url: string | null;
  github_followers: number | null;
  github_public_repos: number | null;
  github_account_age_days: number | null;
  ai_score: number | null;
  ai_score_breakdown: FounderScoreBreakdown | null;
  source: string | null;
  updated_at: number;
}

export interface Connection {
  id: string;
  person_name: string;
  person_email: string | null;
  person_handle: string | null;
  relationship: string;
  company_id: string | null;
  founder_id: string | null;
  intro_status: string;
  notes: string | null;
  company_name?: string | null;
  company_logo?: string | null;
  founder_name?: string | null;
  founder_avatar?: string | null;
  updated_at: number;
}

export const fetcher = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
};

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export function fmtMoney(n: number | string | null | undefined): string {
  if (n == null) return '—';
  const value = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(value)) return '—';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value}`;
}

function momentumKind(entity: MomentumContext): 'github' | 'yc' | 'generic' {
  if (entity.source === 'github' || entity.github_url) return 'github';
  if (entity.source === 'yc') return 'yc';
  return 'generic';
}

export function momentumLabel(entity: MomentumContext): string {
  switch (momentumKind(entity)) {
    case 'github':
      return 'GitHub Stars/Day';
    case 'yc':
      return 'YC Traction Proxy';
    default:
      return 'Momentum';
  }
}

export function momentumValue(entity: MomentumContext, value: number | null | undefined): string {
  if (value == null) return '—';
  const formatted = value.toFixed(1);
  switch (momentumKind(entity)) {
    case 'github':
      return `${formatted} stars/day`;
    default:
      return formatted;
  }
}

export function momentumTag(entity: MomentumContext, value: number | null | undefined): string {
  if (value == null) return '—';
  const formatted = value.toFixed(1);
  switch (momentumKind(entity)) {
    case 'github':
      return `Stars/day ${formatted}`;
    case 'yc':
      return `YC proxy ${formatted}`;
    default:
      return `Momentum ${formatted}`;
  }
}

export function momentumHelp(entity: MomentumContext): string {
  switch (momentumKind(entity)) {
    case 'github':
      return 'GitHub momentum is repository stars divided by repo age in days.';
    case 'yc':
      return 'YC momentum is a source-specific proxy built from company age, team size, and YC top-company status.';
    default:
      return 'Momentum is a source-specific traction signal.';
  }
}

export function fmtRelative(unixSec: number): string {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSec * 1000).toLocaleDateString();
}
