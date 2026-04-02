import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Search, UserPlus, X } from 'lucide-react';
import { MainPanel, ModalFrame, PageHeader } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import { formatNgn } from '../../hr/hrFormat';
import HrCapsLoading from './hrCapsLoading';
import { HrOpsToolbar, HrSectionCard } from './hrUx';

const ROLE_OPTIONS = [
  { value: 'viewer', label: 'Read only' },
  { value: 'sales_staff', label: 'Sales officer' },
  { value: 'sales_manager', label: 'Sales manager' },
  { value: 'procurement_officer', label: 'Procurement officer' },
  { value: 'operations_officer', label: 'Operations officer' },
  { value: 'finance_manager', label: 'Finance manager' },
  { value: 'admin', label: 'Administrator' },
];

function packageGross(s) {
  return (
    (Number(s?.baseSalaryNgn) || 0) +
    (Number(s?.housingAllowanceNgn) || 0) +
    (Number(s?.transportAllowanceNgn) || 0)
  );
}

const emptyRegister = {
  username: '',
  displayName: '',
  password: '',
  roleKey: 'sales_staff',
  branchId: '',
  employeeNo: '',
  jobTitle: '',
  department: '',
  employmentType: 'permanent',
  dateJoinedIso: '',
  baseSalaryNgn: '',
  housingAllowanceNgn: '',
  transportAllowanceNgn: '',
};

