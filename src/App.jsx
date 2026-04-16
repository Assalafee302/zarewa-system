import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
  Navigate,
} from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import Procurement from './pages/Procurement';
import SupplierProfile from './pages/SupplierProfile';
import TransportAgentProfile from './pages/TransportAgentProfile';
import CoilProfile from './pages/CoilProfile';
import Operations from './pages/Operations';
import Account from './pages/Account';
import Customers from './pages/Customers';
import CustomerDashboard from './pages/CustomerDashboard';
import Reports from './pages/Reports';
import OfficeDesk from './pages/OfficeDesk';
import Settings from './pages/Settings';
import EditApprovalsPage from './pages/EditApprovalsPage';
import NotFound from './pages/NotFound';
import LoginScreen from './components/auth/LoginScreen';
import ModuleRouteGuard from './components/ModuleRouteGuard';
import ManagerDashboard from './pages/ManagerDashboard';
import ExecDashboard from './pages/ExecDashboard';
import PriceListAdmin from './pages/PriceListAdmin';
import DocumentTitleSync from './components/DocumentTitleSync';
import { Search, Bell, Command, Menu, ChevronDown, User, Settings as SettingsIcon, Lock, LogOut } from 'lucide-react';
import { CustomersProvider } from './context/CustomersContext';
import { InventoryProvider } from './context/InventoryContext';
import { ToastProvider } from './context/ToastContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { useInventory } from './context/InventoryContext';
import { useWorkspace } from './context/WorkspaceContext';
import { ZAREWA_LOGO_SRC } from './Data/companyQuotation';
import { BranchWorkspaceBar } from './components/layout/BranchWorkspaceBar';
import { apiFetch } from './lib/apiBase';
import { AiAssistantDock } from './components/AiAssistantDock';
import { AiAskButton } from './components/AiAskButton';
import { buildWorkspaceNotifications } from './lib/workspaceNotifications';
import { AiAssistantProvider, useAiAssistant } from './context/AiAssistantContext';
import { notificationPrompt } from './lib/aiAssistUi';
import { searchWorkspaceSnapshot } from './lib/workspaceSearchLocal';

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
  const ai = useAiAssistant();
  const lowStockCount = useMemo(
    () => products.filter((p) => p.stockLevel < p.lowStockThreshold).length,
    [products]
  );
  const [officeSummary, setOfficeSummary] = useState(null);
  useEffect(() => {
    if (!ws?.canAccessModule?.('office')) {
      setOfficeSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { ok, data } = await apiFetch('/api/office/summary');
      if (cancelled) return;
      if (ok && data?.ok) setOfficeSummary(data);
      else setOfficeSummary(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [ws]);

  const notificationItems = useMemo(
    () =>
      buildWorkspaceNotifications({
        snapshot: ws?.snapshot,
        hasPermission: (p) => ws?.hasPermission?.(p),
        canAccessModule: (m) => ws?.canAccessModule?.(m),
        lowStockSkuCount: lowStockCount,
        officeSummary,
      }),
    [ws, lowStockCount, officeSummary]
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
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
    if (!userMenuOpen) return;
    const onDocClick = () => setUserMenuOpen(false);
    const t = window.setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('click', onDocClick);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setUserMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [userMenuOpen]);

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

  const askAiAboutSearch = useCallback(() => {
    const q = headerSearch.trim();
    ai?.openAssistant?.({
      mode: 'search',
      prompt: q
        ? `Summarize the most relevant workspace results for "${q}" and tell me where I should go next.`
        : 'What needs my attention today across the workspace, and where should I start?',
      pageContext: {
        source: q ? 'header-search' : 'app-shell',
        searchQuery: q,
        resultCount: searchHits.length,
      },
      autoSend: true,
    });
    setHeaderSearch('');
    setSearchHits([]);
  }, [ai, headerSearch, searchHits.length]);

  return (
    <div className="flex min-h-screen min-h-dvh min-w-0 w-full max-w-full z-app-bg font-sans selection:bg-teal-100 selection:text-[#134e4a]">
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

        <div className="sticky top-0 z-30 -mx-4 min-w-0 max-sm:overflow-x-clip sm:-mx-6 lg:mx-0 mb-4 max-sm:mb-3 sm:mb-8 py-2 pl-2 pr-2 max-sm:pl-14 sm:relative sm:px-0 sm:py-0">
          <div className="flex min-w-0 flex-col gap-2 px-2 py-2 max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none sm:z-toolbar-shell sm:gap-3 sm:px-4 sm:py-3 sm:flex-row sm:items-center sm:justify-between max-sm:pt-1">
            {ws?.session?.user?.roleKey === 'ceo' ? (
              <p className="flex-1 min-w-0 text-[12px] text-gray-500 sm:max-w-[520px] max-sm:order-2">
                Global search is hidden for the executive read-only role.
              </p>
            ) : (
              <>
                <div className="flex min-w-0 flex-1 flex-row items-stretch gap-2 max-sm:order-2 sm:max-w-[520px] sm:items-center sm:gap-3">
                <form
                  className="relative group min-w-0 flex-1 sm:max-w-none"
                  onSubmit={runGlobalSearch}
                >
                  <Search
                    className="absolute left-3.5 sm:left-5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-[#134e4a] transition-colors pointer-events-none z-[1]"
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
                    className="w-full min-h-10 rounded-xl border border-slate-200/90 bg-white py-2.5 pl-10 pr-3 text-[15px] font-medium shadow-sm outline-none transition focus:border-teal-300/60 focus:ring-2 focus:ring-teal-500/15 sm:z-toolbar-shell sm:min-h-12 sm:py-3 sm:pl-12 sm:pr-14 sm:text-[13px] sm:focus:ring-4"
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

                {ai?.available && ai.canUseMode('search') ? (
                  <button
                    type="button"
                    onClick={askAiAboutSearch}
                    aria-label="Ask AI about workspace search"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-100/90 bg-white text-[#134e4a] shadow-sm transition hover:border-teal-200 hover:bg-teal-50/50 active:scale-[0.98] sm:h-12 sm:w-auto sm:gap-2 sm:rounded-2xl sm:px-3 sm:self-center"
                    title={
                      headerSearch.trim()
                        ? 'Ask AI to explain this workspace query'
                        : 'Ask AI to summarize what matters in the workspace'
                    }
                  >
                    <Command size={14} className="text-teal-600" aria-hidden />
                    <span className="hidden text-[10px] font-black uppercase tracking-wider sm:inline">
                      Ask AI
                    </span>
                  </button>
                ) : null}
                </div>

                <p className="hidden text-[11px] text-gray-400 sm:block sm:max-w-[220px] sm:text-right lg:max-w-none">
                  <span className="font-semibold text-gray-500">Tip:</span> results respect your role; pick a row or press
                  Enter for the first match.
                </p>
              </>
            )}

            <div className="flex w-full min-w-0 max-w-full flex-row flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end sm:gap-4 lg:gap-5 max-sm:order-1">
              <div className="min-w-0 flex-1 sm:flex-initial sm:w-auto">
                <BranchWorkspaceBar />
              </div>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-4">
                <div className="relative flex shrink-0 items-center gap-2">
                  <button
                  type="button"
                  aria-expanded={notifOpen}
                  aria-haspopup="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserMenuOpen(false);
                    setNotifOpen((o) => !o);
                  }}
                  className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200/80 bg-white/95 shadow-sm transition hover:border-teal-100 hover:shadow-md active:scale-[0.98] sm:h-12 sm:w-12 sm:rounded-2xl sm:border-gray-100/90"
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
                      <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">For your role</p>
                      <AiAskButton
                        mode="search"
                        prompt="Summarize the alerts I can see, explain why they matter, and tell me what to do first."
                        pageContext={{
                          source: 'notifications',
                          notificationCount: notificationItems.length,
                          urgentCount: urgentNotifCount,
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-teal-100 bg-teal-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-[#134e4a]"
                        onAfterOpen={() => setNotifOpen(false)}
                      >
                        Ask AI
                      </AiAskButton>
                    </div>
                    {notificationItems.length === 0 ? (
                      <p className="text-xs text-gray-600 rounded-lg bg-gray-50 px-3 py-2">
                        No alerts right now — stock, approvals, and handoffs you are allowed to see will appear here.
                      </p>
                    ) : (
                      <ul className="space-y-2 text-xs text-gray-700">
                        {notificationItems.map((n) => (
                          <li key={n.id}>
                            <div
                              className={`rounded-lg border px-3 py-3 transition sm:py-2 ${
                                n.severity === 'warning'
                                  ? 'bg-amber-50 border-amber-100'
                                  : 'bg-slate-50 border-slate-100'
                              }`}
                            >
                              <button
                                type="button"
                                className="w-full text-left"
                                onClick={() => {
                                  navigate(n.path, { state: n.state || {} });
                                  setNotifOpen(false);
                                }}
                              >
                                <span className="font-bold text-[#134e4a] block">{n.title}</span>
                                <span className="text-[11px] text-gray-600 mt-0.5 block leading-snug">{n.detail}</span>
                              </button>
                              {ai?.available && ai.canUseMode('search') ? (
                                <AiAskButton
                                  mode="search"
                                  prompt={notificationPrompt(n)}
                                  pageContext={{
                                    source: 'notification-item',
                                    notificationId: n.id,
                                    targetPath: n.path,
                                  }}
                                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-white/80 bg-white/70 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-[#134e4a]"
                                  onAfterOpen={() => setNotifOpen(false)}
                                >
                                  Ask AI
                                </AiAskButton>
                              ) : null}
                            </div>
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

                <div className="relative flex shrink-0">
                  <button
                    type="button"
                    aria-expanded={userMenuOpen}
                    aria-haspopup="menu"
                    aria-label={`Signed in as ${userName}. Open account menu.`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setNotifOpen(false);
                      setUserMenuOpen((o) => !o);
                    }}
                    className="flex min-w-0 max-w-full items-center gap-2 rounded-zarewa border border-gray-100/90 bg-white/95 py-1.5 pl-1.5 pr-2 text-left shadow-sm transition hover:border-teal-200 hover:shadow-md max-sm:flex-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:flex-initial sm:gap-3 sm:pr-3"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#134e4a] text-[11px] font-black text-[#2dd4bf] shadow-inner sm:h-9 sm:w-9">
                      {userInitials}
                    </span>
                    <div className="hidden min-w-0 sm:block sm:flex-initial sm:max-w-[11rem]">
                      <p className="truncate text-[10px] font-black uppercase leading-none tracking-tighter text-[#134e4a]">
                        {userName}
                      </p>
                      <p className="mt-0.5 truncate text-[9px] font-bold uppercase leading-none tracking-widest text-gray-400">
                        {userRole}
                      </p>
                    </div>
                    <ChevronDown
                      size={16}
                      aria-hidden
                      className={`hidden shrink-0 text-gray-400 transition sm:block ${userMenuOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {userMenuOpen ? (
                    <div
                      className="fixed inset-x-3 top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] z-[70] mt-0 overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-xl shadow-slate-900/10 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[min(20rem,calc(100vw-2rem))]"
                      role="menu"
                      aria-label="Account menu"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="border-b border-gray-100 bg-slate-50/80 px-4 py-3">
                        <p className="truncate text-sm font-black text-[#134e4a]">{userName}</p>
                        <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-600">{userRole}</p>
                        {signedInUser?.username ? (
                          <p className="mt-1.5 truncate font-mono text-[11px] text-slate-500">
                            @{signedInUser.username}
                          </p>
                        ) : null}
                        {signedInUser?.email ? (
                          <p className="mt-1 truncate text-[11px] text-slate-500">{signedInUser.email}</p>
                        ) : null}
                      </div>
                      <div className="py-1">
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-semibold text-slate-800 transition hover:bg-teal-50/80"
                          onClick={() => {
                            setUserMenuOpen(false);
                            navigate('/settings/profile');
                          }}
                        >
                          <User size={16} className="shrink-0 text-gray-400" aria-hidden />
                          Profile & preferences
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-semibold text-slate-800 transition hover:bg-teal-50/80"
                          onClick={() => {
                            setUserMenuOpen(false);
                            navigate('/settings');
                          }}
                        >
                          <SettingsIcon size={16} className="shrink-0 text-gray-400" aria-hidden />
                          All settings
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-semibold text-slate-800 transition hover:bg-teal-50/80"
                          onClick={() => {
                            setUserMenuOpen(false);
                            navigate('/settings/security');
                          }}
                        >
                          <Lock size={16} className="shrink-0 text-gray-400" aria-hidden />
                          Password & security
                        </button>
                      </div>
                      <div className="border-t border-gray-100 py-1">
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-semibold text-red-700 transition hover:bg-red-50/80"
                          onClick={async () => {
                            setUserMenuOpen(false);
                            if (!window.confirm('Sign out of this workspace?')) return;
                            try {
                              await ws?.logout?.();
                              window.location.href = '/';
                            } catch {
                              window.location.href = '/';
                            }
                          }}
                        >
                          <LogOut size={16} className="shrink-0" aria-hidden />
                          Sign out
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <main id="main-content" className="min-w-0 max-w-full outline-none" tabIndex={-1}>
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
              path="/procurement/transport-agents/:agentId"
              element={
                <ModuleRouteGuard moduleKey="procurement">
                  <TransportAgentProfile />
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
            <Route path="/deliveries" element={<Navigate to="/operations" replace />} />
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
            <Route path="/accounting/*" element={<Navigate to="/accounts" replace />} />
            <Route
              path="/reports"
              element={
                <ModuleRouteGuard moduleKey="reports">
                  <Reports />
                </ModuleRouteGuard>
              }
            />
            <Route
              path="/office"
              element={
                <ModuleRouteGuard moduleKey="office">
                  <OfficeDesk />
                </ModuleRouteGuard>
              }
            />
            <Route
              path="/edit-approvals"
              element={
                <ModuleRouteGuard moduleKey="edit_approvals">
                  <EditApprovalsPage />
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
            <Route path="/hr/*" element={<Navigate to="/" replace />} />
            <Route path="/hr-next/*" element={<Navigate to="/" replace />} />
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

  // Anonymous bootstrap returns status "ok" with session.authenticated false — still show login, not AppShell.
  if (
    ws.authRequired ||
    (ws.status === 'offline' && !ws.snapshot) ||
    ((ws.status === 'ok' || ws.status === 'degraded') && !ws.session?.authenticated)
  ) {
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
          <AiAssistantProvider>
            <DocumentTitleSync />
            <AuthGate />
          </AiAssistantProvider>
        </ToastProvider>
      </WorkspaceProvider>
    </Router>
  );
}

export default App;
