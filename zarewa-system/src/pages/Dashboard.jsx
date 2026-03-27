import React from 'react';
import { 
  Zap, PlusCircle, FileText, Scissors, UserPlus, 
  AlertTriangle, TrendingUp, Receipt, ArrowUpRight,
  PackageCheck, PackageX, Activity, BarChart3
} from 'lucide-react';

const Dashboard = () => {
  const stockAlerts = [
    { id: 1, item: "Aluminium 0.45mm (Blue)", status: "Low Stock", weight: "120kg" },
    { id: 2, item: "Aluzinc 0.28mm (Red)", status: "Out of Stock", weight: "0kg" },
  ];

  const priceList = [
    { gauge: "0.45mm", material: "Aluminium", price: "₦4,500/m" },
    { gauge: "0.55mm", material: "Aluminium", price: "₦5,200/m" },
    { gauge: "0.28mm", material: "Aluzinc", price: "₦3,100/m" },
  ];

  return (
    <div className="animate-in fade-in duration-700">
      
      {/* --- PAGE HEADER --- */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#134e4a] tracking-tight">System Overview</h1>
        <p className="text-gray-500 font-medium text-sm mt-1 uppercase tracking-widest">Real-time Production & Inventory Control</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* --- LEFT SIDEBAR: QUICK ACTIONS & MARKET --- */}
        <aside className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-zarewa shadow-sm border border-gray-100">
            <h3 className="text-[10px] font-black text-[#134e4a] uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <Zap size={14} className="text-zarewa-mint fill-zarewa-mint" /> Command Center
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <button className="flex items-center gap-3 bg-[#134e4a] text-white p-4 rounded-xl shadow-lg shadow-teal-900/10 hover:scale-[1.02] transition-all group">
                <PlusCircle size={18} className="text-zarewa-mint group-hover:rotate-90 transition-transform" />
                <span className="font-bold text-[11px] uppercase tracking-wider">New Quote</span>
              </button>
              <button className="flex items-center gap-3 bg-gray-50 text-[#134e4a] p-4 rounded-xl border border-gray-100 hover:bg-white hover:shadow-md transition-all">
                <FileText size={18} className="text-blue-500" />
                <span className="font-bold text-[11px] uppercase">Print Receipt</span>
              </button>
              <button className="flex items-center gap-3 bg-gray-50 text-[#134e4a] p-4 rounded-xl border border-gray-100 hover:bg-white hover:shadow-md transition-all">
                <Scissors size={18} className="text-orange-500" />
                <span className="font-bold text-[11px] uppercase">Cutting List</span>
              </button>
              <button className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 hover:bg-red-100 transition-all">
                <Receipt size={18} className="text-red-600" />
                <span className="font-bold text-[11px] uppercase">Expense Req.</span>
              </button>
            </div>
          </div>

          {/* MARKET INTEL - Contextual to your machinery */}
          <div className="p-6 bg-blue-50/50 rounded-zarewa border border-blue-100/50">
            <div className="flex items-center gap-2 mb-3">
               <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
               <p className="text-[10px] font-bold text-blue-800 uppercase tracking-widest">Market Intel</p>
            </div>
            <p className="text-[11px] text-blue-600/80 leading-relaxed font-bold italic">
              Heavy Melting Steel prices are fluctuating. Hold XB-828 disposal for better scrap yield.
            </p>
          </div>
        </aside>

        {/* --- CENTER/RIGHT: MAIN ANALYTICS --- */}
        <div className="lg:col-span-3 space-y-8">
          
          {/* PRODUCTION PERFORMANCE CARD */}
          <section className="bg-white p-8 rounded-zarewa shadow-sm border border-gray-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <BarChart3 size={120} />
            </div>
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3 text-[#134e4a]">
                <Activity size={20} />
                <h3 className="text-lg font-black uppercase tracking-tighter">Production Metrics</h3>
              </div>
              <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-4 py-1.5 rounded-full flex items-center gap-1 border border-emerald-100">
                <TrendingUp size={14} /> +12.4% MONTHLY GROWTH
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: 'Meters Sold', val: '4,250m', color: 'text-[#134e4a]' },
                { label: 'Total Output', val: '3,980m', color: 'text-blue-600' },
                { label: 'Active Jobs', val: '14', color: 'text-orange-500' }
              ].map((stat, i) => (
                <div key={stat.label} className="p-6 bg-gray-50/50 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{stat.label}</p>
                  <p className={`text-3xl font-black italic tracking-tighter ${stat.color}`}>{stat.val}</p>
                </div>
              ))}
            </div>
          </section>

          {/* STOCK DYNAMICS & PRICE LIST */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* INVENTORY TRACKER */}
            <div className="bg-white p-8 rounded-zarewa shadow-sm border border-gray-100">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6">Inventory Health</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                  <div className="flex items-center gap-3">
                    <PackageCheck className="text-emerald-600" size={18}/>
                    <span className="text-xs font-bold text-[#134e4a]">Alu 0.45mm (Fast)</span>
                  </div>
                  <span className="text-xs font-black text-emerald-700">1,200m Sold</span>
                </div>
                <div className="flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100">
                  <div className="flex items-center gap-3">
                    <PackageX className="text-red-500" size={18}/>
                    <span className="text-xs font-bold text-red-900">Aluzinc 0.70mm</span>
                  </div>
                  <span className="text-[9px] font-black bg-red-100 px-2 py-0.5 rounded text-red-600">STAGNANT</span>
                </div>
              </div>
              
              <div className="mt-8 pt-6 border-t border-gray-50">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-4 tracking-widest flex items-center gap-2">
                  <AlertTriangle size={12} className="text-orange-500"/> Critical Alerts
                </h4>
                {stockAlerts.map(alert => (
                  <div key={alert.id} className="flex justify-between items-center mb-3">
                    <p className="text-[11px] font-bold text-gray-700">{alert.item}</p>
                    <p className="text-[10px] font-black text-orange-600 uppercase">{alert.weight}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* LIVE PRICE LIST (Zarewa Dark Mode Style) */}
            <div className="bg-[#134e4a] p-8 rounded-zarewa text-white shadow-xl shadow-teal-900/20">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zarewa-mint">Daily Spot Prices</h3>
                <button className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all"><ArrowUpRight size={14}/></button>
              </div>
              <div className="space-y-5">
                {priceList.map((p, i) => (
                  <div key={i} className="flex justify-between items-end border-b border-white/10 pb-4">
                    <div>
                      <p className="text-[9px] font-bold text-white/40 uppercase mb-1">{p.material}</p>
                      <p className="font-bold text-sm tracking-tight">{p.gauge}</p>
                    </div>
                    <p className="font-black text-zarewa-mint italic">₦{p.price.split('₦')[1]}</p>
                  </div>
                ))}
              </div>
              <button className="w-full mt-8 py-3.5 bg-zarewa-mint text-[#134e4a] rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-teal-900/40 hover:brightness-110 transition-all">
                Update Price Table
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;