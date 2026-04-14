import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRightLeft,
  Banknote,
  Gauge,
  History,
  LayoutDashboard,
  Phone,
  Route,
  Truck,
  User,
  AlertCircle,
  X,
} from 'lucide-react';
import { PageHeader, PageShell, MainPanel, ModalFrame } from '../components/layout';
import { ProcurementStatementPrintBlock } from '../components/procurement/ProcurementStatementPrintBlock';
import { useInventory } from '../context/InventoryContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { formatNgn } from '../Data/mockData';
import { purchaseOrderOrderedValueNgn } from '../lib/liveAnalytics';
import {
  poLineBenchmarkPriceNgn,
  poLinePriceSuffix,
  poLineQtyLabel,
  procurementKindFromPo,
} from '../lib/procurementPoKind';
import { buildTransportAgentIntel } from '../lib/transportAgentIntel';

const TransportAgentProfile = () => {
  const NAV = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'metrics', label: 'Haulage metrics', icon: Gauge },
    { id: 'history', label: 'Transaction history', icon: History },
  ];

  const scrollToId = (id) => {
    document.getElementById(`tap-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const { agentId } = useParams();
  const { purchaseOrders } = useInventory();
  const ws = useWorkspace();
  const [selectedPo, setSelectedPo] = useState(null);

  const agent = useMemo(() => {
    const list = ws?.snapshot?.transportAgents;
    if (!Array.isArray(list)) return undefined;
    return list.find((a) => a.id === agentId);
  }, [agentId, ws?.snapshot?.transportAgents]);

  const intel = useMemo(
    () => (agentId ? buildTransportAgentIntel(agentId, purchaseOrders) : null),
    [agentId, purchaseOrders]
  );

  const profile = agent?.profile && typeof agent.profile === 'object' ? agent.profile : {};
  const p = {
    vehicleType: profile.vehicleType || '',
    vehicleReg: profile.vehicleReg || '',
    typicalRoutes: profile.typicalRoutes || '',
    paymentPreference: profile.paymentPreference || '',
    reliabilityNotes: profile.reliabilityNotes || '',
    emergencyContact: profile.emergencyContact || '',
  };

  const avgPeerPriceByGauge = useMemo(() => {
    const map = new Map();
    for (const po of purchaseOrders) {
      if (procurementKindFromPo(po) !== 'coil') continue;
      for (const l of po.lines || []) {
        if (!l.gauge) continue;
        const pr = poLineBenchmarkPriceNgn(l, 'coil');
        if (!pr) continue;
        const arr = map.get(l.gauge) || [];
        arr.push(pr);
        map.set(l.gauge, arr);
      }
    }
    const out = {};
    for (const [g, arr] of map) {
      out[g] = arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    return out;
  }, [purchaseOrders]);

  if (!agent) {
    return (
      <PageShell>
        <PageHeader title="Transport agent" subtitle="Not found" />
        <MainPanel>
          <Link to="/procurement" state={{ focusTab: 'suppliers' }} className="z-btn-primary inline-flex">
            <ArrowLeft size={16} /> Back to procurement
          </Link>
        </MainPanel>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={agent.name}
        subtitle={`${agent.id} · ${agent.region || '—'} · ${agent.phone || '—'}`}
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
          <ProcurementStatementPrintBlock
            kind="transport"
            entityLabel={agent.name}
            agentId={agentId}
            purchaseOrders={purchaseOrders}
          />
          <section id="tap-overview" className="rounded-zarewa border border-gray-100 bg-white shadow-sm p-5 mb-8 scroll-mt-28">
            <h3 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4 flex items-center gap-2">
              <LayoutDashboard size={16} /> Overview
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-3">
                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Assignments</p>
                <p className="text-lg font-black text-[#134e4a] tabular-nums">{intel?.assignmentCount ?? 0}</p>
                <p className="text-[9px] text-slate-500 mt-1">POs linked to this agent</p>
              </div>
              <div className="rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-3">
                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">With haulage fee</p>
                <p className="text-lg font-black text-[#134e4a] tabular-nums">{intel?.withTransportFeeCount ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200/90 bg-amber-50/50 px-3 py-3">
                <p className="text-[9px] font-semibold text-amber-800 uppercase tracking-wider mb-1">On road / loading</p>
                <p className="text-lg font-black text-amber-900 tabular-nums">{intel?.inTransitOrLoading ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200/90 bg-[#134e4a] text-white px-3 py-3">
                <p className="text-[9px] font-semibold text-white/70 uppercase tracking-wider mb-1">Last PO date</p>
                <p className="text-lg font-black">{intel?.lastOrderISO || '—'}</p>
              </div>
            </div>
          </section>

          <section id="tap-profile" className="rounded-zarewa border border-[#134e4a]/15 bg-[#134e4a]/[0.03] p-5 mb-8 scroll-mt-28">
            <p className="text-[10px] font-black text-[#134e4a] uppercase tracking-widest mb-3 flex items-center gap-2">
              <User size={14} /> Contact &amp; fleet
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="flex items-start gap-2 rounded-xl border border-slate-200/70 bg-white/50 px-3 py-2.5">
                <Phone size={14} className="text-gray-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Phone</span>
                  <span className="font-semibold text-gray-800">{agent.phone || '—'}</span>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-xl border border-slate-200/70 bg-white/50 px-3 py-2.5">
                <Route size={14} className="text-gray-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Region / base</span>
                  <span className="font-semibold text-gray-800">{agent.region || '—'}</span>
                </div>
              </div>
              {p.emergencyContact ? (
                <div className="flex items-start gap-2 rounded-xl border border-slate-200/70 bg-white/50 px-3 py-2.5 sm:col-span-2">
                  <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Emergency contact</span>
                    <span className="font-semibold text-gray-800">{p.emergencyContact}</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 rounded-xl border border-teal-200/80 bg-teal-50/40 p-4">
              <p className="text-[9px] font-black text-teal-900 uppercase tracking-wider mb-3 flex items-center gap-1">
                <Truck size={12} /> Fleet &amp; operations
              </p>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <dt className="text-[10px] font-bold text-slate-400 uppercase">Vehicle type</dt>
                  <dd className="font-semibold text-slate-800 mt-0.5">{p.vehicleType || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-slate-400 uppercase">Registration</dt>
                  <dd className="font-mono font-semibold text-slate-800 mt-0.5">{p.vehicleReg || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-slate-400 uppercase">Payment preference</dt>
                  <dd className="font-semibold text-slate-800 mt-0.5">{p.paymentPreference || '—'}</dd>
                </div>
              </dl>
              {p.typicalRoutes ? (
                <p className="text-[11px] text-teal-900/90 mt-3 leading-relaxed border-t border-teal-100/80 pt-3">
                  <span className="font-bold">Typical routes: </span>
                  {p.typicalRoutes}
                </p>
              ) : null}
              {p.reliabilityNotes ? (
                <p className="text-[11px] text-slate-700 mt-2 leading-relaxed border-t border-teal-100/80 pt-3">
                  <span className="font-bold text-slate-600">Internal notes: </span>
                  {p.reliabilityNotes}
                </p>
              ) : null}
            </div>
          </section>

          {intel ? (
            <section id="tap-metrics" className="rounded-zarewa border border-gray-100 bg-white shadow-sm p-5 mb-8 scroll-mt-28">
              <h3 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4 flex items-center gap-2">
                <Gauge size={16} /> Haulage metrics
              </h3>
              <div className="mb-3 grid grid-cols-1 gap-2 text-[10px] sm:grid-cols-4">
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                  <p className="text-slate-500 font-semibold uppercase tracking-wide">Coil kg (sum)</p>
                  <p className="text-[11px] font-bold text-slate-800 tabular-nums">
                    {intel.totalCoilKg > 0 ? `${Math.round(intel.totalCoilKg).toLocaleString()} kg` : '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                  <p className="text-slate-500 font-semibold uppercase tracking-wide">Total fees</p>
                  <p className="text-[11px] font-bold text-[#134e4a] tabular-nums">{formatNgn(intel.totalTransportNgn)}</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                  <p className="text-slate-500 font-semibold uppercase tracking-wide">Paid (file)</p>
                  <p className="text-[11px] font-bold text-slate-800 tabular-nums">{formatNgn(intel.totalPaidTransportNgn)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-900">
                  Avg ₦/kg (weighted, coil):{' '}
                  {intel.weightedAvgTransportPerKgNgn != null
                    ? formatNgn(Math.round(intel.weightedAvgTransportPerKgNgn))
                    : '—'}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">
                  Avg ₦/kg (simple across POs):{' '}
                  {intel.simpleAvgTransportPerKgNgn != null
                    ? formatNgn(Math.round(intel.simpleAvgTransportPerKgNgn))
                    : '—'}
                </span>
              </div>
              <p className="text-[9px] text-slate-500 leading-snug mt-2">
                Weighted average uses total fees over total coil kg on POs with both recorded. Non-coil lines do not add kg.
              </p>
            </section>
          ) : null}

          <section id="tap-history" className="rounded-zarewa border border-gray-100 bg-white shadow-sm p-5 mb-8 scroll-mt-28">
            <h3 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4 flex items-center gap-2">
              <History size={16} /> Transaction history
            </h3>
            {intel?.history?.length ? (
              <ul className="space-y-2">
                {intel.history.map((h) => (
                  <li key={h.poID}>
                    <button
                      type="button"
                      onClick={() => {
                        const po = purchaseOrders.find((x) => x.poID === h.poID);
                        if (po) setSelectedPo(po);
                      }}
                      className="w-full text-left rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 hover:border-[#134e4a]/40 hover:bg-[#134e4a]/[0.03] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-[#134e4a] truncate">
                            <span className="font-mono">{h.poID}</span>
                            <span className="font-medium text-slate-600"> · {h.supplierName}</span>
                          </p>
                          <p className="text-[9px] text-slate-500 mt-0.5">
                            {h.orderDateISO || '—'} · {h.status}
                            {h.procurementKind !== 'coil' ? ` · ${h.procurementKind}` : ''}
                          </p>
                        </div>
                        <ArrowRightLeft size={14} className="text-slate-300 shrink-0 mt-0.5" />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[9px]">
                        <span className="font-mono tabular-nums text-slate-700">{h.orderQtyLabel}</span>
                        <span className="text-slate-400">|</span>
                        <span className="font-semibold text-slate-800">Fee {formatNgn(h.transportAmountNgn)}</span>
                        {h.transportPerKgNgn != null ? (
                          <>
                            <span className="text-slate-400">|</span>
                            <span className="text-sky-800 font-semibold">
                              {formatNgn(Math.round(h.transportPerKgNgn))}/kg
                            </span>
                          </>
                        ) : null}
                        {h.transportReference ? (
                          <>
                            <span className="text-slate-400">|</span>
                            <span className="text-slate-600">Ref {h.transportReference}</span>
                          </>
                        ) : null}
                        {h.transportPaid ? (
                          <span className="rounded px-1 bg-emerald-50 text-emerald-800 font-semibold">Paid</span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500 text-center py-8 border border-dashed border-slate-200 rounded-lg">
                No purchase orders linked to this agent yet.
              </p>
            )}
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
              <p className="text-xs text-slate-600">
                Transport: {selectedPo.transportAgentName || '—'} · Fee {formatNgn(Number(selectedPo.transportAmountNgn) || 0)}
                {selectedPo.transportReference ? ` · Ref ${selectedPo.transportReference}` : ''}
              </p>
              <ul className="space-y-2 max-h-[45vh] overflow-y-auto custom-scrollbar">
                {(selectedPo.lines || []).map((l) => {
                  const lineKind = procurementKindFromPo(selectedPo);
                  const bench = poLineBenchmarkPriceNgn(l, lineKind);
                  const peer = lineKind === 'coil' && l.gauge ? avgPeerPriceByGauge[l.gauge] : null;
                  const diff = peer && bench > 0 ? ((bench - peer) / peer) * 100 : null;
                  const sfx = poLinePriceSuffix(lineKind);
                  return (
                    <li
                      key={l.lineKey || l.productID}
                      className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs"
                    >
                      <p className="font-semibold text-slate-700">
                        {l.productID} · {l.color || '—'} {l.gauge || '—'}
                      </p>
                      <p className="text-slate-500 mt-0.5">
                        {poLineQtyLabel(l, lineKind)} @ {formatNgn(bench)}
                        {sfx}
                      </p>
                      {diff != null ? (
                        <p className={`mt-0.5 font-semibold ${diff <= 2 ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {diff > 0 ? '+' : ''}
                          {diff.toFixed(1)}% vs avg peer (₦/kg)
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <p className="text-right text-sm font-black text-[#134e4a] tabular-nums">
                Total {formatNgn(purchaseOrderOrderedValueNgn(selectedPo))} · Paid{' '}
                {formatNgn(Number(selectedPo.supplierPaidNgn) || 0)}
              </p>
            </div>
          ) : null}
        </div>
      </ModalFrame>
    </PageShell>
  );
};

export default TransportAgentProfile;
