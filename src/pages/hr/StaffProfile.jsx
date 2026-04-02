import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  FileText,
  Pencil,
  RefreshCw,
  LayoutDashboard,
  UserCircle2,
  Wallet,
  Landmark,
  GraduationCap,
  CalendarRange,
  ShieldAlert,
} from 'lucide-react';
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
    payeTaxPercent: hr.payeTaxPercent,
    pensionPercentOverride: hr.pensionPercentOverride,
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
  payeTaxPercent: '',
  pensionPercentOverride: '',
  bonusAccrualNote: '',
  benefitAllocationNote: '',
  endOfYearBonusNote: '',
  otherAllowancesNote: '',
  monthlyDisciplinaryDeductionNgn: '',
  nextOfKinName: '',
  nextOfKinPhone: '',
  nextOfKinRelationship: '',
  nextOfKinAddress: '',
  phoneNumber: '',
  homeAddress: '',
  dobIso: '',
  gender: '',
  maritalStatus: '',
  nationalId: '',
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
  const [staffRequests, setStaffRequests] = useState([]);
  const [approvedLoans, setApprovedLoans] = useState([]);
  const [attendanceUploads, setAttendanceUploads] = useState([]);

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

  useEffect(() => {
    if (!row?.userId) return;
    let active = true;
    const run = async () => {
      const [reqRes, welfareRes, attRes] = await Promise.all([
        apiFetch('/api/hr/requests'),
        apiFetch('/api/hr/salary-welfare/snapshot'),
        apiFetch('/api/hr/attendance'),
      ]);
      if (!active) return;
      if (reqRes.ok && reqRes.data?.ok) setStaffRequests(reqRes.data.requests || []);
      else setStaffRequests([]);
      if (welfareRes.ok && welfareRes.data?.ok) setApprovedLoans(welfareRes.data.approvedLoans || []);
      else setApprovedLoans([]);
      if (attRes.ok && attRes.data?.ok) setAttendanceUploads(attRes.data.uploads || []);
      else setAttendanceUploads([]);
    };
    void run();
    return () => {
      active = false;
    };
  }, [row?.userId]);

  const openEdit = () => {
    if (!row) return;
    const kin = row.nextOfKin || {};
    const personal = row.profileExtra?.personalProfile || {};
    const comp = row.profileExtra?.compensationPackage || {};
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
      payeTaxPercent:
        row.payeTaxPercent != null && row.payeTaxPercent !== '' ? String(row.payeTaxPercent) : '',
      pensionPercentOverride:
        row.pensionPercentOverride != null && row.pensionPercentOverride !== ''
          ? String(row.pensionPercentOverride)
          : '',
      bonusAccrualNote: row.bonusAccrualNote || '',
      benefitAllocationNote: comp.benefitAllocationNote || '',
      endOfYearBonusNote: comp.endOfYearBonusNote || '',
      otherAllowancesNote: comp.otherAllowancesNote || '',
      monthlyDisciplinaryDeductionNgn: String(comp.monthlyDisciplinaryDeductionNgn ?? ''),
      nextOfKinName: kin.name || '',
      nextOfKinPhone: kin.phone || '',
      nextOfKinRelationship: kin.relationship || '',
      nextOfKinAddress: kin.address || '',
      phoneNumber: personal.phoneNumber || '',
      homeAddress: personal.homeAddress || '',
      dobIso: personal.dobIso || '',
      gender: personal.gender || '',
      maritalStatus: personal.maritalStatus || '',
      nationalId: personal.nationalId || '',
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
      bonusAccrualNote: editForm.bonusAccrualNote.trim() || null,
      payeTaxPercent:
        editForm.payeTaxPercent.trim() === ''
          ? null
          : Number.isFinite(Number(editForm.payeTaxPercent))
            ? Number(editForm.payeTaxPercent)
            : null,
      pensionPercentOverride:
        editForm.pensionPercentOverride.trim() === ''
          ? null
          : Number.isFinite(Number(editForm.pensionPercentOverride))
            ? Number(editForm.pensionPercentOverride)
            : null,
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
      nextOfKin: {
        name: editForm.nextOfKinName.trim() || '',
        phone: editForm.nextOfKinPhone.trim() || '',
        relationship: editForm.nextOfKinRelationship.trim() || '',
        address: editForm.nextOfKinAddress.trim() || '',
      },
      profileExtra: {
        ...(row.profileExtra || {}),
        compensationPackage: {
          ...(row.profileExtra?.compensationPackage || {}),
          benefitAllocationNote: editForm.benefitAllocationNote.trim() || '',
          endOfYearBonusNote: editForm.endOfYearBonusNote.trim() || '',
          otherAllowancesNote: editForm.otherAllowancesNote.trim() || '',
          monthlyDisciplinaryDeductionNgn: Math.max(0, Math.round(Number(editForm.monthlyDisciplinaryDeductionNgn) || 0)),
        },
        personalProfile: {
          ...(row.profileExtra?.personalProfile || {}),
          phoneNumber: editForm.phoneNumber.trim() || '',
          homeAddress: editForm.homeAddress.trim() || '',
          dobIso: editForm.dobIso.trim() || '',
          gender: editForm.gender.trim() || '',
          maritalStatus: editForm.maritalStatus.trim() || '',
          nationalId: editForm.nationalId.trim() || '',
        },
      },
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
  const personal = extra.personalProfile || {};
  const compPkg = extra.compensationPackage || {};
  const leaveRec = extra.leaveRecord;
  const disciplinary = Array.isArray(extra.disciplinaryEvents) ? extra.disciplinaryEvents : [];
  const latestAttendance = attendanceUploads[0] || null;
  const currentLoan = useMemo(() => {
    const uid = row?.userId;
    if (!uid) return null;
    const loans = approvedLoans.filter((l) => l.userId === uid);
    if (!loans.length) return null;
    loans.sort((a, b) => String(b.decidedAtIso || '').localeCompare(String(a.decidedAtIso || '')));
    return loans[0];
  }, [approvedLoans, row?.userId]);
  const recentRequests = useMemo(() => {
    const uid = row?.userId;
    if (!uid) return [];
    return staffRequests
      .filter((r) => r.userId === uid)
      .sort((a, b) => String(b.createdAtIso || '').localeCompare(String(a.createdAtIso || '')))
      .slice(0, 8);
  }, [staffRequests, row?.userId]);

  if (caps === null) return <HrCapsLoading />;
  if (!isSelf && !caps.canViewDirectory) return <Navigate to="/hr" replace />;
  if (userId && row === null && busy) return <HrCapsLoading />;
  if (!row) {
    return (
      <MainPanel>
        <PageHeader title="Staff profile" />
        <p className="text-sm text-slate-600">Profile not found.</p>
        <Link className="mt-4 inline-block text-sm text-[#134e4a] hover:underline" to="/hr/staff">
          Back to directory
        </Link>
      </MainPanel>
    );
  }

  const canEdit = caps.canManageStaff && !isSelf;
  const canLetter = caps.canIssueLetters && !row._noHrFile;
  const monthlyGrossNgn =
    (Number(row?.baseSalaryNgn) || 0) +
    (Number(row?.housingAllowanceNgn) || 0) +
    (Number(row?.transportAllowanceNgn) || 0);
  const leaveUsed = Number(leaveRec?.daysUsedApproved) || 0;
  const leaveEntitlement = Number(leaveRec?.annualEntitlementDays) || 0;
  const leaveBalance = Math.max(0, leaveEntitlement - leaveUsed);
  const probationActive = Boolean(
    row?.probationEndIso && String(row.probationEndIso) >= new Date().toISOString().slice(0, 10)
  );
  const NAV = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'identity', label: 'Identity', icon: UserCircle2 },
    { id: 'contacts', label: 'Contacts & kin', icon: UserCircle2 },
    { id: 'comp', label: 'Compensation', icon: Wallet },
    { id: 'statutory', label: 'Bank & statutory', icon: Landmark },
    { id: 'dev', label: 'Development', icon: GraduationCap },
    { id: 'loan', label: 'Loan file', icon: Wallet },
    { id: 'attendance', label: 'Attendance', icon: CalendarRange },
    { id: 'requests', label: 'HR requests', icon: FileText },
    { id: 'leave', label: 'Leave file', icon: CalendarRange },
    { id: 'discipline', label: 'Disciplinary', icon: ShieldAlert },
  ];
  const scrollToId = (id) => {
    document.getElementById(`hrsp-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-black uppercase text-[#134e4a] disabled:opacity-50"
            >
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
              Refresh
            </button>
            {canEdit ? (
              <button
                type="button"
                onClick={openEdit}
                className="inline-flex items-center gap-2 rounded-xl bg-[#134e4a] px-3 py-2 text-[11px] font-black uppercase text-white"
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
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
          <aside className="w-full lg:w-56 shrink-0 lg:sticky lg:top-24 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-3 mb-2">
              On this page
            </p>
            {NAV.map((item) => {
              const NavIcon = item.icon;
              return (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToId(item.id)}
                className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-[#134e4a] hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-100 transition-all"
              >
                <NavIcon size={14} />
                {item.label}
              </button>
              );
            })}
          </aside>

          <div className="flex-1 min-w-0">
            <section id="hrsp-overview" className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm mb-6 scroll-mt-28">
              <h3 className="text-[11px] font-black uppercase text-[#134e4a] mb-3">Overview</h3>
              <p className="mb-4 text-xs text-slate-600 rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2 leading-relaxed">
                This screen loads live data from the server. <strong>Edit file</strong> updates the HR record through the
                API; anything you do not have permission to change stays read-only.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-3">
                  <p className="text-[9px] font-bold uppercase text-slate-400">Role & department</p>
                  <p className="mt-1 text-xs font-black text-slate-800">{row.roleKey || '—'}</p>
                  <p className="text-[10px] text-slate-500">{row.department || '—'}</p>
                  {row.probationEndIso ? (
                    <p className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${probationActive ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>
                      {probationActive ? `Probation until ${row.probationEndIso}` : 'Probation completed'}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-3">
                  <p className="text-[9px] font-bold uppercase text-slate-400">Branch / employee no.</p>
                  <p className="mt-1 text-xs font-black text-slate-800">{row.branchId || '—'}</p>
                  <p className="text-[10px] text-slate-500">{row.employeeNo || '—'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-3">
                  <p className="text-[9px] font-bold uppercase text-slate-400">Monthly gross</p>
                  <p className="mt-1 text-xs font-black text-[#134e4a] tabular-nums">₦{formatNgn(monthlyGrossNgn)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-3">
                  <p className="text-[9px] font-bold uppercase text-slate-400">Leave balance</p>
                  <p className="mt-1 text-xs font-black text-slate-800 tabular-nums">
                    {leaveRec ? `${leaveBalance} day(s)` : '—'}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {leaveRec ? `${leaveUsed}/${leaveEntitlement} used` : 'No leave file'}
                  </p>
                </div>
              </div>
            </section>

        {row._noHrFile ? (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            No HR employee file yet for this account. An administrator can create one from the staff directory or edit
            your profile once linked.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6">
          <section id="hrsp-identity" className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm scroll-mt-28">
            <h3 className="text-[11px] font-black uppercase text-[#134e4a]">Identity</h3>
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
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Probation end</dt>
                <dd className="font-medium text-slate-900">{row.probationEndIso || '—'}</dd>
              </div>
            </dl>
          </section>

          <section id="hrsp-contacts" className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm scroll-mt-28">
            <h3 className="text-[11px] font-black uppercase text-[#134e4a]">Contacts &amp; next of kin</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Phone</dt>
                <dd className="font-medium text-slate-900">{personal.phoneNumber || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Home address</dt>
                <dd className="font-medium text-slate-900 text-right">{personal.homeAddress || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Date of birth</dt>
                <dd className="font-medium text-slate-900">{personal.dobIso || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Gender / marital</dt>
                <dd className="font-medium text-slate-900">
                  {[personal.gender, personal.maritalStatus].filter(Boolean).join(' · ') || '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">National ID</dt>
                <dd className="font-medium text-slate-900">{personal.nationalId || '—'}</dd>
              </div>
              <div className="border-t border-slate-100 pt-2">
                <dt className="text-slate-500 text-xs">Next of kin</dt>
                <dd className="mt-1 text-slate-900">
                  {row.nextOfKin?.name || '—'}
                  {row.nextOfKin?.relationship ? ` · ${row.nextOfKin.relationship}` : ''}
                  {row.nextOfKin?.phone ? ` · ${row.nextOfKin.phone}` : ''}
                  {row.nextOfKin?.address ? ` · ${row.nextOfKin.address}` : ''}
                </dd>
              </div>
            </dl>
          </section>

          {!row._noHrFile ? (
            <section id="hrsp-comp" className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm scroll-mt-28">
              <h3 className="text-[11px] font-black uppercase text-[#134e4a]">Compensation (monthly)</h3>
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
                <div className="border-t border-slate-100 pt-2 space-y-2">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">PAYE % (individual)</dt>
                    <dd className="font-medium tabular-nums text-slate-900">
                      {row.payeTaxPercent != null && Number.isFinite(Number(row.payeTaxPercent))
                        ? `${Number(row.payeTaxPercent)}% (overrides run default)`
                        : 'Use payroll run default'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Pension % (override)</dt>
                    <dd className="font-medium tabular-nums text-slate-900">
                      {row.pensionPercentOverride != null &&
                      Number.isFinite(Number(row.pensionPercentOverride))
                        ? `${Number(row.pensionPercentOverride)}%`
                        : 'Use payroll run default'}
                    </dd>
                  </div>
                </div>
                {row.bonusAccrualNote ? (
                  <div className="border-t border-slate-100 pt-2">
                    <dt className="text-slate-500 text-xs">Bonus / variable accrual note</dt>
                    <dd className="mt-1 text-slate-800">{row.bonusAccrualNote}</dd>
                  </div>
                ) : null}
                {compPkg.benefitAllocationNote ? (
                  <div className="border-t border-slate-100 pt-2">
                    <dt className="text-slate-500 text-xs">Benefit allocation</dt>
                    <dd className="mt-1 text-slate-800 whitespace-pre-wrap">{compPkg.benefitAllocationNote}</dd>
                  </div>
                ) : null}
                {compPkg.otherAllowancesNote ? (
                  <div className="border-t border-slate-100 pt-2">
                    <dt className="text-slate-500 text-xs">Other allowances</dt>
                    <dd className="mt-1 text-slate-800 whitespace-pre-wrap">{compPkg.otherAllowancesNote}</dd>
                  </div>
                ) : null}
                {compPkg.endOfYearBonusNote ? (
                  <div className="border-t border-slate-100 pt-2">
                    <dt className="text-slate-500 text-xs">End-of-year bonus</dt>
                    <dd className="mt-1 text-slate-800 whitespace-pre-wrap">{compPkg.endOfYearBonusNote}</dd>
                  </div>
                ) : null}
                {Number(compPkg.monthlyDisciplinaryDeductionNgn) > 0 ? (
                  <div className="border-t border-slate-100 pt-2">
                    <dt className="text-slate-500 text-xs">Monthly disciplinary deduction (payroll)</dt>
                    <dd className="mt-1 font-semibold tabular-nums text-rose-900">
                      ₦{formatNgn(compPkg.monthlyDisciplinaryDeductionNgn)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          {!row._noHrFile ? (
            <section id="hrsp-statutory" className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm scroll-mt-28">
              <h3 className="text-[11px] font-black uppercase text-[#134e4a]">Bank &amp; statutory</h3>
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
            <section id="hrsp-dev" className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm scroll-mt-28">
              <h3 className="text-[11px] font-black uppercase text-[#134e4a]">Development</h3>
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

        <section id="hrsp-loan" className="mt-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm scroll-mt-28">
          <h3 className="text-[11px] font-black uppercase text-[#134e4a]">Loan file</h3>
          {currentLoan ? (
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Request ID</dt>
                <dd className="font-medium">{currentLoan.requestId}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Status</dt>
                <dd className="font-medium">
                  {currentLoan.deductionsActive ? 'Active deduction' : 'Not deducting'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Amount</dt>
                <dd className="font-medium tabular-nums">₦{formatNgn(currentLoan.amountNgn)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Monthly deduction</dt>
                <dd className="font-medium tabular-nums">₦{formatNgn(currentLoan.deductionPerMonthNgn)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Principal outstanding</dt>
                <dd className="font-medium tabular-nums">
                  {currentLoan.principalOutstandingNgn != null
                    ? `₦${formatNgn(currentLoan.principalOutstandingNgn)}`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Months remaining</dt>
                <dd className="font-medium tabular-nums">{currentLoan.repaymentMonthsRemaining ?? '—'}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-600">No approved loan on file.</p>
          )}
        </section>

        <section id="hrsp-attendance" className="mt-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm scroll-mt-28">
          <h3 className="text-[11px] font-black uppercase text-[#134e4a]">Attendance &amp; payroll effect</h3>
          {latestAttendance ? (
            <p className="mt-3 text-sm text-slate-700">
              Latest uploaded attendance period: <strong>{latestAttendance.periodYyyymm || '—'}</strong>
              {latestAttendance.createdAtIso ? ` · uploaded ${String(latestAttendance.createdAtIso).slice(0, 10)}` : ''}
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-600">No attendance upload currently visible in your scope.</p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Attendance deductions apply when payroll runs are recomputed and posted.
          </p>
        </section>

        <section id="hrsp-requests" className="mt-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm scroll-mt-28">
          <h3 className="text-[11px] font-black uppercase text-[#134e4a]">HR requests timeline</h3>
          {recentRequests.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No recent HR requests for this staff file.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {recentRequests.map((r) => (
                <li key={r.id} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <p className="font-semibold text-slate-800">{r.title || r.kind}</p>
                  <p className="text-xs text-slate-500">
                    {r.kind} · {String(r.status || '').replace(/_/g, ' ')} ·{' '}
                    {r.createdAtIso ? String(r.createdAtIso).slice(0, 10) : '—'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {leaveRec ? (
          <section id="hrsp-leave" className="mt-6 rounded-2xl border border-teal-100 bg-teal-50/40 p-5 scroll-mt-28">
            <h3 className="text-[11px] font-black uppercase text-[#134e4a]">Leave record (file)</h3>
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
          <section id="hrsp-discipline" className="mt-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm scroll-mt-28">
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
          <Link className="text-[#134e4a] hover:underline" to="/hr/staff">
            ← Staff directory
          </Link>
          <Link className="text-slate-600 hover:underline" to="/hr/talent">
            HR requests →
          </Link>
          <Link className="text-slate-600 hover:underline" to="/hr/payroll">
            Payroll →
          </Link>
        </div>
          </div>
        </div>
      </MainPanel>

      <ModalFrame isOpen={editOpen} onClose={() => setEditOpen(false)}>
        <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[28px] border border-slate-200/90 bg-white shadow-xl">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-[#134e4a] px-5 py-4 text-white">
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
                PAYE tax % (leave blank to use each payroll run default)
                <input
                  type="number"
                  step="0.1"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.payeTaxPercent}
                  onChange={(e) => setEditForm((f) => ({ ...f, payeTaxPercent: e.target.value }))}
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Pension % override (blank = run default)
                <input
                  type="number"
                  step="0.1"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.pensionPercentOverride}
                  onChange={(e) => setEditForm((f) => ({ ...f, pensionPercentOverride: e.target.value }))}
                />
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Bonus / variable accrual note
              <textarea
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editForm.bonusAccrualNote}
                onChange={(e) => setEditForm((f) => ({ ...f, bonusAccrualNote: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Benefit allocation (HMO, allowances, etc.)
              <textarea
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editForm.benefitAllocationNote}
                onChange={(e) => setEditForm((f) => ({ ...f, benefitAllocationNote: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Other allowances (narrative)
              <textarea
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editForm.otherAllowancesNote}
                onChange={(e) => setEditForm((f) => ({ ...f, otherAllowancesNote: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              End-of-year bonus (planning note)
              <textarea
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editForm.endOfYearBonusNote}
                onChange={(e) => setEditForm((f) => ({ ...f, endOfYearBonusNote: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Monthly disciplinary deduction (₦, added to payroll other deductions with loans)
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editForm.monthlyDisciplinaryDeductionNgn}
                onChange={(e) => setEditForm((f) => ({ ...f, monthlyDisciplinaryDeductionNgn: e.target.value }))}
              />
            </label>
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
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-3">
              <p className="text-[10px] font-black uppercase text-slate-500">Personal & emergency</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">
                  Phone
                  <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={editForm.phoneNumber} onChange={(e) => setEditForm((f) => ({ ...f, phoneNumber: e.target.value }))} />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Date of birth
                  <input type="date" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={editForm.dobIso} onChange={(e) => setEditForm((f) => ({ ...f, dobIso: e.target.value }))} />
                </label>
              </div>
              <label className="text-xs font-bold text-slate-700">
                Home address
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={editForm.homeAddress} onChange={(e) => setEditForm((f) => ({ ...f, homeAddress: e.target.value }))} />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-bold text-slate-700">
                  Gender
                  <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={editForm.gender} onChange={(e) => setEditForm((f) => ({ ...f, gender: e.target.value }))} />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Marital status
                  <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={editForm.maritalStatus} onChange={(e) => setEditForm((f) => ({ ...f, maritalStatus: e.target.value }))} />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  National ID
                  <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={editForm.nationalId} onChange={(e) => setEditForm((f) => ({ ...f, nationalId: e.target.value }))} />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">
                  Next of kin name
                  <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={editForm.nextOfKinName} onChange={(e) => setEditForm((f) => ({ ...f, nextOfKinName: e.target.value }))} />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Next of kin phone
                  <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={editForm.nextOfKinPhone} onChange={(e) => setEditForm((f) => ({ ...f, nextOfKinPhone: e.target.value }))} />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">
                  Relationship
                  <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={editForm.nextOfKinRelationship} onChange={(e) => setEditForm((f) => ({ ...f, nextOfKinRelationship: e.target.value }))} />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Next of kin address
                  <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={editForm.nextOfKinAddress} onChange={(e) => setEditForm((f) => ({ ...f, nextOfKinAddress: e.target.value }))} />
                </label>
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-[#134e4a] px-4 py-2.5 text-[11px] font-black uppercase text-white disabled:opacity-50"
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
