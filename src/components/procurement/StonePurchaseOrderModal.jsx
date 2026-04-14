import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, UserPlus, X, ChevronDown, Save } from 'lucide-react';
import { ModalFrame } from '../layout/ModalFrame';
import { ProcurementFormSection } from './ProcurementFormSection';
import { apiFetch } from '../../lib/apiBase';
import { formatNgn } from '../../Data/mockData';

const STONE_MATERIAL_TYPE_ID = 'MAT-005';

const labelClass =
  'text-[8px] font-semibold text-slate-400 uppercase tracking-wide ml-0.5 mb-0.5 block';
const headerInputClass =
  'w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 min-h-[2rem] text-[11px] font-semibold text-[#134e4a] outline-none focus:ring-2 focus:ring-[#134e4a]/15';
/** Compact row fields — fits one line on desktop. */
const lineInputClass =
  'w-full bg-white border border-slate-200 rounded-md py-0.5 px-1.5 min-h-[1.625rem] h-[1.625rem] text-[10px] font-semibold text-[#134e4a] outline-none focus:ring-2 focus:ring-[#134e4a]/15 leading-none';

function newRowUid() {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const emptyLine = () => ({
  rowUid: newRowUid(),
  existingLineKey: '',
  designLabel: '',
  colourLabel: '',
  gaugeLabel: '',
  metres: '',
  pricePerM: '',
});

/**
 * Stone-coated PO: metres × price/m; resolves STONE-* SKUs via ensure-stone-product.
 */
export default function StonePurchaseOrderModal({
  isOpen,
  onClose,
  suppliers,
  masterData = null,
  products = [],
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
  const [busy, setBusy] = useState(false);

  const editPoId = editDraft?.poID ?? '';

  const stoneProfiles = useMemo(() => {
    const rows = masterData?.profiles || [];
    return rows.filter((p) => String(p.materialTypeId || '') === STONE_MATERIAL_TYPE_ID && p.active !== false);
  }, [masterData?.profiles]);

  const colourOptions = useMemo(
    () => (masterData?.colours || []).filter((c) => c.active !== false),
    [masterData?.colours]
  );
  const gaugeOptions = useMemo(
    () => (masterData?.gauges || []).filter((g) => g.active !== false),
    [masterData?.gauges]
  );

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
              rowUid: l.rowUid || l.existingLineKey || newRowUid(),
              existingLineKey: l.existingLineKey || '',
              designLabel: l.designLabel || '',
              colourLabel: l.colourLabel || '',
              gaugeLabel: l.gaugeLabel || '',
              metres: l.metres != null && l.metres !== '' ? String(l.metres) : '',
              pricePerM: l.pricePerM != null && l.pricePerM !== '' ? String(l.pricePerM) : '',
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

  const setLine = (idx, patch) => {
    setLines((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addRow = () => setLines((r) => [...r, emptyLine()]);
  const removeRow = (idx) => setLines((r) => (r.length <= 1 ? r : r.filter((_, i) => i !== idx)));

  const lineTotals = useMemo(
    () => lines.map((l) => (Number(l.metres) || 0) * (Number(l.pricePerM) || 0)),
    [lines]
  );
  const grandTotal = useMemo(() => lineTotals.reduce((s, n) => s + n, 0), [lineTotals]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!supplierID.trim()) {
      setFormError('Select a supplier.');
      return;
    }
    const sup = suppliers.find((s) => s.supplierID === supplierID);
    if (!sup) {
      setFormError('Supplier not found.');
      return;
    }
    setBusy(true);
    try {
      const builtLines = [];
      for (let i = 0; i < lines.length; i += 1) {
        const l = lines[i];
        const designLabel = String(l.designLabel || '').trim();
        const colourLabel = String(l.colourLabel || '').trim();
        const gaugeLabel = String(l.gaugeLabel || '').trim();
        const metres = Number(l.metres);
        const pricePerM = Number(l.pricePerM);
        if (!designLabel || !colourLabel || !gaugeLabel) {
          setFormError('Each line needs design, colour, and gauge.');
          setBusy(false);
          return;
        }
        if (!Number.isFinite(metres) || metres <= 0) {
          setFormError('Each line needs ordered metres > 0.');
          setBusy(false);
          return;
        }
        if (!Number.isFinite(pricePerM) || pricePerM <= 0) {
          setFormError('Each line needs price per metre > 0.');
          setBusy(false);
          return;
        }
        const ens = await apiFetch('/api/inventory/ensure-stone-product', {
          method: 'POST',
          body: JSON.stringify({ designLabel, colourLabel, gaugeLabel }),
        });
        const pid = ens.data?.productId;
        if (!ens.ok || !ens.data?.ok || !pid) {
          setFormError(ens.data?.error || 'Could not resolve stone SKU.');
          setBusy(false);
          return;
        }
        const pMeta = products.find((p) => p.productID === pid);
        const productName =
          pMeta?.name || `Stone coated ${designLabel} / ${colourLabel} / ${gaugeLabel}`;
        const lineKey =
          typeof l.existingLineKey === 'string' && l.existingLineKey.trim()
            ? l.existingLineKey.trim()
            : `L${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
        builtLines.push({
          lineKey,
          productID: pid,
          productName,
          color: colourLabel,
          gauge: gaugeLabel,
          metersOffered: metres,
          conversionKgPerM: null,
          unitPricePerKgNgn: null,
          unitPriceNgn: Math.round(pricePerM),
          qtyOrdered: metres,
        });
      }
      if (!builtLines.length) {
        setFormError('Add at least one line.');
        setBusy(false);
        return;
      }
      const payload = editPoId
        ? {
            poID: editPoId,
            supplierID: sup.supplierID,
            supplierName: sup.name,
            orderDateISO: orderDate,
            expectedDeliveryISO: expectedDelivery,
            lines: builtLines,
          }
        : {
            supplierID: sup.supplierID,
            supplierName: sup.name,
            orderDateISO: orderDate,
            expectedDeliveryISO: expectedDelivery,
            lines: builtLines,
          };
      const ok = await onSubmit?.(payload);
      if (ok !== false) onClose?.();
    } catch (err) {
      setFormError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalFrame
      isOpen={isOpen}
      onClose={onClose}
      title={editPoId ? 'Edit stone-coated purchase order' : 'New stone-coated purchase order'}
      description="Stone-coated roofing: metres, price per metre, design and SKU from master data."
    >
      <div className="z-modal-panel max-w-[min(100%,min(96vw,48rem))] w-full max-h-[min(92vh,820px)] flex flex-col mx-auto">
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-white shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-[#134e4a] rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0">
              S
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#134e4a] tracking-tight">
                {editPoId ? 'Edit stone-coated PO' : 'New stone-coated PO'}
              </h2>
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">
                Metres × ₦/m · SKUs from design / colour / gauge
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
                      className={`${headerInputClass} appearance-none pr-7`}
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"
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
                    className={headerInputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Expected arrival</label>
                  <input
                    type="date"
                    value={expectedDelivery}
                    onChange={(e) => setExpectedDelivery(e.target.value)}
                    className={headerInputClass}
                  />
                </div>
              </div>
            </ProcurementFormSection>

            <ProcurementFormSection
              letter="B"
              title="Stone lines (metres)"
              action={
                <button
                  type="button"
                  onClick={addRow}
                  className="text-[9px] font-semibold text-[#134e4a] uppercase flex items-center gap-1 hover:bg-slate-100 px-2 py-1 rounded-md"
                >
                  <Plus size={12} /> Add line
                </button>
              }
            >
              <p className="text-[9px] text-slate-500 mb-2 leading-snug">
                Each line resolves to a <strong>STONE-*</strong> product. Enter ordered metres and price per metre; line
                amount updates as you type.
              </p>
              <div className="space-y-2">
                {lines.map((row, idx) => (
                  <div
                    key={row.rowUid}
                    className="rounded-lg border border-slate-200/90 bg-white p-2 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 items-end"
                  >
                    <div className="lg:col-span-3">
                      <label className={labelClass}>Design *</label>
                      <div className="relative">
                        <select
                          value={row.designLabel}
                          onChange={(e) => setLine(idx, { designLabel: e.target.value })}
                          className={`${lineInputClass} appearance-none pr-6`}
                        >
                          <option value="">Select…</option>
                          {stoneProfiles.map((p) => (
                            <option key={p.id || p.name} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={12}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"
                        />
                      </div>
                    </div>
                    <div className="lg:col-span-2">
                      <label className={labelClass}>Colour *</label>
                      <div className="relative">
                        <select
                          value={row.colourLabel}
                          onChange={(e) => setLine(idx, { colourLabel: e.target.value })}
                          className={`${lineInputClass} appearance-none pr-6`}
                        >
                          <option value="">Select…</option>
                          {colourOptions.map((c) => (
                            <option key={c.id || c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={12}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"
                        />
                      </div>
                    </div>
                    <div className="lg:col-span-2">
                      <label className={labelClass}>Gauge *</label>
                      <div className="relative">
                        <select
                          value={row.gaugeLabel}
                          onChange={(e) => setLine(idx, { gaugeLabel: e.target.value })}
                          className={`${lineInputClass} appearance-none pr-6`}
                        >
                          <option value="">Select…</option>
                          {gaugeOptions.map((g) => (
                            <option key={g.id || g.label} value={g.label}>
                              {g.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={12}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"
                        />
                      </div>
                    </div>
                    <div className="lg:col-span-2">
                      <label className={labelClass}>Metres *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={row.metres}
                        onChange={(e) => setLine(idx, { metres: e.target.value })}
                        className={`${lineInputClass} tabular-nums`}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label className={labelClass}>₦ / m *</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={row.pricePerM}
                        onChange={(e) => setLine(idx, { pricePerM: e.target.value })}
                        className={`${lineInputClass} tabular-nums`}
                      />
                    </div>
                    <div className="lg:col-span-1 flex flex-col gap-0.5 min-w-0">
                      <label className={`${labelClass} text-right sm:text-left`}>Line ₦</label>
                      <div className="flex flex-nowrap items-center justify-end gap-1.5 min-h-[1.625rem] min-w-0">
                        <p className="text-[10px] font-bold text-[#134e4a] tabular-nums flex-1 truncate text-right sm:text-left min-w-0">
                          {formatNgn(lineTotals[idx])}
                        </p>
                        <button
                          type="button"
                          onClick={addRow}
                          className="p-1 rounded-md border border-[#134e4a]/25 bg-teal-50/90 text-[#134e4a] hover:bg-teal-100 shrink-0"
                          title="Add stone line"
                          aria-label="Add stone line"
                        >
                          <Plus size={14} strokeWidth={2.25} />
                        </button>
                        <button
                          type="button"
                          title="Remove line"
                          onClick={() => removeRow(idx)}
                          className="p-1 rounded-md border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600 shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ProcurementFormSection>

            {formError ? (
              <p className="text-xs font-semibold text-rose-600 px-1" role="alert">
                {formError}
              </p>
            ) : null}

            {editApprovalSlot ? <div className="shrink-0">{editApprovalSlot}</div> : null}
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
                disabled={busy}
                className="bg-white/10 px-4 py-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide border border-white/15 hover:bg-white/20 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="bg-white text-[#134e4a] px-4 py-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide shadow-sm inline-flex items-center gap-2 hover:brightness-105 disabled:opacity-50"
              >
                <Save size={14} /> {busy ? 'Saving…' : editPoId ? 'Save changes' : 'Save purchase order'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </ModalFrame>
  );
}
