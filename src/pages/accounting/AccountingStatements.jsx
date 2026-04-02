import React from 'react';

const PANEL = 'z-panel-section rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm';

export default function AccountingStatements() {
  return (
    <div className="space-y-5">
      <section className={PANEL}>
        <h2 className="text-lg font-black text-[#134e4a] tracking-tight mb-2">Financial statements</h2>
        <p className="text-sm text-slate-600 font-medium leading-relaxed mb-4">
          Generated packs for management and (later) statutory use: profit and loss, balance sheet, cash flow, and notes
          outline — scoped to the selected branch or all branches.
        </p>
        <ul className="text-sm text-slate-600 space-y-2 font-medium list-disc pl-5">
          <li>Revenue recognition policy selector (e.g. receipts vs delivered vs invoiced).</li>
          <li>Comparative prior period and budget columns.</li>
          <li>Export to Excel and print-ready PDF from HQ templates.</li>
        </ul>
      </section>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
        Statement generation will consume rolled-up reads from Phase 1–3 APIs.
      </p>
    </div>
  );
}
