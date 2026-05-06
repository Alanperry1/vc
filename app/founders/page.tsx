'use client';

import { useEffect, useState } from 'react';
import useSWR, { mutate } from 'swr';
import { fetcher, fmtRelative, postJson, type Founder } from '@/lib/api';
import { FounderDrawer } from '@/components/FounderDrawer';

const PAGE_SIZE = 24;

interface FounderListResp {
  founders: Founder[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export default function FoundersPage() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [scoring, setScoring] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (query.trim()) {
    params.set('q', query.trim());
  } else {
    params.set('sort', 'score');
  }
  params.set('limit', String(PAGE_SIZE));
  params.set('page', String(page));

  const path = `/founders?${params.toString()}`;
  const { data, isLoading } = useSWR<FounderListResp>(path, fetcher, { refreshInterval: 60_000 });
  const founders = data?.founders ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function scoreFounder(id: string) {
    setScoring(id);
    try {
      await postJson(`/founders/${id}/score`, {});
      mutate(path);
      mutate(`/founders/${id}`);
    } finally {
      setScoring(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Founders</h1>
        </div>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name, handle, or bio…"
          className="w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2 text-sm placeholder:text-ink-500 focus:border-accent focus:outline-none sm:w-72"
        />
      </header>

      <div className="flex flex-col gap-2 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {total === 0 ? '0 founders' : `Showing ${rangeStart}-${rangeEnd} of ${total} founders`}
        </div>
        <div>
          Page {page} of {totalPages}
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-ink-500">Loading…</div>
      ) : founders.length === 0 ? (
        <div className="text-sm text-ink-500">
          {query.trim()
            ? 'No founders match this search.'
            : <>
                No founders yet. Click <span className="text-white">Refresh all sources</span> on the dashboard
                {' '}to ingest fresh data.
              </>}
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {founders.map((f) => (
              <FounderCard
                key={f.id}
                founder={f}
                onOpen={() => setSelectedId(f.id)}
                onScore={() => scoreFounder(f.id)}
                scoring={scoring === f.id}
              />
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-ink-500">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((current) => current + 1)}
                disabled={!data?.hasNext}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      <FounderDrawer founderId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function FounderCard({
  founder,
  onOpen,
  onScore,
  scoring,
}: {
  founder: Founder;
  onOpen: () => void;
  onScore: () => void;
  scoring: boolean;
}) {
  return (
    <div className="glass rounded-xl p-4 flex flex-col gap-3">
      <button onClick={onOpen} className="text-left">
        <div className="flex items-start gap-3">
          {founder.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={founder.avatar_url} alt="" className="w-10 h-10 rounded-full bg-ink-800" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-ink-800 grid place-items-center text-xs text-ink-500 font-bold">
              {founder.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate font-semibold text-white">{founder.name}</span>
              {founder.github_login && (
                <span className="text-[11px] text-accent-soft">@{founder.github_login}</span>
              )}
            </div>
            {founder.bio && <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{founder.bio}</p>}
          </div>
          {founder.ai_score !== null && <span className="score-pill text-sm">★ {founder.ai_score.toFixed(1)}</span>}
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-500">
          {founder.location && <span>📍 {founder.location}</span>}
          {founder.github_followers !== null && <span>{founder.github_followers.toLocaleString()} followers</span>}
          {founder.github_public_repos !== null && <span>{founder.github_public_repos} repos</span>}
          {founder.github_account_age_days !== null && <span>{Math.round(founder.github_account_age_days / 365)}y on GitHub</span>}
          {founder.linkedin && <span>LinkedIn</span>}
          {founder.twitter && <span>Twitter</span>}
          {founder.source && <span>via {founder.source}</span>}
        </div>
      </button>

      <div className="flex items-center justify-between pt-1 border-t border-white/5">
        <span className="text-[10px] text-ink-500">{fmtRelative(founder.updated_at)}</span>
        <div className="flex items-center gap-2">
          <button onClick={onOpen} className="text-[11px] px-2.5 py-1 rounded border border-white/10 text-ink-200 hover:bg-white/5">
            View details
          </button>
          <button
            onClick={onScore}
            disabled={scoring}
            className="text-[11px] px-2.5 py-1 rounded bg-accent text-white hover:bg-accent-soft disabled:opacity-50"
          >
            {scoring ? 'Scoring…' : founder.ai_score_breakdown ? 'Rescore' : 'Score with Claude'}
          </button>
        </div>
      </div>
    </div>
  );
}
