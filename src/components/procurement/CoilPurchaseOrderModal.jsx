import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, ChevronDown, Save, UserPlus, Package } from 'lucide-react';
import { ModalFrame } from '../layout/ModalFrame';
import { ProcurementFormSection } from './ProcurementFormSection';
import { formatNgn } from '../../Data/mockData';

const inputClass =
  'w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-[11px] font-semibold text-[#134e4a] outline-none focus:ring-2 focus:ring-[#134e4a]/15 min-h-[2rem]';
/** Coil line controls: compact single-row layout on desktop. */
const lineFieldClass =
  'w-full box-border min-w-0 max-w-full bg-white border border-slate-200 rounded-md py-0.5 px-1.5 min-h-[1.625rem] h-[1.625rem] text-[10px] font-semibold text-[#134e4a] outline-none focus:ring-2 focus:ring-[#134e4a]/15 leading-none';
/** Label directly above its field (desktop + mobile) — avoids separate header column drift. */
const lineLabelClass =
  'text-[8px] font-semibold text-slate-500 uppercase tracking-wide leading-none block mb-0.5';
const labelClass =
  'text-[8px] font-semibold text-slate-400 uppercase tracking-wide ml-0.5 mb-0.5 block';

/** Stock SKU for kg ledger: aluminium vs aluzinc only. Colour / gauge / coil # live on PO lines & coil lots. */
const MATERIAL_OPTS = [
  { value: 'aluminium', label: 'Aluminium' },
  { value: 'aluzinc', label: 'Aluzinc' },
];

function stockProductIdForMaterial(kind) {
  if (kind === 'aluzinc') return 'PRD-102';
  if (kind === 'aluminium') return 'COIL-ALU';
  return '';
}

const FALLBACK_GAUGES = ['0.70mm', '0.55mm', '0.45mm', '0.40mm', '0.30mm', '0.24mm'];
const FALLBACK_COLOURS = [
  { name: 'HM Blue', abbreviation: 'HMB' },
  { name: 'Traffic Black', abbreviation: 'TB' },
  { name: 'TC Red', abbreviation: 'TCR' },
  { name: 'Bush Green', abbreviation: 'BG' },
  { name: 'Zinc Grey', abbreviation: 'ZG' },
];

