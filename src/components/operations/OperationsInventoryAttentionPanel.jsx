import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Link2, Package, Scissors } from 'lucide-react';

function countNonZero(...nums) {
  return nums.reduce((a, n) => a + (Number(n) > 0 ? 1 : 0), 0);
}

function SampleChip({ label, sub, onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`max-w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-left text-[9px] font-semibold text-slate-800 transition ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-teal-300 hover:bg-teal-50/40'
      }`}
    >
      <span className="font-mono text-[#134e4a]">{label}</span>
      {sub ? <span className="block truncate text-[8px] font-medium text-slate-500">{sub}</span> : null}
    </button>
  );
}

/**
 * @param {{
 *   attention: object | null | undefined;
 *   hasWorkspaceData: boolean;
 *   onOpenProductionTrace: (cuttingListId: string) => void;
 *   onGoProcurement: () => void;
 * }} props
 */
export function OperationsInventoryAttentionPanel({
  attention,
  hasWorkspaceData,
  onOpenProductionTrace,
  onGoProcurement,
}) {
  const [open, setOpen] = useState(true);

  const summary = useMemo(() => {
    if (!attention?.ok) return null;
    const sp = attention.stuckProduction || {};
    const ic = attention.inventoryChain || {};
    const cm = attention.crossModule || {};
    const stuck = Number(attention.stuckProductionAttentionDistinctJobCount) || 0;
    const invSignals = countNonZero(
      ic.wipProductsNonZero,
      ic.completionAdjustmentsLast30d,
      ic.deliveriesInProgress?.count
    );
    const crossSignals = countNonZero(cm.partialPurchaseOrderCount, cm.openInTransitLoadCount);
    return { stuck, invSignals, crossSignals, sp, ic, cm };
  }, [attention]);

  if (!hasWorkspaceData || !attention?.ok || !summary) return null;

  const { stuck, invSignals, crossSignals, sp, ic, cm } = summary;
  const th = attention.thresholds || {};
  const hasAnything = stuck > 0 || invSignals > 0 || crossSignals > 0;

  return (
    <section className="rounded-xl border border-amber-200/90 bg-amber-50/35 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left sm:px-4"
      >
        <div className="flex min-w-0 items-center gap-2">
          <AlertTriangle size={16} className="shrink-0 text-amber-700" aria-hidden />
          <div className="min-w-0">
            <h3 className="text-[11px] font-black uppercase tracking-wide text-amber-950">
              Production and inventory attention
            </h3>
            <p className="text-[9px] font-medium text-amber-900/80 truncate">
              {hasAnything
                ? `Stuck jobs · FG / WIP / deliveries · Procurement hand-offs (branch scope). Planned stale ≥${th.stalePlannedDays ?? '—'}d · Running stale ≥${th.staleRunningDays ?? '—'}d.`
                : 'No stalled jobs or cross-module gaps detected for this workspace scope.'}
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="shrink-0 text-amber-800" /> : <ChevronDown size={16} className="shrink-0 text-amber-800" />}
      </button>

      {open ? (
        <div className="border-t border-amber-200/70 px-3 pb-3 sm:px-4 sm:pb-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-white/80 bg-white/90 p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-[#134e4a]">
                <Scissors size={12} aria-hidden />
                Stuck or waiting jobs
              </div>
              <p className="mt-1 text-2xl font-black tabular-nums text-amber-950">{stuck}</p>
              <p className="mt-1 text-[9px] leading-relaxed text-slate-600">
                Distinct open jobs matching any of: no coil allocated, planned older than {th.stalePlannedDays} days,
                running longer than {th.staleRunningDays} days on the line, open manager review, or pending coil spec
                mismatch.
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold text-slate-600">
                  No coil {sp.plannedWithoutCoils?.count ?? 0}
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold text-slate-600">
                  Stale planned {sp.plannedStale?.count ?? 0}
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold text-slate-600">
                  Stale running {sp.runningStale?.count ?? 0}
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold text-slate-600">
                  Mgr review {sp.managerReviewOpen?.count ?? 0}
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold text-slate-600">
                  Spec hold {sp.coilSpecMismatchPending?.count ?? 0}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(sp.plannedWithoutCoils?.samples || []).slice(0, 4).map((s) => (
                  <SampleChip
                    key={`nc-${s.jobID}`}
                    label={s.cuttingListId || s.jobID}
                    sub={s.ageDays ? `${s.ageDays}d · ${s.customerName || '—'}` : s.customerName}
                    disabled={!s.cuttingListId}
                    onClick={() => s.cuttingListId && onOpenProductionTrace(s.cuttingListId)}
                  />
                ))}
                {(sp.runningStale?.samples || []).slice(0, 2).map((s) => (
                  <SampleChip
                    key={`rs-${s.jobID}`}
                    label={s.cuttingListId || s.jobID}
                    sub={`Running ${s.ageDays}d`}
                    disabled={!s.cuttingListId}
                    onClick={() => s.cuttingListId && onOpenProductionTrace(s.cuttingListId)}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-white/80 bg-white/90 p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-[#134e4a]">
                <Package size={12} aria-hidden />
                Inventory chain
              </div>
              <ul className="mt-2 space-y-1.5 text-[9px] font-semibold text-slate-700">
                <li className="flex justify-between gap-2">
                  <span>WIP rows (non-zero)</span>
                  <span className="tabular-nums text-[#134e4a]">{ic.wipProductsNonZero ?? 0}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>FG completion adjustments (30d)</span>
                  <span className="tabular-nums text-[#134e4a]">{ic.completionAdjustmentsLast30d ?? 0}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>Deliveries in progress</span>
                  <span className="tabular-nums text-[#134e4a]">{ic.deliveriesInProgress?.count ?? 0}</span>
                </li>
              </ul>
              <p className="mt-2 text-[8px] leading-relaxed text-slate-500">
                WIP is the parallel “transfer-to-production” path — reconcile with coil traceability when both are used.
                Adjustments indicate physical recount or scrap corrections after completion.
              </p>
            </div>

            <div className="rounded-lg border border-white/80 bg-white/90 p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-[#134e4a]">
                <Link2 size={12} aria-hidden />
                Procurement / logistics
              </div>
              <ul className="mt-2 space-y-1.5 text-[9px] font-semibold text-slate-700">
                <li className="flex justify-between gap-2">
                  <span>POs with under-received lines</span>
                  <span className="tabular-nums text-[#134e4a]">{cm.partialPurchaseOrderCount ?? 0}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>Open in-transit loads</span>
                  <span className="tabular-nums text-[#134e4a]">{cm.openInTransitLoadCount ?? 0}</span>
                </li>
              </ul>
              <button
                type="button"
                onClick={onGoProcurement}
                className="mt-3 w-full rounded-lg border border-teal-200 bg-teal-50/80 py-1.5 text-[9px] font-black uppercase tracking-wide text-[#134e4a] hover:bg-teal-100"
              >
                Open procurement
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
