// Founder success scoring via Claude.
// Five dimensions: track record, domain expertise, founder-market fit,
// execution velocity, network strength. Mirrors the rubric used by
// most early-stage investors.

import { CLAUDE_FAST_MODEL } from './claude';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

interface ClaudeResponse {
  content: { type: string; text?: string }[];
}

async function callClaude(system: string, user: string, maxTokens = 600): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_FAST_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = (await res.json()) as ClaudeResponse;
  return data.content.map((c) => c.text ?? '').join('').trim();
}

function parseJsonBlock<T>(raw: string): T {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return JSON.parse(text) as T;
}

export interface FounderScore {
  track_record: number;
  domain_expertise: number;
  founder_market_fit: number;
  execution_velocity: number;
  network_strength: number;
  composite: number;
  rationale: string;
  red_flags: string[];
}

export async function scoreFounder(f: {
  name: string;
  bio: string | null;
  github_login: string | null;
  github_followers: number | null;
  github_public_repos: number | null;
  github_account_age_days: number | null;
  prior_companies: string[] | null;
  related_companies: { name: string; description: string | null }[];
}): Promise<FounderScore> {
  const system =
    'You are a senior VC analyst evaluating early-stage founders. Score rigorously — most founders are 4-7. Reserve 8+ for clear standouts. Return ONLY a JSON object.';

  const user = `Score this founder on 5 dimensions (0-10) and surface red flags. Respond with JSON only:
{
  "track_record": number,
  "domain_expertise": number,
  "founder_market_fit": number,
  "execution_velocity": number,
  "network_strength": number,
  "rationale": "two sentences max",
  "red_flags": ["short bullet", "..."]
}

Founder: ${f.name}
Bio: ${f.bio ?? 'unknown'}
GitHub: ${f.github_login ? '@' + f.github_login : 'n/a'}
GitHub followers: ${f.github_followers ?? 'unknown'}
Public repos: ${f.github_public_repos ?? 'unknown'}
Account age (days): ${f.github_account_age_days ?? 'unknown'}
Prior companies: ${(f.prior_companies ?? []).join(', ') || 'none surfaced'}
Currently building: ${f.related_companies.map((c) => `${c.name} — ${c.description ?? ''}`).join(' | ') || 'unknown'}`;

  const raw = await callClaude(system, user, 600);
  const parsed = parseJsonBlock<Omit<FounderScore, 'composite'>>(raw);
  const composite =
    parsed.track_record * 0.25 +
    parsed.domain_expertise * 0.2 +
    parsed.founder_market_fit * 0.2 +
    parsed.execution_velocity * 0.2 +
    parsed.network_strength * 0.15;
  return { ...parsed, composite: Math.round(composite * 10) / 10 };
}
