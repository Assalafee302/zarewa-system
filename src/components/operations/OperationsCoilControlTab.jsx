import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  Factory,
  Ruler,
  Scissors,
  Truck,
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import { ModalFrame } from '../layout/ModalFrame';
import { AppTable, AppTableBody, AppTableTh, AppTableThead, AppTableTr, AppTableWrap } from '../ui/AppDataTable';

/** Current kg on the coil (after production use); uses API fields when present. */
function liveCoilWeightKg(lot) {
  if (lot.currentWeightKg != null && lot.currentWeightKg !== '') {
    const cw = Number(lot.currentWeightKg);
    if (Number.isFinite(cw)) return Math.max(0, cw);
  }
  if (lot.qtyRemaining != null && lot.qtyRemaining !== '') {
    const qr = Number(lot.qtyRemaining);
    if (Number.isFinite(qr)) return Math.max(0, qr);
  }
  const w = Number(lot.weightKg);
  if (Number.isFinite(w) && w > 0) return w;
  const q = Number(lot.qtyReceived);
  return Number.isFinite(q) ? Math.max(0, q) : 0;
}

const KIND_LABELS = {
  scrap_offcut: 'Scrap / offcut',
  adjust_add_kg: 'Coil adjust +kg',
  adjust_remove_kg: 'Coil adjust −kg',
  return_inward_pool: 'Return inward (offcut pool)',
  return_outward: 'Return outward',
  coil_open_trim: 'Coil open — head trim',
  supplier_defect: 'Supplier defect',
};

const OUTBOUND_DEST = [
  { id: 'supplier_return', label: 'Return to supplier' },
  { id: 'disposal', label: 'Disposal / scrap yard' },
  { id: 'other', label: 'Other' },
];

const SUPPLIER_RESOLUTIONS = [
  'credit_note',
  'price_discount',
  'return_shipment',
  'logged_pending',
  'other',
];

function kindLabel(k) {
  return KIND_LABELS[k] || k || '—';
}

