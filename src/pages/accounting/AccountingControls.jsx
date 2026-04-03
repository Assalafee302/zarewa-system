import React from 'react';

const PANEL = 'z-panel-section rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm';

export default function AccountingControls() {
  return (
    <div className="space-y-5">
      <section className={PANEL}>
        <h2 className="text-lg font-black text-[#134e4a] tracking-tight mb-2">Period close and controls</h2>
        <p className="text-sm text-slate-600 font-medium leading-relaxed mb-4">
          HQ checklist: lock periods, freeze master data changes, reconcile inter-branch balances, and sign off before
          publishing statements. Ties into existing <strong className="font-semibold text-slate-800">period.manage</strong>{' '}
          capabilities in Finance settings where applicable.
        </p>
        <ul className="text-sm text-slate-600 space-y-2 font-medium list-disc pl-5">
          <li>Close calendar by entity/branch with reopen audit.</li>
          <li>Control matrix: who can post, approve, and reverse by module.</li>
          <li>Exception queue: unmatched movements, negative margin jobs, aged items.</li>
        </ul>
      </section>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
        Checklist UI to be backed by control APIs and notifications.
      </p>
    </div>
  );
}
