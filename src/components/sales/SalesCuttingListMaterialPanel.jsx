import React from 'react';
import { Factory, CheckCircle2, AlertTriangle } from 'lucide-react';

/**
 * Sidebar on Sales → Cutting list: waiting lists whose linked quote coil spec matches in-stock coil.
 * @param {{
 *   ready: Array<{ cl: object; matches: object[]; totalKg: number; totalEstM: number; needM: number; meterCoverageOk: boolean }>;
 *   waitingWithSpecNoStock: number;
 *   onOpenCuttingList: (cl: object) => void;
 * }} props
 */
export default function SalesCuttingListMaterialPanel({ ready, waitingWithSpecNoStock, onOpenCuttingList }) {
  return (
    <section className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
      <div className="h-1 bg-sky-600" aria-hidden />
      <div className="p-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
          <Factory size={14} className="text-sky-600 shrink-0" strokeWidth={2} />
          Material vs waiting lists
        </p>
        <p className="text-[11px] text-slate-500 mt-1 leading-snug">
          Waiting lists with a material spec on the linked quote and at least one in-stock coil line that matches gauge /
          colour / material (same check as Operations).
        </p>

        {ready.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-3">
            <p className="text-[11px] font-semibold text-slate-600">No matching stock alerts</p>
            <p className="text-[10px] text-slate-500 mt-1 leading-snug">
              {waitingWithSpecNoStock > 0
                ? `${waitingWithSpecNoStock} waiting list(s) have a spec on the quote but no matching coil in the current inventory view.`
                : 'Add gauge / colour / material on quotations, or ensure cutting lists are linked to quotes with specs.'}
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3">
              <p className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="shrink-0 text-emerald-600" strokeWidth={2} />
                {ready.length} list{ready.length === 1 ? '' : 's'} — coil matches stock
              </p>
              <p className="text-[10px] text-emerald-900/80 mt-1 leading-snug">
                Yard / store lines match the linked quote. Operations can prioritise these jobs.
              </p>
            </div>

            <ul className="max-h-[min(340px,48vh)] overflow-y-auto custom-scrollbar space-y-2 pr-0.5">
              {ready.map(({ cl, totalKg, totalEstM, needM, meterCoverageOk }) => (
                <li key={cl.id}>
                  <button
                    type="button"
                    onClick={() => onOpenCuttingList(cl)}
                    className="w-full text-left rounded-lg border border-slate-200/90 bg-slate-50/60 hover:bg-white hover:border-sky-200/80 px-2.5 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25"
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <p className="text-[11px] font-bold text-[#134e4a] tabular-nums truncate min-w-0">
                        {cl.id}
                      </p>
                      {!meterCoverageOk && needM > 0 ? (
                        <span title="Estimated stock metres are below list total (rough yield)">
                          <AlertTriangle
                            size={14}
                            className="shrink-0 text-amber-600"
                            strokeWidth={2}
                            aria-hidden
                          />
                        </span>
                      ) : (
                        <CheckCircle2 size={14} className="shrink-0 text-emerald-600" strokeWidth={2} aria-hidden />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600 truncate mt-0.5">{cl.customer}</p>
                    <p className="text-[9px] text-slate-500 mt-1 tabular-nums leading-snug">
                      List {needM > 0 ? `~${needM.toLocaleString()} m` : 'm n/a'} · Stock ~{totalEstM.toLocaleString()} m
                      est · {totalKg.toLocaleString()} kg
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {ready.length > 0 && waitingWithSpecNoStock > 0 ? (
          <p className="text-[9px] text-slate-400 mt-3 leading-snug">
            {waitingWithSpecNoStock} other waiting list(s) have a quote spec but no matching coil in inventory.
          </p>
        ) : null}
      </div>
    </section>
  );
}