function ModalPanel({ title, children, onClose, footer }) {
  return (
    <div className="mx-auto w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="text-base font-black uppercase tracking-wide text-[#134e4a]">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100"
        >
          Close
        </button>
      </div>
      <div className="space-y-4">{children}</div>
      {footer ? <div className="mt-6 flex flex-wrap gap-2">{footer}</div> : null}
    </div>
  );
}

/**
 * Store & production → Coil control: ledger adjustments, scrap/offcut (metres + book ref),
 * return inward to offcut pool, return outward, open-coil head trim, supplier defect log.
 */
export default function OperationsCoilControlTab() {
  const { show: showToast } = useToast();
  const ws = useWorkspace();
  const { products: inventoryRows, coilLots, coilControlEvents } = useInventory();

  const cuttingLists = useMemo(
    () => (Array.isArray(ws?.snapshot?.cuttingLists) ? ws.snapshot.cuttingLists : []),
    [ws?.snapshot?.cuttingLists]
  );

  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');

  const defaultDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [adjustForm, setAdjustForm] = useState({
    coilNo: '',
    kgDelta: '',
    note: '',
    bookRef: '',
    cuttingListRef: '',
    quotationRef: '',
    date: '',
  });
  const [scrapForm, setScrapForm] = useState({
    coilNo: '',
    kg: '',
    meters: '',
    bookRef: '',
    cuttingListRef: '',
    quotationRef: '',
    reason: 'Off-cut removed',
    note: '',
    date: '',
    creditScrapInventory: true,
    scrapProductID: 'SCRAP-COIL',
  });
  const [returnInForm, setReturnInForm] = useState({
    productID: '',
    gaugeLabel: '',
    colour: '',
    meters: '',
    kgBook: '',
    bookRef: '',
    cuttingListRef: '',
    quotationRef: '',
    customerLabel: '',
    coilNo: '',
    note: '',
    date: '',
  });
  const [returnOutForm, setReturnOutForm] = useState({
    coilNo: '',
    kg: '',
    meters: '',
    outboundDestination: 'disposal',
    bookRef: '',
    note: '',
    date: '',
  });
  const [headForm, setHeadForm] = useState({
    coilNo: '',
    meters: '',
    kg: '',
    bookRef: '',
    cuttingListRef: '',
    quotationRef: '',
    note: '',
    date: '',
    creditScrapInventory: true,
  });
  const [defectForm, setDefectForm] = useState({
    coilNo: '',
    supplierID: '',
    defectMFrom: '',
    defectMTo: '',
    supplierResolution: 'logged_pending',
    kgRemove: '',
    bookRef: '',
    note: '',
    date: '',
  });

  useEffect(() => {
    setAdjustForm((s) => ({ ...s, date: s.date || defaultDate }));
    setScrapForm((s) => ({ ...s, date: s.date || defaultDate }));
    setReturnInForm((s) => ({ ...s, date: s.date || defaultDate }));
    setReturnOutForm((s) => ({ ...s, date: s.date || defaultDate }));
    setHeadForm((s) => ({ ...s, date: s.date || defaultDate }));
    setDefectForm((s) => ({ ...s, date: s.date || defaultDate }));
  }, [defaultDate]);

  const sortedCoils = useMemo(
    () => [...coilLots].sort((a, b) => String(a.coilNo || '').localeCompare(String(b.coilNo || ''))),
    [coilLots]
  );

  const events = useMemo(() => (Array.isArray(coilControlEvents) ? coilControlEvents : []), [coilControlEvents]);

  const filteredEvents = useMemo(() => {
    if (historyFilter === 'all') return events;
    if (historyFilter === 'pool') {
      return events.filter((e) => e.eventKind === 'return_inward_pool');
    }
    if (historyFilter === 'scrap') {
      return events.filter((e) => e.eventKind === 'scrap_offcut' || e.eventKind === 'coil_open_trim');
    }
    if (historyFilter === 'supplier') {
      return events.filter((e) => e.eventKind === 'supplier_defect');
    }
    return events.filter((e) => e.eventKind === historyFilter);
  }, [events, historyFilter]);

  const poolTotals = useMemo(() => {
    let meters = 0;
    for (const e of events) {
      if (e.eventKind === 'return_inward_pool' && e.meters != null && Number.isFinite(Number(e.meters))) {
        meters += Number(e.meters);
      }
    }
    return { meters };
  }, [events]);

  const submitAdjust = async (e) => {
    e.preventDefault();
    const coilNo = adjustForm.coilNo.trim();
    const kgDelta = Number(adjustForm.kgDelta);
    if (!coilNo) return showToast('Select a coil.', { variant: 'error' });
    if (!Number.isFinite(kgDelta) || kgDelta === 0) return showToast('Enter a non-zero kg delta (+ or −).', { variant: 'error' });
    if (!ws?.canMutate) return showToast('Workspace is read-only.', { variant: 'error' });
    setSaving(true);
    try {
      const { ok, data } = await apiFetch('/api/coil-control/ledger-adjustment', {
        method: 'POST',
        body: JSON.stringify({
          coilNo,
          kgDelta,
          note: adjustForm.note.trim(),
          bookRef: adjustForm.bookRef.trim() || undefined,
          cuttingListRef: adjustForm.cuttingListRef.trim() || undefined,
          quotationRef: adjustForm.quotationRef.trim() || undefined,
          dateISO: adjustForm.date || defaultDate,
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Adjustment failed.', { variant: 'error' });
        return;
      }
      await ws.refresh();
      showToast('Coil ledger adjustment saved.');
      setModal(null);
    } finally {
      setSaving(false);
    }
  };

  const submitScrap = async (e) => {
    e.preventDefault();
    const coilNo = scrapForm.coilNo.trim();
    const kg = Number(scrapForm.kg);
    const meters = scrapForm.meters.trim() ? Number(scrapForm.meters) : null;
    if (!coilNo) return showToast('Select a coil.', { variant: 'error' });
    if (!Number.isFinite(kg) || kg <= 0) return showToast('Enter scrap kg removed from the coil.', { variant: 'error' });
    if (!ws?.canMutate) return showToast('Workspace is read-only.', { variant: 'error' });
    setSaving(true);
    try {
      const { ok, data } = await apiFetch(`/api/coil-lots/${encodeURIComponent(coilNo)}/scrap`, {
        method: 'POST',
        body: JSON.stringify({
          kg,
          reason: scrapForm.reason,
          note: scrapForm.note.trim(),
          dateISO: scrapForm.date || defaultDate,
          creditScrapInventory: Boolean(scrapForm.creditScrapInventory),
          scrapProductID: scrapForm.scrapProductID.trim() || 'SCRAP-COIL',
          meters: Number.isFinite(meters) ? meters : undefined,
          bookRef: scrapForm.bookRef.trim() || undefined,
          cuttingListRef: scrapForm.cuttingListRef.trim() || undefined,
          quotationRef: scrapForm.quotationRef.trim() || undefined,
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Scrap posting failed.', { variant: 'error' });
        return;
      }
      await ws.refresh();
      showToast(`Scrap posted — ${kg} kg off ${coilNo}.`);
      setModal(null);
    } finally {
      setSaving(false);
    }
  };

  const submitReturnIn = async (e) => {
    e.preventDefault();
    if (!ws?.canMutate) return showToast('Workspace is read-only.', { variant: 'error' });
    setSaving(true);
    try {
      const { ok, data } = await apiFetch('/api/coil-control/return-inward', {
        method: 'POST',
        body: JSON.stringify({
          productID: returnInForm.productID.trim(),
          gaugeLabel: returnInForm.gaugeLabel.trim(),
          colour: returnInForm.colour.trim(),
          meters: Number(returnInForm.meters),
          kgBook: returnInForm.kgBook.trim() ? Number(returnInForm.kgBook) : undefined,
          bookRef: returnInForm.bookRef.trim(),
          cuttingListRef: returnInForm.cuttingListRef.trim() || undefined,
          quotationRef: returnInForm.quotationRef.trim() || undefined,
          customerLabel: returnInForm.customerLabel.trim() || undefined,
          coilNo: returnInForm.coilNo.trim() || undefined,
          note: returnInForm.note.trim(),
          dateISO: returnInForm.date || defaultDate,
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not save return inward.', { variant: 'error' });
        return;
      }
      await ws.refresh();
      showToast(`Offcut pool entry ${data.id || ''} saved (${returnInForm.meters} m).`);
      setModal(null);
    } finally {
      setSaving(false);
    }
  };

  const submitReturnOut = async (e) => {
    e.preventDefault();
    const coilNo = returnOutForm.coilNo.trim();
    const kg = Number(returnOutForm.kg);
    const meters = returnOutForm.meters.trim() ? Number(returnOutForm.meters) : undefined;
    if (!coilNo) return showToast('Select a coil.', { variant: 'error' });
    if (!Number.isFinite(kg) || kg <= 0) return showToast('Enter kg removed from the coil.', { variant: 'error' });
    if (!ws?.canMutate) return showToast('Workspace is read-only.', { variant: 'error' });
    setSaving(true);
    try {
      const { ok, data } = await apiFetch('/api/coil-control/return-outward', {
        method: 'POST',
        body: JSON.stringify({
          coilNo,
          kg,
          meters,
          outboundDestination: returnOutForm.outboundDestination,
          bookRef: returnOutForm.bookRef.trim() || undefined,
          note: returnOutForm.note.trim(),
          dateISO: returnOutForm.date || defaultDate,
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Return outward failed.', { variant: 'error' });
        return;
      }
      await ws.refresh();
      showToast('Return outward posted.');
      setModal(null);
    } finally {
      setSaving(false);
    }
  };

  const submitHead = async (e) => {
    e.preventDefault();
    const coilNo = headForm.coilNo.trim();
    const meters = Number(headForm.meters);
    const kg = Number(headForm.kg);
    if (!coilNo) return showToast('Select a coil.', { variant: 'error' });
    if (!Number.isFinite(meters) || meters <= 0) return showToast('Enter head trim metres.', { variant: 'error' });
    if (!Number.isFinite(kg) || kg <= 0) return showToast('Enter kg removed from the coil for the head trim.', { variant: 'error' });
    if (!ws?.canMutate) return showToast('Workspace is read-only.', { variant: 'error' });
    setSaving(true);
    try {
      const { ok, data } = await apiFetch('/api/coil-control/open-head-trim', {
        method: 'POST',
        body: JSON.stringify({
          coilNo,
          meters,
          kg,
          bookRef: headForm.bookRef.trim() || undefined,
          cuttingListRef: headForm.cuttingListRef.trim() || undefined,
          quotationRef: headForm.quotationRef.trim() || undefined,
          note: headForm.note.trim(),
          dateISO: headForm.date || defaultDate,
          creditScrapInventory: Boolean(headForm.creditScrapInventory),
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Head trim failed.', { variant: 'error' });
        return;
      }
      await ws.refresh();
      showToast('Open-coil head trim recorded (production register).');
      setModal(null);
    } finally {
      setSaving(false);
    }
  };

  const submitDefect = async (e) => {
    e.preventDefault();
    const coilNo = defectForm.coilNo.trim();
    if (!coilNo) return showToast('Select a coil.', { variant: 'error' });
    if (!defectForm.supplierResolution) return showToast('Select supplier resolution.', { variant: 'error' });
    if (!ws?.canMutate) return showToast('Workspace is read-only.', { variant: 'error' });
    const kgRemove = defectForm.kgRemove.trim() ? Number(defectForm.kgRemove) : 0;
    const defectMFrom = defectForm.defectMFrom.trim() ? Number(defectForm.defectMFrom) : undefined;
    const defectMTo = defectForm.defectMTo.trim() ? Number(defectForm.defectMTo) : undefined;
    setSaving(true);
    try {
      const { ok, data } = await apiFetch('/api/coil-control/supplier-defect', {
        method: 'POST',
        body: JSON.stringify({
          coilNo,
          supplierID: defectForm.supplierID.trim() || undefined,
          defectMFrom,
          defectMTo,
          supplierResolution: defectForm.supplierResolution,
          kgRemove: Number.isFinite(kgRemove) && kgRemove > 0 ? kgRemove : undefined,
          bookRef: defectForm.bookRef.trim() || undefined,
          note: defectForm.note.trim(),
          dateISO: defectForm.date || defaultDate,
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Supplier defect log failed.', { variant: 'error' });
        return;
      }
      await ws.refresh();
      showToast('Supplier defect recorded.');
      setModal(null);
    } finally {
      setSaving(false);
    }
  };

  const fillFromCoil = (coilNo, setter) => {
    const c = sortedCoils.find((x) => x.coilNo === coilNo);
    if (!c) return;
    setter((prev) => ({
      ...prev,
      coilNo: c.coilNo,
      productID: c.productID || prev.productID,
      gaugeLabel: c.gaugeLabel || prev.gaugeLabel,
      colour: c.colour || prev.colour,
      supplierID: c.supplierID || prev.supplierID,
    }));
  };

  return (
    <div className="space-y-6">
      <p className="text-[11px] text-slate-500 max-w-3xl leading-relaxed">
        Post audited movements with <strong className="font-semibold text-slate-600">book references</strong> and{' '}
        <strong className="font-semibold text-slate-600">metres</strong> where the material is tracked by length (returns
        to the offcut pool, head trim, defects). Customer returns go to the{' '}
        <strong className="font-semibold text-slate-600">offcut pool</strong> (not back onto the live coil kg). Use{' '}
        <strong className="font-semibold text-slate-600">coil kg adjustment</strong> only for weighbridge / roll
        corrections on the active coil.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setModal('adjust')}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wide text-[#134e4a] shadow-sm hover:bg-slate-50"
        >
          <Ruler size={14} aria-hidden />
          Coil kg adjustment
        </button>
        <button
          type="button"
          onClick={() => setModal('scrap')}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wide text-[#134e4a] shadow-sm hover:bg-slate-50"
        >
          <Scissors size={14} aria-hidden />
          Scrap / offcut
        </button>
        <button
          type="button"
          onClick={() => setModal('returnIn')}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wide text-[#134e4a] shadow-sm hover:bg-slate-50"
        >
          <ArrowDownToLine size={14} aria-hidden />
          Return inward (offcut pool)
        </button>
        <button
          type="button"
          onClick={() => setModal('returnOut')}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wide text-[#134e4a] shadow-sm hover:bg-slate-50"
        >
          <ArrowUpFromLine size={14} aria-hidden />
          Return outward
        </button>
        <button
          type="button"
          onClick={() => setModal('head')}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wide text-[#134e4a] shadow-sm hover:bg-slate-50"
        >
          <Factory size={14} aria-hidden />
          Open coil — head trim
        </button>
        <button
          type="button"
          onClick={() => setModal('supplier')}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wide text-[#134e4a] shadow-sm hover:bg-slate-50"
        >
          <Truck size={14} aria-hidden />
          Supplier defect
        </button>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-[#134e4a]" aria-hidden />
            <h2 className="text-sm font-black uppercase tracking-wide text-[#134e4a]">Coil control register</h2>
          </div>
          <p className="text-[10px] font-semibold text-slate-600">
            Offcut pool (returns inward):{' '}
            <span className="font-mono tabular-nums text-[#134e4a]">{poolTotals.meters.toFixed(2)} m</span> total
            recorded
          </p>
        </div>
        <div className="mb-3 flex flex-wrap gap-1">
          {[
            { id: 'all', label: 'All' },
            { id: 'scrap', label: 'Scrap & head' },
            { id: 'pool', label: 'Return inward pool' },
            { id: 'adjust_add_kg', label: '+kg adjust' },
            { id: 'adjust_remove_kg', label: '−kg adjust' },
            { id: 'return_outward', label: 'Outward' },
            { id: 'supplier_defect', label: 'Supplier' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setHistoryFilter(t.id)}
              className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${
                historyFilter === t.id ? 'bg-[#134e4a] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <AppTableWrap>
          <AppTable role="numeric">
            <AppTableThead>
              <tr>
                <AppTableTh>When</AppTableTh>
                <AppTableTh>Kind</AppTableTh>
                <AppTableTh>Ref</AppTableTh>
                <AppTableTh>Coil</AppTableTh>
                <AppTableTh align="right">m</AppTableTh>
                <AppTableTh align="right">Δ kg coil</AppTableTh>
                <AppTableTh align="right">Book kg</AppTableTh>
                <AppTableTh>Gauge / colour</AppTableTh>
                <AppTableTh>Note</AppTableTh>
              </tr>
            </AppTableThead>
            <AppTableBody>
              {filteredEvents.length === 0 ? (
                <AppTableTr>
                  <td colSpan={9} className="px-3 py-6 text-center text-xs text-slate-500">
                    No rows for this filter yet.
                  </td>
                </AppTableTr>
              ) : (
                filteredEvents.map((r) => (
                  <AppTableTr key={r.id}>
                    <td className="px-3 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap">
                      {r.dateISO || r.createdAtISO?.slice(0, 10) || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700">{kindLabel(r.eventKind)}</td>
                    <td className="px-3 py-2 text-[10px] font-mono text-slate-600">{r.bookRef || r.id}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.coilNo ? (
                        <Link
                          to={`/operations/coils/${encodeURIComponent(r.coilNo)}`}
                          className="font-semibold text-sky-800 underline underline-offset-2"
                        >
                          {r.coilNo}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums">
                      {r.meters != null && Number.isFinite(Number(r.meters)) ? Number(r.meters).toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums">
                      {r.kgCoilDelta ? Number(r.kgCoilDelta).toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums">
                      {r.kgBook != null && Number.isFinite(Number(r.kgBook)) ? Number(r.kgBook).toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-slate-600 max-w-[10rem] truncate" title={`${r.gaugeLabel} ${r.colour}`}>
                      {r.gaugeLabel || '—'} · {r.colour || '—'}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-slate-500 max-w-[14rem] truncate" title={r.note}>
                      {r.cuttingListRef ? `CL ${r.cuttingListRef} · ` : ''}
                      {r.quotationRef ? `QT ${r.quotationRef} · ` : ''}
                      {r.note || '—'}
                    </td>
                  </AppTableTr>
                ))
              )}
            </AppTableBody>
          </AppTable>
        </AppTableWrap>
      </section>

      <ModalFrame isOpen={modal === 'adjust'} onClose={() => !saving && setModal(null)} title="Coil kg adjustment">
        <ModalPanel title="Coil kg adjustment" onClose={() => !saving && setModal(null)}>
          <form className="space-y-3" onSubmit={submitAdjust}>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Coil</label>
            <select
              required
              value={adjustForm.coilNo}
              onChange={(e) => setAdjustForm((s) => ({ ...s, coilNo: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
            >
              <option value="">Select…</option>
              {sortedCoils.map((c) => (
                <option key={c.coilNo} value={c.coilNo}>
                  {c.coilNo} · {liveCoilWeightKg(c).toFixed(0)} kg
                </option>
              ))}
            </select>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Kg delta (+ add to roll, − remove)</label>
            <input
              required
              type="number"
              step="0.01"
              value={adjustForm.kgDelta}
              onChange={(e) => setAdjustForm((s) => ({ ...s, kgDelta: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
            />
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Book ref (optional)</label>
            <input
              value={adjustForm.bookRef}
              onChange={(e) => setAdjustForm((s) => ({ ...s, bookRef: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Cutting list</label>
                <select
                  value={adjustForm.cuttingListRef}
                  onChange={(e) => setAdjustForm((s) => ({ ...s, cuttingListRef: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
                >
                  <option value="">—</option>
                  {cuttingLists.slice(0, 200).map((cl) => (
                    <option key={cl.id} value={cl.id}>
                      {cl.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Quotation ref</label>
                <input
                  value={adjustForm.quotationRef}
                  onChange={(e) => setAdjustForm((s) => ({ ...s, quotationRef: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
                />
              </div>
            </div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Note</label>
            <textarea
              rows={2}
              value={adjustForm.note}
              onChange={(e) => setAdjustForm((s) => ({ ...s, note: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none resize-none"
            />
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Date</label>
            <input
              type="date"
              required
              value={adjustForm.date}
              onChange={(e) => setAdjustForm((s) => ({ ...s, date: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
            />
            <button type="submit" disabled={saving} className="z-btn-primary w-full justify-center py-3 disabled:opacity-50">
              {saving ? 'Saving…' : 'Post adjustment'}
            </button>
          </form>
        </ModalPanel>
      </ModalFrame>

      <ModalFrame isOpen={modal === 'scrap'} onClose={() => !saving && setModal(null)} title="Scrap / offcut">
        <ModalPanel title="Scrap / offcut" onClose={() => !saving && setModal(null)}>
          <form className="space-y-3" onSubmit={submitScrap}>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Coil</label>
            <select
              required
              value={scrapForm.coilNo}
              onChange={(e) => {
                const v = e.target.value;
                setScrapForm((s) => ({ ...s, coilNo: v }));
              }}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
            >
              <option value="">Select…</option>
              {sortedCoils.map((c) => (
                <option key={c.coilNo} value={c.coilNo}>
                  {c.coilNo} · max {Math.max(0, liveCoilWeightKg(c) - (Number(c.qtyReserved) || 0)).toFixed(0)} kg
                </option>
              ))}
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Kg off coil</label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={scrapForm.kg}
                  onChange={(e) => setScrapForm((s) => ({ ...s, kg: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Metres (offcut length)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={scrapForm.meters}
                  onChange={(e) => setScrapForm((s) => ({ ...s, meters: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
            </div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Book / offcut no.</label>
            <input
              value={scrapForm.bookRef}
              onChange={(e) => setScrapForm((s) => ({ ...s, bookRef: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Cutting list</label>
                <select
                  value={scrapForm.cuttingListRef}
                  onChange={(e) => setScrapForm((s) => ({ ...s, cuttingListRef: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
                >
                  <option value="">—</option>
                  {cuttingLists.slice(0, 200).map((cl) => (
                    <option key={cl.id} value={cl.id}>
                      {cl.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Quotation ref</label>
                <input
                  value={scrapForm.quotationRef}
                  onChange={(e) => setScrapForm((s) => ({ ...s, quotationRef: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
                />
              </div>
            </div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Reason</label>
            <select
              value={scrapForm.reason}
              onChange={(e) => setScrapForm((s) => ({ ...s, reason: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
            >
              {['Off-cut removed', 'Damage', 'Production error / trim', 'Return — unusable', 'Other'].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Note</label>
            <textarea
              rows={2}
              value={scrapForm.note}
              onChange={(e) => setScrapForm((s) => ({ ...s, note: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none resize-none"
            />
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={scrapForm.creditScrapInventory}
                onChange={(e) => setScrapForm((s) => ({ ...s, creditScrapInventory: e.target.checked }))}
                className="rounded border-slate-300"
              />
              Credit scrap inventory SKU
            </label>
            {scrapForm.creditScrapInventory ? (
              <select
                value={scrapForm.scrapProductID}
                onChange={(e) => setScrapForm((s) => ({ ...s, scrapProductID: e.target.value }))}
                className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
              >
                {inventoryRows.map((r) => (
                  <option key={r.productID} value={r.productID}>
                    {r.productID} — {r.name}
                  </option>
                ))}
              </select>
            ) : null}
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Date</label>
            <input
              type="date"
              required
              value={scrapForm.date}
              onChange={(e) => setScrapForm((s) => ({ ...s, date: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
            />
            <button type="submit" disabled={saving} className="z-btn-primary w-full justify-center py-3 disabled:opacity-50">
              {saving ? 'Posting…' : 'Post scrap'}
            </button>
          </form>
        </ModalPanel>
      </ModalFrame>

      <ModalFrame isOpen={modal === 'returnIn'} onClose={() => !saving && setModal(null)} title="Return inward">
        <ModalPanel title="Return inward (offcut pool)" onClose={() => !saving && setModal(null)}>
          <form className="space-y-3" onSubmit={submitReturnIn}>
            <p className="text-[10px] text-slate-600 leading-snug">
              Gauge and colour must match your quotation rules exactly. Optional source coil is for traceability only.
            </p>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Optional source coil</label>
            <select
              value={returnInForm.coilNo}
              onChange={(e) => {
                const v = e.target.value;
                setReturnInForm((s) => ({ ...s, coilNo: v }));
                if (v) fillFromCoil(v, setReturnInForm);
              }}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
            >
              <option value="">None</option>
              {sortedCoils.map((c) => (
                <option key={c.coilNo} value={c.coilNo}>
                  {c.coilNo}
                </option>
              ))}
            </select>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Raw product SKU</label>
            <select
              required
              value={returnInForm.productID}
              onChange={(e) => setReturnInForm((s) => ({ ...s, productID: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
            >
              <option value="">Select…</option>
              {inventoryRows
                .filter((r) => !String(r.productID || '').startsWith('FG-'))
                .map((r) => (
                  <option key={r.productID} value={r.productID}>
                    {r.productID} — {r.name}
                  </option>
                ))}
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Gauge</label>
                <input
                  required
                  value={returnInForm.gaugeLabel}
                  onChange={(e) => setReturnInForm((s) => ({ ...s, gaugeLabel: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Colour</label>
                <input
                  required
                  value={returnInForm.colour}
                  onChange={(e) => setReturnInForm((s) => ({ ...s, colour: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Metres</label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={returnInForm.meters}
                  onChange={(e) => setReturnInForm((s) => ({ ...s, meters: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Book kg (optional)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={returnInForm.kgBook}
                  onChange={(e) => setReturnInForm((s) => ({ ...s, kgBook: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
            </div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Book / transaction no. *</label>
            <input
              required
              value={returnInForm.bookRef}
              onChange={(e) => setReturnInForm((s) => ({ ...s, bookRef: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Cutting list</label>
                <select
                  value={returnInForm.cuttingListRef}
                  onChange={(e) => setReturnInForm((s) => ({ ...s, cuttingListRef: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
                >
                  <option value="">—</option>
                  {cuttingLists.slice(0, 200).map((cl) => (
                    <option key={cl.id} value={cl.id}>
                      {cl.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Quotation ref</label>
                <input
                  value={returnInForm.quotationRef}
                  onChange={(e) => setReturnInForm((s) => ({ ...s, quotationRef: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
                />
              </div>
            </div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Customer label</label>
            <input
              value={returnInForm.customerLabel}
              onChange={(e) => setReturnInForm((s) => ({ ...s, customerLabel: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
            />
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Note</label>
            <textarea
              rows={2}
              value={returnInForm.note}
              onChange={(e) => setReturnInForm((s) => ({ ...s, note: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none resize-none"
            />
            <input
              type="date"
              required
              value={returnInForm.date}
              onChange={(e) => setReturnInForm((s) => ({ ...s, date: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
            />
            <button type="submit" disabled={saving} className="z-btn-primary w-full justify-center py-3 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save to offcut pool'}
            </button>
          </form>
        </ModalPanel>
      </ModalFrame>

      <ModalFrame isOpen={modal === 'returnOut'} onClose={() => !saving && setModal(null)} title="Return outward">
        <ModalPanel title="Return outward" onClose={() => !saving && setModal(null)}>
          <form className="space-y-3" onSubmit={submitReturnOut}>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Coil</label>
            <select
              required
              value={returnOutForm.coilNo}
              onChange={(e) => setReturnOutForm((s) => ({ ...s, coilNo: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
            >
              <option value="">Select…</option>
              {sortedCoils.map((c) => (
                <option key={c.coilNo} value={c.coilNo}>
                  {c.coilNo}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Kg removed from coil</label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={returnOutForm.kg}
                  onChange={(e) => setReturnOutForm((s) => ({ ...s, kg: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Metres (optional)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={returnOutForm.meters}
                  onChange={(e) => setReturnOutForm((s) => ({ ...s, meters: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
            </div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Destination</label>
            <select
              value={returnOutForm.outboundDestination}
              onChange={(e) => setReturnOutForm((s) => ({ ...s, outboundDestination: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
            >
              {OUTBOUND_DEST.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Book ref (optional)</label>
            <input
              value={returnOutForm.bookRef}
              onChange={(e) => setReturnOutForm((s) => ({ ...s, bookRef: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
            />
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Note</label>
            <textarea
              rows={2}
              value={returnOutForm.note}
              onChange={(e) => setReturnOutForm((s) => ({ ...s, note: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none resize-none"
            />
            <input
              type="date"
              required
              value={returnOutForm.date}
              onChange={(e) => setReturnOutForm((s) => ({ ...s, date: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
            />
            <button type="submit" disabled={saving} className="z-btn-primary w-full justify-center py-3 disabled:opacity-50">
              {saving ? 'Posting…' : 'Post return outward'}
            </button>
          </form>
        </ModalPanel>
      </ModalFrame>

      <ModalFrame isOpen={modal === 'head'} onClose={() => !saving && setModal(null)} title="Head trim">
        <ModalPanel title="Open coil — head trim" onClose={() => !saving && setModal(null)}>
          <form className="space-y-3" onSubmit={submitHead}>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Coil</label>
            <select
              required
              value={headForm.coilNo}
              onChange={(e) => setHeadForm((s) => ({ ...s, coilNo: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
            >
              <option value="">Select…</option>
              {sortedCoils.map((c) => (
                <option key={c.coilNo} value={c.coilNo}>
                  {c.coilNo}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Metres trimmed</label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={headForm.meters}
                  onChange={(e) => setHeadForm((s) => ({ ...s, meters: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Kg off coil</label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={headForm.kg}
                  onChange={(e) => setHeadForm((s) => ({ ...s, kg: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
            </div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Book ref (optional)</label>
            <input
              value={headForm.bookRef}
              onChange={(e) => setHeadForm((s) => ({ ...s, bookRef: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={headForm.cuttingListRef}
                onChange={(e) => setHeadForm((s) => ({ ...s, cuttingListRef: e.target.value }))}
                className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
              >
                <option value="">Cutting list —</option>
                {cuttingLists.slice(0, 200).map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.id}
                  </option>
                ))}
              </select>
              <input
                placeholder="Quotation ref"
                value={headForm.quotationRef}
                onChange={(e) => setHeadForm((s) => ({ ...s, quotationRef: e.target.value }))}
                className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={headForm.creditScrapInventory}
                onChange={(e) => setHeadForm((s) => ({ ...s, creditScrapInventory: e.target.checked }))}
                className="rounded border-slate-300"
              />
              Credit scrap SKU
            </label>
            <textarea
              rows={2}
              placeholder="Note"
              value={headForm.note}
              onChange={(e) => setHeadForm((s) => ({ ...s, note: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none resize-none"
            />
            <input
              type="date"
              required
              value={headForm.date}
              onChange={(e) => setHeadForm((s) => ({ ...s, date: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
            />
            <button type="submit" disabled={saving} className="z-btn-primary w-full justify-center py-3 disabled:opacity-50">
              {saving ? 'Posting…' : 'Record head trim'}
            </button>
          </form>
        </ModalPanel>
      </ModalFrame>

      <ModalFrame isOpen={modal === 'supplier'} onClose={() => !saving && setModal(null)} title="Supplier defect">
        <ModalPanel title="Supplier defect on coil" onClose={() => !saving && setModal(null)}>
          <form className="space-y-3" onSubmit={submitDefect}>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Coil</label>
            <select
              required
              value={defectForm.coilNo}
              onChange={(e) => {
                const v = e.target.value;
                setDefectForm((s) => ({ ...s, coilNo: v }));
                if (v) fillFromCoil(v, setDefectForm);
              }}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
            >
              <option value="">Select…</option>
              {sortedCoils.map((c) => (
                <option key={c.coilNo} value={c.coilNo}>
                  {c.coilNo}
                </option>
              ))}
            </select>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Supplier id (optional override)</label>
            <input
              value={defectForm.supplierID}
              onChange={(e) => setDefectForm((s) => ({ ...s, supplierID: e.target.value }))}
              placeholder="Defaults from coil GRN"
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Defect from (m on coil)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={defectForm.defectMFrom}
                  onChange={(e) => setDefectForm((s) => ({ ...s, defectMFrom: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Defect to (m)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={defectForm.defectMTo}
                  onChange={(e) => setDefectForm((s) => ({ ...s, defectMTo: e.target.value }))}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
                />
              </div>
            </div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Resolution</label>
            <select
              required
              value={defectForm.supplierResolution}
              onChange={(e) => setDefectForm((s) => ({ ...s, supplierResolution: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
            >
              {SUPPLIER_RESOLUTIONS.map((x) => (
                <option key={x} value={x}>
                  {x.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <label className="block text-[10px] font-bold text-gray-400 uppercase">
              Kg to remove from coil (optional — e.g. rust section weighed off)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={defectForm.kgRemove}
              onChange={(e) => setDefectForm((s) => ({ ...s, kgRemove: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
            />
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Book ref (optional)</label>
            <input
              value={defectForm.bookRef}
              onChange={(e) => setDefectForm((s) => ({ ...s, bookRef: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none"
            />
            <textarea
              rows={2}
              placeholder="Note"
              value={defectForm.note}
              onChange={(e) => setDefectForm((s) => ({ ...s, note: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm outline-none resize-none"
            />
            <input
              type="date"
              required
              value={defectForm.date}
              onChange={(e) => setDefectForm((s) => ({ ...s, date: e.target.value }))}
              className="w-full rounded-xl border border-gray-100 bg-gray-50 py-3 px-4 text-sm font-bold outline-none"
            />
            <button type="submit" disabled={saving} className="z-btn-primary w-full justify-center py-3 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save defect'}
            </button>
          </form>
        </ModalPanel>
      </ModalFrame>
    </div>
  );
}
