'use client';

import { useEffect, useState } from 'react';
import useSWR, { mutate } from 'swr';
import {
  fetcher,
  fmtRelative,
  postJson,
  type Company,
  type Connection,
  type Founder,
} from '@/lib/api';
import { ExternalLink } from './CompanyCard';

interface FounderDetailResponse {
  founder: Founder;
  companies: Array<Company & { role: string | null }>;
  connections: Connection[];
}

const RELATIONSHIPS = ['operator', 'investor', 'angel', 'lp', 'advisor', 'other'];
const INTRO_STATUSES = ['none', 'requested', 'intro_made', 'met', 'passed'];

function toHandle(value: string): string {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const segment = new URL(value).pathname.split('/').filter(Boolean).at(-1);
      return segment ? `@${segment}` : '';
    } catch {
      return '';
    }
  }
  return value.startsWith('@') ? value : `@${value}`;
}

function defaultHandle(founder: Founder | undefined): string {
  if (!founder) return '';
  if (founder.twitter) return toHandle(founder.twitter);
  if (founder.github_login) return toHandle(founder.github_login);
  return '';
}

function socialUrl(value: string | null | undefined, kind: 'github' | 'twitter' | 'linkedin'): string | null {
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (kind === 'github') return `https://github.com/${value.replace(/^@/, '')}`;
  if (kind === 'twitter') return `https://x.com/${value.replace(/^@/, '')}`;
  return value;
}

