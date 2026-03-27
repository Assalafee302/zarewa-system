import React, { useState, useMemo } from 'react';
import { 
  Landmark, Plus, ShieldCheck, Banknote, CheckCircle2, X, 
  FileText, Edit3, Activity, Clock, ArrowDownLeft, 
  ChevronRight, Download, Search, History, CreditCard, MoreVertical
} from 'lucide-react';

const Account = () => {
  const [activeTab, setActiveTab] = useState('treasury'); 
  const [showPaymentEntry, setShowPaymentEntry] = useState(false);
  const [showAddBank, setShowAddBank] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [editingAuditId, setEditingAuditId] = useState(null);

  // --- MOCK DATA ---
  const [bankAccounts] = useState([
    { id: 1, name: "GTBank Main", balance: 14250000, type: "Bank", accNo: "0123456789" },
    { id: 2, name: "Zenith Production", balance: 5200000, type: "Bank", accNo: "9876543210" },
    { id: 3, name: "Cash Office (Till)", balance: 450000, type: "Cash", accNo: "N/A" },
  ]);

  const [auditQueue] = useState([
    { id: 'RCP-26-001', customer: 'Bello Aluminum Ltd', amount: 1250000, bank: 'GTBank Main', date: '27 Mar', desc: 'Coil Purchase Deposit' },
    { id: 'RCP-26-002', customer: 'Musa Garba', amount: 45000, bank: 'Cash Office', date: '27 Mar', desc: 'Scrap Metal Payment' },
  ]);

  const [pendingPayments] = useState([
    { id: 'VOU-EXP-99', category: 'Diesel (Plant)', total: 120000, paid: 0, date: '26 Mar', desc: '200 Liters for Gen-Set' },
    { id: 'VOU-PUR-105', category: 'Aluminum Coil #442', total: 25000000, paid: 10000000, date: '20 Mar', desc: 'Imported Grade A Coils' },
  ]);

  const totals = useMemo(() => {
    const cash = bankAccounts.reduce((acc, curr) => acc + curr.balance, 0);
    return { cash };
  }, [bankAccounts]);

  const isAnyModalOpen = showPaymentEntry || showAddBank;

  return (
    <div className="animate-in fade-in duration-500 relative">
      
      {/* --- DASHBOARD CONTENT --- */}
      <div className={isAnyModalOpen ? "blur-sm pointer-events-none transition-all" : "transition-all"}>
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#134e4a] tracking-tight">Accounting</h1>
            <p className="text-gray-500 font-medium text-sm mt-1 uppercase tracking-widest">Treasury & Ledger Management</p>
          </div>
          
          <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
            {[
              { id: 'treasury', icon: <Landmark size={16} />, label: 'Treasury' },
              { id: 'payments', icon: <Banknote size={16} />, label: 'Payments' },
              { id: 'audit', icon: <ShieldCheck size={16} />, label: 'Audit Hub' }
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
          
          {/* Sidebar - Matching Sales/Procurement Style */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-[#134e4a] p-6 rounded-zarewa text-white shadow-xl">
              <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-4">Total Liquidity</h3>
              <div className="space-y-1">
                <p className="text-2xl font-black italic tracking-tighter">₦{totals.cash.toLocaleString()}</p>
                <p className="text-[10px] text-zarewa-mint font-medium">Combined Bank & Cash</p>
              </div>
            </div>

            {/* Direct Ledger Posting Card */}
            <div className="bg-white p-6 rounded-zarewa shadow-sm border border-gray-100">
              <h3 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4 flex items-center gap-2">
                <Activity size={14}/> Quick Post
              </h3>
              <div className="space-y-3">
                 <input type="number" placeholder="Amount ₦" className="w-full bg-gray-50 border-none rounded-xl py-2.5 px-4 text-xs font-bold outline-none ring-1 ring-gray-100 focus:ring-[#134e4a]" />
                 <select className="w-full bg-gray-50 border-none rounded-xl py-2.5 px-4 text-xs font-bold outline-none ring-1 ring-gray-100">
                    <option>Staff Welfare</option>
                    <option>Fuel/Diesel</option>
                    <option>Logistics</option>
                 </select>
                 <button className="w-full bg-[#134e4a] text-white py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg">Post Journal</button>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-8 min-h-[600px]">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
                <div className="flex items-center gap-4 w-full md:w-auto">
                  <h2 className="text-xl font-bold text-[#134e4a] capitalize">{activeTab}</h2>
                  <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input type="text" placeholder={`Search records...`} className="w-full bg-gray-50 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none" />
                  </div>
                </div>
                
                <div className="flex gap-3 w-full md:w-auto">
                  <button 
                    onClick={() => activeTab === 'treasury' ? setShowAddBank(true) : null}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#134e4a] text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-lg hover:brightness-110 transition-all"
                  >
                    <Plus size={16} /> New {activeTab === 'treasury' ? 'Account' : 'Record'}
                  </button>
                </div>
              </div>

              {/* VIEW: TREASURY */}
              {activeTab === 'treasury' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-300">
                  {bankAccounts.map(acc => (
                    <div key={acc.id} className="p-6 rounded-zarewa border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-xl hover:border-teal-100 transition-all group">
                      <div className="flex justify-between items-start mb-6">
                        <div className="p-3 bg-white rounded-xl shadow-sm text-[#134e4a]">
                          {acc.type === 'Bank' ? <Landmark size={20}/> : <CreditCard size={20}/>}
                        </div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{acc.accNo}</span>
                      </div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{acc.name}</p>
                      <h4 className="text-2xl font-black text-[#134e4a] italic tracking-tighter">₦{acc.balance.toLocaleString()}</h4>
                    </div>
                  ))}
                </div>
              )}

              {/* VIEW: PAYMENTS */}
              {activeTab === 'payments' && (
                <div className="space-y-4 animate-in slide-in-from-right-5">
                   {pendingPayments.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-6 bg-gray-50/50 border border-transparent rounded-2xl hover:border-teal-100 hover:bg-white transition-all group">
                        <div className="flex items-center gap-4">
                          <div className="bg-white p-3 rounded-xl text-gray-400 group-hover:text-[#134e4a] shadow-sm transition-colors">
                            <FileText size={18}/>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-700 uppercase">{p.category}</p>
                            <p className="text-[10px] text-gray-400 mt-1">{p.desc}</p>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-6">
                          <div>
                            <p className="text-sm font-black text-[#134e4a]">₦{(p.total - p.paid).toLocaleString()}</p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase">{p.date}</p>
                          </div>
                          <button onClick={() => {setSelectedPayment(p); setShowPaymentEntry(true);}} className="p-2 bg-white rounded-lg text-gray-300 hover:text-[#134e4a] border border-gray-100 shadow-sm transition-all">
                            <ChevronRight size={16}/>
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* VIEW: AUDIT HUB */}
              {activeTab === 'audit' && (
                <div className="space-y-4 animate-in slide-in-from-left-5">
                   {auditQueue.map(item => (
                      <div key={item.id} className="p-6 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-white transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="bg-emerald-100 p-3 rounded-xl text-emerald-600"><ArrowDownLeft size={18}/></div>
                            <div>
                              <p className="text-sm font-bold text-gray-700 uppercase">{item.customer}</p>
                              <p className="text-[10px] text-gray-400 italic">via {item.bank} • {item.date}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <p className="text-lg font-black text-[#134e4a]">₦{item.amount.toLocaleString()}</p>
                            <div className="flex gap-2">
                              <button className="p-2 bg-white text-gray-300 hover:text-[#134e4a] rounded-lg border border-gray-100 transition-all"><Edit3 size={16}/></button>
                              <button className="p-2 bg-[#134e4a] text-white rounded-lg shadow-md"><CheckCircle2 size={16}/></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- MODALS (Re-styled to match Sales/Procurement) --- */}
      {showPaymentEntry && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
           <div className="bg-white w-full max-w-lg rounded-zarewa p-10 shadow-2xl animate-in zoom-in duration-300">
              <div className="flex justify-between items-center mb-8">
                 <h3 className="text-2xl font-bold text-[#134e4a]">Process Payment</h3>
                 <button onClick={() => setShowPaymentEntry(false)} className="text-gray-300 hover:text-rose-500"><X size={24}/></button>
              </div>
              <div className="bg-gray-50 p-6 rounded-2xl mb-6 border border-gray-100 flex justify-between items-center">
                 <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Balance Due</p>
                    <p className="text-2xl font-black text-[#134e4a]">₦{(selectedPayment?.total - selectedPayment?.paid).toLocaleString()}</p>
                 </div>
                 <span className="text-[10px] font-bold px-3 py-1 bg-white rounded-full border border-gray-100">{selectedPayment?.id}</span>
              </div>
              <div className="space-y-4">
                 <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Debit Account</label>
                    <select className="w-full bg-gray-50 border-none rounded-xl py-3 px-4 text-sm font-bold outline-none ring-1 ring-gray-100">
                       {bankAccounts.map(a => <option key={a.id}>{a.name}</option>)}
                    </select>
                 </div>
                 <button className="w-full bg-[#134e4a] text-white py-4 rounded-xl font-bold text-xs uppercase tracking-widest shadow-xl mt-4">Confirm Transaction</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Account;