export default function HrStaffList() {
  const { caps } = useHrWorkspace();
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [regOpen, setRegOpen] = useState(false);
  const [regForm, setRegForm] = useState(emptyRegister);
  const [regBusy, setRegBusy] = useState(false);

  const branches = useMemo(
    () => ws?.snapshot?.workspaceBranches ?? ws?.session?.branches ?? [],
    [ws?.snapshot?.workspaceBranches, ws?.session?.branches]
  );

  const load = useCallback(async () => {
    setBusy(true);
    const { ok, data } = await apiFetch('/api/hr/staff');
    setBusy(false);
    if (ok && data?.ok) setRows(data.staff || []);
    else setRows([]);
  }, []);

  useEffect(() => {
    if (caps === null || !caps.canViewDirectory) return;
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [caps, load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (s) =>
        String(s.displayName || '')
          .toLowerCase()
          .includes(t) ||
        String(s.username || '')
          .toLowerCase()
          .includes(t) ||
        String(s.employeeNo || '')
          .toLowerCase()
          .includes(t) ||
        String(s.jobTitle || '')
          .toLowerCase()
          .includes(t) ||
        String(s.department || '')
          .toLowerCase()
          .includes(t)
    );
  }, [rows, q]);

  const openRegister = () => {
    const bid = branches[0]?.id || '';
    setRegForm({ ...emptyRegister, branchId: bid });
    setRegOpen(true);
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    setRegBusy(true);
    const body = {
      username: regForm.username.trim().toLowerCase(),
      displayName: regForm.displayName.trim(),
      password: regForm.password,
      roleKey: regForm.roleKey,
      branchId: regForm.branchId.trim() || undefined,
      employeeNo: regForm.employeeNo.trim() || undefined,
      jobTitle: regForm.jobTitle.trim() || undefined,
      department: regForm.department.trim() || undefined,
      employmentType: regForm.employmentType || 'permanent',
      dateJoinedIso: regForm.dateJoinedIso.trim() || undefined,
      baseSalaryNgn: Math.round(Number(regForm.baseSalaryNgn) || 0),
      housingAllowanceNgn: Math.round(Number(regForm.housingAllowanceNgn) || 0),
      transportAllowanceNgn: Math.round(Number(regForm.transportAllowanceNgn) || 0),
    };
    const { ok, data } = await apiFetch('/api/hr/staff/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setRegBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Registration failed.', { variant: 'error' });
      return;
    }
    setRegOpen(false);
    load();
    showToast(`Staff created — user id ${data.userId}. Share the temporary password securely.`);
  };

  if (caps === null) return <HrCapsLoading />;
  if (!caps.canViewDirectory) {
    return <Navigate to="/hr" replace />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Human resources"
        title="Staff directory"
        subtitle="Employee files scoped to your workspace branch (unless HQ view-all is enabled). Open a record by clicking the name."
        actions={
          <div className="flex flex-wrap gap-2">
            {caps.canManageStaff ? (
              <button
                type="button"
                onClick={openRegister}
                className="inline-flex items-center gap-2 rounded-xl bg-[#134e4a] px-3 py-2 text-[11px] font-black uppercase text-white"
              >
                <UserPlus size={14} />
                Register staff
              </button>
            ) : null}
          </div>
        }
      />
      <MainPanel>
        <HrOpsToolbar
          left={<p className="text-xs font-semibold text-slate-600">Primary directory for operations and payroll inputs.</p>}
          right={
            <p className="text-xs font-medium text-slate-500">
              {busy ? 'Loading…' : `${filtered.length} of ${rows.length} shown`}
            </p>
          }
        />
        <HrSectionCard title="Directory table" subtitle="Compact searchable staff list">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="search"
              className="w-full rounded-xl border border-slate-200 py-2 pl-10 pr-3 text-sm"
              placeholder="Search name, ID, role, department…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <p className="text-xs font-medium text-slate-500">
            {busy ? 'Loading…' : `${filtered.length} of ${rows.length} shown`}
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-700">
              {q.trim()
                ? 'No staff match your search.'
                : busy
                  ? 'Loading directory…'
                  : 'No staff in your scope yet. Register an employee or adjust branch filters in the workspace bar.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3 hidden md:table-cell">Role / job</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Branch</th>
                  <th className="px-4 py-3 hidden lg:table-cell">HR file</th>
                  <th className="px-4 py-3 text-right">Package</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.userId} className="border-t border-slate-100 hover:bg-teal-50/30">
                    <td className="px-4 py-3">
                      <Link
                        to={`/hr/staff/${encodeURIComponent(s.userId)}`}
                        className="group block rounded-lg -m-1 p-1 text-left no-underline hover:bg-teal-100/40"
                      >
                        <p className="font-semibold text-[#134e4a] group-hover:underline">
                          {s.displayName || s.username}
                        </p>
                        <p className="text-xs text-slate-500">
                          {s.employeeNo || s.username} · {s.roleKey || '—'}
                        </p>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 hidden md:table-cell">
                      <span className="font-medium">{s.jobTitle || '—'}</span>
                      {s.department ? <span className="text-slate-500"> · {s.department}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium hidden sm:table-cell">{s.branchId || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 hidden lg:table-cell">
                      {s.nextOfKin?.name ? (
                        <span className="mr-1 rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-900">Kin</span>
                      ) : (
                        <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">Kin missing</span>
                      )}
                      {s.probationEndIso ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                          Probation {String(s.probationEndIso)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums text-slate-800">
                      ₦{formatNgn(packageGross(s))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-xs text-slate-500">
          <Link to="/hr/staff/directory-quality" className="text-[#134e4a] hover:underline">
            Directory data quality
          </Link>
          {' · '}
          <Link to="/hr/payroll" className="text-[#134e4a] hover:underline">
            Payroll
          </Link>
          {' · '}
          <Link to="/hr/time" className="text-[#134e4a] hover:underline">
            Time &amp; attendance
          </Link>
          {' · '}
          <Link to="/hr/talent" className="text-[#134e4a] hover:underline">
            Requests
          </Link>
        </p>
        </HrSectionCard>
      </MainPanel>

      <ModalFrame isOpen={regOpen} onClose={() => setRegOpen(false)}>
        <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-[28px] border border-slate-200/90 bg-white shadow-xl">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-[#134e4a] px-5 py-4 text-white">
            <h2 className="text-base font-black">Register staff</h2>
            <button type="button" className="rounded-xl p-2 hover:bg-white/10" aria-label="Close" onClick={() => setRegOpen(false)}>
              <X size={20} />
            </button>
          </div>
          <form onSubmit={submitRegister} className="space-y-3 p-5">
            <p className="text-xs text-slate-600">
              Creates an app login and HR profile. Password must meet strength rules (12+ chars, mixed case, number,
              symbol).
            </p>
            <label className="block text-xs font-bold text-slate-700">
              Username
              <input
                required
                autoComplete="off"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={regForm.username}
                onChange={(e) => setRegForm((f) => ({ ...f, username: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Display name
              <input
                required
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={regForm.displayName}
                onChange={(e) => setRegForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Temporary password
              <input
                required
                type="password"
                autoComplete="new-password"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={regForm.password}
                onChange={(e) => setRegForm((f) => ({ ...f, password: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Role
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={regForm.roleKey}
                onChange={(e) => setRegForm((f) => ({ ...f, roleKey: e.target.value }))}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Branch
              <select
                required
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={regForm.branchId}
                onChange={(e) => setRegForm((f) => ({ ...f, branchId: e.target.value }))}
              >
                {branches.length === 0 ? (
                  <option value="">No branches in workspace</option>
                ) : null}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name || b.id}
                  </option>
                ))}
              </select>
            </label>
            {branches.length === 0 ? (
              <p className="text-xs text-amber-800">
                Load workspace data or pick a branch in the bar above — registration needs a branch.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">
                Employee no.
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={regForm.employeeNo}
                  onChange={(e) => setRegForm((f) => ({ ...f, employeeNo: e.target.value }))}
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Job title
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={regForm.jobTitle}
                  onChange={(e) => setRegForm((f) => ({ ...f, jobTitle: e.target.value }))}
                />
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Department
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={regForm.department}
                onChange={(e) => setRegForm((f) => ({ ...f, department: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Date joined
              <input
                type="date"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={regForm.dateJoinedIso}
                onChange={(e) => setRegForm((f) => ({ ...f, dateJoinedIso: e.target.value }))}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-bold text-slate-700">
                Base ₦
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={regForm.baseSalaryNgn}
                  onChange={(e) => setRegForm((f) => ({ ...f, baseSalaryNgn: e.target.value }))}
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Housing ₦
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={regForm.housingAllowanceNgn}
                  onChange={(e) => setRegForm((f) => ({ ...f, housingAllowanceNgn: e.target.value }))}
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Transport ₦
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={regForm.transportAllowanceNgn}
                  onChange={(e) => setRegForm((f) => ({ ...f, transportAllowanceNgn: e.target.value }))}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={regBusy}
              className="w-full rounded-xl bg-[#134e4a] px-4 py-2.5 text-[11px] font-black uppercase text-white disabled:opacity-50"
            >
              Create account
            </button>
          </form>
        </div>
      </ModalFrame>
    </>
  );
}
