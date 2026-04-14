import React from 'react';

const ACCENTS = [
  'from-teal-600/90 to-emerald-700/85',
  'from-sky-600/90 to-indigo-700/85',
  'from-amber-500/90 to-orange-600/85',
  'from-slate-600/90 to-slate-800/90',
];

/**
 * Placeholder KPI tile; wire real metrics later.
 */
export function WorkspaceKpiCard({ index = 0, label, hint }) {
  const accent = ACCENTS[index % ACCENTS.length];
  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
      <div className={`h-1.5 bg-gradient-to-r ${accent}`} aria-hidden />
      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
        <p className="mt-3 text-2xl font-black tabular-nums tracking-tight text-slate-900 sm:text-3xl">—</p>
        {hint ? <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{hint}</p> : null}
      </div>
    </article>
  );
}
