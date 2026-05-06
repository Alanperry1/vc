'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { fetcher, fmtRelative, type Connection } from '@/lib/api';

interface ConnectionsResp {
  connections: Connection[];
  intro_statuses: string[];
  relationships: string[];
}

const STATUS_COLORS: Record<string, string> = {
  none: 'bg-white/5 text-ink-500',
  requested: 'bg-amber-500/15 text-amber-300',
  intro_made: 'bg-blue-500/15 text-blue-300',
  met: 'bg-emerald-500/15 text-emerald-300',
  passed: 'bg-rose-500/15 text-rose-300',
};

export default function NetworkPage() {
  const [search, setSearch] = useState('');
  const path = search.trim() ? `/connections?q=${encodeURIComponent(search.trim())}` : '/connections';
  const { data } = useSWR<ConnectionsResp>(path, fetcher, { refreshInterval: 30_000 });
  const [showAdd, setShowAdd] = useState(false);
  const connections = data?.connections ?? [];
  const statuses = data?.intro_statuses ?? ['none', 'requested', 'intro_made', 'met', 'passed'];
  const relationships = data?.relationships ?? ['operator', 'investor', 'angel', 'lp', 'advisor', 'other'];

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/connections/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intro_status: status }),
    });
    mutate('/connections');
  }

  async function deleteConn(id: string) {
    if (!confirm('Delete this connection?')) return;
    await fetch(`/api/connections/${id}`, { method: 'DELETE' });
    mutate('/connections');
  }

  // Counts by status
  const counts = statuses.reduce<Record<string, number>>((acc, s) => {
    acc[s] = connections.filter((c) => c.intro_status === s).length;
    return acc;
  }, {});

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Network</h1>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people, company, founder, handle…"
            className="w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2 text-sm placeholder:text-ink-500 focus:border-accent focus:outline-none sm:w-80"
          />
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="w-full rounded-md bg-accent px-3 py-1.5 text-xs text-white hover:bg-accent-soft sm:w-auto"
          >
            {showAdd ? 'Cancel' : '+ Add connection'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statuses.map((s) => (
          <div key={s} className="glass rounded-xl px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-ink-500">
              {s.replace(/_/g, ' ')}
            </div>
            <div className="text-2xl font-semibold text-white tabular-nums mt-0.5">
              {counts[s] ?? 0}
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <AddConnectionForm
          relationships={relationships}
          statuses={statuses}
          onDone={() => {
            setShowAdd(false);
            mutate('/connections');
          }}
        />
      )}

      <div className="glass rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-ink-500 text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Person</th>
              <th className="text-left px-4 py-2">Relation</th>
              <th className="text-left px-4 py-2">Linked to</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Updated</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {connections.length === 0 && (
              <tr>
                <td colSpan={6} className="text-sm text-ink-500 px-4 py-6 text-center">
                  {search.trim()
                    ? 'No connections match this search.'
                    : 'No connections yet — add operators, angels, or LPs in your network.'}
                </td>
              </tr>
            )}
            {connections.map((c) => (
              <tr key={c.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <div className="text-white">{c.person_name}</div>
                  {(c.person_email || c.person_handle) && (
                    <div className="text-[11px] text-ink-500">
                      {c.person_email}
                      {c.person_email && c.person_handle && ' · '}
                      {c.person_handle}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-ink-500 capitalize">{c.relationship}</td>
                <td className="px-4 py-3 text-xs">
                  {c.company_name && <div className="text-white">{c.company_name}</div>}
                  {c.founder_name && <div className="text-ink-500">{c.founder_name}</div>}
                  {!c.company_name && !c.founder_name && <span className="text-ink-500">—</span>}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={c.intro_status}
                    onChange={(e) => updateStatus(c.id, e.target.value)}
                    className={`text-[11px] px-2 py-1 rounded border-0 outline-none ${STATUS_COLORS[c.intro_status] ?? 'bg-white/5'}`}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s} className="bg-ink-900 text-white">
                        {s.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-[11px] text-ink-500">{fmtRelative(c.updated_at)}</td>
                <td className="px-2 py-3">
                  <button
                    onClick={() => deleteConn(c.id)}
                    className="text-[11px] text-ink-500 hover:text-rose-300"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddConnectionForm({
  relationships,
  statuses,
  onDone,
}: {
  relationships: string[];
  statuses: string[];
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    person_name: '',
    person_email: '',
    person_handle: '',
    relationship: 'operator',
    intro_status: 'none',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.person_name.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/connections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass rounded-xl p-4 grid md:grid-cols-3 gap-3 text-sm">
      <input
        required
        placeholder="Name *"
        value={form.person_name}
        onChange={(e) => setForm({ ...form, person_name: e.target.value })}
        className="bg-ink-900 border border-white/10 rounded px-3 py-2 placeholder:text-ink-500 focus:border-accent focus:outline-none"
      />
      <input
        placeholder="Email"
        value={form.person_email}
        onChange={(e) => setForm({ ...form, person_email: e.target.value })}
        className="bg-ink-900 border border-white/10 rounded px-3 py-2 placeholder:text-ink-500 focus:border-accent focus:outline-none"
      />
      <input
        placeholder="Handle (e.g. @paulg)"
        value={form.person_handle}
        onChange={(e) => setForm({ ...form, person_handle: e.target.value })}
        className="bg-ink-900 border border-white/10 rounded px-3 py-2 placeholder:text-ink-500 focus:border-accent focus:outline-none"
      />
      <select
        value={form.relationship}
        onChange={(e) => setForm({ ...form, relationship: e.target.value })}
        className="bg-ink-900 border border-white/10 rounded px-3 py-2 focus:border-accent focus:outline-none"
      >
        {relationships.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <select
        value={form.intro_status}
        onChange={(e) => setForm({ ...form, intro_status: e.target.value })}
        className="bg-ink-900 border border-white/10 rounded px-3 py-2 focus:border-accent focus:outline-none"
      >
        {statuses.map((s) => (
          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
        ))}
      </select>
      <input
        placeholder="Notes"
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
        className="bg-ink-900 border border-white/10 rounded px-3 py-2 placeholder:text-ink-500 focus:border-accent focus:outline-none"
      />
      <div className="md:col-span-3 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:bg-accent-soft disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save connection'}
        </button>
      </div>
    </form>
  );
}
