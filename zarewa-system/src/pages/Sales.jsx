import React, { useState } from 'react';
import { 
  Search, Plus, FileText, Scissors, Receipt as ReceiptIcon, 
  Filter, Clock, MoreVertical, RotateCcw 
} from 'lucide-react';

import QuotationModal from '../components/QuotationModal';
import ReceiptModal from '../components/ReceiptModal';
import CuttingListModal from '../components/CuttingListModal';
import RefundModal from '../components/RefundModal';

const Sales = () => {
  const [activeTab, setActiveTab] = useState('quotations');
  
  // Modal States
  const [showQuotationModal, setShowQuotationModal] = useState(false); 
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showCuttingModal, setShowCuttingModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);

  // State to track which item is being edited
  const [selectedItem, setSelectedItem] = useState(null);

  // Mock Data
  const availableStock = [
    { id: 'COIL-1882', material: 'HM Blue', gauge: '0.24', color: 'Blue', weight: '3,279kg' },
    { id: 'COIL-1908', material: 'Traffic Black', gauge: '0.24', color: 'Black', weight: '3,428kg' },
    { id: 'COIL-1878', material: 'HM Blue', gauge: '0.55', color: 'Blue', weight: '732kg' },
  ];

  const quotations = [
    { id: 'QT-2026-001', customer: 'Alhaji Musa', date: '27 Mar', total: '₦1,450,000', status: 'Pending' },
    { id: 'QT-2026-002', customer: 'Grace Emmanuel', date: '26 Mar', total: '₦880,000', status: 'Approved' },
  ];

  const cuttingLists = [
    { id: 'CL-2026-005', customer: 'Alhaji Musa', date: '27 Mar', total: '450.5m', status: 'In Production' },
  ];

  // Logic to handle opening modals for "Edit"
  const openEditModal = (item, tab) => {
    setSelectedItem(item);
    if (tab === 'quotations') setShowQuotationModal(true);
    if (tab === 'receipts') setShowReceiptModal(true);
    if (tab === 'cuttinglist') setShowCuttingModal(true);
    if (tab === 'refund') setShowRefundModal(true);
  };

  // Logic to handle opening modals for "New"
  const openNewModal = () => {
    setSelectedItem(null); // Clear previous selection for new entry
    if (activeTab === 'quotations') setShowQuotationModal(true);
    if (activeTab === 'receipts') setShowReceiptModal(true);
    if (activeTab === 'cuttinglist') setShowCuttingModal(true);
    if (activeTab === 'refund') setShowRefundModal(true);
  };

  const isAnyModalOpen = showQuotationModal || showReceiptModal || showCuttingModal || showRefundModal;

  return (
    <div className="animate-in fade-in duration-500 relative">
      
      {/* --- DASHBOARD CONTENT --- */}
      <div className={isAnyModalOpen ? "blur-sm pointer-events-none transition-all" : "transition-all"}>
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#134e4a] tracking-tight">Sales Department</h1>
            <p className="text-gray-500 font-medium text-sm mt-1 uppercase tracking-widest">Order Management & Pricing</p>
          </div>
          
          <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
            {[
              { id: 'quotations', icon: <FileText size={16} />, label: 'Quotations' },
              { id: 'receipts', icon: <ReceiptIcon size={16} />, label: 'Receipts' },
              { id: 'cuttinglist', icon: <Scissors size={16} />, label: 'Cutting List' },
              { id: 'refund', icon: <RotateCcw size={16} />, label: 'Refund' }
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-[#134e4a] text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'}`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-[#134e4a] p-6 rounded-zarewa text-white shadow-xl">
              <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-4">Live Price List</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between border-b border-white/10 pb-2">
                  <span className="font-medium">Alu 0.45mm</span>
                  <span className="font-bold text-zarewa-mint">₦4,500/m</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-zarewa shadow-sm border border-gray-100">
              <h3 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4">Coil Inventory</h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {availableStock.map((coil) => (
                  <div key={coil.id} className="p-3 bg-gray-50 rounded-xl border border-transparent hover:border-teal-100 transition-all cursor-pointer">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-bold text-[#134e4a]">{coil.id}</span>
                      <span className="text-[10px] font-black text-emerald-600">{coil.weight}</span>
                    </div>
                    <p className="text-[11px] font-medium text-gray-500">{coil.material} {coil.gauge}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main List Area */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-8 min-h-[600px]">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
                <div className="flex items-center gap-4 w-full md:w-auto">
                  <h2 className="text-xl font-bold text-[#134e4a] capitalize">{activeTab}</h2>
                  <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input type="text" placeholder={`Search...`} className="w-full bg-gray-50 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none" />
                  </div>
                </div>
                
                <div className="flex gap-3 w-full md:w-auto">
                  <button 
                    onClick={openNewModal}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#134e4a] text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-lg hover:brightness-110 transition-all"
                  >
                    <Plus size={16} /> New {activeTab.replace('list', '')}
                  </button>
                </div>
              </div>

              {/* LIST VIEWS */}
              <div className="space-y-4">
                <div className="grid grid-cols-12 px-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  <div className="col-span-2">ID</div>
                  <div className="col-span-4">Customer</div>
                  <div className="col-span-2">Date</div>
                  <div className="col-span-2 text-right">Amount/Length</div>
                  <div className="col-span-2 text-center">Actions</div>
                </div>

                {/* Quotations List */}
                {activeTab === 'quotations' && quotations.map((q) => (
                  <div key={q.id} className="grid grid-cols-12 items-center px-6 py-4 bg-gray-50/50 rounded-2xl border border-transparent hover:border-teal-100 hover:bg-white transition-all group cursor-pointer">
                    <div className="col-span-2 text-xs font-bold text-[#134e4a]">{q.id}</div>
                    <div className="col-span-4 text-sm font-bold text-gray-700">{q.customer}</div>
                    <div className="col-span-2 text-xs text-gray-400 flex items-center gap-1"><Clock size={12}/> {q.date}</div>
                    <div className="col-span-2 text-right text-sm font-black text-[#134e4a]">{q.total}</div>
                    <div className="col-span-2 flex justify-center items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${q.status === 'Approved' ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
                        {q.status}
                      </span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); openEditModal(q, 'quotations'); }}
                        className="text-gray-300 hover:text-[#134e4a] p-1"
                      >
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Cutting List */}
                {activeTab === 'cuttinglist' && cuttingLists.map((c) => (
                  <div key={c.id} className="grid grid-cols-12 items-center px-6 py-4 bg-gray-50/50 rounded-2xl border border-transparent hover:border-teal-100 hover:bg-white transition-all group cursor-pointer">
                    <div className="col-span-2 text-xs font-bold text-[#134e4a]">{c.id}</div>
                    <div className="col-span-4 text-sm font-bold text-gray-700">{c.customer}</div>
                    <div className="col-span-2 text-xs text-gray-400 flex items-center gap-1"><Clock size={12}/> {c.date}</div>
                    <div className="col-span-2 text-right text-sm font-black text-[#134e4a]">{c.total}</div>
                    <div className="col-span-2 flex justify-center items-center gap-3">
                      <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-600">{c.status}</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); openEditModal(c, 'cuttinglist'); }}
                        className="text-gray-300 hover:text-[#134e4a] p-1"
                      >
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Empty State for Refund */}
                {activeTab === 'refund' && (
                  <div className="text-center py-20 bg-gray-50/50 rounded-[2rem] border border-dashed border-gray-200">
                    <RotateCcw size={48} className="mx-auto text-gray-200 mb-4" />
                    <p className="text-gray-400 font-bold uppercase text-xs tracking-widest">No active refund requests</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- MODALS --- */}
      <QuotationModal 
        isOpen={showQuotationModal} 
        editData={selectedItem}
        onClose={() => setShowQuotationModal(false)} 
      />
      <ReceiptModal 
        isOpen={showReceiptModal} 
        editData={selectedItem}
        onClose={() => setShowReceiptModal(false)} 
      />
      <CuttingListModal 
        isOpen={showCuttingModal} 
        editData={selectedItem}
        onClose={() => setShowCuttingModal(false)} 
      />
      <RefundModal 
        isOpen={showRefundModal} 
        editData={selectedItem}
        onClose={() => setShowRefundModal(false)} 
      />
    </div>
  );
};

export default Sales;