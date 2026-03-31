import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  Calculator,
  HeartHandshake,
  Percent,
  RefreshCw,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { ModalFrame } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/apiBase';
import { formatNgn } from '../../hr/hrFormat';
import HrCapsLoading from './hrCapsLoading';

function packageGross(s) {
  return (
    (Number(s?.baseSalaryNgn) || 0) +
    (Number(s?.housingAllowanceNgn) || 0) +
    (Number(s?.transportAllowanceNgn) || 0)
  );
}

export default function HrSalaryWelfare() {
  const { caps } = useHrWorkspace();
  const { show: showToast } = useToast();
  const c = caps || {};

  const [snapshot, setSnapshot] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loadState, setLoadState] = useState('idle');
  const [selectedUserId, setSelectedUserId] = useState('');

  const [gross, setGross] = useState(250000);
  const [bonus, setBonus] = useState(0);
  const [taxPct, setTaxPct] = useState(7.5);
  const [penPct, setPenPct] = useState(8);
  const [loanDed, setLoanDed] = useState(0);

  const [accrualDraft, setAccrualDraft] = useState('');
  const [accrualBusy, setAccrualBusy] = useState(false);
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

  useEffect(() => {
    if (snapshot == null) return;
    setTaxPct(Number(snapshot.taxPercent) || 7.5);
    setPenPct(Number(snapshot.pensionPercent) || 8);
  }, [snapshot]);

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

  const selectedStaff = useMemo(
    () => (selectedUserId ? staff.find((s) => s.userId === selectedUserId) : null),
    [staff, selectedUserId]
  );

  useEffect(() => {
    if (!selectedStaff) return;
    setGross(packageGross(selectedStaff));
    setBonus(0);
    setLoanDed(loanByUserId[selectedStaff.userId] || 0);
    setAccrualDraft(selectedStaff.bonusAccrualNote || '');
  }, [selectedStaff, loanByUserId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const netPreview = useMemo(() => {
    const g = Math.max(0, Number(gross) || 0) + Math.max(0, Number(bonus) || 0);
    const tax = Math.round((g * Math.max(0, Number(taxPct) || 0)) / 100);
    const pen = Math.round((g * Math.max(0, Number(penPct) || 0)) / 100);
    const loan = Math.max(0, Number(loanDed) || 0);
    return { tax, pen, loan, net: g - tax - pen - loan };
  }, [gross, bonus, taxPct, penPct, loanDed]);

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

  const saveAccrualNote = async (e) => {
    e.preventDefault();
    if (!selectedStaff || !c.canManageStaff) return;
    setAccrualBusy(true);
    const { ok, data } = await apiFetch(`/api/hr/staff/${encodeURIComponent(selectedStaff.userId)}/bonus-accrual-note`, {
      method: 'PATCH',
      body: JSON.stringify({ note: accrualDraft }),
    });
    setAccrualBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not save note.', { variant: 'error' });
      return;
    }
    showToast('Bonus / accrual note saved on file.');
    setStaff((prev) =>
      prev.map((s) =>
        s.userId === selectedStaff.userId ? { ...s, bonusAccrualNote: accrualDraft.trim() || null } : s
      )
    );
  };

  if (caps === null) return <HrCapsLoading />;
  if (!c.canViewDirectory && !c.canPayroll) {
    return <Navigate to="/hr" replace />;
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[var(--shadow-zarewa-card)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-[#7028e6]">Salary &amp; welfare</h2>
            <p className="mt-2 text-sm text-slate-600 max-w-3xl leading-relaxed">
              Live view of compensation on file, <strong>approved loan</strong> payroll deductions from casework, and
              tax/pension rates taken from your latest <strong>payroll run</strong> (draft preferred). Use the calculator
              to model net pay; payroll batches and attendance still drive official payslips.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            disabled={loadState === 'loading'}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-black uppercase text-[#7028e6] disabled:opacity-50"
          >
            <RefreshCw size={14} className={loadState === 'loading' ? 'animate-spin' : ''} />
            Refresh data
          </button>
        </div>

        {snapshot?.referenceRun ? (
          <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm text-slate-700">
            <p className="font-black text-[#7028e6] text-[10px] uppercase tracking-wide">Payroll rate reference</p>
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
                className="mt-2 inline-block text-[11px] font-black uppercase text-violet-900 no-underline hover:underline"
              >
                Open payroll runs →
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-xs text-slate-500">
            No payroll run yet — calculator defaults to 7.5% tax and 8% pension. Create a draft run under Payroll to set
            authoritative percentages.
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {canPay ? (
            <Link
              to="/hr/payroll"
              className="inline-flex items-center gap-2 rounded-xl bg-[#7028e6] px-4 py-2.5 text-[11px] font-black uppercase text-white no-underline"
            >
              <Banknote size={16} />
              Payroll runs
              <ArrowRight size={14} />
            </Link>
          ) : null}
          {c.canUploadAttendance || canPay ? (
            <Link
              to="/hr/time"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-[11px] font-black uppercase text-[#7028e6] no-underline"
            >
              <Upload size={16} />
              Attendance
            </Link>
          ) : null}
          {canDir ? (
            <Link
              to="/hr/staff"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-[11px] font-black uppercase text-[#7028e6] no-underline"
            >
              <Users size={16} />
              Staff files
            </Link>
          ) : null}
          {canDir ? (
            <Link
              to="/hr/talent"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-[11px] font-black uppercase text-[#7028e6] no-underline"
            >
              <HeartHandshake size={16} />
              Talent &amp; welfare
            </Link>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-black text-[#7028e6]">
          <Calculator size={18} />
          Net pay calculator
        </h3>
        <p className="mt-2 text-xs text-slate-500 max-w-2xl">
          Select an employee to pull package and approved loan deduction from the directory and casework. Adjust bonus
          for one-off modelling; accrual notes are saved on the HR file.
        </p>

        {canDir && staff.length > 0 ? (
          <div className="mt-4 max-w-xl">
            <label className="text-xs font-bold text-slate-700">
              Employee (optional)
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={selectedUserId}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedUserId(v);
                  if (!v) {
                    setAccrualDraft('');
                  }
                }}
              >
                <option value="">— Manual figures —</option>
                {staff.map((s) => (
                  <option key={s.userId} value={s.userId}>
                    {s.displayName}
                    {s.employeeNo ? ` · ${s.employeeNo}` : ''} · {s.branchId || '—'}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : canDir ? (
          <p className="mt-4 text-sm text-amber-800">No staff in your directory scope.</p>
        ) : (
          <p className="mt-4 text-sm text-slate-600">
            You do not have directory access — enter figures manually, or ask HR for staff visibility.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase text-[#7028e6]"
            onClick={() => {
              if (!snapshot) return;
              setTaxPct(Number(snapshot.taxPercent) || 7.5);
              setPenPct(Number(snapshot.pensionPercent) || 8);
              showToast('Tax & pension matched to payroll reference.');
            }}
          >
            Sync tax &amp; pension from payroll
          </button>
          {selectedStaff ? (
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase text-[#7028e6]"
              onClick={() => {
                setGross(packageGross(selectedStaff));
                setLoanDed(loanByUserId[selectedStaff.userId] || 0);
                showToast('Gross and loan reset from file + approved loans.');
              }}
            >
              Reset gross &amp; loan from data
            </button>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-bold text-slate-700">
            Monthly package (base + housing + transport) (₦)
            <input
              type="number"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={gross}
              onChange={(e) => setGross(e.target.value)}
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Bonus / variable (₦)
            <input
              type="number"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Tax %
            <input
              type="number"
              step="0.1"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={taxPct}
              onChange={(e) => setTaxPct(e.target.value)}
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Pension %
            <input
              type="number"
              step="0.1"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={penPct}
              onChange={(e) => setPenPct(e.target.value)}
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Loan / advance payroll deduction (₦ / month)
            <input
              type="number"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={loanDed}
              onChange={(e) => setLoanDed(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-6 rounded-xl border border-violet-100 bg-violet-50/50 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-[#7028e6] font-black text-xs uppercase">
            <Percent size={14} />
            Indicative net (before other statutory / HR adjustments)
          </div>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Tax</dt>
              <dd className="font-semibold tabular-nums">₦{formatNgn(netPreview.tax)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Pension</dt>
              <dd className="font-semibold tabular-nums">₦{formatNgn(netPreview.pen)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Loan / advance</dt>
              <dd className="font-semibold tabular-nums">₦{formatNgn(netPreview.loan)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-violet-200/80 pt-2 sm:col-span-2">
              <dt className="font-black text-[#7028e6]">Net</dt>
              <dd className="font-black tabular-nums text-[#7028e6]">₦{formatNgn(netPreview.net)}</dd>
            </div>
          </dl>
        </div>

        {selectedStaff && c.canManageStaff ? (
          <form onSubmit={saveAccrualNote} className="mt-6 space-y-2 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
            <label className="block text-xs font-bold text-slate-700">
              Bonus / variable pay accrual note (saved on employee file)
              <textarea
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={accrualDraft}
                onChange={(e) => setAccrualDraft(e.target.value)}
                placeholder="e.g. Q1 performance bonus accrued — subject to payroll approval"
              />
            </label>
            <button
              type="submit"
              disabled={accrualBusy}
              className="rounded-xl bg-[#7028e6] px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-50"
            >
              Save note on file
            </button>
          </form>
        ) : null}
      </section>

      {(snapshot?.approvedLoans?.length ?? 0) > 0 ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm overflow-hidden">
          <h3 className="text-sm font-black text-[#7028e6]">Approved staff loans</h3>
          <p className="mt-1 text-xs text-slate-500">
            Executive-approved loans appear here. Finance must pay the linked <strong>payment request</strong> (Account)
            before the monthly repayment amount is applied in payroll runs.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Months</th>
                  <th className="px-3 py-2">Deduction / mo</th>
                  <th className="px-3 py-2">Principal left</th>
                  <th className="px-3 py-2">Months left</th>
                  <th className="px-3 py-2">Payroll</th>
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
                          className="text-[11px] font-black uppercase text-[#7028e6] no-underline hover:underline"
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
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-violet-600 px-5 py-4 text-white">
              <div className="min-w-0">
                <h4 id="loan-maint-title" className="text-sm font-black">
                  {loanCloseOnly ? 'Close loan early' : 'Adjust loan terms'}
                </h4>
                <p className="mt-1 text-xs text-violet-100 truncate" title={`${loanMaint.staffDisplayName} · ${loanMaint.requestId}`}>
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
                className="rounded-xl bg-[#7028e6] px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-50"
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
            <h3 className="text-sm font-black text-[#7028e6]">Compensation on file (your scope)</h3>
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
                  <th className="px-3 py-2 text-right">Package</th>
                  <th className="px-3 py-2 text-right">Loan / mo</th>
                  <th className="px-3 py-2">Accrual note</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((s) => {
                  const pkg = packageGross(s);
                  const loanM = loanByUserId[s.userId] || 0;
                  const note = (s.bonusAccrualNote || '').trim();
                  return (
                    <tr key={s.userId} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-2">
                        <p className="font-semibold text-slate-800">{s.displayName}</p>
                        <p className="text-xs text-slate-500">{s.employeeNo || s.username}</p>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{s.branchId || '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">₦{formatNgn(pkg)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-900">
                        {loanM ? `₦${formatNgn(loanM)}` : '—'}
                      </td>
                      <td className="px-3 py-2 max-w-[200px] truncate text-xs text-slate-600" title={note}>
                        {note || '—'}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          className="text-[11px] font-black uppercase text-[#7028e6]"
                          onClick={() => setSelectedUserId(s.userId)}
                        >
                          Use in calculator
                        </button>
                        <Link
                          to={`/hr/staff/${encodeURIComponent(s.userId)}`}
                          className="ml-3 text-[11px] font-black uppercase text-slate-500 no-underline hover:underline"
                        >
                          Open
                        </Link>
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
