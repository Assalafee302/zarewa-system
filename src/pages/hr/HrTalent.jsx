import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Briefcase,
  CalendarRange,
  CheckCircle2,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { MainPanel, ModalFrame, PageHeader } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import { formatNgn, statusChipClass } from '../../hr/hrFormat';
import HrCapsLoading from './hrCapsLoading';
import { HrOpsToolbar, HrSectionCard } from './hrUx';

const KINDS = [
  { value: '', label: 'All kinds' },
  { value: 'leave', label: 'Leave' },
  { value: 'loan', label: 'Loan' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'appeal', label: 'Appeal' },
  { value: 'profile_change', label: 'Profile change' },
  { value: 'bonus', label: 'Bonus' },
  { value: 'training', label: 'Training' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'welfare', label: 'Welfare' },
  { value: 'other', label: 'Other' },
];

const CREATE_KINDS = KINDS.filter((k) => k.value);

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'hr_review', label: 'HR review' },
  { value: 'manager_review', label: 'Executive review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

function statusStyle(s) {
  return statusChipClass(s);
}

export default function HrTalent() {
  const { caps } = useHrWorkspace();
  const ws = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const selfId = ws?.session?.user?.id;
  const { show: showToast } = useToast();
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    kind: 'leave',
    title: '',
    body: '',
    amountNgn: '',
    repaymentMonths: '',
    deductionPerMonthNgn: '',
  });
  const [loanOpen, setLoanOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [loanForm, setLoanForm] = useState({
    title: '',
    purpose: '',
    amountNgn: '',
    repaymentMonths: '',
    deductionPerMonthNgn: '',
    preferredDisbursementIso: '',
    urgency: 'normal',
    guarantorName: '',
    guarantorPhone: '',
    otherCommitmentsNgn: '',
  });
  const [leaveForm, setLeaveForm] = useState({
    title: '',
    leaveType: 'annual',
    startDateIso: '',
    endDateIso: '',
    resumeDateIso: '',
    handoverTo: '',
    contactDuringLeave: '',
    travelLocation: '',
    reason: '',
  });
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewForm, setReviewForm] = useState({ approve: true, note: '' });
  const [reviewRole, setReviewRole] = useState('hr');

  const canQueue = caps?.canHrReview || caps?.canFinalApprove || caps?.canManageStaff;

  const load = useCallback(async () => {
    setBusy(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (kindFilter) params.set('kind', kindFilter);
    if (statusFilter) params.set('status', statusFilter);
    const qs = params.toString();
    const { ok, data } = await apiFetch(`/api/hr/requests${qs ? `?${qs}` : ''}`);
    setBusy(false);
    if (ok && data?.ok) setRequests(data.requests || []);
    else setRequests([]);
  }, [q, kindFilter, statusFilter]);

  useEffect(() => {
    if (caps === null || caps.enabled === false) return;
    const delay = q.trim() ? 300 : 0;
    const t = window.setTimeout(() => {
      void load();
    }, delay);
    return () => window.clearTimeout(t);
  }, [caps, load, q, kindFilter, statusFilter]);

  useEffect(() => {
    const st = location.state;
    if (!st || typeof st !== 'object') return;
    const t = window.setTimeout(() => {
      if (st.openLeaveForm) {
        setLeaveOpen(true);
        navigate(location.pathname, { replace: true, state: {} });
        return;
      }
      if (st.openLoanForm) {
        setLoanOpen(true);
        navigate(location.pathname, { replace: true, state: {} });
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [location.state, location.pathname, navigate]);

  const submitCreate = async (e) => {
    e.preventDefault();
    const title = createForm.title.trim();
    if (title.length < 2) {
      showToast('Title is required.', { variant: 'error' });
      return;
    }
    const body = {
      kind: createForm.kind,
      title,
      body: createForm.body.trim() || null,
    };
    if (createForm.kind === 'loan') {
      body.payload = {
        amountNgn: Math.round(Number(createForm.amountNgn) || 0),
        repaymentMonths: Math.round(Number(createForm.repaymentMonths) || 0),
        deductionPerMonthNgn: Math.round(Number(createForm.deductionPerMonthNgn) || 0),
      };
    }
    setBusy(true);
    const { ok, data } = await apiFetch('/api/hr/requests', { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not create request.', { variant: 'error' });
      return;
    }
    showToast('Draft saved. Submit it when ready.');
    setCreateOpen(false);
    setCreateForm({
      kind: 'leave',
      title: '',
      body: '',
      amountNgn: '',
      repaymentMonths: '',
      deductionPerMonthNgn: '',
    });
    load();
  };

  const submitLoanApplication = async (e) => {
    e.preventDefault();
    const amountNgn = Math.round(Number(loanForm.amountNgn) || 0);
    const repaymentMonths = Math.max(0, Math.round(Number(loanForm.repaymentMonths) || 0));
    let deductionPerMonthNgn = Math.round(Number(loanForm.deductionPerMonthNgn) || 0);
    if (amountNgn <= 0) {
      showToast('Loan amount must be greater than zero.', { variant: 'error' });
      return;
    }
    if (repaymentMonths <= 0) {
      showToast('Repayment months is required.', { variant: 'error' });
      return;
    }
    if (deductionPerMonthNgn <= 0) {
      deductionPerMonthNgn = Math.max(1, Math.round(amountNgn / repaymentMonths));
    }
    const title = loanForm.title.trim() || `Loan request — ₦${formatNgn(amountNgn)}`;
    const purpose = loanForm.purpose.trim();
    if (purpose.length < 8) {
      showToast('Please provide a clear loan purpose.', { variant: 'error' });
      return;
    }
    const body = {
      kind: 'loan',
      title,
      body: purpose,
      payload: {
        amountNgn,
        repaymentMonths,
        deductionPerMonthNgn,
        preferredDisbursementIso: loanForm.preferredDisbursementIso || null,
        urgency: loanForm.urgency || 'normal',
        guarantorName: loanForm.guarantorName.trim() || null,
        guarantorPhone: loanForm.guarantorPhone.trim() || null,
        otherCommitmentsNgn: Math.max(0, Math.round(Number(loanForm.otherCommitmentsNgn) || 0)),
      },
    };
    setBusy(true);
    const { ok, data } = await apiFetch('/api/hr/requests', { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not create loan application.', { variant: 'error' });
      return;
    }
    setLoanOpen(false);
    setLoanForm({
      title: '',
      purpose: '',
      amountNgn: '',
      repaymentMonths: '',
      deductionPerMonthNgn: '',
      preferredDisbursementIso: '',
      urgency: 'normal',
      guarantorName: '',
      guarantorPhone: '',
      otherCommitmentsNgn: '',
    });
    showToast('Loan application saved as draft. Submit it from the list.');
    load();
  };

  const submitLeaveApplication = async (e) => {
    e.preventDefault();
    const title = leaveForm.title.trim() || `${leaveForm.leaveType} leave application`;
    if (!leaveForm.startDateIso || !leaveForm.endDateIso) {
      showToast('Leave start and end dates are required.', { variant: 'error' });
      return;
    }
    if (leaveForm.endDateIso < leaveForm.startDateIso) {
      showToast('Leave end date cannot be earlier than start date.', { variant: 'error' });
      return;
    }
    if (leaveForm.reason.trim().length < 6) {
      showToast('Please provide a brief leave reason.', { variant: 'error' });
      return;
    }
    const startMs = Date.parse(leaveForm.startDateIso);
    const endMs = Date.parse(leaveForm.endDateIso);
    const leaveDaysRequested =
      Number.isFinite(startMs) && Number.isFinite(endMs)
        ? Math.max(1, Math.round((endMs - startMs) / 86400000) + 1)
        : null;
    const body = {
      kind: 'leave',
      title,
      body: leaveForm.reason.trim(),
      payload: {
        leaveType: leaveForm.leaveType,
        startDateIso: leaveForm.startDateIso,
        endDateIso: leaveForm.endDateIso,
        resumeDateIso: leaveForm.resumeDateIso || null,
        leaveDaysRequested,
        handoverTo: leaveForm.handoverTo.trim() || null,
        contactDuringLeave: leaveForm.contactDuringLeave.trim() || null,
        travelLocation: leaveForm.travelLocation.trim() || null,
      },
    };
    setBusy(true);
    const { ok, data } = await apiFetch('/api/hr/requests', { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not create leave application.', { variant: 'error' });
      return;
    }
    setLeaveOpen(false);
    setLeaveForm({
      title: '',
      leaveType: 'annual',
      startDateIso: '',
      endDateIso: '',
      resumeDateIso: '',
      handoverTo: '',
      contactDuringLeave: '',
      travelLocation: '',
      reason: '',
    });
    showToast('Leave application saved as draft. Submit it from the list.');
    load();
  };

  const submitRequest = async (id) => {
    setBusy(true);
    const { ok, data } = await apiFetch(`/api/hr/requests/${encodeURIComponent(id)}/submit`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Submit failed.', { variant: 'error' });
      return;
    }
    showToast('Submitted to HR.');
    load();
  };

  const deleteDraft = async (id) => {
    if (!window.confirm('Delete this draft?')) return;
    setBusy(true);
    const { ok, data } = await apiFetch(`/api/hr/requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Delete failed.', { variant: 'error' });
      return;
    }
    showToast('Draft removed.');
    load();
  };

  const runReview = async () => {
    if (!reviewTarget) return;
    const path =
      reviewRole === 'hr'
        ? `/api/hr/requests/${encodeURIComponent(reviewTarget.id)}/hr-review`
        : `/api/hr/requests/${encodeURIComponent(reviewTarget.id)}/manager-review`;
    setBusy(true);
    const { ok, data } = await apiFetch(path, {
      method: 'PATCH',
      body: JSON.stringify({ approve: reviewForm.approve, note: reviewForm.note }),
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Review failed.', { variant: 'error' });
      return;
    }
    showToast(reviewForm.approve ? 'Approved.' : 'Rejected.');
    setReviewTarget(null);
    load();
  };

  const openHrReview = (r) => {
    setReviewRole('hr');
    setReviewForm({ approve: true, note: '' });
    setReviewTarget(r);
  };

  const openMgrReview = (r) => {
    setReviewRole('manager');
    setReviewForm({ approve: true, note: '' });
    setReviewTarget(r);
  };

  const needsMyAction = useMemo(() => {
    return (r) => {
      if (r.status === 'hr_review' && caps?.canHrReview) return true;
      if (r.status === 'manager_review' && caps?.canFinalApprove) return true;
      return false;
    };
  }, [caps]);

  if (caps === null) return <HrCapsLoading />;

  if (caps.enabled === false) {
    return (
      <MainPanel>
        <PageHeader eyebrow="Human resources" title="Leave & HR requests" />
        <p className="text-sm text-amber-800">HR data is not initialised on this server.</p>
      </MainPanel>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Human resources"
        title="Leave & HR requests"
        subtitle="One queue for leave, loans, welfare, and other HR cases — submit, get HR then executive approval, and push approved loans into finance for payout."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => load()}
              disabled={busy}
              className="z-btn-secondary gap-2 py-2 px-4 text-xs disabled:opacity-50"
            >
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setLoanOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-[#134e4a]"
            >
              <Wallet size={14} />
              Apply loan
            </button>
            <button
              type="button"
              onClick={() => setLeaveOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-[#134e4a]"
            >
              <CalendarRange size={14} />
              Apply leave
            </button>
            <button type="button" onClick={() => setCreateOpen(true)} className="z-btn-primary gap-2 py-2 px-4 text-xs">
              <Plus size={14} />
              New request
            </button>
          </div>
        }
      />
      <MainPanel>
        <HrOpsToolbar
          left={<span className="text-xs font-semibold text-slate-600">Unified create/review/approve queue</span>}
          right={
            <button
              type="button"
              onClick={() => load()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-black uppercase text-[#134e4a] disabled:opacity-50"
            >
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
              Refresh
            </button>
          }
        />
        <HrSectionCard title="Request queue" subtitle="Create, submit, and review HR requests in one rail">
        <div className="mb-6 flex flex-wrap gap-3 text-sm">
          <Link
            to="/accounts"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-black uppercase text-[#134e4a] no-underline"
          >
            Account / payments →
          </Link>
          <Link
            to="/hr/salary-welfare"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-black uppercase text-slate-600 no-underline"
          >
            Loans &amp; welfare →
          </Link>
        </div>

        {canQueue ? (
          <p className="mb-4 rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-2 text-xs text-slate-700">
            <Briefcase className="inline mr-1 text-[#134e4a]" size={14} />
            You see the <strong>branch queue</strong>. Staff without HR permissions only see their own requests.
          </p>
        ) : null}

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <label className="text-xs font-bold text-slate-700">
            <span className="flex items-center gap-1">
              <Search size={12} />
              Search
            </span>
            <input
              className="mt-1 w-48 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Title, name…"
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Kind
            <select
              className="mt-1 w-44 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
            >
              {KINDS.map((k) => (
                <option key={k.value || 'all'} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">
            Status
            <select
              className="mt-1 w-44 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map((k) => (
                <option key={k.value || 'all'} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {requests.length === 0 ? (
          <p className="text-sm text-slate-600">No requests match your filters.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Kind</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 hidden md:table-cell">Staff</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const mine = r.userId === selfId;
                  const loan = r.kind === 'loan' && r.payload;
                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-slate-100 ${needsMyAction(r) ? 'bg-amber-50/50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{r.title}</p>
                        {loan ? (
                          <p className="text-[11px] text-slate-500">
                            ₦{formatNgn(loan.amountNgn)} · {loan.repaymentMonths || 0} mo · ₦
                            {formatNgn(loan.deductionPerMonthNgn)}/mo
                          </p>
                        ) : null}
                        {loan ? (
                          <p className="text-[11px] text-slate-500">
                            Branch {r.branchId || '—'} · Finance queue{' '}
                            {loan.financePaymentRequestId
                              ? `${loan.disbursementQueueStatus || 'Pending'} (${loan.financePaymentRequestId})`
                              : 'Not yet created'}
                            {loan.loanDisbursedAtIso ? ` · Disbursed ${loan.loanDisbursedAtIso}` : ''}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs capitalize hidden sm:table-cell">{String(r.kind).replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${statusStyle(r.status)}`}
                        >
                          {String(r.status).replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs hidden md:table-cell">
                        {r.userId ? (
                          <Link
                            to={`/hr/staff/${encodeURIComponent(r.userId)}`}
                            className="font-medium text-[#134e4a] hover:underline"
                          >
                            {r.staffDisplayName || '—'}
                          </Link>
                        ) : (
                          <span className="font-medium">{r.staffDisplayName || '—'}</span>
                        )}
                        {mine ? (
                          <span className="ml-1 rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-black text-[#134e4a]">
                            You
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap hidden lg:table-cell">
                        {r.createdAtIso ? String(r.createdAtIso).slice(0, 10) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {mine && r.status === 'draft' ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                className="text-[11px] font-black uppercase text-[#134e4a]"
                                onClick={() => submitRequest(r.id)}
                              >
                                Submit
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                className="inline-flex items-center gap-0.5 text-[11px] font-black uppercase text-rose-700"
                                onClick={() => deleteDraft(r.id)}
                              >
                                <Trash2 size={12} />
                                Delete
                              </button>
                            </>
                          ) : null}
                          {r.status === 'hr_review' && (caps?.canHrReview || caps?.canManageStaff) ? (
                            <button
                              type="button"
                              className="text-[11px] font-black uppercase text-amber-900"
                              onClick={() => openHrReview(r)}
                            >
                              HR review
                            </button>
                          ) : null}
                          {r.status === 'manager_review' && caps?.canFinalApprove ? (
                            <button
                              type="button"
                              className="text-[11px] font-black uppercase text-sky-900"
                              onClick={() => openMgrReview(r)}
                            >
                              Executive
                            </button>
                          ) : null}
                          {r.body ? (
                            <span className="text-[11px] text-slate-400" title={r.body}>
                              <FileText size={14} className="inline" />
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </HrSectionCard>
      </MainPanel>

      <ModalFrame isOpen={loanOpen} onClose={() => setLoanOpen(false)}>
        <div className="w-full max-w-2xl rounded-[28px] border border-slate-200/90 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-[#134e4a] px-5 py-4 text-white">
            <h2 className="text-base font-black">Loan application</h2>
            <button type="button" className="rounded-xl p-2 hover:bg-white/10" aria-label="Close" onClick={() => setLoanOpen(false)}>
              <X size={20} />
            </button>
          </div>
          <form onSubmit={submitLoanApplication} className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-slate-700">
                Application title
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={loanForm.title}
                  onChange={(e) => setLoanForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Loan request - medical support"
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Urgency
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={loanForm.urgency}
                  onChange={(e) => setLoanForm((f) => ({ ...f, urgency: e.target.value }))}
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Purpose / justification
              <textarea
                required
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={loanForm.purpose}
                onChange={(e) => setLoanForm((f) => ({ ...f, purpose: e.target.value }))}
                placeholder="Why you need this loan and how repayment will be managed."
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-bold text-slate-700">
                Amount (Naira)
                <input
                  required
                  type="number"
                  min="1"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={loanForm.amountNgn}
                  onChange={(e) => setLoanForm((f) => ({ ...f, amountNgn: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Repayment months
                <input
                  required
                  type="number"
                  min="1"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={loanForm.repaymentMonths}
                  onChange={(e) => setLoanForm((f) => ({ ...f, repaymentMonths: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Deduction / month (Naira)
                <input
                  type="number"
                  min="0"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={loanForm.deductionPerMonthNgn}
                  onChange={(e) => setLoanForm((f) => ({ ...f, deductionPerMonthNgn: e.target.value }))}
                  placeholder="Auto-calculated if empty"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-slate-700">
                Preferred disbursement date
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={loanForm.preferredDisbursementIso}
                  onChange={(e) => setLoanForm((f) => ({ ...f, preferredDisbursementIso: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Other monthly commitments (Naira)
                <input
                  type="number"
                  min="0"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={loanForm.otherCommitmentsNgn}
                  onChange={(e) => setLoanForm((f) => ({ ...f, otherCommitmentsNgn: e.target.value }))}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-slate-700">
                Guarantor name
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={loanForm.guarantorName}
                  onChange={(e) => setLoanForm((f) => ({ ...f, guarantorName: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Guarantor phone
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={loanForm.guarantorPhone}
                  onChange={(e) => setLoanForm((f) => ({ ...f, guarantorPhone: e.target.value }))}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-black uppercase text-slate-600"
                onClick={() => setLoanOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-[#134e4a] px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-50"
              >
                Save draft
              </button>
            </div>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={leaveOpen} onClose={() => setLeaveOpen(false)}>
        <div className="w-full max-w-2xl rounded-[28px] border border-slate-200/90 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-[#134e4a] px-5 py-4 text-white">
            <h2 className="text-base font-black">Leave application</h2>
            <button type="button" className="rounded-xl p-2 hover:bg-white/10" aria-label="Close" onClick={() => setLeaveOpen(false)}>
              <X size={20} />
            </button>
          </div>
          <form onSubmit={submitLeaveApplication} className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-slate-700">
                Application title
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={leaveForm.title}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Annual leave request"
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Leave type
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={leaveForm.leaveType}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, leaveType: e.target.value }))}
                >
                  <option value="annual">Annual</option>
                  <option value="sick">Sick</option>
                  <option value="casual">Casual</option>
                  <option value="maternity">Maternity</option>
                  <option value="paternity">Paternity</option>
                  <option value="compassionate">Compassionate</option>
                  <option value="study">Study</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-bold text-slate-700">
                Start date
                <input
                  required
                  type="date"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={leaveForm.startDateIso}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, startDateIso: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                End date
                <input
                  required
                  type="date"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={leaveForm.endDateIso}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, endDateIso: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Resume date
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={leaveForm.resumeDateIso}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, resumeDateIso: e.target.value }))}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-slate-700">
                Handover to
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={leaveForm.handoverTo}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, handoverTo: e.target.value }))}
                  placeholder="Colleague / supervisor"
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Contact while away
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={leaveForm.contactDuringLeave}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, contactDuringLeave: e.target.value }))}
                  placeholder="Phone or email"
                />
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Travel / stay location
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={leaveForm.travelLocation}
                onChange={(e) => setLeaveForm((f) => ({ ...f, travelLocation: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Reason
              <textarea
                required
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Reason for leave and key notes for HR."
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-black uppercase text-slate-600"
                onClick={() => setLeaveOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-[#134e4a] px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-50"
              >
                Save draft
              </button>
            </div>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={createOpen} onClose={() => setCreateOpen(false)}>
        <div className="w-full max-w-md rounded-[28px] border border-slate-200/90 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-[#134e4a] px-5 py-4 text-white">
            <h2 className="text-base font-black">New HR request</h2>
            <button type="button" className="rounded-xl p-2 hover:bg-white/10" aria-label="Close" onClick={() => setCreateOpen(false)}>
              <X size={20} />
            </button>
          </div>
          <form onSubmit={submitCreate} className="space-y-3 p-5">
            <label className="block text-xs font-bold text-slate-700">
              Kind
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={createForm.kind}
                onChange={(e) => setCreateForm((f) => ({ ...f, kind: e.target.value }))}
              >
                {CREATE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Title
              <input
                required
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={createForm.title}
                onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Details
              <textarea
                rows={4}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={createForm.body}
                onChange={(e) => setCreateForm((f) => ({ ...f, body: e.target.value }))}
              />
            </label>
            {createForm.kind === 'loan' ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-bold text-slate-700">
                  Amount (₦)
                  <input
                    type="number"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={createForm.amountNgn}
                    onChange={(e) => setCreateForm((f) => ({ ...f, amountNgn: e.target.value }))}
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Repayment months
                  <input
                    type="number"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={createForm.repaymentMonths}
                    onChange={(e) => setCreateForm((f) => ({ ...f, repaymentMonths: e.target.value }))}
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Deduction / mo (₦)
                  <input
                    type="number"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={createForm.deductionPerMonthNgn}
                    onChange={(e) => setCreateForm((f) => ({ ...f, deductionPerMonthNgn: e.target.value }))}
                  />
                </label>
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-black uppercase text-slate-600"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-[#134e4a] px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-50"
              >
                Save draft
              </button>
            </div>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={Boolean(reviewTarget)} onClose={() => setReviewTarget(null)}>
        <div className="w-full max-w-md rounded-[28px] border border-slate-200/90 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-800 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400">
                {reviewRole === 'hr' ? 'HR review' : 'Executive approval'}
              </p>
              <h2 className="text-base font-black line-clamp-2">{reviewTarget?.title}</h2>
            </div>
            <button
              type="button"
              className="rounded-xl p-2 hover:bg-white/10"
              aria-label="Close"
              onClick={() => setReviewTarget(null)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="space-y-4 p-5">
            {reviewTarget?.body ? (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{reviewTarget.body}</p>
            ) : null}
            <div className="flex gap-3">
              <button
                type="button"
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-3 py-2 text-xs font-black uppercase ${
                  reviewForm.approve ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-500'
                }`}
                onClick={() => setReviewForm((f) => ({ ...f, approve: true }))}
              >
                <CheckCircle2 size={16} />
                Approve
              </button>
              <button
                type="button"
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-3 py-2 text-xs font-black uppercase ${
                  !reviewForm.approve ? 'border-rose-500 bg-rose-50 text-rose-900' : 'border-slate-200 text-slate-500'
                }`}
                onClick={() => setReviewForm((f) => ({ ...f, approve: false }))}
              >
                <XCircle size={16} />
                Reject
              </button>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Note
              <textarea
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={reviewForm.note}
                onChange={(e) => setReviewForm((f) => ({ ...f, note: e.target.value }))}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={runReview}
              className="w-full rounded-xl bg-[#134e4a] px-4 py-2.5 text-[11px] font-black uppercase text-white disabled:opacity-50"
            >
              Submit decision
            </button>
          </div>
        </div>
      </ModalFrame>
    </>
  );
}
