import React from 'react';
import { Trophy } from 'lucide-react';

export function TopMaterialPerformersPanel({ rows, formatNgn, formatPerformerGauge, onOpenSales }) {
  return (
    <section className="bg-white p-6 md:p-8 rounded-xl border border-slate-200/90 shadow-sm">
      <div className="flex flex-col gap-4 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[#134e4a]">
              <Trophy size={20} strokeWidth={2} />
            </span>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-700">
                Top material performers (production)
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xl leading-relaxed">
                By <span className="font-medium text-slate-600">colour</span>,{' '}
                <span className="font-medium text-slate-600">gauge</span>, and{' '}
                <span className="font-medium text-slate-600">profile</span> — actual metres from jobs completed this
                month; NGN is each job share of its quotation total (by actual metres across completed jobs for that
                quote).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenSales}
            className="text-[10px] font-semibold text-[#134e4a] uppercase tracking-wide hover:underline shrink-0 self-start sm:self-auto"
          >
            Sales detail
          </button>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 w-full sm:w-auto">
          <span className="px-2.5 sm:px-3 py-1.5 rounded-md text-[9px] font-semibold uppercase tracking-wide bg-white text-[#134e4a] shadow-sm border border-slate-200/80">
            This month (MTD)
          </span>
        </div>
      </div>

      <div className="hidden sm:grid sm:grid-cols-[2.5rem_minmax(0,4.5rem)_minmax(0,5rem)_minmax(0,1fr)_minmax(0,10.5rem)_minmax(0,7rem)] gap-x-3 gap-y-1 px-3 py-2 border-b border-slate-200 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
        <span className="text-center">#</span>
        <span>Colour</span>
        <span>Gauge</span>
        <span>Material</span>
        <span className="text-right tabular-nums">
          <span className="inline-flex flex-wrap justify-end gap-x-2 gap-y-0">
            <span>Metres</span>
            <span className="text-slate-300 font-normal">·</span>
            <span>kg</span>
          </span>
        </span>
        <span className="text-right tabular-nums">Sales (NGN)</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center border-t border-slate-100">
          No production completions in the current month yet — rankings appear as jobs are completed.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={`${row.rank}-${row.colour}-${row.gaugeRaw}-${row.materialType}`}>
              <button
                type="button"
                onClick={onOpenSales}
                className="w-full text-left py-3 px-2 sm:px-3 rounded-lg hover:bg-slate-50/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/15"
              >
                <div className="sm:hidden space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#134e4a] text-[10px] font-bold text-white tabular-nums shrink-0">
                      {row.rank}
                    </span>
                    <span className="text-sm font-semibold text-slate-900 tabular-nums">
                      {formatPerformerGauge(row)} · {row.colour}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 pl-9">{row.materialType}</p>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 pl-9 text-[11px] tabular-nums">
                    <span className="text-slate-500">
                      {row.metresProduced.toLocaleString()} m · ~{row.weightKg.toLocaleString()} kg
                    </span>
                    <span className="font-semibold text-[#134e4a]">{formatNgn(row.revenueNgn)}</span>
                  </div>
                </div>
                <div className="hidden sm:grid sm:grid-cols-[2.5rem_minmax(0,4.5rem)_minmax(0,5rem)_minmax(0,1fr)_minmax(0,10.5rem)_minmax(0,7rem)] gap-x-3 items-center">
                  <span className="flex h-8 w-8 mx-auto items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-[#134e4a] tabular-nums">
                    {row.rank}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">{row.colour}</span>
                  <span className="text-sm font-semibold text-slate-800 tabular-nums">{formatPerformerGauge(row)}</span>
                  <span className="text-[12px] text-slate-600 truncate pr-1">{row.materialType}</span>
                  <span className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-0 text-sm font-semibold text-slate-800 tabular-nums text-right">
                    <span>{row.metresProduced.toLocaleString()} m</span>
                    <span className="text-slate-300 font-normal">·</span>
                    <span className="text-slate-500 font-medium">~{row.weightKg.toLocaleString()} kg</span>
                  </span>
                  <span className="text-sm font-semibold text-[#134e4a] tabular-nums text-right">
                    {formatNgn(row.revenueNgn)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

