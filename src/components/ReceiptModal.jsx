import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Trash2,
  Printer,
  ChevronDown,
  Save,
  Landmark,
  Plus,
} from 'lucide-react';
import { ModalFrame } from './layout/ModalFrame';
import { useCustomers } from '../context/CustomersContext';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  amountDueOnQuotation,
  recordReceiptWithQuotation,
} from '../lib/customerLedgerStore';
import { quotationReceiptPrintHistory } from '../lib/salesReceiptsList';
import { formatNgn } from '../Data/mockData';
import { apiFetch } from '../lib/apiBase';
import { treasuryAccountsFromSnapshot } from '../lib/treasuryAccountsStore';
import { ReceiptPrintQuick, ReceiptPrintFull } from './receipt/ReceiptPrintViews';

function newLineId() {
  return `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyPaymentLine(voucherDate, defaultAccountId) {
  return {
    id: newLineId(),
    payeeName: '',
    treasuryAccountId: defaultAccountId,
    lineDate: voucherDate,
    amount: '',
  };
}

function parseNum(s) {
  const n = Number(String(s ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function formatDisplayDate(iso) {
  if (!iso || typeof iso !== 'string') return '—';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

const ReceiptModal = ({
  isOpen,
  onClose,
  editData = null,
  accessMode = 'edit',
  quotations = [],
  importedReceiptsForHistory = [],
  onLedgerChange,
  ledgerNonce = 0,
  useLedgerApi = false,
  handledByLabel = 'Sales',
}) => {
  const { customers } = useCustomers();
  const { show: showToast } = useToast();
  const ws = useWorkspace();
  const isEdit = Boolean(editData?.id);
  const readOnly = accessMode === 'view';

  const [quotationRef, setQuotationRef] = useState('');
  const [voucherDate, setVoucherDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [paymentLines, setPaymentLines] = useState([]);
  const [showPrint, setShowPrint] = useState(false);
  const [printKind, setPrintKind] = useState('quick');

  const treasuryList = useMemo(() => treasuryAccountsFromSnapshot(ws?.snapshot), [ws?.snapshot]);

  const defaultAccountId = treasuryList[0]?.id ?? '';

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) return;
    const le = editData?._ledgerEntry;
    const isLedgerRow = editData?.source === 'ledger' && le;
    const isRc = editData?.id && String(editData.id).startsWith('RC-');
    const vd = isRc
      ? editData.dateISO ?? new Date().toISOString().slice(0, 10)
      : isLedgerRow
        ? String(le.atISO || '').slice(0, 10) || new Date().toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    setVoucherDate(vd);
    setRemarks(isLedgerRow ? (le.bankReference || le.note || '') : '');
    setQuotationRef(editData?.quotationRef ?? '');
    setShowPrint(false);

    if (isRc) {
      setPaymentLines([
        {
          id: newLineId(),
          payeeName: editData.handledBy ?? '',
          treasuryAccountId: defaultAccountId,
          lineDate: vd,
          amount: editData.amountNgn != null ? String(editData.amountNgn) : '',
        },
      ]);
    } else if (isLedgerRow) {
      setPaymentLines([
        {
          id: newLineId(),
          payeeName: (le.customerName || editData.customer || '').trim() || 'Payer',
          treasuryAccountId: defaultAccountId,
          lineDate: vd,
          amount: le.amountNgn != null ? String(le.amountNgn) : '',
        },
      ]);
    } else {
      setPaymentLines([emptyPaymentLine(vd, defaultAccountId)]);
    }
  }, [
    isOpen,
    editData?.id,
    editData?.source,
    editData?.quotationRef,
    editData?.dateISO,
    editData?.amountNgn,
    editData?.handledBy,
    editData?.customer,
    editData?._ledgerEntry,
    defaultAccountId,
    ledgerNonce,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectedQuotation = useMemo(
    () => quotations.find((q) => q.id === quotationRef) ?? null,
    [quotations, quotationRef]
  );

  const customerID = selectedQuotation?.customerID ?? '';
  const customerName = useMemo(() => {
    if (!customerID) return selectedQuotation?.customer ?? editData?.customer ?? '';
    return customers.find((c) => c.customerID === customerID)?.name ?? selectedQuotation?.customer ?? '';
  }, [customers, customerID, selectedQuotation?.customer, editData?.customer]);

  const customerPhone = useMemo(() => {
    if (!customerID) return '—';
    return customers.find((c) => c.customerID === customerID)?.phoneNumber ?? '—';
  }, [customers, customerID]);

  const dueNgn = useMemo(() => {
    if (!selectedQuotation) return null;
    return amountDueOnQuotation(selectedQuotation);
  }, [selectedQuotation]);

  const lineTotalNgn = useMemo(
    () => paymentLines.reduce((s, l) => s + parseNum(l.amount), 0),
    [paymentLines]
  );

  const balanceAfterNgn = useMemo(() => {
    if (dueNgn == null) return null;
    return Math.max(0, dueNgn - lineTotalNgn);
  }, [dueNgn, lineTotalNgn]);

  /** Linked quotation context for UI + print — no amounts (B&W / privacy friendly on receipt). */
  const quotationContextText = useMemo(() => {
    if (!selectedQuotation) return '';
    const parts = [
      `Quotation: ${selectedQuotation.id}`,
      `Customer: ${selectedQuotation.customer}`,
      selectedQuotation.projectName ? `Project: ${selectedQuotation.projectName}` : null,
      `Approval: ${selectedQuotation.status ?? '—'}`,
      `Payment status: ${selectedQuotation.paymentStatus ?? '—'}`,
    ];
    return parts.filter(Boolean).join(' · ');
  }, [selectedQuotation]);

  const treasuryById = useMemo(() => {
    const m = new Map();
    treasuryList.forEach((a) => m.set(a.id, a));
    return m;
  }, [treasuryList]);

  const quotationPaymentHistory = useMemo(
    () =>
      quotationRef
        ? quotationReceiptPrintHistory(quotationRef, importedReceiptsForHistory)
        : [],
    [quotationRef, importedReceiptsForHistory]
  );

  const printLinesPayload = useMemo(() => {
    return paymentLines
      .filter((l) => parseNum(l.amount) > 0)
      .map((l) => {
        const acc = treasuryById.get(Number(l.treasuryAccountId)) ?? treasuryList[0];
        const accountLabel = acc
          ? `${acc.type} — ${acc.name}${acc.accNo && acc.accNo !== 'N/A' ? ` (${acc.accNo})` : ''}`
          : '—';
        return {
          payeeName: l.payeeName.trim() || 'Payer',
          accountLabel,
          amount: parseNum(l.amount),
        };
      });
  }, [paymentLines, treasuryById, treasuryList]);

  const saveReceipt = async (e) => {
    e.preventDefault();
    if (readOnly) return;
    if (treasuryList.length === 0) {
      showToast('Configure treasury accounts first.', { variant: 'error' });
      return;
    }
    if (!quotationRef || !selectedQuotation) {
      showToast('Select a quotation — customer is taken from the quote.', { variant: 'error' });
      return;
    }
    if (!customerID) {
      showToast('This quotation has no customer on file.', { variant: 'error' });
      return;
    }
    const validLines = paymentLines.filter((l) => parseNum(l.amount) > 0);
    if (validLines.length === 0) {
      showToast('Enter at least one payment amount.', { variant: 'error' });
      return;
    }
    const total = validLines.reduce((s, l) => s + parseNum(l.amount), 0);
    if (total <= 0) {
      showToast('Total must be greater than zero.', { variant: 'error' });
      return;
    }

    const refParts = validLines.map((l) => {
      const acc = treasuryById.get(Number(l.treasuryAccountId)) ?? treasuryList[0];
      const accBit = acc ? `${acc.type}:${acc.name}` : '';
      return `${(l.payeeName || 'Payee').trim()} ${formatNgn(parseNum(l.amount))} ${accBit}`.trim();
    });
    const bankReference = [refParts.join(' | '), remarks.trim()].filter(Boolean).join(' — ');
    const firstAcc = treasuryById.get(Number(validLines[0].treasuryAccountId)) ?? treasuryList[0];
    const paymentMethod =
      validLines.length === 1 && firstAcc
        ? `${firstAcc.type} — ${firstAcc.name}`
        : `Split (${validLines.length} lines)`;

    if (useLedgerApi) {
      const { ok, data } = await apiFetch('/api/ledger/receipt', {
        method: 'POST',
        body: JSON.stringify({
          customerID,
          customerName,
          quotationId: selectedQuotation.id,
          amountNgn: total,
          paymentMethod,
          bankReference,
          dateISO: voucherDate,
          paymentLines: validLines.map((line) => ({
            treasuryAccountId: Number(line.treasuryAccountId),
            amountNgn: parseNum(line.amount),
            reference: [line.payeeName?.trim?.(), remarks.trim()].filter(Boolean).join(' — '),
          })),
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not post receipt.', { variant: 'error' });
        return;
      }
      showToast(`Receipt ${formatNgn(total)} posted against ${selectedQuotation.id}.`);
    } else {
      const res = recordReceiptWithQuotation({
        customerID,
        customerName,
        quotationRow: selectedQuotation,
        amountNgn: total,
        paymentMethod,
        bankReference,
        dateISO: voucherDate,
      });
      if (!res.ok) {
        showToast(res.error, { variant: 'error' });
        return;
      }
      if (res.overpay) {
        showToast(
          `Receipt ${formatNgn(res.receipt?.amountNgn ?? 0)} + advance ${formatNgn(res.overpay.amountNgn)} (overpayment).`
        );
      } else if (dueNgn != null && total < dueNgn) {
        showToast(`Part payment ${formatNgn(total)} posted. Remaining on quote ≈ ${formatNgn(dueNgn - total)}.`);
      } else {
        showToast(`Receipt ${formatNgn(total)} posted against ${selectedQuotation.id}.`);
      }
    }
    await onLedgerChange?.();
    onClose();
  };

  const label = 'text-[9px] font-semibold text-slate-400 uppercase tracking-wide ml-0.5 mb-1 block';
  const field =
    'w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs font-semibold text-[#134e4a] outline-none focus:ring-2 focus:ring-emerald-500/15';

  const displayTotal = selectedQuotation?.totalNgn ?? 0;
  const displayPaid = selectedQuotation?.paidNgn ?? 0;
  const displayBalance = dueNgn != null ? dueNgn : Math.max(0, displayTotal - displayPaid);

  const receiptIdPreview = isEdit ? editData.id : `RC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-NEW`;

  const openPrint = (kind) => {
    if (!quotationRef) {
      showToast('Select a quotation before printing.', { variant: 'error' });
      return;
    }
    if (lineTotalNgn <= 0) {
      showToast('Enter payment amounts to print.', { variant: 'error' });
      return;
    }
    setPrintKind(kind);
    setShowPrint(true);
  };

  const updateLine = (id, patch) =>
    setPaymentLines((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addLine = () =>
    setPaymentLines((prev) => [...prev, emptyPaymentLine(voucherDate, defaultAccountId)]);
  const removeLine = (id) =>
    setPaymentLines((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));

  return (
    <ModalFrame isOpen={isOpen} onClose={onClose}>
      <>
      <form
        key={`${editData?.id ?? 'new'}-${ledgerNonce}`}
        onSubmit={saveReceipt}
        className="z-modal-panel max-w-[min(100%,44rem)] w-full max-h-[min(92vh,820px)] flex flex-col"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-white shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">
              R
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 gap-y-1">
                <h2 className="text-base font-bold text-[#134e4a] tracking-tight">Payment receipt</h2>
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                    readOnly
                      ? 'bg-slate-200 text-slate-700'
                      : 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-600/20'
                  }`}
                >
                  {readOnly ? 'View' : 'Edit'}
                </span>
              </div>
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest truncate mt-0.5">
                {isEdit ? `${editData.id} · ${editData.customer ?? 'Customer'}` : 'New receipt'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-xl transition-all shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {readOnly ? (
          <div className="px-5 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-medium text-slate-600">
            {editData?.source === 'ledger'
              ? 'This row is a live ledger payment — view and print only. Corrections go through Finance.'
              : 'View only for sales. Imported rows are not the live ledger; new posts are recorded on the customer ledger.'}
          </div>
        ) : null}

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-white min-h-0">
          <div
            className={`flex-1 overflow-y-auto p-5 custom-scrollbar border-r border-slate-100 ${readOnly ? 'pointer-events-none opacity-75' : ''}`}
          >
            <div className="rounded-xl border border-slate-200/90 p-4 mb-5 bg-slate-50/50">
              <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
                Voucher & quotation
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label}>Voucher date</label>
                  <input
                    type="date"
                    value={voucherDate}
                    onChange={(e) => setVoucherDate(e.target.value)}
                    className={`${field} cursor-pointer`}
                  />
                </div>
                <div className="relative sm:col-span-2">
                  <label className={label}>Link quotation (required)</label>
                  <select
                    value={quotationRef}
                    onChange={(e) => setQuotationRef(e.target.value)}
                    className={`${field} appearance-none cursor-pointer pr-8`}
                  >
                    <option value="">Select quotation…</option>
                    {quotations.map((qt) => (
                      <option key={qt.id} value={qt.id}>
                        {qt.id} · {qt.customer} · {formatNgn(qt.totalNgn)} · {qt.paymentStatus}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 bottom-2.5 text-slate-300 pointer-events-none" />
                </div>
                {selectedQuotation ? (
                  <div className="sm:col-span-2 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 text-[10px] text-slate-700 leading-relaxed">
                    <p className="text-[8px] font-bold uppercase text-emerald-800 mb-1">Linked quotation</p>
                    <p>{quotationContextText}</p>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <label className={label}>Reference / remarks (applies to whole voucher)</label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Transfer ID, POS ref, or note"
                    className={field}
                  />
                </div>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="text-[10px] font-semibold text-[#134e4a] uppercase tracking-widest">
                Payment breakdown
              </h3>
            </div>

            {treasuryList.length === 0 ? (
              <p className="text-[10px] font-medium text-amber-800 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                No treasury accounts on file. Add accounts under Finance so receipts can post to bank or cash.
              </p>
            ) : null}
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-3 space-y-2">
              <div className="grid grid-cols-12 gap-2 px-1 text-[8px] font-semibold text-slate-400 uppercase tracking-wider">
                <div className="col-span-12 sm:col-span-3">Payee name</div>
                <div className="col-span-6 sm:col-span-3">Account</div>
                <div className="col-span-4 sm:col-span-2">Date</div>
                <div className="col-span-2 sm:col-span-2 text-center">Amount ₦</div>
                <div className="col-span-12 sm:col-span-2 text-right"> </div>
              </div>
              {paymentLines.map((line, idx) => {
                const isLast = idx === paymentLines.length - 1;
                return (
                  <div
                    key={line.id}
                    className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-lg border border-slate-200"
                  >
                    <input
                      type="text"
                      placeholder="Who paid / depositor"
                      value={line.payeeName}
                      onChange={(e) => updateLine(line.id, { payeeName: e.target.value })}
                      className="col-span-12 sm:col-span-3 border border-slate-200 rounded-lg py-1.5 px-2 text-[11px] font-semibold text-[#134e4a] outline-none"
                    />
                    <div className="col-span-6 sm:col-span-3 relative">
                      <select
                        value={String(line.treasuryAccountId)}
                        onChange={(e) => updateLine(line.id, { treasuryAccountId: Number(e.target.value) })}
                        className="w-full border border-slate-200 rounded-lg py-1.5 px-2 text-[11px] font-semibold text-[#134e4a] appearance-none outline-none"
                      >
                        {treasuryList.map((a) => (
                          <option key={a.id} value={String(a.id)}>
                            {a.type} — {a.name}
                          </option>
                        ))}
                      </select>
                      <Landmark
                        size={12}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <input
                        type="date"
                        value={line.lineDate}
                        onChange={(e) => updateLine(line.id, { lineDate: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg py-1.5 px-1 text-[11px] font-semibold text-[#134e4a]"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={line.amount}
                        onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg py-1.5 px-2 text-[11px] text-center font-bold text-emerald-700 tabular-nums"
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-2 flex justify-end items-center gap-1">
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg"
                        title="Remove line"
                      >
                        <Trash2 size={14} />
                      </button>
                      {!readOnly && isLast ? (
                        <button
                          type="button"
                          onClick={addLine}
                          className="p-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          title="Add payment line"
                        >
                          <Plus size={16} strokeWidth={2.5} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {lineTotalNgn > 0 && dueNgn != null && lineTotalNgn > dueNgn ? (
              <p className="mt-2 text-[10px] font-medium text-amber-800">
                Total exceeds current balance due — excess will post to <strong>customer advance</strong> automatically.
              </p>
            ) : null}
          </div>

          <div
            className={`w-full md:w-72 bg-slate-50/90 p-4 flex flex-col gap-3 shrink-0 border-t md:border-t-0 md:border-l border-slate-100 ${readOnly ? 'opacity-85' : ''}`}
          >
            <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Linked quote
            </p>
            {selectedQuotation ? (
              <>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-[8px] font-semibold text-slate-400 uppercase mb-1">Customer (from quote)</p>
                  <p className="text-sm font-bold text-[#134e4a]">{customerName}</p>
                  <p className="text-[10px] text-slate-500">{customerPhone}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-[8px] font-semibold text-slate-400 uppercase mb-1">Quotation total</p>
                  <p className="text-lg font-bold text-[#134e4a] tabular-nums">{formatNgn(displayTotal)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-[8px] font-semibold text-slate-400 uppercase mb-1">Paid on file</p>
                  <p className="text-lg font-bold text-sky-700 tabular-nums">{formatNgn(displayPaid)}</p>
                </div>
                <div className="rounded-lg border border-[#134e4a]/30 bg-[#134e4a] p-3 text-white">
                  <p className="text-[8px] font-semibold text-white/50 uppercase mb-1">Balance due (ledger)</p>
                  <p className="text-lg font-bold text-emerald-200 tabular-nums">{formatNgn(displayBalance)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-[8px] font-semibold text-slate-400 uppercase mb-1">This voucher total</p>
                  <p className="text-xl font-black text-emerald-700 tabular-nums">{formatNgn(lineTotalNgn)}</p>
                  {balanceAfterNgn != null ? (
                    <p className="text-[9px] text-slate-500 mt-1">
                      Est. balance after post: <span className="font-bold tabular-nums">{formatNgn(balanceAfterNgn)}</span>
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-[10px] text-amber-950 leading-snug">
                Select a quotation to load customer, balances, and print-ready totals.
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 bg-emerald-600 flex justify-between items-center text-white shrink-0 flex-wrap gap-3">
          <div>
            <p className="text-[9px] font-semibold text-white/50 uppercase tracking-widest mb-0.5">
              Voucher total
            </p>
            <p className="text-2xl font-bold text-white tabular-nums">{formatNgn(lineTotalNgn)}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="submit"
              disabled={readOnly}
              className="bg-white/10 px-4 py-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide border border-white/15 hover:bg-white/20 disabled:opacity-40"
            >
              <Save size={14} className="inline mr-1.5" /> Post to ledger
            </button>
            <button
              type="button"
              onClick={() => openPrint('quick')}
              className="bg-white/90 text-emerald-800 px-3 py-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide shadow-sm"
            >
              <Printer size={14} className="inline mr-1" /> Quick print
            </button>
            <button
              type="button"
              onClick={() => openPrint('full')}
              className="bg-white text-emerald-700 px-3 py-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide shadow-sm"
            >
              <Printer size={14} className="inline mr-1" /> Full (A5 landscape)
            </button>
          </div>
        </div>
      </form>

      {showPrint &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Close print preview"
              className="no-print fixed inset-0 z-[10000] bg-black/50"
              onClick={() => setShowPrint(false)}
            />
            <div className="no-print fixed inset-0 z-[10001] overflow-y-auto p-4 sm:p-8 pointer-events-none">
              <div
                className={`pointer-events-auto mx-auto pb-16 ${printKind === 'quick' ? 'max-w-[88mm]' : 'max-w-[min(100%,220mm)]'}`}
              >
                <div className="receipt-print-root overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl print:rounded-none print:border-0 print:shadow-none">
                  {printKind === 'quick' ? (
                    <ReceiptPrintQuick
                      receiptId={receiptIdPreview}
                      dateStr={formatDisplayDate(voucherDate)}
                      customerName={customerName || '—'}
                      quotationRef={quotationRef || '—'}
                      quotationPaymentHistory={quotationPaymentHistory}
                      highlightReceiptId={isEdit ? String(editData.id) : ''}
                      lines={printLinesPayload}
                      totalNgn={lineTotalNgn}
                      reference={remarks}
                    />
                  ) : (
                    <ReceiptPrintFull
                      receiptId={receiptIdPreview}
                      dateStr={formatDisplayDate(voucherDate)}
                      customerName={customerName || '—'}
                      customerPhone={customerPhone}
                      quotationRef={quotationRef || '—'}
                      projectName={selectedQuotation?.projectName ?? ''}
                      quotationPaymentHistory={quotationPaymentHistory}
                      highlightReceiptId={isEdit ? String(editData.id) : ''}
                      lines={printLinesPayload}
                      totalNgn={lineTotalNgn}
                      reference={remarks}
                      handledBy={handledByLabel}
                    />
                  )}
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-2 pointer-events-auto">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-lg bg-emerald-700 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-lg"
                  >
                    Print / Save PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPrint(false)}
                    className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700"
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

export default ReceiptModal;
