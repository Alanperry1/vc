'use client';

import { useEffect, useState } from 'react';
import useSWR, { mutate } from 'swr';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { fetcher, fmtMoney, momentumTag, patchJson, type Deal } from '@/lib/api';
import { CompanyDrawer } from '@/components/CompanyDrawer';

const STAGE_LABELS: Record<string, string> = {
  sourced: 'Sourced',
  contacted: 'Contacted',
  diligence: 'Diligence',
  term_sheet: 'Term Sheet',
  closed: 'Closed',
  passed: 'Passed',
};

interface PipelineResp {
  stages: string[];
  deals: Record<string, Deal[]>;
}

export default function PipelinePage() {
  const { data } = useSWR<PipelineResp>('/pipeline', fetcher, { refreshInterval: 30_000 });
  const [board, setBoard] = useState<PipelineResp | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openCompany, setOpenCompany] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (data) setBoard(data);
  }, [data]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  if (!board) return <div className="text-ink-500">Loading…</div>;

  function matchesSearch(stage: string, deal: Deal) {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return true;

    return [deal.company_name, deal.sector, deal.homepage, STAGE_LABELS[stage] ?? stage]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(needle));
  }

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchTerm(query.trim());
  }

  function clearSearch() {
    setQuery('');
    setSearchTerm('');
  }

  function findDeal(id: string): { deal: Deal; stage: string } | null {
    if (!board) return null;
    for (const stage of board.stages) {
      const deal = board.deals[stage]?.find((d) => d.id === id);
      if (deal) return { deal, stage };
    }
    return null;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || !board) return;
    const dealId = String(active.id);
    const fromInfo = findDeal(dealId);
    if (!fromInfo) return;

    const overId = String(over.id);
    // overId is either a stage column id ("col:sourced") or another deal id.
    let toStage = overId.startsWith('col:') ? overId.slice(4) : findDeal(overId)?.stage;
    if (!toStage || !board.stages.includes(toStage)) return;
    if (toStage === fromInfo.stage) return;

    const next: PipelineResp = {
      stages: board.stages,
      deals: { ...board.deals },
    };
    next.deals[fromInfo.stage] = next.deals[fromInfo.stage].filter((d) => d.id !== dealId);
    next.deals[toStage] = [{ ...fromInfo.deal, stage: toStage }, ...(next.deals[toStage] ?? [])];
    setBoard(next);

    patchJson(`/deals/${dealId}`, { stage: toStage })
      .then(() => mutate('/pipeline'))
      .catch(() => mutate('/pipeline')); // revert on error via refetch
  }

  const active = activeId ? findDeal(activeId)?.deal : null;
  const totalDeals = board.stages.reduce((n, s) => n + (board.deals[s]?.length ?? 0), 0);
  const visibleDeals = board.stages.reduce((n, stage) => {
    return n + (board.deals[stage] ?? []).filter((deal) => matchesSearch(stage, deal)).length;
  }, 0);

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Pipeline</h1>
          <p className="mt-1 text-xs text-ink-500">
            {searchTerm
              ? `Showing ${visibleDeals} of ${totalDeals} deals for “${searchTerm}”`
              : `${totalDeals} active deals across your pipeline`}
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-end xl:w-auto">
          <form onSubmit={runSearch} className="flex w-full flex-col gap-2 sm:flex-row xl:w-[420px]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search company, sector, or stage…"
              className="flex-1 rounded-lg border border-white/10 bg-ink-900 px-3 py-2 text-sm placeholder:text-ink-500 focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-soft"
            >
              Search
            </button>
            {searchTerm && (
              <button
                type="button"
                onClick={clearSearch}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-ink-500 hover:text-white"
              >
                Clear
              </button>
            )}
          </form>
          <div className="text-left lg:text-right">
            <div className="text-2xl font-semibold text-white tabular-nums">{totalDeals}</div>
            <div className="text-xs text-ink-500 uppercase tracking-wide">active deals</div>
          </div>
        </div>
      </header>

      {searchTerm && visibleDeals === 0 && (
        <div className="text-sm text-ink-500">No pipeline deals match this search.</div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {board.stages.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              deals={(board.deals[stage] ?? []).filter((deal) => matchesSearch(stage, deal))}
              onOpen={(companyId) => setOpenCompany(companyId)}
            />
          ))}
        </div>
        <DragOverlay>{active ? <Card deal={active} dragging /> : null}</DragOverlay>
      </DndContext>

      <CompanyDrawer companyId={openCompany} onClose={() => setOpenCompany(null)} />
    </div>
  );
}

function Column({
  stage,
  deals,
  onOpen,
}: {
  stage: string;
  deals: Deal[];
  onOpen: (companyId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage}` });
  return (
    <div
      ref={setNodeRef}
      className={`glass rounded-xl p-3 min-h-[400px] flex flex-col gap-2 transition ${
        isOver ? 'border-accent/60' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-xs uppercase tracking-wide text-white font-semibold">
          {STAGE_LABELS[stage] ?? stage}
        </span>
        <span className="text-xs text-ink-500 tabular-nums">{deals.length}</span>
      </div>
      {deals.length === 0 && (
        <div className="text-xs text-ink-500 italic px-1 py-2">empty</div>
      )}
      {deals.map((d) => (
        <DraggableCard key={d.id} deal={d} onOpen={() => onOpen(d.company_id)} />
      ))}
    </div>
  );
}

function DraggableCard({ deal, onOpen }: { deal: Deal; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  // Click (not drag) opens the drawer. dnd-kit's PointerSensor with distance:5
  // already discriminates clicks from drags, so a plain onClick is reliable.
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <Card deal={deal} />
    </div>
  );
}

function Card({ deal, dragging }: { deal: Deal; dragging?: boolean }) {
  return (
    <div
      className={`glass rounded-lg p-3 cursor-grab active:cursor-grabbing border ${
        dragging ? 'border-accent shadow-2xl' : 'border-white/5'
      }`}
    >
      <div className="flex items-center gap-2">
        {deal.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={deal.logo_url} alt="" className="w-6 h-6 rounded bg-ink-800" />
        ) : (
          <div className="w-6 h-6 rounded bg-ink-800 grid place-items-center text-[10px] text-ink-500 font-bold">
            {deal.company_name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <span className="text-sm text-white truncate flex-1">{deal.company_name}</span>
      </div>
      <div className="mt-2 flex items-start justify-between gap-2 text-[11px] text-ink-500">
        <div className="flex min-w-0 flex-wrap gap-2">
          {deal.sector && (
            <span className="inline-flex whitespace-nowrap rounded bg-accent/10 px-1.5 py-0.5 text-accent-soft">
              {deal.sector}
            </span>
          )}
          {deal.momentum_score != null && (
            <span className="inline-flex whitespace-nowrap rounded bg-white/5 px-1.5 py-0.5 text-ink-300">
              {momentumTag(deal, deal.momentum_score)}
            </span>
          )}
          {deal.raised_usd != null && (
            <span className="inline-flex whitespace-nowrap rounded bg-white/5 px-1.5 py-0.5 text-ink-300">
              {fmtMoney(deal.raised_usd)}
            </span>
          )}
        </div>
        {deal.ai_score !== null && deal.ai_score !== undefined && (
          <span className="score-pill shrink-0">★ {deal.ai_score.toFixed(1)}</span>
        )}
      </div>
    </div>
  );
}
