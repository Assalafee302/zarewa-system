import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Banknote, HeartHandshake, RefreshCw, Upload, Users, X } from 'lucide-react';
import { ModalFrame } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/apiBase';
import { formatNgn } from '../../hr/hrFormat';
import HrCapsLoading from './hrCapsLoading';

export default function HrSalaryWelfare() {
  const { caps } = useHrWorkspace();
  const { show: showToast } = useToast();
  const c = caps || {};

  const [snapshot, setSnapshot] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loadState, setLoadState] = useState('idle');
  const [tableQ, setTableQ] = useState('');
  const [loanMaint, setLoanMaint] = useState(null);
  const [loanMaintBusy, setLoanMaintBusy] = useState(false);
  const [loanCloseOnly, setLoanCloseOnly] = useState(false);
  const [loanMaintForm, setLoanMaintForm] = useState({
    deductionPerMonthNgn: '',
    repaymentMonths: '',
    principalOutstandingNgn: '',
    note: '',
  });

  const canDir = c.canViewDirectory;
  const canPay = c.canPayroll;
  const canLoanMaint = Boolean(c.canLoanMaint);

  const load = useCallback(async () => {
    setLoadState('loading');
    const tasks = [];
    tasks.push(
      apiFetch('/api/hr/salary-welfare/snapshot').then(({ ok, data }) => {
        if (ok && data?.ok) setSnapshot(data);
        else setSnapshot(null);
      })
    );
    if (canDir) {
      tasks.push(
        apiFetch('/api/hr/staff').then(({ ok, data }) => {
          if (ok && data?.ok) setStaff(data.staff || []);
          else setStaff([]);
        })
      );
    } else {
      setStaff([]);
    }
    await Promise.all(tasks);
    setLoadState('ok');
  }, [canDir]);

  /* eslint-disable react-hooks/set-state-in-effect -- load HR data and mirror snapshot/staff into form fields */
  useEffect(() => {
    if (caps === null) return;
    if (!canDir && !canPay) return;
    load();
  }, [caps, canDir, canPay, load]);

  const loanByUserId = useMemo(() => {
    const m = {};
    for (const ln of snapshot?.approvedLoans || []) {
      if (!ln.deductionsActive) continue;
      const uid = ln.userId;
      if (!uid) continue;
      m[uid] = (m[uid] || 0) + (Number(ln.deductionPerMonthNgn) || 0);
    }
    return m;
  }, [snapshot]);

  /* eslint-enable react-hooks/set-state-in-effect */

  const filteredStaff = useMemo(() => {
    const q = tableQ.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(
      (s) =>
        String(s.displayName || '')
          .toLowerCase()
          .includes(q) ||
        String(s.username || '')
          .toLowerCase()
          .includes(q) ||
        String(s.employeeNo || '')
          .toLowerCase()
          .includes(q)
    );
  }, [staff, tableQ]);

  if (caps === null) return <HrCapsLoading />;
  if (!c.canViewDirectory && !c.canPayroll) {
    return <Navigate to="/hr" replace />;
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[var(--shadow-zarewa-card)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-[#134e4a]">Salary &amp; benefits</h2>
            <p className="mt-2 text-sm text-slate-600 max-w-3xl leading-relaxed">
              Package breakdown (base, housing, transport), per-staff <strong>PAYE</strong> when set on the file, approved{' '}
              <strong>loan</strong> deductions, and notes for bonuses / benefits. Official payslips come from{' '}
              <strong>Payroll</strong> after recompute; absent days and daily <strong>late</strong> marks feed deductions
              there too.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            disabled={loadState === 'loading'}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-black uppercase text-[#134e4a] disabled:opacity-50"
          >
            <RefreshCw size={14} className={loadState === 'loading' ? 'animate-spin' : ''} />
            Refresh data
          </button>
        </div>

        {snapshot?.referenceRun ? (
          <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-3 text-sm text-slate-700">
            <p className="font-black text-[#134e4a] text-[10px] uppercase tracking-wide">Payroll rate reference</p>
            <p className="mt-1">
              Period <strong>{snapshot.referenceRun.periodYyyymm}</strong> ·{' '}
              <span className="capitalize">{snapshot.referenceRun.status}</span>
              {snapshot.referenceRun.isDraft ? ' (editing draft)' : ''} · Tax{' '}
              <strong>{snapshot.referenceRun.taxPercent}%</strong> · Pension{' '}
              <strong>{snapshot.referenceRun.pensionPercent}%</strong>
            </p>
            {canPay ? (
              <Link
                to="/hr/payroll"
                className="mt-2 inline-block text-[11px] font-black uppercase text-[#134e4a] no-underline hover:underline"
              >
                Open payroll runs →
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-xs text-slate-500">
            No payroll run yet — draft run defaults are 7.5% PAYE and 8% pension for staff without individual rates.
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {canPay ? (
            <Link
              to="/hr/payroll"
              className="inline-flex items-center gap-2 rounded-xl bg-[#134e4a] px-4 py-2.5 text-[11px] font-black uppercase text-white no-underline"
            >
              <Banknote size={16} />
              Payroll runs
              <ArrowRight size={14} />
            </Link>
          ) : null}
          {c.canUploadAttendance || canPay ? (
            <Link
              to="/hr/time"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-[11px] font-black uppercase text-[#134e4a] no-underline"
            >
              <Upload size={16} />
              Attendance
            </Link>
          ) : null}
          {canDir ? (
            <Link
              to="/hr/staff"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-[11px] font-black uppercase text-[#134e4a] no-underline"
            >
              <Users size={16} />
              Staff files
            </Link>
          ) : null}
          {canDir ? (
            <Link
              to="/hr/talent"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-[11px] font-black uppercase text-[#134e4a] no-underline"
            >
              <HeartHandshake size={16} />
              Requests
            </Link>
          ) : null}
        </div>
      </section>

      {(snapshot?.approvedLoans?.length ?? 0) > 0 ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm overflow-hidden">
          <h3 className="text-sm font-black text-[#134e4a]">Approved staff loans</h3>
          <p className="mt-1 text-xs text-slate-500">
            Executive-approved loans appear here. Finance must pay the linked <strong>payment request</strong> (Account)
            before the monthly repayment amount is applied in payroll runs.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Months</th>
                  <th className="px-3 py-2">Deduction / mo</th>
                  <th className="px-3 py-2">Principal left</th>
                  <th className="px-3 py-2">Months left</th>
                  <th className="px-3 py-2">Payroll</th>
                  <th className="px-3 py-2">Finance queue</th>
                  <th className="px-3 py-2">Decided</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(snapshot.approvedLoans || []).map((ln) => (
                  <tr key={ln.requestId} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-800">{ln.staffDisplayName}</p>
                      <p className="text-xs text-slate-500">{ln.employeeNo || ln.staffUsername}</p>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{ln.branchId || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">₦{formatNgn(ln.amountNgn)}</td>
                    <td className="px-3 py-2">{ln.repaymentMonths || '—'}</td>
                    <td className="px-3 py-2 font-semibold tabular-nums text-amber-900">
                      ₦{formatNgn(ln.deductionPerMonthNgn)}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums text-slate-700">
                      {ln.principalOutstandingNgn != null && Number.isFinite(Number(ln.principalOutstandingNgn))
                        ? `₦${formatNgn(ln.principalOutstandingNgn)}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 tabular-nums">
                      {ln.repaymentMonths > 0
                        ? `${ln.repaymentMonthsRemaining ?? '—'} / ${ln.loanMonthsDeducted ?? 0} done`
                        : 'Open-ended'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {ln.deductionsActive ? (
                        <span className="font-semibold text-emerald-800">Active</span>
                      ) : ln.loanDisbursedAtIso ? (
                        <span className="text-slate-600">Schedule complete</span>
                      ) : (
                        <span className="text-slate-600">Awaiting disbursement pay</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {ln.financePaymentRequestId ? (
                        <span className="font-semibold text-[#134e4a]">
                          {ln.disbursementQueueStatus || 'Pending'} · {ln.financePaymentRequestId}
                        </span>
                      ) : (
                        'Not queued'
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                      {ln.decidedAtIso ? String(ln.decidedAtIso).slice(0, 10) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                      {canLoanMaint &&
                      ln.loanDisbursedAtIso &&
                      !ln.loanClosedEarlyAtIso &&
                      (ln.deductionsActive ||
                        (ln.principalOutstandingNgn != null && Number(ln.principalOutstandingNgn) > 0)) ? (
                        <button
                          type="button"
                          className="text-[11px] font-black uppercase text-emerald-800"
                          onClick={() => {
                            setLoanCloseOnly(false);
                            setLoanMaint(ln);
                            setLoanMaintForm({
                              deductionPerMonthNgn: String(ln.deductionPerMonthNgn ?? ''),
                              repaymentMonths: String(ln.repaymentMonths ?? ''),
                              principalOutstandingNgn:
                                ln.principalOutstandingNgn != null
                                  ? String(ln.principalOutstandingNgn)
                                  : String(ln.amountNgn ?? ''),
                              note: '',
                            });
                          }}
                        >
                          Adjust
                        </button>
                      ) : null}
                      {canLoanMaint && ln.loanDisbursedAtIso && !ln.loanClosedEarlyAtIso && ln.deductionsActive ? (
                        <button
                          type="button"
                          className="text-[11px] font-black uppercase text-rose-800"
                          onClick={() => {
                            setLoanCloseOnly(true);
                            setLoanMaint(ln);
                            setLoanMaintForm((f) => ({ ...f, note: '' }));
                          }}
                        >
                          Close early
                        </button>
                      ) : null}
                      {canDir ? (
                        <Link
                          to={`/hr/staff/${encodeURIComponent(ln.userId)}`}
                          className="text-[11px] font-black uppercase text-[#134e4a] no-underline hover:underline"
                        >
                          Profile
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Multiple approved loans for one employee add together in payroll. Repayment term uses{' '}
            <strong>months</strong> on the request; each time a payroll run is marked <strong>paid</strong>, one month is
            counted per active loan. Leave repayment months at 0 for no automatic stop.{' '}
            <strong>Principal left</strong> tracks the balance after disbursement and shrinks with each paid payroll
            deduction (capped by the monthly amount).
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-sm text-slate-600">
          No <strong>approved</strong> loan requests in your scope yet. After executive approval, the loan is queued in
          Account for branch payout; payroll deductions start only once that disbursement is fully paid.
        </section>
      )}

      <ModalFrame
        isOpen={Boolean(loanMaint)}
        onClose={() => {
          if (loanMaintBusy) return;
          setLoanMaint(null);
          setLoanCloseOnly(false);
        }}
      >
        {loanMaint ? (
          <div className="w-full max-w-lg max-h-[min(90vh,640px)] flex flex-col rounded-[28px] border border-slate-200/90 bg-white shadow-xl overflow-hidden">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-[#134e4a] px-5 py-4 text-white">
              <div className="min-w-0">
                <h4 id="loan-maint-title" className="text-sm font-black">
                  {loanCloseOnly ? 'Close loan early' : 'Adjust loan terms'}
                </h4>
                <p className="mt-1 text-xs text-teal-100 truncate" title={`${loanMaint.staffDisplayName} · ${loanMaint.requestId}`}>
                  {loanMaint.staffDisplayName} · {loanMaint.requestId}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-xl p-2 text-white/90 hover:bg-white/10 disabled:opacity-40"
                aria-label="Close dialog"
                disabled={loanMaintBusy}
                onClick={() => {
                  setLoanMaint(null);
                  setLoanCloseOnly(false);
                }}
              >
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              {loanCloseOnly ? (
                <label className="block text-xs font-bold text-slate-700">
                  Note (audit)
                  <textarea
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    rows={3}
                    value={loanMaintForm.note}
                    onChange={(e) => setLoanMaintForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder="Reason for early closure"
                  />
                </label>
              ) : (
                <div className="grid gap-3">
                  <label className="text-xs font-bold text-slate-700">
                    Deduction / month (₦)
                    <input
                      type="number"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={loanMaintForm.deductionPerMonthNgn}
                      onChange={(e) => setLoanMaintForm((f) => ({ ...f, deductionPerMonthNgn: e.target.value }))}
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-700">
                    Repayment months (0 = open-ended schedule)
                    <input
                      type="number"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={loanMaintForm.repaymentMonths}
                      onChange={(e) => setLoanMaintForm((f) => ({ ...f, repaymentMonths: e.target.value }))}
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-700">
                    Principal outstanding (₦)
                    <input
                      type="number"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={loanMaintForm.principalOutstandingNgn}
                      onChange={(e) => setLoanMaintForm((f) => ({ ...f, principalOutstandingNgn: e.target.value }))}
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-700">
                    Note (optional, audit)
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={loanMaintForm.note}
                      onChange={(e) => setLoanMaintForm((f) => ({ ...f, note: e.target.value }))}
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-black uppercase text-slate-600 disabled:opacity-50"
                disabled={loanMaintBusy}
                onClick={() => {
                  setLoanMaint(null);
                  setLoanCloseOnly(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loanMaintBusy}
                className="rounded-xl bg-[#134e4a] px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-50"
                onClick={async () => {
                  if (!loanMaint) return;
                  setLoanMaintBusy(true);
                  const body = loanCloseOnly
                    ? { closeLoan: true, note: loanMaintForm.note }
                    : {
                        deductionPerMonthNgn: Number(loanMaintForm.deductionPerMonthNgn),
                        repaymentMonths: Number(loanMaintForm.repaymentMonths),
                        principalOutstandingNgn: Number(loanMaintForm.principalOutstandingNgn),
                        note: loanMaintForm.note || null,
                      };
                  const { ok, data } = await apiFetch(
                    `/api/hr/requests/${encodeURIComponent(loanMaint.requestId)}/loan-maintenance`,
                    { method: 'PATCH', body: JSON.stringify(body) }
                  );
                  setLoanMaintBusy(false);
                  if (!ok || !data?.ok) {
                    showToast(data?.error || 'Update failed', { variant: 'error' });
                    return;
                  }
                  showToast(loanCloseOnly ? 'Loan closed on file.' : 'Loan terms updated.');
                  setLoanMaint(null);
                  setLoanCloseOnly(false);
                  load();
                }}
              >
                Save
              </button>
            </div>
          </div>
        ) : null}
      </ModalFrame>

      {canDir && staff.length > 0 ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-[#134e4a]">Compensation ledger</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-xl">
                Benefit narratives and end-of-year bonus notes are edited on each staff file. Loan rows below are
                payroll-active advances.
              </p>
            </div>
            <div className="relative max-w-xs flex-1 min-w-[200px]">
              <input
                type="search"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Search name, ID…"
                value={tableQ}
                onChange={(e) => setTableQ(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2 text-right">Base</th>
                  <th className="px-3 py-2 text-right">Housing</th>
                  <th className="px-3 py-2 text-right">Transport</th>
                  <th className="px-3 py-2 text-right">PAYE %</th>
                  <th className="px-3 py-2 text-right">Loan / mo</th>
                  <th className="px-3 py-2">Bonus / EOY note</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((s) => {
                  const loanM = loanByUserId[s.userId] || 0;
                  const note = (s.bonusAccrualNote || '').trim();
                  const paye =
                    s.payeTaxPercent != null && Number.isFinite(Number(s.payeTaxPercent))
                      ? `${Number(s.payeTaxPercent)}%`
                      : 'Run default';
                  return (
                    <tr key={s.userId} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-2">
                        <Link
                          to={`/hr/staff/${encodeURIComponent(s.userId)}`}
                          className="font-semibold text-[#134e4a] hover:underline no-underline"
                        >
                          {s.displayName}
                        </Link>
                        <p className="text-xs text-slate-500">{s.employeeNo || s.username}</p>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{s.branchId || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">₦{formatNgn(s.baseSalaryNgn)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">₦{formatNgn(s.housingAllowanceNgn)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">₦{formatNgn(s.transportAllowanceNgn)}</td>
                      <td className="px-3 py-2 text-right text-xs font-medium tabular-nums">{paye}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-900">
                        {loanM ? `₦${formatNgn(loanM)}` : '—'}
                      </td>
                      <td className="px-3 py-2 max-w-[220px] truncate text-xs text-slate-600" title={note}>
                        {note || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
