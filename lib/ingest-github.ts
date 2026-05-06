import { insertSignal, linkFounder, upsertCompany, upsertFounder } from './store';
import { domainOf } from './util';

interface GitHubRepo {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  pushed_at: string;
  created_at: string;
  owner: { login: string; type: string; avatar_url: string };
}

interface GitHubUser {
  login: string;
  name: string | null;
  bio: string | null;
  location: string | null;
  avatar_url: string;
  followers: number;
  public_repos: number;
  created_at: string;
  twitter_username: string | null;
  blog: string | null;
}

const ONE_DAY = 86_400;

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'user-agent': 'founderlens/0.1',
    accept: 'application/vnd.github+json',
  };
  if (process.env.GITHUB_TOKEN) h.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function fetchGitHubUser(login: string): Promise<GitHubUser | null> {
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
      headers: ghHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as GitHubUser;
  } catch {
    return null;
  }
}

export async function ingestGithubTopic(topic: string): Promise<number> {
  const since = new Date(Date.now() - 180 * ONE_DAY * 1000).toISOString().slice(0, 10);
  const q = `topic:${topic} created:>${since} stars:>10`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=20`;

  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) {
    console.error('GitHub fetch failed', topic, res.status);
    return 0;
  }
  const data = (await res.json()) as { items: GitHubRepo[] };
  let count = 0;

  for (const repo of data.items ?? []) {
    if (repo.owner.type !== 'Organization' && !repo.homepage) continue;

    const ageDays = Math.max(
      1,
      (Date.now() - new Date(repo.created_at).getTime()) / 86_400_000,
    );
    const momentum = Math.round((repo.stargazers_count / ageDays) * 100) / 100;

    const homepage = repo.homepage || null;
    const cleanedOwner = repo.owner.login.replace(/[-_]/g, ' ');
    const name = cleanedOwner.charAt(0).toUpperCase() + cleanedOwner.slice(1);

    const { id: companyId } = await upsertCompany({
      name,
      domain: domainOf(homepage),
      description: repo.description,
      sector: inferSector(repo.topics, repo.description, repo.language),
      stage: inferStage(repo.stargazers_count, ageDays),
      homepage,
      github_url: repo.html_url,
      logo_url: repo.owner.avatar_url,
      momentum_score: momentum,
      source: 'github',
    });

    await insertSignal({
      company_id: companyId,
      source: 'github',
      signal_type: 'momentum',
      title: `${repo.full_name} — ${repo.stargazers_count.toLocaleString()} stars (${repo.language ?? 'multi'})`,
      url: repo.html_url,
      payload: {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        topics: repo.topics,
      },
      weight: Math.min(5, Math.log10(repo.stargazers_count + 1)),
      occurred_at: Math.floor(new Date(repo.pushed_at).getTime() / 1000),
    });

    // For individual maintainers, also surface them as a founder.
    if (repo.owner.type === 'User') {
      const user = await fetchGitHubUser(repo.owner.login);
      if (user) {
        const accountAgeDays = Math.floor(
          (Date.now() - new Date(user.created_at).getTime()) / 86_400_000,
        );
        const { id: founderId } = await upsertFounder({
          name: user.name || user.login,
          github_login: user.login,
          twitter: user.twitter_username,
          bio: user.bio,
          location: user.location,
          avatar_url: user.avatar_url,
          github_followers: user.followers,
          github_public_repos: user.public_repos,
          github_account_age_days: accountAgeDays,
          source: 'github',
        });
        await linkFounder(companyId, founderId, 'maintainer');
      }
    }

    count++;
  }

  return count;
}

function inferSector(topics: string[], description: string | null, language: string | null): string | null {
  const t = new Set(topics.map((x) => x.toLowerCase()));
  const desc = (description ?? '').toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => t.has(n) || desc.includes(n));

  if (has('ai', 'llm', 'agents', 'ml', 'machine-learning', 'gpt', 'rag', 'embedding', 'transformer')) return 'ai';
  if (has('crypto', 'web3', 'blockchain', 'ethereum', 'solana', 'defi', 'nft')) return 'crypto';
  if (has('security', 'infosec', 'cybersecurity', 'pentest', 'vulnerability', 'cryptography')) return 'security';
  if (has('fintech', 'finance', 'payments', 'banking', 'trading', 'stripe')) return 'fintech';
  if (has('biotech', 'healthcare', 'medical', 'health', 'genomics')) return 'health';
  if (has('devtools', 'developer-tools', 'cli', 'sdk', 'api', 'framework', 'library')) return 'devtools';
  if (language) return 'devtools';
  return null;
}

// Crude stage inference from GitHub momentum. Anything tiny is pre-seed,
// stuff with traction looks like seed/A.
function inferStage(stars: number, ageDays: number): string | null {
  if (stars < 50) return 'pre-seed';
  if (stars < 500 || ageDays < 365) return 'seed';
  if (stars < 5000) return 'series-a';
  if (stars < 20000) return 'series-b';
  return 'series-c';
}
