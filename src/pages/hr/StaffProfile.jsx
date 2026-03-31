import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { FileText, Pencil, RefreshCw } from 'lucide-react';
import { MainPanel, ModalFrame, PageHeader } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import { formatNgn } from '../../hr/hrFormat';
import HrCapsLoading from './hrCapsLoading';

function mergeSelfProfile(user, hr) {
  if (!user) return null;
  if (!hr) {
    return {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      roleKey: user.roleKey,
      jobTitle: null,
      branchId: null,
      employeeNo: null,
      _noHrFile: true,
    };
  }
  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    roleKey: user.roleKey,
    branchId: hr.branchId,
    employeeNo: hr.employeeNo,
    jobTitle: hr.jobTitle,
    department: hr.department,
    employmentType: hr.employmentType,
    dateJoinedIso: hr.dateJoinedIso,
    probationEndIso: hr.probationEndIso,
    bankAccountName: hr.bankAccountName,
    bankName: hr.bankName,
    bankAccountNoMasked: hr.bankAccountNoMasked,
    taxId: hr.taxId,
    pensionRsaPin: hr.pensionRsaPin,
    baseSalaryNgn: hr.baseSalaryNgn,
    housingAllowanceNgn: hr.housingAllowanceNgn,
    transportAllowanceNgn: hr.transportAllowanceNgn,
    minimumQualification: hr.minimumQualification,
    academicQualification: hr.academicQualification,
    promotionGrade: hr.promotionGrade,
    welfareNotes: hr.welfareNotes,
    trainingSummary: hr.trainingSummary,
    bonusAccrualNote: hr.bonusAccrualNote,
    nextOfKin: hr.nextOfKin,
    profileExtra: hr.profileExtra || {},
  };
}

const emptyEdit = {
  branchId: '',
  employeeNo: '',
  jobTitle: '',
  department: '',
  employmentType: 'permanent',
  dateJoinedIso: '',
  probationEndIso: '',
  baseSalaryNgn: '',
  housingAllowanceNgn: '',
  transportAllowanceNgn: '',
  bankName: '',
  bankAccountName: '',
  bankAccountNoMasked: '',
  taxId: '',
  pensionRsaPin: '',
  minimumQualification: '',
  academicQualification: '',
  promotionGrade: '',
  welfareNotes: '',
  trainingSummary: '',
};

