import { insertSignal, upsertCompany } from './store';
import { detectStage, domainOf, extractUrl, parseRaiseAmount } from './util';

interface HnHit {
  objectID: string;
  title: string | null;
  story_text: string | null;
  url: string | null;
  author: string;
  points: number | null;
  num_comments: number | null;
  created_at_i: number;
}

export async function ingestHn(query: string): Promise<number> {
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=30`;
  const res = await fetch(url, { headers: { 'user-agent': 'founderlens/0.1' } });
  if (!res.ok) {
    console.error('HN fetch failed', query, res.status);
    return 0;
  }
  const data = (await res.json()) as { hits: HnHit[] };
  let count = 0;

  for (const hit of data.hits ?? []) {
    const title = hit.title ?? '';
    if (!title) continue;
    if ((hit.points ?? 0) < 3) continue;

    const name = extractCompanyName(title);
    if (!name) continue;

    const homepage = hit.url || extractUrl(hit.story_text);
    const text = `${title} ${hit.story_text ?? ''}`;
    const stage = detectStage(text);
    const raised = parseRaiseAmount(text);

    const { id } = await upsertCompany({
      name,
      domain: domainOf(homepage),
      description: title,
      stage,
      raised_usd: raised,
      homepage,
      hn_url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
      source: 'hn',
    });

    await insertSignal({
      company_id: id,
      source: 'hn',
      signal_type: stage || raised ? 'funding' : 'launch',
      title,
      url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
      payload: { points: hit.points, comments: hit.num_comments, author: hit.author },
      weight: Math.min(5, Math.log10((hit.points ?? 1) + 1) * 1.5),
      occurred_at: hit.created_at_i,
    });
    count++;
  }
  return count;
}

function extractCompanyName(title: string): string | null {
  let t = title.trim();
  t = t.replace(/^(Show|Ask|Launch|Tell)\s*HN:\s*/i, '');
  const splitRe = /\s+[–—\-:|]\s+|\s+\(/;
  const head = t.split(splitRe)[0].trim();
  if (!head) return null;
  const words = head.split(/\s+/);
  if (words.length > 5) return null;
  if (head.length < 2 || head.length > 40) return null;
  return head;
}
