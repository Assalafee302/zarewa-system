import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, ChevronDown, Save, UserPlus, Package } from 'lucide-react';
import { ModalFrame } from '../layout/ModalFrame';
import { ProcurementFormSection } from './ProcurementFormSection';

const inputClass =
  'w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs font-semibold text-[#134e4a] outline-none focus:ring-2 focus:ring-[#134e4a]/15';
const inputClassLg =
  'w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 min-h-[2.75rem] text-sm font-semibold text-[#134e4a] outline-none focus:ring-2 focus:ring-[#134e4a]/15';
const labelClass =
  'text-[9px] font-semibold text-slate-400 uppercase tracking-wide ml-0.5 mb-1 block';

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

const emptyLine = () => ({
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
 *   onSubmit: (payload: object) => void | Promise<boolean | void>;
 *   onQuickAddSupplier: () => void;
 * }} props
 */
export default function CoilPurchaseOrderModal({
  isOpen,
  onClose,
  suppliers,
  masterData = null,
  onSubmit,
  onQuickAddSupplier,
}) {
  const [supplierID, setSupplierID] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [formError, setFormError] = useState('');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) return;
    setSupplierID('');
    setOrderDate(new Date().toISOString().slice(0, 10));
    setExpectedDelivery('');
    setLines([emptyLine()]);
    setFormError('');
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
        return {
          lineKey: `L${Date.now()}-${i}`,
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
    <ModalFrame isOpen={isOpen} onClose={onClose}>
      <div className="z-modal-panel max-w-[min(100%,52rem)] w-full max-h-[min(92vh,900px)] flex flex-col mx-auto">
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
          <div>
            <h2 className="text-lg font-bold text-[#134e4a]">New coil purchase</h2>
            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">
              Material · colour · gauge · kg · metres · conversion · ₦/kg — coil # at GRN
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-xl"
          >
            <X size={20} />
          </button>
        </div>

        <form
          className="flex-1 overflow-y-auto p-5 custom-scrollbar flex flex-col gap-2 min-h-0"
          onSubmit={handleSubmit}
        >
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
            <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
              Choose <strong>Aluminium</strong> or <strong>Aluzinc</strong> for stock (kg). Add colour (HMB, TB, …),
              gauge, ordered kg, reference metres, and price. <strong>kg/m</strong> = kg ÷ metres. Assign{' '}
              <strong>coil number</strong> and <strong>kg received</strong> when you post store receipt — that links
              transit → inventory → production.
            </p>

            <div className="grid grid-cols-12 gap-1.5 mb-2 px-1 text-[8px] font-semibold text-slate-400 uppercase tracking-wider items-end">
              <div className="col-span-12 sm:col-span-1 text-center sm:pb-2"> </div>
              <div className="col-span-6 sm:col-span-2">Material</div>
              <div className="col-span-6 sm:col-span-2">Colour</div>
              <div className="col-span-6 sm:col-span-2">Gauge</div>
              <div className="col-span-4 sm:col-span-1">Kg</div>
              <div className="col-span-4 sm:col-span-1">Metres</div>
              <div className="col-span-4 sm:col-span-1">kg/m</div>
              <div className="col-span-4 sm:col-span-1">₦/kg</div>
              <div className="col-span-4 sm:col-span-1 text-right">Line ₦</div>
              <div className="col-span-8 sm:col-span-1" />
            </div>

            <div className="space-y-3">
              {lines.map((l, idx) => {
                const conv = conversionForLine(l);
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-end border border-slate-100 rounded-lg p-3 bg-white/90"
                  >
                    <div
                      className="col-span-12 sm:col-span-1 flex items-center justify-center sm:pb-2"
                      title={`Coil line ${idx + 1}`}
                    >
                      <Package className="text-[#134e4a]/70 shrink-0" size={22} strokeWidth={1.75} />
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <select
                        value={l.materialKind}
                        onChange={(e) => setLine(idx, { materialKind: e.target.value })}
                        className={`${inputClassLg} appearance-none`}
                      >
                        <option value="">Material *</option>
                        {MATERIAL_OPTS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <select
                        value={l.color}
                        onChange={(e) => setLine(idx, { color: e.target.value })}
                        className={`${inputClassLg} appearance-none`}
                      >
                        <option value="">Colour</option>
                        {colourOptions.map((colour) => (
                          <option key={colour.id} value={colour.name}>
                            {colour.abbreviation ? `${colour.name} (${colour.abbreviation})` : colour.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <select
                        value={l.gauge}
                        onChange={(e) => setLine(idx, { gauge: e.target.value })}
                        className={`${inputClassLg} appearance-none`}
                      >
                        <option value="">Gauge</option>
                        {gaugeOptions.map((gauge) => (
                          <option key={gauge.id} value={gauge.label}>
                            {gauge.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4 sm:col-span-1">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={l.kg}
                        onChange={(e) => setLine(idx, { kg: e.target.value })}
                        className={`${inputClass} tabular-nums`}
                        placeholder="kg"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-1">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={l.meters}
                        onChange={(e) => setLine(idx, { meters: e.target.value })}
                        className={`${inputClass} tabular-nums`}
                        placeholder="m"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-1">
                      <div
                        className={`${inputClass} tabular-nums bg-slate-50 text-slate-600 flex items-center min-h-[2.25rem]`}
                        title="kg ÷ metres"
                      >
                        {conv != null ? conv : '—'}
                      </div>
                    </div>
                    <div className="col-span-4 sm:col-span-1">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={l.pricePerKg}
                        onChange={(e) => setLine(idx, { pricePerKg: e.target.value })}
                        className={`${inputClass} tabular-nums`}
                        placeholder="₦/kg"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-1 text-right text-xs font-bold text-[#134e4a] tabular-nums py-2">
                      ₦{lineTotals[idx].toLocaleString()}
                    </div>
                    <div className="col-span-8 sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="p-2 text-slate-300 hover:text-red-500 rounded-lg"
                        aria-label="Remove line"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap justify-between items-center gap-3 pt-4 border-t border-slate-200">
              <p className="text-[10px] text-slate-500">
                After save, use <strong>Assign transport</strong> (on loading), then{' '}
                <strong>Post to in transit</strong>. In Operations, enter <strong>coil #</strong> and{' '}
                <strong>kg in</strong> at receipt — that ties the coil to this PO line for production.
              </p>
              <p className="text-sm font-black text-[#134e4a] tabular-nums">
                Total ₦{grandTotal.toLocaleString()}
              </p>
            </div>
          </ProcurementFormSection>

          {formError ? (
            <p className="text-xs font-semibold text-rose-600 px-1" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 mt-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-[#134e4a] text-white px-5 py-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide shadow-sm hover:brightness-105 flex items-center gap-2"
            >
              <Save size={14} /> Save purchase order
            </button>
          </div>
        </form>
      </div>
    </ModalFrame>
  );
}