function newRowUid() {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const emptyLine = () => ({
  rowUid: newRowUid(),
  existingLineKey: '',
  materialKind: '',
  color: '',
  gauge: '',
  kg: '',
  meters: '',
  pricePerKg: '',
});

/**
 * @param {{
 *   isOpen: boolean;
 *   onClose: () => void;
 *   suppliers: { supplierID: string; name: string }[];
 *   masterData?: object;
 *   editDraft?: null | {
 *     poID: string;
 *     supplierID: string;
 *     orderDateISO: string;
 *     expectedDeliveryISO: string;
 *     lines: { lineKey: string; materialKind: string; color: string; gauge: string; kg: number | string; meters?: number | string | null; pricePerKg: number | string }[];
 *   };
 *   onSubmit: (payload: object) => void | Promise<boolean | void>;
 *   onQuickAddSupplier: () => void;
 *   editApprovalSlot?: React.ReactNode;
 * }} props
 */
export default function CoilPurchaseOrderModal({
  isOpen,
  onClose,
  suppliers,
  masterData = null,
  editDraft = null,
  onSubmit,
  onQuickAddSupplier,
  editApprovalSlot = null,
}) {
  const [supplierID, setSupplierID] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [formError, setFormError] = useState('');

  const editPoId = editDraft?.poID ?? '';

  useEffect(() => {
    if (!isOpen) return;
    if (editPoId && editDraft) {
      setSupplierID(editDraft.supplierID || '');
      setOrderDate(editDraft.orderDateISO || new Date().toISOString().slice(0, 10));
      setExpectedDelivery(editDraft.expectedDeliveryISO || '');
      const incoming = Array.isArray(editDraft.lines) ? editDraft.lines : [];
      setLines(
        incoming.length
          ? incoming.map((l) => ({
              rowUid: l.lineKey || newRowUid(),
              existingLineKey: l.lineKey || '',
              materialKind: l.materialKind || '',
              color: l.color || '',
              gauge: l.gauge || '',
              kg: l.kg != null && l.kg !== '' ? String(l.kg) : '',
              meters: l.meters != null && l.meters !== '' ? String(l.meters) : '',
              pricePerKg: l.pricePerKg != null && l.pricePerKg !== '' ? String(l.pricePerKg) : '',
            }))
          : [emptyLine()]
      );
      setFormError('');
      return;
    }
    setSupplierID('');
    setOrderDate(new Date().toISOString().slice(0, 10));
    setExpectedDelivery('');
    setLines([emptyLine()]);
    setFormError('');
  }, [isOpen, editPoId, editDraft]);
   

  const lineTotals = useMemo(() => {
    return lines.map((l) => {
      const kg = Number(l.kg) || 0;
      const p = Number(l.pricePerKg) || 0;
      return kg * p;
    });
  }, [lines]);
  const colourOptions = useMemo(() => {
    const fromMaster = (masterData?.colours || []).filter((row) => row.active);
    const seen = new Set(fromMaster.map((row) => row.name.trim().toLowerCase()));
    const extras = FALLBACK_COLOURS.filter((row) => !seen.has(row.name.trim().toLowerCase())).map(
      (row, i) => ({
        id: `fb-col-${i}`,
        name: row.name,
        abbreviation: row.abbreviation,
        active: true,
      })
    );
    return [...fromMaster, ...extras];
  }, [masterData?.colours]);

  const gaugeOptions = useMemo(() => {
    const fromMaster = (masterData?.gauges || []).filter((row) => row.active);
    const seen = new Set(fromMaster.map((row) => row.label.trim().toLowerCase()));
    const extras = FALLBACK_GAUGES.filter((label) => !seen.has(label.toLowerCase())).map((label, i) => ({
      id: `fb-gauge-${i}`,
      label,
      gaugeMm: 0,
      active: true,
    }));
    return [...fromMaster, ...extras];
  }, [masterData?.gauges]);
  const grandTotal = lineTotals.reduce((s, n) => s + n, 0);

  const setLine = (idx, patch) => {
    setLines((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const conversionForLine = (l) => {
    const kg = Number(l.kg);
    const m = Number(l.meters);
    if (kg > 0 && m > 0 && !Number.isNaN(kg) && !Number.isNaN(m)) {
      return Math.round((kg / m) * 10000) / 10000;
    }
    return null;
  };

  const addRow = () => setLines((r) => [...r, emptyLine()]);
  const removeRow = (idx) =>
    setLines((r) => (r.length <= 1 ? r : r.filter((_, i) => i !== idx)));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!supplierID.trim()) {
      setFormError('Select a supplier.');
      return;
    }
    const sup = suppliers.find((s) => s.supplierID === supplierID);
    const built = lines
      .map((l, i) => {
        const kg = Number(l.kg);
        const color = l.color.trim();
        const gauge = l.gauge.trim();
        const mk = l.materialKind;
        if (!mk || !color || !gauge || Number.isNaN(kg) || kg <= 0) return null;
        const price = Number(l.pricePerKg);
        if (Number.isNaN(price) || price <= 0) return null;
        const productID = stockProductIdForMaterial(mk);
        if (!productID) return null;
        const conv = conversionForLine(l);
        const m = l.meters ? Number(l.meters) : null;
        const lineKey =
          typeof l.existingLineKey === 'string' && l.existingLineKey.trim()
            ? l.existingLineKey.trim()
            : `L${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
        return {
          lineKey,
          productID,
          color,
          gauge,
          metersOffered: m != null && !Number.isNaN(m) ? m : null,
          conversionKgPerM: conv != null && !Number.isNaN(conv) ? conv : null,
          unitPricePerKgNgn: price,
          qtyOrdered: kg,
          unitPriceNgn: price,
        };
      })
      .filter(Boolean);
    if (!built.length) {
      setFormError(
        'Each line needs: material (Aluminium or Aluzinc), colour, gauge, kg ordered, reference metres, and ₦/kg.'
      );
      return;
    }
    const payload = {
      ...(editPoId ? { poID: editPoId } : {}),
      supplierID,
      supplierName: sup?.name ?? '',
      orderDateISO: orderDate,
      expectedDeliveryISO: expectedDelivery,
      lines: built,
    };
    try {
      const result = await Promise.resolve(onSubmit?.(payload));
      if (result === false) return;
    } catch {
      setFormError('Could not save. Check you are online and try again.');
      return;
    }
    onClose();
  };

  return (
    <ModalFrame
      isOpen={isOpen}
      onClose={onClose}
      title={editPoId ? 'Edit coil purchase order' : 'New coil purchase order'}
      description="Supplier coil purchase: material, colour, gauge, kg, metres, price per kg."
    >
      <div className="z-modal-panel max-w-[min(100%,min(96vw,64rem))] w-full max-h-[min(92vh,900px)] flex flex-col mx-auto">
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-white shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-[#134e4a] rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0">
              C
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#134e4a] tracking-tight">
                {editPoId ? 'Edit coil purchase' : 'New coil purchase'}
              </h2>
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">
                Material · colour · gauge · kg · metres · conversion · ₦/kg — coil # at GRN
              </p>
              <p className="text-[9px] font-medium text-slate-500 mt-1 truncate">
                {editPoId ? (
                  <>
                    <span className="font-mono font-semibold text-[#134e4a]">{editPoId}</span>
                    <span className="text-slate-400"> · amending</span>
                  </>
                ) : (
                  'New purchase order'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-xl transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form className="flex flex-col flex-1 min-h-0" onSubmit={handleSubmit}>
          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-white min-h-0 flex flex-col gap-6">
          <ProcurementFormSection
            letter="A"
            title="Supplier & order header"
            action={
              <button
                type="button"
                onClick={onQuickAddSupplier}
                className="text-[9px] font-semibold text-[#134e4a] uppercase flex items-center gap-1 hover:bg-slate-100 px-2 py-1 rounded-md"
              >
                <UserPlus size={12} /> New supplier
              </button>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Supplier *</label>
                <div className="relative">
                  <select
                    required
                    value={supplierID}
                    onChange={(e) => setSupplierID(e.target.value)}
                    className={`${inputClass} appearance-none pr-8`}
                  >
                    <option value="">Select supplier…</option>
                    {suppliers.map((s) => (
                      <option key={s.supplierID} value={s.supplierID}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Order date *</label>
                <input
                  required
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Expected arrival</label>
                <input
                  type="date"
                  value={expectedDelivery}
                  onChange={(e) => setExpectedDelivery(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </ProcurementFormSection>

          <ProcurementFormSection
            letter="B"
            title="Coil lines"
            action={
              <button
                type="button"
                onClick={addRow}
                className="text-[9px] font-semibold text-[#134e4a] uppercase flex items-center gap-1 hover:bg-slate-100 px-2 py-1 rounded-md"
              >
                <Plus size={12} /> Add coil line
              </button>
            }
          >
            <p className="text-[9px] text-slate-500 mb-2 leading-snug">
              Choose <strong>Aluminium</strong> or <strong>Aluzinc</strong> for stock (kg). Add colour (HMB, TB, …),
              gauge, ordered kg, reference metres, and price. <strong>kg/m</strong> = kg ÷ metres. Assign{' '}
              <strong>coil number</strong> and <strong>kg received</strong> when you post store receipt — that links
              transit → inventory → production.
            </p>

            <div className="overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0 [scrollbar-gutter:stable]">
              <div className="space-y-2 min-w-0">
                {lines.map((l, idx) => {
                  const conv = conversionForLine(l);
                  return (
                    <div
                      key={l.rowUid}
                      className="grid w-full max-w-full grid-cols-1 gap-2 border border-slate-100 rounded-lg bg-white/90 p-2 sm:grid-cols-12 sm:items-end sm:gap-x-2 sm:gap-y-1"
                    >
                      <div className="flex items-center gap-2 text-[9px] font-semibold text-slate-500 sm:hidden border-b border-slate-100 pb-1.5 -mt-0.5">
                        <Package className="text-[#134e4a]/70 shrink-0" size={16} strokeWidth={1.75} />
                        <span>Coil line {idx + 1}</span>
                      </div>
                      <div className="min-w-0 sm:col-span-2 flex flex-col justify-end">
                        <label className={lineLabelClass}>Material *</label>
                        <select
                          value={l.materialKind}
                          onChange={(e) => setLine(idx, { materialKind: e.target.value })}
                          className={lineFieldClass}
                        >
                          <option value="">Material *</option>
                          {MATERIAL_OPTS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-0 sm:col-span-2 flex flex-col justify-end">
                        <label className={lineLabelClass}>Colour</label>
                        <select
                          value={l.color}
                          onChange={(e) => setLine(idx, { color: e.target.value })}
                          className={lineFieldClass}
                          title={l.color || undefined}
                        >
                          <option value="">Colour</option>
                          {colourOptions.map((colour) => (
                            <option key={colour.id} value={colour.name}>
                              {colour.abbreviation ? `${colour.name} (${colour.abbreviation})` : colour.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-0 sm:col-span-1 flex flex-col justify-end">
                        <label className={lineLabelClass}>Gauge</label>
                        <select
                          value={l.gauge}
                          onChange={(e) => setLine(idx, { gauge: e.target.value })}
                          className={lineFieldClass}
                        >
                          <option value="">Gauge</option>
                          {gaugeOptions.map((gauge) => (
                            <option key={gauge.id} value={gauge.label}>
                              {gauge.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-0 sm:col-span-1 flex flex-col justify-end">
                        <label className={lineLabelClass}>Kg</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={l.kg}
                          onChange={(e) => setLine(idx, { kg: e.target.value })}
                          className={`${lineFieldClass} tabular-nums`}
                          placeholder="0"
                        />
                      </div>
                      <div className="min-w-0 sm:col-span-1 flex flex-col justify-end">
                        <label className={lineLabelClass}>Metres</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={l.meters}
                          onChange={(e) => setLine(idx, { meters: e.target.value })}
                          className={`${lineFieldClass} tabular-nums`}
                          placeholder="0"
                        />
                      </div>
                      <div className="min-w-0 sm:col-span-1 flex flex-col justify-end">
                        <label className={lineLabelClass} title="kg ÷ metres">
                          kg/m
                        </label>
                        <div
                          className={`${lineFieldClass} tabular-nums bg-slate-50 text-slate-600 flex items-center justify-end px-1.5 overflow-x-auto shrink-0`}
                          title="kg ÷ metres"
                        >
                          {conv != null ? conv : '—'}
                        </div>
                      </div>
                      <div className="min-w-0 sm:col-span-1 flex flex-col justify-end">
                        <label className={lineLabelClass}>₦/kg</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={l.pricePerKg}
                          onChange={(e) => setLine(idx, { pricePerKg: e.target.value })}
                          className={`${lineFieldClass} tabular-nums`}
                          placeholder="0"
                        />
                      </div>
                      <div className="flex flex-col justify-end min-w-0 sm:col-span-3 gap-0.5">
                        <label className={`${lineLabelClass} sm:text-right`}>Line ₦</label>
                        <div className="flex flex-nowrap items-center justify-end gap-1.5 min-h-[1.625rem] min-w-0">
                          <p className="text-[10px] font-bold text-[#134e4a] tabular-nums leading-none truncate text-right flex-1 min-w-0">
                            {formatNgn(lineTotals[idx])}
                          </p>
                          <button
                            type="button"
                            onClick={addRow}
                            className="p-1 rounded-md border border-[#134e4a]/25 bg-teal-50/90 text-[#134e4a] hover:bg-teal-100 shrink-0"
                            title="Add coil line"
                            aria-label="Add coil line"
                          >
                            <Plus size={14} strokeWidth={2.25} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            className="p-1 text-slate-300 hover:text-red-500 rounded-md shrink-0 -mr-0.5"
                            aria-label="Remove line"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200">
              <p className="text-[10px] text-slate-500 leading-relaxed">
                After save, use <strong>Assign transport</strong> (on loading), then{' '}
                <strong>Post to in transit</strong>. In Operations, enter <strong>coil #</strong> and{' '}
                <strong>kg in</strong> at receipt — that ties the coil to this PO line for production.
              </p>
            </div>
          </ProcurementFormSection>

          {formError ? (
            <p className="text-xs font-semibold text-rose-600 px-1" role="alert">
              {formError}
            </p>
          ) : null}

          {editApprovalSlot ? <div className="mt-2 shrink-0">{editApprovalSlot}</div> : null}
          </div>

          <div className="px-5 py-4 bg-[#134e4a] flex flex-wrap justify-between items-center gap-3 text-white shrink-0 border-t border-[#0f3d39]/30">
            <div>
              <p className="text-[9px] font-semibold text-white/50 uppercase tracking-widest mb-0.5">Order total</p>
              <p className="text-2xl font-bold text-white tabular-nums">{formatNgn(grandTotal)}</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <button
                type="button"
                onClick={onClose}
                className="bg-white/10 px-4 py-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide border border-white/15 hover:bg-white/20"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-white text-[#134e4a] px-4 py-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide shadow-sm inline-flex items-center gap-2 hover:brightness-105"
              >
                <Save size={14} /> {editPoId ? 'Save changes' : 'Save purchase order'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </ModalFrame>
  );
}
