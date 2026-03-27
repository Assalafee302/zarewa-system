import React from 'react';
import { 
  X, Plus, Trash2, Printer, Hash, Ruler, Scissors, Info
} from 'lucide-react';

const CuttingListModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const activeQuotations = ["QT-2026-001", "QT-2026-002"];
  const profiles = ["Longspan", "Steeltile", "Metcoppo", "PVC"];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#0f172a]/70 backdrop-blur-md" onClick={onClose}></div>
      
      {/* Main Modal Panel */}
      <div className="relative bg-white w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-[3.5rem] shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
        
        {/* HEADER */}
        <div className="px-10 py-6 border-b border-gray-50 flex justify-between items-center bg-white shrink-0">
           <div className="flex items-center gap-6">
             <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-orange-900/20">
               <Scissors size={28} />
             </div>
             <div>
               <h2 className="text-xl font-black text-[#134e4a] uppercase tracking-tight">Production Cutting List</h2>
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.4em]">Sales to Production Order</p>
             </div>
           </div>
           <button onClick={onClose} className="p-4 bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-2xl transition-all">
             <X size={24} />
           </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-white">
          
          {/* LEFT: THE SCHEDULE (75%) */}
          <div className="flex-1 overflow-y-auto p-10 custom-scrollbar border-r border-gray-50">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              <div className="relative">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-2 block">Link Quotation</label>
                <select className="w-full bg-gray-50 border-none rounded-2xl py-4 px-5 font-bold text-[#134e4a] appearance-none outline-none focus:ring-2 focus:ring-orange-500/10">
                  <option value="">Select Customer Order...</option>
                  {activeQuotations.map(q => <option key={q}>{q}</option>)}
                </select>
              </div>

              <div className="relative">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-2 block">Target Machine / Line</label>
                <select className="w-full bg-gray-50 border-none rounded-2xl py-4 px-5 font-bold text-[#134e4a] appearance-none outline-none focus:ring-2 focus:ring-orange-500/10">
                   <option>Machine 01 (Longspan)</option>
                   <option>Machine 02 (Steeltile)</option>
                </select>
              </div>
            </div>

            {/* CUTTING ROWS */}
            <div className="mb-4 flex items-center justify-between px-2">
              <h3 className="text-[11px] font-black text-[#134e4a] uppercase tracking-widest">Required Lengths</h3>
              <button className="text-[10px] font-black text-orange-600 uppercase flex items-center gap-1.5 hover:opacity-70">
                <Plus size={14}/> Add New Length
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-4 px-6 text-[9px] font-black text-gray-400 uppercase tracking-tighter">
                <div className="col-span-1">#</div>
                <div className="col-span-4">No. of Sheets</div>
                <div className="col-span-4">Length per Sheet (M)</div>
                <div className="col-span-2 text-center">Total (M)</div>
                <div className="col-span-1"></div>
              </div>

              {/* Row Entry */}
              {[1, 2].map((i) => (
                <div key={i} className="grid grid-cols-12 gap-4 items-center bg-gray-50 p-4 rounded-2xl border border-gray-100 hover:border-orange-200 transition-all">
                  <div className="col-span-1 flex justify-center text-xs font-black text-gray-300">{i}</div>
                  
                  <div className="col-span-4 relative">
                    <input type="number" placeholder="Quantity" className="w-full bg-white border border-gray-100 rounded-xl py-2.5 px-4 text-xs font-black text-[#134e4a] outline-none" />
                    <Hash size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-200" />
                  </div>

                  <div className="col-span-4 relative">
                    <input type="number" step="0.01" placeholder="Length (e.g 4.5)" className="w-full bg-white border border-gray-100 rounded-xl py-2.5 px-4 text-xs font-black text-[#134e4a] outline-none" />
                    <Ruler size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-200" />
                  </div>

                  <div className="col-span-2 text-center">
                    <span className="text-xs font-black text-orange-600">0.00m</span>
                  </div>

                  <div className="col-span-1 flex justify-center">
                    <button className="text-gray-200 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT SIDE: REFERENCE INFO ONLY (25%) */}
          <div className="w-full md:w-80 bg-gray-50/50 p-8 flex flex-col shrink-0">
             <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
               <Info size={14} className="text-orange-500" /> Job Specification
             </h3>

             <div className="space-y-6">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase mb-3">Ordered Material</p>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-gray-400">Color:</span>
                      <span className="text-[#134e4a]">HM Blue</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-gray-400">Gauge:</span>
                      <span className="text-[#134e4a]">0.45mm</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-gray-400">Profile:</span>
                      <span className="text-[#134e4a]">Longspan</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-orange-50 rounded-2xl border border-orange-100">
                  <p className="text-[9px] leading-relaxed font-bold text-orange-800">
                    Production will assign the specific Coil ID and record the waste once this job is loaded.
                  </p>
                </div>
             </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-10 py-8 bg-[#134e4a] flex justify-between items-center text-white shrink-0">
           <div>
             <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Total Linear Meters</p>
             <p className="text-4xl font-black text-white tracking-tighter">0.00 <span className="text-lg text-white/30 tracking-normal ml-1">M</span></p>
           </div>
           <div className="flex gap-4">
             <button className="bg-white/10 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all">
               Save Draft
             </button>
             <button className="bg-orange-500 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-orange-900/40 hover:scale-105 transition-all flex items-center gap-2">
               <Printer size={18} /> Print Job Card
             </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default CuttingListModal;