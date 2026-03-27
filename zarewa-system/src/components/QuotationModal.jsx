import React from 'react';
import { 
  X, Search, Plus, Trash2, Printer, 
  ChevronDown, Save, Calendar, Edit3
} from 'lucide-react';

const QuotationModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  // --- DATA SOURCES ---
  const customers = ["Alhaji Musa", "Grace Emmanuel", "Bello Ibrahim", "Zaidu Roofing", "Kashim Shettima"];
  const designs = ["Longspan (Indus6)", "Metrotile", "Steptile", "Capping", "Ridge Cap"];
  const gauges = ["0.70mm", "0.55mm", "0.45mm", "0.40mm", "0.30mm", "0.24mm"];
  const colors = ["HM Blue", "Traffic Black", "TC Red", "Bush Green", "Zinc Grey"];
  
  const productList = ["Roofing Sheet", "Capping", "Ridge Cap", "Gutter"];
  const accessoryList = ["Tapping Screw", "Silicon Tube", "Rivets", "Bitumen Tap"];
  const serviceList = ["Installation", "Transportation", "Labor Charge"];

  // --- SUB-COMPONENT FOR REUSABLE SECTIONS ---
  const OrderSection = ({ title, letter, items }) => (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#134e4a] text-white rounded-lg flex items-center justify-center font-black text-xs shadow-lg">
            {letter}
          </div>
          <h3 className="text-[11px] font-black text-[#134e4a] uppercase tracking-[0.2em]">{title}</h3>
        </div>
        <button className="text-[10px] font-black text-teal-600 uppercase flex items-center gap-1.5 hover:bg-teal-50 px-3 py-1.5 rounded-lg transition-all">
          <Plus size={14}/> Add {title.slice(0, -1)}
        </button>
      </div>

      <div className="bg-gray-50/50 rounded-[2rem] p-6 border border-gray-100">
        <div className="grid grid-cols-12 gap-4 items-center mb-3 px-2 text-[9px] font-black text-gray-400 uppercase tracking-widest">
          <div className="col-span-5">Select Item</div>
          <div className="col-span-2 text-center">Quantity</div>
          <div className="col-span-2 text-center">Unit Price</div>
          <div className="col-span-2 text-right pr-4">Amount</div>
          <div className="col-span-1"></div>
        </div>

        {/* Row Template */}
        <div className="grid grid-cols-12 gap-4 items-center mb-3 group">
          <div className="col-span-5 relative">
            <select className="w-full bg-white border border-gray-100 rounded-xl py-3 px-4 text-xs font-bold text-[#134e4a] appearance-none outline-none focus:ring-2 focus:ring-teal-500/20 transition-all cursor-pointer">
              <option value="">Choose from {title} list...</option>
              {items.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
          </div>
          <input type="number" placeholder="0" className="col-span-2 bg-white border border-gray-100 p-3 rounded-xl text-xs text-center font-bold text-[#134e4a] outline-none" />
          <input type="number" placeholder="₦ 0.00" className="col-span-2 bg-white border border-gray-100 p-3 rounded-xl text-xs text-center font-bold text-[#134e4a] outline-none" />
          <div className="col-span-2 text-right pr-4 text-xs font-black text-[#134e4a]">₦ 0.00</div>
          <button className="col-span-1 flex justify-center text-gray-200 hover:text-red-500 transition-colors">
            <Trash2 size={16}/>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#134e4a]/60 backdrop-blur-md" onClick={onClose}></div>
      
      <div className="relative bg-white w-full max-w-6xl max-h-[94vh] overflow-hidden rounded-[3.5rem] shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
        
        {/* HEADER */}
        <div className="px-10 py-8 border-b border-gray-50 flex justify-between items-center shrink-0">
           <div className="flex items-center gap-6">
             <div className="w-14 h-14 bg-[#134e4a] rounded-2xl flex items-center justify-center text-white font-black text-2xl">Z</div>
             <div>
               <h2 className="text-xl font-black text-[#134e4a] uppercase tracking-tight">Quotation System</h2>
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.4em]">Internal Order Draft</p>
             </div>
           </div>
           <button onClick={onClose} className="p-4 bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-2xl transition-all">
             <X size={24} />
           </button>
        </div>

        {/* FORM BODY */}
        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
          
          {/* GENERAL DETAILS CONTAINER */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 bg-gray-50/30 p-8 rounded-[2.5rem] border border-gray-50">
            
            {/* 1. CUSTOMER SELECTION */}
            <div className="relative">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-2 block">Customer Name</label>
              <select className="w-full bg-white border border-gray-100 rounded-2xl py-4 px-5 font-bold text-[#134e4a] appearance-none outline-none focus:ring-2 focus:ring-teal-500/10 cursor-pointer">
                <option value="">Select Customer Record...</option>
                {customers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <Search size={16} className="absolute right-5 bottom-4 text-gray-300 pointer-events-none" />
            </div>

            {/* 2. GAUGE SELECTION */}
            <div className="relative">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-2 block">Material Gauge</label>
              <select className="w-full bg-white border border-gray-100 rounded-2xl py-4 px-5 font-bold text-[#134e4a] appearance-none outline-none focus:ring-2 focus:ring-teal-500/10 cursor-pointer">
                <option value="">Select Gauge...</option>
                {gauges.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-5 bottom-4 text-gray-300 pointer-events-none" />
            </div>

            {/* 3. COLOR SELECTION */}
            <div className="relative">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-2 block">Finish Color</label>
              <select className="w-full bg-white border border-gray-100 rounded-2xl py-4 px-5 font-bold text-[#134e4a] appearance-none outline-none focus:ring-2 focus:ring-teal-500/10 cursor-pointer">
                <option value="">Select Color...</option>
                {colors.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-5 bottom-4 text-gray-300 pointer-events-none" />
            </div>

            {/* 4. DESIGN SELECTION */}
            <div className="relative">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-2 block">Profile Design</label>
              <select className="w-full bg-white border border-gray-100 rounded-2xl py-4 px-5 font-bold text-[#134e4a] appearance-none outline-none focus:ring-2 focus:ring-teal-500/10 cursor-pointer">
                <option value="">Select Design...</option>
                {designs.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-5 bottom-4 text-gray-300 pointer-events-none" />
            </div>

            {/* 5. PROJECT NAME (MANUAL) */}
            <div className="relative">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-2 block">Project Name</label>
              <input type="text" placeholder="Enter Project Title..." className="w-full bg-white border border-gray-100 rounded-2xl py-4 px-5 font-bold text-[#134e4a] outline-none focus:ring-2 focus:ring-teal-500/10" />
              <Edit3 size={16} className="absolute right-5 bottom-4 text-gray-300 pointer-events-none" />
            </div>

            {/* 6. DATE SELECTION */}
            <div className="relative">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-2 block">Quotation Date</label>
              <input type="date" className="w-full bg-white border border-gray-100 rounded-2xl py-4 px-5 font-bold text-[#134e4a] outline-none focus:ring-2 focus:ring-teal-500/10 cursor-pointer" />
              <Calendar size={16} className="absolute right-5 bottom-4 text-gray-300 pointer-events-none" />
            </div>
          </div>

          {/* ORDER DETAILS CONTAINERS */}
          <OrderSection title="Products" letter="1" items={productList} />
          <OrderSection title="Accessories" letter="2" items={accessoryList} />
          <OrderSection title="Services" letter="3" items={serviceList} />

        </div>

        {/* FOOTER */}
        <div className="px-10 py-8 bg-[#134e4a] flex justify-between items-center text-white shrink-0">
           <div>
             <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Total Payable</p>
             <p className="text-4xl font-black text-white tracking-tighter">₦ 0.00</p>
           </div>
           <div className="flex gap-4">
             <button className="bg-white/10 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/10 hover:bg-white/20 transition-all">
               <Save size={18} className="inline mr-2" /> Save Draft
             </button>
             <button className="bg-white text-[#134e4a] px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all flex items-center gap-2">
               <Printer size={18} /> Print Quotation
             </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default QuotationModal;