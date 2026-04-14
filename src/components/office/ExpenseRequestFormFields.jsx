import React from 'react';
import { Paperclip, Plus, X } from 'lucide-react';
import { EXPENSE_CATEGORY_OPTIONS } from '../../../shared/expenseCategories.js';
import {
  createExpenseRequestLineItem,
  expenseRequestLineTotal,
} from '../../lib/expenseRequestFormCore.js';

/**
 * @param {object} props
 * @param {object} props.form
 * @param {(fn: (prev: object) => object) => void} props.setForm
 * @param {(e: React.FormEvent) => void} props.onSubmit
 * @param {React.RefObject<HTMLInputElement | null>} props.fileInputRef
 * @param {(msg: string, opts?: { variant?: string }) => void} props.showToast
 * @param {(n: number) => string} props.formatNgn
 * @param {string} [props.submitLabel]
 * @param {string} [props.hintBeforeSubmit]
 * @param {{ category: string, reason?: string, onApply?: () => void } | null} [props.categoryRecommendation]
 */
export function ExpenseRequestFormFields({
  form,
  setForm,
  onSubmit,
  fileInputRef,
  showToast,
  formatNgn,
  submitLabel = 'Submit for approval',
  hintBeforeSubmit,
  categoryRecommendation = null,
}) {
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Request date</label>
          <input
            type="date"
            required
            value={form.requestDate}
            onChange={(e) => setForm((f) => ({ ...f, requestDate: e.target.value }))}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Reference</label>
          <input
            value={form.requestReference}
            onChange={(e) => setForm((f) => ({ ...f, requestReference: e.target.value }))}
            placeholder="Invoice / PO / internal ref"
            className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Description</label>
        <textarea
          rows={4}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Purpose, vendor, cost centre, or other context for approvers."
          className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-medium outline-none resize-y min-h-[96px]"
        />
      </div>
      <div>
        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Expense category</label>
        {categoryRecommendation?.category ? (
          <div className="mb-3 rounded-xl border border-teal-200/90 bg-teal-50/90 px-3 py-2.5">
            <p className="text-[9px] font-black uppercase tracking-wide text-teal-900/80">Recommended from memo text</p>
            <p className="text-[12px] font-bold text-teal-950 mt-0.5">{categoryRecommendation.category}</p>
            {categoryRecommendation.reason ? (
              <p className="text-[10px] text-teal-800/90 mt-1 leading-snug">{categoryRecommendation.reason}</p>
            ) : null}
            {categoryRecommendation.onApply ? (
              <button
                type="button"
                onClick={categoryRecommendation.onApply}
                className="mt-2 rounded-lg border border-teal-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase text-teal-900 hover:bg-teal-50"
              >
                Use recommended category
              </button>
            ) : null}
          </div>
        ) : null}
        <select
          required
          value={form.expenseCategory}
          onChange={(e) => setForm((f) => ({ ...f, expenseCategory: e.target.value }))}
          className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
        >
          <option value="" disabled>
            Select category…
          </option>
          {EXPENSE_CATEGORY_OPTIONS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-gray-400 mt-1 ml-1">
          Standard chart — same list as posted expenses for consistent month-end reporting.
        </p>
      </div>
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Line items</label>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, createExpenseRequestLineItem()] }))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[#134e4a] inline-flex items-center gap-1"
          >
            <Plus size={12} /> Add item
          </button>
        </div>
        <div className="rounded-xl border border-slate-200/80 overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_72px_100px_96px_40px] gap-2 px-3 py-2 bg-slate-50 text-[9px] font-black uppercase tracking-wide text-slate-500">
            <span>Item</span>
            <span className="text-center">Unit</span>
            <span className="text-right">Unit price</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          <ul className="divide-y divide-slate-100">
            {form.lines.map((row) => (
              <li
                key={row.id}
                className="p-3 sm:grid sm:grid-cols-[1fr_72px_100px_96px_40px] sm:items-center sm:gap-2 space-y-2 sm:space-y-0 bg-white/60"
              >
                <input
                  value={row.item}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      lines: f.lines.map((x) => (x.id === row.id ? { ...x, item: e.target.value } : x)),
                    }))
                  }
                  placeholder="Description of item or service"
                  className="w-full bg-white border border-slate-200 rounded-lg py-2 px-2 text-[11px] font-semibold outline-none"
                />
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={row.unit}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      lines: f.lines.map((x) => (x.id === row.id ? { ...x, unit: e.target.value } : x)),
                    }))
                  }
                  placeholder="Qty"
                  className="w-full bg-white border border-slate-200 rounded-lg py-2 px-2 text-[11px] font-bold outline-none text-center"
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={row.unitPriceNgn}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      lines: f.lines.map((x) => (x.id === row.id ? { ...x, unitPriceNgn: e.target.value } : x)),
                    }))
                  }
                  placeholder="₦"
                  className="w-full bg-white border border-slate-200 rounded-lg py-2 px-2 text-[11px] font-bold outline-none text-right tabular-nums"
                />
                <p className="text-[11px] font-black text-[#134e4a] tabular-nums text-right py-2 sm:py-0">
                  {formatNgn(expenseRequestLineTotal(row))}
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={form.lines.length <= 1}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        lines: f.lines.length <= 1 ? f.lines : f.lines.filter((x) => x.id !== row.id),
                      }))
                    }
                    className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:opacity-35"
                    title="Remove line (keep at least one)"
                  >
                    <X size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[10px] text-slate-500 mt-2">
          Total requested:{' '}
          <span className="font-black text-[#134e4a] tabular-nums">
            {formatNgn(form.lines.reduce((s, row) => s + expenseRequestLineTotal(row), 0))}
          </span>
        </p>
      </div>
      <div>
        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
          <span className="inline-flex items-center gap-1">
            <Paperclip size={12} className="opacity-60" />
            Attachment (invoice / receipt)
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 2.5 * 1024 * 1024) {
                showToast('File too large (max 2.5 MB).', { variant: 'error' });
                e.target.value = '';
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                const res = String(reader.result || '');
                const m = res.match(/^data:([^;]+);base64,(.+)$/);
                if (!m) {
                  showToast('Could not read file.', { variant: 'error' });
                  return;
                }
                setForm((prev) => ({
                  ...prev,
                  attachment: { name: f.name, mime: m[1], dataBase64: m[2] },
                }));
              };
              reader.readAsDataURL(f);
            }}
            className="block w-full text-[11px] text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-teal-50 file:text-[#134e4a]"
          />
          {form.attachment ? (
            <button
              type="button"
              onClick={() => {
                setForm((f) => ({ ...f, attachment: null }));
                if (fileInputRef?.current) fileInputRef.current.value = '';
              }}
              className="text-[10px] font-bold uppercase text-rose-700 bg-rose-50 px-3 py-2 rounded-lg"
            >
              Remove file
            </button>
          ) : null}
        </div>
        {form.attachment ? (
          <p className="text-[10px] text-slate-500 mt-1 truncate" title={form.attachment.name}>
            Selected: {form.attachment.name}
          </p>
        ) : (
          <p className="text-[10px] text-gray-400 mt-1">PDF or image. Optional but recommended.</p>
        )}
      </div>
      {hintBeforeSubmit ? (
        <p className="text-[10px] text-gray-400">{hintBeforeSubmit}</p>
      ) : null}
      <button type="submit" className="z-btn-primary w-full justify-center py-3">
        {submitLabel}
      </button>
    </form>
  );
}
