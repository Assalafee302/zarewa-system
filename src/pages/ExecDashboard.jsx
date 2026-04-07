import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BarChart3, RefreshCw } from 'lucide-react';
import { MainPanel, PageHeader } from '../components/layout';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';

export default function ExecDashboard() {
  const ws = useWorkspace();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setErr('');
    const { ok, data: d } = await apiFetch('/api/exec/summary');
    setBusy(false);
    if (!ok || !d?.ok) {
      setData(null);
      setErr(d?.error || 'Could not load executive summary.');
      return;
    }
    setData(d);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ws?.hasPermission?.('exec.dashboard.view')) {
    return <Navigate to="/" replace />;
  }

  const c = data?.counts || {};
  const pm = data?.productionMetrics || {};

  return (
    <MainPanel>
      <PageHeader
        title="Company overview"
        subtitle="Aggregated counts and queues only — line-level sales and finance screens stay hidden for this role."
        toolbar={
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[11px] font-black uppercase text-[#134e4a] disabled:opacity-50"
          >
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      {err ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</p>
      ) : null}

      {data ? (
        <div className="space-y-8">
          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-[#134e4a]">
              <BarChart3 size={18} className="text-teal-600" />
              Branches
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
              {(data.branches || []).map((b) => (
                <li key={b.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 font-semibold">
                  {b.name || b.id}
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Customers', c.customersTotal],
              ['Quotations', c.quotationsTotal],
              ['Receipts', c.receiptsTotal],
              ['Purchase orders', c.purchaseOrdersTotal],
              ['Production jobs', c.productionJobsTotal],
              ['Deliveries', c.deliveriesTotal],
              ['Refunds (all)', c.refundsTotal],
              ['Expenses', c.expensesTotal],
              ['Ledger entries', c.ledgerEntriesTotal],
              ['Treasury movements', c.treasuryMovementsTotal],
            ].map(([label, val]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm"
              >
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-black tabular-nums text-[#134e4a]">
                  {typeof val === 'number' ? val.toLocaleString() : '—'}
                </p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-6">
            <h2 className="text-sm font-black uppercase tracking-wider text-amber-950">Queues</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[10px] font-bold uppercase text-amber-900/70">Pending refunds</p>
                <p className="text-2xl font-black text-amber-950">{data.pendingRefunds ?? 0}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-amber-900/70">Pending payment requests</p>
                <p className="text-2xl font-black text-amber-950">{data.pendingPaymentRequests ?? 0}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-amber-900/70">Payroll drafts (no MD sign-off)</p>
                <p className="text-2xl font-black text-amber-950">{data.payrollDraftsAwaitingMd ?? 0}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-amber-900/70">Bank lines in review</p>
                <p className="text-2xl font-black text-amber-950">{data.bankReconciliationLinesInReview ?? 0}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-teal-200/80 bg-teal-50/30 p-6">
            <h2 className="text-sm font-black uppercase tracking-wider text-[#134e4a]">Production rollup</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-[10px] font-bold uppercase text-slate-500">Jobs</dt>
                <dd className="font-black text-slate-900">{pm.jobCount ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-slate-500">Planned metres</dt>
                <dd className="font-black text-slate-900 tabular-nums">
                  {pm.totalPlannedMeters != null
                    ? `${Number(pm.totalPlannedMeters).toLocaleString(undefined, { maximumFractionDigits: 2 })} m`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-slate-500">Actual metres</dt>
                <dd className="font-black text-slate-900 tabular-nums">
                  {pm.totalActualMeters != null
                    ? `${Number(pm.totalActualMeters).toLocaleString(undefined, { maximumFractionDigits: 2 })} m`
                    : '—'}
                </dd>
              </div>
            </dl>
          </section>

          <p className="text-[10px] text-slate-400">
            Generated {data.generatedAtISO ? new Date(data.generatedAtISO).toLocaleString() : '—'}
          </p>
        </div>
      ) : !err && busy ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : null}
    </MainPanel>
  );
}
