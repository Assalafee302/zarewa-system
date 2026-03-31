import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { MainPanel, PageHeader, PageShell } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/apiBase';
import HrCapsLoading from './hrCapsLoading';

export default function HrPayroll() {
  const { caps } = useHrWorkspace();
  const { show: showToast } = useToast();
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const load = useCallback(async () => {
    setBusy(true);
    const { ok, data } = await apiFetch('/api/hr/payroll-runs');
    setBusy(false);
    if (ok && data?.ok) setRuns(data.runs || []);
    else setRuns([]);
  }, []);

  useEffect(() => {
    if (caps === null) return;
    if (caps.canPayroll) load();
  }, [caps, load]);

  const createRun = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(period)) {
      showToast('Period must be YYYYMM (e.g. 202603).', { variant: 'error' });
      return;
    }
    setBusy(true);
    const { ok, data } = await apiFetch('/api/hr/payroll-runs', {
      method: 'POST',
      body: JSON.stringify({ periodYyyymm: period }),
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not create run.', { variant: 'error' });
      return;
    }
    showToast('Draft payroll run created.');
    load();
  };

  const recompute = async (id) => {
    setBusy(true);
    const { ok, data } = await apiFetch(`/api/hr/payroll-runs/${encodeURIComponent(id)}/recompute`, {
      method: 'POST',
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Recompute failed.', { variant: 'error' });
      return;
    }
    showToast('Payroll recomputed from current staff and attendance.');
    load();
  };

  const setStatus = async (id, status) => {
    setBusy(true);
    const { ok, data } = await apiFetch(`/api/hr/payroll-runs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Update failed.', { variant: 'error' });
      return;
    }
    showToast('Run updated.');
    load();
  };

  if (caps === null) return <HrCapsLoading />;
  if (!caps.canPayroll) return <Navigate to="/hr" replace />;

  return (
    <PageShell>
      <PageHeader
        title="Payroll runs"
        subtitle="Draft → recompute → lock when ready for treasury. Paid is terminal."
        actions={
          <button
            type="button"
            onClick={() => load()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-black uppercase text-[#7028e6] disabled:opacity-50"
          >
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />
      <MainPanel>
        <form onSubmit={createRun} className="mb-8 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-4">
          <label className="text-xs font-bold text-slate-700">
            New period (YYYYMM)
            <input
              className="mt-1 w-40 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={period}
              onChange={(e) => setPeriod(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-[#7028e6] px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-50"
          >
            Create draft
          </button>
          <Link to="/hr/salary-welfare" className="text-[11px] font-black uppercase text-slate-500 no-underline hover:underline">
            Salary &amp; welfare →
          </Link>
        </form>

        {runs.length === 0 ? (
          <p className="text-sm text-slate-600">No payroll runs yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Tax %</th>
                  <th className="px-3 py-2">Pension %</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold">{r.periodYyyymm}</td>
                    <td className="px-3 py-2 capitalize">{r.status}</td>
                    <td className="px-3 py-2">{r.taxPercent}</td>
                    <td className="px-3 py-2">{r.pensionPercent}</td>
                    <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                      {r.status === 'draft' ? (
                        <>
                          <button
                            type="button"
                            className="text-[11px] font-black uppercase text-[#7028e6]"
                            disabled={busy}
                            onClick={() => recompute(r.id)}
                          >
                            Recompute
                          </button>
                          <button
                            type="button"
                            className="text-[11px] font-black uppercase text-slate-600"
                            disabled={busy}
                            onClick={() => setStatus(r.id, 'locked')}
                          >
                            Lock
                          </button>
                        </>
                      ) : null}
                      {r.status === 'locked' ? (
                        <>
                          <button
                            type="button"
                            className="text-[11px] font-black uppercase text-emerald-800"
                            disabled={busy}
                            onClick={() => setStatus(r.id, 'paid')}
                          >
                            Mark paid
                          </button>
                          <button
                            type="button"
                            className="text-[11px] font-black uppercase text-slate-600"
                            disabled={busy}
                            onClick={() => setStatus(r.id, 'draft')}
                          >
                            Unlock to draft
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </MainPanel>
    </PageShell>
  );
}
