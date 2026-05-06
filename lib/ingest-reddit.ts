// Reddit — public JSON endpoints, no auth required (just a unique UA).
// We mine /r/startups, /r/SaaS, /r/EntrepreneurRideAlong for launch + raise posts.

import { insertSignal, upsertCompany } from './store';
import { detectStage, domainOf, extractUrl, parseRaiseAmount } from './util';

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  permalink: string;
  url: string;
  ups: number;
  num_comments: number;
  created_utc: number;
  link_flair_text: string | null;
  subreddit: string;
}

interface RedditListing {
  data: { children: { data: RedditPost }[] };
}

const SUBREDDITS = ['startups', 'SaaS', 'EntrepreneurRideAlong', 'sideproject'];

async function fetchSub(sub: string): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${sub}/new.json?limit=30`;
  const res = await fetch(url, {
    headers: { 'user-agent': 'founderlens/0.1 (deal sourcing)' },
  });
  if (!res.ok) {
    console.warn(`reddit:${sub} fetch failed`, res.status);
    return [];
  }
  const data = (await res.json()) as RedditListing;
  return data.data.children.map((c) => c.data);
}

function looksLikeLaunchOrRaise(p: RedditPost): boolean {
  const t = `${p.title} ${p.link_flair_text ?? ''}`.toLowerCase();
  return /launch|launched|raised|raising|funding|seed|series\s+[a-c]|yc|y\s*combinator|building|startup|mvp|just shipped/.test(t);
}

function extractCompanyName(title: string): string | null {
  // Strip common prefixes: "I built X that does...", "Show: X", etc.
  let t = title.trim();
  t = t.replace(/^\[?\s*(launch|show|update|ask|tell|help)\s*\]?\s*[:\-]\s*/i, '');
  t = t.replace(/^(i\s+(just\s+)?(built|made|launched|shipped|created)\s+)/i, '');
  // Extract first quoted or capitalized token as candidate.
  const quoted = t.match(/"([^"]{2,40})"/);
  if (quoted) return quoted[1].trim();
  const head = t.split(/\s+[—–\-:|]\s+|\s+\(|\s+is\s+|\s+\u2014\s+|\s+to\s+/i)[0].trim();
  if (!head || head.length < 2 || head.length > 40) return null;
  // Reject sentences (too many lowercase words).
  const words = head.split(/\s+/);
  if (words.length > 5) return null;
  return head;
}

export async function ingestReddit(): Promise<number> {
  let count = 0;
  for (const sub of SUBREDDITS) {
    const posts = await fetchSub(sub);
    for (const p of posts) {
      if (p.ups < 5) continue;
      if (!looksLikeLaunchOrRaise(p)) continue;
      const name = extractCompanyName(p.title);
      if (!name) continue;

      const homepage = extractUrl(p.selftext) || (p.url && !p.url.includes('reddit.com') ? p.url : null);
      const text = `${p.title} ${p.selftext}`;
      const stage = detectStage(text);
      const raised = parseRaiseAmount(text);

      const { id } = await upsertCompany({
        name,
        domain: domainOf(homepage),
        description: p.title,
        stage,
        raised_usd: raised,
        homepage,
        source: 'reddit',
      });

      await insertSignal({
        company_id: id,
        source: 'reddit',
        signal_type: raised ? 'funding' : 'launch',
        title: p.title,
        url: `https://www.reddit.com${p.permalink}`,
        payload: { subreddit: sub, ups: p.ups, comments: p.num_comments },
        weight: Math.min(4, Math.log10(p.ups + 1) * 1.5),
        occurred_at: p.created_utc,
      });
      count++;
    }
  }
  return count;
}