export function FounderDrawer({
  founderId,
  onClose,
}: {
  founderId: string | null;
  onClose: () => void;
}) {
  const path = founderId ? `/founders/${founderId}` : null;
  const { data, isLoading } = useSWR<FounderDetailResponse>(path, fetcher);
  const [showAddConnection, setShowAddConnection] = useState(false);
  const [savingConnection, setSavingConnection] = useState(false);
  const [connectionForm, setConnectionForm] = useState({
    person_name: '',
    person_email: '',
    person_handle: '',
    relationship: 'operator',
    intro_status: 'none',
    notes: '',
  });

  const founder = data?.founder;

  useEffect(() => {
    if (!founder) return;
    setConnectionForm({
      person_name: founder.name,
      person_email: '',
      person_handle: defaultHandle(founder),
      relationship: 'operator',
      intro_status: 'none',
      notes: '',
    });
    setShowAddConnection(false);
  }, [founder]);

  if (!founderId) return null;

  const companies = data?.companies ?? [];
  const connections = data?.connections ?? [];
  const breakdown = founder?.ai_score_breakdown ?? null;
  const githubUrl = socialUrl(founder?.github_login, 'github');
  const twitterUrl = socialUrl(founder?.twitter, 'twitter');
  const linkedinUrl = socialUrl(founder?.linkedin, 'linkedin');

  async function addConnection(e: React.FormEvent) {
    e.preventDefault();
    if (!founder || !connectionForm.person_name.trim()) return;
    setSavingConnection(true);
    try {
      await postJson<{ ok: true; id: string }>('/connections', {
        ...connectionForm,
        founder_id: founder.id,
      });
      await Promise.all([
        path ? mutate(path) : Promise.resolve(),
        mutate('/connections'),
      ]);
      setShowAddConnection(false);
    } finally {
      setSavingConnection(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-ink-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/5 bg-ink-900/95 p-6">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-white">{founder?.name ?? 'Loading…'}</h2>
            {founder?.bio && <p className="mt-1 line-clamp-2 text-sm text-ink-500">{founder.bio}</p>}
          </div>
          <button
            onClick={onClose}
            className="px-2 text-xl leading-none text-ink-500 hover:text-white"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {isLoading && <div className="p-6 text-ink-500">Loading…</div>}

        {founder && (
          <div className="space-y-6 p-6">
            <section className="grid grid-cols-2 gap-3">
              <FounderStat label="AI Score" value={founder.ai_score?.toFixed(1) ?? '—'} accent />
              <FounderStat label="Source" value={founder.source ?? '—'} />
              <FounderStat
                label="Followers"
                value={founder.github_followers?.toLocaleString() ?? '—'}
              />
              <FounderStat
                label="GitHub Age"
                value={founder.github_account_age_days != null ? `${Math.round(founder.github_account_age_days / 365)}y` : '—'}
              />
            </section>

            {(githubUrl || twitterUrl || linkedinUrl) && (
              <section className="flex flex-wrap gap-3 text-xs">
                {githubUrl && <ExternalLink href={githubUrl} label="GitHub" />}
                {twitterUrl && <ExternalLink href={twitterUrl} label="Twitter / X" />}
                {linkedinUrl && <ExternalLink href={linkedinUrl} label="LinkedIn" />}
              </section>
            )}

            {breakdown && (
              <section className="glass rounded-xl p-4">
                <h3 className="mb-3 text-sm font-semibold text-white">Founder score breakdown</h3>
                <div className="space-y-2">
                  {([
                    'track_record',
                    'domain_expertise',
                    'founder_market_fit',
                    'execution_velocity',
                    'network_strength',
                  ] as const).map((key) => (
                    <FounderScoreBar key={key} label={key} value={breakdown[key]} />
                  ))}
                </div>
                {breakdown.rationale && (
                  <p className="mt-3 text-xs italic text-ink-500">"{breakdown.rationale}"</p>
                )}
                {breakdown.red_flags && breakdown.red_flags.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[11px] text-amber-300/80">
                    {breakdown.red_flags.map((flag, index) => (
                      <li key={index}>⚠ {flag}</li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-semibold text-white">Linked companies ({companies.length})</h3>
              {companies.length === 0 ? (
                <p className="text-xs text-ink-500">No linked companies yet.</p>
              ) : (
                <ul className="space-y-2">
                  {companies.map((company) => (
                    <li key={company.id} className="glass rounded-lg px-3 py-2 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-white">{company.name}</div>
                          <div className="mt-0.5 text-ink-500">
                            {[company.role, company.sector, company.stage].filter(Boolean).join(' · ') || 'linked'}
                          </div>
                        </div>
                        {company.ai_score != null && (
                          <div className="shrink-0 font-mono text-accent-soft">{company.ai_score.toFixed(1)}</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">Network links ({connections.length})</h3>
                <button
                  onClick={() => setShowAddConnection((value) => !value)}
                  className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-ink-200 hover:bg-white/5"
                >
                  {showAddConnection ? 'Cancel' : 'Add network link'}
                </button>
              </div>
              {showAddConnection && founder && (
                <form onSubmit={addConnection} className="glass mb-3 grid gap-2 rounded-xl p-3 text-xs sm:grid-cols-2">
                  <input
                    required
                    placeholder="Person name"
                    value={connectionForm.person_name}
                    onChange={(e) => setConnectionForm((form) => ({ ...form, person_name: e.target.value }))}
                    className="rounded border border-white/10 bg-ink-900 px-3 py-2 text-xs placeholder:text-ink-500 focus:border-accent focus:outline-none"
                  />
                  <input
                    placeholder="Email"
                    value={connectionForm.person_email}
                    onChange={(e) => setConnectionForm((form) => ({ ...form, person_email: e.target.value }))}
                    className="rounded border border-white/10 bg-ink-900 px-3 py-2 text-xs placeholder:text-ink-500 focus:border-accent focus:outline-none"
                  />
                  <input
                    placeholder="Handle"
                    value={connectionForm.person_handle}
                    onChange={(e) => setConnectionForm((form) => ({ ...form, person_handle: e.target.value }))}
                    className="rounded border border-white/10 bg-ink-900 px-3 py-2 text-xs placeholder:text-ink-500 focus:border-accent focus:outline-none"
                  />
                  <select
                    value={connectionForm.relationship}
                    onChange={(e) => setConnectionForm((form) => ({ ...form, relationship: e.target.value }))}
                    className="rounded border border-white/10 bg-ink-900 px-3 py-2 text-xs focus:border-accent focus:outline-none"
                  >
                    {RELATIONSHIPS.map((relationship) => (
                      <option key={relationship} value={relationship}>
                        {relationship}
                      </option>
                    ))}
                  </select>
                  <select
                    value={connectionForm.intro_status}
                    onChange={(e) => setConnectionForm((form) => ({ ...form, intro_status: e.target.value }))}
                    className="rounded border border-white/10 bg-ink-900 px-3 py-2 text-xs focus:border-accent focus:outline-none"
                  >
                    {INTRO_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Notes"
                    value={connectionForm.notes}
                    onChange={(e) => setConnectionForm((form) => ({ ...form, notes: e.target.value }))}
                    className="rounded border border-white/10 bg-ink-900 px-3 py-2 text-xs placeholder:text-ink-500 focus:border-accent focus:outline-none sm:col-span-2"
                  />
                  <div className="flex justify-end sm:col-span-2">
                    <button
                      type="submit"
                      disabled={savingConnection}
                      className="rounded-md bg-accent px-3 py-1.5 text-[11px] text-white hover:bg-accent-soft disabled:opacity-50"
                    >
                      {savingConnection ? 'Saving…' : 'Save network link'}
                    </button>
                  </div>
                </form>
              )}
              {connections.length === 0 ? (
                <p className="text-xs text-ink-500">No network connections linked to this founder yet.</p>
              ) : (
                <ul className="space-y-2">
                  {connections.map((connection) => (
                    <li key={connection.id} className="glass rounded-lg px-3 py-2 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-white">{connection.person_name}</div>
                          <div className="mt-0.5 text-ink-500">
                            {[connection.relationship, connection.intro_status.replace(/_/g, ' ')].join(' · ')}
                          </div>
                        </div>
                        <div className="shrink-0 text-ink-500">{fmtRelative(connection.updated_at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function FounderStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="glass rounded-xl px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold ${accent ? 'text-accent-soft' : 'text-white'}`}>
        {value}
      </div>
    </div>
  );
}

function FounderScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(10, value)) * 10;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-ink-500">
        <span className="capitalize">{label.replace(/_/g, ' ')}</span>
        <span className="font-mono text-white">{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="h-full bg-gradient-to-r from-accent to-accent-soft" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}