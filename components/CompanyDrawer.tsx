'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  API_BASE,
  fmtMoney,
  fmtRelative,
  postJson,
  type Company,
  type Signal,
} from '@/lib/api';
import { ExternalLink } from './CompanyCard';

interface DetailResponse {
  company: Company;
  signals: Signal[];
  memo: { id: string; markdown: string; model: string } | null;
}

export function CompanyDrawer({
  companyId,
  onClose,
}: {
  companyId: string | null;
  onClose: () => void;
}) {
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(companyId);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [memoLoading, setMemoLoading] = useState(false);

  useEffect(() => {
    setActiveCompanyId(companyId);
  }, [companyId]);

  useEffect(() => {
    if (!activeCompanyId) return;
    setLoading(true);
    setData(null);
    fetch(`${API_BASE}/companies/${activeCompanyId}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [activeCompanyId]);

  if (!activeCompanyId) return null;

  const c = data?.company;
  const breakdown = c?.ai_score_breakdown ?? null;

  async function generateMemo() {
    if (!activeCompanyId) return;
    setMemoLoading(true);
    try {
      const memo = await postJson<{ id: string; markdown: string; model: string }>(
        `/companies/${activeCompanyId}/memo`,
        {},
      );
      setData((d) => (d ? { ...d, memo } : d));
    } finally {
      setMemoLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl h-full bg-ink-900 border-l border-white/10 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 sticky top-0 bg-ink-900/95 border-b border-white/5 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-white truncate">
              {c?.name ?? 'Loading…'}
            </h2>
            {c?.description && (
              <p className="text-sm text-ink-500 mt-1 line-clamp-2">{c.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-ink-500 hover:text-white text-xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {loading && <div className="p-6 text-ink-500">Loading…</div>}

        {c && (
          <div className="p-6 space-y-6">
            <section className="grid grid-cols-2 gap-3">
              <Stat label="AI Score" value={c.ai_score?.toFixed(1) ?? '—'} accent />
              <Stat label="Momentum" value={c.momentum_score?.toFixed(1) ?? '—'} />
              <Stat label="Stage" value={c.stage ?? '—'} />
              <Stat label="Raised" value={fmtMoney(c.raised_usd)} />
            </section>

            {breakdown && (
              <section className="glass rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Score breakdown</h3>
                <div className="space-y-2">
                  {(['market', 'differentiation', 'timing', 'team', 'traction'] as const).map(
                    (k) => (
                      <ScoreBar key={k} label={k} value={breakdown[k] ?? 0} />
                    ),
                  )}
                </div>
                {breakdown.rationale && (
                  <p className="text-xs text-ink-500 mt-3 italic">"{breakdown.rationale}"</p>
                )}
              </section>
            )}

            <section className="flex flex-wrap gap-3 text-xs">
              {c.homepage && <ExternalLink href={c.homepage} label="Homepage" />}
              {c.github_url && <ExternalLink href={c.github_url} label="GitHub" />}
              {c.hn_url && <ExternalLink href={c.hn_url} label="Hacker News" />}
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">Investment Memo</h3>
                <button
                  onClick={generateMemo}
                  disabled={memoLoading}
                  className="text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:bg-accent-soft disabled:opacity-50"
                >
                  {memoLoading ? 'Generating…' : data?.memo ? 'Regenerate' : 'Generate with Claude'}
                </button>
              </div>
              {data?.memo ? (
                <div className="markdown glass rounded-xl p-4">
                  <ReactMarkdown>{data.memo.markdown}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-xs text-ink-500">
                  No memo yet. Generate one to see Claude's investment thesis.
                </p>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-white mb-2">
                Signals ({data?.signals.length ?? 0})
              </h3>
              <ul className="space-y-2">
                {data?.signals.map((s) => (
                  <li key={s.id} className="text-xs text-ink-500 border-l-2 border-white/10 pl-3 py-1">
                    <div className="flex items-center gap-2">
                      <span className="text-accent-soft">[{s.signal_type}]</span>
                      <span className="text-ink-500">{fmtRelative(s.occurred_at)}</span>
                    </div>
                    <div className="text-white/80 mt-0.5">{s.title}</div>
                    {s.url && <ExternalLink href={s.url} label={s.source} />}
                  </li>
                ))}
              </ul>
            </section>

            <SimilarCompanies companyId={c.id} onSelect={setActiveCompanyId} />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass rounded-xl px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className={`text-xl font-semibold mt-0.5 ${accent ? 'text-accent-soft' : 'text-white'}`}>
        {value}
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(10, value)) * 10;
  return (
    <div>
      <div className="flex justify-between text-[11px] text-ink-500 mb-1">
        <span className="capitalize">{label}</span>
        <span className="text-white font-mono">{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent to-accent-soft"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface SimilarRow {
  id: string;
  name: string;
  sector: string | null;
  description: string | null;
  ai_score: number | null;
  similarity: number;
}

function SimilarCompanies({
  companyId,
  onSelect,
}: {
  companyId: string;
  onSelect: (id: string) => void;
}) {
  const [items, setItems] = useState<SimilarRow[] | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/companies/${companyId}/similar`)
      .then((r) => r.json())
      .then((res: { similar: SimilarRow[]; reason?: string }) => {
        if (cancelled) return;
        setItems(res.similar ?? []);
        setReason(res.reason ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (items === null) return null;
  if (items.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-white mb-2">Similar companies</h3>
        <p className="text-xs text-ink-500">
          {reason === 'embeddings_disabled'
            ? 'Set VOYAGE_API_KEY for semantic similarity (currently using fuzzy text match).'
            : 'No similar companies indexed yet.'}
        </p>
      </section>
    );
  }
  return (
    <section>
      <h3 className="text-sm font-semibold text-white mb-2">Similar companies</h3>
      <ul className="space-y-1.5">
        {items.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => onSelect(s.id)}
              className="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs glass hover:border-accent/40"
            >
              <div className="min-w-0">
                <div className="truncate text-white">{s.name}</div>
                {s.description && (
                  <div className="mt-0.5 line-clamp-1 text-ink-500">{s.description}</div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-accent-soft">{(s.similarity * 100).toFixed(0)}%</div>
                {s.ai_score != null && <div className="mt-0.5 text-ink-500">{s.ai_score.toFixed(1)}</div>}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
