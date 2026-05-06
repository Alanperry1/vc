// Product Hunt — public RSS feed of today's launches.
// No API key required.

import { insertSignal, upsertCompany } from './store';
import { detectStage, domainOf } from './util';

interface PHItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

function parseRssItems(xml: string): PHItem[] {
  const items: PHItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  const tag = (block: string, name: string): string => {
    const m = block.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`));
    return m ? m[1].trim() : '';
  };
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    items.push({
      title: tag(block, 'title'),
      link: tag(block, 'link'),
      description: tag(block, 'description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      pubDate: tag(block, 'pubDate'),
    });
  }
  return items;
}

export async function ingestProductHunt(): Promise<number> {
  const res = await fetch('https://www.producthunt.com/feed', {
    headers: { 'user-agent': 'founderlens/0.1' },
  });
  if (!res.ok) {
    console.error('ProductHunt fetch failed', res.status);
    return 0;
  }
  const xml = await res.text();
  const items = parseRssItems(xml);
  let count = 0;
  for (const item of items) {
    if (!item.title || !item.link) continue;
    // PH titles look like "ProductName — short tagline".
    const [rawName, ...rest] = item.title.split(/\s+[—–\-:|]\s+/);
    const name = rawName.trim();
    if (!name || name.length > 40) continue;
    const tagline = rest.join(' — ').trim() || item.description.slice(0, 200);
    const stage = detectStage(`${name} ${tagline}`);
    const occurredAt = item.pubDate ? Math.floor(new Date(item.pubDate).getTime() / 1000) : Math.floor(Date.now() / 1000);

    const { id } = await upsertCompany({
      name,
      domain: domainOf(item.link),
      description: tagline,
      stage,
      homepage: item.link,
      source: 'producthunt',
    });

    await insertSignal({
      company_id: id,
      source: 'producthunt',
      signal_type: 'launch',
      title: item.title,
      url: item.link,
      payload: { description: item.description },
      weight: 2,
      occurred_at: occurredAt,
    });
    count++;
  }
  return count;
}
