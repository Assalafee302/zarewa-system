import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { ModalFrame } from '../layout/ModalFrame';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { guidanceForLedgerPostFailure, isVoucherDateInLockedPeriod } from '../../lib/ledgerPostingGuidance';
import { amountDueOnQuotation, recordAdvanceAppliedToQuotation } from '../../lib/customerLedgerStore';
import { formatNgn } from '../../Data/mockData';
import { apiFetch } from '../../lib/apiBase';
import { dismissAdvanceEntryId } from '../../lib/advanceEntryUiStore';

/**
 * Apply a customer advance (from an ADVANCE_IN row) to a quotation.
 */
export default function LinkAdvanceModal({
  isOpen,
  onClose,
  advanceEntry,
  quotations = [],
  onPosted,
  useLedgerApi = false,
}) {
  const { show: showToast } = useToast();
  const ws = useWorkspace();
  const [quotationRef, setQuotationRef] = useState('');
  const [amount, setAmount] = useState('');
  const [postingHint, setPostingHint] = useState(null);

  const applyDateISO = useMemo(() => {
    const raw = advanceEntry?.atISO || advanceEntry?.at_iso;
    if (raw && typeof raw === 'string') return raw.slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  }, [advanceEntry?.atISO, advanceEntry?.at_iso]);

  const periodLocks = ws?.snapshot?.periodLocks ?? [];
  const dateLocked = useMemo(
    () => Boolean(useLedgerApi && isVoucherDateInLockedPeriod(applyDateISO, periodLocks)),
    [useLedgerApi, applyDateISO, periodLocks]
  );

   
  useEffect(() => {
    if (!isOpen || !advanceEntry) return;
    setQuotationRef('');
    setPostingHint(null);
    setAmount(
      advanceEntry.amountNgn != null ? String(Math.min(Number(advanceEntry.amountNgn) || 0, 999999999)) : ''
    );
  }, [isOpen, advanceEntry]);
   

  const quoteOptions = useMemo(() => {
    const cid = advanceEntry?.customerID;
    const base = cid ? quotations.filter((q) => q.customerID === cid) : quotations;
    return base.map((q) => ({ q, due: amountDueOnQuotation(q) }));
  }, [quotations, advanceEntry?.customerID]);

  const selectedQ = useMemo(
    () => quotations.find((q) => q.id === quotationRef) ?? null,
    [quotations, quotationRef]
  );

  const dueNgn = useMemo(() => {
    if (!selectedQ) return 0;
    return amountDueOnQuotation(selectedQ);
  }, [selectedQ]);

  const maxApply = useMemo(() => {
    const adv = Number(advanceEntry?.amountNgn) || 0;
    return Math.max(0, Math.min(adv, dueNgn));
  }, [advanceEntry?.amountNgn, dueNgn]);

  const submit = async (e) => {
    e.preventDefault();
    if (!advanceEntry) return;
    const n = Math.round(Number(String(amount).replace(/,/g, '')));
    if (!quotationRef || !selectedQ) {
      showToast('Select a quotation.', { variant: 'error' });
      return;
    }
    if (Number.isNaN(n) || n <= 0) {
      showToast('Enter amount to apply.', { variant: 'error' });
      return;
    }
    if (n > maxApply) {
      showToast(`Amount cannot exceed ${formatNgn(maxApply)} (advance line vs quote due).`, { variant: 'error' });
      return;
    }
    if (useLedgerApi) {
      const { ok, data } = await apiFetch('/api/ledger/apply-advance', {
        method: 'POST',
        body: JSON.stringify({
          customerID: advanceEntry.customerID,
          customerName: advanceEntry.customerName ?? '',
          quotationRef,
          amountNgn: n,
          dateISO: applyDateISO,
        }),
      });
      if (!ok || !data?.ok) {
        setPostingHint(guidanceForLedgerPostFailure(data) || null);
        showToast(data?.error || 'Could not apply advance.', { variant: 'error' });
        return;
      }
      setPostingHint(null);
    } else {
      const res = recordAdvanceAppliedToQuotation({
        customerID: advanceEntry.customerID,
        customerName: advanceEntry.customerName ?? '',
        quotationRef,
        amountNgn: n,
      });
      if (!res.ok) {
        showToast(res.error, { variant: 'error' });
        return;
      }
    }
    if (n >= (Number(advanceEntry.amountNgn) || 0) - 0.5) {
      dismissAdvanceEntryId(advanceEntry.id);
    }
    showToast(`Applied ${formatNgn(n)} advance to ${quotationRef}.`);
    await onPosted?.();
    onClose();
  };

  if (!advanceEntry) return null;

  return (
    <ModalFrame isOpen={isOpen} onClose={onClose}>
      <form
        onSubmit={submit}
        className="z-modal-panel max-w-md w-full flex flex-col bg-white rounded-2xl border border-slate-200 shadow-xl"
      >
        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-base font-bold text-[#134e4a]">Link advance to quotation</h2>
            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">
              {advanceEntry.customerName ?? advanceEntry.customerID} · {formatNgn(advanceEntry.amountNgn)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-red-500"
          >
            <X size={20} />
          </button>
        </div>
        {useLedgerApi && dateLocked ? (
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-[10px] text-amber-950">
            <p className="font-bold">Ledger date is in a locked period</p>
            <p className="mt-0.5 leading-snug">Applying advance uses the advance line date ({applyDateISO}). Change period lock or use a different advance line.</p>
            <Link to="/settings/governance" className="mt-1 inline-block font-semibold text-amber-900 underline underline-offset-2">
              Period controls
            </Link>
          </div>
        ) : null}
        {postingHint ? (
          <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-200 text-[10px] text-rose-950 space-y-1">
            <p className="font-bold">{postingHint.title}</p>
            <p className="leading-snug">{postingHint.detail}</p>
            {postingHint.links?.length ? (
              <div className="flex flex-wrap gap-x-2">
                {postingHint.links.map((l) => (
                  <Link key={l.to} to={l.to} className="font-semibold underline underline-offset-2">
                    {l.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[9px] font-semibold text-slate-400 uppercase mb-1 block">Quotation</label>
            <select
              value={quotationRef}
              onChange={(e) => setQuotationRef(e.target.value)}
              className="w-full rounded-lg border border-slate-200 py-2.5 px-3 text-xs font-semibold text-[#134e4a]"
            >
              <option value="">Select…</option>
              {quoteOptions.map(({ q, due }) => (
                <option key={q.id} value={q.id}>
                  {q.id} · {q.customer} · due {formatNgn(due)}
                </option>
              ))}
            </select>
            {quoteOptions.length === 0 ? (
              <p className="text-[10px] text-amber-700 mt-1">No quotations for this customer.</p>
            ) : null}
          </div>
          {selectedQ ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-[10px] text-slate-600 space-y-1">
              <p>
                <span className="font-semibold text-[#134e4a]">Quote total:</span>{' '}
                {formatNgn(selectedQ.totalNgn)}
              </p>
              <p>
                <span className="font-semibold text-[#134e4a]">Balance due (ledger):</span> {formatNgn(dueNgn)}
              </p>
              <p>
                <span className="font-semibold text-[#134e4a]">Max apply now:</span> {formatNgn(maxApply)}
              </p>
            </div>
          ) : null}
          <div>
            <label className="text-[9px] font-semibold text-slate-400 uppercase mb-1 block">Amount to apply (₦)</label>
            <input
              type="number"
              min="1"
              max={maxApply || undefined}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-200 py-2.5 px-3 text-sm font-bold text-[#134e4a] tabular-nums"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[10px] font-semibold uppercase border border-slate-200 text-slate-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[#134e4a] text-white text-[10px] font-semibold uppercase"
          >
            Apply & remove from list
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
