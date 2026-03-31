import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import Procurement from './pages/Procurement';
import SupplierProfile from './pages/SupplierProfile';
import Operations from './pages/Operations';
import Account from './pages/Account';
import Customers from './pages/Customers';
import CustomerDashboard from './pages/CustomerDashboard';
import Deliveries from './pages/Deliveries';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';
import LoginScreen from './components/auth/LoginScreen';
import { Search, Bell, Command, Menu } from 'lucide-react';
import { CustomersProvider } from './context/CustomersContext';
import { InventoryProvider } from './context/InventoryContext';
import { ToastProvider } from './context/ToastContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { useInventory } from './context/InventoryContext';
import { useWorkspace } from './context/WorkspaceContext';
import { ZAREWA_LOGO_SRC } from './Data/companyQuotation';
import { BranchWorkspaceBar } from './components/layout/BranchWorkspaceBar';
import { apiFetch } from './lib/apiBase';
import { buildWorkspaceNotifications } from './lib/workspaceNotifications';
import { searchWorkspaceSnapshot } from './lib/workspaceSearchLocal';

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
  const searchDebounceRef = useRef(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

  /* eslint-disable react-hooks/set-state-in-effect -- debounced search sync */
  useEffect(() => {
    const q = headerSearch.trim();
    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    if (q.length < 2) {
      setSearchHits([]);
      setSearchBusy(false);
      return undefined;
    }
    searchDebounceRef.current = window.setTimeout(async () => {
      if (ws?.canMutate) {
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
      setSearchHits(
        searchWorkspaceSnapshot(ws?.snapshot, q, (p) => ws?.hasPermission?.(p), 18)
      );
    }, 260);
    return () => {
      if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    };
  }, [headerSearch, ws]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    } else {
      navigate('/sales', { state: { globalSearchQuery: q, focusSalesTab: 'customers' } });
    }
    setHeaderSearch('');
    setSearchHits([]);
  };

  return (
    <div className="flex min-h-screen w-full z-app-bg font-sans selection:bg-teal-100 selection:text-[#134e4a]">
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
        className={`relative z-0 flex-1 min-h-screen min-w-0 ml-0 pt-[4.25rem] sm:pt-10 px-4 sm:px-6 lg:px-10 pb-10 transition-[margin] duration-300 ease-out ${
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
          className="lg:hidden fixed left-4 top-4 z-[55] flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200/80 bg-white/95 text-[#134e4a] shadow-md backdrop-blur-sm transition hover:border-teal-200 hover:shadow-lg"
          aria-label="Open navigation menu"
        >
          <Menu size={22} strokeWidth={2} />
        </button>

        <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:mx-0 mb-6 sm:mb-8 px-2 py-3 sm:static sm:px-0 sm:py-0">
          <div className="z-toolbar-shell flex flex-col gap-4 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <form
              className="relative group flex-1 min-w-0 sm:max-w-[520px] pl-12 sm:pl-0"
              onSubmit={runGlobalSearch}
            >
              <Search
                className="absolute left-5 sm:left-5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-[#134e4a] transition-colors pointer-events-none z-[1]"
                size={16}
              />
              <input
                ref={searchRef}
                type="search"
                value={headerSearch}
                onChange={(e) => setHeaderSearch(e.target.value)}
                placeholder="Search customers, quotes, receipts, POs… (2+ chars)"
                autoComplete="off"
                aria-label="Global search"
                aria-autocomplete="list"
                aria-expanded={searchHits.length > 0}
                className="z-toolbar-shell w-full py-3 pl-12 pr-14 text-[13px] font-medium outline-none transition focus:border-teal-300/50 focus:ring-4 focus:ring-teal-500/10"
              />
              <div className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-lg border border-gray-100 bg-gray-50/90 px-2 py-1">
                <Command size={10} className="text-gray-400" />
                <span className="text-[9px] font-black text-gray-400">K</span>
              </div>
              {headerSearch.trim().length >= 2 ? (
                <div className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 text-left shadow-lg">
                  {searchBusy ? (
                    <p className="px-3 py-2 text-[11px] text-gray-500">Searching…</p>
                  ) : searchHits.length === 0 ? (
                    <p className="px-3 py-2 text-[11px] text-gray-500">No matches — Enter uses quick path (QT-/RCP-).</p>
                  ) : (
                    <ul className="divide-y divide-gray-100" role="listbox">
                      {searchHits.map((hit) => (
                        <li key={`${hit.kind}-${hit.id}`}>
                          <button
                            type="button"
                            role="option"
                            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-[12px] hover:bg-teal-50/80"
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
                  )}
                </div>
              ) : null}
            </form>

            <p className="hidden text-[11px] text-gray-400 sm:block sm:max-w-[220px] sm:text-right lg:max-w-none">
              <span className="font-semibold text-gray-500">Tip:</span> results respect your role; pick a row or press
              Enter for the first match.
            </p>

            <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-4 lg:gap-5">
              <BranchWorkspaceBar />
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={notifOpen}
                  aria-haspopup="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNotifOpen((o) => !o);
                  }}
                  className="relative rounded-2xl border border-gray-100/90 bg-white/95 p-3 shadow-sm transition hover:border-teal-100 hover:shadow-md active:scale-[0.98]"
                  title="Notifications"
                >
                  <Bell size={18} className="text-gray-400" />
                  {notificationItems.length > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[9px] font-black text-white">
                      {urgentNotifCount || notificationItems.length}
                    </span>
                  ) : null}
                </button>
                {notifOpen ? (
                  <div
                    className="absolute right-0 mt-2 w-80 max-h-[min(70vh,420px)] overflow-y-auto rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-xl shadow-slate-900/10"
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
                              className={`w-full rounded-lg px-3 py-2 text-left transition hover:brightness-[0.98] ${
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

              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="flex items-center gap-3 rounded-zarewa border border-gray-100/90 bg-white/95 py-1.5 pl-1.5 pr-4 text-left shadow-sm transition hover:border-teal-200 hover:shadow-md"
                title={`${userName} · ${userRole} — Open settings`}
                aria-label={`Signed in as ${userName}. Open settings.`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#134e4a] text-[11px] font-black text-[#2dd4bf] shadow-inner">
                  {userInitials}
                </div>
                <div className="hidden min-[380px]:block">
                  <p className="text-[10px] font-black uppercase leading-none tracking-tighter text-[#134e4a]">
                    {userName}
                  </p>
                  <p className="mt-0.5 text-[9px] font-bold uppercase leading-none tracking-widest text-gray-400">
                    {userRole}
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>

        <main id="main-content" className="outline-none" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:customerId" element={<CustomerDashboard />} />
            <Route path="/procurement" element={<Procurement />} />
            <Route path="/procurement/suppliers/:supplierId" element={<SupplierProfile />} />
            <Route path="/operations" element={<Operations />} />
            <Route path="/deliveries" element={<Deliveries />} />
            <Route path="/accounts" element={<Account />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
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
          <AuthGate />
        </ToastProvider>
      </WorkspaceProvider>
    </Router>
  );
}

export default App;
