import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Landmark,
  Plus,
  ShieldCheck,
  Banknote,
  CheckCircle2,
  X,
  Edit3,
  Activity,
  ArrowDownLeft,
  ChevronRight,
  Search,
  CreditCard,
  Receipt,
  ClipboardList,
  ArrowRightLeft,
  Truck,
  BookOpen,
  AlertCircle,
  RotateCcw,
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

const TAB_LABELS = {
  treasury: 'Treasury',
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
});

const createRequestPayLine = (defaultAccountId = '', amount = '') => ({
  id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  treasuryAccountId: String(defaultAccountId),
  amount: amount === '' ? '' : String(amount),
  reference: '',
});

const createPaymentRequestLine = () => ({
  id: `rq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  expenseID: '',
  amountRequestedNgn: '',
});

const TREASURY_STATEMENT_TYPE_LABEL = {
  RECEIPT_IN: 'Customer receipt',
  ADVANCE_IN: 'Advance deposit',
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

  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

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
    rows: [createPaymentRequestLine()],
    requestDate: '',
    description: '',
  });
  const activeActorLabel = ws?.session?.user?.displayName ?? 'Finance';
  const canApproveRequests = ws?.hasPermission?.('finance.approve');
  const canPayRequests = ws?.hasPermission?.('finance.pay');
  const canReconcileBank = ws?.hasPermission?.('finance.post');

  const [reconDrafts, setReconDrafts] = useState({});
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
  const branchScopeLabel = useMemo(() => {
    if (ws?.viewAllBranches) return 'All branches (HQ roll-up)';
    const id = String(ws?.branchScope || ws?.session?.currentBranchId || '').trim();
    if (!id) return 'Current branch';
    return branchNameById[id] ? `Branch: ${branchNameById[id]}` : `Branch: ${id}`;
  }, [branchNameById, ws?.branchScope, ws?.session?.currentBranchId, ws?.viewAllBranches]);

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
    () => bankReconciliation.filter((l) => l.status === 'Review').length,
    [bankReconciliation]
  );

  const expenseCategorySuggestions = useMemo(() => {
    const rows = ws?.snapshot?.masterData?.expenseCategories;
    if (!Array.isArray(rows)) return [];
    return rows.filter((r) => r.active).map((r) => r.name).filter(Boolean);
  }, [ws?.snapshot?.masterData?.expenseCategories]);

  const isAnyModalOpen =
    showPaymentEntry ||
    showAddBank ||
    showExpenseModal ||
    showPayRequestModal ||
    showTransferModal ||
    showApPaymentModal ||
    showRefundPayModal ||
    statementAccount != null;

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
      { id: 'payables', icon: <Truck size={16} />, label: 'Payables' },
      { id: 'movements', icon: <ArrowRightLeft size={16} />, label: 'Movements' },
      { id: 'disbursements', icon: <ClipboardList size={16} />, label: 'Expenses & requests' },
      { id: 'audit', icon: <ShieldCheck size={16} />, label: 'Audit' },
    ],
    []
  );

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
    if (activeTab === 'disbursements') setShowPayRequestModal(true);
  };

  const newRecordLabel =
    activeTab === 'treasury'
      ? 'New account'
      : activeTab === 'payables'
        ? 'Pay supplier'
        : activeTab === 'movements'
          ? 'New transfer'
          : activeTab === 'disbursements'
            ? 'New payment request'
              : null;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const tab = location.state?.accountsTab;
    if (tab !== 'requests' && tab !== 'payments') return;
    setActiveTab('disbursements');
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
          best = {
            score,
            text: [m.reference, m.counterpartyName, m.note, m.sourceId].filter(Boolean).join(' · ') || m.type || '',
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
    const rows = requestForm.rows
      .map((r) => ({
        expenseID: String(r.expenseID || '').trim(),
        amountRequestedNgn: Number(r.amountRequestedNgn),
      }))
      .filter((r) => r.expenseID || Number.isFinite(r.amountRequestedNgn));
    if (!rows.length) {
      showToast('Add at least one payment request line.', { variant: 'error' });
      return;
    }
    for (const line of rows) {
      if (!line.expenseID || Number.isNaN(line.amountRequestedNgn) || line.amountRequestedNgn <= 0) {
        showToast('Each request line needs an expense and a positive amount.', { variant: 'error' });
        return;
      }
    }
    const requestDate = requestForm.requestDate || new Date().toISOString().slice(0, 10);
    const description = requestForm.description.trim() || '—';
    if (ws?.canMutate) {
      for (const row of rows) {
        const { ok, data } = await apiFetch('/api/payment-requests', {
          method: 'POST',
          body: JSON.stringify({
            expenseID: row.expenseID,
            amountRequestedNgn: row.amountRequestedNgn,
            requestDate,
            description,
          }),
        });
        if (!ok || !data?.ok) {
          showToast(data?.error || 'Could not save request on server.', { variant: 'error' });
          return;
        }
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
      rows: [createPaymentRequestLine()],
      requestDate: '',
      description: '',
    });
    setShowPayRequestModal(false);
    showToast(`${rows.length} payment request line(s) submitted for approval.`);
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
      const blob = [
        req.requestID,
        req.expenseID,
        req.description,
        req.approvalStatus,
        req.approvedBy,
        req.paidBy,
        req.requestDate,
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
        : (reconDrafts[line.id] ?? line.systemMatch ?? '').trim();
    const { ok, data } = await apiFetch(`/api/bank-reconciliation/${encodeURIComponent(line.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, systemMatch }),
    });
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not update bank line.', { variant: 'error' });
      return;
    }
    showToast(status === 'Matched' ? 'Statement line marked matched.' : 'Bank line updated.');
    await ws.refresh();
  };

  return (
    <PageShell blurred={isAnyModalOpen}>
      <PageHeader
        title="Finance & accounts"
        subtitle="Receivables, payables, treasury, approvals, and reconciliation from live records"
        actions={
          <PageTabs tabs={accountTabs} value={activeTab} onChange={setActiveTab} />
        }
      />
      <div className="mb-4 inline-flex items-center rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-800">
        {branchScopeLabel}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
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
            onClick={() => navigate('/sales', { state: { focusSalesTab: 'receipts' } })}
            className="w-full text-left z-card-muted hover:border-teal-100 transition-all cursor-pointer p-5"
          >
            <h3 className="z-section-title flex items-center gap-2">
              <ArrowDownLeft size={14} />
              Accounts receivable
            </h3>
            <p className="text-xl font-black text-[#134e4a]">{formatNgn(receivablesNgn)}</p>
            <p className="text-[10px] font-bold text-gray-400 mt-2 uppercase tracking-wide">
              Open quotation balances · Receipts in Sales
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('payables')}
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

            {activeTab === 'treasury' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3">
                    <p className="text-[9px] font-bold text-gray-400 uppercase">Cash inflows</p>
                    <p className="text-sm font-black text-emerald-700">
                      {formatNgn(ws?.hasWorkspaceData ? treasuryInflowsNgn : liveReceipts.reduce((s, r) => s + (r.amountNgn || 0), 0))}
                    </p>
                    <p className="text-[9px] text-gray-400 mt-1">Receipts and advance deposits</p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3">
                    <p className="text-[9px] font-bold text-gray-400 uppercase">Cash outflows</p>
                    <p className="text-sm font-black text-[#134e4a]">
                      {formatNgn(ws?.hasWorkspaceData ? treasuryOutflowsNgn : expenses.reduce((s, e) => s + e.amountNgn, 0))}
                    </p>
                    <p className="text-[9px] text-gray-400 mt-1">Expenses, refunds, and supplier payouts</p>
                  </div>
                  <div className="rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3">
                    <p className="text-[9px] font-bold text-amber-800 uppercase">Reconciliation</p>
                    <p className="text-sm font-black text-amber-900">
                      {reconciliationFlags} item{reconciliationFlags !== 1 ? 's' : ''} to review
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('audit')}
                      className="text-[9px] font-black uppercase text-amber-900 mt-1 underline-offset-2 hover:underline"
                    >
                      Open audit tab
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
                    <ul className="space-y-2">
                      {refundsAwaitingPay.map((r) => (
                        <li
                          key={r.refundID}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white bg-white/90 px-4 py-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-mono font-bold text-[#134e4a]">{r.refundID}</p>
                            <p className="text-gray-600 truncate">{r.customer}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {r.quotationRef ? `Quote ${r.quotationRef}` : 'No quote ref'}
                              {r.approvedBy ? ` · Approved by ${r.approvedBy}` : ''}
                            </p>
                            <p className="text-[10px] text-gray-500 mt-1 tabular-nums">
                              Approved {formatNgn(refundApprovedAmount(r))} · Paid {formatNgn(Number(r.paidAmountNgn) || 0)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-black text-[#134e4a] tabular-nums">
                              {formatNgn(refundOutstandingAmount(r))}
                            </span>
                            <button
                              type="button"
                              onClick={() => openRefundPay(r)}
                              className="z-btn-primary text-[9px] py-2 px-3"
                            >
                              Record payment
                            </button>
                          </div>
                        </li>
                      ))}
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
                  filteredPayables.map((p) => {
                    const due = p.dueDateISO < todayIso;
                    const open = p.paidNgn < p.amountNgn;
                    return (
                      <div
                        key={p.apID}
                        className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 bg-gray-50/50 border border-transparent rounded-2xl hover:border-teal-100 hover:bg-white transition-all"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#134e4a] uppercase">{p.apID}</p>
                          <p className="text-sm font-bold text-gray-800 mt-1">{p.supplierName}</p>
                          <p className="text-[10px] text-gray-500 mt-1">
                            PO {p.poRef} · Invoice {p.invoiceRef}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {p.branchId ? (
                              <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                                {branchNameById[p.branchId] || p.branchId}
                              </span>
                            ) : null}
                            {open ? (
                              <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                                Outstanding {formatNgn(p.amountNgn - p.paidNgn)}
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                Paid
                              </span>
                            )}
                            {due && open ? (
                              <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                                Past due
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-black text-[#134e4a]">
                              {formatNgn(p.amountNgn)}
                            </p>
                            <p className="text-[10px] text-gray-400">Due {p.dueDateISO}</p>
                          </div>
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
                              className="z-btn-primary py-2.5 px-4 text-[10px]"
                            >
                              Pay
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
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
                  <ul className="space-y-2">
                    {movementRows.map((m) => (
                      <li
                        key={m.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-xs"
                      >
                        <span className="font-bold text-[#134e4a]">{m.id}</span>
                        <span className="text-gray-600">
                          {m.fromName} → {m.toName}
                        </span>
                        <span className="font-black text-[#134e4a]">{formatNgn(m.amountNgn)}</span>
                        <span className="text-[10px] text-gray-400">{m.at}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {activeTab === 'disbursements' && (
              <div className="space-y-8 animate-in slide-in-from-right-5">
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-[#134e4a]">
                        1) Payment requests (approval queue)
                      </h3>
                      <p className="text-[11px] text-gray-500 mt-1">
                        Raise and approve disbursement requests before treasury payout.
                      </p>
                    </div>
                    <button type="button" onClick={() => setShowPayRequestModal(true)} className="z-btn-secondary">
                      <Plus size={16} /> New payment request
                    </button>
                  </div>
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

                  return (
                    <div
                      key={req.requestID}
                      className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 bg-gray-50/50 border border-transparent rounded-2xl hover:border-teal-100 hover:bg-white transition-all group"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="bg-white p-3 rounded-xl text-gray-400 group-hover:text-[#134e4a] shadow-sm shrink-0">
                          <Banknote size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-700 uppercase">{req.requestID}</p>
                          <p className="text-[10px] text-gray-400 mt-1">
                            Linked {req.expenseID} · {req.description}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {req.branchId ? (
                              <span className="inline-flex px-3 py-1 rounded-full text-[9px] font-bold uppercase bg-slate-100 text-slate-700">
                                {branchNameById[req.branchId] || req.branchId}
                              </span>
                            ) : null}
                            {req.isStaffLoan ? (
                              <span className="inline-flex px-3 py-1 rounded-full text-[9px] font-bold uppercase bg-teal-100 text-teal-800">
                                Staff loan
                              </span>
                            ) : null}
                          </div>
                          {req.approvedBy ? (
                            <p className="text-[10px] text-gray-400 mt-1">
                              {req.approvedBy}
                              {req.approvedAtISO ? ` · ${req.approvedAtISO}` : ''}
                            </p>
                          ) : null}
                          {(req.paidBy || paidAmountNgn > 0) ? (
                            <p className="text-[10px] text-gray-400 mt-1">
                              Paid {formatNgn(paidAmountNgn)}
                              {req.paidBy ? ` · ${req.paidBy}` : ''}
                              {req.paidAtISO ? ` · ${req.paidAtISO}` : ''}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex px-3 py-1 rounded-full text-[9px] font-bold uppercase ${
                                req.approvalStatus === 'Approved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : req.approvalStatus === 'Rejected'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {req.approvalStatus}
                            </span>
                            <span
                              className={`inline-flex px-3 py-1 rounded-full text-[9px] font-bold uppercase ${
                                payoutState === 'Paid'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : payoutState === 'Part paid'
                                    ? 'bg-sky-100 text-sky-800'
                                    : payoutState === 'Awaiting payout'
                                      ? 'bg-teal-100 text-teal-800'
                                      : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {payoutState}
                            </span>
                          </div>
                          {req.approvalNote ? (
                            <p className="text-[10px] text-gray-500 mt-2">{req.approvalNote}</p>
                          ) : null}
                          {req.paymentNote ? (
                            <p className="text-[10px] text-gray-500 mt-1">{req.paymentNote}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-6 shrink-0">
                        {canApproveRequests && req.approvalStatus === 'Pending' ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => reviewPaymentRequest(req.requestID, 'Approved')}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-emerald-800 transition hover:bg-emerald-100"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => reviewPaymentRequest(req.requestID, 'Rejected')}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-rose-800 transition hover:bg-rose-100"
                            >
                              Reject
                            </button>
                          </div>
                        ) : null}
                        <div className="text-right">
                          <p className="text-sm font-black text-[#134e4a]">
                            {formatNgn(req.amountRequestedNgn)}
                          </p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase">
                            Remaining {formatNgn(outstandingNgn)}
                          </p>
                          <p className="text-[10px] font-bold text-gray-300 uppercase mt-1">
                            {req.requestDate}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openRequestPayment(req)}
                          className="p-2 bg-white rounded-lg text-gray-300 hover:text-[#134e4a] border border-gray-100 shadow-sm transition-all"
                          title="Record treasury payout"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                </section>

                <section className="space-y-4 border-t border-slate-100 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-[#134e4a]">
                        2) Expenses (posted records)
                      </h3>
                      <p className="text-[11px] text-gray-500 mt-1">
                        Record completed spending entries after request approval/payout.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setExpenseForm((f) => ({
                          ...f,
                          debitAccountId: String(bankAccounts[0]?.id ?? ''),
                        }));
                        setShowExpenseModal(true);
                      }}
                      className="z-btn-secondary"
                    >
                      <Plus size={16} /> New expense
                    </button>
                  </div>
                {filteredExpenses.map((ex) => (
                  <div
                    key={ex.expenseID}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-gray-50/50 border border-transparent rounded-2xl hover:border-teal-100 hover:bg-white transition-all"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="bg-white p-3 rounded-xl text-gray-400 text-[#134e4a] shadow-sm shrink-0">
                        <Receipt size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-700 uppercase">{ex.expenseID}</p>
                        <p className="text-[10px] text-gray-500 mt-1">
                          {ex.expenseType} · {ex.category}
                        </p>
                        {ex.branchId ? (
                          <p className="text-[10px] mt-1">
                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-bold uppercase text-slate-700">
                              {branchNameById[ex.branchId] || ex.branchId}
                            </span>
                          </p>
                        ) : null}
                        <p className="text-[10px] text-gray-400 mt-1">
                          {ex.paymentMethod} · Ref {ex.reference}
                        </p>
                      </div>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <p className="text-sm font-black text-[#134e4a]">{formatNgn(ex.amountNgn)}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">{ex.date}</p>
                    </div>
                  </div>
                ))}
                </section>
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="space-y-8 animate-in slide-in-from-left-5">
                {reconciliationFlags > 0 ? (
                  <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50/80 px-4 py-3 text-sm text-red-900">
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
                        className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 flex gap-3"
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

                <div>
                  <h3 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Landmark size={14} />
                    Bank reconciliation
                  </h3>
                  <div className="rounded-zarewa border border-gray-100 overflow-hidden bg-white">
                    <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      <div className="col-span-2">Date</div>
                      <div className="col-span-4">Bank description</div>
                      <div className="col-span-2 text-right">Amount</div>
                      <div className="col-span-3">System match</div>
                      <div className="col-span-1"> </div>
                    </div>
                    {filteredReconciliation.map((line) => (
                      <React.Fragment key={line.id}>
                        <div className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-gray-50 items-center text-xs">
                          <div className="col-span-2 text-gray-500">{line.bankDateISO}</div>
                          <div className="col-span-4 text-gray-700 font-medium">{line.description}</div>
                          <div
                            className={`col-span-2 text-right font-black ${line.amountNgn < 0 ? 'text-red-700' : 'text-emerald-700'}`}
                          >
                            {formatNgn(Math.abs(line.amountNgn))}
                            {line.amountNgn < 0 ? ' DR' : ' CR'}
                          </div>
                          <div className="col-span-3 text-[10px] text-gray-500">
                            {line.systemMatch ?? reconSuggestionsById[line.id]?.text ?? '—'}
                            {line.branchId ? (
                              <span className="ml-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-bold uppercase text-slate-700">
                                {branchNameById[line.branchId] || line.branchId}
                              </span>
                            ) : null}
                          </div>
                          <div className="col-span-1">
                            <span
                              className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                line.status === 'Matched'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : line.status === 'Excluded'
                                    ? 'bg-gray-100 text-gray-600'
                                    : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {line.status}
                            </span>
                          </div>
                        </div>
                        {line.status === 'Review' && canReconcileBank && ws?.canMutate ? (
                          <div className="px-4 pb-3 pt-0 border-t border-dashed border-gray-100 bg-gray-50/40 flex flex-col sm:flex-row sm:items-center gap-2">
                            <input
                              type="text"
                              value={reconDrafts[line.id] ?? line.systemMatch ?? ''}
                              onChange={(e) =>
                                setReconDrafts((d) => ({ ...d, [line.id]: e.target.value }))
                              }
                              placeholder="System match e.g. receipt id, treasury ref, GL batch…"
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
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-3">
                    Exception queue (misc receipts)
                  </h3>
                  <div className="space-y-4">
                    {auditQueue.map((item) => (
                      <div
                        key={item.id}
                        className="p-6 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-white transition-all"
                      >
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-4">
                            <div className="bg-emerald-100 p-3 rounded-xl text-emerald-600">
                              <ArrowDownLeft size={18} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-700 uppercase">{item.customer}</p>
                              <p className="text-[10px] text-gray-400 italic">
                                via {item.bank} · {item.date}
                              </p>
                              <p className="text-[10px] text-gray-500 mt-1">{item.desc}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <p className="text-lg font-black text-[#134e4a]">
                              ₦{item.amount.toLocaleString()}
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  showToast('Attach supporting document workflow is not yet connected.', { variant: 'info' })
                                }
                                className="p-2 bg-white text-gray-300 hover:text-[#134e4a] rounded-lg border border-gray-100 transition-all"
                              >
                                <Edit3 size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  showToast('Marked cleared in the audit review queue.', { variant: 'success' })
                                }
                                className="p-2 bg-[#134e4a] text-white rounded-lg shadow-md"
                              >
                                <CheckCircle2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-[#134e4a]/[0.03] p-5 text-xs text-gray-600 leading-relaxed">
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
            <div className="overflow-y-auto flex-1 min-h-0 -mx-1 px-1 space-y-0 border border-gray-100 rounded-xl bg-white">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 text-[9px] font-bold text-gray-400 uppercase tracking-wider sticky top-0 z-[1] border-b border-gray-100">
                <div className="col-span-3">Date</div>
                <div className="col-span-5">Details</div>
                <div className="col-span-4 text-right">Amount</div>
              </div>
              <ul className="divide-y divide-gray-50">
                {accountStatementLines.map((m) => {
                  const raw = Number(m.amountNgn) || 0;
                  const isIn = raw > 0;
                  const isOut = raw < 0;
                  const abs = Math.abs(raw);
                  return (
                    <li key={m.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 text-[11px] items-start">
                      <div className="col-span-3 text-gray-500 tabular-nums">
                        {String(m.postedAtISO || '').slice(0, 10) || '—'}
                      </div>
                      <div className="col-span-5 text-gray-800 leading-snug break-words">
                        {treasuryMovementStatementLabel(m)}
                      </div>
                      <div
                        className={`col-span-4 text-right font-black tabular-nums shrink-0 ${
                          isIn ? 'text-emerald-600' : isOut ? 'text-red-600' : 'text-gray-500'
                        }`}
                      >
                        {isIn ? '+' : isOut ? '−' : ''}
                        {formatNgn(abs)}
                      </div>
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
              <div className="space-y-2">
                {refundPayLines.map((line) => (
                  <div
                    key={line.id}
                    className="grid grid-cols-12 gap-2 items-center rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3"
                  >
                    <select
                      value={line.treasuryAccountId}
                      onChange={(e) => updateRefundPayLine(line.id, { treasuryAccountId: e.target.value })}
                      className="col-span-12 sm:col-span-5 rounded-xl border border-gray-200 bg-white py-3 px-3 text-sm font-semibold"
                    >
                      <option value="">Select account…</option>
                      {bankAccounts.map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.name} ({formatNgn(a.balance)})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={line.amount}
                      onChange={(e) => updateRefundPayLine(line.id, { amount: e.target.value })}
                      className="col-span-5 sm:col-span-3 rounded-xl border border-gray-200 bg-white py-3 px-3 text-sm font-bold text-[#134e4a]"
                      placeholder="Amount ₦"
                    />
                    <input
                      type="text"
                      value={line.reference}
                      onChange={(e) => updateRefundPayLine(line.id, { reference: e.target.value })}
                      className="col-span-5 sm:col-span-3 rounded-xl border border-gray-200 bg-white py-3 px-3 text-sm"
                      placeholder="Reference"
                    />
                    <button
                      type="button"
                      onClick={() => removeRefundPayLine(line.id)}
                      className="col-span-2 sm:col-span-1 inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-300 hover:text-rose-500"
                      title="Remove line"
                    >
                      <X size={16} />
                    </button>
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
              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
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
              <div className="space-y-2">
                {requestPayLines.map((line) => (
                  <div
                    key={line.id}
                    className="grid grid-cols-12 gap-2 items-center rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3"
                  >
                    <select
                      value={line.treasuryAccountId}
                      onChange={(e) => updateRequestPayLine(line.id, { treasuryAccountId: e.target.value })}
                      className="col-span-12 sm:col-span-5 rounded-xl border border-gray-200 bg-white py-3 px-3 text-sm font-semibold"
                    >
                      <option value="">Select account…</option>
                      {bankAccounts.map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.name} ({formatNgn(a.balance)})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={line.amount}
                      onChange={(e) => updateRequestPayLine(line.id, { amount: e.target.value })}
                      className="col-span-5 sm:col-span-3 rounded-xl border border-gray-200 bg-white py-3 px-3 text-sm font-bold text-[#134e4a]"
                      placeholder="Amount ₦"
                    />
                    <input
                      type="text"
                      value={line.reference}
                      onChange={(e) => updateRequestPayLine(line.id, { reference: e.target.value })}
                      className="col-span-5 sm:col-span-3 rounded-xl border border-gray-200 bg-white py-3 px-3 text-sm"
                      placeholder="Reference"
                    />
                    <button
                      type="button"
                      onClick={() => removeRequestPayLine(line.id)}
                      className="col-span-2 sm:col-span-1 inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-300 hover:text-rose-500"
                      title="Remove line"
                    >
                      <X size={16} />
                    </button>
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
              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
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
                <input
                  required
                  list="z-expense-category-options"
                  value={expenseForm.category}
                  onChange={(e) =>
                    setExpenseForm((f) => ({ ...f, category: e.target.value }))
                  }
                  placeholder="Type or pick from list (Settings → master data)"
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
                <datalist id="z-expense-category-options">
                  {expenseCategorySuggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
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
                Expense ID is generated on save (e.g. EXP-2026-015).
              </p>
              <button type="submit" className="z-btn-primary w-full justify-center py-3">
                Save expense
              </button>
            </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={showPayRequestModal} onClose={() => setShowPayRequestModal(false)}>
        <div className="z-modal-panel max-w-lg p-8 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-[#134e4a]">Payment request</h3>
              <button
                type="button"
                onClick={() => setShowPayRequestModal(false)}
                className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
              >
                <X size={22} />
              </button>
            </div>
            <form className="space-y-4" onSubmit={savePayRequest}>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                    Request lines
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setRequestForm((f) => ({
                        ...f,
                        rows: [...f.rows, createPaymentRequestLine()],
                      }))
                    }
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[#134e4a]"
                  >
                    <Plus size={12} /> Add line
                  </button>
                </div>
                <div className="space-y-2">
                  {requestForm.rows.map((row, idx) => (
                    <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                      <select
                        required
                        value={row.expenseID}
                        onChange={(e) =>
                          setRequestForm((f) => ({
                            ...f,
                            rows: f.rows.map((x) =>
                              x.id === row.id ? { ...x, expenseID: e.target.value } : x
                            ),
                          }))
                        }
                        className="col-span-7 w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-3 text-xs font-bold outline-none"
                      >
                        <option value="">Expense #{idx + 1}</option>
                        {expenses.map((ex) => (
                          <option key={ex.expenseID} value={ex.expenseID}>
                            {ex.expenseID} — {formatNgn(ex.amountNgn)}
                          </option>
                        ))}
                      </select>
                      <input
                        required
                        type="number"
                        min="1"
                        value={row.amountRequestedNgn}
                        onChange={(e) =>
                          setRequestForm((f) => ({
                            ...f,
                            rows: f.rows.map((x) =>
                              x.id === row.id
                                ? { ...x, amountRequestedNgn: e.target.value }
                                : x
                            ),
                          }))
                        }
                        placeholder="Amount (₦)"
                        className="col-span-4 w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-3 text-xs font-bold outline-none"
                      />
                      <button
                        type="button"
                        disabled={requestForm.rows.length === 1}
                        onClick={() =>
                          setRequestForm((f) => ({
                            ...f,
                            rows:
                              f.rows.length === 1 ? f.rows : f.rows.filter((x) => x.id !== row.id),
                          }))
                        }
                        className="col-span-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-gray-500 disabled:opacity-40"
                        title="Remove line"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                    Request date
                  </label>
                  <input
                    type="date"
                    value={requestForm.requestDate}
                    onChange={(e) =>
                      setRequestForm((f) => ({ ...f, requestDate: e.target.value }))
                    }
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={requestForm.description}
                  onChange={(e) =>
                    setRequestForm((f) => ({ ...f, description: e.target.value }))
                  }
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-medium outline-none resize-none"
                />
              </div>
              <p className="text-[10px] text-gray-400">
                Request ID is generated on save. Approval defaults to Pending.
              </p>
              <button type="submit" className="z-btn-primary w-full justify-center py-3">
                Submit request
              </button>
            </form>
        </div>
      </ModalFrame>
    </PageShell>
  );
};

export default Account;
