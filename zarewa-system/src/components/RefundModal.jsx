import React from 'react';
import { 
  X, RotateCcw, FileText, Hash, 
  AlertTriangle, DollarSign, Save, ChevronRight 
} from 'lucide-react';

const RefundModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const refundReasons = [
    "Overpayment by Customer",
    "Short Supply (Items not delivered)",
    "Price Adjustment",
    "Order Cancellation"
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#0f172a]/70 backdrop-blur-md" onClick={onClose}></div>
      
      {/* Main Modal Panel */}
      <div className="relative bg-white w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-[3.5rem] shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
        
        {/* HEADER */}
        <div className="px-10 py-8 border-b border-gray-50 flex justify-between items-center bg-white shrink-0">
           <div className="flex items-center gap-6">
             <div className="w-14 h-14 bg-red-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-red-900/20">
               <RotateCcw size={28} />
             </div>
             <div>
               <h2 className="text-xl font-black text-[#134e4a] uppercase tracking-tight">Refund Request</h2>
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.4em]">Financial Reversal & Credit</p>
             </div>
           </div>
           <button onClick={onClose} className="p-4 bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-2xl transition-all">
             <X size={24} />
           </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            
            {/* LEFT: REFERENCE SECTION */}
            <div className="space-y-8">
              <section>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-3 block">Link Original Transaction</label>
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Search Receipt or QT Number..." 
                    className="w-full bg-gray-50 border-none rounded-2xl py-4 px-5 font-bold text-[#134e4a] outline-none focus:ring-2 focus:ring-red-500/10"
                  />
                  <Hash size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300" />
                </div>
              </section>

              <section>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-3 block">Reason for Refund</label>
                <div className="grid grid-cols-1 gap-3">
                  {refundReasons.map((reason) => (
                    <button 
                      key={reason}
                      className="text-left px-5 py-4 rounded-2xl border border-gray-100 hover:border-red-200 hover:bg-red-50/30 text-xs font-bold text-[#134e4a] transition-all flex items-center justify-between group"
                    >
                      {reason}
                      <ChevronRight size={14} className="text-gray-300 group-hover:text-red-500" />
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* RIGHT: CALCULATION SECTION */}
            <div className="space-y-8">
              <div className="bg-[#134e4a] p-8 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden">
                <div className="relative z-10">
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-6">Refund Calculation</p>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-white/60">Original Amount:</span>
                      <span className="text-sm font-bold">₦0.00</span>
                    </div>
                    <div className="flex justify-between items-center text-red-300">
                      <span className="text-xs">Refund Amount:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-black">- ₦</span>
                        <input 
                          type="number" 
                          className="bg-transparent border-b border-red-300/30 w-24 text-right outline-none font-black text-sm"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="h-px bg-white/10 my-2"></div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-white/60">Balance After:</span>
                      <span className="text-sm font-bold uppercase tracking-widest text-emerald-400">₦0.00</span>
                    </div>
                  </div>
                </div>
                {/* Decorative Icon Background */}
                <DollarSign size={120} className="absolute -bottom-8 -right-8 text-white/5 rotate-12" />
              </div>

              <section>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2 mb-3 block">Additional Notes</label>
                <textarea 
                  rows="4"
                  placeholder="Explain the reason for refund (e.g. Alhaji Musa paid twice by mistake...)"
                  className="w-full bg-gray-50 border-none rounded-2xl py-4 px-5 text-xs font-medium text-[#134e4a] outline-none focus:ring-2 focus:ring-red-500/10 resize-none"
                ></textarea>
              </section>
            </div>

          </div>
        </div>

        {/* FOOTER */}
        <div className="px-10 py-8 bg-white border-t border-gray-50 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3 text-orange-600">
            <AlertTriangle size={18} />
            <p className="text-[9px] font-black uppercase tracking-widest">Requires Manager Approval</p>
          </div>
          <div className="flex gap-4">
            <button 
              className="bg-red-600 text-white px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-900/20 hover:scale-105 transition-all flex items-center gap-3"
            >
              <Save size={18} /> Submit Request
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RefundModal;