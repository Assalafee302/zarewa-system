import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useMatch, useNavigate, useLocation } from 'react-router-dom';
import {
  Save,
  Shield,
  BadgeDollarSign,
  Users,
  ShoppingCart,
  Package,
  Factory,
  Truck,
  Landmark,
  BarChart3,
  LifeBuoy,
  ChevronRight,
  User,
  Database,
  Scale,
  BookOpen,
  Lock,
  SlidersHorizontal,
} from 'lucide-react';
import { PageHeader, PageShell, MainPanel, PageTabs } from '../components/layout';
import MasterDataWorkbench from '../components/settings/MasterDataWorkbench';
import CoilRegisterImportPanel from '../components/settings/CoilRegisterImportPanel';
import TeamAccessPanel from '../components/settings/TeamAccessPanel';
import SettingsProfilePanel from '../components/settings/SettingsProfilePanel';
import {
  DEFAULT_MANAGER_TARGETS_PER_MONTH,
  mergeDashboardPrefs,
  persistDashboardPrefsToServer,
  dashboardPrefsShallowEqual,
} from '../lib/dashboardPrefs';
import { WORKSPACE_GUIDE_ENTRIES } from '../lib/departmentWorkspace';
import { apiFetch, apiUrl } from '../lib/apiBase';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';

const DEPT_GUIDE_ICONS = {
  customer: Users,
  sales: ShoppingCart,
  inventory: Package,
  production: Factory,
  purchase: Truck,
  finance: Landmark,
  reports: BarChart3,
  it: LifeBuoy,
};

const DEPARTMENT_GUIDE = WORKSPACE_GUIDE_ENTRIES.map((e) => ({
  ...e,
  icon: DEPT_GUIDE_ICONS[e.id] || Users,
}));

function useSettingsSection() {
  const { pathname } = useLocation();
  const m = pathname.match(/^\/settings\/([^/]+)\/?$/);
  return m?.[1] ?? 'profile';
}

