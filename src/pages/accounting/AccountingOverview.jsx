import React from 'react';

const PANEL = 'z-panel-section rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm';
const PHASES = [
  {
    title: 'Phase 1 — Data plumbing',
    items: [
      'Map existing treasury movements, expenses, receipts, and payroll into a branch-aware reporting cube.',
      'HQ default: all branches; drill down by branch in each sub-area.',
      'Single source of period locks (already in Finance settings) driving Accounting read-only states.',
    ],
  },
  {
    title: 'Phase 2 — Assets & costing',
    items: [
      'Fixed assets: register, depreciation schedules, disposals, and link to treasury for acquisitions.',
      'Costing: standard vs actual, BOM / coil consumption tie-in from Production and Procurement.',
    ],
  },
  {
    title: 'Phase 3 — Ledger & statements',
    items: [
      'Chart of accounts and journal templates; optional double-entry posting from operational events.',
      'Generated P&L, balance sheet, and cash flow packs with export (Excel / PDF).',
    ],
  },
];

export default function AccountingOverview() {
  return (
    <div className="space-y-6">
      <section className={PANEL}>
        <h2 className="text-sm font-black uppercase tracking-wider text-[#134e4a] mb-3">Purpose</h2>
        <p className="text-sm font-medium text-slate-600 leading-relaxed">
          This workspace is separate from day-to-day <strong className="font-semibold text-slate-800">Finance</strong>{' '}
          (bank, payments, requests). Accounting here is for <strong className="font-semibold text-slate-800">HQ</strong>{' '}
          policy, consolidation, asset and cost discipline, and statement preparation across branches.
        </p>
      </section>

      <section className={PANEL}>
        <h2 className="text-sm font-black uppercase tracking-wider text-[#134e4a] mb-4">Roll-out outline</h2>
        <ol className="space-y-6">
          {PHASES.map((ph, i) => (
            <li key={ph.title}>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
                Step {i + 1} — {ph.title}
              </p>
              <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600 font-medium">
                {ph.items.map((t) => (
                  <li key={t} className="leading-relaxed">
                    {t}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${PANEL} border-dashed border-teal-200 bg-teal-50/20`}>
        <h2 className="text-sm font-black uppercase tracking-wider text-[#134e4a] mb-2">Sub-pages</h2>
        <p className="text-sm text-slate-600 font-medium leading-relaxed">
          Use the tabs above: <strong className="font-semibold text-slate-800">Fixed assets</strong>,{' '}
          <strong className="font-semibold text-slate-800">Costing</strong>,{' '}
          <strong className="font-semibold text-slate-800">General ledger</strong>,{' '}
          <strong className="font-semibold text-slate-800">Statements</strong>, and{' '}
          <strong className="font-semibold text-slate-800">Period and controls</strong>. Each screen will gain live
          metrics as APIs are wired; structure and HQ scope are fixed first.
        </p>
      </section>
    </div>
  );
}
