import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, UserCircle, TrendingUp, Ruler, Moon, Trash2 } from 'lucide-react';
import { ModalFrame } from '../layout';
import { useCustomers } from '../../context/CustomersContext';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { formatNgn } from '../../Data/mockData';

const TODAY_ISO = '2026-03-28';
const INSIGHT_DAYS = 90;

/** Match quotation row chrome; padding lives on the link / actions so the whole row is clickable */
const CARD_ROW =
  'rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md shadow-sm transition-colors hover:bg-white/70';

const CHIP =
  'inline-flex items-center text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border shrink-0';

function customerStatusChipBorder(status) {
  if (String(status).toLowerCase() === 'active') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function customerTierChipBorder(tier) {
  const t = String(tier || '').toLowerCase();
  if (t === 'vip') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (t === 'wholesale') return 'border-sky-200 bg-sky-50 text-sky-800';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

const emptyForm = {
  name: '',
  phoneNumber: '',
  email: '',
  addressShipping: '',
  addressBilling: '',
  status: 'Active',
  tier: 'Regular',
  paymentTerms: 'Net 30',
};

const nextCustomerId = (list) => {
  const nums = list
    .map((c) => parseInt(c.customerID.replace(/\D/g, ''), 10))
    .filter((n) => !Number.isNaN(n));
  const n = nums.length ? Math.max(...nums) + 1 : 1;
  return `CUS-${String(n).padStart(3, '0')}`;
};

function parseMeters(totalStr) {
  const m = String(totalStr ?? '').match(/([\d.]+)\s*m/i);
  return m ? parseFloat(m[1], 10) : 0;
}

function insightCutoffISO() {
  const d = new Date(TODAY_ISO);
  d.setDate(d.getDate() - INSIGHT_DAYS);
  return d.toISOString().slice(0, 10);
}

function lastTouchISO(customerID, quotations, receipts, cuttingLists) {
  let max = '';
  const bump = (iso) => {
    if (iso && iso > max) max = iso;
  };
  quotations.forEach((q) => {
    if (q.customerID === customerID) bump(q.dateISO);
  });
  receipts.forEach((r) => {
    if (r.customerID === customerID) bump(r.dateISO);
  });
  cuttingLists.forEach((cl) => {
    if (cl.customerID === customerID) bump(cl.dateISO);
  });
  return max;
}

/**
 * Customers workspace embedded in Sales (Customers tab).
 * @param {{ searchQuery: string; addOpen: boolean; onAddClose: () => void; createdByLabel?: string; quotations?: object[]; receipts?: object[]; cuttingLists?: object[] }} props
 */
export default function SalesCustomersTab({
  searchQuery,
  addOpen,
  onAddClose,
  createdByLabel = 'Sales',
  quotations = [],
  receipts = [],
  cuttingLists = [],
}) {
  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const { customers, addCustomer, deleteCustomer } = useCustomers();
  const { show: showToast } = useToast();
  const ws = useWorkspace();
  const canDeleteCustomer = Boolean(ws?.hasPermission?.('sales.manage') && ws?.canMutate);
  const [form, setForm] = useState(emptyForm);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const handleDeleteCustomer = async (c) => {
    if (!window.confirm(`Delete ${c.name} (${c.customerID})? This cannot be undone.`)) return;
    setDeleteBusy(true);
    try {
      await deleteCustomer(c.customerID);
      showToast('Customer deleted.');
    } catch (e) {
      showToast(e?.message || 'Could not delete customer.', { variant: 'error' });
    } finally {
      setDeleteBusy(false);
    }
  };

  /** Calculate total spend per customer for sorting */
  const customerRevenue = useMemo(() => {
    const rev = new Map();
    quotations.forEach(q => {
      if (!q.customerID) return;
      rev.set(q.customerID, (rev.get(q.customerID) || 0) + (q.totalNgn || 0));
    });
    return rev;
  }, [quotations]);

  const sortedAndFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = q ? customers.filter(c => {
      const blob = [c.customerID, c.name, c.phoneNumber, c.email, c.tier].join(' ').toLowerCase();
      return blob.includes(q);
    }) : [...customers];

    list.sort((a, b) => {
      let valA, valB;
      if (sortField === 'revenue') {
        valA = customerRevenue.get(a.customerID) || 0;
        valB = customerRevenue.get(b.customerID) || 0;
      } else {
        valA = String(a[sortField] || '').toLowerCase();
        valB = String(b[sortField] || '').toLowerCase();
      }
      
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [customers, searchQuery, sortField, sortOrder, customerRevenue]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedAndFiltered.slice(start, start + itemsPerPage);
  }, [sortedAndFiltered, currentPage]);

  const totalPages = Math.ceil(sortedAndFiltered.length / itemsPerPage);

  const insights = useMemo(() => {
    const ciso = insightCutoffISO();
    const byCustomer = new Map();
    quotations.forEach((q) => {
      if (!q.customerID || !q.dateISO || q.dateISO < ciso) return;
      const cur = byCustomer.get(q.customerID) || { spend: 0, meters: 0 };
      cur.spend += q.totalNgn || 0;
      byCustomer.set(q.customerID, cur);
    });
    cuttingLists.forEach((cl) => {
      if (!cl.customerID || !cl.dateISO || cl.dateISO < ciso) return;
      const cur = byCustomer.get(cl.customerID) || { spend: 0, meters: 0 };
      cur.meters += parseMeters(cl.total);
      byCustomer.set(cl.customerID, cur);
    });

    const nameOf = (id) => customers.find((c) => c.customerID === id)?.name ?? id;

    const topSpend = [...byCustomer.entries()]
      .filter(([, v]) => v.spend > 0)
      .sort((a, b) => b[1].spend - a[1].spend)
      .slice(0, 3)
      .map(([id, v]) => ({ id, name: nameOf(id), spend: v.spend }));

    const topMeters = [...byCustomer.entries()]
      .filter(([, v]) => v.meters > 0)
      .sort((a, b) => b[1].meters - a[1].meters)
      .slice(0, 3)
      .map(([id, v]) => ({ id, name: nameOf(id), meters: v.meters }));

    const inactive = customers.filter((c) => {
      const touch = lastTouchISO(c.customerID, quotations, receipts, cuttingLists) || c.lastActivityISO || c.createdAtISO || '';
      return touch && touch < ciso;
    });

    return { topSpend, topMeters, inactive, ciso };
  }, [customers, cuttingLists, quotations, receipts]);

  const submitNew = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phoneNumber.trim()) {
      showToast('Name and phone required.', { variant: 'error' });
      return;
    }
    const id = form.customerID?.trim() || nextCustomerId(customers);
    const iso = new Date().toISOString().slice(0, 10);
    try {
      await addCustomer({ ...form, customerID: id, createdAtISO: iso, lastActivityISO: iso, createdBy: createdByLabel });
      setForm(emptyForm);
      onAddClose();
      showToast(`Customer ${id} saved.`);
    } catch (err) {
      showToast(err.message, { variant: 'error' });
    }
  };

  return (
    <>
      <div className="grid w-full min-w-0 grid-cols-1 gap-6 items-start lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        {/* Intelligence Sidebar on Left */}
        <aside className="space-y-5 sticky top-4 min-w-0">
          <div className="rounded-xl border border-teal-100 bg-white p-5 space-y-6 shadow-sm overflow-hidden">
            <div className="h-1 bg-teal-600 -mx-5 -mt-5 mb-4" />
            <div>
              <p className="text-[10px] font-black text-teal-600 uppercase tracking-widest mb-1">Network Intel</p>
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">Last {INSIGHT_DAYS} Days</h4>
            </div>

            <div className="space-y-6">
              <section>
                <p className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-2 mb-3 tracking-widest">
                  <TrendingUp size={14} className="text-teal-500" /> Revenue
                </p>
                {insights.topSpend.length === 0 ? (
                  <p className="text-[10px] text-slate-300 italic">No activity</p>
                ) : (
                  <ul className="space-y-2">
                    {insights.topSpend.map(r => (
                      <li key={r.id} className="min-w-0">
                        <p className="text-[11px] font-bold text-slate-700 truncate">{r.name}</p>
                        <p className="text-[10px] font-black text-teal-600 tabular-nums">{formatNgn(r.spend)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <p className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-2 mb-3 tracking-widest">
                  <Ruler size={14} className="text-amber-500" /> Metres
                </p>
                {insights.topMeters.length === 0 ? (
                  <p className="text-[10px] text-slate-300 italic">No volume</p>
                ) : (
                  <ul className="space-y-2">
                    {insights.topMeters.map(r => (
                      <li key={r.id} className="min-w-0">
                        <p className="text-[11px] font-bold text-slate-700 truncate">{r.name}</p>
                        <p className="text-[10px] font-black text-amber-600 tabular-nums">{r.meters.toLocaleString()} m</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="pt-4 border-t border-slate-50">
                <p className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-2 mb-2 tracking-widest">
                  <Moon size={14} className="text-sky-500" /> Reactivation
                </p>
                <p className="text-[10px] font-bold text-slate-500 leading-tight">
                  <span className="text-rose-600">{insights.inactive.length} accounts</span> quiet since {insights.ciso}.
                </p>
              </section>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-slate-200 p-4 bg-slate-50/50">
             <p className="text-[10px] font-medium text-slate-500 leading-relaxed text-center italic">
               Sorting & pagination are applied to the filtered results. Use the header to change order.
             </p>
          </div>
        </aside>

        {/* Main Customer List on Right */}
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sort by:</span>
                <select 
                  value={sortField} 
                  onChange={(e) => setSortField(e.target.value)}
                  className="bg-transparent text-[11px] font-black text-[#134e4a] focus:outline-none"
                >
                  <option value="name">Name</option>
                  <option value="customerID">ID</option>
                  <option value="revenue">Total Revenue</option>
                </select>
              </div>
              <button 
                onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                className="text-[10px] font-black text-teal-600 uppercase tracking-widest"
              >
                {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              </button>
            </div>
            
            <p className="text-[11px] font-bold text-slate-400 tabular-nums">
              Showing {paginated.length} of {sortedAndFiltered.length} customers
            </p>
          </div>

          {paginated.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-14 px-6 text-center">
              <UserCircle size={40} className="mx-auto text-slate-200 mb-3" strokeWidth={1.5} />
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">No matching customers</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {paginated.map((c) => {
                const rev = customerRevenue.get(c.customerID) || 0;
                const meta2 = [c.phoneNumber || 'No phone', c.email || 'No email'].join(' · ');
                const profileTo = `/customers/${encodeURIComponent(c.customerID)}`;
                return (
                  <li key={c.customerID} className={`${CARD_ROW} flex flex-nowrap items-stretch min-w-0`}>
                    <Link
                      to={profileTo}
                      className="min-w-0 flex-1 px-2.5 py-1.5 text-inherit no-underline outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#134e4a]/25 rounded-lg"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1 leading-tight">
                          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 min-w-0">
                            <p className="text-[11px] font-bold text-[#134e4a] truncate min-w-0">
                              <span className="tabular-nums font-mono">{c.customerID}</span>
                              <span className="font-medium text-slate-600"> · {c.name}</span>
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              <span className="text-[11px] font-black text-[#134e4a] tabular-nums">
                                {formatNgn(rev)}
                              </span>
                              <span className={`${CHIP} ${customerStatusChipBorder(c.status)}`}>{c.status}</span>
                              <span className={`${CHIP} ${customerTierChipBorder(c.tier)}`}>{c.tier}</span>
                            </div>
                          </div>
                          <p
                            className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2 tabular-nums"
                            title={meta2}
                          >
                            {meta2}
                          </p>
                        </div>
                      </div>
                    </Link>
                    {canDeleteCustomer ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteCustomer(c);
                        }}
                        disabled={deleteBusy}
                        className="shrink-0 self-stretch px-2.5 py-1.5 flex items-center border-l border-slate-200/60 text-slate-300 hover:text-rose-600 hover:bg-rose-50/80 transition-colors disabled:opacity-40"
                        title="Delete customer"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
               <button 
                 disabled={currentPage === 1}
                 onClick={() => setCurrentPage(p => p - 1)}
                 className="px-3 py-1 rounded-lg border border-slate-200 text-[10px] font-black uppercase text-[#134e4a] disabled:opacity-30"
               >Prev</button>
               <span className="text-[11px] font-black text-[#134e4a] tabular-nums mx-2">Page {currentPage} of {totalPages}</span>
               <button 
                 disabled={currentPage === totalPages}
                 onClick={() => setCurrentPage(p => p + 1)}
                 className="px-3 py-1 rounded-lg border border-slate-200 text-[10px] font-black uppercase text-[#134e4a] disabled:opacity-30"
               >Next</button>
            </div>
          )}
        </div>
      </div>

      <ModalFrame isOpen={addOpen} onClose={onAddClose}>
        <div className="z-modal-panel max-w-lg p-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">New Customer</h3>
            <button onClick={onAddClose} className="p-2 text-slate-400 hover:text-rose-500 rounded-xl hover:bg-rose-50">
              <X size={22} />
            </button>
          </div>
          <form onSubmit={submitNew} className="space-y-4">
             <div className="space-y-1">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name *</label>
               <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm font-bold text-[#134e4a] outline-none focus:ring-2 focus:ring-teal-500/10" />
             </div>
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone *</label>
                 <input required value={form.phoneNumber} onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))} className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm font-bold text-[#134e4a] outline-none focus:ring-2 focus:ring-teal-500/10" />
               </div>
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                 <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm font-bold text-[#134e4a] outline-none focus:ring-2 focus:ring-teal-500/10" />
               </div>
             </div>
             <div className="space-y-1">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Shipping Address</label>
               <textarea rows={2} value={form.addressShipping} onChange={e => setForm(f => ({ ...f, addressShipping: e.target.value }))} className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm font-medium text-[#134e4a] outline-none focus:ring-2 focus:ring-teal-500/10 resize-none" />
             </div>
             <div className="grid grid-cols-3 gap-3">
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tier</label>
                 <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))} className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-xs font-bold text-[#134e4a] outline-none">
                   <option value="Regular">Regular</option>
                   <option value="VIP">VIP</option>
                   <option value="Wholesale">Wholesale</option>
                 </select>
               </div>
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Terms</label>
                 <select value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-xs font-bold text-[#134e4a] outline-none">
                   <option value="Due on receipt">Due on receipt</option>
                   <option value="Net 30">Net 30</option>
                 </select>
               </div>
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status</label>
                 <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-xs font-bold text-[#134e4a] outline-none">
                   <option value="Active">Active</option>
                   <option value="Inactive">Inactive</option>
                 </select>
               </div>
             </div>
             <button type="submit" className="w-full bg-[#134e4a] text-white rounded-xl py-4 text-xs font-black uppercase tracking-widest shadow-lg shadow-teal-900/20 hover:brightness-110 active:scale-[0.98] transition-all">
               Save Customer
             </button>
          </form>
        </div>
      </ModalFrame>
    </>
  );
}
