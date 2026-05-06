'use client';

import useSWR from 'swr';
import { fetcher, fmtRelative, type Signal } from '@/lib/api';

export function SignalFeed({ limit = 30 }: { limit?: number }) {
  const { data } = useSWR<{ signals: Signal[] }>(`/signals?limit=${limit}`, fetcher, {
    refreshInterval: 30_000,
  });
  const signals = data?.signals ?? [];

  return (
    <ul className="divide-y divide-white/5">
      {signals.length === 0 && (
        <li className="text-sm text-ink-500 py-4">
          No signals yet. Click <span className="text-white">Refresh all sources</span> on the dashboard to ingest from every live source.
        </li>
      )}
      {signals.map((s) => (
        <li key={s.id} className="py-3 flex items-start gap-3">
          <SourceBadge source={s.source} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-ink-500">
              {s.company_name && <span className="text-white font-medium">{s.company_name}</span>}
              <span>·</span>
              <span>{s.signal_type}</span>
              <span>·</span>
              <span>{fmtRelative(s.occurred_at)}</span>
            </div>
            <a
              href={s.url ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-white/90 hover:text-accent-soft line-clamp-2 mt-0.5"
            >
              {s.title}
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    github: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    hn: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    rss: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    reddit: 'bg-red-500/15 text-red-300 border-red-500/30',
    producthunt: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
    yc: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  };
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wide font-semibold ${
        colors[source] ?? 'bg-white/10 text-white/70'
      }`}
    >
      {source}
    </span>
  );
}
