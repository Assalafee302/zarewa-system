import React, { useState } from 'react';
import { 
  Box, Scissors, Search, Plus, Truck, CheckCircle2, 
  AlertTriangle, TrendingUp, MoreVertical, Clock, 
  Layers, Package, DownloadCloud
} from 'lucide-react';

const Operations = () => {
  const [activeTab, setActiveTab] = useState('inventory'); // inventory or production

  // Mock Data for Operations
  const inventoryStats = {
    totalCoils: 124,
    onTransit: 12,
    lowStock: 5,
    bestPerforming: { gauge: "0.45mm", color: "HM Blue" }
  };

  const pendingProduction = [
    { id: 'CL-2026-005', customer: 'Alhaji Musa', spec: '0.45mm Blue', quantity: '450m', priority: 'High' },
    { id: 'CL-2026-009', customer: 'Sani Global', spec: '0.55mm Black', quantity: '1,200m', priority: 'Normal' },
  ];

  return (
    <div className="animate-in fade-in duration-500">
      {/* --- HEADER & SUB-NAV --- */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#134e4a] tracking-tight">Operations</h1>
          <p className="text-gray-500 font-medium text-sm mt-1 uppercase tracking-widest">Inventory Control & Production Mill</p>
        </div>
        
        <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'inventory' ? 'bg-[#134e4a] text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            <Box size={16} /> Stock Management
          </button>
          <button 
            onClick={() => setActiveTab('production')}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'production' ? 'bg-[#134e4a] text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            <Scissors size={16} /> Production Line
          </button>
        </div>
      </div>

      {/* --- TOP ANALYTICS BAR (Store Keeper View) --- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-zarewa border border-gray-100 shadow-sm">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Available</p>
          <div className="flex justify-between items-end">
            <h3 className="text-2xl font-black text-[#134e4a]">{inventoryStats.totalCoils} <span className="text-xs font-medium text-gray-400">Coils</span></h3>
            <Package className="text-teal-100" size={32} />
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-zarewa border border-gray-100 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">High Conversion Alert</p>
          <div className="flex justify-between items-end text-emerald-600">
            <h3 className="text-lg font-black tracking-tight">88% Efficiency</h3>
            <TrendingUp size={24} />
          </div>
          <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 w-[88%]"></div>
        </div>

        <div className="bg-white p-5 rounded-zarewa border border-orange-100 shadow-sm">
          <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-1">Low Stock Warning</p>
          <div className="flex justify-between items-end text-orange-600">
            <h3 className="text-2xl font-black">{inventoryStats.lowStock}</h3>
            <AlertTriangle size={24} />
          </div>
        </div>

        <div className="bg-[#134e4a] p-5 rounded-zarewa shadow-xl text-white">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Best Performing Gauge</p>
          <h3 className="text-lg font-bold text-zarewa-mint">{inventoryStats.bestPerforming.gauge}</h3>
          <p className="text-[10px] text-white/60">{inventoryStats.bestPerforming.color}</p>
        </div>
      </div>

      {/* --- ACTION BAR --- */}
      <div className="flex flex-wrap gap-4 mb-8">
        <button className="flex items-center gap-2 bg-[#134e4a] text-white px-5 py-3 rounded-xl font-bold text-xs shadow-lg hover:brightness-110 transition-all">
          <DownloadCloud size={16} /> Request New Stock
        </button>
        <button className="flex items-center gap-2 bg-white border border-gray-100 text-[#134e4a] px-5 py-3 rounded-xl font-bold text-xs shadow-sm hover:bg-gray-50 transition-all">
          <Truck size={16} /> Accept Goods on Transit ({inventoryStats.onTransit})
        </button>
        {activeTab === 'production' && (
          <button className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-xl font-bold text-xs shadow-lg hover:brightness-110 transition-all ml-auto">
            <Plus size={16} /> Production Entry
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* --- MAIN CONTENT AREA --- */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-8 min-h-[500px]">
            <h2 className="text-xl font-bold text-[#134e4a] mb-6 capitalize">{activeTab} Records</h2>
            
            <div className="space-y-4">
              {activeTab === 'production' ? (
                // PRODUCTION VIEW
                pendingProduction.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 items-center px-6 py-4 bg-gray-50/50 rounded-2xl border border-transparent hover:border-teal-100 transition-all group">
                    <div className="col-span-2 text-xs font-bold text-[#134e4a]">{item.id}</div>
                    <div className="col-span-3 text-sm font-bold text-gray-700">{item.customer}</div>
                    <div className="col-span-3 text-xs text-gray-500">{item.spec}</div>
                    <div className="col-span-2 text-xs font-black text-[#134e4a]">{item.quantity}</div>
                    <div className="col-span-2 flex justify-end items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${item.priority === 'High' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                        {item.priority}
                      </span>
                      <button className="text-gray-300 hover:text-[#134e4a] p-1"><MoreVertical size={16} /></button>
                    </div>
                  </div>
                ))
              ) : (
                // INVENTORY VIEW
                <div className="text-center py-20 text-gray-400">
                  <Box size={40} className="mx-auto mb-4 opacity-20" />
                  <p className="text-xs font-bold uppercase tracking-widest">Select a coil to view conversion history</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* --- SIDEBAR: RECENT ACTIVITY & SCRAP --- */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-zarewa shadow-sm border border-gray-100">
            <h3 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4">Scrap Log (Iron/Steel)</h3>
            <div className="space-y-4">
               <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                 <p className="text-[10px] font-bold text-red-800 uppercase">Current Off-cuts</p>
                 <h4 className="text-lg font-black text-red-900">1,240 <span className="text-[10px]">kg</span></h4>
               </div>
               <p className="text-[10px] text-gray-400 leading-relaxed italic">
                 *Prices for heavy melting steel usually hike during seasonal shutdowns. Monitor for optimal disposal.
               </p>
            </div>
          </div>

          <div className="bg-[#134e4a] p-6 rounded-zarewa text-white">
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">On Transit</h3>
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="flex gap-3 items-start border-b border-white/10 pb-3">
                  <Truck size={14} className="text-zarewa-mint mt-1" />
                  <div>
                    <p className="text-[11px] font-bold">COIL-TR-99{i}</p>
                    <p className="text-[9px] text-white/40">Expected in 2 days</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Operations;