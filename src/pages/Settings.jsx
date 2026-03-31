import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { PageHeader, PageShell, MainPanel, PageTabs } from '../components/layout';
import MasterDataWorkbench from '../components/settings/MasterDataWorkbench';
import { loadDashboardPrefs, saveDashboardPrefs } from '../lib/dashboardPrefs';
import { apiFetch, apiUrl } from '../lib/apiBase';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';

/** Reference: how each department maps to modules in this demo app. */
const DEPARTMENT_GUIDE = [
  {
    id: 'customer',
    title: 'Customer department',
    icon: Users,
    primary:
      'Owns customer relationships from first contact through post-sale service — accurate profiles and responsive follow-up.',
    bullets: [
      'Profiling: create and maintain customer records, terms, and tiers.',
      'Quotations: pricing and status tracking (tight coupling with Sales workspace).',
      'Interaction: inquiries, complaints, follow-ups (see customer dashboard timeline & notes).',
      'Orders: align approved quotes with fulfillment via inventory and production.',
    ],
    links: [
      { to: '/sales', label: 'Sales' },
      { to: '/sales', label: 'Customers (Sales → Customers tab)', state: { focusSalesTab: 'customers' } },
    ],
  },
  {
    id: 'sales',
    title: 'Sales department',
    icon: ShoppingCart,
    primary:
      'Drives revenue — pipeline discipline, order execution, collections, and performance visibility.',
    bullets: [
      'Leads & pipeline: qualify prospects and register them as customers when ready.',
      'Sales orders: quotations, cutting lists, and dispatch handoff.',
      'Payments: receipts posted against quotations; supports partial and full settlement.',
      'Reporting: trends and KPIs via Reports and the main dashboard.',
    ],
    links: [
      { to: '/sales', label: 'Sales' },
      { to: '/reports', label: 'Reports' },
    ],
  },
  {
    id: 'inventory',
    title: 'Production (store)',
    icon: Package,
    primary:
      'Physical stock — GRN from approved POs, coil traceability, transfers, adjustments, and alerts.',
    bullets: [
      'Reception: Store GRN with coil / weight / location; validates against PO open qty.',
      'Movement: store → production transfers and finished-goods back to sellable stock.',
      'Deliveries: dispatch board under Production → Deliveries tab.',
      'Reporting: low stock strip, live levels in Reports.',
    ],
    links: [
      { to: '/operations', label: 'Production' },
      { to: '/operations', label: 'Deliveries (Production tab)', state: { focusOpsTab: 'deliveries' } },
    ],
  },
  {
    id: 'production',
    title: 'Production department',
    icon: Factory,
    primary:
      'Converts raw materials to finished goods — planning, consumption visibility, quality, and yield.',
    bullets: [
      'Planning: production queue and job IDs linked to material transfers.',
      'Consumption: raw issue from store (WIP tracked on the Production page).',
      'Output: finished goods receipt into FG SKUs for sales.',
      'Efficiency: conversion and scrap narratives on dashboard / future dedicated reports.',
    ],
    links: [{ to: '/operations', label: 'Production' }],
  },
  {
    id: 'purchase',
    title: 'Purchase department',
    icon: Truck,
    primary:
      'Sourcing and supplier performance — PO lifecycle, invoices on file, coordination with store GRN.',
    bullets: [
      'Suppliers: directory and transport agents (Purchases / Transportation tabs).',
      'Purchase orders: multi-line POs, totals, Pending → Approved / Rejected; assign transport (on loading), then post to in transit (optional treasury-linked haulage) before GRN.',
      'Invoices: supplier invoice metadata on PO; quantities finalized at store receipt.',
      'Spend: tie-in to Finance payables for procurement cost views.',
    ],
    links: [
      { to: '/procurement', label: 'Purchase' },
      { to: '/accounts', label: 'Finance (payables)' },
    ],
  },
  {
    id: 'finance',
    title: 'Financial / accounting',
    icon: Landmark,
    primary:
      'Liquidity, AR/AP, expenses, approvals, movements, audit and bank reconciliation.',
    bullets: [
      'Receivables: summary from Finance sidebar; detail in Sales receipts / customer dashboards.',
      'Payables: supplier balances and payments from bank/cash.',
      'Expenses & requests: vouchers and approval workflow.',
      'Control: reconciliation lines, audit checklist, reporting exports (stubs).',
    ],
    links: [{ to: '/accounts', label: 'Finance & accounts' }],
  },
  {
    id: 'reports',
    title: 'Reports & analytics',
    icon: BarChart3,
    primary:
      'Cross-cutting insight — sales, inventory movement log, financial previews, exports.',
    bullets: [
      'Sales and receivables snapshots with date filters (demo scope).',
      'Inventory overview and live movement log from Production / Procurement activity.',
      'Financial packs (P&L, cash flow) when the ledger API is connected.',
      'Production efficiency packs as metrics mature.',
    ],
    links: [{ to: '/reports', label: 'Reports' }],
  },
  {
    id: 'it',
    title: 'IT & support',
    icon: LifeBuoy,
    primary:
      'Platform health, user enablement, security, and access governance.',
    bullets: [
      'Maintenance: uptime, releases, and environment hygiene (outside this UI demo).',
      'Training & support: onboarding staff on each module above.',
      'Security: authentication, roles, and audit when backend auth ships.',
      'Demo role below previews future per-module visibility.',
    ],
    links: [{ to: '/settings', label: 'Settings (this page)' }],
  },
];

