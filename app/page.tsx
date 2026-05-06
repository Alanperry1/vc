'use client';

import useSWR, { mutate } from 'swr';
import { useState } from 'react';
import { fetcher, type Company } from '@/lib/api';
import { CompanyCard } from '@/components/CompanyCard';
import { CompanyDrawer } from '@/components/CompanyDrawer';
import { SignalFeed } from '@/components/SignalFeed';

export default function DashboardPage() {
  const { data: hot } = useSWR<{ companies: Company[] }>(
    '/companies?sort=score&limit=6',
    fetcher,
    { refreshInterval: 60_000 },
  );
  const { data: momentum } = useSWR<{ companies: Company[] }>(
    '/companies?sort=momentum&limit=6',
    fetcher,
    { refreshInterval: 60_000 },
  );
  const { data: stats } = useSWR<{ ok: boolean; companies: number }>('/health', fetcher, {
    refreshInterval: 60_000,
  });

  const [selected, setSelected] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  async function refreshData() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch('/api/ingest', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await Promise.allSettled([
        mutate('/companies?sort=score&limit=6'),
        mutate('/companies?sort=momentum&limit=6'),
        mutate('/health'),
        mutate('/signals?limit=25'),
      ]);
      const sourceCount = Object.keys(json.results ?? {}).length;
      const scored = Number(json.scored ?? 0);
      const foundersScored = Number(json.foundersScored ?? 0);
      setRefreshMsg(
        `Ingested ${json.total ?? 0} items from ${sourceCount} sources${scored ? `, scored ${scored} companies` : ''}${foundersScored ? `, scored ${foundersScored} founders` : ''}`,
      );
    } catch (err) {
      setRefreshMsg(err instanceof Error ? err.message : 'Failed');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="min-w-0 space-y-8 md:space-y-10">
      <section>
        <div className="mb-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Sourcing intelligence,{' '}
              <span className="bg-gradient-to-r from-accent to-accent-soft bg-clip-text text-transparent">
                live
              </span>
            </h1>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-3xl font-semibold text-white tabular-nums">
              {stats?.companies ?? '—'}
            </div>
            <div className="text-xs text-ink-500 uppercase tracking-wide">indexed</div>
            <button
              onClick={refreshData}
              disabled={refreshing}
              className="mt-2 w-full rounded-md bg-accent px-3 py-1.5 text-xs text-white hover:bg-accent-soft disabled:opacity-50 sm:w-auto"
            >
              {refreshing ? 'Refreshing…' : 'Refresh all sources'}
            </button>
            {refreshMsg && (
              <div className="mt-1 max-w-[260px] break-words text-[10px] text-ink-500 sm:ml-auto">
                {refreshMsg}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,380px)]">
        <div className="min-w-0 space-y-6">
          <Block title="Top scored" subtitle="Highest Claude composite scores">
            <Grid companies={hot?.companies ?? []} onSelect={(c) => setSelected(c.id)} />
          </Block>
          <Block title="Highest momentum" subtitle="Source-specific traction proxy">
            <Grid companies={momentum?.companies ?? []} onSelect={(c) => setSelected(c.id)} />
          </Block>
        </div>
        <div className="min-w-0 xl:sticky xl:top-20 xl:self-start">
          <Block title="Live signal feed" subtitle="Updates every 30s">
            <div className="max-h-[50vh] overflow-y-auto overscroll-contain pr-1 sm:max-h-[60vh] xl:max-h-[calc(100vh-11rem)]">
              <SignalFeed limit={25} />
            </div>
          </Block>
        </div>
      </section>

      <CompanyDrawer companyId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Block({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider">{title}</h2>
        {subtitle && <span className="text-xs text-ink-500 sm:text-right">{subtitle}</span>}
      </div>
      <div className="glass rounded-2xl p-4">{children}</div>
    </div>
  );
}

function Grid({
  companies,
  onSelect,
}: {
  companies: Company[];
  onSelect: (c: Company) => void;
}) {
  if (companies.length === 0) {
    return (
      <p className="text-sm text-ink-500 p-4">
        Nothing here yet. Click <span className="text-white">Refresh all sources</span> above to ingest from every live source.
      </p>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {companies.map((c) => (
        <CompanyCard key={c.id} company={c} onSelect={() => onSelect(c)} />
      ))}
    </div>
  );
}
