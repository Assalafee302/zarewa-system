import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
  Link,
  useParams,
  Navigate,
} from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import Procurement from './pages/Procurement';
import SupplierProfile from './pages/SupplierProfile';
import CoilProfile from './pages/CoilProfile';
import Operations from './pages/Operations';
import Account from './pages/Account';
import Customers from './pages/Customers';
import CustomerDashboard from './pages/CustomerDashboard';
import Deliveries from './pages/Deliveries';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';
import HrLayout from './pages/hr/HrLayout';
import HrMyProfile from './pages/hr/HrMyProfile';
import HrStaffList from './pages/hr/HrStaffList';
import StaffProfile from './pages/hr/StaffProfile';
import HrSalaryWelfare from './pages/hr/HrSalaryWelfare';
import HrPayroll from './pages/hr/HrPayroll';
import HrTime from './pages/hr/HrTime';
import HrTalent from './pages/hr/HrTalent';
import HrHome from './pages/hr/HrHome';
import HrCompliance from './pages/hr/HrCompliance';
import HrNextDirectory from './pages/hr/HrNextDirectory';
import HrNextUatChecklist from './pages/hr/HrNextUatChecklist';
import LoginScreen from './components/auth/LoginScreen';
import ModuleRouteGuard from './components/ModuleRouteGuard';
import ManagerDashboard from './pages/ManagerDashboard';
import ExecDashboard from './pages/ExecDashboard';
import PriceListAdmin from './pages/PriceListAdmin';
import AccountingRouteGuard from './components/AccountingRouteGuard';
import AccountingLayout from './pages/accounting/AccountingLayout';
import AccountingOverview from './pages/accounting/AccountingOverview';
import AccountingAssets from './pages/accounting/AccountingAssets';
import AccountingCosting from './pages/accounting/AccountingCosting';
import AccountingLedger from './pages/accounting/AccountingLedger';
import AccountingStatements from './pages/accounting/AccountingStatements';
import AccountingControls from './pages/accounting/AccountingControls';
import DocumentTitleSync from './components/DocumentTitleSync';
import { Search, Bell, Command, Menu } from 'lucide-react';
import { CustomersProvider } from './context/CustomersContext';
import { InventoryProvider } from './context/InventoryContext';
import { ToastProvider } from './context/ToastContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { useInventory } from './context/InventoryContext';
import { useWorkspace } from './context/WorkspaceContext';
import { ZAREWA_LOGO_SRC } from './Data/companyQuotation';
import { BranchWorkspaceBar } from './components/layout/BranchWorkspaceBar';
import { ModalFrame } from './components/layout';
import { apiFetch } from './lib/apiBase';
import { AiAssistantDock } from './components/AiAssistantDock';
import { buildWorkspaceNotifications } from './lib/workspaceNotifications';
import { searchWorkspaceSnapshot } from './lib/workspaceSearchLocal';

function HrStaffProfileRoute() {
  const { userId } = useParams();
  return <StaffProfile key={userId} />;
}
function HrEntryIndexRoute() {
  return <Navigate to="/hr/home" replace />;
}
function AccountingIndexRoute() {
  return <Navigate to="/accounting/overview" replace />;
}

