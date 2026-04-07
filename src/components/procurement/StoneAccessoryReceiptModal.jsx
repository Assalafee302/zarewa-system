import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { ModalFrame } from '../layout';
import { ProcurementFormSection } from './ProcurementFormSection';
import { apiFetch } from '../../lib/apiBase';

const STONE_MATERIAL_TYPE_ID = 'MAT-005';

/**
 * Direct metre receipt for stone-coated SKUs and count-unit receipt for accessories (no PO).
 */
export default function StoneAccessoryReceiptModal({ isOpen, onClose, masterData, products = [], canMutate = true, onPosted }) {
  const [tab, setTab] = useState('stone');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const stoneProfiles = useMemo(() => {
    const rows = masterData?.profiles || [];
    return rows.filter((p) => String(p.materialTypeId || '') === STONE_MATERIAL_TYPE_ID && p.active !== false);
  }, [masterData?.profiles]);

  const colours = useMemo(() => (masterData?.colours || []).filter((c) => c.active !== false), [masterData?.colours]);
  const gauges = useMemo(() => (masterData?.gauges || []).filter((g) => g.active !== false), [masterData?.gauges]);

  const accessoryProducts = useMemo(
    () => (Array.isArray(products) ? products : []).filter((p) => String(p.productID || '').startsWith('ACC-')),
    [products]
  );

  const [stoneForm, setStoneForm] = useState({
    designLabel: '',
    colourLabel: '',
    gaugeLabel: '',
    metres: '',
    unitPricePerMeterNgn: '',
    supplierName: '',
    note: '',
  });

  const [accForm, setAccForm] = useState({
    productID: '',
    qty: '',
    unitCostNgn: '',
    note: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    setErr('');
    setBusy(false);
  }, [isOpen]);

  const designVal = stoneForm.designLabel || stoneProfiles[0]?.name || '';
  const colourVal = stoneForm.colourLabel || colours[0]?.name || '';
  const gaugeVal = stoneForm.gaugeLabel || gauges[0]?.label || '';

  async function submitStone(e) {
    e.preventDefault();
    setErr('');
    const metres = Number(stoneForm.metres);
    if (!Number.isFinite(metres) || metres <= 0) {
      setErr('Enter metres received.');
      return;
    }
    setBusy(true);
    try {
      const r = await apiFetch('/api/inventory/stone-receipt', {
        method: 'POST',
        body: JSON.stringify({
          designLabel: designVal,
          colourLabel: colourVal,
          gaugeLabel: gaugeVal,
          metresReceived: metres,
          unitPricePerMeterNgn: stoneForm.unitPricePerMeterNgn ? Number(stoneForm.unitPricePerMeterNgn) : 0,
          supplierName: stoneForm.supplierName,
          refNote: stoneForm.note,
        }),
      });
      const j = r.data || {};
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      onPosted?.(j);
      onClose?.();
    } catch (x) {
      setErr(String(x?.message || x));
    } finally {
      setBusy(false);
    }
  }

  async function submitAccessory(e) {
    e.preventDefault();
    setErr('');
    const pid = accForm.productID || accessoryProducts[0]?.productID || '';
    const qty = Number(accForm.qty);
    if (!pid) {
      setErr('No accessory SKU in catalog (expected ACC-* products).');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setErr('Enter quantity received.');
      return;
    }
    setBusy(true);
    try {
      const r = await apiFetch('/api/inventory/accessory-receipt', {
        method: 'POST',
        body: JSON.stringify({
          productID: pid,
          qtyReceived: qty,
          unitCostNgn: accForm.unitCostNgn ? Number(accForm.unitCostNgn) : 0,
          note: accForm.note,
        }),
      });
      const j = r.data || {};
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      onPosted?.(j);
      onClose?.();
    } catch (x) {
      setErr(String(x?.message || x));
    } finally {
      setBusy(false);
    }
  }

  const stoneDisabled = busy || !canMutate || stoneProfiles.length === 0;
  const accDisabled = busy || !canMutate || accessoryProducts.length === 0;

  return (
    <ModalFrame
      isOpen={isOpen}
      onClose={onClose}
      title="Stone & accessory receipts"
      description="Post metre stock for stone-coated tiles or receive accessories without a purchase order."
    >
      <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80">
          <h2 className="text-sm font-bold text-[#134e4a]">Non-coil receipts</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-200/60"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 pt-3 flex gap-1 border-b border-slate-100">
          {[
            { id: 'stone', label: 'Stone (m)' },
            { id: 'accessory', label: 'Accessory' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wide rounded-t-lg border-b-2 -mb-px ${
                tab === t.id
                  ? 'border-[#134e4a] text-[#134e4a] bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-5 max-h-[min(70vh,520px)] overflow-y-auto">
          {err ? (
            <p className="mb-3 text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2" role="alert">
              {err}
            </p>
          ) : null}
          {tab === 'stone' ? (
            <form onSubmit={submitStone} className="space-y-4">
              <ProcurementFormSection letter="S" title="Stone-coated (metres)" compact>
                {stoneProfiles.length === 0 ? (
                  <p className="text-[11px] text-slate-600">No stone designs in master data (MAT-005 profiles).</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-[10px] font-semibold text-slate-600">
                      Design
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"
                        value={designVal}
                        onChange={(e) => setStoneForm((s) => ({ ...s, designLabel: e.target.value }))}
                      >
                        {stoneProfiles.map((p) => (
                          <option key={p.id} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[10px] font-semibold text-slate-600">
                      Colour
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"
                        value={colourVal}
                        onChange={(e) => setStoneForm((s) => ({ ...s, colourLabel: e.target.value }))}
                      >
                        {colours.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[10px] font-semibold text-slate-600">
                      Gauge
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"
                        value={gaugeVal}
                        onChange={(e) => setStoneForm((s) => ({ ...s, gaugeLabel: e.target.value }))}
                      >
                        {gauges.map((g) => (
                          <option key={g.id} value={g.label}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[10px] font-semibold text-slate-600" htmlFor="zarewa-stone-receipt-metres">
                      Metres received
                      <input
                        id="zarewa-stone-receipt-metres"
                        type="number"
                        min="0"
                        step="0.01"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs tabular-nums"
                        value={stoneForm.metres}
                        onChange={(e) => setStoneForm((s) => ({ ...s, metres: e.target.value }))}
                      />
                    </label>
                    <label className="block text-[10px] font-semibold text-slate-600 sm:col-span-2">
                      Cost / metre (₦, optional — posts inventory GL when &gt; 0)
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs tabular-nums"
                        value={stoneForm.unitPricePerMeterNgn}
                        onChange={(e) => setStoneForm((s) => ({ ...s, unitPricePerMeterNgn: e.target.value }))}
                      />
                    </label>
                    <label className="block text-[10px] font-semibold text-slate-600 sm:col-span-2">
                      Supplier (optional)
                      <input
                        type="text"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"
                        value={stoneForm.supplierName}
                        onChange={(e) => setStoneForm((s) => ({ ...s, supplierName: e.target.value }))}
                      />
                    </label>
                    <label className="block text-[10px] font-semibold text-slate-600 sm:col-span-2">
                      Reference note
                      <input
                        type="text"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"
                        value={stoneForm.note}
                        onChange={(e) => setStoneForm((s) => ({ ...s, note: e.target.value }))}
                      />
                    </label>
                  </div>
                )}
              </ProcurementFormSection>
              <button
                type="submit"
                disabled={stoneDisabled}
                className="w-full rounded-xl bg-[#134e4a] text-white py-2.5 text-[10px] font-bold uppercase tracking-wide hover:brightness-105 disabled:opacity-40"
              >
                {busy ? 'Posting…' : 'Post stone receipt'}
              </button>
            </form>
          ) : (
            <form onSubmit={submitAccessory} className="space-y-4">
              <ProcurementFormSection letter="A" title="Accessory" compact>
                <div className="grid grid-cols-1 gap-3">
                  <label className="block text-[10px] font-semibold text-slate-600">
                    Product
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-mono"
                      value={accForm.productID || accessoryProducts[0]?.productID || ''}
                      onChange={(e) => setAccForm((a) => ({ ...a, productID: e.target.value }))}
                    >
                      {accessoryProducts.length === 0 ? (
                        <option value="">No ACC-* products</option>
                      ) : null}
                      {accessoryProducts.map((p) => (
                        <option key={p.productID} value={p.productID}>
                          {p.productID} — {p.productName || p.name || ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[10px] font-semibold text-slate-600">
                    Quantity
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs tabular-nums"
                      value={accForm.qty}
                      onChange={(e) => setAccForm((a) => ({ ...a, qty: e.target.value }))}
                    />
                  </label>
                  <label className="block text-[10px] font-semibold text-slate-600">
                    Unit cost (₦, optional)
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs tabular-nums"
                      value={accForm.unitCostNgn}
                      onChange={(e) => setAccForm((a) => ({ ...a, unitCostNgn: e.target.value }))}
                    />
                  </label>
                  <label className="block text-[10px] font-semibold text-slate-600">
                    Note
                    <input
                      type="text"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"
                      value={accForm.note}
                      onChange={(e) => setAccForm((a) => ({ ...a, note: e.target.value }))}
                    />
                  </label>
                </div>
              </ProcurementFormSection>
              <button
                type="submit"
                disabled={accDisabled}
                className="w-full rounded-xl bg-[#134e4a] text-white py-2.5 text-[10px] font-bold uppercase tracking-wide hover:brightness-105 disabled:opacity-40"
              >
                {busy ? 'Posting…' : 'Post accessory receipt'}
              </button>
            </form>
          )}
        </div>
      </div>
    </ModalFrame>
  );
}
