import React from 'react';
import { Zap, PlusCircle, FileText, Scissors, Banknote, Wallet, Receipt } from 'lucide-react';

export function DashboardQuickActionsPanel({ onSalesAction, onOpenProcurement, onOpenOperations, onExpenseRequest }) {
  return (
    <div className="z-card-muted">
      <h3 className="z-section-title flex items-center gap-2">
        <Zap size={14} className="text-[#134e4a] shrink-0" />
        Quick actions
      </h3>
      <div className="grid grid-cols-1 gap-3">
        <button
          type="button"
          onClick={() => onSalesAction('quotation')}
          className="flex items-center gap-3 bg-[#134e4a] text-white p-4 rounded-xl shadow-sm hover:brightness-[1.03] transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/40 focus-visible:ring-offset-2"
        >
          <PlusCircle size={18} className="text-white/90 group-hover:rotate-90 transition-transform shrink-0" />
          <span className="font-bold text-[11px] uppercase tracking-wider">New quote</span>
        </button>
        <button
          type="button"
          onClick={() => onSalesAction('receipt')}
          className="flex items-center gap-3 bg-gray-50 text-[#134e4a] p-4 rounded-xl border border-gray-100 hover:bg-white hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 focus-visible:ring-offset-2"
        >
          <FileText size={18} className="text-slate-500 shrink-0" />
          <span className="font-bold text-[11px] uppercase text-left">New receipt</span>
        </button>
        <button
          type="button"
          onClick={onOpenProcurement}
          className="flex items-center gap-3 bg-gray-50 text-[#134e4a] p-4 rounded-xl border border-gray-100 hover:bg-white hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 focus-visible:ring-offset-2"
        >
          <Banknote size={18} className="text-slate-500 shrink-0" />
          <span className="font-bold text-[11px] uppercase text-left">New purchase</span>
        </button>
        <button
          type="button"
          onClick={() => onSalesAction('cutting')}
          className="flex items-center gap-3 bg-gray-50 text-[#134e4a] p-4 rounded-xl border border-gray-100 hover:bg-white hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 focus-visible:ring-offset-2"
        >
          <Scissors size={18} className="text-slate-500 shrink-0" />
          <span className="font-bold text-[11px] uppercase text-left">Cutting list</span>
        </button>
        <button
          type="button"
          onClick={onOpenOperations}
          className="flex items-center gap-3 bg-gray-50 text-[#134e4a] p-4 rounded-xl border border-gray-100 hover:bg-white hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 focus-visible:ring-offset-2"
        >
          <Wallet size={18} className="text-slate-500 shrink-0" />
          <span className="font-bold text-[11px] uppercase text-left">Stock / WIP review</span>
        </button>
        <button
          type="button"
          onClick={onExpenseRequest}
          className="flex items-center gap-3 bg-gray-50 text-[#134e4a] p-4 rounded-xl border border-slate-200 hover:bg-white hover:border-slate-300 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 focus-visible:ring-offset-2"
        >
          <Receipt size={18} className="text-slate-500 shrink-0" />
          <span className="font-bold text-[11px] uppercase text-left">Expense request</span>
        </button>
      </div>
    </div>
  );
}