export default function StaffProfile() {
  const { userId: userIdParam } = useParams();
  const userId = userIdParam ? decodeURIComponent(userIdParam) : '';
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const selfId = ws?.session?.user?.id;
  const isSelf = useMemo(
    () => Boolean(userId && (userId === 'me' || (selfId && userId === selfId))),
    [userId, selfId]
  );
  const { caps } = useHrWorkspace();
  const [row, setRow] = useState(null);
  const [busy, setBusy] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(emptyEdit);
  const [letterOpen, setLetterOpen] = useState(false);
  const [letterText, setLetterText] = useState('');
  const [letterBusy, setLetterBusy] = useState(false);

  const branches = useMemo(
    () => ws?.snapshot?.workspaceBranches ?? ws?.session?.branches ?? [],
    [ws?.snapshot?.workspaceBranches, ws?.session?.branches]
  );

  const load = useCallback(async () => {
    if (!userId) {
      setBusy(false);
      return;
    }
    setBusy(true);
    const { ok, data } = await apiFetch(`/api/hr/staff/${encodeURIComponent(userId)}`);
    setBusy(false);
    if (!ok || !data?.ok) {
      setRow(null);
      return;
    }
    if (data.mode === 'self' && data.user) {
      setRow(mergeSelfProfile(data.user, data.hr));
    } else if (data.profile) {
      setRow(data.profile);
    } else if (data.user) {
      setRow(mergeSelfProfile(data.user, data.hr));
    } else setRow(null);
  }, [userId]);

  useEffect(() => {
    if (caps === null || !userId) return;
    if (!isSelf && !caps.canViewDirectory) return;
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [caps, userId, isSelf, load]);

  const openEdit = () => {
    if (!row) return;
    setEditForm({
      branchId: row.branchId || '',
      employeeNo: row.employeeNo || '',
      jobTitle: row.jobTitle || '',
      department: row.department || '',
      employmentType: row.employmentType || 'permanent',
      dateJoinedIso: row.dateJoinedIso || '',
      probationEndIso: row.probationEndIso || '',
      baseSalaryNgn: String(row.baseSalaryNgn ?? ''),
      housingAllowanceNgn: String(row.housingAllowanceNgn ?? ''),
      transportAllowanceNgn: String(row.transportAllowanceNgn ?? ''),
      bankName: row.bankName || '',
      bankAccountName: row.bankAccountName || '',
      bankAccountNoMasked: row.bankAccountNoMasked || '',
      taxId: row.taxId || '',
      pensionRsaPin: row.pensionRsaPin || '',
      minimumQualification: row.minimumQualification || '',
      academicQualification: row.academicQualification || '',
      promotionGrade: row.promotionGrade || '',
      welfareNotes: row.welfareNotes || '',
      trainingSummary: row.trainingSummary || '',
    });
    setEditOpen(true);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!row?.userId) return;
    setBusy(true);
    const body = {
      branchId: editForm.branchId.trim() || undefined,
      employeeNo: editForm.employeeNo.trim() || null,
      jobTitle: editForm.jobTitle.trim() || null,
      department: editForm.department.trim() || null,
      employmentType: editForm.employmentType.trim() || null,
      dateJoinedIso: editForm.dateJoinedIso.trim() || null,
      probationEndIso: editForm.probationEndIso.trim() || null,
      baseSalaryNgn: Math.round(Number(editForm.baseSalaryNgn) || 0),
      housingAllowanceNgn: Math.round(Number(editForm.housingAllowanceNgn) || 0),
      transportAllowanceNgn: Math.round(Number(editForm.transportAllowanceNgn) || 0),
      bankName: editForm.bankName.trim() || null,
      bankAccountName: editForm.bankAccountName.trim() || null,
      bankAccountNoMasked: editForm.bankAccountNoMasked.trim() || null,
      taxId: editForm.taxId.trim() || null,
      pensionRsaPin: editForm.pensionRsaPin.trim() || null,
      minimumQualification: editForm.minimumQualification.trim() || null,
      academicQualification: editForm.academicQualification.trim() || null,
      promotionGrade: editForm.promotionGrade.trim() || null,
      welfareNotes: editForm.welfareNotes.trim() || null,
      trainingSummary: editForm.trainingSummary.trim() || null,
    };
    const { ok, data } = await apiFetch(`/api/hr/staff/${encodeURIComponent(row.userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not save profile.', { variant: 'error' });
      return;
    }
    setEditOpen(false);
    load();
  };

  const issueLetter = async () => {
    if (!row?.userId) return;
    setLetterBusy(true);
    const { ok, data } = await apiFetch('/api/hr/employment-letters', {
      method: 'POST',
      body: JSON.stringify({ userId: row.userId, letterKind: 'employment' }),
    });
    setLetterBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not generate letter.', { variant: 'error' });
      return;
    }
    setLetterText(data.contentText || '');
    setLetterOpen(true);
  };

  const extra = row?.profileExtra || {};
  const leaveRec = extra.leaveRecord;
  const disciplinary = Array.isArray(extra.disciplinaryEvents) ? extra.disciplinaryEvents : [];

  if (caps === null) return <HrCapsLoading />;
  if (!isSelf && !caps.canViewDirectory) return <Navigate to="/hr" replace />;
  if (userId && row === null && busy) return <HrCapsLoading />;
  if (!row) {
    return (
      <MainPanel>
        <PageHeader title="Staff profile" />
        <p className="text-sm text-slate-600">Profile not found.</p>
        <Link className="mt-4 inline-block text-sm text-violet-700 hover:underline" to="/hr/staff">
          Back to directory
        </Link>
      </MainPanel>
    );
  }

  const canEdit = caps.canManageStaff && !isSelf;
  const canLetter = caps.canIssueLetters && !row._noHrFile;

  return (
    <>
      <PageHeader
        title={row.displayName || row.username || 'Staff'}
        subtitle={row.jobTitle || row.department || 'Employee record'}
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
            {canEdit ? (
              <button
                type="button"
                onClick={openEdit}
                className="inline-flex items-center gap-2 rounded-xl bg-[#7028e6] px-3 py-2 text-[11px] font-black uppercase text-white"
              >
                <Pencil size={14} />
                Edit file
              </button>
            ) : null}
            {canLetter ? (
              <button
                type="button"
                onClick={issueLetter}
                disabled={letterBusy}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-black uppercase text-slate-800"
              >
                <FileText size={14} />
                Employment letter
              </button>
            ) : null}
          </div>
        }
      />
      <MainPanel>
        {row._noHrFile ? (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            No HR employee file yet for this account. An administrator can create one from the staff directory or edit
            your profile once linked.
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <h3 className="text-[11px] font-black uppercase text-[#7028e6]">Identity</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Username</dt>
                <dd className="font-medium text-slate-900">{row.username}</dd>
              </div>
              {row.email ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Email</dt>
                  <dd className="font-medium text-slate-900">{row.email}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Branch</dt>
                <dd className="font-medium text-slate-900">{row.branchId || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Employee no.</dt>
                <dd className="font-medium text-slate-900">{row.employeeNo || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Department</dt>
                <dd className="font-medium text-slate-900">{row.department || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Employment</dt>
                <dd className="font-medium text-slate-900 capitalize">{row.employmentType || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Date joined</dt>
                <dd className="font-medium text-slate-900">{row.dateJoinedIso || '—'}</dd>
              </div>
            </dl>
          </section>

          {!row._noHrFile ? (
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
              <h3 className="text-[11px] font-black uppercase text-[#7028e6]">Compensation (monthly)</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Base</dt>
                  <dd className="font-semibold tabular-nums">₦{formatNgn(row.baseSalaryNgn)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Housing</dt>
                  <dd className="font-semibold tabular-nums">₦{formatNgn(row.housingAllowanceNgn)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Transport</dt>
                  <dd className="font-semibold tabular-nums">₦{formatNgn(row.transportAllowanceNgn)}</dd>
                </div>
                {row.bonusAccrualNote ? (
                  <div className="border-t border-slate-100 pt-2">
                    <dt className="text-slate-500 text-xs">Bonus / accrual note</dt>
                    <dd className="mt-1 text-slate-800">{row.bonusAccrualNote}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          {!row._noHrFile ? (
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
              <h3 className="text-[11px] font-black uppercase text-[#7028e6]">Bank &amp; statutory</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Bank</dt>
                  <dd className="font-medium text-slate-900">{row.bankName || '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Account name</dt>
                  <dd className="font-medium text-slate-900">{row.bankAccountName || '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Account no.</dt>
                  <dd className="font-medium text-slate-900">{row.bankAccountNoMasked || '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Tax ID</dt>
                  <dd className="font-medium text-slate-900">{row.taxId || '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">RSA PIN</dt>
                  <dd className="font-medium text-slate-900">{row.pensionRsaPin || '—'}</dd>
                </div>
              </dl>
            </section>
          ) : null}

          {!row._noHrFile ? (
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
              <h3 className="text-[11px] font-black uppercase text-[#7028e6]">Development</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-slate-500 text-xs">Minimum qualification</dt>
                  <dd className="mt-0.5 text-slate-900">{row.minimumQualification || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 text-xs">Academic qualification</dt>
                  <dd className="mt-0.5 text-slate-900">{row.academicQualification || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 text-xs">Promotion grade</dt>
                  <dd className="mt-0.5 text-slate-900">{row.promotionGrade || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 text-xs">Training summary</dt>
                  <dd className="mt-0.5 text-slate-900 whitespace-pre-wrap">{row.trainingSummary || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 text-xs">Welfare notes</dt>
                  <dd className="mt-0.5 text-slate-900 whitespace-pre-wrap">{row.welfareNotes || '—'}</dd>
                </div>
              </dl>
            </section>
          ) : null}
        </div>

        {leaveRec ? (
          <section className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/40 p-5">
            <h3 className="text-[11px] font-black uppercase text-[#7028e6]">Leave record (file)</h3>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Year</dt>
                <dd className="font-medium">{leaveRec.periodYear || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Annual entitlement (days)</dt>
                <dd className="font-medium tabular-nums">{leaveRec.annualEntitlementDays ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Used (approved)</dt>
                <dd className="font-medium tabular-nums">{leaveRec.daysUsedApproved ?? '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Personnel file ref</dt>
                <dd className="font-medium">{leaveRec.personnelFileRef || '—'}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        {disciplinary.length > 0 ? (
          <section className="mt-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <h3 className="text-[11px] font-black uppercase text-rose-800">Disciplinary notes (file)</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {disciplinary.map((ev) => (
                <li key={ev.id || `${ev.dateIso}-${ev.summary}`} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <span className="text-xs font-bold text-slate-500">
                    {ev.dateIso} · {ev.kind}
                  </span>
                  <p className="mt-1 text-slate-800">{ev.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-4 text-sm">
          <Link className="text-violet-700 hover:underline" to="/hr/staff">
            ← Staff directory
          </Link>
          <Link className="text-slate-600 hover:underline" to="/hr/talent">
            HR requests →
          </Link>
          <Link className="text-slate-600 hover:underline" to="/hr/payroll">
            Payroll →
          </Link>
        </div>
      </MainPanel>

      <ModalFrame isOpen={editOpen} onClose={() => setEditOpen(false)}>
        <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[28px] border border-slate-200/90 bg-white shadow-xl">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-violet-600 px-5 py-4 text-white">
            <h2 className="text-base font-black">Edit HR file</h2>
            <button type="button" className="rounded-xl px-2 py-1 text-sm hover:bg-white/10" onClick={() => setEditOpen(false)}>
              Close
            </button>
          </div>
          <form onSubmit={saveEdit} className="space-y-3 p-5">
            <label className="block text-xs font-bold text-slate-700">
              Branch
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editForm.branchId}
                onChange={(e) => setEditForm((f) => ({ ...f, branchId: e.target.value }))}
              >
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name || b.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">
                Employee no.
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.employeeNo}
                  onChange={(e) => setEditForm((f) => ({ ...f, employeeNo: e.target.value }))}
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Job title
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.jobTitle}
                  onChange={(e) => setEditForm((f) => ({ ...f, jobTitle: e.target.value }))}
                />
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Department
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editForm.department}
                onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Employment type
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editForm.employmentType}
                onChange={(e) => setEditForm((f) => ({ ...f, employmentType: e.target.value }))}
              >
                <option value="permanent">Permanent</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
                <option value="temporary">Temporary</option>
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">
                Date joined
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.dateJoinedIso}
                  onChange={(e) => setEditForm((f) => ({ ...f, dateJoinedIso: e.target.value }))}
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Probation end
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.probationEndIso}
                  onChange={(e) => setEditForm((f) => ({ ...f, probationEndIso: e.target.value }))}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-bold text-slate-700">
                Base (₦)
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.baseSalaryNgn}
                  onChange={(e) => setEditForm((f) => ({ ...f, baseSalaryNgn: e.target.value }))}
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Housing (₦)
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.housingAllowanceNgn}
                  onChange={(e) => setEditForm((f) => ({ ...f, housingAllowanceNgn: e.target.value }))}
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Transport (₦)
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.transportAllowanceNgn}
                  onChange={(e) => setEditForm((f) => ({ ...f, transportAllowanceNgn: e.target.value }))}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">
                Bank name
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.bankName}
                  onChange={(e) => setEditForm((f) => ({ ...f, bankName: e.target.value }))}
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Account name
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.bankAccountName}
                  onChange={(e) => setEditForm((f) => ({ ...f, bankAccountName: e.target.value }))}
                />
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Account no. (masked / last digits)
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editForm.bankAccountNoMasked}
                onChange={(e) => setEditForm((f) => ({ ...f, bankAccountNoMasked: e.target.value }))}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">
                Tax ID
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.taxId}
                  onChange={(e) => setEditForm((f) => ({ ...f, taxId: e.target.value }))}
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                RSA PIN
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.pensionRsaPin}
                  onChange={(e) => setEditForm((f) => ({ ...f, pensionRsaPin: e.target.value }))}
                />
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Minimum qualification
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editForm.minimumQualification}
                onChange={(e) => setEditForm((f) => ({ ...f, minimumQualification: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Academic qualification
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editForm.academicQualification}
                onChange={(e) => setEditForm((f) => ({ ...f, academicQualification: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Promotion grade
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editForm.promotionGrade}
                onChange={(e) => setEditForm((f) => ({ ...f, promotionGrade: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Training summary
              <textarea
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editForm.trainingSummary}
                onChange={(e) => setEditForm((f) => ({ ...f, trainingSummary: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Welfare notes
              <textarea
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editForm.welfareNotes}
                onChange={(e) => setEditForm((f) => ({ ...f, welfareNotes: e.target.value }))}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-[#7028e6] px-4 py-2.5 text-[11px] font-black uppercase text-white disabled:opacity-50"
            >
              Save
            </button>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={letterOpen} onClose={() => setLetterOpen(false)}>
        <div className="w-full max-w-lg rounded-[28px] border border-slate-200/90 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-black text-slate-900">Employment letter</h2>
            <button type="button" className="text-sm text-slate-600 hover:underline" onClick={() => setLetterOpen(false)}>
              Close
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-5">
            <pre className="whitespace-pre-wrap text-sm text-slate-800 font-sans">{letterText}</pre>
            <button
              type="button"
              className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-black uppercase text-slate-700"
              onClick={() => {
                void navigator.clipboard.writeText(letterText);
              }}
            >
              Copy text
            </button>
          </div>
        </div>
      </ModalFrame>
    </>
  );
}
