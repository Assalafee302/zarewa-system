import React, { useState } from 'react';
import { 
  Search, Plus, Truck, Anchor, Scale, 
  Filter, Clock, MoreVertical, DollarSign, Layers, AlertCircle, Trash2
} from 'lucide-react';

// Assuming these will be created similarly to your Sales modals
// import PurchaseOrderModal from '../components/PurchaseOrderModal';
// import TransportModal from '../components/TransportModal';

const Procurement = () => {
  const [activeTab, setActiveTab] = useState('purchases');
  
  // Modal States
  const [showPOModal, setShowPOModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  // Mock Data
  const inventoryStatus = [
    { id: 'STOCK-01', material: 'Alu 0.45mm', color: 'Traffic Blue', weight: '12,500kg', status: 'Healthy' },
    { id: 'STOCK-02', material: 'Alu 0.40mm', color: 'Zinc Silver', weight: '1,200kg', status: 'Low' },
  ];

  const purchases = [
    { id: 'PO-2026-001', supplier: 'Alumaco Global', date: '27 Mar', total: '₦14,500,000', status: 'In-Transit' },
    { id: 'PO-2026-002', supplier: 'Tower Aluminum', date: '26 Mar', total: '₦8,800,000', status: 'Delivered' },
  ];

  const isAnyModalOpen = showPOModal;

  return (
    <div className="animate-in fade-in duration-500 relative">
      
      {/* --- DASHBOARD CONTENT --- */}
      <div className={isAnyModalOpen ? "blur-sm pointer-events-none transition-all" : "transition-all"}>
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#134e4a] tracking-tight">Procurement</h1>
            <p className="text-gray-500 font-medium text-sm mt-1 uppercase tracking-widest">Supply Chain & Inventory Management</p>
          </div>
          
          <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
            {[
              { id: 'purchases', icon: <DollarSign size={16} />, label: 'Purchases' },
              { id: 'transport', icon: <Truck size={16} />, label: 'Transportation' },
              { id: 'suppliers', icon: <Anchor size={16} />, label: 'Suppliers' },
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
          {/* Sidebar - Matching Sales Style */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-[#134e4a] p-6 rounded-zarewa text-white shadow-xl">
              <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-4">Financial Overview</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between border-b border-white/10 pb-2">
                  <span className="font-medium opacity-80">Total Outstanding</span>
                  <span className="font-bold text-emerald-400">₦12.4M</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="font-medium opacity-80">Goods In Transit</span>
                  <span className="font-bold">85,400kg</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-zarewa shadow-sm border border-gray-100">
              <h3 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4">Stock Alerts</h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {inventoryStatus.map((item) => (
                  <div key={item.id} className="p-3 bg-gray-50 rounded-xl border border-transparent hover:border-teal-100 transition-all">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-bold text-[#134e4a]">{item.color}</span>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${item.status === 'Low' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        {item.weight}
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-gray-500">{item.material}</p>
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
                    <input type="text" placeholder={`Search ${activeTab}...`} className="w-full bg-gray-50 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none" />
                  </div>
                </div>
                
                <div className="flex gap-3 w-full md:w-auto">
                  <button 
                    onClick={() => setShowPOModal(true)}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#134e4a] text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-lg hover:brightness-110 transition-all"
                  >
                    <Plus size={16} /> New {activeTab === 'purchases' ? 'Order' : activeTab === 'transport' ? 'Agent' : 'Supplier'}
                  </button>
                </div>
              </div>

              {/* LIST VIEWS */}
              <div className="space-y-4">
                {activeTab === 'purchases' && (
                  <>
                    <div className="grid grid-cols-12 px-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                      <div className="col-span-2">Order ID</div>
                      <div className="col-span-4">Supplier</div>
                      <div className="col-span-2">Date</div>
                      <div className="col-span-2 text-right">Amount</div>
                      <div className="col-span-2 text-center">Status</div>
                    </div>

                    {purchases.map((p) => (
                      <div key={p.id} className="grid grid-cols-12 items-center px-6 py-4 bg-gray-50/50 rounded-2xl border border-transparent hover:border-teal-100 hover:bg-white transition-all group cursor-pointer">
                        <div className="col-span-2 text-xs font-bold text-[#134e4a]">{p.id}</div>
                        <div className="col-span-4 text-sm font-bold text-gray-700">{p.supplier}</div>
                        <div className="col-span-2 text-xs text-gray-400 flex items-center gap-1"><Clock size={12}/> {p.date}</div>
                        <div className="col-span-2 text-right text-sm font-black text-[#134e4a]">{p.total}</div>
                        <div className="col-span-2 flex justify-center items-center gap-3">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${p.status === 'Delivered' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                            {p.status}
                          </span>
                          <button className="text-gray-300 hover:text-[#134e4a] p-1"><MoreVertical size={16} /></button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Transportation Tab - Sub Nav Layout */}
                {activeTab === 'transport' && (
                  <div className="space-y-6">
                    <div className="flex gap-2 overflow-x-auto pb-2">
                       {['Agents', 'Transit Log', 'Cost Analysis'].map(sub => (
                         <button key={sub} className="px-4 py-1.5 rounded-lg border border-gray-100 bg-gray-50 text-[10px] font-bold text-gray-500 hover:bg-white hover:text-[#134e4a] transition-all">
                           {sub}
                         </button>
                       ))}
                    </div>
                    <div className="text-center py-20 bg-gray-50/50 rounded-[2rem] border border-dashed border-gray-200">
                      <Truck size={48} className="mx-auto text-gray-200 mb-4" />
                      <p className="text-gray-400 font-bold uppercase text-xs tracking-widest">Select sub-category to view logistics</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- IN-LINE PURCHASE ORDER MODAL --- */}
      {showPOModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
           <div className="bg-white w-full max-w-6xl rounded-zarewa p-10 shadow-2xl animate-in zoom-in duration-300">
              <div className="flex justify-between items-center mb-10">
                 <h3 className="text-2xl font-bold text-[#134e4a]">New Purchase Order</h3>
                 <button onClick={() => setShowPOModal(false)} className="text-gray-300 hover:text-rose-500"><Plus size={32} className="rotate-45"/></button>
              </div>

              {/* General Info */}
              <div className="grid grid-cols-2 gap-6 mb-10">
                 <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Supplier</label>
                    <select className="w-full bg-gray-50 border-none rounded-xl py-3 px-4 text-sm font-bold outline-none ring-1 ring-gray-100 focus:ring-2 focus:ring-[#134e4a]">
                       <option>Select Supplier...</option>
                       <option>Alumaco Global</option>
                    </select>
                 </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Date</label>
                    <input type="date" className="w-full bg-gray-50 border-none rounded-xl py-3 px-4 text-sm font-bold outline-none ring-1 ring-gray-100" />
                 </div>
              </div>

              {/* In-Line Item Entry */}
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                 <div className="grid grid-cols-7 gap-3 mb-4">
                    {['Guage', 'Meters', 'KG', 'Color', 'Conversion', 'Unit Price'].map(label => (
                       <div key={label} className="text-[9px] font-bold text-gray-400 uppercase px-1">{label}</div>
                    ))}
                    <div></div>
                 </div>
                 <div className="grid grid-cols-7 gap-3 items-center">
                    <input placeholder="0.45" className="bg-white border-none rounded-lg py-2.5 px-3 text-xs font-bold shadow-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                    <input placeholder="1200" className="bg-white border-none rounded-lg py-2.5 px-3 text-xs font-bold shadow-sm outline-none" />
                    <input placeholder="3500" className="bg-white border-none rounded-lg py-2.5 px-3 text-xs font-bold shadow-sm outline-none" />
                    <input placeholder="Blue" className="bg-white border-none rounded-lg py-2.5 px-3 text-xs font-bold shadow-sm outline-none" />
                    <input placeholder="1.2" className="bg-white border-none rounded-lg py-2.5 px-3 text-xs font-bold shadow-sm outline-none" />
                    <input placeholder="4500" className="bg-white border-none rounded-lg py-2.5 px-3 text-xs font-bold shadow-sm outline-none" />
                    <button className="bg-emerald-600 text-white h-full rounded-lg flex items-center justify-center hover:bg-emerald-700 transition-all">
                       <Plus size={18} />
                    </button>
                 </div>
              </div>

              <div className="mt-10 pt-8 border-t border-gray-100 flex justify-between items-center">
                 <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Estimated Total</p>
                    <p className="text-3xl font-black text-[#134e4a]">₦0.00</p>
                 </div>
                 <button className="bg-[#134e4a] text-white px-10 py-4 rounded-xl font-bold text-sm shadow-xl hover:brightness-110 transition-all">
                    Generate Purchase Order
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Procurement;