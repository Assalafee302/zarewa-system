import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X, Wallet, Save, Printer } from 'lucide-react';
import { ModalFrame } from './layout/ModalFrame';
import { useCustomers } from '../context/CustomersContext';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { recordAdvancePayment } from '../lib/customerLedgerStore';
import { formatNgn } from '../Data/mockData';
import { apiFetch } from '../lib/apiBase';
import { guidanceForLedgerPostFailure, isVoucherDateInLockedPeriod } from '../lib/ledgerPostingGuidance';
import { treasuryAccountsFromSnapshot } from '../lib/treasuryAccountsStore';
import { AdvancePaymentPrintView } from './receipt/ReceiptPrintViews';

/**
 * Standalone advance / deposit — no quotation. Liability until applied or refunded.
 */
const AdvancePaymentModal = ({
  isOpen,
  onClose,
  onPosted,
  defaultCustomerID = '',
  useLedgerApi = false,
  handledByLabel = 'Sales',
}) => {
  const { customers } = useCustomers();
  const { show: showToast } = useToast();
  const ws = useWorkspace();
  const [customerID, setCustomerID] = useState('');
  const [amount, setAmount] = useState('');
  const [treasuryAccountId, setTreasuryAccountId] = useState('');
  const [dateISO, setDateISO] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [purpose, setPurpose] = useState('');
  const [showPrint, setShowPrint] = useState(false);
  const [postingHint, setPostingHint] = useState(null);

  const treasuryList = useMemo(() => treasuryAccountsFromSnapshot(ws?.snapshot), [ws?.snapshot]);
  const periodLocks = ws?.snapshot?.periodLocks ?? [];
  const voucherInLockedPeriod = useMemo(
    () => Boolean(useLedgerApi && isVoucherDateInLockedPeriod(dateISO, periodLocks)),
    [useLedgerApi, dateISO, periodLocks]
  );

   
  useEffect(() => {
    if (!isOpen) return;
    setCustomerID(defaultCustomerID || '');
    setAmount('');
    const first = treasuryList[0];
    setTreasuryAccountId(first ? String(first.id) : '');
    setDateISO(new Date().toISOString().slice(0, 10));
    setReference('');
    setPurpose('');
    setShowPrint(false);
    setPostingHint(null);
  }, [isOpen, defaultCustomerID, treasuryList]);
   

  const customerName = useMemo(
    () => customers.find((c) => c.customerID === customerID)?.name ?? '',
    [customers, customerID]
  );

  const selectedAccount = useMemo(() => {
    const id = Number(treasuryAccountId);
    return treasuryList.find((a) => a.id === id) ?? treasuryList[0] ?? null;
  }, [treasuryList, treasuryAccountId]);

  const accountLabelForPrint = useMemo(() => {
    if (!selectedAccount) return '—';
    return `${selectedAccount.type} — ${selectedAccount.name}${
      selectedAccount.accNo && selectedAccount.accNo !== 'N/A' ? ` (${selectedAccount.accNo})` : ''
    }`;
  }, [selectedAccount]);

  const submit = async (e) => {
    e.preventDefault();
    if (!customerID) {
      showToast('Select a customer.', { variant: 'error' });
      return;
    }
    if (!selectedAccount) {
      showToast('Add a treasury account in Finance first.', { variant: 'error' });
      return;
    }
    const n = Number(String(amount).replace(/,/g, ''));
    if (Number.isNaN(n) || n <= 0) {
      showToast('Enter a valid amount.', { variant: 'error' });
      return;
    }
    const paymentMethod = `${selectedAccount.type} — ${selectedAccount.name}`;
    if (useLedgerApi) {
      const { ok, data } = await apiFetch('/api/ledger/advance', {
        method: 'POST',
        body: JSON.stringify({
          customerID,
          customerName,
          amountNgn: n,
          paymentMethod,
          bankReference: [reference.trim(), accountLabelForPrint].filter(Boolean).join(' | '),
          purpose: purpose.trim(),
          dateISO,
          treasuryAccountId: Number(treasuryAccountId),
          paymentLines: [{ treasuryAccountId: Number(treasuryAccountId), amountNgn: n, reference: reference.trim() }],
        }),
      });
      if (!ok || !data?.ok) {
        setPostingHint(guidanceForLedgerPostFailure(data) || null);
        showToast(data?.error || 'Could not post advance to server.', { variant: 'error' });
        return;
      }
      setPostingHint(null);
    } else {
      const res = recordAdvancePayment({
        customerID,
        customerName,
        amountNgn: n,
        paymentMethod,
        bankReference: [reference.trim(), accountLabelForPrint].filter(Boolean).join(' | '),
        purpose: purpose.trim(),
        dateISO,
      });
      if (!res.ok) {
        showToast(res.error, { variant: 'error' });
        return;
      }
    }
    showToast(`Advance ${formatNgn(n)} recorded — not revenue until applied or receipt against a quote.`);
    await onPosted?.();
    onClose();
  };

  const openPrintPreview = () => {
    const n = Number(String(amount).replace(/,/g, ''));
    if (!customerID || Number.isNaN(n) || n <= 0) {
      showToast('Select customer and amount to print.', { variant: 'error' });
      return;
    }
    setShowPrint(true);
  };

  return (
    <ModalFrame isOpen={isOpen} onClose={onClose} modal={!showPrint}>
      <>
      <form
        onSubmit={submit}
        className="z-modal-panel max-w-[min(100%,26rem)] w-full max-h-[min(92vh,640px)] flex flex-col bg-white"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-white shrink-0">
              <Wallet size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#134e4a] tracking-tight">Advance payment</h2>
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">
                Deposit before quotation — liability, not revenue
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-xl shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {useLedgerApi && voucherInLockedPeriod ? (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-[10px] text-amber-950 space-y-1">
            <p className="font-bold">Date is in a locked accounting period</p>
            <p className="leading-snug">Choose an open month or ask finance to unlock the period.</p>
            <Link to="/settings/governance" className="inline-flex font-semibold text-amber-900 underline underline-offset-2">
              Period controls
            </Link>
          </div>
        ) : null}

        {postingHint ? (
          <div className="px-5 py-3 bg-rose-50/90 border-b border-rose-200 text-[10px] text-rose-950 space-y-2">
            <p className="text-[11px] font-bold">{postingHint.title}</p>
            <p className="leading-snug opacity-95">{postingHint.detail}</p>
            {postingHint.steps?.length ? (
              <ol className="list-decimal pl-4 space-y-1">
                {postingHint.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            ) : null}
            {postingHint.links?.length ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {postingHint.links.map((l) => (
                  <Link key={l.to} to={l.to} className="font-semibold text-rose-900 underline underline-offset-2">
                    {l.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          <div>
            <label className="text-[9px] font-semibold text-slate-400 uppercase ml-0.5 mb-1 block">
              Customer
            </label>
            <select
              value={customerID}
              onChange={(e) => setCustomerID(e.target.value)}
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-3 text-sm font-semibold text-[#134e4a] outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.customerID} value={c.customerID}>
                  {c.name} · {c.phoneNumber}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-semibold text-slate-400 uppercase ml-0.5 mb-1 block">
              Amount paid (₦)
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 200000"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-3 text-sm font-bold text-[#134e4a] tabular-nums outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
          <div>
            <label className="text-[9px] font-semibold text-slate-400 uppercase ml-0.5 mb-1 block">
              Received into (treasury)
            </label>
            <select
              value={treasuryAccountId}
              onChange={(e) => setTreasuryAccountId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-3 text-xs font-semibold text-[#134e4a] outline-none"
            >
              {treasuryList.length === 0 ? (
                <option value="">No accounts — add in Finance</option>
              ) : (
                treasuryList.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.type} — {a.name}
                  </option>
                ))
              )}
            </select>
            <p className="text-[9px] text-slate-500 mt-1">Bank or cash till — method is implied by account.</p>
          </div>
          <div>
            <label className="text-[9px] font-semibold text-slate-400 uppercase ml-0.5 mb-1 block">Date</label>
            <input
              type="date"
              value={dateISO}
              onChange={(e) => setDateISO(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-3 text-xs font-semibold text-[#134e4a] outline-none"
            />
          </div>
          <div>
            <label className="text-[9px] font-semibold text-slate-400 uppercase ml-0.5 mb-1 block">
              Reference (transfer ID / POS ref)
            </label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-3 text-sm font-medium text-slate-800 outline-none"
            />
          </div>
          <div>
            <label className="text-[9px] font-semibold text-slate-400 uppercase ml-0.5 mb-1 block">
              Purpose (optional)
            </label>
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Roofing deposit"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-3 text-sm font-medium text-slate-800 outline-none"
            />
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed rounded-lg border border-amber-100 bg-amber-50/50 p-3">
            Ledger row is the audit trail for customer advance balance and quotation application.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex flex-wrap justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={openPrintPreview}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-amber-300 text-amber-900 text-[10px] font-semibold uppercase hover:bg-amber-50"
          >
            <Printer size={14} /> Print preview
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-[10px] font-semibold uppercase text-slate-600 border border-slate-200 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 text-white text-[10px] font-semibold uppercase shadow-sm hover:bg-amber-700"
          >
            <Save size={14} /> Save advance
          </button>
        </div>
      </form>

      {showPrint &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Close print preview"
              className="no-print fixed inset-0 z-[11060] bg-black/50"
              onClick={() => setShowPrint(false)}
            />
            <div
              className="print-portal-scroll fixed inset-0 z-[11070] overflow-y-auto overscroll-y-contain p-4 sm:p-8"
              onClick={() => setShowPrint(false)}
            >
              <div className="mx-auto max-w-4xl pb-16" onClick={(e) => e.stopPropagation()}>
                <div className="quotation-print-root quotation-print-preview-mode rounded-lg border border-slate-200 bg-white shadow-2xl print:rounded-none print:border-0 print:shadow-none">
                  <AdvancePaymentPrintView
                    customerName={customerName || customerID || '—'}
                    amountNgn={Number(String(amount).replace(/,/g, '')) || 0}
                    dateStr={dateISO}
                    accountLabel={accountLabelForPrint}
                    reference={reference || '—'}
                    purpose={purpose || '—'}
                    handledBy={handledByLabel}
                  />
                </div>
                <div className="no-print mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-lg bg-amber-700 px-5 py-2.5 text-[10px] font-semibold uppercase text-white shadow-lg"
                  >
                    Print / Save PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPrint(false)}
                    className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-[10px] font-semibold uppercase text-slate-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
      </>
    </ModalFrame>
  );
};

export default AdvancePaymentModal;
