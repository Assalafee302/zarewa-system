import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { CalendarClock, Plus, RefreshCw, Upload, X } from 'lucide-react';
import { MainPanel, ModalFrame, PageHeader } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import HrCapsLoading from './hrCapsLoading';
import { HrOpsToolbar, HrSectionCard } from './hrUx';

export default function HrTime() {
  const { caps } = useHrWorkspace();
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const [uploads, setUploads] = useState([]);
  const [staff, setStaff] = useState([]);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    branchId: '',
    periodYyyymm: '',
    notes: '',
    rows: [{ userId: '', userIdManual: '', absentDays: '0' }],
  });

  const [rollDay, setRollDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [rollBranchId, setRollBranchId] = useState('');
  const [rollStatusByUser, setRollStatusByUser] = useState({});
  const [rollLoading, setRollLoading] = useState(false);
  const [rollSaving, setRollSaving] = useState(false);

  const branches = useMemo(
    () => ws?.snapshot?.workspaceBranches ?? ws?.session?.branches ?? [],
    [ws?.snapshot?.workspaceBranches, ws?.session?.branches]
  );
  const defaultRollBranchId = branches[0]?.id || '';
  const rollBranchKey = rollBranchId || defaultRollBranchId;

  const canView = caps?.canUploadAttendance || caps?.canPayroll || caps?.canViewDirectory;
  const canUpload = caps?.canUploadAttendance || caps?.canPayroll;
  const canPickStaff = caps?.canViewDirectory;

  const load = useCallback(async () => {
    setBusy(true);
    const { ok, data } = await apiFetch('/api/hr/attendance');
    setBusy(false);
    if (ok && data?.ok) setUploads(data.uploads || []);
    else setUploads([]);
  }, []);

  const loadStaff = useCallback(async () => {
    if (!canPickStaff) return;
    const { ok, data } = await apiFetch('/api/hr/staff');
    if (ok && data?.ok) setStaff(data.staff || []);
    else setStaff([]);
  }, [canPickStaff]);

  useEffect(() => {
    if (caps === null || !canView) return;
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [caps, canView, load]);

  useEffect(() => {
    if (caps === null || !modalOpen || !canPickStaff) return;
    const id = window.setTimeout(() => {
      void loadStaff();
    }, 0);
    return () => window.clearTimeout(id);
  }, [caps, modalOpen, canPickStaff, loadStaff]);

  const loadRoll = useCallback(async () => {
    if (!rollBranchKey || !/^\d{4}-\d{2}-\d{2}$/.test(rollDay)) return;
    setRollLoading(true);
    const { ok, data } = await apiFetch(
      `/api/hr/daily-roll?branchId=${encodeURIComponent(rollBranchKey)}&dayIso=${encodeURIComponent(rollDay)}`
    );
    setRollLoading(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not load daily roll.', { variant: 'error' });
      setRollStatusByUser({});
      return;
    }
    const m = {};
    if (data.roll?.rows?.length) {
      for (const r of data.roll.rows) {
        const uid = String(r.userId || '').trim();
        if (!uid) continue;
        m[uid] = String(r.status || '').toLowerCase() === 'late' ? 'late' : 'present';
      }
    }
    setRollStatusByUser(m);
  }, [rollBranchKey, rollDay, showToast]);

  useEffect(() => {
    if (caps === null || !canPickStaff || !rollBranchKey) return;
    const id = window.setTimeout(() => {
      void loadRoll();
    }, 0);
    return () => window.clearTimeout(id);
  }, [caps, canPickStaff, rollBranchKey, rollDay, loadRoll]);

  useEffect(() => {
    if (caps === null || !canPickStaff) return;
    const id = window.setTimeout(() => {
      void loadStaff();
    }, 0);
    return () => window.clearTimeout(id);
  }, [caps, canPickStaff, loadStaff]);

  const openModal = () => {
    const d = new Date();
    const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const bid = branches[0]?.id || '';
    setForm({
      branchId: bid,
      periodYyyymm: yyyymm,
      notes: '',
      rows: [{ userId: '', userIdManual: '', absentDays: '0' }],
    });
    setModalOpen(true);
  };

  const submitUpload = async (e) => {
    e.preventDefault();
    const periodYyyymm = String(form.periodYyyymm || '').replace(/\D/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(periodYyyymm)) {
      showToast('Period must be YYYYMM.', { variant: 'error' });
      return;
    }
    if (!form.branchId.trim()) {
      showToast('Choose a branch.', { variant: 'error' });
      return;
    }
    const rows = form.rows
      .map((r) => ({
        userId: String(canPickStaff ? r.userId : r.userIdManual || r.userId || '').trim(),
        absentDays: Math.max(0, Math.round(Number(r.absentDays) || 0)),
      }))
      .filter((r) => r.userId);
    if (rows.length === 0) {
      showToast('Add at least one row with a staff member.', { variant: 'error' });
      return;
    }
    setBusy(true);
    const { ok, data } = await apiFetch('/api/hr/attendance/upload', {
      method: 'POST',
      body: JSON.stringify({
        branchId: form.branchId.trim(),
        periodYyyymm,
        notes: form.notes.trim() || null,
        rows,
      }),
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Upload failed.', { variant: 'error' });
      return;
    }
    showToast('Attendance uploaded for payroll.');
    setModalOpen(false);
    load();
  };

  if (caps === null) return <HrCapsLoading />;
  if (!canView) return <Navigate to="/hr" replace />;

  return (
    <>
      <PageHeader
        eyebrow="Human resources"
        title="Time & attendance"
        subtitle="Daily present/late per branch (same daily rate as absent: base ÷ 22 per late day in the payroll month). Monthly absent uploads still apply for full-day absence."
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
            {canUpload ? (
              <button type="button" onClick={openModal} className="z-btn-primary gap-2 py-2 px-4 text-xs">
                <Upload size={14} />
                Upload period
              </button>
            ) : null}
          </div>
        }
      />
      <MainPanel>
        <HrOpsToolbar
          left={<p className="text-xs font-semibold text-slate-600">Latest upload per branch/period is used in payroll recompute.</p>}
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
        <div className="mb-6 flex flex-wrap gap-3 text-sm">
          <Link
            to="/hr/payroll"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-black uppercase text-[#134e4a] no-underline"
          >
            Payroll runs →
          </Link>
          <Link
            to="/hr/salary-welfare"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-black uppercase text-slate-600 no-underline"
          >
            Salary &amp; benefits →
          </Link>
        </div>

        <HrSectionCard
          title="Daily roll (branch managers)"
          subtitle="Mark each staff member present or late for the selected calendar day. Saved once per branch per day; payroll picks up late counts when you recompute the month."
        >
          {!canPickStaff ? (
            <p className="text-sm text-slate-600">You need staff directory visibility to use the daily roll.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs font-bold text-slate-700">
                  Branch
                  <select
                    className="mt-1 block w-48 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={rollBranchKey}
                    onChange={(e) => setRollBranchId(e.target.value)}
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name || b.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Date
                  <input
                    type="date"
                    className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={rollDay}
                    onChange={(e) => setRollDay(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={rollLoading}
                  onClick={() => loadRoll()}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-black uppercase text-[#134e4a] disabled:opacity-50"
                >
                  {rollLoading ? 'Loading…' : 'Reload'}
                </button>
              </div>
              {(() => {
                const branchStaff = staff.filter((s) => String(s.branchId || '') === rollBranchKey);
                if (branchStaff.length === 0) {
                  return <p className="text-sm text-slate-600">No staff mapped to this branch.</p>;
                }
                return (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Staff</th>
                          <th className="px-4 py-3">Today</th>
                        </tr>
                      </thead>
                      <tbody>
                        {branchStaff.map((s) => {
                          const st = rollStatusByUser[s.userId] ?? 'present';
                          return (
                            <tr key={s.userId} className="border-t border-slate-100">
                              <td className="px-4 py-3">
                                <p className="font-semibold text-slate-900">{s.displayName || s.username}</p>
                                <p className="text-xs text-slate-500">{s.employeeNo || s.userId}</p>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRollStatusByUser((m) => ({ ...m, [s.userId]: 'present' }))
                                    }
                                    className={`rounded-lg px-3 py-1.5 text-[11px] font-black uppercase ${
                                      st === 'present'
                                        ? 'bg-emerald-600 text-white'
                                        : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    Present
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRollStatusByUser((m) => ({ ...m, [s.userId]: 'late' }))
                                    }
                                    className={`rounded-lg px-3 py-1.5 text-[11px] font-black uppercase ${
                                      st === 'late'
                                        ? 'bg-amber-600 text-white'
                                        : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    Late
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
              {canUpload ? (
                <button
                  type="button"
                  disabled={rollSaving || rollLoading || !rollBranchKey}
                  onClick={async () => {
                    const branchStaff = staff.filter((s) => String(s.branchId || '') === rollBranchKey);
                    const rows = branchStaff.map((s) => ({
                      userId: s.userId,
                      status: rollStatusByUser[s.userId] ?? 'present',
                    }));
                    setRollSaving(true);
                    const { ok, data } = await apiFetch('/api/hr/daily-roll', {
                      method: 'POST',
                      body: JSON.stringify({ branchId: rollBranchKey, dayIso: rollDay, rows }),
                    });
                    setRollSaving(false);
                    if (!ok || !data?.ok) {
                      showToast(data?.error || 'Could not save roll.', { variant: 'error' });
                      return;
                    }
                    showToast('Daily roll saved.');
                    void loadRoll();
                  }}
                  className="rounded-xl bg-[#134e4a] px-4 py-2.5 text-[11px] font-black uppercase text-white disabled:opacity-50"
                >
                  {rollSaving ? 'Saving…' : 'Save roll for this day'}
                </button>
              ) : (
                <p className="text-xs text-slate-500">You can view the roll but cannot save without attendance/payroll permission.</p>
              )}
            </div>
          )}
        </HrSectionCard>

        <HrSectionCard title="Attendance uploads" subtitle="Validate period and branch before payroll recompute">
        {uploads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
            <CalendarClock className="mx-auto text-slate-300" size={40} />
            <p className="mt-3 text-sm font-medium text-slate-700">No attendance uploads in your scope yet.</p>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Upload one row per employee with absent days for the payroll month. The latest upload per branch and
              period wins when payroll is recomputed.
            </p>
            {canUpload ? (
              <button
                type="button"
                onClick={openModal}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#134e4a] px-4 py-2 text-[11px] font-black uppercase text-white"
              >
                <Plus size={14} />
                New upload
              </button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Rows</th>
                  <th className="px-4 py-3">Uploaded</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold">{u.periodYyyymm}</td>
                    <td className="px-4 py-3">{u.branchId}</td>
                    <td className="px-4 py-3 tabular-nums">{Array.isArray(u.rows) ? u.rows.length : 0}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {u.createdAtIso ? String(u.createdAtIso).slice(0, 19).replace('T', ' ') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate" title={u.notes || ''}>
                      {u.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </HrSectionCard>
      </MainPanel>

      <ModalFrame isOpen={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="w-full max-w-lg rounded-[28px] border border-slate-200/90 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-[#134e4a] px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase text-teal-100">Attendance</p>
              <h2 className="text-base font-black">Upload monthly absent days</h2>
            </div>
            <button
              type="button"
              className="rounded-xl p-2 hover:bg-white/10"
              aria-label="Close"
              onClick={() => setModalOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <form onSubmit={submitUpload} className="max-h-[min(75vh,560px)] overflow-y-auto p-5 space-y-4">
            <label className="block text-xs font-bold text-slate-700">
              Branch
              <select
                required
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={form.branchId}
                onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
              >
                <option value="">Select branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name || b.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Period (YYYYMM)
              <input
                required
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={form.periodYyyymm}
                onChange={(e) => setForm((f) => ({ ...f, periodYyyymm: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Notes (optional)
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-[#134e4a]">Employees</span>
                <button
                  type="button"
                  className="text-[11px] font-black uppercase text-[#134e4a]"
                  onClick={() =>
                  setForm((f) => ({
                    ...f,
                    rows: [...f.rows, { userId: '', userIdManual: '', absentDays: '0' }],
                  }))
                }
                >
                  + Row
                </button>
              </div>
              {!canPickStaff ? (
                <p className="text-xs text-slate-600">
                  No staff directory on your role — enter each employee&apos;s <strong>user id</strong> (e.g. USR-…) from
                  Settings → users.
                </p>
              ) : null}
              {form.rows.map((row, idx) => (
                <div key={idx} className="flex flex-wrap gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  {canPickStaff ? (
                    <label className="min-w-[200px] flex-1 text-[11px] font-bold text-slate-700">
                      Staff
                      <select
                        required
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                        value={row.userId}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm((f) => ({
                            ...f,
                            rows: f.rows.map((r, i) => (i === idx ? { ...r, userId: v } : r)),
                          }));
                        }}
                      >
                        <option value="">Select…</option>
                        {staff.map((s) => (
                          <option key={s.userId} value={s.userId}>
                            {s.displayName || s.username}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="min-w-[220px] flex-1 text-[11px] font-bold text-slate-700">
                      User id
                      <input
                        required
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-mono text-xs"
                        placeholder="USR-…"
                        value={row.userIdManual}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm((f) => ({
                            ...f,
                            rows: f.rows.map((r, i) => (i === idx ? { ...r, userIdManual: v } : r)),
                          }));
                        }}
                      />
                    </label>
                  )}
                  <label className="w-28 text-[11px] font-bold text-slate-700">
                    Absent days
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={row.absentDays}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((f) => ({
                          ...f,
                          rows: f.rows.map((r, i) => (i === idx ? { ...r, absentDays: v } : r)),
                        }));
                      }}
                    />
                  </label>
                  {form.rows.length > 1 ? (
                    <button
                      type="button"
                      className="self-end text-[11px] font-black uppercase text-rose-700"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          rows: f.rows.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-black uppercase text-slate-600"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-[#134e4a] px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-50"
              >
                Save upload
              </button>
            </div>
          </form>
        </div>
      </ModalFrame>
    </>
  );
}
