import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import Procurement from './pages/Procurement'; 
import Operations from './pages/Operations'; 
import Account from './pages/Account';
import { Search, Bell, Command } from 'lucide-react';

function App() {
  return (
    <Router>
      {/* Change: Background is a cleaner Slate for better contrast with White cards */}
      <div className="flex min-h-screen w-full bg-[#F8FAFC] font-sans selection:bg-teal-100">
        
        <Sidebar />
        
        {/* Main Content Area: ml-64 accounts for the fixed Sidebar */}
        <div className="flex-1 ml-64 p-10 min-w-0">
          
          {/* --- ENHANCED TOP BAR --- */}
          <div className="flex justify-between items-center mb-12">
            
            {/* Search with 'Command' shortcut aesthetic */}
            <div className="relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-[#134e4a] transition-colors" size={16} />
              <input 
                type="text" 
                placeholder="Search resources, coils, or invoices..." 
                className="w-[450px] bg-white rounded-zarewa py-3.5 pl-13 pr-12 shadow-sm border border-gray-100 outline-none focus:ring-4 focus:ring-teal-500/5 focus:border-teal-500/20 text-[13px] font-medium transition-all"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 bg-gray-50 border border-gray-100 rounded-lg">
                <Command size={10} className="text-gray-400" />
                <span className="text-[9px] font-black text-gray-400">K</span>
              </div>
            </div>
            
            {/* Actions & Profile */}
            <div className="flex gap-6 items-center">
              {/* Notifications */}
              <button className="relative p-3 bg-white rounded-2xl shadow-sm border border-gray-100 hover:bg-gray-50 transition-all active:scale-95 group">
                <Bell size={18} className="text-gray-400 group-hover:text-[#134e4a]" />
                <span className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
              </button>

              {/* Profile Chip: Professional Industrial Style */}
              <div className="flex items-center gap-4 bg-white p-1.5 pr-5 rounded-zarewa shadow-sm border border-gray-100">
                <div className="w-9 h-9 bg-[#134e4a] rounded-xl flex items-center justify-center text-[#2dd4bf] font-black text-xs shadow-inner">
                  ZA
                </div>
                <div>
                  <p className="text-[10px] font-black text-[#134e4a] uppercase tracking-tighter leading-none mb-0.5">Zarewa Admin</p>
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none">Superuser</p>
                </div>
              </div>
            </div>
          </div>

          {/* --- ROUTE VIEW CONTAINER --- */}
          {/* Using a wrapper to ensure smooth transitions between pages */}
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/procurement" element={<Procurement />} />
              <Route path="/operations" element={<Operations />} />
              <Route path="/accounts" element={<Account />} />
            </Routes>
          </div>

        </div>
      </div>
    </Router>
  );
}

export default App;