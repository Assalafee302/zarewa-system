import React from 'react';

const PANEL = 'z-panel-section rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm';

export default function AccountingCosting() {
  return (
    <div className="space-y-5">
      <section className={PANEL}>
        <h2 className="text-lg font-black text-[#134e4a] tracking-tight mb-2">Product and service costing</h2>
        <p className="text-sm text-slate-600 font-medium leading-relaxed mb-4">
          HQ view of how coil, consumables, labour, and overheads roll into SKU or job cost — for margin review and
          inventory valuation alignment.
        </p>
        <ul className="text-sm text-slate-600 space-y-2 font-medium list-disc pl-5">
          <li>Standard cost tables maintained centrally; branch variance reporting.</li>
          <li>Link to production jobs, GRN, and material issues when traceability APIs land.</li>
          <li>Periodic revaluation workflow with approval.</li>
        </ul>
      </section>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
        Costing engine not connected — UI shell for roadmap alignment.
      </p>
    </div>
  );
}
