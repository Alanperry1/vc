// Anthropic Claude client — direct fetch, no SDK needed.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
// Sonnet = high quality, slower (used for memos).
// Haiku = ~3-4x faster + cheaper (used for scoring, where we just need a JSON verdict).
export const CLAUDE_MODEL = 'claude-sonnet-4-5';
export const CLAUDE_FAST_MODEL = 'claude-haiku-4-5';

interface ClaudeResponse {
  content: { type: string; text?: string }[];
  stop_reason: string;
}

async function callClaude(
  system: string,
  userMsg: string,
  maxTokens = 1024,
  model = CLAUDE_MODEL,
): Promise<string> {
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
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as ClaudeResponse;
  return data.content
    .map((c) => c.text ?? '')
    .join('')
    .trim();
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

export interface CompanyScore {
  market: number;
  differentiation: number;
  timing: number;
  team: number;
  traction: number;
  composite: number;
  rationale: string;
}

export async function scoreCompany(c: {
  name: string;
  description: string | null;
  sector: string | null;
  stage: string | null;
  raised_usd: number | null;
  team_size: number | null;
  signals: { title: string; signal_type: string }[];
}): Promise<CompanyScore> {
  const system =
    'You are a senior venture capital analyst. Score early-stage companies rigorously. Return ONLY a single JSON object.';
  const user = `Score the following company on 5 dimensions (0-10 each). Be honest — most scores should be 4-7. Respond with JSON only:
{
  "market": number,
  "differentiation": number,
  "timing": number,
  "team": number,
  "traction": number,
  "rationale": "two sentences max"
}

Company: ${c.name}
Sector: ${c.sector ?? 'unknown'}
Stage: ${c.stage ?? 'unknown'}
Description: ${c.description ?? 'unknown'}
Raised: ${c.raised_usd ? '$' + c.raised_usd.toLocaleString() : 'unknown'}
Team size: ${c.team_size ?? 'unknown'}
Recent signals: ${c.signals.slice(0, 8).map((s) => `[${s.signal_type}] ${s.title}`).join(' | ') || 'none'}`;

  const raw = await callClaude(system, user, 600, CLAUDE_FAST_MODEL);
  const parsed = parseJsonBlock<Omit<CompanyScore, 'composite'>>(raw);
  const composite =
    parsed.market * 0.25 +
    parsed.differentiation * 0.2 +
    parsed.timing * 0.15 +
    parsed.team * 0.25 +
    parsed.traction * 0.15;
  return { ...parsed, composite: Math.round(composite * 10) / 10 };
}

export async function generateMemo(c: {
  name: string;
  description: string | null;
  sector: string | null;
  stage: string | null;
  raised_usd: number | null;
  homepage: string | null;
  github_url: string | null;
  signals: { title: string; signal_type: string; url: string | null }[];
}): Promise<string> {
  const system =
    'You are a venture investment analyst writing a concise one-page memo for a partner meeting. Use markdown. Be specific and avoid filler.';
  const user = `Write a one-page investment memo in markdown for the company below. Use these sections (H2):
- Thesis (3-4 sentences)
- Market
- Team
- Product & Traction
- Risks
- Comparable outcomes (2-3 examples)
- Recommended Next Step

Company: ${c.name}
Sector: ${c.sector ?? 'unknown'}
Stage: ${c.stage ?? 'unknown'}
Description: ${c.description ?? 'unknown'}
Raised: ${c.raised_usd ? '$' + c.raised_usd.toLocaleString() : 'unknown'}
Homepage: ${c.homepage ?? 'n/a'}
GitHub: ${c.github_url ?? 'n/a'}
Recent signals:
${c.signals.slice(0, 12).map((s) => `- [${s.signal_type}] ${s.title}${s.url ? ' — ' + s.url : ''}`).join('\n') || '- (none indexed yet)'}`;

  return callClaude(system, user, 1500);
}
