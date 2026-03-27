import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  ShoppingCart, 
  LogOut, 
  Landmark,
  LayoutGrid,
  Truck,
  Zap
} from 'lucide-react';

const Sidebar = () => {
  const location = useLocation();
  
  const menuItems = [
    { icon: <Home size={18}/>, label: 'Dashboard', path: '/' },
    { icon: <ShoppingCart size={18}/>, label: 'Sales', path: '/sales' },
    { icon: <Truck size={18}/>, label: 'Procurement', path: '/procurement' },
    { icon: <LayoutGrid size={18}/>, label: 'Operations', path: '/operations' },
    { icon: <Landmark size={18}/>, label: 'Finance & Accounts', path: '/accounts' },
  ];

  return (
    /* Change 1: Deep Teal Background & Fixed width */
    <div className="fixed left-0 top-0 w-64 h-screen bg-[#134e4a] text-white flex flex-col p-6 z-50 border-r border-white/5">
      
      {/* BRANDING: Now using the Mint accent */}
      <div className="flex items-center gap-3 mb-10 px-2">
        <div className="w-9 h-9 bg-[#2dd4bf] rounded-xl flex items-center justify-center text-[#134e4a] shadow-lg shadow-teal-950/40">
          <Zap size={20} fill="currentColor" />
        </div>
        <span className="font-black text-white text-xl tracking-tighter uppercase italic">Zarewa</span>
      </div>

      {/* NAVIGATION: High-density spacing and typography */}
      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link 
              key={item.path}
              to={item.path} 
              className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 group ${
                isActive 
                ? 'bg-white/10 text-[#2dd4bf] shadow-inner' 
                : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
                {item.icon}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.15em]">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* FOOTER: Market/System Health indicator (Very 'Sequence' Style) */}
      <div className="mb-6 p-4 bg-black/20 rounded-2xl border border-white/5">
        <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">System Status</p>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#2dd4bf] animate-pulse" />
          <span className="text-[10px] font-bold text-white/70">Local DB Sync Active</span>
        </div>
      </div>

      {/* LOGOUT: Cleaner, muted style */}
      <button className="flex items-center gap-4 px-4 py-3 text-white/30 hover:text-red-400 transition-colors border-t border-white/5 pt-6">
        <LogOut size={18} />
        <span className="text-[11px] font-bold uppercase tracking-widest">Logout</span>
      </button>
    </div>
  );
};

export default Sidebar;