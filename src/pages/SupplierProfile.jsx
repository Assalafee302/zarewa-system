import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Anchor, MapPin, Wallet, TrendingUp, Package } from 'lucide-react';
import { PageHeader, PageShell, MainPanel } from '../components/layout';
import { useInventory } from '../context/InventoryContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { loadProcurementSuppliers } from '../lib/procurementSuppliersStore';
import { PROCUREMENT_COIL_CATALOG, CONVERSION_FLAG_RATIO, formatNgn } from '../Data/mockData';

function poTotalNgn(po) {
  return po.lines.reduce((s, l) => s + Number(l.qtyOrdered) * Number(l.unitPriceNgn || 0), 0);
}

const SupplierProfile = () => {
  const { supplierId } = useParams();
  const { purchaseOrders } = useInventory();
  const ws = useWorkspace();

  const supplier = useMemo(() => {
    const apiList = ws?.snapshot?.suppliers;
    if (ws?.hasWorkspaceData && Array.isArray(apiList) && apiList.length > 0) {
      return apiList.find((s) => s.supplierID === supplierId);
    }
    return loadProcurementSuppliers().find((s) => s.supplierID === supplierId);
  }, [supplierId, ws]);

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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm p-5">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
            Lifetime coil buy (demo)
          </p>
          <p className="text-2xl font-bold text-[#134e4a] tabular-nums">{formatNgn(stats.spend)}</p>
          <p className="text-[10px] text-slate-500 mt-2">{stats.kg.toLocaleString()} kg on file</p>
        </div>
        <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm p-5">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
            <Wallet size={14} /> Outstanding to supplier
          </p>
          <p className="text-2xl font-bold text-amber-800 tabular-nums">{formatNgn(stats.outstanding)}</p>
        </div>
        <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm p-5">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
            <TrendingUp size={14} /> Quality score (MD)
          </p>
          <p className="text-2xl font-bold text-[#134e4a]">{supplier.qualityScore ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-200/90 bg-[#134e4a] text-white shadow-sm p-5">
          <p className="text-[10px] font-semibold text-white/70 uppercase tracking-widest mb-2">Orders</p>
          <p className="text-2xl font-bold">{orders.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <MainPanel className="lg:col-span-1 !p-6">
          <h3 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4 flex items-center gap-2">
            <Anchor size={16} /> Profile
          </h3>
          <ul className="space-y-3 text-sm text-slate-600">
            <li className="flex items-start gap-2">
              <MapPin size={16} className="text-slate-400 shrink-0 mt-0.5" />
              <span>{supplier.city || '—'} (typical source region)</span>
            </li>
            <li>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Terms</span>
              {supplier.paymentTerms || '—'}
            </li>
            <li className="text-xs leading-relaxed text-slate-500">{supplier.notes || '—'}</li>
          </ul>
        </MainPanel>

        <MainPanel className="lg:col-span-2 !p-0 overflow-hidden">
          <div className="h-1 bg-[#134e4a]" />
          <div className="p-6 sm:p-8">
            <h3 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4 flex items-center gap-2">
              <Package size={16} /> Purchase history & price vs peers
            </h3>
            <div className="space-y-4 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
              {orders.length === 0 ? (
                <p className="text-sm text-slate-500">No purchase orders for this supplier.</p>
              ) : (
                orders.map((po) => (
                  <div
                    key={po.poID}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-sm"
                  >
                    <div className="flex flex-wrap justify-between gap-2 mb-2">
                      <span className="font-mono font-bold text-[#134e4a]">{po.poID}</span>
                      <span className="text-[10px] font-bold uppercase text-slate-500">{po.status}</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">{po.orderDateISO}</p>
                    <ul className="space-y-2 text-xs">
                      {po.lines.map((l) => {
                        const peer = l.gauge ? avgPeerPriceByGauge[l.gauge] : null;
                        const diff =
                          peer && l.unitPriceNgn
                            ? ((Number(l.unitPriceNgn) - peer) / peer) * 100
                            : null;
                        return (
                          <li
                            key={l.lineKey || l.productID}
                            className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0"
                          >
                            <span>
                              {l.color} {l.gauge} · {Number(l.qtyOrdered).toLocaleString()} kg @{' '}
                              {formatNgn(l.unitPriceNgn)}/kg
                            </span>
                            {diff != null ? (
                              <span
                                className={
                                  diff <= 2
                                    ? 'text-emerald-700 font-semibold'
                                    : 'text-amber-700 font-semibold'
                                }
                              >
                                {diff > 0 ? '+' : ''}
                                {diff.toFixed(1)}% vs avg peer
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                    <p className="text-right text-sm font-black text-[#134e4a] mt-2 tabular-nums">
                      {formatNgn(poTotalNgn(po))}
                    </p>
                  </div>
                ))
              )}
            </div>

            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-8 mb-3">
              Conversion reference (kg/m) — flag if production exceeds standard
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
          </div>
        </MainPanel>
      </div>
    </PageShell>
  );
};

export default SupplierProfile;
