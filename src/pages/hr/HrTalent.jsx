import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  CheckCircle2,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { MainPanel, ModalFrame, PageHeader } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import { formatNgn } from '../../hr/hrFormat';
import HrCapsLoading from './hrCapsLoading';

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
  switch (s) {
    case 'approved':
      return 'bg-emerald-100 text-emerald-900';
    case 'rejected':
      return 'bg-rose-100 text-rose-900';
    case 'hr_review':
      return 'bg-amber-100 text-amber-950';
    case 'manager_review':
      return 'bg-sky-100 text-sky-950';
    case 'draft':
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

export default function HrTalent() {
  const { caps } = useHrWorkspace();
  const ws = useWorkspace();
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
        <PageHeader title="Talent & requests" />
        <p className="text-sm text-amber-800">HR data is not initialised on this server.</p>
      </MainPanel>
    );
  }

  return (
    <>
      <PageHeader
        title="Talent & requests"
        subtitle="Submit HR cases, track approvals, and link loans to finance payment requests."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => load()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-black uppercase text-[#7028e6] disabled:opacity-50"
            >
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#7028e6] px-3 py-2 text-[11px] font-black uppercase text-white"
            >
              <Plus size={14} />
              New request
            </button>
          </div>
        }
      />
      <MainPanel>
        <div className="mb-6 flex flex-wrap gap-3 text-sm">
          <Link
            to="/accounts"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-black uppercase text-[#7028e6] no-underline"
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
          <p className="mb-4 rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-2 text-xs text-slate-700">
            <Briefcase className="inline mr-1 text-violet-700" size={14} />
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
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Created</th>
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
                      </td>
                      <td className="px-4 py-3 text-xs capitalize">{String(r.kind).replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${statusStyle(r.status)}`}
                        >
                          {String(r.status).replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="font-medium">{r.staffDisplayName || '—'}</span>
                        {mine ? (
                          <span className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-black text-violet-800">
                            You
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {r.createdAtIso ? String(r.createdAtIso).slice(0, 10) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {mine && r.status === 'draft' ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                className="text-[11px] font-black uppercase text-[#7028e6]"
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
      </MainPanel>

      <ModalFrame isOpen={createOpen} onClose={() => setCreateOpen(false)}>
        <div className="w-full max-w-md rounded-[28px] border border-slate-200/90 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-violet-600 px-5 py-4 text-white">
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
                className="rounded-xl bg-[#7028e6] px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-50"
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
              className="w-full rounded-xl bg-[#7028e6] px-4 py-2.5 text-[11px] font-black uppercase text-white disabled:opacity-50"
            >
              Submit decision
            </button>
          </div>
        </div>
      </ModalFrame>
    </>
  );
}
