import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';

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
    title: 'Phase 2 — Assets & costing (live)',
    items: [
      'Fixed assets: HQ register with straight-line estimates, branch tags, treasury reference, disposal workflow (Accounting → Fixed assets).',
      'Costing: standard ₦/kg and overhead per product vs GRN averages and 90-day production consumption (Accounting → Costing).',
    ],
  },
  {
    title: 'Phase 3 — Ledger & statements (in progress)',
    items: [
      'General ledger: chart of accounts, trial balance, journal drill-down, and manual journals are live under Accounting → General ledger.',
      'Statements: management P&L (month activity) and cumulative balance sheet plus receipts hint — Accounting → Statements, with CSV export.',
    ],
  },
];

function formatNgn(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₦${Math.round(Number(n)).toLocaleString('en-NG')}`;
}

function KpiTile({ label, value, sub, onClick, accent }) {
  const border =
    accent === 'lock'
      ? 'border-amber-200 bg-amber-50/40'
      : accent === 'open'
        ? 'border-emerald-200 bg-emerald-50/30'
        : accent === 'danger'
          ? 'border-rose-200 bg-rose-50/35'
          : 'border-slate-100 bg-slate-50';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-3 text-left transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 ${border} w-full`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">{label}</p>
      <p className="text-lg font-black text-[#134e4a] tabular-nums leading-tight">{value}</p>
      {sub ? <p className="text-[11px] font-medium text-slate-500 mt-1 leading-snug">{sub}</p> : null}
    </button>
  );
}

export default function AccountingOverview() {
  const navigate = useNavigate();
  const ws = useWorkspace();
  const [periodKey, setPeriodKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [netIncome, setNetIncome] = useState(null);
  const [stmtScope, setStmtScope] = useState('');
  const [activeAssets, setActiveAssets] = useState(null);
  const [stdCostCount, setStdCostCount] = useState(null);
  const [periodLocked, setPeriodLocked] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const q = `periodKey=${encodeURIComponent(periodKey.trim())}`;
    const [stmRes, faRes, scRes, lockRes] = await Promise.all([
      apiFetch(`/api/accounting/statements-pack?${q}`),
      apiFetch('/api/accounting/fixed-assets'),
      apiFetch('/api/accounting/standard-costs'),
      apiFetch('/api/controls/period-locks'),
    ]);
    setLoading(false);

    if (stmRes.ok && stmRes.data?.ok && stmRes.data?.profitAndLoss) {
      setNetIncome(Number(stmRes.data.profitAndLoss.netIncomeNgn));
      setStmtScope(String(stmRes.data.branchScope ?? ''));
    } else {
      setNetIncome(null);
      setStmtScope('');
      setError(stmRes.data?.error || 'Could not load statement snapshot for this period.');
    }

    if (faRes.ok && faRes.data?.ok && Array.isArray(faRes.data.assets)) {
      const active = faRes.data.assets.filter((a) => String(a.status || '').toLowerCase() !== 'disposed');
      setActiveAssets(active.length);
    } else {
      setActiveAssets(null);
    }

    if (scRes.ok && scRes.data?.ok && Array.isArray(scRes.data.costs)) {
      setStdCostCount(scRes.data.costs.length);
    } else {
      setStdCostCount(null);
    }

    if (lockRes.ok && lockRes.data?.ok && Array.isArray(lockRes.data.periodLocks)) {
      const pk = periodKey.trim();
      setPeriodLocked(lockRes.data.periodLocks.some((l) => String(l.periodKey) === pk));
    } else {
      setPeriodLocked(null);
    }
  }, [periodKey]);

  useEffect(() => {
    void load();
  }, [load, ws?.refreshEpoch]);

  const netIncomeLabel = netIncome == null ? '—' : formatNgn(netIncome);

  return (
    <div className="space-y-6">
      <section className={PANEL}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-[#134e4a] mb-2">Snapshot</h2>
            <p className="text-sm text-slate-600 font-medium leading-relaxed max-w-2xl">
              Live figures for the selected month (same period key as Statements). Click a tile to open the related tab.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-bold text-slate-600">
              Period
              <input
                className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono font-medium"
                value={periodKey}
                onChange={(e) => setPeriodKey(e.target.value)}
                pattern="\d{4}-\d{2}"
              />
            </label>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500 font-medium inline-flex items-center gap-2 mb-3">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading snapshot…
          </p>
        ) : null}
        {error ? (
          <p className="text-sm font-semibold text-amber-800 bg-amber-50/80 border border-amber-100 rounded-lg px-3 py-2 mb-3" role="alert">
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile
            label="Net income (month)"
            value={netIncomeLabel}
            sub={stmtScope ? `Scope: ${stmtScope}` : undefined}
            onClick={() => navigate('/accounting/statements')}
            accent={netIncome != null && netIncome < 0 ? 'danger' : undefined}
          />
          <KpiTile
            label="Active fixed assets"
            value={activeAssets != null ? String(activeAssets) : '—'}
            sub="Excluding disposed"
            onClick={() => navigate('/accounting/assets')}
          />
          <KpiTile
            label="Standard cost rows"
            value={stdCostCount != null ? String(stdCostCount) : '—'}
            sub="Products with saved standards"
            onClick={() => navigate('/accounting/costing')}
          />
          <KpiTile
            label="Period lock"
            value={periodLocked === null ? '—' : periodLocked ? 'Locked' : 'Open'}
            sub={periodLocked === null ? 'Could not read locks' : periodLocked ? 'Posting may be blocked' : 'Editable in this month'}
            onClick={() => navigate('/accounting/controls')}
            accent={periodLocked ? 'lock' : periodLocked === false ? 'open' : undefined}
          />
        </div>
      </section>

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
