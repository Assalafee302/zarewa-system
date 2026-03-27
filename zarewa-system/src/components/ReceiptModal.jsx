import React from 'react';
import { 
  X, Search, Plus, Trash2, Printer, 
  ChevronDown, Save, Landmark
} from 'lucide-react';

const ReceiptModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  // --- DATA SOURCES ---
  const paymentMethods = ["Cash", "Bank Transfer", "POS", "Cheque"];
  const bankAccounts = ["Zenith Bank (1234)", "GTBank (5678)", "UBA (9012)", "Access Bank (4432)"];
  const activeQuotations = ["QT-2026-001", "QT-2026-002", "QT-2026-005"];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#134e4a]/60 backdrop-blur-md" onClick={onClose}></div>
      
      {/* Main Modal Panel */}
      <div className="relative bg-white w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-[3.5rem] shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
        
        {/* HEADER */}
        <div className="px-10 py-6 border-b border-gray-50 flex justify-between items-center bg-white shrink-0">
           <div className="flex items-center gap-6">
             <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-emerald-900/20">R</div>
             <div>
               <h2 className="text-xl font-black text-[#134e4a] uppercase tracking-tight">Payment Receipt</h2>
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.4em]">Transaction Voucher</p>
             </div>
           </div>
           <button onClick={onClose} className="p-4 bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-2xl transition-all">
             <X size={24} />
           </button>
        </div>

        {/* BODY: SPLIT VIEW */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-white">
          
          {/* LEFT SIDE: FORM ENTRY (70%) */}
          <div className="flex-1 overflow-y-auto p-10 custom-scrollbar border-r border-gray-50">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              {/* Payer Name */}
              <div className="relative">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-2 block">Received From (Payer)</label>
                <input type="text" placeholder="Enter Full Name..." className="w-full bg-gray-50 border-none rounded-2xl py-4 px-5 font-bold text-[#134e4a] outline-none focus:ring-2 focus:ring-emerald-500/10" />
              </div>

              {/* General Voucher Date */}
              <div className="relative">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-2 block">Voucher Date</label>
                <input type="date" className="w-full bg-gray-50 border-none rounded-2xl py-4 px-5 font-bold text-[#134e4a] outline-none focus:ring-2 focus:ring-emerald-500/10 cursor-pointer" />
              </div>

              {/* Linked Quotation */}
              <div className="relative">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-2 block">Link to Quotation (Optional)</label>
                <select className="w-full bg-emerald-50/50 border-none rounded-2xl py-4 px-5 font-bold text-[#134e4a] appearance-none outline-none focus:ring-2 focus:ring-emerald-500/10 cursor-pointer">
                  <option value="">No Quotation (Advance Payment)</option>
                  {activeQuotations.map(qt => <option key={qt} value={qt}>{qt}</option>)}
                </select>
                <Search size={16} className="absolute right-5 bottom-4 text-emerald-300 pointer-events-none" />
              </div>

              {/* Transaction Ref */}
              <div className="relative">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-2 block">Reference / Remarks</label>
                <input type="text" placeholder="e.g. Part payment for roofing" className="w-full bg-gray-50 border-none rounded-2xl py-4 px-5 font-bold text-[#134e4a] outline-none focus:ring-2 focus:ring-emerald-500/10" />
              </div>
            </div>

            {/* PAYMENT TABLE */}
            <div className="mb-4 flex items-center justify-between px-2">
              <h3 className="text-[11px] font-black text-[#134e4a] uppercase tracking-widest">Payment Breakdown</h3>
              <button className="text-[10px] font-black text-emerald-600 uppercase flex items-center gap-1.5 hover:opacity-70">
                <Plus size={14}/> Add Payment Row
              </button>
            </div>

            <div className="space-y-3">
              {/* Header for Table Rows */}
              <div className="grid grid-cols-12 gap-4 px-6 text-[9px] font-black text-gray-400 uppercase tracking-tighter">
                <div className="col-span-3">Method</div>
                <div className="col-span-3">Bank/Account</div>
                <div className="col-span-3">Payment Date</div>
                <div className="col-span-2 text-center">Amount</div>
                <div className="col-span-1"></div>
              </div>

              {/* Row Entry */}
              <div className="grid grid-cols-12 gap-4 items-center bg-gray-50/50 p-4 rounded-[1.5rem] border border-gray-100 hover:border-emerald-200 transition-all group">
                {/* Method Selector */}
                <div className="col-span-3 relative">
                  <select className="w-full bg-white border border-gray-100 rounded-xl py-2.5 px-3 text-xs font-bold text-[#134e4a] appearance-none outline-none focus:ring-2 focus:ring-emerald-500/5">
                    <option value="">Method...</option>
                    {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                </div>
                
                {/* Bank Account Selector */}
                <div className="col-span-3 relative">
                  <select className="w-full bg-white border border-gray-100 rounded-xl py-2.5 px-3 text-xs font-bold text-[#134e4a] appearance-none outline-none focus:ring-2 focus:ring-emerald-500/5">
                    <option value="">Account...</option>
                    {bankAccounts.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <Landmark size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                </div>

                {/* Specific Date for this payment line */}
                <div className="col-span-3">
                  <input 
                    type="date" 
                    className="w-full bg-white border border-gray-100 py-2.5 px-3 rounded-xl text-xs font-bold text-[#134e4a] outline-none focus:ring-2 focus:ring-emerald-500/5 cursor-pointer" 
                  />
                </div>

                {/* Amount Field */}
                <div className="col-span-2">
                  <input 
                    type="number" 
                    placeholder="₦ 0.00" 
                    className="w-full bg-white border border-gray-100 p-2.5 rounded-xl text-xs text-center font-black text-emerald-600 outline-none" 
                  />
                </div>

                {/* Delete Row */}
                <div className="col-span-1 flex justify-center">
                  <button className="text-gray-200 group-hover:text-red-400 transition-colors">
                    <Trash2 size={16}/>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE: QUOTATION SUMMARY (30%) */}
          <div className="w-full md:w-80 bg-gray-50/50 p-8 flex flex-col shrink-0">
             <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
               <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
               Selected Quotation Info
             </h3>

             <div className="space-y-6">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Total Bill</p>
                  <p className="text-xl font-black text-[#134e4a]">₦ 1,450,000</p>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Previous Payments</p>
                  <p className="text-xl font-black text-blue-600">₦ 400,000</p>
                </div>

                <div className="bg-[#134e4a] p-5 rounded-2xl shadow-xl">
                  <p className="text-[9px] font-black text-white/40 uppercase mb-1">Current Balance</p>
                  <p className="text-xl font-black text-zarewa-mint">₦ 1,050,000</p>
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-gray-500">Items:</span>
                    <span className="text-[10px] font-black">Longspan, Screws...</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-500">Gauge:</span>
                    <span className="text-[10px] font-black">0.45mm HM Blue</span>
                  </div>
                </div>
             </div>

             <div className="mt-auto pt-6">
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <p className="text-[9px] leading-relaxed font-bold text-emerald-800">
                    Linking a quotation helps the system calculate debt automatically for the customer.
                  </p>
                </div>
             </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-10 py-8 bg-emerald-600 flex justify-between items-center text-white shrink-0">
           <div>
             <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Total Amount Received</p>
             <p className="text-4xl font-black text-white tracking-tighter">₦ 0.00</p>
           </div>
           <div className="flex gap-4">
             <button className="bg-white/10 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/10 hover:bg-white/20 transition-all">
               <Save size={18} className="inline mr-2" /> Save Log
             </button>
             <button className="bg-white text-emerald-600 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all flex items-center gap-2">
               <Printer size={18} /> Print Official Receipt
             </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;