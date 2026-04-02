import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Download, Pencil, RefreshCw, X } from 'lucide-react';
import { MainPanel, ModalFrame, PageHeader } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/apiBase';
import { downloadPayrollGlJournalTemplate, downloadPayrollTreasuryPack } from '../../lib/hrDownload';
import { formatNgn } from '../../hr/hrFormat';
import HrCapsLoading from './hrCapsLoading';
import { statusChipClass } from '../../hr/hrFormat';
import { HrOpsToolbar, HrSectionCard } from './hrUx';

export default function HrPayroll() {
  const { caps } = useHrWorkspace();
  const { show: showToast } = useToast();
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [detailRun, setDetailRun] = useState(null);
  const [detailLines, setDetailLines] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draftEdit, setDraftEdit] = useState({ taxPercent: '', pensionPercent: '', notes: '' });
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
    if (caps === null || !caps.canPayroll) return;
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [caps, load]);

  const openDetail = async (id) => {
    setDetailRun({ id, periodYyyymm: '', status: '', taxPercent: 0, pensionPercent: 0, notes: null });
    setDetailLines([]);
    setDetailLoading(true);
    const { ok, data } = await apiFetch(`/api/hr/payroll-runs/${encodeURIComponent(id)}`);
    setDetailLoading(false);
    if (ok && data?.ok && data.run) {
      setDetailRun(data.run);
      setDetailLines(data.lines || []);
      setDraftEdit({
        taxPercent: String(data.run.taxPercent ?? ''),
        pensionPercent: String(data.run.pensionPercent ?? ''),
        notes: data.run.notes ?? '',
      });
    } else {
      showToast(data?.error || 'Could not load run.', { variant: 'error' });
      setDetailRun(null);
    }
  };

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
    if (detailRun?.id === id) {
      setDetailLines(data.lines || []);
    }
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
    if (detailRun?.id === id) {
      openDetail(id);
    }
  };

  const saveDraftMeta = async () => {
    if (!detailRun || detailRun.status !== 'draft') return;
    setBusy(true);
    const { ok, data } = await apiFetch(`/api/hr/payroll-runs/${encodeURIComponent(detailRun.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        taxPercent: Number(draftEdit.taxPercent),
        pensionPercent: Number(draftEdit.pensionPercent),
        notes: draftEdit.notes,
      }),
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not save.', { variant: 'error' });
      return;
    }
    showToast('Draft settings saved.');
    openDetail(detailRun.id);
    load();
  };

  const totals = useMemo(() => {
    let net = 0;
    let gross = 0;
    for (const l of detailLines) {
      net += Math.round(Number(l.netNgn) || 0);
      gross += Math.round(Number(l.grossNgn) || 0);
    }
    return { net, gross, count: detailLines.length };
  }, [detailLines]);

  const treasuryDownload = async (id) => {
    try {
      await downloadPayrollTreasuryPack(id);
      showToast('Treasury CSV downloaded.');
    } catch (e) {
      showToast(String(e.message || e), { variant: 'error' });
    }
  };

  const glJournalDownload = async (id) => {
    try {
      await downloadPayrollGlJournalTemplate(id);
      showToast('GL journal template CSV downloaded.');
    } catch (e) {
      showToast(String(e.message || e), { variant: 'error' });
    }
  };

  if (caps === null) return <HrCapsLoading />;
  if (!caps.canPayroll) return <Navigate to="/hr" replace />;

  return (
    <>
      <PageHeader
        eyebrow="Human resources"
        title="Payroll runs"
        subtitle="Draft → recompute → lock for treasury export → mark paid when complete. Staff files can set individual PAYE and pension; lines show effective % after recompute."
        actions={
          <button
            type="button"
            onClick={() => load()}
            disabled={busy}
            className="z-btn-secondary gap-2 py-2 px-4 text-xs disabled:opacity-50"
          >
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />
      <MainPanel>
        <HrOpsToolbar
          left={
            <>
              <span className={`rounded px-2 py-1 text-[10px] font-bold ${statusChipClass('draft')}`}>1 Draft</span>
              <span className={`rounded px-2 py-1 text-[10px] font-bold ${statusChipClass('hr_review', 'bg-amber-100 text-amber-900')}`}>2 Recompute</span>
              <span className={`rounded px-2 py-1 text-[10px] font-bold ${statusChipClass('locked')}`}>3 Lock</span>
              <span className={`rounded px-2 py-1 text-[10px] font-bold ${statusChipClass('paid')}`}>4 Pay</span>
            </>
          }
          right={
            <form onSubmit={createRun} className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-bold text-slate-700">
                Period
                <input
                  className="ml-2 w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-[#134e4a] px-3 py-1.5 text-[11px] font-black uppercase text-white disabled:opacity-50"
              >
                Create draft
              </button>
            </form>
          }
        />
        <HrSectionCard title="Run creation + links">
        <form
          onSubmit={createRun}
          className="mb-2 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[var(--shadow-zarewa-card)]"
        >
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
            className="rounded-xl bg-[#134e4a] px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-50"
          >
            Create draft
          </button>
          <Link
            to="/hr/salary-welfare"
            className="text-[11px] font-black uppercase text-slate-500 no-underline hover:underline"
          >
            Salary &amp; benefits →
          </Link>
          <Link
            to="/hr/time"
            className="text-[11px] font-black uppercase text-slate-500 no-underline hover:underline"
          >
            Attendance →
          </Link>
        </form>
        </HrSectionCard>

        {runs.length === 0 ? (
          <p className="text-sm text-slate-600">No payroll runs yet. Create a draft for the period you want to pay.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 hidden md:table-cell">Tax %</th>
                  <th className="px-4 py-3 hidden md:table-cell">Pension %</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-teal-50/40">
                    <td className="px-4 py-3 font-semibold text-slate-900">{r.periodYyyymm}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${statusChipClass(r.status)}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums hidden md:table-cell">{r.taxPercent}</td>
                    <td className="px-4 py-3 tabular-nums hidden md:table-cell">{r.pensionPercent}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-black uppercase text-[#134e4a]"
                          onClick={() => openDetail(r.id)}
                        >
                          View lines
                        </button>
                        {r.status === 'draft' ? (
                          <>
                            <button
                              type="button"
                              className="text-[11px] font-black uppercase text-[#134e4a] disabled:opacity-50"
                              disabled={busy}
                              onClick={() => recompute(r.id)}
                            >
                              Recompute
                            </button>
                            <button
                              type="button"
                              className="text-[11px] font-black uppercase text-slate-600 disabled:opacity-50"
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
                              className="inline-flex items-center gap-1 text-[11px] font-black uppercase text-emerald-800 disabled:opacity-50"
                              disabled={busy}
                              onClick={() => treasuryDownload(r.id)}
                            >
                              <Download size={12} />
                              CSV
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-[11px] font-black uppercase text-slate-700 disabled:opacity-50"
                              disabled={busy}
                              onClick={() => glJournalDownload(r.id)}
                              title="Double-entry template for general ledger"
                            >
                              <Download size={12} />
                              GL
                            </button>
                            <button
                              type="button"
                              className="text-[11px] font-black uppercase text-emerald-800 disabled:opacity-50"
                              disabled={busy}
                              onClick={() => setStatus(r.id, 'paid')}
                            >
                              Mark paid
                            </button>
                            <button
                              type="button"
                              className="text-[11px] font-black uppercase text-slate-600 disabled:opacity-50"
                              disabled={busy}
                              onClick={() => setStatus(r.id, 'draft')}
                            >
                              Unlock
                            </button>
                          </>
                        ) : null}
                        {r.status === 'paid' ? (
                          <>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-[11px] font-black uppercase text-slate-600"
                              onClick={() => treasuryDownload(r.id)}
                            >
                              <Download size={12} />
                              CSV
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-[11px] font-black uppercase text-slate-600"
                              onClick={() => glJournalDownload(r.id)}
                              title="Double-entry template for general ledger"
                            >
                              <Download size={12} />
                              GL
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </MainPanel>

      <ModalFrame isOpen={Boolean(detailRun)} onClose={() => setDetailRun(null)}>
        <div className="w-full max-w-4xl rounded-[28px] border border-slate-200/90 bg-white shadow-xl overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-[#134e4a] to-[#0f3d39] px-6 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-teal-100">Payroll run</p>
              <h2 className="text-lg font-black">
                {detailLoading ? 'Loading…' : detailRun?.periodYyyymm || '—'}
              </h2>
              {!detailLoading && detailRun ? (
                <p className="mt-1 text-xs text-teal-100 capitalize">Status: {detailRun.status}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded-xl p-2 text-white/90 hover:bg-white/10"
              aria-label="Close"
              onClick={() => setDetailRun(null)}
            >
              <X size={22} />
            </button>
          </div>

          <div className="max-h-[min(70vh,640px)] overflow-y-auto p-6">
            {detailLoading ? (
              <p className="text-sm text-slate-500">Loading lines…</p>
            ) : detailRun?.status === 'draft' ? (
              <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <h3 className="flex items-center gap-2 text-xs font-black uppercase text-[#134e4a]">
                  <Pencil size={14} />
                  Draft settings
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  These are defaults for the whole run. Individual staff can override PAYE / pension on their HR file.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-bold text-slate-700">
                    Tax %
                    <input
                      type="number"
                      step="0.1"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={draftEdit.taxPercent}
                      onChange={(e) => setDraftEdit((d) => ({ ...d, taxPercent: e.target.value }))}
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-700">
                    Pension %
                    <input
                      type="number"
                      step="0.1"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={draftEdit.pensionPercent}
                      onChange={(e) => setDraftEdit((d) => ({ ...d, pensionPercent: e.target.value }))}
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-700 sm:col-span-3">
                    Notes
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={draftEdit.notes}
                      onChange={(e) => setDraftEdit((d) => ({ ...d, notes: e.target.value }))}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={saveDraftMeta}
                  className="mt-3 rounded-xl bg-[#134e4a] px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-50"
                >
                  Save settings
                </button>
              </div>
            ) : null}

            {!detailLoading && detailRun ? (
              <div className="mb-4 flex flex-wrap gap-4 text-sm">
                <div className="rounded-xl border border-teal-100 bg-teal-50/50 px-4 py-2">
                  <span className="text-[10px] font-black uppercase text-[#134e4a]">Employees</span>
                  <p className="font-black tabular-nums text-[#134e4a]">{totals.count}</p>
                </div>
                <div className="rounded-xl border border-slate-200 px-4 py-2">
                  <span className="text-[10px] font-black uppercase text-slate-500">Total gross</span>
                  <p className="font-semibold tabular-nums">₦{formatNgn(totals.gross)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 px-4 py-2">
                  <span className="text-[10px] font-black uppercase text-slate-500">Total net</span>
                  <p className="font-black tabular-nums text-[#134e4a]">₦{formatNgn(totals.net)}</p>
                </div>
              </div>
            ) : null}

            {!detailLoading && detailLines.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 font-black uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2 text-right">Gross</th>
                      <th className="px-3 py-2 text-right">Attend.</th>
                      <th className="px-3 py-2 text-right">Other ded.</th>
                      <th className="px-3 py-2 text-right hidden sm:table-cell">PAYE %</th>
                      <th className="px-3 py-2 text-right hidden sm:table-cell">Pen. %</th>
                      <th className="px-3 py-2 text-right">Tax</th>
                      <th className="px-3 py-2 text-right">Pension</th>
                      <th className="px-3 py-2 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailLines.map((l) => (
                      <tr key={l.userId} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {l.userId ? (
                            <Link to={`/hr/staff/${encodeURIComponent(l.userId)}`} className="text-[#134e4a] hover:underline">
                              {l.displayName}
                            </Link>
                          ) : (
                            l.displayName
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">₦{formatNgn(l.grossNgn)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-900">
                          ₦{formatNgn(l.attendanceDeductionNgn)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-rose-800">
                          ₦{formatNgn(l.otherDeductionNgn)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600 hidden sm:table-cell">
                          {l.impliedTaxPercent != null ? `${l.impliedTaxPercent}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600 hidden sm:table-cell">
                          {l.impliedPensionPercent != null ? `${l.impliedPensionPercent}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">₦{formatNgn(l.taxNgn)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">₦{formatNgn(l.pensionNgn)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#134e4a]">
                          ₦{formatNgn(l.netNgn)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {!detailLoading && detailRun && detailLines.length === 0 ? (
              <p className="text-sm text-slate-600">No lines yet — use Recompute on a draft run.</p>
            ) : null}
          </div>
        </div>
      </ModalFrame>
    </>
  );
}