const Settings = () => {
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const ws = useWorkspace();
  const activeSection = useSettingsSection();
  const governanceMatch = useMatch({ path: '/settings/governance', end: true });

  const [prefs, setPrefs] = useState(() => mergeDashboardPrefs());
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [periodForm, setPeriodForm] = useState({
    periodKey: new Date().toISOString().slice(0, 7),
    reason: '',
  });
  const [branchAudit, setBranchAudit] = useState(null);
  const [branchAuditBusy, setBranchAuditBusy] = useState(false);
  const [orgMtNaira, setOrgMtNaira] = useState('');
  const [orgMtMeters, setOrgMtMeters] = useState('');
  const [orgMtBusy, setOrgMtBusy] = useState(false);
  const currentUser = ws?.session?.user;
  const permissions = ws?.permissions ?? [];
  const periodLocks = ws?.snapshot?.periodLocks ?? [];
  const auditLog = ws?.snapshot?.auditLog ?? [];
  const appUsers = ws?.snapshot?.appUsers ?? [];
  const masterData = ws?.snapshot?.masterData ?? {
    quoteItems: [],
    colours: [],
    gauges: [],
    materialTypes: [],
    profiles: [],
    priceList: [],
    expenseCategories: [],
    procurementCatalog: [],
  };

  const showTeamTab = Boolean(ws?.hasPermission?.('settings.view'));
  const canEditOrgTargets = Boolean(ws?.hasPermission?.('settings.view'));

  const settingsTabs = useMemo(() => {
    const tabs = [
      { id: 'profile', label: 'Profile', icon: <User size={14} /> },
      { id: 'security', label: 'Security', icon: <Lock size={14} /> },
      { id: 'preferences', label: 'Preferences', icon: <SlidersHorizontal size={14} /> },
    ];
    if (showTeamTab) {
      tabs.push({ id: 'team', label: 'Team & access', icon: <Users size={14} /> });
    }
    tabs.push(
      { id: 'data', label: 'Data & catalog', icon: <Database size={14} /> },
      { id: 'governance', label: 'Governance', icon: <Scale size={14} /> },
      { id: 'guide', label: 'Team guide', icon: <BookOpen size={14} /> }
    );
    return tabs;
  }, [showTeamTab]);

  const allowedSections = useMemo(() => new Set(settingsTabs.map((t) => t.id)), [settingsTabs]);

  useEffect(() => {
    const next = mergeDashboardPrefs(ws?.snapshot?.dashboardPrefs);
    setPrefs((prev) => (dashboardPrefsShallowEqual(prev, next) ? prev : next));
  }, [ws?.snapshot?.dashboardPrefs, ws?.refreshEpoch]);

  useEffect(() => {
    const o = ws?.snapshot?.orgManagerTargets;
    setOrgMtNaira(o?.nairaTargetPerMonth != null ? String(o.nairaTargetPerMonth) : '');
    setOrgMtMeters(o?.meterTargetPerMonth != null ? String(o.meterTargetPerMonth) : '');
  }, [ws?.snapshot?.orgManagerTargets, ws?.refreshEpoch]);

  /** If URL is /settings/foo and foo is not a valid section (e.g. team without permission), normalize. */
  useEffect(() => {
    if (!allowedSections.has(activeSection)) {
      navigate('/settings/profile', { replace: true });
    }
  }, [activeSection, allowedSections, navigate]);

  // If user lost permission for /settings/team, bounce off team URL.
  useEffect(() => {
    if (activeSection === 'team' && !showTeamTab) {
      navigate('/settings/profile', { replace: true });
    }
  }, [activeSection, showTeamTab, navigate]);

  const persist = async () => {
    try {
      await persistDashboardPrefsToServer(prefs);
      showToast('Preferences saved. Returning to dashboard.');
      await ws.refresh();
      navigate('/', { replace: true });
    } catch (e) {
      showToast(String(e.message || e), { variant: 'error' });
    }
  };

  const persistOrgManagerTargets = async () => {
    setOrgMtBusy(true);
    try {
      const nRaw = orgMtNaira.trim() === '' ? null : Number(String(orgMtNaira).replace(/,/g, ''));
      const mRaw = orgMtMeters.trim() === '' ? null : Number(String(orgMtMeters).replace(/,/g, ''));
      const { ok, data } = await apiFetch('/api/setup/org-manager-targets', {
        method: 'PATCH',
        body: JSON.stringify({
          nairaTargetPerMonth: nRaw,
          meterTargetPerMonth: mRaw,
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not save company targets.', { variant: 'error' });
        return;
      }
      showToast('Company manager targets saved.');
      await ws?.refresh?.();
    } catch (e) {
      showToast(String(e.message || e), { variant: 'error' });
    } finally {
      setOrgMtBusy(false);
    }
  };

  const clearOrgManagerTargets = async () => {
    setOrgMtBusy(true);
    try {
      const { ok, data } = await apiFetch('/api/setup/org-manager-targets', {
        method: 'PATCH',
        body: JSON.stringify({ clear: true }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not clear company targets.', { variant: 'error' });
        return;
      }
      showToast('Company manager targets cleared.');
      setOrgMtNaira('');
      setOrgMtMeters('');
      await ws?.refresh?.();
    } catch (e) {
      showToast(String(e.message || e), { variant: 'error' });
    } finally {
      setOrgMtBusy(false);
    }
  };

  const downloadAuditNdjson = async () => {
    try {
      const r = await fetch(apiUrl('/api/audit/export.ndjson'), { credentials: 'include' });
      if (!r.ok) {
        showToast('Could not download audit export.', { variant: 'error' });
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zarewa-audit-export.ndjson';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Audit export downloaded.');
    } catch {
      showToast('Audit export failed.', { variant: 'error' });
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (!passwordForm.currentPassword || !passwordForm.newPassword) return;
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast('New password and confirmation do not match.', { variant: 'error' });
      return;
    }
    const r = await ws?.changePassword?.(passwordForm.currentPassword, passwordForm.newPassword);
    if (!r?.ok) {
      showToast(r?.error || 'Could not change password.', { variant: 'error' });
      return;
    }
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    showToast('Password updated.');
  };

  const lockPeriod = async (e) => {
    e.preventDefault();
    const periodKey = periodForm.periodKey.trim();
    if (!periodKey) return;
    const { ok, data } = await apiFetch('/api/controls/period-locks', {
      method: 'POST',
      body: JSON.stringify({
        periodKey,
        reason: periodForm.reason.trim(),
      }),
    });
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not lock period.', { variant: 'error' });
      return;
    }
    await ws?.refresh?.();
    setPeriodForm((prev) => ({ ...prev, reason: '' }));
    showToast(`Period ${periodKey} locked.`);
  };

  const unlockPeriod = async (periodKey) => {
    const { ok, data } = await apiFetch(`/api/controls/period-locks/${encodeURIComponent(periodKey)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason: 'Unlocked from Settings' }),
    });
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not unlock period.', { variant: 'error' });
      return;
    }
    await ws?.refresh?.();
    showToast(`Period ${periodKey} unlocked.`);
  };

  const showPeriodControls = Boolean(ws?.hasPermission?.('period.manage'));
  const showAuditExport = permissions.includes('*') || permissions.includes('audit.view');
  const showBranchAudit = permissions.includes('*') || permissions.includes('settings.view');
  const showCuttingThresholdControl = permissions.includes('*') || permissions.includes('settings.view');
  const showGovernanceLimitsControl = permissions.includes('*') || permissions.includes('settings.view');
  const governanceHasContent =
    showPeriodControls ||
    showAuditExport ||
    showBranchAudit ||
    showCuttingThresholdControl ||
    showGovernanceLimitsControl ||
    auditLog.length > 0;

  const workspaceBranches = ws?.snapshot?.workspaceBranches ?? [];
  const branchCuttingSig = workspaceBranches.map((b) => `${b.id}:${Number(b.cuttingListMinPaidFraction)}`).join(',');
  const [cuttingDraftPct, setCuttingDraftPct] = useState({});
  const [cuttingSaveBusy, setCuttingSaveBusy] = useState('');
  const [govLimitsForm, setGovLimitsForm] = useState({
    expenseExecutiveThresholdNgn: 200_000,
    refundExecutiveThresholdNgn: 1_000_000,
  });
  const [govLimitsBusy, setGovLimitsBusy] = useState(false);

  useEffect(() => {
    const next = {};
    for (const b of workspaceBranches) {
      const f = Number(b.cuttingListMinPaidFraction);
      const pct = Math.round((Number.isFinite(f) ? f : 0.7) * 100);
      next[b.id] = String(Math.min(100, Math.max(5, pct)));
    }
    setCuttingDraftPct(next);
  }, [branchCuttingSig]);

  const saveBranchCuttingPct = async (branchId) => {
    const bid = String(branchId || '').trim();
    const n = Number(String(cuttingDraftPct[bid] ?? '').replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 5 || n > 100) {
      showToast('Enter a whole percent between 5 and 100.', { variant: 'error' });
      return;
    }
    setCuttingSaveBusy(bid);
    try {
      const { ok, data } = await apiFetch(`/api/branches/${encodeURIComponent(bid)}/cutting-threshold`, {
        method: 'PATCH',
        body: JSON.stringify({ cuttingListMinPaidFraction: n / 100 }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not update cutting threshold.', { variant: 'error' });
        return;
      }
      await ws?.refresh?.();
      showToast('Cutting list payment gate saved for branch.');
    } finally {
      setCuttingSaveBusy('');
    }
  };

  const loadBranchAudit = useCallback(async () => {
    if (!showBranchAudit) return;
    setBranchAuditBusy(true);
    try {
      const { ok, data } = await apiFetch('/api/branches/strict-audit');
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not load branch integrity audit.', { variant: 'error' });
        return;
      }
      setBranchAudit(data);
    } finally {
      setBranchAuditBusy(false);
    }
  }, [showBranchAudit, showToast]);

  useEffect(() => {
    if (!governanceMatch || !showBranchAudit) return;
    void loadBranchAudit();
  }, [governanceMatch, showBranchAudit, loadBranchAudit]);

  useEffect(() => {
    if (!governanceMatch || !showGovernanceLimitsControl) return;
    let cancelled = false;
    (async () => {
      const { ok, data } = await apiFetch('/api/org/governance-limits');
      if (cancelled) return;
      if (ok && data?.ok && data.limits) {
        setGovLimitsForm({
          expenseExecutiveThresholdNgn: Number(data.limits.expenseExecutiveThresholdNgn) || 200_000,
          refundExecutiveThresholdNgn: Number(data.limits.refundExecutiveThresholdNgn) || 1_000_000,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [governanceMatch, showGovernanceLimitsControl, ws?.refreshEpoch]);

  const saveGovernanceLimits = async () => {
    setGovLimitsBusy(true);
    try {
      const { ok, data } = await apiFetch('/api/org/governance-limits', {
        method: 'PATCH',
        body: JSON.stringify({
          expenseExecutiveThresholdNgn: Number(govLimitsForm.expenseExecutiveThresholdNgn),
          refundExecutiveThresholdNgn: Number(govLimitsForm.refundExecutiveThresholdNgn),
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not save limits.', { variant: 'error' });
        return;
      }
      showToast('Approval thresholds saved.');
      await ws?.refresh?.();
    } finally {
      setGovLimitsBusy(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Settings"
        subtitle="Profile, security, preferences, team, catalog, governance, and guides. Deep links use the URL (e.g. /settings/security)."
        tabs={
          <PageTabs
            tabs={settingsTabs}
            value={activeSection}
            onChange={(id) => navigate(`/settings/${id}`)}
          />
        }
      />

      <MainPanel className="max-w-5xl">
        <div className="relative z-[1]">
          <Routes>
            <Route index element={<Navigate to="profile" replace />} />
            <Route path="profile" element={<SettingsProfilePanel />} />
            <Route
              path="security"
              element={
                <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm max-w-xl">
                  <h3 className="z-section-title flex items-center gap-2">
                    <Lock size={14} /> Password
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Changing your password affects this login only. Other sessions may need to sign in again.
                  </p>
                  <form className="space-y-4" onSubmit={changePassword}>
                    <div>
                      <label className="z-field-label">Current password</label>
                      <input
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={(e) =>
                          setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))
                        }
                        className="z-input"
                      />
                    </div>
                    <div>
                      <label className="z-field-label">New password</label>
                      <input
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(e) =>
                          setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
                        }
                        className="z-input"
                      />
                    </div>
                    <div>
                      <label className="z-field-label">Confirm new password</label>
                      <input
                        type="password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) =>
                          setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                        }
                        className="z-input"
                      />
                    </div>
                    <button type="submit" className="z-btn-secondary w-full justify-center">
                      <Save size={16} /> Update password
                    </button>
                  </form>
                </div>
              }
            />
            <Route
              path="preferences"
              element={
                <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm space-y-8">
                  <div>
                    <h3 className="z-section-title mb-1">Dashboard layout</h3>
                    <p className="text-xs text-slate-500 mb-4">
                      Choose what appears on the home dashboard. Save to apply and return to the dashboard.
                    </p>
                    <div className="space-y-3">
                      {[
                        { key: 'showCharts', label: 'Show charts (sales, stock mix, income vs expense)' },
                        { key: 'showAlertBanner', label: 'Show alerts & reminders strip' },
                        { key: 'showReportsStrip', label: 'Show reports & exports strip' },
                      ].map((row) => (
                        <label
                          key={row.key}
                          className="flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-100 bg-slate-50/50 cursor-pointer hover:border-teal-100 transition-colors"
                        >
                          <span className="text-sm font-medium text-gray-700">{row.label}</span>
                          <input
                            type="checkbox"
                            checked={Boolean(prefs[row.key])}
                            onChange={(e) =>
                              setPrefs((p) => ({
                                ...p,
                                [row.key]: e.target.checked,
                              }))
                            }
                            className="accent-[#134e4a] w-4 h-4 shrink-0"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  {canEditOrgTargets ? (
                    <div className="border-t border-slate-100 pt-6">
                      <h3 className="z-section-title mb-1">Company manager targets</h3>
                      <p className="text-xs text-slate-500 mb-4 max-w-xl leading-relaxed">
                        Applies to all users on the Manager dashboard unless they turn on a personal override below.
                        Save here does not leave Preferences — use Save company only.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="block space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            Produced sales target (₦ / month)
                          </span>
                          <input
                            type="number"
                            min={1}
                            step={1000}
                            value={orgMtNaira}
                            onChange={(e) => setOrgMtNaira(e.target.value)}
                            className="z-input w-full tabular-nums"
                          />
                        </label>
                        <label className="block space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            Production metres target (m / month)
                          </span>
                          <input
                            type="number"
                            min={1}
                            step={1000}
                            value={orgMtMeters}
                            onChange={(e) => setOrgMtMeters(e.target.value)}
                            className="z-input w-full tabular-nums"
                          />
                        </label>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={orgMtBusy}
                          onClick={() => void persistOrgManagerTargets()}
                          className="z-btn-primary gap-2 disabled:opacity-50"
                        >
                          <Save size={16} /> Save company targets
                        </button>
                        <button
                          type="button"
                          disabled={orgMtBusy}
                          onClick={() => void clearOrgManagerTargets()}
                          className="z-btn-secondary disabled:opacity-50"
                        >
                          Clear company targets
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="border-t border-slate-100 pt-6">
                    <h3 className="z-section-title mb-1">Your manager targets</h3>
                    <p className="text-xs text-slate-500 mb-4 max-w-xl leading-relaxed">
                      Personal monthly baselines for Manager progress bars. Used when &quot;Use my own targets&quot; is
                      on, or when no company targets are set.
                    </p>
                    <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-100 bg-slate-50/50 cursor-pointer hover:border-teal-100 transition-colors mb-4">
                      <span className="text-sm font-medium text-gray-700">
                        Use my own targets (ignore company defaults)
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(prefs.managerTargetsPersonalOverride)}
                        onChange={(e) =>
                          setPrefs((p) => ({
                            ...p,
                            managerTargetsPersonalOverride: e.target.checked,
                          }))
                        }
                        className="accent-[#134e4a] w-4 h-4 shrink-0"
                      />
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="block space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          Produced sales target (₦ / month)
                        </span>
                        <input
                          type="number"
                          min={1}
                          step={1000}
                          value={prefs.managerTargets?.nairaTargetPerMonth ?? ''}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setPrefs((p) => ({
                              ...p,
                              managerTargets: {
                                ...p.managerTargets,
                                nairaTargetPerMonth:
                                  Number.isFinite(v) && v > 0
                                    ? v
                                    : p.managerTargets?.nairaTargetPerMonth ??
                                      DEFAULT_MANAGER_TARGETS_PER_MONTH.nairaTargetPerMonth,
                              },
                            }));
                          }}
                          className="z-input w-full tabular-nums"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          Production metres target (m / month)
                        </span>
                        <input
                          type="number"
                          min={1}
                          step={1000}
                          value={prefs.managerTargets?.meterTargetPerMonth ?? ''}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setPrefs((p) => ({
                              ...p,
                              managerTargets: {
                                ...p.managerTargets,
                                meterTargetPerMonth:
                                  Number.isFinite(v) && v > 0
                                    ? v
                                    : p.managerTargets?.meterTargetPerMonth ??
                                      DEFAULT_MANAGER_TARGETS_PER_MONTH.meterTargetPerMonth,
                              },
                            }));
                          }}
                          className="z-input w-full tabular-nums"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button type="button" onClick={persist} className="z-btn-primary gap-2">
                      <Save size={16} /> Save & return to dashboard
                    </button>
                  </div>
                </section>
              }
            />
            <Route
              path="team"
              element={
                showTeamTab ? (
                  <TeamAccessPanel
                    appUsers={appUsers}
                    currentUserId={currentUser?.id}
                    onRefresh={ws?.refresh}
                  />
                ) : (
                  <Navigate to="/settings/profile" replace />
                )
              }
            />
            <Route
              path="data"
              element={
                <div className="space-y-5">
                  <section className="rounded-xl border border-teal-100/70 bg-gradient-to-br from-teal-50/50 to-white p-3.5 sm:p-4">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-[#134e4a] flex items-center gap-1.5 mb-1">
                      <BadgeDollarSign size={12} strokeWidth={2.25} /> Live spot and table pricing
                    </h3>
                    <p className="text-[10px] text-slate-600 leading-snug">
                      <span className="font-semibold text-slate-700">Operational pricing</span> (today’s spot
                      moves and quick table updates) lives on the{' '}
                      <Link
                        to="/"
                        className="font-semibold text-[#134e4a] underline-offset-2 hover:underline"
                      >
                        Dashboard
                      </Link>{' '}
                      under <span className="font-medium text-slate-700">Daily spot prices</span> and{' '}
                      <span className="font-medium text-slate-700">Update price table</span>.
                    </p>
                  </section>

                  <CoilRegisterImportPanel />

                  <section>
                    <header className="mb-3 px-0.5">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Master lists (reference catalog)
                      </h3>
                      <p className="mt-0.5 text-[10px] text-slate-500 leading-snug max-w-2xl">
                        Long-lived setup data: quotation lines, colours, materials, reference price books, and
                        procurement mappings. Open a group to edit in a table; this is not the same as
                        day-to-day spot pricing on the dashboard.
                      </p>
                    </header>
                    <MasterDataWorkbench masterData={masterData} />
                  </section>
                </div>
              }
            />
            <Route
              path="governance"
              element={
                <div className="space-y-8">
                  {!governanceHasContent ? (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
                      <p className="text-sm font-semibold text-slate-700">No controls in this section for your role</p>
                      <p className="mt-2 text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                        Period locking and full audit export require additional permissions. If you need access,
                        ask an administrator.
                      </p>
                    </div>
                  ) : null}

                  {showGovernanceLimitsControl ? (
                    <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
                      <h3 className="z-section-title flex items-center gap-2">
                        <Scale size={14} /> Office approval thresholds (NGN)
                      </h3>
                      <p className="text-xs text-gray-500 mb-4">
                        Branch managers may approve payment requests at or below the expense threshold; amounts
                        above require MD/CEO (or admin). Refunds above the refund threshold require executive
                        sign-off. Changes are audited.
                      </p>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="z-field-label">Expense — branch manager max (NGN)</label>
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            className="z-input"
                            value={govLimitsForm.expenseExecutiveThresholdNgn}
                            onChange={(e) =>
                              setGovLimitsForm((p) => ({
                                ...p,
                                expenseExecutiveThresholdNgn: Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label className="z-field-label">Refund — executive above (NGN)</label>
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            className="z-input"
                            value={govLimitsForm.refundExecutiveThresholdNgn}
                            onChange={(e) =>
                              setGovLimitsForm((p) => ({
                                ...p,
                                refundExecutiveThresholdNgn: Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="mt-4">
                        <button
                          type="button"
                          disabled={govLimitsBusy}
                          onClick={() => void saveGovernanceLimits()}
                          className="z-btn-primary justify-center"
                        >
                          {govLimitsBusy ? 'Saving…' : 'Save thresholds'}
                        </button>
                      </div>
                    </section>
                  ) : null}

                  {showPeriodControls ? (
                    <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
                      <h3 className="z-section-title flex items-center gap-2">
                        <Shield size={14} /> Period controls
                      </h3>
                      <p className="text-xs text-gray-500 mb-4">
                        Lock completed accounting periods so late postings and reversals cannot backdate into
                        closed months.
                      </p>
                      <form className="grid gap-4 md:grid-cols-[12rem_1fr_auto]" onSubmit={lockPeriod}>
                        <div>
                          <label className="z-field-label">Period</label>
                          <input
                            type="month"
                            value={periodForm.periodKey}
                            onChange={(e) =>
                              setPeriodForm((prev) => ({ ...prev, periodKey: e.target.value }))
                            }
                            className="z-input"
                          />
                        </div>
                        <div>
                          <label className="z-field-label">Reason</label>
                          <input
                            value={periodForm.reason}
                            onChange={(e) =>
                              setPeriodForm((prev) => ({ ...prev, reason: e.target.value }))
                            }
                            className="z-input"
                            placeholder="Month-end close completed"
                          />
                        </div>
                        <div className="flex items-end">
                          <button type="submit" className="z-btn-primary w-full justify-center md:w-auto">
                            Lock period
                          </button>
                        </div>
                      </form>

                      <div className="mt-5 space-y-3">
                        {periodLocks.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
                            No accounting periods are locked yet.
                          </div>
                        ) : (
                          periodLocks.map((lock) => (
                            <div
                              key={lock.periodKey}
                              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 md:flex-row md:items-center md:justify-between"
                            >
                              <div>
                                <p className="text-sm font-black text-[#134e4a]">{lock.periodKey}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {lock.reason || 'Locked period'} · {lock.lockedByName || 'System'}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => unlockPeriod(lock.periodKey)}
                                className="z-btn-secondary justify-center"
                              >
                                Unlock
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                  ) : null}

                  {showAuditExport ? (
                    <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="z-section-title flex items-center gap-2 mb-0">
                          <Shield size={14} /> Compliance export
                        </h3>
                        <button type="button" onClick={downloadAuditNdjson} className="z-btn-secondary text-xs">
                          Download full audit log (NDJSON)
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Newline-delimited JSON for archiving, SIEM ingest, or offline review. Respects your
                        current session.
                      </p>
                    </section>
                  ) : null}

                  {showCuttingThresholdControl ? (
                    <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
                      <h3 className="z-section-title flex items-center gap-2">
                        <Factory size={14} /> Cutting list — minimum paid %
                      </h3>
                      <p className="mt-2 text-xs text-slate-500">
                        Before a cutting list can be saved without manager production approval, the quotation must reach this paid fraction
                        (ledger receipts plus advance applied). Enforced on the server per branch.
                      </p>
                      <div className="mt-4 space-y-3">
                        {workspaceBranches.length === 0 ? (
                          <p className="text-sm text-slate-500">No branches in workspace.</p>
                        ) : (
                          workspaceBranches.map((b) => (
                            <div
                              key={b.id}
                              className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-end sm:justify-between"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-[#134e4a]">{b.name || b.code || b.id}</p>
                                <p className="text-[10px] text-slate-500 font-mono">{b.id}</p>
                              </div>
                              <div className="flex flex-wrap items-end gap-2">
                                <div>
                                  <label className="z-field-label">Min paid (%)</label>
                                  <input
                                    type="number"
                                    min={5}
                                    max={100}
                                    step={1}
                                    value={cuttingDraftPct[b.id] ?? ''}
                                    onChange={(e) =>
                                      setCuttingDraftPct((prev) => ({ ...prev, [b.id]: e.target.value }))
                                    }
                                    className="z-input w-28"
                                  />
                                </div>
                                <button
                                  type="button"
                                  disabled={cuttingSaveBusy === b.id}
                                  onClick={() => saveBranchCuttingPct(b.id)}
                                  className="z-btn-primary text-xs justify-center"
                                >
                                  {cuttingSaveBusy === b.id ? 'Saving…' : 'Save'}
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                  ) : null}

                  {showBranchAudit ? (
                    <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="z-section-title flex items-center gap-2 mb-0">
                          <Shield size={14} /> Branch isolation audit
                        </h3>
                        <button
                          type="button"
                          onClick={loadBranchAudit}
                          disabled={branchAuditBusy}
                          className="z-btn-secondary text-xs"
                        >
                          {branchAuditBusy ? 'Refreshing…' : 'Refresh audit'}
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Checks branch-enabled tables for missing or invalid branch IDs.
                      </p>
                      {branchAudit ? (
                        <>
                          <div
                            className={`mt-4 rounded-xl border px-4 py-3 text-xs ${
                              branchAudit.strictBranchIsolationOk
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-red-200 bg-red-50 text-red-800'
                            }`}
                          >
                            <p className="font-black uppercase tracking-[0.14em]">
                              {branchAudit.strictBranchIsolationOk
                                ? 'Strict branch isolation: OK'
                                : 'Strict branch isolation: Issues found'}
                            </p>
                            <p className="mt-1">
                              Missing branch IDs: {branchAudit.totals?.missingBranchIdRows ?? 0} · Invalid branch
                              IDs: {branchAudit.totals?.invalidBranchIdRows ?? 0}
                            </p>
                          </div>
                          <div className="mt-4 space-y-2 max-h-[280px] overflow-y-auto pr-1">
                            {(branchAudit.tables || []).map((row) => (
                              <div
                                key={row.table}
                                className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2"
                              >
                                <p className="text-[11px] font-black text-slate-700">{row.table}</p>
                                <p className="mt-1 text-[11px] text-slate-600">
                                  Missing: {row.missingBranchIdRows} · Invalid: {row.invalidBranchIdRows}
                                </p>
                                {Array.isArray(row.sampleIds) && row.sampleIds.length > 0 ? (
                                  <p className="mt-1 text-[10px] text-slate-500">
                                    Sample IDs: {row.sampleIds.join(', ')}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-4 text-xs text-slate-500">
                          No audit loaded yet.
                        </div>
                      )}
                    </section>
                  ) : null}

                  {auditLog.length > 0 ? (
                    <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
                      <h3 className="z-section-title flex items-center gap-2">
                        <Shield size={14} /> Recent audit activity
                      </h3>
                      <div className="space-y-3 max-h-[min(520px,55vh)] overflow-y-auto pr-1">
                        {auditLog.slice(0, 12).map((entry) => (
                          <div
                            key={entry.id}
                            className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4"
                          >
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="text-sm font-black text-slate-800">{entry.action}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {entry.actorName || 'System'} · {entry.entityKind || 'record'} ·{' '}
                                  {entry.entityId || '—'}
                                </p>
                              </div>
                              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                                {String(entry.occurredAtISO || '').replace('T', ' ').slice(0, 16)}
                              </span>
                            </div>
                            {entry.note ? <p className="mt-2 text-xs text-slate-600">{entry.note}</p> : null}
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              }
            />
            <Route
              path="guide"
              element={
                <section>
                  <h3 className="z-section-title text-[#134e4a] mb-2">Department roles in Zarewa</h3>
                  <p className="text-xs text-gray-500 mb-6 leading-relaxed">
                    Each team owns part of the workflow. Expand a card for responsibilities and shortcuts to the
                    right screens. Access still follows permissions; workspace department only shapes defaults and
                    shortcuts. Suggested roles for new accounts are exposed in the live bootstrap payload as{' '}
                    <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px]">suggestedRoleByDepartment</code>{' '}
                    for workspace defaults.
                  </p>
                  <div className="space-y-4">
                    {DEPARTMENT_GUIDE.map((d) => {
                      const Icon = d.icon;
                      return (
                        <details
                          key={d.id}
                          className="group rounded-zarewa border border-gray-100 bg-gray-50/40 open:bg-white open:shadow-sm transition-all"
                        >
                          <summary className="flex cursor-pointer list-none items-start gap-3 p-5 [&::-webkit-details-marker]:hidden">
                            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#134e4a]/10 text-[#134e4a]">
                              <Icon size={20} />
                            </span>
                            <span className="min-w-0 flex-1 text-left">
                              <span className="flex items-center justify-between gap-2">
                                <span className="text-sm font-black text-[#134e4a]">{d.title}</span>
                                <ChevronRight
                                  className="shrink-0 text-gray-300 transition-transform group-open:rotate-90"
                                  size={18}
                                />
                              </span>
                              <span className="mt-1 block text-[11px] font-medium text-gray-600 leading-relaxed">
                                {d.primary}
                              </span>
                            </span>
                          </summary>
                          <div className="border-t border-gray-100 px-5 pb-5 pt-0">
                            <ul className="mt-3 space-y-2 text-[11px] text-gray-600 leading-relaxed list-disc pl-5">
                              {d.bullets.map((b) => (
                                <li key={b}>{b}</li>
                              ))}
                            </ul>
                            <div className="mt-4 flex flex-wrap gap-2">
                              {d.links.map((l, li) => (
                                <Link
                                  key={`${l.to}-${l.label}-${li}`}
                                  to={l.to}
                                  state={l.state}
                                  className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-[#134e4a] hover:border-teal-200 hover:bg-teal-50/50 transition-colors"
                                >
                                  {l.label}
                                  <ChevronRight size={12} />
                                </Link>
                              ))}
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </section>
              }
            />
            <Route path="*" element={<Navigate to="profile" replace />} />
          </Routes>
        </div>
      </MainPanel>
    </PageShell>
  );
};

export default Settings;
