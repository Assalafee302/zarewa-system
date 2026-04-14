import React from 'react';

/**
 * Quotation-style section shell (letter badge + title + slate panel).
 */
export function ProcurementFormSection({ letter, title, children, action, compact = false }) {
  return (
    <div className={compact ? 'mb-0' : 'mb-6'}>
      <div
        className={`flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between ${compact ? 'mb-2' : 'mb-3'}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#134e4a] text-[10px] font-bold text-white ${
              compact ? '' : 'sm:h-7 sm:w-7'
            }`}
          >
            {letter}
          </div>
          <h3 className="min-w-0 text-[10px] font-semibold uppercase tracking-widest text-[#134e4a]">{title}</h3>
        </div>
        {action ? <div className="flex shrink-0 flex-wrap justify-start gap-2 sm:justify-end">{action}</div> : null}
      </div>
      <div
        className={`bg-slate-50/80 rounded-xl border border-slate-200/90 shadow-sm ${compact ? 'p-3' : 'p-4'}`}
      >
        {children}
      </div>
    </div>
  );
}
