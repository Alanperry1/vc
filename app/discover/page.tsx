'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetcher, type Company } from '@/lib/api';
import { CompanyCard } from '@/components/CompanyCard';
import { CompanyDrawer } from '@/components/CompanyDrawer';

const PAGE_SIZE = 24;

const SECTORS = [
  { value: '', label: 'All' },
  { value: 'ai', label: 'AI' },
  { value: 'devtools', label: 'Devtools' },
  { value: 'fintech', label: 'Fintech' },
  { value: 'security', label: 'Security' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'health', label: 'Health' },
];
const STAGES = [
  { value: '', label: 'All' },
  { value: 'pre-seed', label: 'Pre-seed' },
  { value: 'seed', label: 'Seed' },
  { value: 'series-a', label: 'Series A' },
  { value: 'series-b', label: 'Series B' },
  { value: 'series-c', label: 'Series C' },
];
const SOURCES = [
  { value: '', label: 'All' },
  { value: 'github', label: 'GitHub' },
  { value: 'hn', label: 'HN' },
  { value: 'yc', label: 'YC' },
  { value: 'reddit', label: 'Reddit' },
  { value: 'producthunt', label: 'Product Hunt' },
];

interface CompaniesResponse {
  companies: Company[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export default function DiscoverPage() {
  const [sector, setSector] = useState('');
  const [stage, setStage] = useState('');
  const [source, setSource] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const filterParams = new URLSearchParams();
  if (sector) filterParams.set('sector', sector);
  if (stage) filterParams.set('stage', stage);
  if (source) filterParams.set('source', source);
  if (minScore > 0) filterParams.set('min_score', String(minScore));
  if (searchTerm) filterParams.set('q', searchTerm);
  filterParams.set('limit', String(PAGE_SIZE));
  filterParams.set('page', String(page));

  const path = `/companies?${filterParams.toString()}`;
  const { data, isLoading } = useSWR<CompaniesResponse>(
    path,
    fetcher,
  );

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearchTerm(query.trim());
  }

  function clearSearch() {
    setQuery('');
    setSearchTerm('');
    setPage(1);
  }

  const companies = data?.companies ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.pageSize ?? PAGE_SIZE)));
  const rangeStart = total === 0 ? 0 : (page - 1) * (data?.pageSize ?? PAGE_SIZE) + 1;
  const rangeEnd = Math.min(total, page * (data?.pageSize ?? PAGE_SIZE));

  return (
    <div className="min-w-0 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Discover</h1>
      </header>

      <form onSubmit={runSearch} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Try "open-source AI agents for support" or "stealth crypto infra"…'
          className="flex-1 bg-ink-900 border border-white/10 rounded-lg px-4 py-2.5 text-sm placeholder:text-ink-500 focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-soft disabled:opacity-50 sm:w-auto"
        >
          Search
        </button>
        {searchTerm && (
          <button
            type="button"
            onClick={clearSearch}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-ink-500 hover:text-white sm:w-auto"
          >
            Clear
          </button>
        )}
      </form>

      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        <aside className="glass h-fit min-w-0 space-y-4 rounded-xl p-4">
          <Filter label="Source" value={source} onChange={(v) => { setSource(v); setPage(1); }} options={SOURCES} />
          <Filter label="Sector" value={sector} onChange={(v) => { setSector(v); setPage(1); }} options={SECTORS} />
          <Filter label="Stage" value={stage} onChange={(v) => { setStage(v); setPage(1); }} options={STAGES} />
          <div>
            <label className="text-xs text-ink-500 uppercase tracking-wide block mb-2">
              Min AI Score: {minScore.toFixed(1)}
            </label>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={minScore}
              onChange={(e) => {
                setMinScore(Number(e.target.value));
                setPage(1);
              }}
              className="w-full accent-accent"
            />
          </div>
          <div className="text-xs text-ink-500 pt-2 border-t border-white/5">
            {total === 0 ? '0 companies' : `Showing ${rangeStart}-${rangeEnd} of ${total}`}
          </div>
        </aside>

        <section className="min-w-0">
          {isLoading ? (
            <div className="text-sm text-ink-500">Loading…</div>
          ) : companies.length === 0 ? (
            <div className="text-sm text-ink-500">No companies match these filters.</div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                {companies.map((c) => (
                  <CompanyCard key={c.id} company={c} onSelect={() => setSelected(c.id)} />
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-ink-500">
                  Page {page} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!data?.hasNext}
                    className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <CompanyDrawer companyId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="text-xs text-ink-500 uppercase tracking-wide block mb-2">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value || 'all'}
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 rounded text-xs ${
              value === opt.value
                ? 'bg-accent text-white'
                : 'bg-white/5 text-ink-500 hover:text-white hover:bg-white/10'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
