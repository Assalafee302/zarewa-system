import React from 'react';

/**
 * Quotation-style section shell (letter badge + title + slate panel).
 */
export function ProcurementFormSection({ letter, title, children, action }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#134e4a] text-white rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0">
            {letter}
          </div>
          <h3 className="text-[10px] font-semibold text-[#134e4a] uppercase tracking-widest">
            {title}
          </h3>
        </div>
        {action ?? null}
      </div>
      <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/90">{children}</div>
    </div>
  );
}
