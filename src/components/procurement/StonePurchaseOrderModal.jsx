import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { ModalFrame } from '../layout/ModalFrame';
import { ProcurementFormSection } from './ProcurementFormSection';
import { apiFetch } from '../../lib/apiBase';

const STONE_MATERIAL_TYPE_ID = 'MAT-005';

const inputClass =
  'w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 min-h-[2.75rem] text-sm font-semibold text-[#134e4a] outline-none focus:ring-2 focus:ring-[#134e4a]/15';
const labelClass =
  'text-[9px] font-semibold text-slate-400 uppercase tracking-wide ml-0.5 mb-1 block';

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
    <ModalFrame isOpen={isOpen} onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        className="z-modal-panel max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#134e4a]">
              {editPoId ? 'Edit stone-coated PO' : 'New stone-coated PO'}
            </h2>
            <p className="text-[10px] text-slate-500 mt-1">
              Metres ordered and price per metre. SKUs are created from design / colour / gauge.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] font-semibold uppercase text-slate-500 hover:text-slate-800"
          >
            Close
          </button>
        </div>

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Supplier</label>
              <select
                required
                value={supplierID}
                onChange={(e) => setSupplierID(e.target.value)}
                className={inputClass}
              >
                <option value="">Select…</option>
                {suppliers.map((s) => (
                  <option key={s.supplierID} value={s.supplierID}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Order date</label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Expected delivery</label>
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
          <div className="space-y-3">
            {lines.map((row, idx) => (
              <div
                key={row.rowUid}
                className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end"
              >
                <div className="lg:col-span-2">
                  <label className={labelClass}>Design</label>
                  <select
                    value={row.designLabel}
                    onChange={(e) => setLine(idx, { designLabel: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Select…</option>
                    {stoneProfiles.map((p) => (
                      <option key={p.id || p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Colour</label>
                  <select
                    value={row.colourLabel}
                    onChange={(e) => setLine(idx, { colourLabel: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Select…</option>
                    {colourOptions.map((c) => (
                      <option key={c.id || c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Gauge</label>
                  <select
                    value={row.gaugeLabel}
                    onChange={(e) => setLine(idx, { gaugeLabel: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Select…</option>
                    {gaugeOptions.map((g) => (
                      <option key={g.id || g.label} value={g.label}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Metres</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.metres}
                    onChange={(e) => setLine(idx, { metres: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <label className={labelClass}>₦ / m</label>
                    <input
                      type="number"
                      min="0"
                      value={row.pricePerM}
                      onChange={(e) => setLine(idx, { pricePerM: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="button"
                    title="Remove line"
                    onClick={() => removeRow(idx)}
                    className="mb-0.5 p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600 shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </ProcurementFormSection>

        {formError ? <p className="mt-3 text-xs text-rose-600 font-medium">{formError}</p> : null}

        {editApprovalSlot ? <div className="mt-3">{editApprovalSlot}</div> : null}

        <div className="mt-6 flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={onClose} className="z-btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="z-btn-primary">
            {busy ? 'Saving…' : editPoId ? 'Save changes' : 'Create PO'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
