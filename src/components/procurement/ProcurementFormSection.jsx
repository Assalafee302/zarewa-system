import React from 'react';

/**
 * Quotation-style section shell (letter badge + title + slate panel).
 */
export function ProcurementFormSection({ letter, title, children, action, compact = false }) {
  return (
    <div className={compact ? 'mb-0' : 'mb-6'}>
      <div className={`flex items-center justify-between px-1 ${compact ? 'mb-2' : 'mb-3'}`}>
        <div className="flex items-center gap-2">
          <div
            className={`bg-[#134e4a] text-white rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 ${
              compact ? 'w-6 h-6' : 'w-7 h-7'
            }`}
          >
            {letter}
          </div>
          <h3 className="text-[10px] font-semibold text-[#134e4a] uppercase tracking-widest">
            {title}
          </h3>
        </div>
        {action ?? null}
      </div>
      <div
        className={`bg-slate-50/80 rounded-xl border border-slate-200/90 ${compact ? 'p-3' : 'p-4'}`}
      >
        {children}
      </div>
    </div>
  );
}
