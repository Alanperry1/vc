'use client';

import { fmtMoney, momentumTag, type Company } from '@/lib/api';
import Link from 'next/link';

export function CompanyCard({
  company,
  onSelect,
}: {
  company: Company;
  onSelect?: (c: Company) => void;
}) {
  const score = company.ai_score;
  const visibleSources = (company.sources?.length ? company.sources : company.source ? [company.source] : [])
    .slice(0, 2);
  const extraSourceCount = (company.sources?.length ?? 0) - visibleSources.length;
  return (
    <button
      onClick={() => onSelect?.(company)}
      className="glass rounded-xl p-4 text-left hover:border-accent/50 transition group w-full"
    >
      <div className="flex items-start gap-3">
        {company.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={company.logo_url}
            alt=""
            className="w-9 h-9 rounded-lg bg-ink-800 object-cover"
          />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-ink-800 grid place-items-center text-ink-500 text-xs font-bold">
            {company.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-white truncate group-hover:text-accent-soft">
              {company.name}
            </h3>
            {score !== null && score !== undefined && (
              <span className="score-pill">★ {score.toFixed(1)}</span>
            )}
          </div>
          <p className="text-xs text-ink-500 mt-0.5 line-clamp-2">
            {company.description ?? 'No description yet.'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
            {company.sector && <Tag>{company.sector}</Tag>}
            {company.stage && <Tag>{company.stage}</Tag>}
            {company.momentum_score != null && <Tag>{momentumTag(company, company.momentum_score)}</Tag>}
            {company.raised_usd != null && <Tag>{fmtMoney(company.raised_usd)}</Tag>}
            {visibleSources.map((source) => (
              <Tag key={source} muted>
                via {source}
              </Tag>
            ))}
            {extraSourceCount > 0 && <Tag muted>+{extraSourceCount} more</Tag>}
          </div>
        </div>
      </div>
    </button>
  );
}

function Tag({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded ${
        muted ? 'bg-white/5 text-ink-500' : 'bg-accent/10 text-accent-soft'
      }`}
    >
      {children}
    </span>
  );
}

export function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent-soft hover:underline text-xs"
    >
      {label} ↗
    </Link>
  );
}