const SETTINGS_TABS = [
  { id: 'account', label: 'Account & display', icon: <User size={14} /> },
  { id: 'data', label: 'Data & pricing', icon: <Database size={14} /> },
  { id: 'governance', label: 'Controls & audit', icon: <Scale size={14} /> },
  { id: 'guide', label: 'Team guide', icon: <BookOpen size={14} /> },
];

const Settings = () => {
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const ws = useWorkspace();
  const [settingsTab, setSettingsTab] = useState('account');
  const [prefs, setPrefs] = useState(loadDashboardPrefs);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [periodForm, setPeriodForm] = useState({
    periodKey: new Date().toISOString().slice(0, 7),
    reason: '',
  });
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

  const persist = () => {
    saveDashboardPrefs(prefs);
    showToast('Preferences saved. Returning to dashboard.');
    navigate('/', { replace: true });
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
  const governanceHasContent =
    showPeriodControls || showAuditExport || auditLog.length > 0;

  return (
    <PageShell>
      <PageHeader
        title="Settings"
        subtitle="Organized by task — account, catalog data, governance, and a reference guide for each team."
      />

      <MainPanel className="max-w-5xl">
        <div className="relative z-[1] mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PageTabs tabs={SETTINGS_TABS} value={settingsTab} onChange={setSettingsTab} />
          <p className="text-[11px] text-slate-500 max-sm:order-first sm:max-w-[14rem] sm:text-right leading-snug">
            Switch tabs to focus on one area; your session and data stay the same.
          </p>
        </div>

        <div className="relative z-[1]">
          {settingsTab === 'account' ? (
            <div className="space-y-8">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
                  <h3 className="z-section-title flex items-center gap-2">
                    <Shield size={14} /> Access profile
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    The UI follows the signed-in server role instead of a local demo toggle.
                  </p>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Current user
                    </p>
                    <p className="mt-2 text-lg font-black text-[#134e4a]">
                      {currentUser?.displayName || '—'}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {currentUser?.roleLabel || 'No active role'}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {permissions.map((perm) => (
                      <span
                        key={perm}
                        className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#134e4a]"
                      >
                        {perm}
                      </span>
                    ))}
                  </div>
                  {appUsers.length > 0 ? (
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                        User directory
                      </p>
                      <div className="mt-3 space-y-3 max-h-[220px] overflow-y-auto pr-1">
                        {appUsers.map((user) => (
                          <div
                            key={user.id}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <p className="font-bold text-slate-800">{user.displayName}</p>
                              <p className="text-slate-500">
                                {user.username} · {user.roleKey}
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">
                              {user.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
                  <h3 className="z-section-title flex items-center gap-2">
                    <Shield size={14} /> Password security
                  </h3>
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
              </div>

              <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
                <h3 className="z-section-title mb-1">Dashboard layout</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Choose what appears on the home dashboard. Use the button below to save and go back.
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
                <div className="mt-6 flex flex-wrap gap-3">
                  <button type="button" onClick={persist} className="z-btn-primary gap-2">
                    <Save size={16} /> Save & return to dashboard
                  </button>
                </div>
              </section>
            </div>
          ) : null}

          {settingsTab === 'data' ? (
            <div className="space-y-5">
              <section className="rounded-xl border border-teal-100/70 bg-gradient-to-br from-teal-50/50 to-white p-3.5 sm:p-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-[#134e4a] flex items-center gap-1.5 mb-1">
                  <BadgeDollarSign size={12} strokeWidth={2.25} /> Live spot and table pricing
                </h3>
                <p className="text-[10px] text-slate-600 leading-snug">
                  Updates happen on the{' '}
                  <Link
                    to="/"
                    className="font-semibold text-[#134e4a] underline-offset-2 hover:underline"
                  >
                    Dashboard
                  </Link>
                  {' '}via <span className="font-medium text-slate-700">Daily spot prices</span> and{' '}
                  <span className="font-medium text-slate-700">Update price table</span>.
                </p>
              </section>

              <section>
                <header className="mb-3 px-0.5">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Master lists
                  </h3>
                  <p className="mt-0.5 text-[10px] text-slate-500 leading-snug max-w-2xl">
                    Edit setup data used across Sales, Procurement, Production, and Finance — grouped below by
                    purpose.
                  </p>
                </header>
                <MasterDataWorkbench masterData={masterData} />
              </section>
            </div>
          ) : null}

          {settingsTab === 'governance' ? (
            <div className="space-y-8">
              {!governanceHasContent ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
                  <p className="text-sm font-semibold text-slate-700">No controls in this tab for your role</p>
                  <p className="mt-2 text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    Period locking and full audit export require additional permissions. If you need access,
                    ask an administrator.
                  </p>
                </div>
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
          ) : null}

          {settingsTab === 'guide' ? (
            <section>
              <h3 className="z-section-title text-[#134e4a] mb-2">Department roles in Zarewa</h3>
              <p className="text-xs text-gray-500 mb-6 leading-relaxed">
                Each team owns part of the workflow. Expand a card for responsibilities and shortcuts to the
                right screens.
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
                          {d.links.map((l) => (
                            <Link
                              key={`${l.to}-${l.label}`}
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
          ) : null}
        </div>
      </MainPanel>
    </PageShell>
  );
};

export default Settings;
