import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Phone,
  Mail,
  MapPin,
  Building2,
  X,
  UserCircle,
  BadgeCheck,
  LayoutDashboard,
  TrendingUp,
  Ruler,
  Moon,
} from 'lucide-react';
import { ModalFrame } from '../layout';
import { useCustomers } from '../../context/CustomersContext';
import { useToast } from '../../context/ToastContext';
import { formatNgn } from '../../Data/mockData';

const TODAY_ISO = '2026-03-28';
const INSIGHT_DAYS = 90;

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
 * @param {{ searchQuery: string; addOpen: boolean; onAddClose: () => void; createdByLabel?: string; quotations?: object[]; receipts?: object[]; cuttingLists?: object[]; liveMode?: boolean }} props
 */
export default function SalesCustomersTab({
  searchQuery,
  addOpen,
  onAddClose,
  createdByLabel = 'Sales',
  quotations = [],
  receipts = [],
  cuttingLists = [],
  liveMode = false,
}) {
  const { customers, addCustomer } = useCustomers();
  const { show: showToast } = useToast();
  const [form, setForm] = useState(emptyForm);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!addOpen) setForm(emptyForm);
  }, [addOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const blob = [
        c.customerID,
        c.name,
        c.phoneNumber,
        c.email,
        c.tier,
        c.paymentTerms,
        c.addressShipping,
        c.createdBy,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [customers, searchQuery]);

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
      const touch =
        lastTouchISO(c.customerID, quotations, receipts, cuttingLists) || c.lastActivityISO || c.createdAtISO || '';
      return touch && touch < ciso;
    });

    return { topSpend, topMeters, inactive, ciso };
  }, [customers, cuttingLists, quotations, receipts]);

  const submitNew = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phoneNumber.trim()) {
      showToast('Please enter customer name and phone number.', { variant: 'error' });
      return;
    }
    const id = form.customerID?.trim() || nextCustomerId(customers);
    const iso = new Date().toISOString().slice(0, 10);
    try {
      await addCustomer({
        customerID: id,
        name: form.name.trim(),
        phoneNumber: form.phoneNumber.trim(),
        email: form.email.trim() || '',
        addressShipping: form.addressShipping.trim() || '',
        addressBilling: form.addressBilling.trim() || form.addressShipping.trim() || '',
        status: form.status,
        tier: form.tier,
        paymentTerms: form.paymentTerms,
        createdBy: createdByLabel,
        createdAtISO: iso,
        lastActivityISO: iso,
      });
    } catch (err) {
      showToast(String(err.message || err), { variant: 'error' });
      return;
    }
    setForm(emptyForm);
    onAddClose();
    showToast(
      `${form.name.trim()} saved as ${id}.${liveMode ? ' Stored in live database.' : ' Stored in offline browser mode.'}`
    );
  };

  return (
    <>
      <div className="rounded-zarewa border border-teal-100 bg-gradient-to-br from-teal-50/80 to-white p-4 mb-6 space-y-3">
        <p className="text-[10px] font-black text-[#134e4a] uppercase tracking-widest">
          Last {INSIGHT_DAYS} days ({liveMode ? 'live data' : 'offline data'})
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase flex items-center gap-1 mb-2">
              <TrendingUp size={12} /> Top by invoice total
            </p>
            {insights.topSpend.length === 0 ? (
              <p className="text-gray-400">No quotation activity in window.</p>
            ) : (
              <ul className="space-y-1 font-semibold text-[#134e4a]">
                {insights.topSpend.map((r, i) => (
                  <li key={r.id}>
                    {i + 1}. {r.name}{' '}
                    <span className="text-gray-500 font-bold tabular-nums">{formatNgn(r.spend)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase flex items-center gap-1 mb-2">
              <Ruler size={12} /> Top by cutting-list metres
            </p>
            {insights.topMeters.length === 0 ? (
              <p className="text-gray-400">No cutting lists dated in window.</p>
            ) : (
              <ul className="space-y-1 font-semibold text-[#134e4a]">
                {insights.topMeters.map((r, i) => (
                  <li key={r.id}>
                    {i + 1}. {r.name}{' '}
                    <span className="text-gray-500 font-bold tabular-nums">
                      {r.meters.toLocaleString()} m
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase flex items-center gap-1 mb-2">
              <Moon size={12} /> Quiet accounts
            </p>
            {insights.inactive.length === 0 ? (
              <p className="text-gray-400">Everyone touched in window (or no dates).</p>
            ) : (
              <p className="text-gray-600 leading-snug">
                <span className="font-black text-amber-800">{insights.inactive.length}</span> with no
                quotes/receipts/lists since {insights.ciso}:{' '}
                {insights.inactive.map((c) => c.name).join(', ')}
              </p>
            )}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="z-empty-state">
          <UserCircle size={48} className="mx-auto text-gray-200 mb-4" />
          <p className="text-gray-400 font-bold uppercase text-xs tracking-widest">
            No customers match your search
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filtered.map((c) => (
            <div
              key={c.customerID}
              className="p-6 rounded-zarewa border border-gray-100 bg-gray-50/50 hover:bg-white hover:border-teal-100 hover:shadow-lg transition-all"
            >
              <div className="flex justify-between items-start gap-4 mb-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                    {c.customerID}
                  </p>
                  <h3 className="text-lg font-black text-[#134e4a]">{c.name}</h3>
                  <Link
                    to={`/customers/${encodeURIComponent(c.customerID)}`}
                    className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#134e4a] hover:text-teal-600"
                  >
                    <LayoutDashboard size={14} />
                    Customer profile & transactions
                  </Link>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`text-[9px] font-bold uppercase px-2 py-1 rounded-full ${
                      c.status === 'Active'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {c.status}
                  </span>
                  <span className="text-[9px] font-bold uppercase px-2 py-1 rounded-full bg-[#134e4a]/10 text-[#134e4a]">
                    {c.tier}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-xs text-gray-600">
                <p className="flex items-center gap-2 font-medium">
                  <Phone size={14} className="text-gray-400 shrink-0" />
                  {c.phoneNumber}
                </p>
                <p className="flex items-center gap-2 font-medium">
                  <Mail size={14} className="text-gray-400 shrink-0" />
                  {c.email}
                </p>
                <p className="flex items-start gap-2 font-medium">
                  <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
                  <span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Ship</span>
                    {c.addressShipping}
                  </span>
                </p>
                <p className="flex items-start gap-2 font-medium">
                  <Building2 size={14} className="text-gray-400 shrink-0 mt-0.5" />
                  <span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Bill</span>
                    {c.addressBilling}
                  </span>
                </p>
                <p className="flex items-center gap-2 pt-2 border-t border-gray-100 font-bold text-[#134e4a]">
                  <BadgeCheck size={14} />
                  {c.paymentTerms}
                </p>
                <p className="text-[10px] text-gray-500 pt-1 border-t border-gray-100">
                  <span className="font-bold text-gray-400 uppercase">Account officer</span>{' '}
                  {c.createdBy || '—'}
                  {c.createdAtISO ? (
                    <span className="block mt-0.5 tabular-nums">On file since {c.createdAtISO}</span>
                  ) : null}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <ModalFrame
        isOpen={addOpen}
        onClose={() => {
          onAddClose();
          setForm(emptyForm);
        }}
      >
        <div className="z-modal-panel max-w-lg p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">New customer</h3>
            <button
              type="button"
              onClick={() => {
                onAddClose();
                setForm(emptyForm);
              }}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl hover:bg-red-50 transition-colors"
            >
              <X size={22} />
            </button>
          </div>
          <p className="text-[10px] text-gray-500 mb-4">
            You are recording this as <span className="font-bold text-[#134e4a]">{createdByLabel}</span>{' '}
            (current Sales role).
          </p>
          <form onSubmit={submitNew} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Full name *
              </label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold text-[#134e4a] outline-none focus:ring-2 focus:ring-[#134e4a]/15"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Phone *
                </label>
                <input
                  required
                  value={form.phoneNumber}
                  onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-[#134e4a]/15"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-[#134e4a]/15"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Shipping address
              </label>
              <textarea
                rows={2}
                value={form.addressShipping}
                onChange={(e) => setForm((f) => ({ ...f, addressShipping: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-[#134e4a]/15 resize-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Billing address
              </label>
              <textarea
                rows={2}
                value={form.addressBilling}
                onChange={(e) => setForm((f) => ({ ...f, addressBilling: e.target.value }))}
                placeholder="Leave blank to copy shipping"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-[#134e4a]/15 resize-none"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-3 text-xs font-bold outline-none"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Tier
                </label>
                <select
                  value={form.tier}
                  onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-3 text-xs font-bold outline-none"
                >
                  <option value="Regular">Regular</option>
                  <option value="VIP">VIP</option>
                  <option value="Wholesale">Wholesale</option>
                  <option value="Trade">Trade</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Terms
                </label>
                <select
                  value={form.paymentTerms}
                  onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-3 text-xs font-bold outline-none"
                >
                  <option value="Due on receipt">Due on receipt</option>
                  <option value="Net 14">Net 14</option>
                  <option value="Net 30">Net 30</option>
                  <option value="Net 60">Net 60</option>
                </select>
              </div>
            </div>
            <button type="submit" className="z-btn-primary w-full justify-center py-3 mt-2">
              Save customer
            </button>
          </form>
        </div>
      </ModalFrame>
    </>
  );
}
