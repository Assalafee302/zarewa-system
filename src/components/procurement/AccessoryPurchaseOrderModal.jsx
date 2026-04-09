import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { ModalFrame } from '../layout/ModalFrame';
import { ProcurementFormSection } from './ProcurementFormSection';

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
  productID: '',
  qty: '',
  unitPrice: '',
});

/**
 * Accessory PO: ACC-* SKUs, units × unit price.
 */
export default function AccessoryPurchaseOrderModal({
  isOpen,
  onClose,
  suppliers,
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

  const editPoId = editDraft?.poID ?? '';

  const accessoryProducts = useMemo(
    () => (Array.isArray(products) ? products : []).filter((p) => String(p.productID || '').startsWith('ACC-')),
    [products]
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
              productID: l.productID || '',
              qty: l.qty != null && l.qty !== '' ? String(l.qty) : '',
              unitPrice: l.unitPrice != null && l.unitPrice !== '' ? String(l.unitPrice) : '',
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
    if (!accessoryProducts.length) {
      setFormError('No accessory SKUs (ACC-*) in catalog.');
      return;
    }
    const builtLines = [];
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i];
      const pid = String(l.productID || '').trim();
      const qty = Number(l.qty);
      const unitPrice = Number(l.unitPrice);
      if (!pid) {
        setFormError('Each line needs an accessory product.');
        return;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        setFormError('Each line needs quantity > 0.');
        return;
      }
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        setFormError('Each line needs unit price > 0.');
        return;
      }
      const pMeta = accessoryProducts.find((p) => p.productID === pid);
      const productName = pMeta?.name || pid;
      const lineKey =
        typeof l.existingLineKey === 'string' && l.existingLineKey.trim()
          ? l.existingLineKey.trim()
          : `L${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      builtLines.push({
        lineKey,
        productID: pid,
        productName,
        color: '',
        gauge: '',
        metersOffered: null,
        conversionKgPerM: null,
        unitPricePerKgNgn: Math.round(unitPrice),
        unitPriceNgn: Math.round(unitPrice),
        qtyOrdered: qty,
      });
    }
    if (!builtLines.length) {
      setFormError('Add at least one line.');
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
  };

  return (
    <ModalFrame isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit} className="z-modal-panel max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#134e4a]">
              {editPoId ? 'Edit accessory PO' : 'New accessory PO'}
            </h2>
            <p className="text-[10px] text-slate-500 mt-1">Units and unit price for ACC-* stock SKUs.</p>
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
          title="Accessory lines"
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
                className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
              >
                <div className="sm:col-span-5">
                  <label className={labelClass}>Accessory</label>
                  <select
                    value={row.productID}
                    onChange={(e) => setLine(idx, { productID: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Select…</option>
                    {accessoryProducts.map((p) => (
                      <option key={p.productID} value={p.productID}>
                        {p.productID} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Qty</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={row.qty}
                    onChange={(e) => setLine(idx, { qty: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className={labelClass}>Unit ₦</label>
                  <input
                    type="number"
                    min="0"
                    value={row.unitPrice}
                    onChange={(e) => setLine(idx, { unitPrice: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="button"
                    title="Remove line"
                    onClick={() => removeRow(idx)}
                    className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
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
          <button type="submit" className="z-btn-primary">
            {editPoId ? 'Save changes' : 'Create PO'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
