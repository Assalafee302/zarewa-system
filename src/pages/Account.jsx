import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Landmark,
  Plus,
  ShieldCheck,
  CheckCircle2,
  X,
  Edit3,
  Activity,
  ArrowDownLeft,
  Search,
  CreditCard,
  ClipboardList,
  ArrowRightLeft,
  Truck,
  BookOpen,
  AlertCircle,
  RotateCcw,
  Printer,
  Paperclip,
  Banknote,
} from 'lucide-react';

import { MainPanel, PageHeader, PageShell, PageTabs, ModalFrame } from '../components/layout';
import { formatNgn } from '../Data/mockData';
import { useToast } from '../context/ToastContext';
import { useInventory } from '../context/InventoryContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';
import {
  normalizeRefund,
  approvedRefundsAwaitingPayment,
  refundApprovedAmount,
  refundOutstandingAmount,
} from '../lib/refundsStore';
import { liveReceivablesNgn, openAuditQueue } from '../lib/liveAnalytics';
import { receiptCashReceivedNgn } from '../lib/salesReceiptsList';
import { printExpenseRequestRecord } from '../lib/expenseRequestPrint';
import { EXPENSE_CATEGORY_OPTIONS } from '../../shared/expenseCategories.js';

const TAB_LABELS = {
  treasury: 'Treasury',
  receipts: 'Receipts & bank recon',
  payables: 'Payables',
  movements: 'Fund movements',
  disbursements: 'Expenses & requests',
  audit: 'Audit & reconciliation',
};

const nextExpenseId = (list) => {
  const nums = list
    .map((e) => parseInt(e.expenseID.replace(/\D/g, ''), 10))
    .filter((n) => !Number.isNaN(n));
  const n = nums.length ? Math.max(...nums) + 1 : 1;
  return `EXP-2026-${String(n).padStart(3, '0')}`;
};

const normalizePaymentRequest = (row) => ({
  ...row,
  paidAmountNgn: Number(row?.paidAmountNgn) || 0,
  paidAtISO: row?.paidAtISO || '',
  paidBy: row?.paidBy || '',
  paymentNote: row?.paymentNote || '',
  branchId: row?.branchId || '',
  expenseCategory: row?.expenseCategory || '',
  isStaffLoan: Boolean(row?.isStaffLoan),
  hrRequestId: row?.hrRequestId || '',
  staffUserId: row?.staffUserId || '',
  staffDisplayName: row?.staffDisplayName || '',
  requestReference: row?.requestReference || '',
  lineItems: Array.isArray(row?.lineItems) ? row.lineItems : [],
  attachmentName: row?.attachmentName || '',
  attachmentMime: row?.attachmentMime || '',
  attachmentPresent: Boolean(row?.attachmentPresent),
});

const createRequestPayLine = (defaultAccountId = '', amount = '') => ({
  id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  treasuryAccountId: String(defaultAccountId),
  amount: amount === '' ? '' : String(amount),
  reference: '',
});

const createExpenseRequestLineItem = () => ({
  id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  item: '',
  unit: '',
  unitPriceNgn: '',
});

function expenseRequestLineTotal(row) {
  const u = Number(row.unit);
  const p = Number(row.unitPriceNgn);
  if (!u || Number.isNaN(p)) return 0;
  return Math.round(u * p);
}

const TREASURY_STATEMENT_TYPE_LABEL = {
  RECEIPT_IN: 'Customer receipt',
  ADVANCE_IN: 'Advance deposit',
  BANK_RECON_ADJUSTMENT: 'Bank reconciliation settlement',
  INTERNAL_TRANSFER_IN: 'Transfer in',
  INTERNAL_TRANSFER_OUT: 'Transfer out',
  EXPENSE: 'Expense',
  AP_PAYMENT: 'Accounts payable payment',
  SUPPLIER_PAYMENT: 'Supplier payment',
  PO_SUPPLIER_PAYMENT: 'Supplier payment',
  REFUND_PAYOUT: 'Customer refund payout',
  ADVANCE_REFUND_OUT: 'Advance refund',
  PAYMENT_REQUEST_OUT: 'Payment request payout',
  TRANSPORT_PAYMENT: 'Transport / haulage',
};

function treasuryMovementStatementLabel(m) {
  const kind = TREASURY_STATEMENT_TYPE_LABEL[m.type] || m.type || 'Treasury movement';
  const bits = [kind];
  if (m.counterpartyName) bits.push(m.counterpartyName);
  if (m.reference) bits.push(`Ref ${m.reference}`);
  if (m.note) bits.push(m.note);
  return bits.join(' · ');
}

