import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
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
import { guidanceForLedgerPostFailure, isVoucherDateInLockedPeriod } from '../lib/ledgerPostingGuidance';
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

  const [qSearch, setQSearch] = useState('');
  const [showQSearch, setShowQSearch] = useState(false);
  const [postingHint, setPostingHint] = useState(null);

  const periodLocks = ws?.snapshot?.periodLocks ?? [];
  const voucherInLockedPeriod = useMemo(
    () => Boolean(useLedgerApi && isVoucherDateInLockedPeriod(voucherDate, periodLocks)),
    [useLedgerApi, voucherDate, periodLocks]
  );

   
  useEffect(() => {
    if (!isOpen) return;
    const le = editData?._ledgerEntry;
    const isLedgerRow = editData?.source === 'ledger' && le;
    const isRc = editData?.id && String(editData.id).startsWith('RC-');
    /** New receipt opened from a quotation row: object has `id` (QT-…) but not `quotationRef`. */
    const initialQuotationRef =
      editData?.quotationRef ??
      (!isRc && !isLedgerRow && editData?.id && !String(editData.id).startsWith('RC-')
        ? String(editData.id)
        : '');
    const vd = isRc
      ? editData.dateISO ?? new Date().toISOString().slice(0, 10)
      : isLedgerRow
        ? String(le.atISO || '').slice(0, 10) || new Date().toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    setVoucherDate(vd);
    setRemarks(isLedgerRow ? (le.bankReference || le.note || '') : '');
    setQuotationRef(initialQuotationRef);
    setQSearch(initialQuotationRef);
    setShowPrint(false);
    setShowQSearch(false);
    setPostingHint(null);

    const sourceIds = new Set(
      [editData?.id, editData?.ledgerEntryId, le?.id]
        .map((v) => String(v || '').trim())
        .filter(Boolean)
    );
    const treasuryMovements = Array.isArray(ws?.snapshot?.treasuryMovements) ? ws.snapshot.treasuryMovements : [];
    const fromTreasury = treasuryMovements
      .filter(
        (mv) =>
          String(mv?.sourceKind || '').trim() === 'LEDGER_RECEIPT' &&
          sourceIds.has(String(mv?.sourceId || '').trim()) &&
          Number(mv?.amountNgn) > 0
      )
      .sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')))
      .map((mv) => ({
        id: newLineId(),
        payeeName: String(mv?.counterpartyName || editData?.customer || le?.customerName || 'Payer').trim() || 'Payer',
        treasuryAccountId: Number(mv?.treasuryAccountId) || defaultAccountId,
        lineDate: String(mv?.postedAtISO || vd).slice(0, 10) || vd,
        amount: String(Math.round(Number(mv?.amountNgn) || 0)),
      }));

    const fromPayload = Array.isArray(editData?.paymentLines)
      ? editData.paymentLines
          .map((line) => ({
            id: newLineId(),
            payeeName: String(editData?.customer || le?.customerName || 'Payer').trim() || 'Payer',
            treasuryAccountId: Number(line?.treasuryAccountId) || defaultAccountId,
            lineDate: vd,
            amount: String(Math.round(Number(line?.amountNgn) || 0)),
          }))
          .filter((line) => parseNum(line.amount) > 0)
      : [];
    const fromLedgerPayload = Array.isArray(le?.paymentLines)
      ? le.paymentLines
          .map((line) => ({
            id: newLineId(),
            payeeName: String(le?.customerName || editData?.customer || 'Payer').trim() || 'Payer',
            treasuryAccountId: Number(line?.treasuryAccountId) || defaultAccountId,
            lineDate: vd,
            amount: String(Math.round(Number(line?.amountNgn) || 0)),
          }))
          .filter((line) => parseNum(line.amount) > 0)
      : [];

    const hydratedLines =
      fromTreasury.length > 0 ? fromTreasury : fromPayload.length > 0 ? fromPayload : fromLedgerPayload;

    if (isRc) {
      const showAmt =
        editData.cashReceivedNgn != null ? editData.cashReceivedNgn : editData.amountNgn;
      setPaymentLines(
        hydratedLines.length > 0
          ? hydratedLines
          : [
              {
                id: newLineId(),
                payeeName: editData.handledBy ?? '',
                treasuryAccountId: defaultAccountId,
                lineDate: vd,
                amount: showAmt != null ? String(showAmt) : '',
              },
            ]
      );
    } else if (isLedgerRow) {
      setPaymentLines(
        hydratedLines.length > 0
          ? hydratedLines
          : [
              {
                id: newLineId(),
                payeeName: (le.customerName || editData.customer || '').trim() || 'Payer',
                treasuryAccountId: defaultAccountId,
                lineDate: vd,
                amount: le.amountNgn != null ? String(le.amountNgn) : '',
              },
            ]
      );
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
    editData?.cashReceivedNgn,
    editData?.handledBy,
    editData?.customer,
    editData?._ledgerEntry,
    defaultAccountId,
    ws?.snapshot?.treasuryMovements,
    ledgerNonce,
  ]);
   

  const selectedQuotation = useMemo(
    () => quotations.find((q) => q.id === quotationRef) ?? null,
    [quotations, quotationRef]
  );

  const selectableQuotations = useMemo(
    () => quotations.filter((qt) => (Number(amountDueOnQuotation(qt)) || 0) > 0.0001),
    [quotations]
  );

  const filteredQSearch = useMemo(() => {
    if (!qSearch.trim()) return selectableQuotations.slice(0, 10);
    const s = qSearch.toLowerCase();
    return selectableQuotations.filter(
      (qt) =>
        String(qt.id || '').toLowerCase().includes(s) ||
        String(qt.customer || '').toLowerCase().includes(s) ||
        String(qt.customerID || '').toLowerCase().includes(s)
    ).slice(0, 15);
  }, [selectableQuotations, qSearch]);

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
        setPostingHint(guidanceForLedgerPostFailure(data) || null);
        showToast(data?.error || 'Could not post receipt.', { variant: 'error' });
        return;
      }
      setPostingHint(null);
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
    <ModalFrame isOpen={isOpen} onClose={onClose} modal={!showPrint}>
      <>
      <form
        key={`${editData?.id ?? 'new'}-${ledgerNonce}`}
        onSubmit={saveReceipt}
        className="z-modal-panel max-w-[min(100%,56rem)] w-full max-h-[min(92vh,820px)] flex flex-col"
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

        {!readOnly && useLedgerApi && voucherInLockedPeriod ? (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-[10px] text-amber-950 space-y-1">
            <p className="font-bold">Voucher month is locked for posting</p>
            <p className="leading-snug">
              The receipt date falls in a closed accounting period. Change the voucher date to an open month, or ask finance to unlock the
              period before posting.
            </p>
            <Link to="/settings/governance" className="inline-flex font-semibold text-amber-900 underline underline-offset-2">
              Open period controls
            </Link>
          </div>
        ) : null}

        {!readOnly && postingHint ? (
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
                <div className="relative">
                  <label className={label}>Link quotation (search ID, customer, etc.)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={qSearch}
                      onChange={(e) => {
                        setQSearch(e.target.value);
                        setShowQSearch(true);
                      }}
                      onFocus={() => setShowQSearch(true)}
                      placeholder="Type to search quotations…"
                      className={`${field} pr-10`}
                    />
                    {qSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setQSearch('');
                          setQuotationRef('');
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                  </div>
                  {showQSearch && (
                    <div className="absolute z-10 left-0 right-0 mt-1 max-h-[220px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl custom-scrollbar p-1">
                      {filteredQSearch.length === 0 ? (
                        <div className="p-3 text-center text-[10px] font-semibold text-slate-400 uppercase">
                          No unpaid quotations found
                        </div>
                      ) : (
                        filteredQSearch.map((qt) => (
                          <button
                            key={qt.id}
                            type="button"
                            onClick={() => {
                              setQuotationRef(qt.id);
                              setQSearch(qt.id);
                              setShowQSearch(false);
                            }}
                            className={`flex w-full flex-col p-2.5 text-left transition-colors rounded-md border border-transparent hover:border-emerald-100 hover:bg-emerald-50 ${
                              quotationRef === qt.id ? 'bg-emerald-50 border-emerald-100' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-[#134e4a]">{qt.id}</span>
                              <span className="text-[10px] font-bold text-emerald-700">{formatNgn(qt.totalNgn)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <span className="text-[11px] font-semibold text-slate-800 truncate">{qt.customer}</span>
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter shrink-0">{qt.paymentStatus}</span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  {showQSearch && (
                    <div
                      className="fixed inset-0 z-0"
                      onClick={() => setShowQSearch(false)}
                    />
                  )}
                </div>
                {selectedQuotation ? (
                  <div className="sm:col-span-2 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 text-[10px] text-slate-700">
                    <p className="text-[8px] font-bold uppercase text-emerald-800 mb-1">Linked quotation</p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      <p className="min-w-0">
                        <span className="font-semibold text-emerald-900">Quotation:</span>{' '}
                        <span className="font-bold text-[#134e4a]">{selectedQuotation.id ?? '—'}</span>
                      </p>
                      <p className="min-w-0">
                        <span className="font-semibold text-emerald-900">Approval:</span>{' '}
                        <span className="font-medium">{selectedQuotation.status ?? '—'}</span>
                      </p>
                      <p className="sm:col-span-2 min-w-0 truncate">
                        <span className="font-semibold text-emerald-900">Customer:</span>{' '}
                        <span className="font-medium">{selectedQuotation.customer ?? '—'}</span>
                      </p>
                      <p className="min-w-0 truncate">
                        <span className="font-semibold text-emerald-900">Project:</span>{' '}
                        <span className="font-medium">{selectedQuotation.projectName?.trim() || '—'}</span>
                      </p>
                      <p className="min-w-0">
                        <span className="font-semibold text-emerald-900">Payment:</span>{' '}
                        <span className="font-medium">{selectedQuotation.paymentStatus ?? '—'}</span>
                      </p>
                      <p className="min-w-0">
                        <span className="font-semibold text-emerald-900">Gauge:</span>{' '}
                        <span className="font-medium">{selectedQuotation.materialGauge?.trim() || '—'}</span>
                      </p>
                      <p className="min-w-0 truncate">
                        <span className="font-semibold text-emerald-900">Color:</span>{' '}
                        <span className="font-medium">{selectedQuotation.materialColor?.trim() || '—'}</span>
                      </p>
                    </div>
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
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-3.5 space-y-2.5">
              <div className="grid grid-cols-12 gap-2.5 px-1 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                <div className="col-span-12 sm:col-span-3">Payee name</div>
                <div className="col-span-6 sm:col-span-2">Account</div>
                <div className="col-span-4 sm:col-span-2">Date</div>
                <div className="col-span-2 sm:col-span-3 text-center">Amount ₦</div>
                <div className="hidden sm:block sm:col-span-2 text-right">Actions</div>
              </div>
              {paymentLines.map((line, idx) => {
                const isLast = idx === paymentLines.length - 1;
                return (
                  <div
                    key={line.id}
                    className="grid grid-cols-12 gap-2.5 items-center bg-white p-2.5 rounded-lg border border-slate-200"
                  >
                    <input
                      type="text"
                      placeholder="Who paid / depositor"
                      value={line.payeeName}
                      onChange={(e) => updateLine(line.id, { payeeName: e.target.value })}
                      className="col-span-12 sm:col-span-3 border border-slate-200 rounded-lg py-2 px-2.5 text-[12px] font-semibold text-[#134e4a] outline-none"
                    />
                    <div className="col-span-6 sm:col-span-2 relative">
                      <select
                        value={String(line.treasuryAccountId)}
                        onChange={(e) => updateLine(line.id, { treasuryAccountId: Number(e.target.value) })}
                        className="w-full border border-slate-200 rounded-lg py-2 px-2.5 text-[12px] font-semibold text-[#134e4a] appearance-none outline-none"
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
                        className="w-full border border-slate-200 rounded-lg py-2 px-2 text-[12px] font-semibold text-[#134e4a]"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={line.amount}
                        onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg py-2 px-2.5 text-[12px] text-center font-bold text-emerald-700 tabular-nums"
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-2 flex sm:justify-end items-center gap-1.5 sm:pl-3 sm:border-l sm:border-slate-100">
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
            className={`w-full md:w-56 bg-slate-50/90 p-3 flex flex-col gap-2.5 shrink-0 self-start md:self-start border-t md:border-t-0 md:border-l border-slate-100 ${readOnly ? 'opacity-85' : ''}`}
          >
            <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Linked quote
            </p>
            {selectedQuotation ? (
              <>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <p className="text-[8px] font-semibold text-slate-400 uppercase mb-1">Customer (from quote)</p>
                  <p className="text-[13px] font-bold leading-snug text-[#134e4a]">{customerName}</p>
                  <p className="text-[9px] text-slate-500">{customerPhone}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <p className="text-[8px] font-semibold text-slate-400 uppercase mb-1">Quotation total</p>
                  <p className="text-[17px] font-bold leading-none text-[#134e4a] tabular-nums">{formatNgn(displayTotal)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <p className="text-[8px] font-semibold text-slate-400 uppercase mb-1">Paid on file</p>
                  <p className="text-[17px] font-bold leading-none text-sky-700 tabular-nums">{formatNgn(displayPaid)}</p>
                </div>
                <div className="rounded-lg border border-[#134e4a]/30 bg-[#134e4a] p-2.5 text-white">
                  <p className="text-[8px] font-semibold text-white/50 uppercase mb-1">Balance due (ledger)</p>
                  <p className="text-[17px] font-bold leading-none text-emerald-200 tabular-nums">{formatNgn(displayBalance)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <p className="text-[8px] font-semibold text-slate-400 uppercase mb-1">This voucher total</p>
                  <p className="text-[20px] font-black leading-none text-emerald-700 tabular-nums">{formatNgn(lineTotalNgn)}</p>
                  {balanceAfterNgn != null ? (
                    <p className="text-[8px] text-slate-500 mt-1">
                      Est. balance after post: <span className="font-bold tabular-nums">{formatNgn(balanceAfterNgn)}</span>
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-2.5 text-[9px] text-amber-950 leading-snug">
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
              <Printer size={14} className="inline mr-1" /> Summary (A4)
            </button>
            <button
              type="button"
              onClick={() => openPrint('full')}
              className="bg-white text-emerald-700 px-3 py-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide shadow-sm"
            >
              <Printer size={14} className="inline mr-1" /> Full detail (A4)
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
              className="no-print fixed inset-0 z-[11060] bg-black/50"
              onClick={() => setShowPrint(false)}
            />
            <div
              className="print-portal-scroll fixed inset-0 z-[11070] overflow-y-auto overscroll-y-contain p-4 sm:p-8"
              onClick={() => setShowPrint(false)}
            >
              <div className="mx-auto max-w-4xl pb-16" onClick={(e) => e.stopPropagation()}>
                <div className="quotation-print-root quotation-print-preview-mode rounded-lg border border-slate-200 bg-white shadow-2xl print:rounded-none print:border-0 print:shadow-none">
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
                <div className="no-print mt-4 flex flex-wrap justify-center gap-2">
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
