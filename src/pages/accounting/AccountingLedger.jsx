import React from 'react';

const PANEL = 'z-panel-section rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm';

export default function AccountingLedger() {
  return (
    <div className="space-y-5">
      <section className={PANEL}>
        <h2 className="text-lg font-black text-[#134e4a] tracking-tight mb-2">General ledger structure</h2>
        <p className="text-sm text-slate-600 font-medium leading-relaxed mb-4">
          Chart of accounts, cost centres, and optional manual journals. Operational sub-ledgers (AR, AP, treasury) remain
          in Finance and Procurement; this view defines how they map to published accounts.
        </p>
        <ul className="text-sm text-slate-600 space-y-2 font-medium list-disc pl-5">
          <li>Account hierarchy: assets, liabilities, equity, revenue, expense, statistical.</li>
          <li>Mapping rules from expense categories and treasury movement types.</li>
          <li>Branch and consolidation dimensions for group reporting.</li>
        </ul>
      </section>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
        No GL postings in this build — design anchor for Phase 3.
      </p>
    </div>
  );
}
