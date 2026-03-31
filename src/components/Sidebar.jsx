import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  ShoppingCart,
  LogOut,
  Landmark,
  LayoutGrid,
  Truck,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ZAREWA_LOGO_SRC } from '../Data/companyQuotation';

function pathMatches(locationPath, basePath) {
  if (basePath === '/') return locationPath === '/';
  return locationPath === basePath || locationPath.startsWith(`${basePath}/`);
}

const Sidebar = ({ mobileOpen = false, onCloseMobile, collapsed = false, onToggleCollapsed }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const p = location.pathname;

  const closeIfMobile = () => {
    onCloseMobile?.();
  };

  const linkClass = (active) =>
    `w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 group no-underline ${
      collapsed ? 'lg:justify-center lg:gap-0 lg:px-2 lg:py-3' : ''
    } ${
      active
        ? 'bg-white/10 text-[#2dd4bf] shadow-inner'
        : 'text-white/40 hover:text-white hover:bg-white/5'
    }`;

  const menuItems = [
    { icon: <Home size={18} />, label: 'Dashboard', path: '/' },
    {
      icon: <ShoppingCart size={18} />,
      label: 'Sales',
      path: '/sales',
      active: pathMatches(p, '/sales') || pathMatches(p, '/customers'),
      visible: ws?.canAccessModule?.('sales') ?? true,
    },
    {
      icon: <Truck size={18} />,
      label: 'Purchase',
      path: '/procurement',
      visible: ws?.canAccessModule?.('procurement') ?? true,
    },
    {
      icon: <LayoutGrid size={18} />,
      label: 'Production',
      path: '/operations',
      active: pathMatches(p, '/operations'),
      visible: ws?.canAccessModule?.('operations') ?? true,
    },
    {
      icon: <Landmark size={18} />,
      label: 'Finance',
      path: '/accounts',
      visible: ws?.canAccessModule?.('finance') ?? true,
    },
    {
      icon: <BarChart3 size={18} />,
      label: 'Reports',
      path: '/reports',
      visible: ws?.canAccessModule?.('reports') ?? true,
    },
    {
      icon: <Settings size={18} />,
      label: 'Settings',
      path: '/settings',
      visible: ws?.canAccessModule?.('settings') ?? true,
    },
  ].filter((item) => item.visible !== false);

  return (
    <aside
      className={`fixed left-0 top-0 max-w-[85vw] h-screen bg-[#134e4a] text-white flex flex-col z-[50] lg:z-40 border-r border-white/5 shadow-2xl lg:shadow-none transition-all duration-300 ease-out lg:translate-x-0 w-64 p-6 ${
        collapsed ? 'lg:w-16 lg:max-w-none lg:px-2 lg:py-5 lg:overflow-x-hidden' : 'lg:w-64 lg:max-w-none'
      } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      aria-label="Main navigation"
    >
      <div
        className={`mb-8 flex gap-2 px-2 lg:px-0 ${
          collapsed ? 'lg:mb-6 lg:flex-col lg:items-center lg:gap-3' : 'items-center justify-between'
        }`}
      >
        <div
          className={`flex min-w-0 items-center gap-3 ${collapsed ? 'lg:flex-initial lg:justify-center' : 'flex-1'}`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-0.5 shadow-lg shadow-teal-950/40 ring-1 ring-white/20">
            <img src={ZAREWA_LOGO_SRC} alt="" className="h-full w-full object-contain" width={36} height={36} />
          </div>
          <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
            <p className="font-black text-2xl uppercase leading-none tracking-tight text-white">Zarewa</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/65">
              Aluminium and Plastics Ltd
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggleCollapsed?.()}
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white lg:flex"
          aria-expanded={!collapsed}
          aria-controls="sidebar-nav"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={18} strokeWidth={2} /> : <ChevronLeft size={18} strokeWidth={2} />}
        </button>
      </div>

      <nav
        id="sidebar-nav"
        className="custom-scrollbar -mr-1 flex-1 space-y-1 overflow-y-auto pr-1"
        aria-label="Modules"
      >
        {menuItems.map((item) => {
          const active =
            item.active ??
            (item.path === '/'
              ? p === '/'
              : pathMatches(p, item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={closeIfMobile}
              className={linkClass(active)}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
            >
              <span
                className={`transition-transform duration-300 ${
                  active ? 'scale-110' : 'group-hover:scale-110'
                }`}
              >
                {item.icon}
              </span>
              <span
                className={`text-[11px] font-bold uppercase tracking-[0.15em] ${collapsed ? 'lg:hidden' : ''}`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div
        className={`mb-6 shrink-0 rounded-2xl border border-white/5 bg-black/20 p-4 ${
          collapsed ? 'lg:flex lg:justify-center lg:p-2 lg:mb-4' : ''
        }`}
        title={
          ws?.apiOnline
            ? 'Live database connected'
            : ws?.usingCachedData
              ? 'Showing last sync — read-only until reconnected'
              : 'Offline'
        }
      >
        <p className={`mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ${collapsed ? 'lg:hidden' : ''}`}>
          Mode
        </p>
        <div className={`flex items-center gap-2 ${collapsed ? 'lg:justify-center lg:gap-0' : ''}`}>
          <div
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              ws?.apiOnline ? 'animate-pulse bg-[#2dd4bf]' : ws?.usingCachedData ? 'bg-amber-300' : 'bg-white/30'
            }`}
          />
          <span
            className={`text-[10px] font-bold leading-snug text-white/70 ${collapsed ? 'lg:hidden' : ''}`}
          >
            {ws?.apiOnline
              ? 'Live database connected'
              : ws?.usingCachedData
                ? 'Cached — read-only'
                : 'Offline'}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={async () => {
          if (!window.confirm('Sign out of this workspace?')) return;
          closeIfMobile();
          await ws?.logout?.();
          navigate('/', { replace: true });
        }}
        title="Sign out"
        aria-label="Sign out"
        className={`flex w-full shrink-0 items-center gap-4 rounded-xl border-t border-white/5 px-4 py-3 pt-6 text-left text-white/30 transition-colors hover:bg-white/5 hover:text-red-400 ${
          collapsed ? 'lg:justify-center lg:gap-0 lg:px-2 lg:py-3 lg:pt-4' : ''
        }`}
      >
        <LogOut size={18} className="shrink-0" />
        <span className={`text-[11px] font-bold uppercase tracking-widest ${collapsed ? 'lg:hidden' : ''}`}>
          Sign out
        </span>
      </button>
    </aside>
  );
};

export default Sidebar;