function PolicyAckGate() {
  const ws = useWorkspace();
  const user = ws?.session?.user;
  const [open, setOpen] = useState(false);
  const [required, setRequired] = useState([]);
  const [missing, setMissing] = useState([]);
  const [busy, setBusy] = useState(false);
  const [signatureName, setSignatureName] = useState(user?.displayName || '');
  const [error, setError] = useState('');

  useEffect(() => {
    setSignatureName(user?.displayName || '');
  }, [user?.displayName]);

  const reload = useCallback(async () => {
    if (!user) return;
    const { ok, data } = await apiFetch('/api/hr/policy-requirements');
    if (!ok || !data?.ok) return;
    const reqs = Array.isArray(data.required) ? data.required : [];
    const miss = Array.isArray(data.missing) ? data.missing : [];
    setRequired(reqs);
    setMissing(miss);
    setOpen(miss.length > 0);
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload, ws?.refreshEpoch]);

  const acceptAll = useCallback(async () => {
    if (!user) return;
    const name = String(signatureName || '').trim();
    if (!name) {
      setError('Enter your name to sign.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      for (const p of missing) {
        const { ok, data } = await apiFetch('/api/hr/policy-acknowledgements', {
          method: 'POST',
          body: JSON.stringify({
            policyKey: p.key,
            policyVersion: p.version,
            signatureName: name,
            context: { channel: 'policy-gate' },
          }),
        });
        if (!ok || !data?.ok) {
          throw new Error(data?.error || `Could not record acceptance for ${p.key}.`);
        }
      }
      await reload();
      setOpen(false);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [missing, reload, signatureName, user]);

  if (!user || !open) return null;

  const byKey = new Map(required.map((p) => [p.key, p]));
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
      <div className="z-modal-panel w-full max-w-lg max-h-none shrink-0 overflow-visible flex-none p-6 sm:p-7">
        <h2 className="text-base font-black text-slate-900">Policy acknowledgement required</h2>
        <p className="mt-1 text-xs text-slate-600">
          Before you can edit HR records, upload attendance, or run payroll, you must accept the required policies.
        </p>
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-bold uppercase text-slate-500">Pending</p>
          <ul className="mt-2 space-y-1 text-sm">
            {missing.map((m) => (
              <li key={`${m.key}:${m.version}`} className="flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-800">{byKey.get(m.key)?.label || m.key}</span>
                <span className="text-xs text-slate-500">{m.version}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4">
          <label className="block text-[11px] font-bold text-slate-600">Name (signature)</label>
          <input
            value={signatureName}
            onChange={(e) => setSignatureName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder="Your name"
          />
        </div>
        {error ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
            {error}
          </div>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            disabled={busy}
            className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-black uppercase text-slate-700"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void acceptAll()}
            disabled={busy}
            className="rounded-xl bg-[#134e4a] px-3 py-2 text-[11px] font-black uppercase text-white"
          >
            {busy ? 'Saving...' : 'Accept & continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

function HomeRoute() {
  const ws = useWorkspace();
  const rk = ws?.session?.user?.roleKey;
  if (rk === 'ceo') {
    return <Navigate to="/exec" replace />;
  }
  if (rk === 'md' || rk === 'sales_manager') {
    return <Navigate to="/manager" replace />;
  }
  return <Dashboard />;
}

function AppShell() {
  const navigate = useNavigate();
  const { products } = useInventory();
  const ws = useWorkspace();
  const lowStockCount = useMemo(
    () => products.filter((p) => p.stockLevel < p.lowStockThreshold).length,
    [products]
  );
  const notificationItems = useMemo(
    () =>
      buildWorkspaceNotifications({
        snapshot: ws?.snapshot,
        hasPermission: (p) => ws?.hasPermission?.(p),
        canAccessModule: (m) => ws?.canAccessModule?.(m),
        lowStockSkuCount: lowStockCount,
      }),
    [ws, lowStockCount]
  );
  const urgentNotifCount = useMemo(
    () => notificationItems.filter((n) => n.severity === 'warning').length,
    [notificationItems]
  );
  const searchRef = useRef(null);
  const [headerSearch, setHeaderSearch] = useState('');
  const [searchHits, setSearchHits] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  /** True when dropdown results came from cached snapshot (offline / API error), not live `/api/workspace/search`. */
  const [searchFromCache, setSearchFromCache] = useState(false);
  const searchDebounceRef = useRef(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('zarewa.sidebarCollapsed') === '1';
    } catch {
      return false;
    }
  });
  const signedInUser = ws?.session?.user;
  const userName = signedInUser?.displayName ?? 'Zarewa Admin';
  const userRole = signedInUser?.roleLabel ?? 'Superuser';
  const userInitials = useMemo(() => {
    const raw = String(userName || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (raw.length >= 2) return `${raw[0][0]}${raw[1][0]}`.toUpperCase();
    if (raw.length === 1 && raw[0].length >= 2) return raw[0].slice(0, 2).toUpperCase();
    if (raw.length === 1) return raw[0].slice(0, 1).toUpperCase();
    return 'ZA';
  }, [userName]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('zarewa.sidebarCollapsed', sidebarCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!notifOpen) return;
    const onDocClick = () => setNotifOpen(false);
    const t = window.setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('click', onDocClick);
    };
  }, [notifOpen]);

  useEffect(() => {
    const q = headerSearch.trim();
    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    if (q.length < 2) {
      setSearchHits([]);
      setSearchBusy(false);
      setSearchFromCache(false);
      return undefined;
    }
    searchDebounceRef.current = window.setTimeout(async () => {
      if (ws?.apiOnline) {
        setSearchFromCache(false);
        setSearchBusy(true);
        const { ok, data } = await apiFetch(
          `/api/workspace/search?q=${encodeURIComponent(q)}&limit=18`
        );
        setSearchBusy(false);
        if (ok && data?.ok && Array.isArray(data.results)) {
          setSearchHits(data.results);
          return;
        }
      }
      setSearchFromCache(true);
      setSearchHits(
        searchWorkspaceSnapshot(ws?.snapshot, q, (p) => ws?.hasPermission?.(p), 18)
      );
    }, 260);
    return () => {
      if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    };
  }, [headerSearch, ws]);

  const goSearchHit = useCallback(
    (hit) => {
      navigate(hit.path, { state: hit.state || {} });
      setHeaderSearch('');
      setSearchHits([]);
    },
    [navigate]
  );

  const runGlobalSearch = (e) => {
    e?.preventDefault?.();
    const q = headerSearch.trim();
    if (!q) return;
    if (searchHits.length > 0) {
      goSearchHit(searchHits[0]);
      return;
    }
    const lower = q.toLowerCase();
    if (lower.startsWith('qt-') || lower.startsWith('q-')) {
      navigate('/sales', { state: { globalSearchQuery: q, focusSalesTab: 'quotations' } });
    } else if (lower.startsWith('rcp-') || lower.startsWith('rcpt')) {
      navigate('/sales', { state: { globalSearchQuery: q, focusSalesTab: 'receipts' } });
    } else if (lower.startsWith('rf-')) {
      navigate('/sales', { state: { globalSearchQuery: q, focusSalesTab: 'refund' } });
    } else {
      navigate('/sales', { state: { globalSearchQuery: q, focusSalesTab: 'customers' } });
    }
    setHeaderSearch('');
    setSearchHits([]);
  };

  return (
    <div className="flex min-h-screen w-full z-app-bg font-sans selection:bg-teal-100 selection:text-[#134e4a]">
      <PolicyAckGate />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[1200] focus:rounded-xl focus:bg-[#134e4a] focus:text-white focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:shadow-xl"
      >
        Skip to main content
      </a>

      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[45] bg-slate-900/50 backdrop-blur-[2px] lg:hidden"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <Sidebar
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
      />

      <div
        className={`relative z-0 flex-1 min-h-screen min-w-0 ml-0 pt-[max(4.25rem,calc(env(safe-area-inset-top)+3.25rem))] sm:pt-10 px-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-6 lg:px-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] transition-[margin] duration-300 ease-out ${
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
        }`}
      >
        {ws?.usingCachedData ? (
          <div
            className="sticky top-0 z-40 -mx-4 sm:-mx-6 lg:mx-0 mb-4 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-[11px] font-semibold text-amber-950"
            role="status"
          >
            Offline — last workspace sync (read-only). Reconnect to post changes.
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="lg:hidden fixed z-[55] flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-200/80 bg-white/95 text-[#134e4a] shadow-md backdrop-blur-sm transition hover:border-teal-200 hover:shadow-lg left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))]"
          aria-label="Open navigation menu"
        >
          <Menu size={22} strokeWidth={2} />
        </button>

        <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:mx-0 mb-6 sm:mb-8 py-3 pl-2 pr-2 max-sm:pl-14 sm:relative sm:px-0 sm:py-0">
          <div className="z-toolbar-shell flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 max-sm:pt-2">
            {ws?.session?.user?.roleKey === 'ceo' ? (
              <p className="flex-1 min-w-0 text-[12px] text-gray-500 sm:max-w-[520px]">
                Global search is hidden for the executive read-only role.
              </p>
            ) : (
              <>
                <form
                  className="relative group flex-1 min-w-0 sm:max-w-[520px] pl-0 sm:pl-0 max-sm:order-2"
                  onSubmit={runGlobalSearch}
                >
                  <Search
                    className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-[#134e4a] transition-colors pointer-events-none z-[1]"
                    size={16}
                  />
                  <input
                    ref={searchRef}
                    type="search"
                    value={headerSearch}
                    onChange={(e) => setHeaderSearch(e.target.value)}
                    placeholder="Search… (2+ chars)"
                    autoComplete="off"
                    aria-label="Global search"
                    aria-autocomplete="list"
                    aria-expanded={headerSearch.trim().length >= 2}
                    enterKeyHint="search"
                    className="z-toolbar-shell w-full min-h-12 py-3 pl-11 pr-4 sm:pl-12 sm:pr-14 text-base sm:text-[13px] font-medium outline-none transition focus:border-teal-300/50 focus:ring-4 focus:ring-teal-500/10"
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-lg border border-gray-100 bg-gray-50/90 px-2 py-1 sm:flex">
                    <Command size={10} className="text-gray-400" />
                    <span className="text-[9px] font-black text-gray-400">K</span>
                  </div>
                  {headerSearch.trim().length >= 2 ? (
                    <div className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-[min(18rem,50dvh)] sm:max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white py-1 text-left shadow-lg">
                      {searchBusy ? (
                        <p className="px-3 py-2 text-[11px] text-gray-500">Searching…</p>
                      ) : searchHits.length === 0 ? (
                        <div className="divide-y divide-amber-50">
                          <p className="px-3 py-2 text-[11px] text-gray-500">
                            No matches — Enter uses quick path (QT-/RCP-/RF-).
                          </p>
                          {searchFromCache ? (
                            <p
                              className="px-3 py-2 text-[10px] font-medium text-amber-950 bg-amber-50/90"
                              role="status"
                            >
                              Cached workspace — empty results may be false negatives. Reconnect for live search.
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          <ul className="divide-y divide-gray-100" role="listbox">
                            {searchHits.map((hit) => (
                              <li key={`${hit.kind}-${hit.id}`}>
                                <button
                                  type="button"
                                  role="option"
                                  className="flex w-full flex-col items-start gap-0.5 px-3 py-3 text-left text-[12px] hover:bg-teal-50/80 sm:py-2"
                                  onMouseDown={(ev) => ev.preventDefault()}
                                  onClick={() => goSearchHit(hit)}
                                >
                                  <span className="font-semibold text-[#134e4a]">{hit.label}</span>
                                  <span className="text-[10px] text-gray-500">
                                    {hit.kind.replace(/_/g, ' ')}
                                    {hit.sublabel ? ` · ${hit.sublabel}` : ''}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                          {searchFromCache ? (
                            <p
                              className="border-t border-amber-100 bg-amber-50/90 px-3 py-2 text-[10px] font-medium text-amber-950"
                              role="status"
                            >
                              Cached workspace — results may be incomplete or outdated. Reconnect for live search.
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </form>

                <p className="hidden text-[11px] text-gray-400 sm:block sm:max-w-[220px] sm:text-right lg:max-w-none">
                  <span className="font-semibold text-gray-500">Tip:</span> results respect your role; pick a row or press
                  Enter for the first match.
                </p>
              </>
            )}

            <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-4 lg:gap-5 max-sm:order-1">
              <BranchWorkspaceBar />
              <div className="relative flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  aria-expanded={notifOpen}
                  aria-haspopup="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNotifOpen((o) => !o);
                  }}
                  className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-100/90 bg-white/95 shadow-sm transition hover:border-teal-100 hover:shadow-md active:scale-[0.98]"
                  title="Notifications"
                >
                  <Bell size={20} className="text-gray-400" />
                  {notificationItems.length > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[9px] font-black text-white">
                      {urgentNotifCount || notificationItems.length}
                    </span>
                  ) : null}
                </button>
                {notifOpen ? (
                  <div
                    className="fixed inset-x-3 top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] z-[70] mt-0 max-h-[min(70dvh,28rem)] overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-xl shadow-slate-900/10 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:max-h-[min(70vh,420px)]"
                    role="menu"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-gray-400">
                      For your role
                    </p>
                    {notificationItems.length === 0 ? (
                      <p className="text-xs text-gray-600 rounded-lg bg-gray-50 px-3 py-2">
                        No alerts right now — stock, approvals, and handoffs you are allowed to see will appear here.
                      </p>
                    ) : (
                      <ul className="space-y-2 text-xs text-gray-700">
                        {notificationItems.map((n) => (
                          <li key={n.id}>
                            <button
                              type="button"
                              className={`w-full rounded-lg px-3 py-3 text-left transition hover:brightness-[0.98] sm:py-2 ${
                                n.severity === 'warning'
                                  ? 'bg-amber-50 border border-amber-100'
                                  : 'bg-slate-50 border border-slate-100'
                              }`}
                              onClick={() => {
                                navigate(n.path, { state: n.state || {} });
                                setNotifOpen(false);
                              }}
                            >
                              <span className="font-bold text-[#134e4a] block">{n.title}</span>
                              <span className="text-[11px] text-gray-600 mt-0.5 block leading-snug">{n.detail}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      className="mt-4 text-[10px] font-bold uppercase text-[#134e4a]"
                      onClick={() => setNotifOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                ) : null}
              </div>

              <div
                className="flex min-w-0 flex-1 items-center gap-3 rounded-zarewa border border-gray-100/90 bg-white/95 py-1.5 pl-1.5 pr-3 text-left shadow-sm transition hover:border-teal-200 hover:shadow-md sm:flex-initial sm:pr-4"
                role="group"
                aria-label={`Signed in as ${userName}`}
              >
                <button
                  type="button"
                  onClick={() => navigate('/settings')}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#134e4a] text-xs font-black text-[#2dd4bf] shadow-inner transition hover:brightness-110 active:scale-[0.98] sm:h-9 sm:w-9 sm:text-[11px]"
                  title={`${userName} · ${userRole} — Open settings`}
                  aria-label="Open settings"
                >
                  {userInitials}
                </button>
                <div className="min-w-0 flex-1 sm:flex-initial">
                  {ws?.canAccessModule?.('hr') ? (
                    <>
                      <Link
                        to="/hr/staff/me"
                        className="block min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/40 focus-visible:ring-offset-1"
                        title="Open your HR staff profile"
                        aria-label={`${userName} — Open your profile`}
                      >
                        <p className="truncate text-[10px] font-black uppercase leading-none tracking-tighter text-[#134e4a] hover:underline underline-offset-2">
                          {userName}
                        </p>
                      </Link>
                      <p className="mt-0.5 text-[9px] font-bold uppercase leading-none tracking-widest text-gray-400">
                        {userRole}
                      </p>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setProfileOpen(true)}
                      className="w-full min-w-0 text-left"
                      title={`${userName} · ${userRole} — Open profile`}
                      aria-label={`Signed in as ${userName}. Open profile.`}
                    >
                      <p className="truncate text-[10px] font-black uppercase leading-none tracking-tighter text-[#134e4a]">
                        {userName}
                      </p>
                      <p className="mt-0.5 text-[9px] font-bold uppercase leading-none tracking-widest text-gray-400">
                        {userRole}
                      </p>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <ModalFrame
          isOpen={profileOpen}
          onClose={() => setProfileOpen(false)}
          title="My profile"
          description="Your app login profile details"
        >
          <div className="z-modal-panel w-full max-w-lg max-h-none shrink-0 overflow-visible flex-none p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-black text-slate-900">My profile</h2>
                <p className="mt-1 text-xs text-slate-600">App login details (not HR employment records).</p>
              </div>
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="z-btn-secondary !px-3 !py-2 !text-[11px]"
              >
                Close
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Name</p>
              <p className="mt-1 text-sm font-black text-[#134e4a] break-words">
                {ws?.session?.user?.displayName || '—'}
              </p>

              <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Username</p>
              <p className="mt-1 text-[12px] font-mono font-semibold text-slate-800 break-all">
                {ws?.session?.user?.username || '—'}
              </p>

              <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Role</p>
              <p className="mt-1 text-[12px] font-semibold text-slate-800">
                {ws?.session?.user?.roleLabel || ws?.session?.user?.roleKey || '—'}
              </p>

              {ws?.session?.user?.email ? (
                <>
                  <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Email</p>
                  <p className="mt-1 text-[12px] font-semibold text-slate-800 break-all">
                    {ws.session.user.email}
                  </p>
                </>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="z-btn-secondary !text-[11px]"
                onClick={() => {
                  setProfileOpen(false);
                  navigate('/settings');
                }}
              >
                Open settings
              </button>
              <button
                type="button"
                className="z-btn-primary !text-[11px]"
                onClick={() => {
                  setProfileOpen(false);
                  navigate('/settings/security');
                }}
              >
                Security
              </button>
            </div>
          </div>
        </ModalFrame>

        <main id="main-content" className="outline-none" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/exec" element={<ExecDashboard />} />
            <Route path="/price-list" element={<PriceListAdmin />} />
            <Route
              path="/sales"
              element={
                <ModuleRouteGuard moduleKey="sales">
                  <Sales />
                </ModuleRouteGuard>
              }
            />
            <Route
              path="/customers"
              element={
                <ModuleRouteGuard moduleKey="sales">
                  <Customers />
                </ModuleRouteGuard>
              }
            />
            <Route
              path="/customers/:customerId"
              element={
                <ModuleRouteGuard moduleKey="sales">
                  <CustomerDashboard />
                </ModuleRouteGuard>
              }
            />
            <Route
              path="/procurement"
              element={
                <ModuleRouteGuard moduleKey="procurement">
                  <Procurement />
                </ModuleRouteGuard>
              }
            />
            <Route
              path="/procurement/suppliers/:supplierId"
              element={
                <ModuleRouteGuard moduleKey="procurement">
                  <SupplierProfile />
                </ModuleRouteGuard>
              }
            />
            <Route
              path="/operations"
              element={
                <ModuleRouteGuard moduleKey="operations">
                  <Operations />
                </ModuleRouteGuard>
              }
            />
            <Route
              path="/operations/coils/:coilNo"
              element={
                <ModuleRouteGuard moduleKey="operations">
                  <CoilProfile />
                </ModuleRouteGuard>
              }
            />
            <Route
              path="/deliveries"
              element={
                <ModuleRouteGuard moduleKey="operations">
                  <Deliveries />
                </ModuleRouteGuard>
              }
            />
            <Route
              path="/accounts"
              element={
                <ModuleRouteGuard moduleKey="finance">
                  <Account />
                </ModuleRouteGuard>
              }
            />
            <Route
              path="/accounts/bank-reconciliation"
              element={
                <ModuleRouteGuard moduleKey="finance">
                  <Navigate to="/accounts?tab=receipts" replace />
                </ModuleRouteGuard>
              }
            />
            <Route
              path="/accounting"
              element={
                <ModuleRouteGuard moduleKey="finance">
                  <AccountingRouteGuard>
                    <AccountingLayout />
                  </AccountingRouteGuard>
                </ModuleRouteGuard>
              }
            >
              <Route index element={<AccountingIndexRoute />} />
              <Route path="overview" element={<AccountingOverview />} />
              <Route path="assets" element={<AccountingAssets />} />
              <Route path="costing" element={<AccountingCosting />} />
              <Route path="ledger" element={<AccountingLedger />} />
              <Route path="statements" element={<AccountingStatements />} />
              <Route path="controls" element={<AccountingControls />} />
            </Route>
            <Route
              path="/reports"
              element={
                <ModuleRouteGuard moduleKey="reports">
                  <Reports />
                </ModuleRouteGuard>
              }
            />
            <Route
              path="/edit-approvals"
              element={
                <ModuleRouteGuard moduleKey="edit_approvals">
                  <Navigate to="/" replace />
                </ModuleRouteGuard>
              }
            />
            <Route
              path="/settings/*"
              element={
                <ModuleRouteGuard moduleKey="settings">
                  <Settings />
                </ModuleRouteGuard>
              }
            />
            <Route
              path="/manager"
              element={
                <ModuleRouteGuard moduleKey="sales">
                  <ManagerDashboard />
                </ModuleRouteGuard>
              }
            />
            <Route
              path="/hr"
              element={
                <ModuleRouteGuard moduleKey="hr">
                  <HrLayout />
                </ModuleRouteGuard>
              }
            >
              <Route index element={<HrEntryIndexRoute />} />
              <Route path="home" element={<HrHome />} />
              <Route path="my-profile" element={<HrMyProfile />} />
              <Route path="salary-welfare" element={<HrSalaryWelfare />} />
              <Route path="staff" element={<HrStaffList />} />
              <Route path="staff/directory-quality" element={<HrNextDirectory />} />
              <Route path="staff/:userId" element={<HrStaffProfileRoute />} />
              <Route path="payroll" element={<HrPayroll />} />
              <Route path="time" element={<HrTime />} />
              <Route path="talent" element={<HrTalent />} />
              <Route path="compliance" element={<HrCompliance />} />
              <Route path="uat-checklist" element={<HrNextUatChecklist />} />
            </Route>
            <Route path="/hr-next/uat" element={<Navigate to="/hr/uat-checklist" replace />} />
            <Route path="/hr-next" element={<Navigate to="/hr/staff/directory-quality" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <AiAssistantDock />
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen z-app-bg flex items-center justify-center px-6">
      <div className="rounded-[28px] border border-white/70 bg-white/90 px-8 py-7 text-center shadow-xl backdrop-blur-xl">
        <img
          src={ZAREWA_LOGO_SRC}
          alt=""
          className="mx-auto h-12 w-auto object-contain object-center"
          width={120}
          height={48}
        />
        <p className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Zarewa</p>
        <p className="mt-3 text-xl font-black text-[#134e4a]">Preparing live workspace…</p>
      </div>
    </div>
  );
}

function AuthGate() {
  const ws = useWorkspace();

  if (!ws) {
    return <LoadingScreen />;
  }

  if (ws.status === 'checking') {
    return <LoadingScreen />;
  }

  if (ws.authRequired || (ws.status === 'offline' && !ws.snapshot)) {
    return <LoginScreen />;
  }

  return (
    <InventoryProvider>
      <CustomersProvider>
        <AppShell />
      </CustomersProvider>
    </InventoryProvider>
  );
}

function App() {
  return (
    <Router>
      <WorkspaceProvider>
        <ToastProvider>
          <DocumentTitleSync />
          <AuthGate />
        </ToastProvider>
      </WorkspaceProvider>
    </Router>
  );
}

export default App;