const Account = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { show: showToast } = useToast();
  const { purchaseOrders, setPurchaseOrderStatus } = useInventory();
  const ws = useWorkspace();

  const [activeTab, setActiveTab] = useState('treasury');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPaymentEntry, setShowPaymentEntry] = useState(false);
  const [showAddBank, setShowAddBank] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showPayRequestModal, setShowPayRequestModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showApPaymentModal, setShowApPaymentModal] = useState(false);
  const [showRefundPayModal, setShowRefundPayModal] = useState(false);
  const [showBankReconModal, setShowBankReconModal] = useState(false);
  const [showBankImportModal, setShowBankImportModal] = useState(false);
  const [bankImportJson, setBankImportJson] = useState('[\n  { "bankDateISO": "2026-04-01", "description": "Example credit", "amountNgn": 50000 }\n]');
  const [bankImportBusy, setBankImportBusy] = useState(false);
  const [showBankCsvModal, setShowBankCsvModal] = useState(false);
  const [bankCsvText, setBankCsvText] = useState(
    'bankDateISO,description,amountNgn\n2026-04-01,"Example inflow",100000\n2026-04-02,Bank charge,-2500'
  );
  const [bankCsvBusy, setBankCsvBusy] = useState(false);
  const [statementAccount, setStatementAccount] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [selectedAp, setSelectedAp] = useState(null);
  const [refundPayTarget, setRefundPayTarget] = useState(null);
  const [refundPaidBy, setRefundPaidBy] = useState('');
  const [refundPayLines, setRefundPayLines] = useState([]);
  const [refundPaymentNote, setRefundPaymentNote] = useState('');
  const [requestPayLines, setRequestPayLines] = useState([]);
  const [requestPayNote, setRequestPayNote] = useState('');
  const [customerRefunds, setCustomerRefunds] = useState([]);

  const [bankAccounts, setBankAccounts] = useState([]);

  const [newBank, setNewBank] = useState({
    name: '',
    bankName: '',
    type: 'Bank',
    accNo: '',
    balance: '',
  });

  const [payables, setPayables] = useState([]);
  const [fundMovements, setFundMovements] = useState([]);
  const [transferForm, setTransferForm] = useState({
    fromId: '',
    toId: '',
    amountNgn: '',
    reference: '',
  });
  const [apPayForm, setApPayForm] = useState({
    amountNgn: '',
    paymentMethod: 'Bank Transfer',
    debitAccountId: '',
  });

  const [expenses, setExpenses] = useState([]);
  const [payRequests, setPayRequests] = useState([]);
  const [bankReconciliation, setBankReconciliation] = useState([]);
  const [bankReconForm, setBankReconForm] = useState({
    bankDateISO: '',
    description: '',
    amountNgn: '',
    systemMatch: '',
    branchId: '',
  });

  const [receiptFinanceRow, setReceiptFinanceRow] = useState(null);
  const [receiptBankAmtInput, setReceiptBankAmtInput] = useState('');
  const [receiptClearDelivery, setReceiptClearDelivery] = useState(false);
  const [receiptFinanceBusy, setReceiptFinanceBusy] = useState(false);

   
  useEffect(() => {
    if (!ws?.hasWorkspaceData || !ws?.snapshot) {
      setBankAccounts([]);
      setCustomerRefunds([]);
      setExpenses([]);
      setPayRequests([]);
      setPayables([]);
      setFundMovements([]);
      setBankReconciliation([]);
      return;
    }
    const s = ws.snapshot;
    if (Array.isArray(s.treasuryAccounts)) {
      setBankAccounts(s.treasuryAccounts.map((a) => ({ ...a })));
    } else {
      setBankAccounts([]);
    }
    if (Array.isArray(s.refunds)) {
      setCustomerRefunds(s.refunds.map((r) => normalizeRefund(r)));
    } else {
      setCustomerRefunds([]);
    }
    if (Array.isArray(s.expenses)) {
      setExpenses(s.expenses.map((x) => ({ ...x })));
    } else {
      setExpenses([]);
    }
    if (Array.isArray(s.paymentRequests)) {
      setPayRequests(s.paymentRequests.map((x) => normalizePaymentRequest(x)));
    } else {
      setPayRequests([]);
    }
    if (Array.isArray(s.accountsPayable)) {
      setPayables(s.accountsPayable.map((x) => ({ ...x })));
    } else {
      setPayables([]);
    }
    if (Array.isArray(s.treasuryMovements)) {
      setFundMovements(
        s.treasuryMovements
          .filter((m) => m.sourceKind === 'TREASURY_TRANSFER' && m.type === 'INTERNAL_TRANSFER_OUT')
          .map((m) => {
            const twin = s.treasuryMovements.find(
              (row) =>
                row.sourceKind === 'TREASURY_TRANSFER' &&
                row.sourceId === m.sourceId &&
                row.type === 'INTERNAL_TRANSFER_IN'
            );
            return {
              id: m.sourceId || m.id,
              at: String(m.postedAtISO || '').slice(0, 10),
              fromName: m.accountName,
              toName: twin?.accountName || '—',
              amountNgn: Math.abs(m.amountNgn || 0),
              reference: m.reference || twin?.reference || '—',
            };
          })
      );
    } else {
      setFundMovements([]);
    }
    if (Array.isArray(s.bankReconciliation)) {
      setBankReconciliation(s.bankReconciliation.map((x) => ({ ...x })));
    } else {
      setBankReconciliation([]);
    }
  }, [ws?.snapshot, ws?.hasWorkspaceData]);
   

  const [expenseForm, setExpenseForm] = useState({
    expenseType: 'COGS — materials & stock',
    amountNgn: '',
    date: '',
    category: '',
    paymentMethod: 'Bank Transfer',
    debitAccountId: '',
    reference: '',
  });

  const [requestForm, setRequestForm] = useState({
    lines: [createExpenseRequestLineItem()],
    requestDate: '',
    requestReference: '',
    expenseCategory: '',
    description: '',
    attachment: null,
  });
  const payRequestFileRef = useRef(null);
  const bankCsvFileRef = useRef(null);
  const activeActorLabel = ws?.session?.user?.displayName ?? 'Finance';
  const canApproveRequests = ws?.hasPermission?.('finance.approve');
  const canPayRequests = ws?.hasPermission?.('finance.pay');
  const canReconcileBank = ws?.hasPermission?.('finance.post');

  const [reconDrafts, setReconDrafts] = useState({});
  const [settledDrafts, setSettledDrafts] = useState({});
  const [treasuryDrafts, setTreasuryDrafts] = useState({});
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const branchOptions = useMemo(
    () => ws?.snapshot?.workspaceBranches ?? ws?.session?.branches ?? [],
    [ws?.snapshot?.workspaceBranches, ws?.session?.branches]
  );
  const branchNameById = useMemo(
    () =>
      Object.fromEntries(
        branchOptions.map((b) => [String(b.id || '').trim(), b.name || b.code || b.id || 'Unknown branch'])
      ),
    [branchOptions]
  );
  const totals = useMemo(() => {
    const cash = bankAccounts.reduce((acc, curr) => acc + curr.balance, 0);
    return { cash };
  }, [bankAccounts]);

  const liveQuotations = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.quotations) ? ws.snapshot.quotations : []),
    [ws]
  );
  const liveReceipts = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.receipts) ? ws.snapshot.receipts : []),
    [ws]
  );
  const liveTreasuryMovements = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.treasuryMovements) ? ws.snapshot.treasuryMovements : [],
    [ws]
  );
  const liveLedgerEntries = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.ledgerEntries) ? ws.snapshot.ledgerEntries : []),
    [ws]
  );

  const treasuryTransferRows = useMemo(() => {
    return liveTreasuryMovements
      .filter((m) => m.sourceKind === 'TREASURY_TRANSFER' && m.type === 'INTERNAL_TRANSFER_OUT')
      .map((m) => {
        const twin = liveTreasuryMovements.find(
          (row) => row.sourceKind === 'TREASURY_TRANSFER' && row.sourceId === m.sourceId && row.type === 'INTERNAL_TRANSFER_IN'
        );
        return {
          id: m.sourceId || m.id,
          at: String(m.postedAtISO || '').slice(0, 10),
          fromName: m.accountName,
          toName: twin?.accountName || '—',
          amountNgn: Math.abs(m.amountNgn || 0),
          reference: m.reference || twin?.reference || '—',
        };
      });
  }, [liveTreasuryMovements]);

  const treasuryInflowsNgn = useMemo(
    () =>
      liveTreasuryMovements
        .filter((m) => ['RECEIPT_IN', 'ADVANCE_IN'].includes(m.type))
        .reduce((sum, m) => sum + Math.max(0, m.amountNgn || 0), 0),
    [liveTreasuryMovements]
  );

  const treasuryOutflowsNgn = useMemo(
    () =>
      liveTreasuryMovements
        .filter((m) =>
          [
            'EXPENSE',
            'AP_PAYMENT',
            'SUPPLIER_PAYMENT',
            'PO_SUPPLIER_PAYMENT',
            'REFUND_PAYOUT',
            'ADVANCE_REFUND_OUT',
            'PAYMENT_REQUEST_OUT',
            'TRANSPORT_PAYMENT',
          ].includes(m.type)
        )
        .reduce((sum, m) => sum + Math.abs(Math.min(0, m.amountNgn || 0)), 0),
    [liveTreasuryMovements]
  );

  const movementRows = useMemo(
    () => (ws?.hasWorkspaceData ? treasuryTransferRows : fundMovements),
    [fundMovements, treasuryTransferRows, ws?.hasWorkspaceData]
  );

  const receivablesNgn = useMemo(
    () => liveReceivablesNgn(liveQuotations, liveLedgerEntries),
    [liveLedgerEntries, liveQuotations]
  );

  const payablesOutstandingNgn = useMemo(
    () =>
      payables.reduce(
        (s, r) => s + Math.max(0, r.amountNgn - (r.paidNgn || 0)),
        0
      ),
    [payables]
  );

  const reconciliationFlags = useMemo(
    () =>
      bankReconciliation.filter((l) => l.status === 'Review' || l.status === 'PendingManager').length,
    [bankReconciliation]
  );

  const isAnyModalOpen =
    showPaymentEntry ||
    showAddBank ||
    showExpenseModal ||
    showPayRequestModal ||
    showTransferModal ||
    showApPaymentModal ||
    showRefundPayModal ||
    showBankReconModal ||
    showBankImportModal ||
    showBankCsvModal ||
    statementAccount != null ||
    receiptFinanceRow != null;

  const accountStatementLines = useMemo(() => {
    if (!statementAccount) return [];
    const id = Number(statementAccount.id);
    return liveTreasuryMovements
      .filter((m) => Number(m.treasuryAccountId) === id)
      .slice()
      .sort((a, b) => {
        const ta = String(a.postedAtISO || '');
        const tb = String(b.postedAtISO || '');
        if (ta !== tb) return tb.localeCompare(ta);
        return String(b.id || '').localeCompare(String(a.id || ''));
      });
  }, [statementAccount, liveTreasuryMovements]);

   
  useEffect(() => {
    const ref = new URLSearchParams(location.search).get('treasuryRef')?.trim();
    if (!ref) return;
    setActiveTab('treasury');
    setSearchQuery(ref);
  }, [location.search]);

  useEffect(() => {
    const ref = new URLSearchParams(location.search).get('treasuryRef')?.trim();
    if (!ref || !ws?.hasWorkspaceData) return;
    const m = liveTreasuryMovements.find(
      (x) =>
        String(x.id) === ref ||
        String(x.reference || '')
          .trim()
          .toLowerCase() === ref.toLowerCase() ||
        String(x.sourceId || '')
          .trim()
          .toLowerCase() === ref.toLowerCase()
    );
    if (m) {
      const acc = bankAccounts.find((a) => Number(a.id) === Number(m.treasuryAccountId));
      if (acc) setStatementAccount(acc);
    }
  }, [location.search, liveTreasuryMovements, bankAccounts, ws?.hasWorkspaceData]);
   

  const refundsAwaitingPay = useMemo(
    () => approvedRefundsAwaitingPayment(customerRefunds),
    [customerRefunds]
  );
  const auditQueue = useMemo(
    () => openAuditQueue(bankReconciliation, payRequests, customerRefunds),
    [bankReconciliation, customerRefunds, payRequests]
  );
  const refundPayTotalNgn = useMemo(
    () => refundPayLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
    [refundPayLines]
  );

  const updateRefundPayLine = (lineId, patch) => {
    setRefundPayLines((prev) => prev.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  };

  const addRefundPayLine = () => {
    setRefundPayLines((prev) => [...prev, createRequestPayLine(bankAccounts[0]?.id ?? '')]);
  };

  const removeRefundPayLine = (lineId) => {
    setRefundPayLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.id !== lineId)));
  };

  const openRefundPay = (row) => {
    setRefundPayTarget(row);
    setRefundPaidBy('');
    setRefundPayLines([createRequestPayLine(bankAccounts[0]?.id ?? '', refundOutstandingAmount(row))]);
    setRefundPaymentNote(row.paymentNote || '');
    setShowRefundPayModal(true);
  };

  const confirmRefundPaid = async (e) => {
    e.preventDefault();
    if (!refundPayTarget?.refundID) return;
    const paidBy = refundPaidBy.trim() || activeActorLabel;
    const rid = refundPayTarget.refundID;
    const outstanding = refundOutstandingAmount(refundPayTarget);
    const validLines = refundPayLines
      .map((line) => ({
        treasuryAccountId: Number(line.treasuryAccountId),
        amountNgn: Number(line.amount) || 0,
        reference: line.reference.trim(),
      }))
      .filter((line) => line.treasuryAccountId && line.amountNgn > 0);
    if (validLines.length === 0) {
      showToast('Add at least one refund payout line.', { variant: 'error' });
      return;
    }
    if (refundPayTotalNgn <= 0) {
      showToast('Refund payout total must be positive.', { variant: 'error' });
      return;
    }
    if (refundPayTotalNgn > outstanding) {
      showToast('Refund payout exceeds the approved outstanding balance.', { variant: 'error' });
      return;
    }
    const refundShortAccount = bankAccounts.find((account) => {
      const applied = validLines
        .filter((line) => line.treasuryAccountId === account.id)
        .reduce((sum, line) => sum + line.amountNgn, 0);
      return applied > account.balance;
    });
    if (refundShortAccount) {
      showToast(`Insufficient balance in ${refundShortAccount.name}.`, { variant: 'error' });
      return;
    }
    if (ws?.canMutate) {
      const { ok, data } = await apiFetch(`/api/refunds/${encodeURIComponent(rid)}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          paidBy,
          paidAtISO: new Date().toISOString().slice(0, 10),
          note: refundPaymentNote.trim(),
          paymentLines: validLines,
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not record refund payout.', { variant: 'error' });
        return;
      }
      await ws.refresh();
    } else {
      showToast(
        ws?.usingCachedData
          ? 'Reconnect to record refund payouts — workspace is read-only.'
          : 'Connect to the API to record refund payouts.',
        { variant: 'info' }
      );
      return;
    }
    setShowRefundPayModal(false);
    setRefundPayTarget(null);
    setRefundPaidBy('');
    setRefundPayLines([]);
    setRefundPaymentNote('');
    showToast(
      refundPayTotalNgn >= outstanding
        ? `Refund ${rid} fully paid and treasury updated.`
        : `Refund ${rid} part-paid and treasury updated.`
    );
  };

  const requestPayTotalNgn = useMemo(
    () => requestPayLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
    [requestPayLines]
  );

  const updateRequestPayLine = (lineId, patch) => {
    setRequestPayLines((prev) => prev.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  };

  const addRequestPayLine = () => {
    setRequestPayLines((prev) => [...prev, createRequestPayLine(bankAccounts[0]?.id ?? '')]);
  };

  const removeRequestPayLine = (lineId) => {
    setRequestPayLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.id !== lineId)));
  };

  const openRequestPayment = (req) => {
    const paidAmountNgn = Number(req.paidAmountNgn) || 0;
    const outstanding = Math.max(0, (Number(req.amountRequestedNgn) || 0) - paidAmountNgn);
    if (req.approvalStatus !== 'Approved') {
      showToast('Approve this request before recording treasury payout.', { variant: 'info' });
      return;
    }
    if (!canPayRequests) {
      showToast('You do not have permission to post treasury payout for this request.', { variant: 'error' });
      return;
    }
    if (outstanding <= 0) {
      showToast('This payment request is already fully paid.', { variant: 'info' });
      return;
    }
    if (!ws?.viewAllBranches && req?.branchId && ws?.branchScope && req.branchId !== ws.branchScope) {
      showToast(`This request belongs to ${req.branchId}. Switch branch before payout.`, { variant: 'error' });
      return;
    }
    setSelectedPayment({
      type: 'payment_request',
      id: req.requestID,
      category: req.description,
      total: Number(req.amountRequestedNgn) || 0,
      paid: paidAmountNgn,
      date: req.requestDate,
      desc: req.expenseID,
    });
    setRequestPayLines([createRequestPayLine(bankAccounts[0]?.id ?? '', outstanding)]);
    setRequestPayNote(req.paymentNote || '');
    setShowPaymentEntry(true);
  };

  const confirmRequestPayment = async () => {
    if (selectedPayment?.type !== 'payment_request') return;
    const outstanding = Math.max(0, (selectedPayment.total ?? 0) - (selectedPayment.paid ?? 0));
    const validLines = requestPayLines
      .map((line) => ({
        treasuryAccountId: Number(line.treasuryAccountId),
        amountNgn: Number(line.amount) || 0,
        reference: line.reference.trim(),
      }))
      .filter((line) => line.treasuryAccountId && line.amountNgn > 0);

    if (validLines.length === 0) {
      showToast('Add at least one payout line.', { variant: 'error' });
      return;
    }
    if (requestPayTotalNgn <= 0) {
      showToast('Payout total must be positive.', { variant: 'error' });
      return;
    }
    if (requestPayTotalNgn > outstanding) {
      showToast('Payout total exceeds the outstanding approved balance.', { variant: 'error' });
      return;
    }
    const requestShortAccount = bankAccounts.find((account) => {
      const applied = validLines
        .filter((line) => line.treasuryAccountId === account.id)
        .reduce((sum, line) => sum + line.amountNgn, 0);
      return applied > account.balance;
    });
    if (requestShortAccount) {
      showToast(`Insufficient balance in ${requestShortAccount.name}.`, { variant: 'error' });
      return;
    }

    if (ws?.canMutate) {
      const { ok, data } = await apiFetch(`/api/payment-requests/${encodeURIComponent(selectedPayment.id)}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          paidAtISO: new Date().toISOString().slice(0, 10),
          note: requestPayNote.trim(),
          paymentLines: validLines,
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not record payout for this request.', { variant: 'error' });
        return;
      }
      await ws.refresh();
    } else {
      showToast(
        ws?.usingCachedData
          ? 'Reconnect to record payouts — workspace is read-only.'
          : 'Connect to the API to record payment request payouts.',
        { variant: 'info' }
      );
      return;
    }

    const fullyPaid = requestPayTotalNgn >= outstanding;
    setShowPaymentEntry(false);
    setSelectedPayment(null);
    setRequestPayLines([]);
    setRequestPayNote('');
    showToast(
      fullyPaid
        ? `Payment request ${selectedPayment.id} fully paid from treasury.`
        : `Payment request ${selectedPayment.id} part-paid from treasury.`
    );
  };

  const accountTabs = useMemo(
    () => [
      { id: 'treasury', icon: <Landmark size={16} />, label: 'Treasury' },
      { id: 'receipts', icon: <Banknote size={16} />, label: 'Receipts & recon' },
      { id: 'payables', icon: <Truck size={16} />, label: 'Payables' },
      { id: 'movements', icon: <ArrowRightLeft size={16} />, label: 'Movements' },
      { id: 'disbursements', icon: <ClipboardList size={16} />, label: 'Expenses & requests' },
      { id: 'audit', icon: <ShieldCheck size={16} />, label: 'Audit' },
    ],
    []
  );

  const handleAccountTabChange = useCallback(
    (tabId) => {
      setActiveTab(tabId);
      if (tabId === 'treasury') {
        setSearchParams({}, { replace: true });
      } else {
        setSearchParams({ tab: tabId }, { replace: true });
      }
    },
    [setSearchParams]
  );

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && TAB_LABELS[t]) setActiveTab(t);
  }, [searchParams]);

  const headerAction = () => {
    if (activeTab === 'treasury') setShowAddBank(true);
    if (activeTab === 'payables') {
      const open = payables.find((p) => p.amountNgn > p.paidNgn);
      if (open) {
        setSelectedAp(open);
        setApPayForm((f) => ({
          ...f,
          debitAccountId: String(bankAccounts[0]?.id ?? ''),
        }));
        setShowApPaymentModal(true);
      } else showToast('No open supplier balances found.', { variant: 'info' });
    }
    if (activeTab === 'movements') {
      setTransferForm({
        fromId: bankAccounts[0] ? String(bankAccounts[0].id) : '',
        toId: bankAccounts[1]
          ? String(bankAccounts[1].id)
          : bankAccounts[0]
            ? String(bankAccounts[0].id)
            : '',
        amountNgn: '',
        reference: '',
      });
      setShowTransferModal(true);
    }
  };

  const newRecordLabel =
    activeTab === 'treasury'
      ? 'New account'
      : activeTab === 'payables'
        ? 'Pay supplier'
        : activeTab === 'movements'
          ? 'New transfer'
          : null;

   
  useEffect(() => {
    const tab = location.state?.accountsTab;
    if (tab !== 'requests' && tab !== 'payments') return;
    handleAccountTabChange('disbursements');
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate, handleAccountTabChange]);
   

  const reconSuggestionsById = useMemo(() => {
    const rows = ws?.hasWorkspaceData ? liveTreasuryMovements : [];
    const toIso = (value) => String(value || '').slice(0, 10);
    const toEpoch = (iso) => {
      if (!iso) return Number.NaN;
      const t = Date.parse(iso);
      return Number.isNaN(t) ? Number.NaN : t;
    };
    const out = {};
    for (const line of bankReconciliation) {
      const lineAmt = Math.abs(Number(line.amountNgn) || 0);
      const lineDate = toIso(line.bankDateISO);
      const lineTs = toEpoch(lineDate);
      let best = null;
      for (const m of rows) {
        const mAmt = Math.abs(Number(m.amountNgn) || 0);
        if (Math.abs(mAmt - lineAmt) > 1) continue;
        const mDate = toIso(m.postedAtISO);
        const mTs = toEpoch(mDate);
        const dayDiff =
          Number.isFinite(lineTs) && Number.isFinite(mTs)
            ? Math.round(Math.abs(mTs - lineTs) / (1000 * 60 * 60 * 24))
            : 999;
        if (dayDiff > 3) continue;
        const score = dayDiff;
        if (!best || score < best.score) {
          const parts =
            m.sourceKind === 'LEDGER_RECEIPT' && m.sourceId
              ? [m.sourceId, m.reference, m.counterpartyName, m.note]
              : [m.reference, m.counterpartyName, m.note, m.sourceId];
          best = {
            score,
            text: parts.filter(Boolean).join(' · ') || m.type || '',
          };
        }
      }
      if (best?.text) {
        out[line.id] = {
          text: best.text,
          confidence: best.score === 0 ? 'High' : best.score === 1 ? 'Medium' : 'Low',
        };
      }
    }
    return out;
  }, [bankReconciliation, liveTreasuryMovements, ws?.hasWorkspaceData]);

  const salesReceipts = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.receipts) ? [...ws.snapshot.receipts] : [],
    [ws?.hasWorkspaceData, ws?.snapshot?.receipts]
  );

  const filteredSalesReceipts = useMemo(() => {
    const qq = searchQuery.trim().toLowerCase();
    if (!qq) return salesReceipts;
    return salesReceipts.filter((r) => {
      const id = String(r.id || '').toLowerCase();
      const cust = String(r.customer || '').toLowerCase();
      const qref = String(r.quotationRef || '').toLowerCase();
      return id.includes(qq) || cust.includes(qq) || qref.includes(qq);
    });
  }, [salesReceipts, searchQuery]);

  const canFinanceReceiptSettlement = Boolean(
    ws?.hasPermission?.('finance.pay') || ws?.hasPermission?.('finance.post')
  );

  const openReceiptFinance = useCallback((r) => {
    setReceiptFinanceRow(r);
    const allocated = Number(r.amountNgn) || 0;
    const cash = r.cashReceivedNgn != null ? Number(r.cashReceivedNgn) || allocated : allocated;
    const br =
      r.bankReceivedAmountNgn != null ? Number(r.bankReceivedAmountNgn) : cash;
    setReceiptBankAmtInput(String(br));
    setReceiptClearDelivery(Boolean(r.financeDeliveryClearedAtISO));
  }, []);

  const saveReceiptFinance = useCallback(
    async (e) => {
      e?.preventDefault?.();
      if (!receiptFinanceRow?.id) return;
      if (!ws?.canMutate) {
        showToast(
          ws?.usingCachedData
            ? 'Server is offline or session expired — refresh the page, then sign in and try again.'
            : 'Connect to the API server to save settlement.',
          { variant: 'error' }
        );
        return;
      }
      setReceiptFinanceBusy(true);
      try {
        const { ok, status, data } = await apiFetch(
          `/api/sales-receipts/${encodeURIComponent(receiptFinanceRow.id)}/finance-settlement`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bankReceivedAmountNgn: Math.round(
                Number(String(receiptBankAmtInput).replace(/,/g, '')) || 0
              ),
              clearForDelivery: receiptClearDelivery,
            }),
          }
        );
        if (!ok || !data?.ok) {
          const hint = data?.code === 'CSRF_INVALID' ? ' Refresh the page and try again.' : '';
          showToast((data?.error || `Could not save settlement (${status}).`) + hint, { variant: 'error' });
          return;
        }
        showToast('Receipt settlement saved.');
        setReceiptFinanceRow(null);
        await ws.refresh();
      } finally {
        setReceiptFinanceBusy(false);
      }
    },
    [receiptFinanceRow, receiptBankAmtInput, receiptClearDelivery, ws, showToast]
  );

  const saveExpense = async (e) => {
    e.preventDefault();
    const amount = Number(expenseForm.amountNgn);
    const debitId = Number(expenseForm.debitAccountId);
    if (!expenseForm.category.trim() || Number.isNaN(amount) || amount <= 0) return;
    if (!debitId) {
      showToast('Select the account paying this expense.', { variant: 'error' });
      return;
    }
    const debitAcc = bankAccounts.find((a) => a.id === debitId);
    if (!debitAcc || debitAcc.balance < amount) {
      showToast('Selected account has insufficient balance.', { variant: 'error' });
      return;
    }
    const row = {
      expenseID: nextExpenseId(expenses),
      expenseType: expenseForm.expenseType,
      amountNgn: amount,
      date: expenseForm.date || new Date().toISOString().slice(0, 10),
      category: expenseForm.category.trim(),
      paymentMethod: expenseForm.paymentMethod,
      debitAccountId: debitId,
      reference: expenseForm.reference.trim() || '—',
    };
    if (ws?.canMutate) {
      const { ok, data } = await apiFetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          ...row,
          treasuryAccountId: debitId,
          createdBy: activeActorLabel,
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not save expense on server.', { variant: 'error' });
        return;
      }
      await ws.refresh();
    } else {
      showToast(
        ws?.usingCachedData
          ? 'Reconnect to save expenses — workspace is read-only.'
          : 'Connect to the API to record expenses.',
        { variant: 'info' }
      );
      return;
    }
    setExpenseForm({
      expenseType: 'COGS — materials & stock',
      amountNgn: '',
      date: '',
      category: '',
      paymentMethod: 'Bank Transfer',
      debitAccountId: String(bankAccounts[0]?.id ?? ''),
      reference: '',
    });
    setShowExpenseModal(false);
    showToast('Expense recorded and synced.');
  };

  const savePayRequest = async (e) => {
    e.preventDefault();
    const expenseCategory = requestForm.expenseCategory.trim();
    if (!expenseCategory) {
      showToast('Select an expense category from the list.', { variant: 'error' });
      return;
    }
    const lineItems = requestForm.lines
      .map((row) => {
        const item = String(row.item || '').trim();
        const unit = Number.parseFloat(String(row.unit ?? '').replace(/,/g, ''));
        const unitPriceNgn = Number(row.unitPriceNgn);
        return { item, unit, unitPriceNgn };
      })
      .filter((r) => r.item && r.unit > 0 && Number.isFinite(r.unitPriceNgn) && r.unitPriceNgn >= 0);
    if (lineItems.length < 1) {
      showToast('Add at least one line with description, quantity, and unit price.', { variant: 'error' });
      return;
    }
    const requestDate = requestForm.requestDate || new Date().toISOString().slice(0, 10);
    const description = requestForm.description.trim() || '—';
    const requestReference = requestForm.requestReference.trim();
    const body = {
      requestDate,
      description,
      requestReference,
      expenseCategory,
      lineItems,
    };
    if (requestForm.attachment?.dataBase64) {
      body.attachment = {
        name: requestForm.attachment.name,
        mime: requestForm.attachment.mime,
        dataBase64: requestForm.attachment.dataBase64,
      };
    }
    if (ws?.canMutate) {
      const { ok, data } = await apiFetch('/api/payment-requests', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not save request on server.', { variant: 'error' });
        return;
      }
      await ws.refresh();
    } else {
      showToast(
        ws?.usingCachedData
          ? 'Reconnect to submit payment requests — workspace is read-only.'
          : 'Connect to the API to submit payment requests.',
        { variant: 'info' }
      );
      return;
    }
    setRequestForm({
      lines: [createExpenseRequestLineItem()],
      requestDate: '',
      requestReference: '',
      expenseCategory: '',
      description: '',
      attachment: null,
    });
    if (payRequestFileRef.current) payRequestFileRef.current.value = '';
    setShowPayRequestModal(false);
    showToast('Expense request submitted for approval.');
  };

  const addBank = async (e) => {
    e.preventDefault();
    const bal = Number(newBank.balance || 0);
    const accName = newBank.name.trim();
    if (!accName) return;
    if (ws?.canMutate) {
      const { ok, data } = await apiFetch('/api/treasury/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: accName,
          bankName: newBank.bankName.trim(),
          type: newBank.type,
          accNo: newBank.accNo.trim() || 'N/A',
          balance: Number.isNaN(bal) ? 0 : bal,
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not save treasury on server.', { variant: 'error' });
        return;
      }
      await ws.refresh();
    } else {
      showToast(
        ws?.usingCachedData
          ? 'Reconnect to add treasury accounts — workspace is read-only.'
          : 'Connect to the API to add treasury accounts.',
        { variant: 'info' }
      );
      return;
    }
    setNewBank({ name: '', bankName: '', type: 'Bank', accNo: '', balance: '' });
    setShowAddBank(false);
    showToast(`Account “${accName}” added to treasury.`);
  };

  const saveTransfer = async (e) => {
    e.preventDefault();
    const fromId = Number(transferForm.fromId);
    const toId = Number(transferForm.toId);
    const amount = Number(transferForm.amountNgn);
    if (!fromId || !toId || fromId === toId) {
      showToast('Choose two different accounts.', { variant: 'error' });
      return;
    }
    if (Number.isNaN(amount) || amount <= 0) {
      showToast('Enter a valid amount.', { variant: 'error' });
      return;
    }
    const fromAcc = bankAccounts.find((a) => a.id === fromId);
    if (!fromAcc || fromAcc.balance < amount) {
      showToast('Insufficient balance in source account.', { variant: 'error' });
      return;
    }
    if (ws?.canMutate) {
      const { ok, data } = await apiFetch('/api/treasury/transfer', {
        method: 'POST',
        body: JSON.stringify({
          fromId,
          toId,
          amountNgn: amount,
          reference: transferForm.reference.trim(),
          createdBy: activeActorLabel,
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not sync treasury.', { variant: 'error' });
        return;
      }
      await ws.refresh();
    } else {
      showToast(
        ws?.usingCachedData
          ? 'Reconnect to post transfers — workspace is read-only.'
          : 'Connect to the API to post treasury transfers.',
        { variant: 'info' }
      );
      return;
    }
    setTransferForm({ fromId: '', toId: '', amountNgn: '', reference: '' });
    setShowTransferModal(false);
    showToast('Fund movement posted — both accounts updated.');
  };

  const saveApPayment = async (e) => {
    e.preventDefault();
    if (!selectedAp) return;
    const invoiceRef = selectedAp.invoiceRef;
    const amount = Number(apPayForm.amountNgn);
    const debitId = Number(apPayForm.debitAccountId);
    if (Number.isNaN(amount) || amount <= 0) {
      showToast('Enter payment amount.', { variant: 'error' });
      return;
    }
    const remaining = selectedAp.amountNgn - selectedAp.paidNgn;
    const apply = Math.min(amount, remaining);
    if (apply <= 0) {
      showToast('This invoice is already fully paid on file.', { variant: 'info' });
      return;
    }
    const acc = bankAccounts.find((a) => a.id === debitId);
    if (!acc || acc.balance < apply) {
      showToast('Selected account has insufficient balance.', { variant: 'error' });
      return;
    }
    const method = apPayForm.paymentMethod;
    const newPaidTotal = selectedAp.paidNgn + apply;
    const fullySettled = newPaidTotal >= selectedAp.amountNgn;
    const poRef = selectedAp.poRef?.trim?.() ?? '';
    const shouldAdvancePo = Boolean(
      fullySettled && poRef && purchaseOrders.find((p) => p.poID === poRef)?.status === 'Approved'
    );
    let procurementNote = '';
    if (ws?.canMutate) {
      const pay = await apiFetch(`/api/accounts-payable/${encodeURIComponent(selectedAp.apID)}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          amountNgn: apply,
          paymentMethod: method,
          treasuryAccountId: debitId,
          reference: invoiceRef,
          createdBy: activeActorLabel,
        }),
      });
      if (!pay.ok || !pay.data?.ok) {
        showToast(pay.data?.error || 'Could not sync supplier payment.', { variant: 'error' });
        return;
      }
      if (shouldAdvancePo) {
        const st = await setPurchaseOrderStatus(poRef, 'In Transit');
        if (st.ok) procurementNote = ` ${poRef} → In Transit (await GRN in Operations).`;
      }
      await ws.refresh();
    } else {
      showToast(
        ws?.usingCachedData
          ? 'Reconnect to record supplier payments — workspace is read-only.'
          : 'Connect to the API to record accounts payable payments.',
        { variant: 'info' }
      );
      return;
    }
    setShowApPaymentModal(false);
    setSelectedAp(null);
    setApPayForm({
      amountNgn: '',
      paymentMethod: 'Bank Transfer',
      debitAccountId: String(bankAccounts[0]?.id ?? ''),
    });
    showToast(`${formatNgn(apply)} recorded against ${invoiceRef} (${method}).${procurementNote}`);
  };

  const reviewPaymentRequest = async (requestID, status) => {
    if (!requestID) return;
    if (ws?.canMutate) {
      const { ok, data } = await apiFetch(`/api/payment-requests/${encodeURIComponent(requestID)}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          note: status === 'Approved' ? 'Approved for treasury action.' : 'Rejected during finance review.',
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not review payment request.', { variant: 'error' });
        return;
      }
      await ws.refresh();
    } else {
      showToast(
        ws?.usingCachedData
          ? 'Reconnect to review payment requests — workspace is read-only.'
          : 'Connect to the API to approve or reject payment requests.',
        { variant: 'info' }
      );
      return;
    }
    showToast(`Payment request ${requestID} marked ${status}.`);
  };

  const filteredExpenses = useMemo(() => {
    const qq = searchQuery.trim().toLowerCase();
    if (!qq) return expenses;
    return expenses.filter((ex) => {
      const blob = [ex.expenseID, ex.category, ex.expenseType, ex.reference, ex.paymentMethod]
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [expenses, searchQuery]);

  const filteredPayRequests = useMemo(() => {
    const qq = searchQuery.trim().toLowerCase();
    if (!qq) return payRequests;
    return payRequests.filter((req) => {
      const lineBlob = (req.lineItems || [])
        .map((x) => [x.item, x.lineTotalNgn, x.unitPriceNgn].filter(Boolean).join(' '))
        .join(' ');
      const blob = [
        req.requestID,
        req.expenseID,
        req.description,
        req.requestReference,
        req.expenseCategory,
        lineBlob,
        req.approvalStatus,
        req.approvedBy,
        req.paidBy,
        req.requestDate,
        req.attachmentName,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [payRequests, searchQuery]);

  const filteredPayables = useMemo(() => {
    const qq = searchQuery.trim().toLowerCase();
    if (!qq) return payables;
    return payables.filter((p) => {
      const blob = [p.apID, p.supplierName, p.poRef, p.invoiceRef].join(' ').toLowerCase();
      return blob.includes(qq);
    });
  }, [payables, searchQuery]);

  const filteredBankAccounts = useMemo(() => {
    const qq = searchQuery.trim().toLowerCase();
    if (!qq) return bankAccounts;
    return bankAccounts.filter((a) => {
      const blob = [a.name, a.type, a.accNo].join(' ').toLowerCase();
      return blob.includes(qq);
    });
  }, [bankAccounts, searchQuery]);

  const filteredReconciliation = useMemo(() => {
    const qq = searchQuery.trim().toLowerCase();
    if (!qq) return bankReconciliation;
    return bankReconciliation.filter((l) => {
      const blob = [l.id, l.description, l.systemMatch || ''].join(' ').toLowerCase();
      return blob.includes(qq);
    });
  }, [bankReconciliation, searchQuery]);

  const saveBankReconLine = async (line, status, systemMatchOverride) => {
    if (!ws?.canMutate) {
      showToast('Connect to the API server to save bank reconciliation.', { variant: 'info' });
      return;
    }
    const systemMatch =
      systemMatchOverride !== undefined
        ? String(systemMatchOverride).trim()
        : (
            reconDrafts[line.id] ??
            line.systemMatch ??
            reconSuggestionsById[line.id]?.text ??
            ''
          ).trim();
    const body = { status, systemMatch };
    if (status === 'Matched') {
      const sd = settledDrafts[line.id];
      if (sd != null && String(sd).trim() !== '') {
        const n = Math.round(Number(String(sd).replace(/,/g, '')));
        if (Number.isFinite(n)) body.settledAmountNgn = n;
      }
      const td = treasuryDrafts[line.id];
      if (td != null && String(td).trim() !== '') {
        body.treasuryAccountId = Number(td);
      }
    }
    const { ok, status: httpStatus, data } = await apiFetch(`/api/bank-reconciliation/${encodeURIComponent(line.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!ok || !data?.ok) {
      const hint = data?.code === 'CSRF_INVALID' ? ' Refresh the page and sign in again if needed.' : '';
      showToast(
        data?.error ||
          (httpStatus === 403 ? 'Permission denied or invalid session.' : `Could not update bank line (${httpStatus}).`) +
            hint,
        { variant: 'error' }
      );
      return;
    }
    if (data.status === 'PendingManager') {
      showToast(
        data.needsManagerClearance
          ? 'Variance above 0.1% — queued for manager clearance before treasury adjusts.'
          : 'Bank line updated.',
        { variant: 'info' }
      );
    } else {
      showToast(status === 'Matched' ? 'Statement line marked matched.' : 'Bank line updated.');
    }
    setSettledDrafts((d) => {
      const next = { ...d };
      delete next[line.id];
      return next;
    });
    setTreasuryDrafts((d) => {
      const next = { ...d };
      delete next[line.id];
      return next;
    });
    await ws.refresh();
  };

  const approveBankReconVariance = async (line) => {
    if (!ws?.canMutate) {
      showToast('Connect to the API server to approve.', { variant: 'info' });
      return;
    }
    const { ok, status, data } = await apiFetch(
      `/api/bank-reconciliation/${encodeURIComponent(line.id)}/approve-variance`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    );
    if (!ok || !data?.ok) {
      const hint = data?.code === 'CSRF_INVALID' ? ' Refresh the page and try again.' : '';
      showToast((data?.error || `Could not approve variance (${status}).`) + hint, { variant: 'error' });
      return;
    }
    showToast('Manager clearance recorded — treasury adjusted and line matched.');
    await ws.refresh();
  };

  const openBankReconModal = () => {
    const scoped = String(ws?.branchScope || ws?.session?.currentBranchId || '').trim();
    const firstBranch = String(branchOptions[0]?.id ?? '').trim();
    setBankReconForm({
      bankDateISO: todayIso,
      description: '',
      amountNgn: '',
      systemMatch: '',
      branchId: ws?.viewAllBranches ? scoped || firstBranch : scoped,
    });
    setShowBankReconModal(true);
  };

  const saveBankReconLineCreate = async (e) => {
    e.preventDefault();
    if (!ws?.canMutate) {
      showToast('Connect to the API server to add bank statement lines.', { variant: 'info' });
      return;
    }
    const description = String(bankReconForm.description ?? '').trim();
    const rawAmt = Number(String(bankReconForm.amountNgn ?? '').replace(/,/g, ''));
    const amountNgn = Number.isFinite(rawAmt) ? Math.round(rawAmt) : Number.NaN;
    const bankDateISO = String(bankReconForm.bankDateISO ?? '').trim();
    if (!bankDateISO) {
      showToast('Statement date is required.', { variant: 'error' });
      return;
    }
    if (!description) {
      showToast('Bank description is required.', { variant: 'error' });
      return;
    }
    if (!Number.isFinite(amountNgn) || amountNgn === 0) {
      showToast('Enter a non-zero amount (negative for debits, positive for credits).', { variant: 'error' });
      return;
    }
    const body = {
      bankDateISO,
      description,
      amountNgn,
      systemMatch: String(bankReconForm.systemMatch ?? '').trim() || undefined,
      status: 'Review',
    };
    if (ws?.viewAllBranches && String(bankReconForm.branchId ?? '').trim()) {
      body.branchId = String(bankReconForm.branchId).trim();
    }
    const { ok, data } = await apiFetch('/api/bank-reconciliation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not add statement line.', { variant: 'error' });
      return;
    }
    showToast('Statement line added — in review.');
    setShowBankReconModal(false);
    await ws.refresh();
  };

  const runBankImport = async (e) => {
    e?.preventDefault?.();
    if (!ws?.canMutate) {
      showToast('Connect to the API server to import lines.', { variant: 'info' });
      return;
    }
    let lines;
    try {
      lines = JSON.parse(bankImportJson);
    } catch {
      showToast('Paste valid JSON: an array of { bankDateISO, description, amountNgn }.', { variant: 'error' });
      return;
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      showToast('JSON must be a non-empty array of lines.', { variant: 'error' });
      return;
    }
    setBankImportBusy(true);
    const { ok, data } = await apiFetch('/api/bank-reconciliation/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
    });
    setBankImportBusy(false);
    if (!ok || !data) {
      showToast('Import failed.', { variant: 'error' });
      return;
    }
    if (data.errorCount > 0) {
      showToast(
        `Imported ${data.createdCount} line(s); ${data.errorCount} row(s) failed. Check amounts and dates.`,
        { variant: 'error' }
      );
    } else {
      showToast(`Imported ${data.createdCount} statement line(s) — in review.`);
      setShowBankImportModal(false);
    }
    await ws.refresh();
  };

  const runBankCsvImport = async (e) => {
    e?.preventDefault?.();
    if (!ws?.canMutate) {
      showToast('Connect to the API server to import CSV.', { variant: 'info' });
      return;
    }
    const csvText = String(bankCsvText ?? '').trim();
    if (!csvText) {
      showToast('Paste CSV text first.', { variant: 'error' });
      return;
    }
    setBankCsvBusy(true);
    const { ok, data } = await apiFetch('/api/bank-reconciliation/import-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText }),
    });
    setBankCsvBusy(false);
    if (!ok || !data) {
      showToast('CSV import failed.', { variant: 'error' });
      return;
    }
    if (data.errorCount > 0) {
      showToast(
        `Imported ${data.createdCount} line(s); ${data.errorCount} row(s) failed. Check dates and amounts.`,
        { variant: 'error' }
      );
    } else {
      showToast(`Imported ${data.createdCount} line(s) from CSV.`);
      setShowBankCsvModal(false);
    }
    await ws.refresh();
  };

  const bankReconSection = (
    <div id="bank-reconciliation-panel" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest flex items-center gap-2">
          <Landmark size={14} />
          Bank reconciliation
        </h3>
        {canReconcileBank && ws?.canMutate ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openBankReconModal} className="z-btn-secondary !text-[10px] gap-1.5">
              <Plus size={14} /> Add statement line
            </button>
            <button
              type="button"
              onClick={() => setShowBankImportModal(true)}
              className="z-btn-secondary !text-[10px] gap-1.5"
            >
              Import JSON
            </button>
            <button
              type="button"
              onClick={() => setShowBankCsvModal(true)}
              className="z-btn-secondary !text-[10px] gap-1.5"
            >
              Import CSV
            </button>
          </div>
        ) : null}
      </div>
      <ul className="space-y-1.5">
        {filteredReconciliation.map((line) => {
          const amtLabel = `${formatNgn(Math.abs(line.amountNgn))}${line.amountNgn < 0 ? ' DR' : ' CR'}`;
          const matchText = line.systemMatch ?? reconSuggestionsById[line.id]?.text ?? '—';
          const meta2 = [matchText, line.branchId ? branchNameById[line.branchId] || line.branchId : null]
            .filter(Boolean)
            .join(' · ');
          const statusChip =
            line.status === 'Matched'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : line.status === 'Excluded'
                ? 'border-slate-200 bg-slate-100 text-slate-600'
                : line.status === 'PendingManager'
                  ? 'border-violet-300 bg-violet-50 text-violet-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900';
          const isCredit = line.amountNgn > 0;
          const showSettleFields =
            line.status === 'Review' && isCredit && canReconcileBank && ws?.canMutate;
          return (
            <li
              key={line.id}
              className="rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md py-1.5 px-2.5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                <div className="min-w-0 leading-tight flex-1">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <p className="text-[11px] font-bold text-[#134e4a] truncate min-w-0">
                      <span className="tabular-nums text-slate-600 font-semibold">{line.bankDateISO}</span>
                      <span className="font-medium text-slate-600"> · {line.description}</span>
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-[11px] font-black tabular-nums ${line.amountNgn < 0 ? 'text-red-700' : 'text-emerald-700'}`}
                      >
                        {amtLabel}
                      </span>
                      <span
                        className={`text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border ${statusChip}`}
                      >
                        {line.status}
                      </span>
                    </div>
                  </div>
                  <p className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2" title={meta2}>
                    {meta2}
                  </p>
                  {line.matchedSystemAmountNgn != null &&
                  (line.status === 'Matched' ||
                    line.status === 'PendingManager' ||
                    Number(line.varianceNgn || 0) !== 0) ? (
                    <p className="text-[9px] text-slate-600 mt-1">
                      Book {formatNgn(line.matchedSystemAmountNgn)}
                      {line.settledAmountNgn != null ? ` · Settled ${formatNgn(line.settledAmountNgn)}` : ''}
                      {line.varianceNgn != null && line.varianceNgn !== 0
                        ? ` · Variance ${formatNgn(line.varianceNgn)} (${(Number(line.variancePercent) || 0).toFixed(4)}%)`
                        : ''}
                    </p>
                  ) : null}
                  {line.status === 'PendingManager' ? (
                    <p className="text-[9px] text-violet-800 font-semibold mt-1">
                      Awaiting manager clearance — variance above 0.1% of book amount.
                      {line.managerClearedAtISO ? ` Cleared ${line.managerClearedAtISO.slice(0, 10)}.` : ''}
                    </p>
                  ) : null}
                </div>
              </div>
              {showSettleFields ? (
                <div className="pt-1.5 mt-1 border-t border-dashed border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] font-bold text-slate-500 uppercase block mb-0.5">
                      Settled amount (₦) — if not same as statement
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={
                        settledDrafts[line.id] ??
                        (line.amountNgn != null ? String(line.amountNgn) : '')
                      }
                      onChange={(e) =>
                        setSettledDrafts((d) => ({ ...d, [line.id]: e.target.value }))
                      }
                      placeholder={String(line.amountNgn)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:ring-2 focus:ring-[#134e4a]/15 tabular-nums"
                    />
                    <button
                      type="button"
                      className="text-[8px] font-bold text-teal-700 mt-0.5 uppercase hover:underline"
                      onClick={() =>
                        setSettledDrafts((d) => ({ ...d, [line.id]: String(line.amountNgn) }))
                      }
                    >
                      Reset to statement amount
                    </button>
                  </div>
                  <div>
                    <label className="text-[8px] font-bold text-slate-500 uppercase block mb-0.5">
                      Treasury account (for adjustment)
                    </label>
                    <select
                      value={treasuryDrafts[line.id] ?? ''}
                      onChange={(e) =>
                        setTreasuryDrafts((d) => ({ ...d, [line.id]: e.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:ring-2 focus:ring-[#134e4a]/15"
                    >
                      <option value="">Auto (from receipt)</option>
                      {bankAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}
              {line.status === 'Review' && canReconcileBank && ws?.canMutate ? (
                <div className="pt-1.5 mt-1 border-t border-dashed border-slate-200 flex flex-col sm:flex-row sm:items-center gap-2">
                  <input
                    type="text"
                    value={reconDrafts[line.id] ?? line.systemMatch ?? ''}
                    onChange={(e) => setReconDrafts((d) => ({ ...d, [line.id]: e.target.value }))}
                    placeholder="Receipt id e.g. LE-… or RC-… (first token is used)"
                    className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] outline-none focus:ring-2 focus:ring-[#134e4a]/15"
                  />
                  {reconSuggestionsById[line.id] ? (
                    <button
                      type="button"
                      onClick={() =>
                        setReconDrafts((d) => ({
                          ...d,
                          [line.id]: reconSuggestionsById[line.id].text,
                        }))
                      }
                      className="rounded-lg border border-teal-200 bg-teal-50 text-teal-800 px-3 py-2 text-[10px] font-bold uppercase tracking-wide"
                    >
                      Use suggestion ({reconSuggestionsById[line.id].confidence})
                    </button>
                  ) : null}
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => saveBankReconLine(line, 'Matched')}
                      className="rounded-lg bg-[#134e4a] text-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide"
                    >
                      Mark matched
                    </button>
                    <button
                      type="button"
                      onClick={() => saveBankReconLine(line, 'Excluded', 'Excluded — not applicable')}
                      className="rounded-lg border border-gray-200 bg-white text-gray-600 px-3 py-2 text-[10px] font-bold uppercase tracking-wide"
                    >
                      Exclude
                    </button>
                  </div>
                </div>
              ) : null}
              {line.status === 'PendingManager' && canApproveRequests && ws?.canMutate ? (
                <div className="pt-1.5 mt-1 border-t border-dashed border-violet-200">
                  <button
                    type="button"
                    onClick={() => approveBankReconVariance(line)}
                    className="rounded-lg bg-violet-700 text-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide"
                  >
                    Approve variance (manager)
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <PageShell blurred={isAnyModalOpen}>
      <PageHeader
        title="Finance & accounts"
        subtitle="Treasury, customer receipt settlement, bank reconciliation, payables, and approvals"
        tabs={<PageTabs tabs={accountTabs} value={activeTab} onChange={handleAccountTabChange} />}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        <div className="lg:col-span-1 space-y-6">
          <div className="z-card-dark">
            <h3 className="z-section-title-dark">Total liquidity</h3>
            <div className="space-y-1">
              <p className="text-2xl font-black italic tracking-tighter">
                ₦{totals.cash.toLocaleString()}
              </p>
              <p className="text-[10px] text-zarewa-mint font-medium">Combined bank, cash & POS floats</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleAccountTabChange('receipts')}
            className="w-full text-left z-card-muted hover:border-teal-100 transition-all cursor-pointer p-5"
          >
            <h3 className="z-section-title flex items-center gap-2">
              <ArrowDownLeft size={14} />
              Accounts receivable
            </h3>
            <p className="text-xl font-black text-[#134e4a]">{formatNgn(receivablesNgn)}</p>
            <p className="text-[10px] font-bold text-gray-400 mt-2 uppercase tracking-wide">
              Open balances · Settle receipts on Receipts &amp; recon tab
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleAccountTabChange('payables')}
            className="w-full text-left z-card-muted hover:border-teal-100 transition-all cursor-pointer p-5"
          >
            <h3 className="z-section-title flex items-center gap-2">
              <Truck size={14} />
              Accounts payable
            </h3>
            <p className="text-xl font-black text-amber-800">{formatNgn(payablesOutstandingNgn)}</p>
            <p className="text-[10px] font-bold text-gray-400 mt-2 uppercase tracking-wide">
              Supplier invoices · Payables tab
            </p>
          </button>

          {activeTab === 'disbursements' ? (
            <div className="rounded-zarewa border border-teal-100/80 bg-gradient-to-br from-teal-50/50 to-white p-4 shadow-sm space-y-3">
              <h3 className="z-section-title flex items-center gap-2">
                <ClipboardList size={14} />
                Expenses & requests
              </h3>
              <p className="text-[10px] text-gray-500 leading-snug">
                Raise a payment request for approval, or post a completed expense to treasury.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRequestForm({
                      lines: [createExpenseRequestLineItem()],
                      requestDate: todayIso,
                      requestReference: '',
                      expenseCategory: '',
                      description: '',
                      attachment: null,
                    });
                    if (payRequestFileRef.current) payRequestFileRef.current.value = '';
                    setShowPayRequestModal(true);
                  }}
                  className="z-btn-primary w-full justify-center gap-2 !text-[11px]"
                >
                  <Plus size={16} /> New expense request
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExpenseForm((f) => ({
                      ...f,
                      debitAccountId: String(bankAccounts[0]?.id ?? ''),
                    }));
                    setShowExpenseModal(true);
                  }}
                  className="z-btn-secondary w-full justify-center gap-2 !text-[11px]"
                >
                  <Plus size={16} /> New expense
                </button>
              </div>
            </div>
          ) : null}

          <div className="z-card-muted">
            <h3 className="z-section-title flex items-center gap-2">
              <Activity size={14} className="shrink-0" />
                Control note
            </h3>
            <p className="text-[9px] text-gray-400 leading-relaxed mb-3">
                Customer receipts, refunds, supplier payments, expenses, and treasury transfers now post
                live cash movements. Full general-ledger journals remain the next accounting phase.
            </p>
              <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 text-[10px] text-gray-600 leading-relaxed">
                Use the tabs here to post the operational side safely:
                expenses debit treasury, payables reduce supplier balances, and transfers create paired
                movements.
              </div>
          </div>

          <div className="rounded-zarewa border border-gray-100 bg-white/90 p-4 text-[9px] text-gray-500 leading-relaxed">
            <p className="font-black uppercase tracking-wider text-[#134e4a] mb-1.5 flex items-center gap-1">
              <BookOpen size={12} />
              Principles
            </p>
            Accrual view, revenue recognition on delivery / billing, and expense matching are enforced in
            reporting once the ledger is live.
          </div>
        </div>

        <div className="lg:col-span-3">
          <MainPanel>
            <>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center min-w-0 w-full md:w-auto">
                <h2 className="text-xl font-bold text-[#134e4a] shrink-0">
                  {TAB_LABELS[activeTab] ?? 'Records'}
                </h2>
                <div className="relative flex-1 md:w-72 min-w-0">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                    size={16}
                  />
                  <input
                    type="search"
                    placeholder="Search this tab…"
                    className="z-input-search"
                    autoComplete="off"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {newRecordLabel ? (
                <div className="flex gap-3 w-full md:w-auto md:shrink-0">
                  <button
                    type="button"
                    onClick={headerAction}
                    className="z-btn-primary flex-1 md:flex-none w-full md:w-auto"
                  >
                    <Plus size={16} /> {newRecordLabel}
                  </button>
                </div>
              ) : null}
            </div>

            {activeTab === 'receipts' && (
              <div className="space-y-10 animate-in fade-in duration-300">
                <section className="space-y-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-[#134e4a]">
                        Customer receipts
                      </h3>
                      <p className="text-[11px] text-slate-600 mt-1 max-w-3xl">
                        Enter the amount that actually landed in the bank, then mark{' '}
                        <span className="font-semibold">Cleared for delivery</span> when finance is satisfied.
                        Sales no longer confirms receipts here — this desk owns settlement.
                      </p>
                    </div>
                  </div>
                  {filteredSalesReceipts.length === 0 ? (
                    <p className="text-[10px] text-slate-500 py-8 text-center border border-dashed border-slate-200 rounded-lg">
                      No receipts in this branch scope.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {filteredSalesReceipts.map((r) => {
                        const allocated = Number(r.amountNgn) || 0;
                        const cash =
                          r.cashReceivedNgn != null ? Number(r.cashReceivedNgn) || allocated : allocated;
                        const bank =
                          r.bankReceivedAmountNgn != null ? Number(r.bankReceivedAmountNgn) : null;
                        const cleared = Boolean(r.financeDeliveryClearedAtISO);
                        return (
                          <li
                            key={r.id}
                            className="rounded-lg border border-slate-200/60 bg-white/70 py-2 px-3 flex flex-wrap items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold text-[#134e4a] font-mono">{r.id}</p>
                              <p className="text-[9px] text-slate-500 truncate">
                                {r.customer || '—'} · {r.quotationRef || '—'} · {r.dateISO || r.date || '—'}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <span className="text-[10px] font-bold text-slate-600 tabular-nums">
                                Paid {formatNgn(cash)}
                                {Math.round(allocated) !== Math.round(cash) ? (
                                  <span className="text-slate-500 font-semibold">
                                    {' '}
                                    (quote {formatNgn(allocated)})
                                  </span>
                                ) : null}
                                {bank != null && Math.round(bank) !== Math.round(cash) ? (
                                  <span className="text-amber-800"> · Bank {formatNgn(bank)}</span>
                                ) : null}
                              </span>
                              {cleared ? (
                                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900">
                                  Cleared delivery
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                                  Pending
                                </span>
                              )}
                              {canFinanceReceiptSettlement && ws?.canMutate ? (
                                <button
                                  type="button"
                                  onClick={() => openReceiptFinance(r)}
                                  className="text-[9px] font-bold uppercase px-3 py-1.5 rounded-lg bg-[#134e4a] text-white hover:bg-[#0f3d3a]"
                                >
                                  Review
                                </button>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <section className="space-y-3 border-t border-slate-100 pt-8">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#134e4a]">
                    Bank statement lines
                  </h3>
                  <p className="text-[11px] text-slate-600 mb-4 leading-relaxed max-w-3xl">
                    Match statement lines to a <span className="font-semibold">sales receipt id</span> (posted
                    receipts are usually <span className="font-semibold">LE-…</span>; legacy rows may show{' '}
                    <span className="font-semibold">RC-…</span>). Put the id first if you add notes. Variance rules
                    and manager approval behave as before.
                  </p>
                  {reconciliationFlags > 0 ? (
                    <div className="flex items-start gap-3 rounded-lg border border-red-200/80 bg-red-50/80 px-3 py-2.5 text-sm text-red-900 mb-4">
                      <AlertCircle className="shrink-0 mt-0.5" size={18} />
                      <div>
                        <p className="font-bold">Bank reconciliation queue</p>
                        <p className="text-xs text-red-800/90 mt-0.5">
                          {reconciliationFlags} line(s) need review or manager clearance.
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {bankReconSection}
                </section>
              </div>
            )}

            {activeTab === 'treasury' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md shadow-sm px-3 py-2.5">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Cash inflows</p>
                    <p className="text-sm font-black text-emerald-700 tabular-nums">
                      {formatNgn(
                        ws?.hasWorkspaceData
                          ? treasuryInflowsNgn
                          : liveReceipts.reduce((s, r) => s + receiptCashReceivedNgn(r), 0)
                      )}
                    </p>
                    <p className="text-[8px] text-slate-500 mt-0.5 leading-snug">Receipts and advance deposits</p>
                  </div>
                  <div className="rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md shadow-sm px-3 py-2.5">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Cash outflows</p>
                    <p className="text-sm font-black text-[#134e4a] tabular-nums">
                      {formatNgn(ws?.hasWorkspaceData ? treasuryOutflowsNgn : expenses.reduce((s, e) => s + e.amountNgn, 0))}
                    </p>
                    <p className="text-[8px] text-slate-500 mt-0.5 leading-snug">Expenses, refunds, and supplier payouts</p>
                  </div>
                  <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 backdrop-blur-md shadow-sm px-3 py-2.5">
                    <p className="text-[9px] font-bold text-amber-800 uppercase">Reconciliation</p>
                    <p className="text-sm font-black text-amber-900">
                      {reconciliationFlags} item{reconciliationFlags !== 1 ? 's' : ''} to review
                    </p>
                    <button
                      type="button"
                      onClick={() => handleAccountTabChange('receipts')}
                      className="text-[9px] font-black uppercase text-amber-900 mt-1 underline-offset-2 hover:underline"
                    >
                      Receipts &amp; recon tab
                    </button>
                  </div>
                </div>

                {refundsAwaitingPay.length > 0 ? (
                  <div className="rounded-2xl border border-rose-200/90 bg-rose-50/50 p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs font-black text-rose-900 uppercase tracking-widest flex items-center gap-2">
                        <RotateCcw size={16} strokeWidth={2} />
                        Customer refunds — approved, awaiting payout
                      </p>
                      <span className="text-[10px] font-bold text-rose-800 tabular-nums">
                        {refundsAwaitingPay.length} open
                      </span>
                    </div>
                    <p className="text-[10px] text-rose-900/80 leading-relaxed">
                      Sales submits refund requests with a breakdown; managers approve. Record bank/cash
                      payment here once funds leave the business.
                    </p>
                    <ul className="space-y-1.5">
                      {refundsAwaitingPay.map((r) => {
                        const meta2 = [
                          r.quotationRef ? `Quote ${r.quotationRef}` : 'No quote ref',
                          r.approvedBy ? `Approved by ${r.approvedBy}` : null,
                          `Aprv ${formatNgn(refundApprovedAmount(r))} · Paid ${formatNgn(Number(r.paidAmountNgn) || 0)}`,
                        ]
                          .filter(Boolean)
                          .join(' · ');
                        return (
                          <li
                            key={r.refundID}
                            className="rounded-lg border border-rose-200/50 bg-white/40 backdrop-blur-md py-1.5 px-2.5 shadow-sm"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                              <div className="min-w-0 leading-tight flex-1">
                                <p className="text-[11px] font-bold text-[#134e4a] truncate">
                                  <span className="font-mono">{r.refundID}</span>
                                  <span className="font-medium text-slate-600"> · {r.customer}</span>
                                </p>
                                <p className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2" title={meta2}>
                                  {meta2}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className="text-[11px] font-black text-[#134e4a] tabular-nums">
                                  {formatNgn(refundOutstandingAmount(r))}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openRefundPay(r)}
                                  className="text-[8px] font-semibold uppercase tracking-wide text-sky-800 bg-sky-100 hover:bg-sky-200 px-2 py-1 rounded-md"
                                >
                                  Record pay
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredBankAccounts.length === 0 ? (
                    <div className="sm:col-span-2 lg:col-span-3 z-empty-state py-12">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        No accounts match your search
                      </p>
                    </div>
                  ) : (
                    filteredBankAccounts.map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => setStatementAccount(acc)}
                        className="text-left p-4 rounded-zarewa border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-lg hover:border-teal-100 transition-all group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/30"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="p-2 bg-white rounded-lg shadow-sm text-[#134e4a]">
                            {acc.type === 'Bank' ? <Landmark size={18} /> : <CreditCard size={18} />}
                          </div>
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                            {acc.accNo}
                          </span>
                        </div>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
                          {acc.name}
                        </p>
                        <h4 className="text-lg font-black text-[#134e4a] italic tracking-tighter">
                          ₦{acc.balance.toLocaleString()}
                        </h4>
                        <p className="text-[9px] text-teal-700/80 font-bold mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          View statement
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'payables' && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <p className="text-xs text-gray-500 max-w-2xl">
                  Supplier invoices linked to purchase orders. Partial payments reduce outstanding AP and
                  debit the selected bank or cash account.
                </p>
                {filteredPayables.length === 0 ? (
                  <div className="z-empty-state py-12">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      No payables match your search
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {filteredPayables.map((p) => {
                      const paid = Number(p.paidNgn) || 0;
                      const outstanding = Math.max(0, p.amountNgn - paid);
                      const due =
                        p.dueDateISO &&
                        String(p.dueDateISO).trim() &&
                        p.dueDateISO < todayIso;
                      const open = paid < p.amountNgn;
                      const meta2 = [
                        `PO ${p.poRef}`,
                        p.invoiceRef ? `Inv ${p.invoiceRef}` : null,
                        p.dueDateISO ? `Due ${p.dueDateISO}` : null,
                        p.branchId ? branchNameById[p.branchId] || p.branchId : null,
                        due && open ? 'Past due' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <li
                          key={p.apID}
                          className="rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md py-1.5 px-2.5 shadow-sm hover:bg-white/70 transition-colors"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                            <div className="min-w-0 leading-tight flex-1">
                              <p className="text-[11px] font-bold text-[#134e4a] truncate uppercase">
                                {p.apID}
                                <span className="font-medium text-slate-600 normal-case"> · {p.supplierName}</span>
                              </p>
                              <p
                                className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2"
                                title={meta2}
                              >
                                {meta2}
                              </p>
                              {open ? (
                                <p className="text-[9px] text-slate-600 mt-1 tabular-nums">
                                  Invoice {formatNgn(p.amountNgn)} · Paid {formatNgn(paid)} ·{' '}
                                  <span className="font-bold text-amber-900">Due {formatNgn(outstanding)}</span>
                                </p>
                              ) : (
                                <p className="text-[9px] text-emerald-800 mt-1 tabular-nums font-semibold">
                                  Settled · {formatNgn(p.amountNgn)} paid in full
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] font-black text-[#134e4a] tabular-nums text-right">
                                {open ? (
                                  <>
                                    <span className="block text-[8px] font-semibold text-slate-500 uppercase tracking-wide">
                                      Outstanding
                                    </span>
                                    {formatNgn(outstanding)}
                                  </>
                                ) : (
                                  formatNgn(p.amountNgn)
                                )}
                              </span>
                              {open ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedAp(p);
                                    setApPayForm({
                                      amountNgn: String(p.amountNgn - p.paidNgn),
                                      paymentMethod: 'Bank Transfer',
                                      debitAccountId: String(bankAccounts[0]?.id ?? ''),
                                    });
                                    setShowApPaymentModal(true);
                                  }}
                                  className="text-[8px] font-semibold uppercase tracking-wide text-sky-800 bg-sky-100 hover:bg-sky-200 px-2 py-1 rounded-md"
                                >
                                  Pay
                                </button>
                              ) : (
                                <span className="text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800">
                                  Paid
                                </span>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {activeTab === 'movements' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <p className="text-xs text-gray-500 max-w-2xl">
                  Move cash to bank, sweep POS settlements, or transfer between bank accounts. Each
                  movement updates both source and destination balances.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setTransferForm({
                      fromId: bankAccounts[0] ? String(bankAccounts[0].id) : '',
                      toId: bankAccounts[1]
                        ? String(bankAccounts[1].id)
                        : bankAccounts[0]
                          ? String(bankAccounts[0].id)
                          : '',
                      amountNgn: '',
                      reference: '',
                    });
                    setShowTransferModal(true);
                  }}
                  className="z-btn-secondary"
                >
                  <ArrowRightLeft size={16} /> New transfer
                </button>
                {movementRows.length === 0 ? (
                  <div className="z-empty-state py-12">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      No internal transfers yet
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {movementRows.map((m) => (
                      <li
                        key={m.id}
                        className="rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md py-1.5 px-2.5 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <p className="text-[11px] font-bold text-[#134e4a] truncate min-w-0">
                            <span className="font-mono">{m.id}</span>
                            <span className="font-medium text-slate-600">
                              {' '}
                              · {m.fromName} → {m.toName}
                            </span>
                          </p>
                          <span className="text-[11px] font-black text-[#134e4a] tabular-nums shrink-0">
                            {formatNgn(m.amountNgn)}
                          </span>
                        </div>
                        <p className="text-[8px] text-slate-500 mt-0.5 tabular-nums">{m.at}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {activeTab === 'disbursements' && (
              <div className="space-y-8 animate-in slide-in-from-right-5">
                <section className="space-y-4">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#134e4a]">
                      1) Payment requests (approval queue)
                    </h3>
                    <p className="text-[11px] text-gray-500 mt-1">
                      Raise and approve disbursement requests before treasury payout.
                    </p>
                  </div>
                <div className="space-y-1.5">
                {filteredPayRequests.map((req) => {
                  const paidAmountNgn = Number(req.paidAmountNgn) || 0;
                  const outstandingNgn = Math.max(0, (Number(req.amountRequestedNgn) || 0) - paidAmountNgn);
                  const payoutState =
                    req.approvalStatus !== 'Approved'
                      ? 'Awaiting approval'
                      : outstandingNgn <= 0
                        ? 'Paid'
                        : paidAmountNgn > 0
                          ? 'Part paid'
                          : 'Awaiting payout';

                  const meta2 = [
                    `Linked ${req.expenseID}`,
                    req.expenseCategory ? req.expenseCategory : null,
                    req.requestReference ? `Ref ${req.requestReference}` : null,
                    req.description,
                    req.lineItems?.length ? `${req.lineItems.length} line item(s)` : null,
                    req.attachmentPresent ? `Attachment: ${req.attachmentName || 'file'}` : null,
                    req.branchId ? branchNameById[req.branchId] || req.branchId : null,
                    req.isStaffLoan ? 'Staff loan' : null,
                    req.approvalStatus,
                    payoutState,
                    req.requestDate,
                    `Rem ${formatNgn(outstandingNgn)}`,
                    req.approvedBy
                      ? `${req.approvedBy}${req.approvedAtISO ? ` · ${req.approvedAtISO}` : ''}`
                      : null,
                    req.paidBy || paidAmountNgn > 0
                      ? `Paid ${formatNgn(paidAmountNgn)}${req.paidBy ? ` · ${req.paidBy}` : ''}${req.paidAtISO ? ` · ${req.paidAtISO}` : ''}`
                      : null,
                    req.approvalNote,
                    req.paymentNote,
                  ]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <div
                      key={req.requestID}
                      className="rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md py-1.5 px-2.5 shadow-sm hover:bg-white/70 transition-colors"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0 leading-tight flex-1">
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <p className="text-[11px] font-bold text-[#134e4a] truncate uppercase">
                              {req.requestID}
                            </p>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border ${
                                  req.approvalStatus === 'Approved'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                    : req.approvalStatus === 'Rejected'
                                      ? 'border-rose-200 bg-rose-50 text-rose-800'
                                      : 'border-amber-200 bg-amber-50 text-amber-900'
                                }`}
                              >
                                {req.approvalStatus}
                              </span>
                              <span
                                className={`text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border ${
                                  payoutState === 'Paid'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                    : payoutState === 'Part paid'
                                      ? 'border-sky-200 bg-sky-50 text-sky-800'
                                      : payoutState === 'Awaiting payout'
                                        ? 'border-teal-200 bg-teal-50 text-teal-800'
                                        : 'border-slate-200 bg-slate-50 text-slate-700'
                                }`}
                              >
                                {payoutState}
                              </span>
                            </div>
                          </div>
                          <p
                            className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2"
                            title={meta2}
                          >
                            {meta2}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right leading-tight">
                            <p className="text-[11px] font-black text-[#134e4a] tabular-nums">
                              {formatNgn(req.amountRequestedNgn)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => printExpenseRequestRecord(req, formatNgn)}
                            className="text-[8px] font-semibold uppercase tracking-wide text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md inline-flex items-center gap-1"
                            title="Print filing copy"
                          >
                            <Printer size={12} /> Print
                          </button>
                          <button
                            type="button"
                            onClick={() => openRequestPayment(req)}
                            className="text-[8px] font-semibold uppercase tracking-wide text-sky-800 bg-sky-100 hover:bg-sky-200 px-2 py-1 rounded-md"
                            title="Record treasury payout"
                          >
                            Payout
                          </button>
                        </div>
                      </div>
                      {canApproveRequests && req.approvalStatus === 'Pending' ? (
                        <div className="flex flex-wrap gap-1.5 pt-1.5 mt-1 border-t border-dashed border-slate-200">
                          <button
                            type="button"
                            onClick={() => reviewPaymentRequest(req.requestID, 'Approved')}
                            className="text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => reviewPaymentRequest(req.requestID, 'Rejected')}
                            className="text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100"
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                </div>
                </section>

                <section className="space-y-4 border-t border-slate-100 pt-6">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#134e4a]">
                      2) Expenses (posted records)
                    </h3>
                    <p className="text-[11px] text-gray-500 mt-1">
                      Record completed spending entries after request approval/payout.
                    </p>
                  </div>
                <ul className="space-y-1.5">
                {filteredExpenses.map((ex) => {
                  const meta2 = [
                    ex.expenseType,
                    ex.category,
                    ex.branchId ? branchNameById[ex.branchId] || ex.branchId : null,
                    `${ex.paymentMethod} · Ref ${ex.reference}`,
                    ex.date,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                  <li
                    key={ex.expenseID}
                    className="rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md py-1.5 px-2.5 shadow-sm hover:bg-white/70 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0 leading-tight flex-1">
                        <p className="text-[11px] font-bold text-[#134e4a] truncate uppercase">{ex.expenseID}</p>
                        <p className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2" title={meta2}>
                          {meta2}
                        </p>
                      </div>
                      <p className="text-[11px] font-black text-[#134e4a] tabular-nums shrink-0">
                        {formatNgn(ex.amountNgn)}
                      </p>
                    </div>
                  </li>
                  );
                })}
                </ul>
                </section>
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="space-y-8 animate-in slide-in-from-left-5">
                {reconciliationFlags > 0 ? (
                  <div className="flex items-start gap-3 rounded-lg border border-red-200/80 bg-red-50/80 px-3 py-2.5 text-sm text-red-900">
                    <AlertCircle className="shrink-0 mt-0.5" size={18} />
                    <div>
                      <p className="font-bold">Bank reconciliation exceptions</p>
                      <p className="text-xs text-red-800/90 mt-0.5">
                        {reconciliationFlags} statement line(s) are not matched to ledger entries. Resolve
                        or post adjusting entries.
                      </p>
                    </div>
                  </div>
                ) : null}

                <div>
                  <h3 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-3">
                    Audit checklist (period close)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        title: 'Customer receipts',
                        detail: 'Receipts issued for each inflow; tie to quotations & AR.',
                      },
                      {
                        title: 'Supplier payments',
                        detail: 'PO → GRN → invoice → payment; AP balances updated.',
                      },
                      {
                        title: 'Inventory vs COGS',
                        detail: 'Stock movements align with sales and purchase postings.',
                      },
                      {
                        title: 'Cash & bank',
                        detail: 'Till, bank, and POS floats agree with counted / statement balances.',
                      },
                    ].map((row) => (
                      <div
                        key={row.title}
                        className="rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md p-3 flex gap-3 shadow-sm"
                      >
                        <CheckCircle2 className="shrink-0 text-emerald-500" size={18} />
                        <div>
                          <p className="text-xs font-bold text-gray-800">{row.title}</p>
                          <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">{row.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] text-slate-600 rounded-lg border border-slate-200/60 bg-slate-50/80 px-3 py-2">
                  Bank statement matching and customer receipt settlement live on the{' '}
                  <button
                    type="button"
                    className="font-bold text-teal-800 underline-offset-2 hover:underline"
                    onClick={() => handleAccountTabChange('receipts')}
                  >
                    Receipts &amp; recon
                  </button>{' '}
                  tab.
                </p>

                <div>
                  <h3 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-3">
                    Exception queue (misc receipts)
                  </h3>
                  <ul className="space-y-1.5">
                    {auditQueue.map((item) => {
                      const meta2 = [`via ${item.bank}`, item.date, item.desc].filter(Boolean).join(' · ');
                      return (
                      <li
                        key={item.id}
                        className="rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md py-1.5 px-2.5 shadow-sm hover:bg-white/70 transition-colors"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                          <div className="min-w-0 leading-tight flex-1">
                            <p className="text-[11px] font-bold text-[#134e4a] truncate uppercase">{item.customer}</p>
                            <p className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2" title={meta2}>
                              {meta2}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-black text-[#134e4a] tabular-nums">
                              ₦{item.amount.toLocaleString()}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                showToast('Attach supporting document workflow is not yet connected.', { variant: 'info' })
                              }
                              className="p-1.5 bg-white text-slate-400 hover:text-[#134e4a] rounded-md border border-slate-200 transition-all"
                              title="Edit"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                showToast('Marked cleared in the audit review queue.', { variant: 'success' })
                              }
                              className="p-1.5 bg-[#134e4a] text-white rounded-md shadow-sm"
                              title="Clear"
                            >
                              <CheckCircle2 size={14} />
                            </button>
                          </div>
                        </div>
                      </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md p-4 text-xs text-gray-600 leading-relaxed shadow-sm">
                  <p className="font-black text-[#134e4a] uppercase tracking-wider text-[10px] mb-2">
                    Accounting basis
                  </p>
                  Double-entry posting, accrual recognition, revenue on delivery or billing, and expense
                  matching to the period are the target once the general ledger service is connected.
                  Customer installments (Net 30 / 60) remain tracked on quotations and receipts until
                  fully paid.
                </div>
              </div>
            )}
            </>
          </MainPanel>
        </div>
      </div>

      <ModalFrame isOpen={showTransferModal} onClose={() => setShowTransferModal(false)}>
        <div className="z-modal-panel max-w-md p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a] flex items-center gap-2">
              <ArrowRightLeft size={22} />
              Fund movement
            </h3>
            <button
              type="button"
              onClick={() => setShowTransferModal(false)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
            >
              <X size={22} />
            </button>
          </div>
          <form className="space-y-4" onSubmit={saveTransfer}>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                From
              </label>
              <select
                required
                value={transferForm.fromId}
                onChange={(e) =>
                  setTransferForm((f) => ({ ...f, fromId: e.target.value }))
                }
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
              >
                <option value="">Select account…</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatNgn(a.balance)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                To
              </label>
              <select
                required
                value={transferForm.toId}
                onChange={(e) =>
                  setTransferForm((f) => ({ ...f, toId: e.target.value }))
                }
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
              >
                <option value="">Select account…</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Amount (₦)
              </label>
              <input
                required
                type="number"
                min="1"
                value={transferForm.amountNgn}
                onChange={(e) =>
                  setTransferForm((f) => ({ ...f, amountNgn: e.target.value }))
                }
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Reference / narration
              </label>
              <input
                value={transferForm.reference}
                onChange={(e) =>
                  setTransferForm((f) => ({ ...f, reference: e.target.value }))
                }
                placeholder="e.g. Cash deposit — 28 Mar"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
              />
            </div>
            <button type="submit" className="z-btn-primary w-full justify-center py-3">
              Post transfer
            </button>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={statementAccount != null} onClose={() => setStatementAccount(null)}>
        <div className="z-modal-panel max-w-lg w-full max-h-[min(85vh,640px)] p-6 sm:p-8 overflow-hidden flex flex-col">
          <div className="flex justify-between items-start gap-3 mb-4 shrink-0">
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-bold text-[#134e4a]">Account statement</h3>
              {statementAccount ? (
                <p className="text-xs text-gray-600 mt-1 font-semibold truncate" title={statementAccount.name}>
                  {statementAccount.name}
                  {statementAccount.bankName ? ` · ${statementAccount.bankName}` : ''}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setStatementAccount(null)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl shrink-0"
              aria-label="Close statement"
            >
              <X size={22} />
            </button>
          </div>
          {!ws?.hasWorkspaceData ? (
            <p className="text-xs text-gray-600 leading-relaxed">
              Connect to the live workspace to load treasury movements. Statements are built from posted receipts,
              expenses, transfers, and payouts on the server.
            </p>
          ) : accountStatementLines.length === 0 ? (
            <p className="text-xs text-gray-500">No movements recorded for this account yet.</p>
          ) : (
            <div className="overflow-y-auto flex-1 min-h-0 -mx-1 px-1 border border-slate-200/60 rounded-lg bg-white/40 backdrop-blur-md">
              <ul className="p-2 space-y-1.5">
                {accountStatementLines.map((m) => {
                  const raw = Number(m.amountNgn) || 0;
                  const isIn = raw > 0;
                  const isOut = raw < 0;
                  const abs = Math.abs(raw);
                  const dateStr = String(m.postedAtISO || '').slice(0, 10) || '—';
                  const detail = treasuryMovementStatementLabel(m);
                  const amtStr = `${isIn ? '+' : isOut ? '−' : ''}${formatNgn(abs)}`;
                  return (
                    <li
                      key={m.id}
                      className="rounded-lg border border-slate-200/60 bg-white/50 py-1.5 px-2.5 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <p className="text-[11px] font-bold text-[#134e4a] truncate min-w-0">
                          <span className="tabular-nums text-slate-600 font-semibold">{dateStr}</span>
                        </p>
                        <span
                          className={`text-[11px] font-black tabular-nums shrink-0 ${
                            isIn ? 'text-emerald-600' : isOut ? 'text-red-600' : 'text-slate-500'
                          }`}
                        >
                          {amtStr}
                        </span>
                      </div>
                      <p className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2 break-words" title={detail}>
                        {detail}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </ModalFrame>

      <ModalFrame
        isOpen={showApPaymentModal}
        onClose={() => {
          setShowApPaymentModal(false);
          setSelectedAp(null);
        }}
      >
        <div className="z-modal-panel max-w-md p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">Supplier payment</h3>
            <button
              type="button"
              onClick={() => {
                setShowApPaymentModal(false);
                setSelectedAp(null);
              }}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
            >
              <X size={22} />
            </button>
          </div>
          {selectedAp ? (
            <form className="space-y-4" onSubmit={saveApPayment}>
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 text-sm">
                <p className="font-bold text-[#134e4a]">{selectedAp.supplierName}</p>
                <p className="text-[10px] text-gray-500 mt-1">
                  {selectedAp.invoiceRef} · PO {selectedAp.poRef}
                </p>
                <p className="text-xs mt-2">
                  Outstanding:{' '}
                  <span className="font-black">
                    {formatNgn(selectedAp.amountNgn - selectedAp.paidNgn)}
                  </span>
                </p>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Amount to pay (₦)
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  value={apPayForm.amountNgn}
                  onChange={(e) =>
                    setApPayForm((f) => ({ ...f, amountNgn: e.target.value }))
                  }
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Payment method
                </label>
                <select
                  value={apPayForm.paymentMethod}
                  onChange={(e) =>
                    setApPayForm((f) => ({ ...f, paymentMethod: e.target.value }))
                  }
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="POS">POS</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Pay from account
                </label>
                <select
                  required
                  value={apPayForm.debitAccountId}
                  onChange={(e) =>
                    setApPayForm((f) => ({ ...f, debitAccountId: e.target.value }))
                  }
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatNgn(a.balance)})
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="z-btn-primary w-full justify-center py-3">
                Record payment
              </button>
            </form>
          ) : null}
        </div>
      </ModalFrame>

      <ModalFrame
        isOpen={showRefundPayModal}
        onClose={() => {
          setShowRefundPayModal(false);
          setRefundPayTarget(null);
          setRefundPaidBy('');
          setRefundPayLines([]);
          setRefundPaymentNote('');
        }}
      >
        <div className="z-modal-panel max-w-lg p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a] flex items-center gap-2">
              <RotateCcw size={22} className="text-rose-600" />
              Refund payout
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowRefundPayModal(false);
                setRefundPayTarget(null);
                setRefundPaidBy('');
                setRefundPayLines([]);
                setRefundPaymentNote('');
              }}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
            >
              <X size={22} />
            </button>
          </div>
          {refundPayTarget ? (
            <form className="space-y-4" onSubmit={confirmRefundPaid}>
              <div className="bg-rose-50/80 rounded-2xl p-4 border border-rose-100 text-sm space-y-1">
                <p className="font-mono font-bold text-[#134e4a]">{refundPayTarget.refundID}</p>
                <p className="font-bold text-gray-800">{refundPayTarget.customer}</p>
                <p className="text-xs text-gray-600">{refundPayTarget.reason}</p>
                <div className="grid grid-cols-3 gap-3 pt-2 text-[10px] text-gray-600 tabular-nums">
                  <div>
                    <p className="uppercase text-gray-400">Approved</p>
                    <p className="text-sm font-black text-[#134e4a]">{formatNgn(refundApprovedAmount(refundPayTarget))}</p>
                  </div>
                  <div>
                    <p className="uppercase text-gray-400">Paid</p>
                    <p className="text-sm font-black text-[#134e4a]">{formatNgn(Number(refundPayTarget.paidAmountNgn) || 0)}</p>
                  </div>
                  <div>
                    <p className="uppercase text-gray-400">Balance</p>
                    <p className="text-sm font-black text-rose-700">{formatNgn(refundOutstandingAmount(refundPayTarget))}</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Paid by (Finance user)
                </label>
                <input
                  value={refundPaidBy}
                  onChange={(e) => setRefundPaidBy(e.target.value)}
                  placeholder="e.g. Hauwa — GTBank transfer"
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Payout breakdown</label>
                <button
                  type="button"
                  onClick={addRefundPayLine}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-rose-800"
                >
                  <Plus size={14} /> Add line
                </button>
              </div>
              <div className="space-y-1.5">
                {refundPayLines.map((line) => (
                  <div
                    key={line.id}
                    className="rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md py-2 px-2.5 shadow-sm flex flex-col gap-2"
                  >
                    <select
                      value={line.treasuryAccountId}
                      onChange={(e) => updateRefundPayLine(line.id, { treasuryAccountId: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-[11px] font-semibold"
                    >
                      <option value="">Select account…</option>
                      {bankAccounts.map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.name} ({formatNgn(a.balance)})
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={line.amount}
                      onChange={(e) => updateRefundPayLine(line.id, { amount: e.target.value })}
                      className="sm:col-span-5 rounded-lg border border-slate-200 bg-white py-2 px-2 text-[11px] font-bold text-[#134e4a]"
                      placeholder="Amount ₦"
                    />
                    <input
                      type="text"
                      value={line.reference}
                      onChange={(e) => updateRefundPayLine(line.id, { reference: e.target.value })}
                      className="sm:col-span-5 rounded-lg border border-slate-200 bg-white py-2 px-2 text-[11px]"
                      placeholder="Reference"
                    />
                    <button
                      type="button"
                      onClick={() => removeRefundPayLine(line.id)}
                      className="sm:col-span-2 inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-500"
                      title="Remove line"
                    >
                      <X size={16} />
                    </button>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Payment note
                </label>
                <input
                  value={refundPaymentNote}
                  onChange={(e) => setRefundPaymentNote(e.target.value)}
                  placeholder="Example: Cash 300,000 and GT transfer 200,000"
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm outline-none"
                />
              </div>
              <div className="rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md px-3 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-bold text-gray-500 uppercase text-[10px] tracking-wide">This payout</span>
                  <span className="font-black text-[#134e4a]">{formatNgn(refundPayTotalNgn)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4 text-sm">
                  <span className="font-bold text-gray-500 uppercase text-[10px] tracking-wide">Remaining after post</span>
                  <span className="font-black text-gray-700">
                    {formatNgn(Math.max(0, refundOutstandingAmount(refundPayTarget) - refundPayTotalNgn))}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 leading-relaxed">
                Saving this payout writes the treasury movements and keeps the refund open until the approved balance is fully paid.
              </p>
              <button type="submit" className="z-btn-primary w-full justify-center py-3">
                Post refund payout
              </button>
            </form>
          ) : null}
        </div>
      </ModalFrame>

      <ModalFrame
        isOpen={showPaymentEntry}
        onClose={() => {
          setShowPaymentEntry(false);
          setSelectedPayment(null);
          setRequestPayLines([]);
          setRequestPayNote('');
        }}
      >
        <div className="z-modal-panel max-w-lg p-8 sm:p-10 overflow-y-auto">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-2xl font-bold text-[#134e4a]">Process payment</h3>
            <button
              type="button"
              onClick={() => {
                setShowPaymentEntry(false);
                setSelectedPayment(null);
                setRequestPayLines([]);
                setRequestPayNote('');
              }}
              className="text-gray-300 hover:text-rose-500"
            >
              <X size={24} />
            </button>
          </div>
          <div className="bg-gray-50 p-6 rounded-2xl mb-6 border border-gray-100 flex justify-between items-center gap-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Balance due</p>
              <p className="text-2xl font-black text-[#134e4a]">
                ₦
                {(
                  (selectedPayment?.total ?? 0) - (selectedPayment?.paid ?? 0)
                ).toLocaleString()}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                {selectedPayment?.desc} · {selectedPayment?.category}
              </p>
            </div>
            <span className="text-[10px] font-bold px-3 py-1 bg-white rounded-full border border-gray-100 shrink-0">
              {selectedPayment?.id}
            </span>
          </div>
          {bankAccounts.length === 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Add at least one treasury account before posting payout.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">
                  Payout breakdown
                </label>
                <button
                  type="button"
                  onClick={addRequestPayLine}
                  className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-[#134e4a]"
                >
                  <Plus size={14} /> Add line
                </button>
              </div>
              <div className="space-y-1.5">
                {requestPayLines.map((line) => (
                  <div
                    key={line.id}
                    className="rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md py-2 px-2.5 shadow-sm flex flex-col gap-2"
                  >
                    <select
                      value={line.treasuryAccountId}
                      onChange={(e) => updateRequestPayLine(line.id, { treasuryAccountId: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-[11px] font-semibold"
                    >
                      <option value="">Select account…</option>
                      {bankAccounts.map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.name} ({formatNgn(a.balance)})
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={line.amount}
                      onChange={(e) => updateRequestPayLine(line.id, { amount: e.target.value })}
                      className="sm:col-span-5 rounded-lg border border-slate-200 bg-white py-2 px-2 text-[11px] font-bold text-[#134e4a]"
                      placeholder="Amount ₦"
                    />
                    <input
                      type="text"
                      value={line.reference}
                      onChange={(e) => updateRequestPayLine(line.id, { reference: e.target.value })}
                      className="sm:col-span-5 rounded-lg border border-slate-200 bg-white py-2 px-2 text-[11px]"
                      placeholder="Reference"
                    />
                    <button
                      type="button"
                      onClick={() => removeRequestPayLine(line.id)}
                      className="sm:col-span-2 inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-500"
                      title="Remove line"
                    >
                      <X size={16} />
                    </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Payment note</label>
                <input
                  value={requestPayNote}
                  onChange={(e) => setRequestPayNote(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white py-3 px-4 text-sm"
                  placeholder="Example: Cash 300,000 and GT transfer 200,000"
                />
              </div>
              <div className="rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md px-3 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-bold text-gray-500 uppercase text-[10px] tracking-wide">This payout</span>
                  <span className="font-black text-[#134e4a]">{formatNgn(requestPayTotalNgn)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4 text-sm">
                  <span className="font-bold text-gray-500 uppercase text-[10px] tracking-wide">Remaining after post</span>
                  <span className="font-black text-gray-700">
                    {formatNgn(
                      Math.max(
                        0,
                        ((selectedPayment?.total ?? 0) - (selectedPayment?.paid ?? 0)) - requestPayTotalNgn
                      )
                    )}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={confirmRequestPayment}
                className="w-full bg-[#134e4a] text-white py-4 rounded-xl font-bold text-xs uppercase tracking-widest shadow-xl mt-4"
              >
                Confirm transaction
              </button>
            </div>
          )}
        </div>
      </ModalFrame>

      <ModalFrame isOpen={showAddBank} onClose={() => setShowAddBank(false)}>
        <div className="z-modal-panel max-w-md p-8 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-[#134e4a]">New account</h3>
              <button
                type="button"
                onClick={() => setShowAddBank(false)}
                className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
              >
                <X size={22} />
              </button>
            </div>
            <form className="space-y-4" onSubmit={addBank}>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Account name
                </label>
                <input
                  required
                  value={newBank.name}
                  onChange={(e) => setNewBank((b) => ({ ...b, name: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              {newBank.type === 'Bank' ? (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                    Bank name (for quotations & receipts)
                  </label>
                  <input
                    value={newBank.bankName}
                    onChange={(e) => setNewBank((b) => ({ ...b, bankName: e.target.value }))}
                    placeholder="e.g. Zenith Bank"
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                  />
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                    Type
                  </label>
                  <select
                    value={newBank.type}
                    onChange={(e) => setNewBank((b) => ({ ...b, type: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                  >
                    <option value="Bank">Bank</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                    Opening balance (₦)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newBank.balance}
                    onChange={(e) => setNewBank((b) => ({ ...b, balance: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Account / reference no.
                </label>
                <input
                  value={newBank.accNo}
                  onChange={(e) => setNewBank((b) => ({ ...b, accNo: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <button type="submit" className="z-btn-primary w-full justify-center py-3">
                Save account
              </button>
            </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={showBankReconModal} onClose={() => setShowBankReconModal(false)}>
        <div className="z-modal-panel max-w-lg p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">Add bank statement line</h3>
            <button
              type="button"
              onClick={() => setShowBankReconModal(false)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
            >
              <X size={22} />
            </button>
          </div>
          <form className="space-y-4" onSubmit={saveBankReconLineCreate}>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              Enter one row from the bank statement. It starts in <span className="font-semibold">Review</span>; match
              it to a receipt or treasury reference on the Audit tab. Marking <span className="font-semibold">Matched</span>{' '}
              with a <span className="font-semibold">LE-…</span> or <span className="font-semibold">RC-…</span>{' '}
              receipt id checks that the receipt exists.
            </p>
            {ws?.viewAllBranches && branchOptions.length > 0 ? (
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Branch</label>
                <select
                  value={bankReconForm.branchId}
                  onChange={(e) => setBankReconForm((f) => ({ ...f, branchId: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                  required
                >
                  <option value="">Select branch…</option>
                  {branchOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name || b.code || b.id}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Statement date</label>
              <input
                type="date"
                required
                value={bankReconForm.bankDateISO}
                onChange={(e) => setBankReconForm((f) => ({ ...f, bankDateISO: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Description (as on statement)
              </label>
              <input
                required
                value={bankReconForm.description}
                onChange={(e) => setBankReconForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="e.g. NIP inflow — payer name"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Amount (₦)
              </label>
              <input
                required
                type="number"
                step="1"
                value={bankReconForm.amountNgn}
                onChange={(e) => setBankReconForm((f) => ({ ...f, amountNgn: e.target.value }))}
                placeholder="Negative for bank debits / charges"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                System match (optional)
              </label>
              <input
                value={bankReconForm.systemMatch}
                onChange={(e) => setBankReconForm((f) => ({ ...f, systemMatch: e.target.value }))}
                placeholder="e.g. LE-… or RC-26-014 — can add after save"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
              />
            </div>
            <button type="submit" className="z-btn-primary w-full justify-center py-3">
              Save statement line
            </button>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={showBankImportModal} onClose={() => setShowBankImportModal(false)}>
        <div className="z-modal-panel max-w-2xl p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">Import bank lines (JSON)</h3>
            <button
              type="button"
              onClick={() => setShowBankImportModal(false)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
            >
              <X size={22} />
            </button>
          </div>
          <form className="space-y-4" onSubmit={runBankImport}>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              Paste a JSON array of objects with <code className="font-mono">bankDateISO</code> (YYYY-MM-DD),{' '}
              <code className="font-mono">description</code>, and <code className="font-mono">amountNgn</code> (negative
              for debits). Up to 500 rows per request. Lines are created in <span className="font-semibold">Review</span>.
            </p>
            <textarea
              value={bankImportJson}
              onChange={(e) => setBankImportJson(e.target.value)}
              rows={12}
              className="w-full font-mono text-xs bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 outline-none focus:ring-2 focus:ring-[#134e4a]/15"
              spellCheck={false}
            />
            <button type="submit" disabled={bankImportBusy} className="z-btn-primary w-full justify-center py-3 disabled:opacity-50">
              {bankImportBusy ? 'Importing…' : 'Import lines'}
            </button>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={showBankCsvModal} onClose={() => setShowBankCsvModal(false)}>
        <div className="z-modal-panel max-w-2xl p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">Import bank lines (CSV)</h3>
            <button
              type="button"
              onClick={() => setShowBankCsvModal(false)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
            >
              <X size={22} />
            </button>
          </div>
          <form className="space-y-4" onSubmit={runBankCsvImport}>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              First row can be the header{' '}
              <code className="font-mono">bankDateISO,description,amountNgn</code>. Then one row per statement line.
              Use quotes around the description if it contains commas. Amounts are whole naira (negative = debit). Max
              500 rows.
            </p>
            <input
              ref={bankCsvFileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const text = await f.text();
                  setBankCsvText(text);
                } catch {
                  showToast('Could not read that file.', { variant: 'error' });
                }
                e.target.value = '';
              }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => bankCsvFileRef.current?.click()}
                className="z-btn-secondary !text-[10px] py-2 px-3"
              >
                Choose CSV file
              </button>
            </div>
            <textarea
              value={bankCsvText}
              onChange={(e) => setBankCsvText(e.target.value)}
              rows={12}
              className="w-full font-mono text-xs bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 outline-none focus:ring-2 focus:ring-[#134e4a]/15"
              spellCheck={false}
            />
            <button type="submit" disabled={bankCsvBusy} className="z-btn-primary w-full justify-center py-3 disabled:opacity-50">
              {bankCsvBusy ? 'Importing…' : 'Import CSV'}
            </button>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={showExpenseModal} onClose={() => setShowExpenseModal(false)}>
        <div className="z-modal-panel max-w-lg p-8 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-[#134e4a]">Expense entry</h3>
              <button
                type="button"
                onClick={() => setShowExpenseModal(false)}
                className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
              >
                <X size={22} />
              </button>
            </div>
            <form className="space-y-4" onSubmit={saveExpense}>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Expense type
                </label>
                <select
                  value={expenseForm.expenseType}
                  onChange={(e) =>
                    setExpenseForm((f) => ({ ...f, expenseType: e.target.value }))
                  }
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  <option value="COGS — materials & stock">COGS — materials & stock</option>
                  <option value="Operational — rent & utilities">Operational — rent & utilities</option>
                  <option value="Employee — payroll & commissions">Employee — payroll & commissions</option>
                  <option value="Maintenance — plant & equipment">Maintenance — plant & equipment</option>
                  <option value="Logistics & haulage">Logistics & haulage</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                    Amount (₦)
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={expenseForm.amountNgn}
                    onChange={(e) =>
                      setExpenseForm((f) => ({ ...f, amountNgn: e.target.value }))
                    }
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={expenseForm.date}
                    onChange={(e) =>
                      setExpenseForm((f) => ({ ...f, date: e.target.value }))
                    }
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Category
                </label>
                <select
                  required
                  value={expenseForm.category}
                  onChange={(e) =>
                    setExpenseForm((f) => ({ ...f, category: e.target.value }))
                  }
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  <option value="">Select category…</option>
                  {EXPENSE_CATEGORY_OPTIONS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Payment method
                </label>
                <select
                  value={expenseForm.paymentMethod}
                  onChange={(e) =>
                    setExpenseForm((f) => ({ ...f, paymentMethod: e.target.value }))
                  }
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="POS">POS</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Pay from account
                </label>
                <select
                  required
                  value={expenseForm.debitAccountId}
                  onChange={(e) =>
                    setExpenseForm((f) => ({ ...f, debitAccountId: e.target.value }))
                  }
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  <option value="">Select account…</option>
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatNgn(a.balance)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Receipt / invoice reference
                </label>
                <input
                  value={expenseForm.reference}
                  onChange={(e) =>
                    setExpenseForm((f) => ({ ...f, reference: e.target.value }))
                  }
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <p className="text-[10px] text-gray-400">
                Expense ID is generated on save (e.g. EXP-26-015).
              </p>
              <button type="submit" className="z-btn-primary w-full justify-center py-3">
                Save expense
              </button>
            </form>
        </div>
      </ModalFrame>

      <ModalFrame
        isOpen={showPayRequestModal}
        onClose={() => {
          setShowPayRequestModal(false);
        }}
      >
        <div className="z-modal-panel max-w-2xl p-6 sm:p-8 overflow-y-auto max-h-[90vh]">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-xl font-bold text-[#134e4a]">Expense request</h3>
            <button
              type="button"
              onClick={() => setShowPayRequestModal(false)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
            >
              <X size={22} />
            </button>
          </div>
          <form className="space-y-4" onSubmit={savePayRequest}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Request date
                </label>
                <input
                  type="date"
                  required
                  value={requestForm.requestDate}
                  onChange={(e) => setRequestForm((f) => ({ ...f, requestDate: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Reference
                </label>
                <input
                  value={requestForm.requestReference}
                  onChange={(e) => setRequestForm((f) => ({ ...f, requestReference: e.target.value }))}
                  placeholder="Invoice / PO / internal ref"
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Description
              </label>
              <textarea
                rows={4}
                value={requestForm.description}
                onChange={(e) => setRequestForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Purpose, vendor, cost centre, or other context for approvers."
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-medium outline-none resize-y min-h-[96px]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Expense category
              </label>
              <select
                required
                value={requestForm.expenseCategory}
                onChange={(e) => setRequestForm((f) => ({ ...f, expenseCategory: e.target.value }))}
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
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">
                  Line items
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setRequestForm((f) => ({ ...f, lines: [...f.lines, createExpenseRequestLineItem()] }))
                  }
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
                  {requestForm.lines.map((row) => (
                    <li
                      key={row.id}
                      className="p-3 sm:grid sm:grid-cols-[1fr_72px_100px_96px_40px] sm:items-center sm:gap-2 space-y-2 sm:space-y-0 bg-white/60"
                    >
                      <input
                        value={row.item}
                        onChange={(e) =>
                          setRequestForm((f) => ({
                            ...f,
                            lines: f.lines.map((x) =>
                              x.id === row.id ? { ...x, item: e.target.value } : x
                            ),
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
                          setRequestForm((f) => ({
                            ...f,
                            lines: f.lines.map((x) =>
                              x.id === row.id ? { ...x, unit: e.target.value } : x
                            ),
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
                          setRequestForm((f) => ({
                            ...f,
                            lines: f.lines.map((x) =>
                              x.id === row.id ? { ...x, unitPriceNgn: e.target.value } : x
                            ),
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
                          disabled={requestForm.lines.length <= 1}
                          onClick={() =>
                            setRequestForm((f) => ({
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
                  {formatNgn(
                    requestForm.lines.reduce((s, row) => s + expenseRequestLineTotal(row), 0)
                  )}
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
                  ref={payRequestFileRef}
                  type="file"
                  accept="image/*,application/pdf"
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
                      setRequestForm((prev) => ({
                        ...prev,
                        attachment: { name: f.name, mime: m[1], dataBase64: m[2] },
                      }));
                    };
                    reader.readAsDataURL(f);
                  }}
                  className="block w-full text-[11px] text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-teal-50 file:text-[#134e4a]"
                />
                {requestForm.attachment ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRequestForm((f) => ({ ...f, attachment: null }));
                      if (payRequestFileRef.current) payRequestFileRef.current.value = '';
                    }}
                    className="text-[10px] font-bold uppercase text-rose-700 bg-rose-50 px-3 py-2 rounded-lg"
                  >
                    Remove file
                  </button>
                ) : null}
              </div>
              {requestForm.attachment ? (
                <p className="text-[10px] text-slate-500 mt-1 truncate" title={requestForm.attachment.name}>
                  Selected: {requestForm.attachment.name}
                </p>
              ) : (
                <p className="text-[10px] text-gray-400 mt-1">PDF or image. Optional but recommended.</p>
              )}
            </div>
            <p className="text-[10px] text-gray-400">
              Extra rows can be left blank — only completed lines are sent. Request ID is assigned on save. Use Print on
              the list row for a filing copy.
            </p>
            <button type="submit" className="z-btn-primary w-full justify-center py-3">
              Submit for approval
            </button>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={receiptFinanceRow != null} onClose={() => setReceiptFinanceRow(null)}>
        <div className="z-modal-panel max-w-md w-full p-6 sm:p-8">
          <div className="flex justify-between items-start gap-3 mb-4">
            <h3 className="text-lg font-bold text-[#134e4a]">Receipt settlement</h3>
            <button
              type="button"
              onClick={() => setReceiptFinanceRow(null)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
          {receiptFinanceRow ? (
            <form className="space-y-4" onSubmit={saveReceiptFinance}>
              <p className="text-[10px] text-slate-600 font-mono break-all">{receiptFinanceRow.id}</p>
              <p className="text-xs text-slate-700">
                Customer paid:{' '}
                <span className="font-bold tabular-nums">
                  {formatNgn(
                    receiptFinanceRow.cashReceivedNgn != null
                      ? Number(receiptFinanceRow.cashReceivedNgn) || 0
                      : Number(receiptFinanceRow.amountNgn) || 0
                  )}
                </span>
                {receiptFinanceRow.cashReceivedNgn != null &&
                Math.round(Number(receiptFinanceRow.cashReceivedNgn) || 0) !==
                  Math.round(Number(receiptFinanceRow.amountNgn) || 0) ? (
                  <span className="text-slate-600 font-normal">
                    {' '}
                    (allocated to quote {formatNgn(Number(receiptFinanceRow.amountNgn) || 0)})
                  </span>
                ) : null}
              </p>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Amount received in bank (₦)
                </label>
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  value={receiptBankAmtInput}
                  onChange={(e) => setReceiptBankAmtInput(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <label className="flex items-start gap-2 text-[11px] text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  checked={receiptClearDelivery}
                  onChange={(e) => setReceiptClearDelivery(e.target.checked)}
                />
                <span>
                  Cleared for delivery — finance confirms this receipt is good to release downstream.
                </span>
              </label>
              <button
                type="submit"
                disabled={receiptFinanceBusy}
                className="z-btn-primary w-full justify-center py-3 disabled:opacity-50"
              >
                {receiptFinanceBusy ? 'Saving…' : 'Save settlement'}
              </button>
            </form>
          ) : null}
        </div>
      </ModalFrame>
    </PageShell>
  );
};

export default Account;
