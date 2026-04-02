import React from 'react';

const PANEL = 'z-panel-section rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm';

export default function AccountingAssets() {
  return (
    <div className="space-y-5">
      <section className={PANEL}>
        <h2 className="text-lg font-black text-[#134e4a] tracking-tight mb-2">Fixed assets (HQ)</h2>
        <p className="text-sm text-slate-600 font-medium leading-relaxed mb-4">
          Planned register for land, buildings, plant, vehicles, and IT — with branch/cost-centre tags, acquisition date,
          useful life, and depreciation method.
        </p>
        <ul className="text-sm text-slate-600 space-y-2 font-medium list-disc pl-5">
          <li>Opening balances import and reconciliation to prior year.</li>
          <li>Monthly depreciation run with journal preview (future).</li>
          <li>Disposals and transfers between branches with audit trail.</li>
        </ul>
      </section>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
        No live asset table yet — schema and APIs to follow Phase 2.
      </p>
    </div>
  );
}
