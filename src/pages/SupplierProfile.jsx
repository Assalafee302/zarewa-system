import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Anchor,
  MapPin,
  Wallet,
  TrendingUp,
  Package,
  LayoutDashboard,
  ScrollText,
  Landmark,
  X,
} from 'lucide-react';
import { PageHeader, PageShell, MainPanel, ModalFrame } from '../components/layout';
import { useInventory } from '../context/InventoryContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { PROCUREMENT_COIL_CATALOG, CONVERSION_FLAG_RATIO, formatNgn } from '../Data/mockData';

function poTotalNgn(po) {
  return (po?.lines || []).reduce((s, l) => s + Number(l.qtyOrdered) * Number(l.unitPriceNgn || 0), 0);
}

function isoDaysBetween(startISO, endISO) {
  const a = new Date(String(startISO || ''));
  const b = new Date(String(endISO || ''));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000)));
}

const SupplierProfile = () => {
  const NAV = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'profile', label: 'Profile', icon: Anchor },
    { id: 'history', label: 'Purchase history', icon: Package },
    { id: 'mix', label: 'Material mix', icon: ScrollText },
    { id: 'pricing', label: 'Price benchmark', icon: TrendingUp },
  ];

  const scrollToId = (id) => {
    document.getElementById(`sp-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const { supplierId } = useParams();
  const { purchaseOrders } = useInventory();
  const ws = useWorkspace();
  const [selectedPo, setSelectedPo] = useState(null);

  const supplier = useMemo(() => {
    const apiList = ws?.snapshot?.suppliers;
    if (!Array.isArray(apiList)) return undefined;
    return apiList.find((s) => s.supplierID === supplierId);
  }, [supplierId, ws?.snapshot?.suppliers]);

  const orders = useMemo(
    () => purchaseOrders.filter((p) => p.supplierID === supplierId),
    [purchaseOrders, supplierId]
  );

  const stats = useMemo(() => {
    let spend = 0;
    let kg = 0;
    const gaugePrices = [];
    for (const po of orders) {
      spend += poTotalNgn(po);
      for (const l of po.lines) {
        kg += Number(l.qtyOrdered) || 0;
        if (l.gauge && l.unitPriceNgn) {
          gaugePrices.push({
            gauge: l.gauge,
            color: l.color,
            priceKg: l.unitPriceNgn,
            poID: po.poID,
            date: po.orderDateISO,
          });
        }
      }
    }
    const outstanding = orders.reduce((s, po) => {
      if (po.status === 'Rejected') return s;
      const tot = poTotalNgn(po);
      const paid = Number(po.supplierPaidNgn) || 0;
      return s + Math.max(0, tot - paid);
    }, 0);
    return { spend, kg, gaugePrices, outstanding };
  }, [orders]);

  const insights = useMemo(() => {
    const byStatus = { Pending: 0, Approved: 0, 'On loading': 0, 'In Transit': 0, Received: 0, Rejected: 0 };
    let totalOrderedKg = 0;
    let totalReceivedKg = 0;
    let paidNgn = 0;
    let openValueNgn = 0;
    let leadDaysSum = 0;
    let leadDaysCount = 0;
    let latestPODate = '';
    const materialMix = new Map();

    for (const po of orders) {
      const status = String(po.status || '');
      if (Object.prototype.hasOwnProperty.call(byStatus, status)) byStatus[status] += 1;
      const poTotal = poTotalNgn(po);
      const poPaid = Number(po.supplierPaidNgn) || 0;
      paidNgn += poPaid;
      if (status !== 'Rejected' && status !== 'Received') {
        openValueNgn += Math.max(0, poTotal - poPaid);
      }
      if (String(po.orderDateISO || '') > latestPODate) latestPODate = String(po.orderDateISO || '');
      const lead = isoDaysBetween(po.orderDateISO, po.expectedDeliveryISO);
      if (lead != null) {
        leadDaysSum += lead;
        leadDaysCount += 1;
      }

      for (const l of po.lines || []) {
        const ordered = Number(l.qtyOrdered) || 0;
        const received = Number(l.qtyReceived) || 0;
        totalOrderedKg += ordered;
        totalReceivedKg += received;
        const key = `${l.productID || '—'}|${l.gauge || '—'}|${l.color || '—'}`;
        const row = materialMix.get(key) || {
          key,
          productID: l.productID || '—',
          gauge: l.gauge || '—',
          color: l.color || '—',
          orderedKg: 0,
          receivedKg: 0,
          poLines: 0,
        };
        row.orderedKg += ordered;
        row.receivedKg += received;
        row.poLines += 1;
        materialMix.set(key, row);
      }
    }

    const materialTop = [...materialMix.values()]
      .sort((a, b) => b.orderedKg - a.orderedKg)
      .slice(0, 8);
    const fulfillmentPct = totalOrderedKg > 0 ? Math.round((totalReceivedKg / totalOrderedKg) * 100) : 0;
    const paymentPct = stats.spend > 0 ? Math.round((paidNgn / stats.spend) * 100) : 0;
    const avgLeadDays = leadDaysCount > 0 ? Math.round(leadDaysSum / leadDaysCount) : null;
    return {
      byStatus,
      totalOrderedKg,
      totalReceivedKg,
      paidNgn,
      openValueNgn,
      fulfillmentPct,
      paymentPct,
      avgLeadDays,
      latestPODate,
      materialTop,
    };
  }, [orders, stats.spend]);

  const avgPeerPriceByGauge = useMemo(() => {
    const map = new Map();
    for (const po of purchaseOrders) {
      for (const l of po.lines) {
        if (!l.gauge || !l.unitPriceNgn) continue;
        const arr = map.get(l.gauge) || [];
        arr.push(l.unitPriceNgn);
        map.set(l.gauge, arr);
      }
    }
    const out = {};
    for (const [g, arr] of map) {
      out[g] = arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    return out;
  }, [purchaseOrders]);

  if (!supplier) {
    return (
      <PageShell>
        <PageHeader title="Supplier" subtitle="Not found" />
        <MainPanel>
          <Link to="/procurement" className="z-btn-primary inline-flex">
            <ArrowLeft size={16} /> Back to procurement
          </Link>
        </MainPanel>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={supplier.name}
        subtitle={`${supplier.supplierID} · ${supplier.city || '—'} · ${supplier.paymentTerms || '—'}`}
        actions={
          <Link to="/procurement" state={{ focusTab: 'suppliers' }} className="z-btn-secondary inline-flex">
            <ArrowLeft size={16} /> Suppliers
          </Link>
        }
      />

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
        <aside className="w-full lg:w-56 shrink-0 lg:sticky lg:top-24 space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-3 mb-2">
            On this page
          </p>
          {NAV.map((item) => {
            const NavIcon = item.icon;
            return (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToId(item.id)}
              className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-[#134e4a] hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-100 transition-all"
            >
              <NavIcon size={14} />
              {item.label}
            </button>
            );
          })}
        </aside>

        <MainPanel className="flex-1 min-w-0 !pt-0">
          <section id="sp-overview" className="rounded-zarewa border border-gray-100 bg-white shadow-sm p-5 mb-8 scroll-mt-28">
            <h3 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4 flex items-center gap-2">
              <LayoutDashboard size={16} /> Overview
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-3">
                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Total spend</p>
                <p className="text-lg font-black text-[#134e4a] tabular-nums">{formatNgn(stats.spend)}</p>
                <p className="text-[9px] text-slate-500 mt-1">{stats.kg.toLocaleString()} kg ordered</p>
              </div>
              <div className="rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-3">
                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Outstanding</p>
                <p className="text-lg font-black text-amber-800 tabular-nums">{formatNgn(stats.outstanding)}</p>
              </div>
              <div className="rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-3">
                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Quality score</p>
                <p className="text-lg font-black text-[#134e4a]">{supplier.qualityScore ?? '—'}</p>
              </div>
              <div className="rounded-lg border border-slate-200/90 bg-[#134e4a] text-white px-3 py-3">
                <p className="text-[9px] font-semibold text-white/70 uppercase tracking-wider mb-1">Orders</p>
                <p className="text-lg font-black">{orders.length}</p>
                <p className="text-[9px] text-white/70 mt-1">Last PO: {insights.latestPODate || '—'}</p>
              </div>
              <div className="rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-3">
                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Payment</p>
                <p className="text-lg font-black text-[#134e4a]">{insights.paymentPct}%</p>
                <p className="text-[9px] text-slate-500 mt-1">
                  {formatNgn(insights.paidNgn)} paid
                </p>
              </div>
              <div className="rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-3">
                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Fulfillment</p>
                <p className="text-lg font-black text-[#134e4a]">{insights.fulfillmentPct}%</p>
                <p className="text-[9px] text-slate-500 mt-1">
                  {insights.totalReceivedKg.toLocaleString()} / {insights.totalOrderedKg.toLocaleString()}kg
                </p>
              </div>
              <div className="rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-3">
                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Avg lead time</p>
                <p className="text-lg font-black text-[#134e4a]">
                  {insights.avgLeadDays != null ? `${insights.avgLeadDays}d` : '—'}
                </p>
              </div>
            </div>
          </section>

          <section id="sp-profile" className="rounded-zarewa border border-[#134e4a]/15 bg-[#134e4a]/[0.03] p-5 mb-8 scroll-mt-28">
            <p className="text-[10px] font-black text-[#134e4a] uppercase tracking-widest mb-3">
              Supplier profile
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="flex items-start gap-2">
                <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Region</span>
                  <span className="font-semibold text-gray-800">{supplier.city || '—'}</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Landmark size={14} className="text-gray-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Payment terms</span>
                  <span className="font-semibold text-gray-800">{supplier.paymentTerms || '—'}</span>
                </div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase block">Quality score</span>
                <span className="font-semibold text-gray-800">{supplier.qualityScore ?? '—'}</span>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-600 mt-4 border-t border-gray-200/80 pt-4">
              {supplier.notes || 'No supplier notes on file.'}
            </p>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {Object.entries(insights.byStatus).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-center">
                  <p className="text-[9px] uppercase font-bold text-gray-400">{k}</p>
                  <p className="text-sm font-black text-[#134e4a]">{v}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="sp-history" className="rounded-zarewa border border-gray-100 bg-white shadow-sm mb-8 scroll-mt-28">
            <div className="h-1 bg-[#134e4a]" />
            <div className="p-6 sm:p-8">
              <h3 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4 flex items-center gap-2">
                <Package size={16} /> Purchase history
              </h3>
              <div className="space-y-1.5 max-h-[460px] overflow-y-auto custom-scrollbar pr-1">
                {orders.length === 0 ? (
                  <p className="text-sm text-slate-500">No purchase orders for this supplier.</p>
                ) : (
                  orders.map((po) => (
                    <button
                      key={po.poID}
                      type="button"
                      onClick={() => setSelectedPo(po)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-2 text-left text-[11px] hover:border-teal-200 hover:bg-white transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono font-bold text-[#134e4a]">{po.poID}</span>
                        <span className="text-[10px] font-bold uppercase text-slate-500">{po.status}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {po.orderDateISO || '—'} · Invoice {po.invoiceNo || '—'} · {(po.lines || []).length} line(s)
                      </p>
                      <p className="text-[10px] font-black text-[#134e4a] tabular-nums mt-0.5">
                        {formatNgn(poTotalNgn(po))} · Paid {formatNgn(Number(po.supplierPaidNgn) || 0)}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>

          <section id="sp-mix" className="rounded-zarewa border border-gray-100 bg-white shadow-sm p-6 sm:p-8 mb-8 scroll-mt-28">
            <h4 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-3">
              Material mix supplied
            </h4>
            {insights.materialTop.length === 0 ? (
              <p className="text-xs text-slate-500">No material lines on file.</p>
            ) : (
              <ul className="space-y-2">
                {insights.materialTop.map((m) => (
                  <li
                    key={m.key}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 text-xs"
                  >
                    <p className="font-semibold text-slate-700">
                      {m.productID} · {m.gauge} · {m.color}
                    </p>
                    <p className="font-bold text-[#134e4a] tabular-nums">
                      {m.orderedKg.toLocaleString()}kg ordered · {m.receivedKg.toLocaleString()}kg received
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="sp-pricing" className="rounded-zarewa border border-gray-100 bg-white shadow-sm p-6 sm:p-8 scroll-mt-28">
            <h4 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-3 flex items-center gap-2">
              <ScrollText size={16} />
              Conversion reference and pricing guardrails
            </h4>
            <ul className="text-xs text-slate-600 space-y-1">
              {PROCUREMENT_COIL_CATALOG.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span>
                    {c.color} {c.gauge}
                  </span>
                  <span className="tabular-nums font-semibold text-[#134e4a]">
                    {c.conversionKgPerM} kg/m
                    {c.conversionKgPerM > 2.7 ? (
                      <span className="text-amber-600 ml-2">
                        (watch &gt; {CONVERSION_FLAG_RATIO * 100 - 100}% vs thin line)
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </MainPanel>
      </div>

      <ModalFrame isOpen={Boolean(selectedPo)} onClose={() => setSelectedPo(null)}>
        <div className="z-modal-panel max-w-2xl p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-xs font-bold text-[#134e4a] uppercase tracking-widest">Purchase order</p>
              <h3 className="text-lg font-black text-[#134e4a]">{selectedPo?.poID}</h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPo(null)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl hover:bg-red-50"
            >
              <X size={20} />
            </button>
          </div>
          {selectedPo ? (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-slate-500">
                Ordered {selectedPo.orderDateISO || '—'} · ETA {selectedPo.expectedDeliveryISO || '—'} · Invoice{' '}
                {selectedPo.invoiceNo || '—'} · Status {selectedPo.status || '—'}
              </p>
              <ul className="space-y-2 max-h-[45vh] overflow-y-auto custom-scrollbar">
                {(selectedPo.lines || []).map((l) => {
                  const peer = l.gauge ? avgPeerPriceByGauge[l.gauge] : null;
                  const diff =
                    peer && l.unitPriceNgn ? ((Number(l.unitPriceNgn) - peer) / peer) * 100 : null;
                  return (
                    <li
                      key={l.lineKey || l.productID}
                      className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs"
                    >
                      <p className="font-semibold text-slate-700">
                        {l.productID} · {l.color || '—'} {l.gauge || '—'}
                      </p>
                      <p className="text-slate-500 mt-0.5">
                        {Number(l.qtyOrdered || 0).toLocaleString()}kg @ {formatNgn(l.unitPriceNgn)}/kg
                      </p>
                      {diff != null ? (
                        <p className={`mt-0.5 font-semibold ${diff <= 2 ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {diff > 0 ? '+' : ''}
                          {diff.toFixed(1)}% vs avg peer
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <p className="text-right text-sm font-black text-[#134e4a] tabular-nums">
                Total {formatNgn(poTotalNgn(selectedPo))} · Paid {formatNgn(Number(selectedPo.supplierPaidNgn) || 0)}
              </p>
            </div>
          ) : null}
        </div>
      </ModalFrame>
    </PageShell>
  );
};

export default SupplierProfile;
