import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Building2,
  BadgeCheck,
  Pencil,
  FileText,
  Package,
  Receipt,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquarePlus,
  Download,
  BarChart3,
  ChevronRight,
  X,
  LayoutDashboard,
  ScrollText,
  Activity,
  Scissors,
  RotateCcw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { PageHeader, PageShell, MainPanel, ModalFrame } from '../components/layout';
import { useCustomers } from '../context/CustomersContext';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';
import {
  SALES_MOCK,
  CUSTOMER_DASHBOARD_MOCK,
  formatNgn,
} from '../Data/mockData';
import { loadRefunds, refundApprovedAmount, refundOutstandingAmount } from '../lib/refundsStore';
import {
  advanceBalanceNgn,
  amountDueOnQuotation,
  entriesForCustomer,
  ledgerReceiptTotalNgn,
  recordRefundAdvance,
} from '../lib/customerLedgerStore';

const TODAY_ISO = '2026-03-28';

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'quotations', label: 'Quotations', icon: FileText },
  { id: 'orders', label: 'Orders', icon: Package },
  { id: 'financial', label: 'Receipts & payments', icon: Receipt },
  { id: 'activity', label: 'Activity & notes', icon: Activity },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

function scrollToId(id) {
  document.getElementById(`cd-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function quotationUiStatus(q) {
  if (q.paymentStatus === 'Paid') return { label: 'Paid', tone: 'paid' };
  const due = q.dueDateISO;
  if (due && due < TODAY_ISO && q.paymentStatus !== 'Paid') {
    return { label: 'Overdue', tone: 'overdue' };
  }
  if (q.status === 'Approved' && q.paymentStatus === 'Partial') {
    return { label: 'Approved', tone: 'pending' };
  }
  return { label: q.status === 'Approved' ? 'Approved' : 'Pending', tone: 'pending' };
}

function ledgerTypeLabel(t) {
  switch (t) {
    case 'ADVANCE_IN':
      return 'Advance in';
    case 'ADVANCE_APPLIED':
      return 'Advance applied';
    case 'RECEIPT':
      return 'Receipt';
    case 'OVERPAY_ADVANCE':
      return 'Overpay → advance';
    case 'REFUND_ADVANCE':
      return 'Advance refunded';
    default:
      return t;
  }
}

function toneClass(tone) {
  if (tone === 'paid') return 'bg-emerald-100 text-emerald-800';
  if (tone === 'overdue') return 'bg-red-100 text-red-800';
  return 'bg-amber-100 text-amber-800';
}

function orderStatusClass(s) {
  if (s === 'Delivered') return 'bg-emerald-100 text-emerald-800';
  if (s === 'Shipped') return 'bg-sky-100 text-sky-800';
  return 'bg-amber-100 text-amber-800';
}

const emptyEdit = (c) => ({
  name: c?.name ?? '',
  phoneNumber: c?.phoneNumber ?? '',
  email: c?.email ?? '',
  addressShipping: c?.addressShipping ?? '',
  addressBilling: c?.addressBilling ?? '',
  status: c?.status ?? 'Active',
  tier: c?.tier ?? 'Regular',
  paymentTerms: c?.paymentTerms ?? 'Net 30',
  companyName: c?.companyName ?? '',
  leadSource: c?.leadSource ?? '',
  preferredContact: c?.preferredContact ?? 'Phone',
  followUpISO: c?.followUpISO ?? '',
  crmTagsStr: Array.isArray(c?.crmTags) ? c.crmTags.join(', ') : '',
  crmProfileNotes: c?.crmProfileNotes ?? '',
});

const CustomerDashboard = () => {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { customers, setCustomers } = useCustomers();
  const { show: showToast } = useToast();
  const ws = useWorkspace();

  const crm = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? ws?.snapshot?.customerDashboard ?? { orders: [], interactions: [], salesTrendByCustomer: {} }
        : CUSTOMER_DASHBOARD_MOCK,
    [ws?.hasWorkspaceData, ws?.snapshot?.customerDashboard]
  );

  const customer = useMemo(
    () => customers.find((c) => c.customerID === customerId),
    [customers, customerId]
  );

  const quotationRows = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.quotations)
          ? ws.snapshot.quotations
          : []
        : SALES_MOCK.quotations,
    [ws]
  );
  const receiptRows = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.receipts)
          ? ws.snapshot.receipts
          : []
        : SALES_MOCK.receipts,
    [ws]
  );
  const cuttingListRows = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.cuttingLists)
          ? ws.snapshot.cuttingLists
          : []
        : SALES_MOCK.cuttingLists,
    [ws]
  );
  const refundRows = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.refunds)
          ? ws.snapshot.refunds
          : []
        : loadRefunds(),
    [ws]
  );

  const quotations = useMemo(
    () => quotationRows.filter((q) => q.customerID === customerId),
    [customerId, quotationRows]
  );
  const receipts = useMemo(
    () => receiptRows.filter((r) => r.customerID === customerId),
    [customerId, receiptRows]
  );
  const cuttingLists = useMemo(
    () => cuttingListRows.filter((cl) => cl.customerID === customerId),
    [customerId, cuttingListRows]
  );
  const refundsForCustomer = useMemo(
    () => refundRows.filter((r) => r.customerID === customerId),
    [customerId, refundRows]
  );

  const orders = useMemo(
    () => (crm.orders || []).filter((o) => o.customerID === customerId),
    [customerId, crm.orders]
  );
  const interactions = useMemo(
    () => (crm.interactions || []).filter((i) => i.customerID === customerId),
    [customerId, crm.interactions]
  );

  const [payWindow, setPayWindow] = useState('30');
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState(() => emptyEdit(customer));
  const [detail, setDetail] = useState(null);
  const [showReports, setShowReports] = useState(false);
  const [reportFrom, setReportFrom] = useState('2026-01-01');
  const [reportTo, setReportTo] = useState(TODAY_ISO);
  const [noteDraft, setNoteDraft] = useState('');
  const [staffNotes, setStaffNotes] = useState([]);
  const [ledgerViewNonce, setLedgerViewNonce] = useState(0);
  const [refundAdvanceOpen, setRefundAdvanceOpen] = useState(false);
  const [refundAdvanceAmt, setRefundAdvanceAmt] = useState('');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (customer) setEditForm(emptyEdit(customer));
  }, [customer]);

  useEffect(() => {
    if (!customerId) return;
    if (!ws?.hasWorkspaceData) {
      setStaffNotes([]);
      return undefined;
    }
    if (!ws?.canMutate) {
      const fromCrm = (crm.interactions || [])
        .filter((i) => i.customerID === customerId)
        .map((i) => ({
          id: i.id,
          text: i.detail,
          at: i.atIso,
          kind: i.kind,
          title: i.title,
          createdByName: i.createdByName,
        }));
      setStaffNotes(fromCrm);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const { ok, data } = await apiFetch(
        `/api/customers/${encodeURIComponent(customerId)}/interactions`
      );
      if (!ok || cancelled) return;
      const rows = (data?.interactions || []).map((i) => ({
        id: i.id,
        text: i.detail,
        at: i.atIso,
        kind: i.kind,
        title: i.title,
        createdByName: i.createdByName,
      }));
      setStaffNotes(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, ws?.hasWorkspaceData, ws?.canMutate, crm.interactions]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const addNote = async (e) => {
    e.preventDefault();
    const t = noteDraft.trim();
    if (!t) return;
    if (!ws?.canMutate) {
      showToast('Reconnect to save staff notes — workspace is read-only.', { variant: 'info' });
      return;
    }
    const { ok, data } = await apiFetch(
      `/api/customers/${encodeURIComponent(customerId)}/interactions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'note',
          title: 'Staff note',
          detail: t,
        }),
      }
    );
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not save note.', { variant: 'error' });
      return;
    }
    const inter = data.interaction;
    const row = {
      id: inter.id,
      text: inter.detail,
      at: inter.atIso,
      kind: inter.kind,
      title: inter.title,
      createdByName: inter.createdByName,
    };
    setStaffNotes((prev) => [row, ...prev]);
    setNoteDraft('');
    showToast('Note saved to customer CRM.');
  };

  const submitRefundAdvance = async (e) => {
    e.preventDefault();
    if (!customer) return;
    const n = Number(String(refundAdvanceAmt).replace(/,/g, ''));
    if (Number.isNaN(n) || n <= 0) {
      showToast('Enter refund amount.', { variant: 'error' });
      return;
    }
    if (ws?.canMutate) {
      const { ok, data } = await apiFetch('/api/ledger/refund-advance', {
        method: 'POST',
        body: JSON.stringify({
          customerID: customer.customerID,
          customerName: customer.name,
          amountNgn: n,
          note: 'Advance refunded to customer',
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Refund failed on server.', { variant: 'error' });
        return;
      }
      await ws.refresh();
    } else if (!ws?.hasWorkspaceData) {
      const res = recordRefundAdvance({
        customerID: customer.customerID,
        customerName: customer.name,
        amountNgn: n,
        note: 'Advance refunded to customer',
      });
      if (!res.ok) {
        showToast(res.error, { variant: 'error' });
        return;
      }
    } else {
      showToast('Reconnect to post advance refunds — read-only workspace.', { variant: 'info' });
      return;
    }
    showToast(`Advance refund ${formatNgn(n)} recorded.`);
    setRefundAdvanceOpen(false);
    setRefundAdvanceAmt('');
    setLedgerViewNonce((x) => x + 1);
  };

  const sortedQuotations = useMemo(
    () =>
      [...quotations].sort(
        (a, b) => (b.dateISO || '').localeCompare(a.dateISO || '')
      ),
    [quotations]
  );
  const lastQuotations = sortedQuotations.slice(0, 5);

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => b.dateISO.localeCompare(a.dateISO)),
    [orders]
  );
  const lastOrders = sortedOrders.slice(0, 5);

  const outstandingNgn = useMemo(
    () => quotations.reduce((s, q) => s + amountDueOnQuotation(q), 0),
    [quotations]
  );

  const advanceBalNgn = useMemo(
    () => {
      void ledgerViewNonce;
      return advanceBalanceNgn(customerId);
    },
    [customerId, ledgerViewNonce]
  );

  const totalPaidReceiptsNgn = useMemo(
    () => {
      void ledgerViewNonce;
      return receipts.reduce((s, r) => s + (r.amountNgn || 0), 0) + ledgerReceiptTotalNgn(customerId);
    },
    [receipts, customerId, ledgerViewNonce]
  );

  const ledgerLines = useMemo(
    () => {
      void ledgerViewNonce;
      return [...entriesForCustomer(customerId)].sort((a, b) =>
        (b.atISO || '').localeCompare(a.atISO || '')
      );
    },
    [customerId, ledgerViewNonce]
  );

  const totalInvoicedNgn = useMemo(
    () => quotations.reduce((s, q) => s + q.totalNgn, 0),
    [quotations]
  );

  const pendingQuotationsCount = useMemo(
    () => quotations.filter((q) => q.status === 'Pending').length,
    [quotations]
  );

  const overdueCount = useMemo(
    () =>
      quotations.filter((q) => {
        if (q.paymentStatus === 'Paid') return false;
        return q.dueDateISO && q.dueDateISO < TODAY_ISO;
      }).length,
    [quotations]
  );

  const paymentProgressPct = useMemo(() => {
    if (totalInvoicedNgn <= 0) return 0;
    const paidOnBooks = quotations.reduce((s, q) => s + (q.paidNgn || 0), 0);
    return Math.min(100, Math.round((paidOnBooks / totalInvoicedNgn) * 100));
  }, [quotations, totalInvoicedNgn]);

  const filteredReceipts = useMemo(() => {
    const sorted = [...receipts].sort(
      (a, b) => (b.dateISO || '').localeCompare(a.dateISO || '')
    );
    if (payWindow === 'all') return sorted;
    const days = payWindow === '30' ? 30 : 60;
    const cutoff = new Date(TODAY_ISO);
    cutoff.setDate(cutoff.getDate() - days);
    const ciso = cutoff.toISOString().slice(0, 10);
    return sorted.filter((r) => (r.dateISO || '') >= ciso);
  }, [receipts, payWindow]);

  const outstandingLines = useMemo(() => {
    return quotations
      .map((q) => ({
        id: q.id,
        due: q.dueDateISO,
        amountNgn: amountDueOnQuotation(q),
        overdue: q.dueDateISO && q.dueDateISO < TODAY_ISO,
      }))
      .filter((o) => o.amountNgn > 0)
      .sort((a, b) => (a.due || '').localeCompare(b.due || ''));
  }, [quotations]);

  const trendData = useMemo(() => {
    const series =
      crm.salesTrendByCustomer?.[customerId] ||
      [
        { month: 'Oct', amountNgn: 0 },
        { month: 'Nov', amountNgn: 0 },
        { month: 'Dec', amountNgn: 0 },
        { month: 'Jan', amountNgn: 0 },
        { month: 'Feb', amountNgn: 0 },
        { month: 'Mar', amountNgn: 0 },
      ];
    return series.map((row) => ({
      ...row,
      amountM: Math.round(row.amountNgn / 100_000) / 10,
    }));
  }, [customerId, crm.salesTrendByCustomer]);

  const mergedTimeline = useMemo(() => {
    const qSorted = [...quotations].sort((a, b) =>
      (b.dateISO || '').localeCompare(a.dateISO || '')
    );
    const fromQuotations = qSorted.map((q) => ({
      sort: q.dateISO || '',
      kind: 'quotation',
      title: `Quotation ${q.id}`,
      detail: `${q.total} · ${q.paymentStatus} · Owner: ${q.handledBy || '—'}`,
      source: 'tx',
    }));
    const rcSorted = [...receipts].sort((a, b) =>
      (b.dateISO || '').localeCompare(a.dateISO || '')
    );
    const fromReceipts = rcSorted.map((r) => ({
      sort: r.dateISO || '',
      kind: 'receipt',
      title: `Receipt ${r.id}`,
      detail: `${r.amount} · ${r.method || '—'} · Recorded by: ${r.handledBy || '—'}`,
      source: 'tx',
    }));
    const clSorted = [...cuttingLists].sort((a, b) =>
      (b.dateISO || '').localeCompare(a.dateISO || '')
    );
    const fromCutting = clSorted.map((cl) => ({
      sort: cl.dateISO || '',
      kind: 'cutting',
      title: `Cutting list ${cl.id}`,
      detail: `${cl.total} · ${cl.status} · ${cl.handledBy ? `By ${cl.handledBy}` : '—'}`,
      source: 'tx',
    }));
    const rfSorted = [...refundsForCustomer].sort((a, b) =>
      (b.requestedAtISO || '').localeCompare(a.requestedAtISO || '')
    );
    const fromRefunds = rfSorted.map((r) => ({
      sort: (r.requestedAtISO || '').slice(0, 10) || '1970-01-01',
      kind: 'refund',
      title: `Refund ${r.refundID} (${r.status})`,
      detail: `${formatNgn(r.amountNgn)} · ${r.reasonCategory || r.reason} · Requested by: ${r.requestedBy || '—'}`,
      source: 'tx',
    }));
    const fromInteractions = interactions.map((i) => ({
      sort: i.dateISO,
      kind: i.kind,
      title: i.title,
      detail: i.detail,
      source: 'log',
    }));
    const fromNotes = staffNotes.map((n) => ({
      sort: n.at,
      kind: n.kind || 'note',
      title: n.title?.trim() ? n.title : n.kind === 'call' ? 'Call log' : 'Staff note',
      detail: n.createdByName ? `${n.text} · ${n.createdByName}` : n.text,
      source: 'note',
    }));
    return [
      ...fromQuotations,
      ...fromReceipts,
      ...fromCutting,
      ...fromRefunds,
      ...fromInteractions,
      ...fromNotes,
    ].sort((a, b) => b.sort.localeCompare(a.sort));
  }, [quotations, receipts, cuttingLists, refundsForCustomer, interactions, staffNotes]);

  const goSalesQuotation = (id) => {
    navigate('/sales', {
      state: { globalSearchQuery: id, focusSalesTab: 'quotations' },
    });
  };

  const goSalesReceipt = (id) => {
    navigate('/sales', {
      state: { globalSearchQuery: id, focusSalesTab: 'receipts' },
    });
  };

  const goSalesRefund = (id) => {
    navigate('/sales', {
      state: { globalSearchQuery: id, focusSalesTab: 'refund' },
    });
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!editForm.name.trim() || !editForm.phoneNumber.trim()) {
      showToast('Name and phone are required.', { variant: 'error' });
      return;
    }
    if (ws?.canMutate) {
      const { ok, data } = await apiFetch(`/api/customers/${encodeURIComponent(customerId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name.trim(),
          phoneNumber: editForm.phoneNumber.trim(),
          email: editForm.email.trim(),
          addressShipping: editForm.addressShipping.trim(),
          addressBilling: editForm.addressBilling.trim() || editForm.addressShipping.trim(),
          status: editForm.status,
          tier: editForm.tier,
          paymentTerms: editForm.paymentTerms,
          companyName: editForm.companyName.trim(),
          leadSource: editForm.leadSource.trim(),
          preferredContact: editForm.preferredContact,
          followUpISO: editForm.followUpISO.trim(),
          crmTags: editForm.crmTagsStr
            .split(/[,;]+/)
            .map((x) => x.trim())
            .filter(Boolean),
          crmProfileNotes: editForm.crmProfileNotes.trim(),
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not update customer profile.', { variant: 'error' });
        return;
      }
      await ws.refresh();
      setShowEdit(false);
      showToast('Customer profile updated.');
      return;
    }
    setCustomers((prev) =>
      prev.map((c) =>
        c.customerID === customerId
          ? {
              ...c,
              name: editForm.name.trim(),
              phoneNumber: editForm.phoneNumber.trim(),
              email: editForm.email.trim() || '—',
              addressShipping: editForm.addressShipping.trim() || '—',
              addressBilling:
                editForm.addressBilling.trim() ||
                editForm.addressShipping.trim() ||
                '—',
              status: editForm.status,
              tier: editForm.tier,
              paymentTerms: editForm.paymentTerms,
              companyName: editForm.companyName.trim(),
              leadSource: editForm.leadSource.trim(),
              preferredContact: editForm.preferredContact,
              followUpISO: editForm.followUpISO.trim(),
              crmTags: editForm.crmTagsStr
                .split(/[,;]+/)
                .map((x) => x.trim())
                .filter(Boolean),
              crmProfileNotes: editForm.crmProfileNotes.trim(),
              createdBy: c.createdBy,
              createdAtISO: c.createdAtISO,
            }
          : c
      )
    );
    setShowEdit(false);
    showToast('Customer profile updated.');
  };

  const downloadReport = (kind) => {
    const lines = [];
    lines.push(`Zarewa — Customer report (${kind})`);
    lines.push(`Customer: ${customer?.name} (${customerId})`);
    lines.push(`Period: ${reportFrom} → ${reportTo}`);
    lines.push('');
    if (kind === 'sales') {
      const inRange = quotations.filter(
        (q) =>
          (q.dateISO || '') >= reportFrom && (q.dateISO || '') <= reportTo
      );
      lines.push(`Quotations in range: ${inRange.length}`);
      inRange.forEach((q) => {
        lines.push(`  ${q.id}  ${q.date}  ${q.total}  ${q.status}`);
      });
    } else if (kind === 'payments') {
      const inRange = receipts.filter(
        (r) =>
          (r.dateISO || '') >= reportFrom && (r.dateISO || '') <= reportTo
      );
      lines.push(`Receipts in range: ${inRange.length}`);
      inRange.forEach((r) => {
        lines.push(`  ${r.id}  ${r.date}  ${r.amount}  ${r.method || '—'}`);
      });
    } else {
      lines.push(`Outstanding balance: ${formatNgn(outstandingNgn)}`);
      outstandingLines.forEach((o) => {
        lines.push(
          `  ${o.id}  due ${o.due || '—'}  ${formatNgn(o.amountNgn)}${o.overdue ? '  OVERDUE' : ''}`
        );
      });
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zarewa-${customerId}-${kind}-${reportFrom}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Report file generated.');
    setShowReports(false);
  };

  if (!customer) {
    return (
      <PageShell>
        <PageHeader title="Customer" subtitle="Dashboard" />
        <MainPanel>
          <div className="z-empty-state max-w-md mx-auto">
            <p className="text-sm font-bold text-[#134e4a] mb-2">Customer not found</p>
            <p className="text-xs text-gray-500 mb-4">
              No profile matches <span className="font-mono">{customerId}</span>.
            </p>
            <Link
              to="/sales"
              state={{ focusSalesTab: 'customers' }}
              className="z-btn-primary inline-flex"
            >
              <ArrowLeft size={16} /> Back to customers
            </Link>
          </div>
        </MainPanel>
      </PageShell>
    );
  }

  const paymentRelationship =
    overdueCount > 0
      ? { label: 'Follow-up required', tone: 'danger' }
      : outstandingNgn > 0
        ? { label: 'Balance outstanding', tone: 'warn' }
        : { label: 'Up to date', tone: 'ok' };

  return (
    <PageShell blurred={showEdit || !!detail || showReports}>
      <PageHeader
        title={customer.name}
        subtitle={`${customer.customerID} · ${customer.tier} · ${customer.paymentTerms}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                navigate('/sales', { state: { focusSalesTab: 'customers' } })
              }
              className="z-btn-secondary"
            >
              <ArrowLeft size={16} /> All customers
            </button>
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              className="z-btn-primary"
            >
              <Pencil size={16} /> Edit profile
            </button>
          </div>
        }
      />

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
        <aside className="w-full lg:w-56 shrink-0 lg:sticky lg:top-24 space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-3 mb-2">
            On this page
          </p>
          {NAV.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => scrollToId(id)}
              className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-[#134e4a] hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-100 transition-all"
            >
              {icon}
              {label}
            </button>
          ))}
        </aside>

        <MainPanel className="flex-1 min-w-0 !pt-0">
          <header
            id="cd-overview"
            className="flex flex-col sm:flex-row sm:items-center gap-4 pb-6 border-b border-gray-100 mb-8"
          >
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#134e4a] text-xl font-black text-[#2dd4bf] shadow-inner">
              {customer.name
                .split(/\s+/)
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span
                  className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    customer.status === 'Active'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {customer.status}
                </span>
                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#134e4a]/10 text-[#134e4a]">
                  {customer.tier}
                </span>
                <span
                  className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    paymentRelationship.tone === 'ok'
                      ? 'bg-emerald-50 text-emerald-800'
                      : paymentRelationship.tone === 'warn'
                        ? 'bg-amber-50 text-amber-800'
                        : 'bg-red-50 text-red-800'
                  }`}
                >
                  {paymentRelationship.label}
                </span>
              </div>
              <p className="text-sm text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={14} className="text-gray-400" />
                  {customer.phoneNumber}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Mail size={14} className="text-gray-400" />
                  {customer.email}
                </span>
              </p>
              <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
                <span className="font-bold text-gray-400 uppercase tracking-wide">Account officer</span>{' '}
                <span className="font-bold text-[#134e4a]">{customer.createdBy || '—'}</span>
                {customer.createdAtISO ? (
                  <span className="text-gray-400"> · On file since {customer.createdAtISO}</span>
                ) : null}
                {customer.lastActivityISO ? (
                  <span className="block sm:inline sm:ml-0">
                    <span className="hidden sm:inline"> · </span>
                    Last activity {customer.lastActivityISO}
                  </span>
                ) : null}
              </p>
            </div>
          </header>

          {(customer.companyName ||
            customer.leadSource ||
            customer.preferredContact ||
            customer.followUpISO ||
            (customer.crmTags && customer.crmTags.length) ||
            customer.crmProfileNotes) ? (
            <section
              className="rounded-zarewa border border-[#134e4a]/15 bg-[#134e4a]/[0.03] p-5 mb-8"
              aria-label="CRM profile"
            >
              <p className="text-[10px] font-black text-[#134e4a] uppercase tracking-widest mb-3">
                CRM — customer profiling
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                {customer.companyName ? (
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Company</span>
                    <span className="font-semibold text-gray-800">{customer.companyName}</span>
                  </div>
                ) : null}
                {customer.leadSource ? (
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Lead source</span>
                    <span className="font-semibold text-gray-800">{customer.leadSource}</span>
                  </div>
                ) : null}
                {customer.preferredContact ? (
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Preferred contact</span>
                    <span className="font-semibold text-gray-800">{customer.preferredContact}</span>
                  </div>
                ) : null}
                {customer.followUpISO ? (
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Next follow-up</span>
                    <span className="font-semibold text-amber-900">{customer.followUpISO}</span>
                  </div>
                ) : null}
              </div>
              {customer.crmTags && customer.crmTags.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-4">
                  {customer.crmTags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-white border border-gray-200 text-[#134e4a]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              {customer.crmProfileNotes ? (
                <p className="text-xs text-gray-600 mt-4 leading-relaxed border-t border-gray-200/80 pt-4">
                  {customer.crmProfileNotes}
                </p>
              ) : null}
            </section>
          ) : null}

          {overdueCount > 0 ? (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50/80 px-4 py-3 text-sm text-red-900">
              <AlertTriangle className="shrink-0 mt-0.5" size={18} />
              <div>
                <p className="font-bold">{overdueCount} overdue invoice(s)</p>
                <p className="text-xs text-red-800/90 mt-0.5">
                  Review outstanding balances and send payment reminders from Sales →
                  Quotations.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/sales', { state: { focusSalesTab: 'quotations' } })}
                  className="mt-2 text-[10px] font-black uppercase text-red-800 underline-offset-2 hover:underline"
                >
                  Open sales workspace
                </button>
              </div>
            </div>
          ) : null}

          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
            <div className="rounded-zarewa border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Outstanding balance
              </p>
              <p className="text-2xl font-black text-[#134e4a] tabular-nums">
                {formatNgn(outstandingNgn)}
              </p>
              <p className="text-[9px] text-gray-500 mt-2 leading-snug">
                Ledger-aware (advances applied & new receipts reduce this).
              </p>
            </div>
            <div className="rounded-zarewa border border-amber-100 bg-amber-50/60 p-5 shadow-sm">
              <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest mb-2">
                Advance (deposit)
              </p>
              <p className="text-2xl font-black text-amber-950 tabular-nums">
                {formatNgn(advanceBalNgn)}
              </p>
              <p className="text-[9px] text-amber-900/75 mt-2 leading-snug">
                Not revenue — liability until applied or refunded.
              </p>
              {advanceBalNgn > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setRefundAdvanceAmt('');
                    setRefundAdvanceOpen(true);
                  }}
                  className="mt-3 text-[9px] font-bold uppercase text-amber-900 hover:underline"
                >
                  Refund advance
                </button>
              ) : null}
            </div>
            <div className="rounded-zarewa border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Total paid (receipts)
              </p>
              <p className="text-2xl font-black text-[#134e4a] tabular-nums">
                {formatNgn(totalPaidReceiptsNgn)}
              </p>
              <p className="text-[9px] text-gray-500 mt-2 leading-snug">
                Mock receipts + ledger receipts posted from Sales.
              </p>
            </div>
            <div className="rounded-zarewa border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Quotations
              </p>
              <p className="text-2xl font-black text-[#134e4a]">{quotations.length}</p>
              <p className="text-[10px] font-bold text-gray-500 mt-2">
                {pendingQuotationsCount} pending / unpaid
              </p>
            </div>
            <div className="rounded-zarewa border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Payment coverage
              </p>
              <p className="text-2xl font-black text-[#134e4a]">{paymentProgressPct}%</p>
              <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#134e4a] to-teal-400 transition-all"
                  style={{ width: `${paymentProgressPct}%` }}
                />
              </div>
              <p className="text-[9px] text-gray-500 mt-1.5">
                Share of invoice totals marked paid on file
              </p>
            </div>
          </section>

          <section className="mb-10 rounded-zarewa border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4 flex items-center gap-2">
              <BarChart3 size={16} />
              Sales trend (last 6 months)
            </h2>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cdSalesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#134e4a" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#134e4a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickFormatter={(v) => `₦${v}m`}
                  />
                  <Tooltip
                    formatter={(v) => [`₦${v}m`, 'Volume']}
                    labelFormatter={(l) => l}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amountM"
                    stroke="#134e4a"
                    strokeWidth={2}
                    fill="url(#cdSalesFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section id="cd-quotations" className="mb-10 scroll-mt-28">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest flex items-center gap-2">
                <FileText size={16} />
                Recent quotations
              </h2>
              <button
                type="button"
                onClick={() => navigate('/sales', { state: { focusSalesTab: 'quotations' } })}
                className="text-[10px] font-black uppercase text-[#134e4a] flex items-center gap-1 hover:underline"
              >
                Sales <ChevronRight size={14} />
              </button>
            </div>
            <div className="rounded-zarewa border border-gray-100 overflow-hidden bg-white shadow-sm">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                <div className="col-span-3">ID</div>
                <div className="col-span-2">Date</div>
                <div className="col-span-3 text-right">Total</div>
                <div className="col-span-4">Status</div>
              </div>
              {lastQuotations.length === 0 ? (
                <p className="p-8 text-center text-xs text-gray-400 font-bold uppercase tracking-widest">
                  No quotations yet
                </p>
              ) : (
                lastQuotations.map((q) => {
                  const st = quotationUiStatus(q);
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setDetail({ type: 'quotation', row: q })}
                      className="grid grid-cols-12 gap-2 w-full px-4 py-3 text-left border-t border-gray-50 hover:bg-teal-50/30 transition-colors items-center"
                    >
                      <div className="col-span-3 text-xs font-bold text-[#134e4a]">{q.id}</div>
                      <div className="col-span-2 text-xs text-gray-500">{q.date}</div>
                      <div className="col-span-3 text-right text-sm font-black text-[#134e4a]">
                        {q.total}
                      </div>
                      <div className="col-span-4">
                        <span
                          className={`text-[9px] font-bold uppercase px-2 py-1 rounded-full ${toneClass(st.tone)}`}
                        >
                          {st.label}
                        </span>
                      </div>
                      {q.handledBy ? (
                        <div className="col-span-12 text-[10px] text-gray-500 mt-1">
                          Handled by{' '}
                          <span className="font-semibold text-gray-700">{q.handledBy}</span>
                        </div>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section id="cd-cutting" className="mb-10 scroll-mt-28">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest flex items-center gap-2">
                <Scissors size={16} />
                Cutting lists
              </h2>
              <button
                type="button"
                onClick={() => navigate('/sales', { state: { focusSalesTab: 'cuttinglist' } })}
                className="text-[10px] font-black uppercase text-[#134e4a] flex items-center gap-1 hover:underline"
              >
                Sales <ChevronRight size={14} />
              </button>
            </div>
            <div className="rounded-zarewa border border-gray-100 overflow-hidden bg-white shadow-sm">
              {cuttingLists.length === 0 ? (
                <p className="p-8 text-center text-xs text-gray-400 font-bold uppercase tracking-widest">
                  No cutting lists
                </p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {cuttingLists
                    .slice()
                    .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || ''))
                    .map((cl) => (
                      <li key={cl.id}>
                        <button
                          type="button"
                          onClick={() => setDetail({ type: 'cutting', row: cl })}
                          className="w-full grid grid-cols-12 gap-2 px-4 py-3 text-left hover:bg-teal-50/30 transition-colors items-center"
                        >
                          <div className="col-span-3 text-xs font-bold text-[#134e4a]">{cl.id}</div>
                          <div className="col-span-3 text-xs text-gray-500">{cl.date}</div>
                          <div className="col-span-3 text-right text-sm font-black text-[#134e4a]">
                            {cl.total}
                          </div>
                          <div className="col-span-3">
                            <span className="text-[9px] font-bold uppercase px-2 py-1 rounded-full bg-sky-100 text-sky-800">
                              {cl.status}
                            </span>
                          </div>
                          {cl.handledBy ? (
                            <div className="col-span-12 text-[10px] text-gray-500">
                              By <span className="font-semibold">{cl.handledBy}</span>
                            </div>
                          ) : null}
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </section>

          <section id="cd-orders" className="mb-10 scroll-mt-28">
            <h2 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4 flex items-center gap-2">
              <Package size={16} />
              Recent orders
            </h2>
            <div className="rounded-zarewa border border-gray-100 overflow-hidden bg-white shadow-sm">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                <div className="col-span-2">Order</div>
                <div className="col-span-4">Products</div>
                <div className="col-span-2">Qty</div>
                <div className="col-span-2 text-right">Total</div>
                <div className="col-span-2">Status</div>
              </div>
              {lastOrders.length === 0 ? (
                <p className="p-8 text-center text-xs text-gray-400 font-bold uppercase tracking-widest">
                  No orders on file
                </p>
              ) : (
                lastOrders.map((o) => {
                  const qtySum = o.lines.reduce((s, l) => s + l.qty, 0);
                  const prodSummary = o.lines.map((l) => l.product).join('; ');
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setDetail({ type: 'order', row: o })}
                      className="grid grid-cols-12 gap-2 w-full px-4 py-3 text-left border-t border-gray-50 hover:bg-teal-50/30 transition-colors items-center"
                    >
                      <div className="col-span-2 text-xs font-bold text-[#134e4a]">{o.id}</div>
                      <div className="col-span-4 text-xs text-gray-600 line-clamp-2">
                        {prodSummary}
                      </div>
                      <div className="col-span-2 text-xs font-bold text-gray-700">{qtySum}</div>
                      <div className="col-span-2 text-right text-sm font-black text-[#134e4a]">
                        {formatNgn(o.totalNgn)}
                      </div>
                      <div className="col-span-2">
                        <span
                          className={`text-[9px] font-bold uppercase px-2 py-1 rounded-full ${orderStatusClass(o.status)}`}
                        >
                          {o.status}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section id="cd-financial" className="mb-10 scroll-mt-28">
            <h2 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4 flex items-center gap-2">
              <Wallet size={16} />
              Financial — receipts & outstanding
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-zarewa border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Payment history
                  </p>
                  <select
                    value={payWindow}
                    onChange={(e) => setPayWindow(e.target.value)}
                    className="text-[10px] font-bold uppercase border border-gray-100 rounded-lg py-1.5 px-2 bg-gray-50"
                  >
                    <option value="30">Last 30 days</option>
                    <option value="60">Last 60 days</option>
                    <option value="all">All</option>
                  </select>
                </div>
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredReceipts.length === 0 ? (
                    <li className="text-xs text-gray-400 py-4 text-center">No receipts in range</li>
                  ) : (
                    filteredReceipts.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setDetail({ type: 'receipt', row: r })}
                          className="w-full flex items-center justify-between gap-2 rounded-xl border border-gray-50 bg-gray-50/50 px-3 py-2 text-left hover:border-teal-100 hover:bg-white transition-all"
                        >
                          <div>
                            <p className="text-xs font-bold text-[#134e4a]">{r.id}</p>
                            <p className="text-[10px] text-gray-500">
                              {r.date} · {r.method || '—'}
                            </p>
                          </div>
                          <span className="text-sm font-black text-[#134e4a] shrink-0">
                            {r.amount}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div className="rounded-zarewa border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
                  Outstanding & due
                </p>
                {outstandingLines.length === 0 ? (
                  <div className="flex items-center gap-2 text-emerald-700 text-sm font-bold py-4">
                    <CheckCircle2 size={18} />
                    No open balances
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {outstandingLines.map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => goSalesQuotation(o.id)}
                          className="w-full flex items-center justify-between gap-2 rounded-xl border border-gray-50 px-3 py-2 text-left hover:bg-red-50/50 hover:border-red-100 transition-all"
                        >
                          <div>
                            <p className="text-xs font-bold text-[#134e4a]">{o.id}</p>
                            <p className="text-[10px] text-gray-500">
                              Due {o.due || '—'}
                              {o.overdue ? (
                                <span className="ml-2 text-red-600 font-bold">Overdue</span>
                              ) : null}
                            </p>
                          </div>
                          <span className="text-sm font-black text-[#134e4a]">
                            {formatNgn(o.amountNgn)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-zarewa border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                  Customer ledger (browser — audit trail)
                </p>
                {ledgerLines.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">
                    No ledger movements yet. Post advances or receipts from Sales.
                  </p>
                ) : (
                  <ul className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                    {ledgerLines.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-gray-50 bg-gray-50/50 px-3 py-2 text-left"
                      >
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-[#134e4a]">{ledgerTypeLabel(row.type)}</p>
                          <p className="text-[9px] text-gray-500 font-mono">
                            {(row.atISO || '').slice(0, 10)} · {row.quotationRef || '—'}
                          </p>
                          {row.note ? (
                            <p className="text-[9px] text-gray-600 mt-0.5 line-clamp-2">{row.note}</p>
                          ) : null}
                        </div>
                        <span className="text-sm font-black text-[#134e4a] tabular-nums shrink-0">
                          {formatNgn(row.amountNgn)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {refundsForCustomer.length > 0 ? (
            <section id="cd-refunds" className="mb-10 scroll-mt-28">
              <h2 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4 flex items-center gap-2">
                <RotateCcw size={16} />
                Refunds
              </h2>
              <ul className="space-y-2">
                {refundsForCustomer.map((r) => (
                  <li key={r.refundID}>
                    <button
                      type="button"
                      onClick={() => setDetail({ type: 'refund', row: r })}
                      className="w-full flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-left hover:border-rose-100 hover:bg-rose-50/20 transition-all"
                    >
                      <div>
                        <p className="text-xs font-mono font-bold text-[#134e4a]">{r.refundID}</p>
                        <p className="text-[10px] text-gray-500">{r.reasonCategory || r.reason}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-[#134e4a] tabular-nums">
                          {formatNgn(r.amountNgn)}
                        </p>
                        <p className="text-[9px] font-bold uppercase text-gray-400">{r.status}</p>
                        {(r.status === 'Approved' || r.status === 'Paid') && (
                          <p className="text-[9px] text-gray-500 tabular-nums">
                            Bal {formatNgn(refundOutstandingAmount(r))}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section id="cd-activity" className="mb-10 scroll-mt-28">
            <h2 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4 flex items-center gap-2">
              <ScrollText size={16} />
              Transactions, interactions & notes
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3 rounded-zarewa border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
                  Unified timeline
                </p>
                <ul className="space-y-4 border-l-2 border-gray-100 ml-2 pl-4">
                  {mergedTimeline.length === 0 ? (
                    <li className="text-xs text-gray-400">No activity logged</li>
                  ) : (
                    mergedTimeline.map((item, idx) => (
                      <li key={`${item.sort}-${item.source}-${idx}`} className="relative">
                        <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-[#134e4a] ring-4 ring-white" />
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          {item.sort.slice(0, 10)} · {item.kind}
                          {item.source === 'tx' ? ' · record' : ''}
                        </p>
                        <p className="text-sm font-bold text-[#134e4a]">{item.title}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{item.detail}</p>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div className="lg:col-span-2 rounded-zarewa border border-gray-100 bg-gray-50/50 p-5 shadow-sm">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <MessageSquarePlus size={14} />
                  Add staff note
                </p>
                <p className="text-[10px] text-gray-500 mb-3 leading-snug">
                  When signed in, notes are stored on the server for the whole sales team. Offline entries stay
                  on this browser only.
                </p>
                <form onSubmit={addNote} className="space-y-3">
                  <textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    rows={4}
                    placeholder="Preferences, complaints, follow-up reminders…"
                    className="w-full rounded-xl border border-gray-100 bg-white py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#134e4a]/15 resize-none"
                  />
                  <button type="submit" className="z-btn-primary w-full justify-center py-2.5 text-xs">
                    Save note
                  </button>
                </form>
              </div>
            </div>
          </section>

          <section id="cd-reports" className="scroll-mt-28">
            <h2 className="text-xs font-bold text-[#134e4a] uppercase tracking-widest mb-4 flex items-center gap-2">
              <Download size={16} />
              Reporting
            </h2>
            <div className="rounded-zarewa border border-dashed border-gray-200 bg-white/80 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-[#134e4a]">Customer activity reports</p>
                <p className="text-xs text-gray-500 mt-1">
                  Sales, payment history, and outstanding balances for a chosen period.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReports(true)}
                className="z-btn-secondary shrink-0"
              >
                Generate report…
              </button>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600">
              <div className="flex items-start gap-2">
                <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">
                    Shipping
                  </span>
                  {customer.addressShipping}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Building2 size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">
                    Billing
                  </span>
                  {customer.addressBilling}
                </div>
              </div>
              <div className="flex items-start gap-2 md:col-span-2">
                <BadgeCheck size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">
                    Payment terms
                  </span>
                  {customer.paymentTerms}
                </div>
              </div>
            </div>
          </section>
        </MainPanel>
      </div>

      <ModalFrame isOpen={showEdit} onClose={() => setShowEdit(false)}>
        <div className="z-modal-panel max-w-lg p-8 overflow-y-auto max-h-[90vh]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a] flex items-center gap-2">
              <User size={22} />
              Edit customer
            </h3>
            <button
              type="button"
              onClick={() => setShowEdit(false)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl hover:bg-red-50"
            >
              <X size={22} />
            </button>
          </div>
          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <label className="z-field-label">Full name *</label>
              <input
                required
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold text-[#134e4a] outline-none focus:ring-2 focus:ring-[#134e4a]/15"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="z-field-label">Phone *</label>
                <input
                  required
                  value={editForm.phoneNumber}
                  onChange={(e) => setEditForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-[#134e4a]/15"
                />
              </div>
              <div>
                <label className="z-field-label">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-[#134e4a]/15"
                />
              </div>
            </div>
            <div>
              <label className="z-field-label">Shipping address</label>
              <textarea
                rows={2}
                value={editForm.addressShipping}
                onChange={(e) => setEditForm((f) => ({ ...f, addressShipping: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-[#134e4a]/15 resize-none"
              />
            </div>
            <div>
              <label className="z-field-label">Billing address</label>
              <textarea
                rows={2}
                value={editForm.addressBilling}
                onChange={(e) => setEditForm((f) => ({ ...f, addressBilling: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-[#134e4a]/15 resize-none"
              />
            </div>
            <p className="text-[10px] font-bold text-[#134e4a] uppercase tracking-widest pt-2 border-t border-gray-100">
              CRM profiling (shared sales workspace)
            </p>
            <div>
              <label className="z-field-label">Company / trading name</label>
              <input
                value={editForm.companyName}
                onChange={(e) => setEditForm((f) => ({ ...f, companyName: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-[#134e4a]/15"
                placeholder="Optional legal or trading name"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="z-field-label">Lead source</label>
                <input
                  value={editForm.leadSource}
                  onChange={(e) => setEditForm((f) => ({ ...f, leadSource: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm outline-none focus:ring-2 focus:ring-[#134e4a]/15"
                  placeholder="e.g. Referral, Walk-in, WhatsApp ad"
                />
              </div>
              <div>
                <label className="z-field-label">Preferred contact</label>
                <select
                  value={editForm.preferredContact}
                  onChange={(e) => setEditForm((f) => ({ ...f, preferredContact: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-3 text-xs font-bold outline-none"
                >
                  <option value="Phone">Phone</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Email">Email</option>
                  <option value="Site visit">Site visit</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="z-field-label">Next follow-up date</label>
                <input
                  type="date"
                  value={editForm.followUpISO}
                  onChange={(e) => setEditForm((f) => ({ ...f, followUpISO: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm outline-none focus:ring-2 focus:ring-[#134e4a]/15"
                />
              </div>
              <div>
                <label className="z-field-label">Tags (comma-separated)</label>
                <input
                  value={editForm.crmTagsStr}
                  onChange={(e) => setEditForm((f) => ({ ...f, crmTagsStr: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm outline-none focus:ring-2 focus:ring-[#134e4a]/15"
                  placeholder="VIP, price sensitive, Kano"
                />
              </div>
            </div>
            <div>
              <label className="z-field-label">Profile notes (preferences, risks, history)</label>
              <textarea
                rows={3}
                value={editForm.crmProfileNotes}
                onChange={(e) => setEditForm((f) => ({ ...f, crmProfileNotes: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm outline-none focus:ring-2 focus:ring-[#134e4a]/15 resize-none"
                placeholder="Long-form context for anyone serving this account…"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="z-field-label">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-3 text-xs font-bold outline-none"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="z-field-label">Tier</label>
                <select
                  value={editForm.tier}
                  onChange={(e) => setEditForm((f) => ({ ...f, tier: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-3 text-xs font-bold outline-none"
                >
                  <option value="Regular">Regular</option>
                  <option value="VIP">VIP</option>
                  <option value="Wholesale">Wholesale</option>
                  <option value="Trade">Trade</option>
                </select>
              </div>
              <div>
                <label className="z-field-label">Terms</label>
                <select
                  value={editForm.paymentTerms}
                  onChange={(e) => setEditForm((f) => ({ ...f, paymentTerms: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-3 text-xs font-bold outline-none"
                >
                  <option value="Due on receipt">Due on receipt</option>
                  <option value="Net 14">Net 14</option>
                  <option value="Net 30">Net 30</option>
                  <option value="Net 60">Net 60</option>
                </select>
              </div>
            </div>
            <button type="submit" className="z-btn-primary w-full justify-center py-3 mt-2">
              Save changes
            </button>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={!!detail} onClose={() => setDetail(null)}>
        <div className="z-modal-panel max-w-md p-8">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-bold text-[#134e4a]">
              {detail?.type === 'quotation' && 'Quotation'}
              {detail?.type === 'order' && 'Order'}
              {detail?.type === 'receipt' && 'Receipt'}
              {detail?.type === 'cutting' && 'Cutting list'}
              {detail?.type === 'refund' && 'Refund'}
            </h3>
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl hover:bg-red-50"
            >
              <X size={22} />
            </button>
          </div>
          {detail?.type === 'quotation' && detail.row ? (
            <div className="space-y-3 text-sm">
              <p className="font-mono font-bold text-[#134e4a]">{detail.row.id}</p>
              <p className="text-gray-600">{detail.row.customer}</p>
              <p>
                <span className="text-gray-400 text-xs font-bold uppercase">Total</span>{' '}
                <span className="font-black">{detail.row.total}</span>
              </p>
              <p>
                <span className="text-gray-400 text-xs font-bold uppercase">Paid on file</span>{' '}
                {formatNgn(detail.row.paidNgn || 0)}
              </p>
              <p className="text-xs text-gray-500">{detail.row.customerFeedback || '—'}</p>
              {detail.row.handledBy ? (
                <p className="text-xs">
                  <span className="text-gray-400 font-bold uppercase">Handled by</span>{' '}
                  {detail.row.handledBy}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  goSalesQuotation(detail.row.id);
                  setDetail(null);
                }}
                className="z-btn-primary w-full justify-center mt-4"
              >
                Open in Sales
              </button>
            </div>
          ) : null}
          {detail?.type === 'order' && detail.row ? (
            <div className="space-y-3 text-sm">
              <p className="font-mono font-bold text-[#134e4a]">{detail.row.id}</p>
              <p className="text-xs text-gray-500">{detail.row.date}</p>
              <ul className="border border-gray-100 rounded-xl divide-y divide-gray-50">
                {detail.row.lines.map((l, i) => (
                  <li key={i} className="px-3 py-2 flex justify-between gap-2">
                    <span className="text-gray-700">{l.product}</span>
                    <span className="font-bold text-[#134e4a] shrink-0">
                      {l.qty} {l.unit}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="font-black text-[#134e4a]">{formatNgn(detail.row.totalNgn)}</p>
              <p className="text-xs">
                Linked quote:{' '}
                <button
                  type="button"
                  className="font-bold text-[#134e4a] underline"
                  onClick={() => {
                    goSalesQuotation(detail.row.quotationRef);
                    setDetail(null);
                  }}
                >
                  {detail.row.quotationRef}
                </button>
              </p>
            </div>
          ) : null}
          {detail?.type === 'receipt' && detail.row ? (
            <div className="space-y-3 text-sm">
              <p className="font-mono font-bold text-[#134e4a]">{detail.row.id}</p>
              <p>{detail.row.amount}</p>
              <p className="text-xs text-gray-500">
                {detail.row.date} · {detail.row.method || '—'}
              </p>
              <p className="text-xs">
                Quotation: {detail.row.quotationRef}
              </p>
              {detail.row.handledBy ? (
                <p className="text-xs text-gray-600">Recorded by {detail.row.handledBy}</p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  goSalesReceipt(detail.row.id);
                  setDetail(null);
                }}
                className="z-btn-primary w-full justify-center mt-4"
              >
                Open in Sales
              </button>
            </div>
          ) : null}
          {detail?.type === 'cutting' && detail.row ? (
            <div className="space-y-3 text-sm">
              <p className="font-mono font-bold text-[#134e4a]">{detail.row.id}</p>
              <p>
                <span className="text-gray-400 text-xs font-bold uppercase">Total length</span>{' '}
                <span className="font-black">{detail.row.total}</span>
              </p>
              <p className="text-xs text-gray-500">{detail.row.date}</p>
              {detail.row.quotationRef ? (
                <p className="text-xs">
                  Linked quote:{' '}
                  <button
                    type="button"
                    className="font-bold text-[#134e4a] underline"
                    onClick={() => {
                      goSalesQuotation(detail.row.quotationRef);
                      setDetail(null);
                    }}
                  >
                    {detail.row.quotationRef}
                  </button>
                </p>
              ) : null}
              {detail.row.handledBy ? (
                <p className="text-xs text-gray-600">Prepared by {detail.row.handledBy}</p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  navigate('/sales', { state: { focusSalesTab: 'cuttinglist' } });
                  setDetail(null);
                }}
                className="z-btn-primary w-full justify-center mt-4"
              >
                Open cutting lists in Sales
              </button>
            </div>
          ) : null}
          {detail?.type === 'refund' && detail.row ? (
            <div className="space-y-3 text-sm">
              <p className="font-mono font-bold text-[#134e4a]">{detail.row.refundID}</p>
              <p className="font-black text-[#134e4a]">{formatNgn(detail.row.amountNgn)}</p>
              {(detail.row.status === 'Approved' || detail.row.status === 'Paid') && (
                <p className="text-xs text-gray-500 tabular-nums">
                  Approved {formatNgn(refundApprovedAmount(detail.row))} · Balance {formatNgn(refundOutstandingAmount(detail.row))}
                </p>
              )}
              <p className="text-xs text-gray-600">{detail.row.reason}</p>
              <p className="text-[10px] text-gray-500">
                Status: {detail.row.status}
                {detail.row.requestedBy ? ` · Requested by ${detail.row.requestedBy}` : ''}
                {detail.row.approvedBy ? ` · Approved by ${detail.row.approvedBy}` : ''}
                {detail.row.paidBy ? ` · Paid by ${detail.row.paidBy}` : ''}
              </p>
              {Array.isArray(detail.row.calculationLines) && detail.row.calculationLines.length > 0 ? (
                <ul className="border border-gray-100 rounded-xl divide-y divide-gray-50 text-xs">
                  {detail.row.calculationLines.map((l, i) => (
                    <li key={i} className="px-3 py-2 flex justify-between gap-2">
                      <span className="text-gray-700">{l.label}</span>
                      <span className="font-bold text-[#134e4a] tabular-nums">
                        {formatNgn(l.amountNgn)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {detail.row.calculationNotes ? (
                <p className="text-xs text-gray-500">{detail.row.calculationNotes}</p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  goSalesRefund(detail.row.refundID);
                  setDetail(null);
                }}
                className="z-btn-primary w-full justify-center mt-4"
              >
                Open in Sales (Refunds)
              </button>
            </div>
          ) : null}
        </div>
      </ModalFrame>

      <ModalFrame isOpen={showReports} onClose={() => setShowReports(false)}>
        <div className="z-modal-panel max-w-md p-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-[#134e4a]">Generate report</h3>
            <button
              type="button"
              onClick={() => setShowReports(false)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl hover:bg-red-50"
            >
              <X size={22} />
            </button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="z-field-label">From</label>
                <input
                  type="date"
                  value={reportFrom}
                  onChange={(e) => setReportFrom(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-2.5 px-3 text-xs font-bold"
                />
              </div>
              <div>
                <label className="z-field-label">To</label>
                <input
                  type="date"
                  value={reportTo}
                  onChange={(e) => setReportTo(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-2.5 px-3 text-xs font-bold"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => downloadReport('sales')}
                className="z-btn-secondary w-full justify-center py-3"
              >
                Total sales (quotations)
              </button>
              <button
                type="button"
                onClick={() => downloadReport('payments')}
                className="z-btn-secondary w-full justify-center py-3"
              >
                Payment history
              </button>
              <button
                type="button"
                onClick={() => downloadReport('outstanding')}
                className="z-btn-secondary w-full justify-center py-3"
              >
                Outstanding & overdue
              </button>
            </div>
          </div>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={refundAdvanceOpen} onClose={() => setRefundAdvanceOpen(false)}>
        <form onSubmit={submitRefundAdvance} className="z-modal-panel max-w-sm p-6">
          <h3 className="text-base font-bold text-[#134e4a] mb-1">Refund advance</h3>
          <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
            Current advance balance {formatNgn(advanceBalNgn)}. Reduces cash or bank when you post the refund.
          </p>
          <label className="text-[9px] font-semibold text-slate-400 uppercase block mb-1">Amount (₦)</label>
          <input
            type="number"
            min="1"
            value={refundAdvanceAmt}
            onChange={(e) => setRefundAdvanceAmt(e.target.value)}
            className="w-full border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold tabular-nums mb-4"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setRefundAdvanceOpen(false)}
              className="px-3 py-2 text-[10px] font-semibold uppercase text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-amber-700 text-white px-4 py-2 text-[10px] font-semibold uppercase"
            >
              Post refund
            </button>
          </div>
        </form>
      </ModalFrame>
    </PageShell>
  );
};

export default CustomerDashboard;
