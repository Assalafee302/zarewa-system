import React, { useEffect, useState, useMemo, useRef, useCallback, Fragment } from 'react';
import {
  ShieldCheck,
  History,
  CheckCircle2,
  Flag,
  RotateCcw,
  Search,
  ChevronRight,
  DollarSign,
  Zap,
  RefreshCw,
  BarChart3,
  Plus,
  FileText,
  Factory,
  LayoutDashboard,
  AlertTriangle,
  Radio,
  ClipboardList,
  Printer,
  Paperclip,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, apiUrl } from '../lib/apiBase';
import { printExpenseRequestRecord } from '../lib/expenseRequestPrint';
import { useWorkspace } from '../context/WorkspaceContext';
import { useInventory } from '../context/InventoryContext';
import { useToast } from '../context/ToastContext';
import { formatNgn } from '../Data/mockData';
import {
  buildManagementQueuesFromSnapshot,
  buildManagerSnapshotsFromWorkspace,
  MANAGER_METRIC_PERIODS,
  managementPeriodStartISO,
} from '../lib/managementLiveFromWorkspace';
import { Card, Button } from '../components/ui';
import { ModalFrame, PageShell, PageHeader } from '../components/layout';
import { DashboardKpiStrip } from '../components/dashboard/DashboardKpiStrip';

const INBOX_TABS = [
  { key: 'clearance', label: 'Clearance', description: 'Paid quotes awaiting manager clearance' },
  { key: 'production', label: 'Production gate', description: 'Draft cutting lists under 70% paid' },
  { key: 'conversions', label: 'Conversion review', description: 'High / low conversion or jobs awaiting manager sign-off' },
  { key: 'flagged', label: 'Flagged', description: 'Quotations marked for audit' },
  { key: 'refunds', label: 'Refunds', description: 'Pending refund requests' },
  { key: 'payments', label: 'Payment requests', description: 'Expense / payment approvals' },
];

function formatRefundReasonCategory(raw) {
  if (raw == null || raw === '') return '—';
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(arr)) return arr.filter(Boolean).join(', ') || '—';
  } catch {
    /* stored as plain text */
  }
  return String(raw).trim() || '—';
}

function flattenQuotationLineItems(quotation) {
  const ql = quotation?.quotationLines;
  if (!ql || typeof ql !== 'object') return [];
  const out = [];
  for (const cat of ['products', 'accessories', 'services']) {
    const arr = ql[cat];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const name = item.name || item.label || item.description || 'Line';
      const qty = item.qty ?? item.quantity ?? item.qtyMeters ?? '';
      const unit = item.unit || item.uom || '';
      const unitPrice = item.unitPrice ?? item.unit_price_ngn ?? item.price ?? '';
      const lineTotal = item.lineTotal ?? item.line_total_ngn ?? item.total ?? '';
      out.push({ category: cat, name, qty, unit, unitPrice, lineTotal });
    }
  }
  return out;
}

function ledgerTypeStyle(type) {
  const t = String(type || '').toUpperCase();
  if (t === 'RECEIPT' || t === 'ADVANCE_IN' || t === 'OVERPAY_ADVANCE') return 'bg-emerald-500/20 text-emerald-200';
  if (t.includes('REVERSAL') || t.includes('REFUND') || t.includes('OUT')) return 'bg-rose-500/20 text-rose-200';
  if (t.includes('APPLIED')) return 'bg-sky-500/20 text-sky-200';
  return 'bg-white/10 text-white/70';
}

/** Shared rich audit body for quotation-linked management intel (orders, ledger, production, conversion, refunds). */
function ManagementAuditSections({ auditData, loadingAudit, formatNgn }) {
  if (loadingAudit) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="text-teal-400 animate-spin" size={28} />
      </div>
    );
  }
  if (!auditData || auditData.ok === false) {
    return (
      <p className="text-xs text-rose-300/90">
        {auditData?.error || 'Could not load quotation audit.'}
      </p>
    );
  }

  const sum = auditData.summary;
  const lines = flattenQuotationLineItems(auditData.quotation);
  const ledger = Array.isArray(auditData.ledgerEntries) ? auditData.ledgerEntries : [];
  const refunds = Array.isArray(auditData.refunds) ? auditData.refunds : [];
  const totals = auditData.totals || {};
  const checks = Array.isArray(auditData.conversionChecks) ? auditData.conversionChecks : [];
  const coils = Array.isArray(auditData.jobCoils) ? auditData.jobCoils : [];

  const checksByJob = new Map();
  for (const c of checks) {
    const jid = String(c.job_id || '');
    if (!jid) continue;
    if (!checksByJob.has(jid)) checksByJob.set(jid, []);
    checksByJob.get(jid).push(c);
  }
  const coilsByJob = new Map();
  for (const c of coils) {
    const jid = String(c.job_id || '');
    if (!jid) continue;
    if (!coilsByJob.has(jid)) coilsByJob.set(jid, []);
    coilsByJob.get(jid).push(c);
  }

  const cuttingLists = Array.isArray(auditData.cuttingLists) ? auditData.cuttingLists : [];
  const productionLogs = Array.isArray(auditData.productionLogs) ? auditData.productionLogs : [];

  return (
    <Fragment>
      {sum ? (
        <section>
          <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Order &amp; balance</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-white/[0.07] border border-white/10 p-3">
              <p className="text-[9px] font-bold uppercase text-white/35">Order total</p>
              <p className="text-sm font-black text-white tabular-nums mt-1">{formatNgn(sum.orderTotalNgn)}</p>
            </div>
            <div className="rounded-xl bg-white/[0.07] border border-white/10 p-3">
              <p className="text-[9px] font-bold uppercase text-white/35">Paid in</p>
              <p className="text-sm font-black text-emerald-300 tabular-nums mt-1">{formatNgn(sum.paidNgn)}</p>
              {sum.percentPaid != null ? (
                <p className="text-[9px] text-white/40 mt-1 tabular-nums">{sum.percentPaid}% of order</p>
              ) : null}
            </div>
            <div className="rounded-xl bg-white/[0.07] border border-amber-500/20 p-3">
              <p className="text-[9px] font-bold uppercase text-white/35">Outstanding</p>
              <p className="text-sm font-black text-amber-200 tabular-nums mt-1">{formatNgn(sum.outstandingNgn)}</p>
            </div>
          </div>
          {(sum.managerClearedAtIso || sum.managerFlaggedAtIso || sum.managerProductionApprovedAtIso) && (
            <div className="mt-2 flex flex-wrap gap-2 text-[9px] text-white/40">
              {sum.managerClearedAtIso ? <span>Cleared {sum.managerClearedAtIso.slice(0, 10)}</span> : null}
              {sum.managerProductionApprovedAtIso ? (
                <span>Prod override {sum.managerProductionApprovedAtIso.slice(0, 10)}</span>
              ) : null}
              {sum.managerFlaggedAtIso ? (
                <span className="text-rose-300/90">Flagged {sum.managerFlaggedAtIso.slice(0, 10)}</span>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {auditData.quotation?.projectName ? (
        <p className="text-[11px] text-white/50">
          <span className="font-bold text-white/70">Project:</span> {auditData.quotation.projectName}
        </p>
      ) : null}

      <section>
        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Order lines</p>
        {lines.length === 0 ? (
          <p className="text-xs text-white/35 py-2">No structured line items on file (check Sales for full quote).</p>
        ) : (
          <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/10">
            {lines.map((ln, idx) => (
              <div key={`${ln.category}-${idx}`} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-[11px]">
                <div className="min-w-0">
                  <span className="text-[8px] font-black uppercase text-white/30 mr-2">{ln.category}</span>
                  <span className="font-semibold text-white">{ln.name}</span>
                  <span className="text-white/45 ml-1">
                    {ln.qty !== '' && ln.qty != null ? `${ln.qty}${ln.unit ? ` ${ln.unit}` : ''}` : ''}
                  </span>
                </div>
                <div className="text-right tabular-nums text-white/80 shrink-0">
                  {ln.lineTotal !== '' && ln.lineTotal != null
                    ? formatNgn(ln.lineTotal)
                    : ln.unitPrice
                      ? `@ ${formatNgn(ln.unitPrice)}`
                      : '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">
          Ledger &amp; payments ({ledger.length})
        </p>
        <div className="space-y-2 max-h-[min(40vh,280px)] overflow-y-auto custom-scrollbar pr-1">
          {ledger.length === 0 ? (
            <p className="text-xs text-white/35 py-2">No ledger rows for this quotation.</p>
          ) : (
            ledger.map((e, idx) => (
              <div key={e.id || idx} className="flex gap-3 p-3 rounded-xl bg-white/[0.06] border border-white/10">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${ledgerTypeStyle(e.type)}`}>
                      {e.type || '—'}
                    </span>
                    <p className="text-sm font-black text-white tabular-nums">{formatNgn(e.amount_ngn)}</p>
                  </div>
                  <p className="text-[10px] text-white/45 mt-1">{e.payment_method || e.purpose || '—'}</p>
                  {e.bank_reference ? (
                    <p className="text-[9px] text-white/30 mt-0.5 font-mono">Ref: {e.bank_reference}</p>
                  ) : null}
                  {e.note ? <p className="text-[9px] text-white/35 mt-1 leading-snug">{e.note}</p> : null}
                  <p className="text-[9px] text-white/25 mt-1">
                    {e.at_iso?.slice(0, 16)?.replace('T', ' ')} · {e.created_by_name || '—'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {refunds.length ? (
        <section>
          <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Refunds on this quote</p>
          <div className="space-y-2">
            {refunds.map((r) => (
              <div key={r.refund_id} className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px]">
                <div className="flex justify-between gap-2">
                  <span className="font-mono font-bold text-amber-100">{r.refund_id}</span>
                  <span className="font-black text-amber-200 tabular-nums">{formatNgn(r.amount_ngn)}</span>
                </div>
                <p className="text-white/60 mt-1">
                  {r.status} · {r.product || '—'}
                </p>
                <p className="text-[10px] text-white/40 mt-1">{r.requested_at_iso?.slice(0, 16)?.replace('T', ' ')}</p>
                {r.reason ? <p className="text-[10px] text-white/45 mt-2 leading-snug">{r.reason}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <p className="text-[10px] font-black text-teal-300/90 uppercase tracking-widest mb-2">Meters &amp; production totals</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="rounded-xl bg-teal-500/10 border border-teal-500/20 p-3">
            <p className="text-[9px] font-bold uppercase text-teal-200/80">Cutting lists (planned)</p>
            <p className="text-lg font-black text-white tabular-nums mt-1">
              {Number(totals.cuttingListMetersSum || 0).toLocaleString()} m
            </p>
          </div>
          <div className="rounded-xl bg-teal-500/10 border border-teal-500/20 p-3">
            <p className="text-[9px] font-bold uppercase text-teal-200/80">Produced (completed jobs)</p>
            <p className="text-lg font-black text-white tabular-nums mt-1">
              {Number(totals.completedProductionMetersSum || 0).toLocaleString()} m
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3">
            <p className="text-[9px] font-bold uppercase text-white/35">All job actuals</p>
            <p className="text-lg font-black text-white/90 tabular-nums mt-1">
              {Number(totals.productionJobsMetersSum || 0).toLocaleString()} m
            </p>
          </div>
        </div>
      </section>

      <section>
        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Cutting lists</p>
        <div className="space-y-2">
          {!cuttingLists.length ? (
            <p className="text-xs text-white/35 py-2">None linked.</p>
          ) : (
            cuttingLists.map((cl, idx) => (
              <div key={cl.id || idx} className="p-3 rounded-xl bg-white/[0.06] border border-white/10">
                <div className="flex justify-between items-start gap-2 mb-1">
                  <span
                    className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${
                      cl.status === 'Draft' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    {cl.status}
                  </span>
                  <span className="text-[9px] text-white/35">{cl.date_iso}</span>
                </div>
                <p className="text-xs font-bold text-white">{cl.id}</p>
                <p className="text-[10px] text-white/40 mt-1 tabular-nums">{Number(cl.total_meters || 0).toLocaleString()} m</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Production &amp; conversion</p>
        <div className="space-y-3">
          {!productionLogs.length ? (
            <p className="text-xs text-white/35 py-2">No production jobs for this quotation.</p>
          ) : (
            productionLogs.map((job, idx) => {
              const jid = String(job.job_id || idx);
              const jobChecks = checksByJob.get(job.job_id) || [];
              const jobCoilRows = coilsByJob.get(job.job_id) || [];
              return (
                <div key={job.job_id || idx} className="rounded-xl border border-white/10 bg-white/[0.05] overflow-hidden">
                  <div className="p-3 border-b border-white/10">
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="text-xs font-black text-white font-mono">{job.job_id}</p>
                      <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-white/10 text-white/70">
                        {job.status}
                      </span>
                    </div>
                    <p className="text-[11px] font-bold text-white/90 mt-1">{job.product_name || '—'}</p>
                    <p className="text-[10px] text-white/40 mt-1">
                      List {job.cutting_list_id || '—'} · {job.machine_name || '—'}
                    </p>
                    <div className="flex flex-wrap gap-3 mt-2 text-[10px] tabular-nums text-white/70">
                      <span>Planned {Number(job.planned_meters || 0).toLocaleString()} m</span>
                      <span>Actual {Number(job.actual_meters || 0).toLocaleString()} m</span>
                      <span>{Number(job.actual_weight_kg || 0).toLocaleString()} kg</span>
                    </div>
                    <p className="text-[9px] text-violet-300/90 mt-2">
                      Conversion alert: {job.conversion_alert_state || '—'}
                      {job.manager_review_required ? ' · manager review' : ''}
                    </p>
                    {job.completed_at_iso ? (
                      <p className="text-[9px] text-white/30 mt-1">Done {job.completed_at_iso.slice(0, 16).replace('T', ' ')}</p>
                    ) : null}
                    {job.manager_review_signed_at_iso ? (
                      <p className="text-[9px] text-emerald-300/80 mt-1">
                        Signed off {job.manager_review_signed_at_iso.slice(0, 10)}
                      </p>
                    ) : null}
                  </div>
                  {jobCoilRows.length ? (
                    <div className="px-3 py-2 border-b border-white/5 bg-black/20">
                      <p className="text-[9px] font-black uppercase text-white/35 mb-1">Coils / meters</p>
                      <ul className="space-y-1 text-[10px] text-white/60">
                        {jobCoilRows.map((co) => (
                          <li key={`${jid}-${co.coil_no}`} className="flex justify-between gap-2">
                            <span className="font-mono truncate">{co.coil_no}</span>
                            <span className="tabular-nums shrink-0">{Number(co.meters_produced || 0).toLocaleString()} m</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {jobChecks.length ? (
                    <div className="px-3 py-2 bg-black/25">
                      <p className="text-[9px] font-black uppercase text-white/35 mb-1">Conversion checks</p>
                      <ul className="space-y-1.5 text-[10px]">
                        {jobChecks.map((ch, i) => (
                          <li key={`${ch.job_id}-${ch.coil_no}-${i}`} className="text-white/55">
                            <span className="font-mono text-white/70">{ch.coil_no}</span> · {ch.alert_state} · actual{' '}
                            {ch.actual_conversion_kg_per_m != null ? Number(ch.actual_conversion_kg_per_m).toFixed(3) : '—'} kg/m
                            {ch.standard_conversion_kg_per_m != null
                              ? ` · std ${Number(ch.standard_conversion_kg_per_m).toFixed(3)}`
                              : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </section>
    </Fragment>
  );
}

function matchesInboxSearch(query, row, tabKey) {
  const s = query.trim().toLowerCase();
  if (!s) return true;
  const parts = [];
  if (tabKey === 'clearance' || tabKey === 'flagged') {
    parts.push(row.id, row.customer_name, row.status);
  } else if (tabKey === 'production') {
    parts.push(row.id, row.quotation_ref, row.customer_name);
  } else if (tabKey === 'refunds') {
    parts.push(row.refund_id, row.customer_name, row.quotation_ref, formatRefundReasonCategory(row.reason_category));
  } else if (tabKey === 'payments') {
    parts.push(
      row.request_id,
      row.description,
      row.expense_id,
      row.request_reference,
      row.attachment_name,
      row.expense_category
    );
  } else if (tabKey === 'conversions') {
    parts.push(
      row.job_id,
      row.quotation_ref,
      row.cutting_list_id,
      row.customer_name,
      row.product_name,
      row.conversion_alert_state
    );
  }
  return parts.some((p) => String(p ?? '').toLowerCase().includes(s));
}

const DEFAULT_MANAGER_TARGETS = { nairaTarget: 50000000, meterTarget: 250000 };

function ymdLocal(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

const ManagerDashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const quoteDeepLinked = useRef('');
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [items, setItems] = useState({
    pendingClearance: [],
    flagged: [],
    productionOverrides: [],
    pendingRefunds: [],
    pendingExpenses: [],
    pendingConversionReviews: [],
  });
  /** @type {[null | { kind: string; quoteId?: string; refundId?: string; requestId?: string; jobId?: string; row: object; cuttingListId?: string; fromProductionGate?: boolean }, Function]} */
  const [selectedIntel, setSelectedIntel] = useState(null);
  const [auditData, setAuditData] = useState(null);
  const [refundIntelExtras, setRefundIntelExtras] = useState(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [loadingRefundIntel, setLoadingRefundIntel] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [inboxSearch, setInboxSearch] = useState('');
  const [activeTab, setActiveTab] = useState('clearance');
  const [showStockRequest, setShowStockRequest] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attDayIso, setAttDayIso] = useState(() => ymdLocal());
  const [attBranchId, setAttBranchId] = useState('');
  const [attStaffList, setAttStaffList] = useState([]);
  const [attStatusByUser, setAttStatusByUser] = useState({});
  const [attNotes, setAttNotes] = useState('');
  const [attLoadError, setAttLoadError] = useState(null);
  const [attLoading, setAttLoading] = useState(false);
  const [attSaving, setAttSaving] = useState(false);
  /** @type {['month' | '4months' | 'half' | 'year', Function]} */
  const [metricPeriod, setMetricPeriod] = useState('month');

  const { products: invProducts } = useInventory();
  const liveLowStockCount = useMemo(
    () => invProducts.filter((p) => p.stockLevel < p.lowStockThreshold).length,
    [invProducts]
  );

  const workspaceQuotations = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws.snapshot?.quotations) ? ws.snapshot.quotations : [],
    [ws?.hasWorkspaceData, ws?.snapshot?.quotations]
  );
  const workspaceCuttingLists = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws.snapshot?.cuttingLists) ? ws.snapshot.cuttingLists : [],
    [ws?.hasWorkspaceData, ws?.snapshot?.cuttingLists]
  );

  const displayItems = useMemo(() => {
    if (ws?.hasWorkspaceData && ws.snapshot) {
      return buildManagementQueuesFromSnapshot(ws.snapshot);
    }
    return items;
  }, [ws?.hasWorkspaceData, ws.snapshot, items]);

  const displaySnapshots = useMemo(() => {
    const periodMeta = MANAGER_METRIC_PERIODS.find((p) => p.key === metricPeriod);
    const monthsSpan = periodMeta?.monthsSpan ?? 1;
    const scaledTargets = {
      nairaTarget: DEFAULT_MANAGER_TARGETS.nairaTarget * monthsSpan,
      meterTarget: DEFAULT_MANAGER_TARGETS.meterTarget * monthsSpan,
    };
    if (!ws?.hasWorkspaceData || !ws.snapshot) {
      return {
        revenue: 0,
        quoteCount: 0,
        lowStockCount: liveLowStockCount,
        metersProduced: 0,
        topByRevenue: [],
        periodKey: metricPeriod,
        periodLabel: periodMeta?.label ?? 'This month',
        targets: scaledTargets,
      };
    }
    return buildManagerSnapshotsFromWorkspace(
      workspaceQuotations,
      workspaceCuttingLists,
      liveLowStockCount,
      DEFAULT_MANAGER_TARGETS,
      metricPeriod
    );
  }, [
    ws?.hasWorkspaceData,
    ws.snapshot,
    workspaceQuotations,
    workspaceCuttingLists,
    liveLowStockCount,
    metricPeriod,
  ]);

  const fetchData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const itemsRes = await apiFetch('/api/management/items');

      const itemsOk =
        itemsRes.ok &&
        itemsRes.data &&
        Array.isArray(itemsRes.data.pendingClearance) &&
        itemsRes.data.ok !== false;
      if (itemsOk) {
        const d = itemsRes.data;
        setItems({
          pendingClearance: d.pendingClearance ?? [],
          flagged: d.flagged ?? [],
          productionOverrides: d.productionOverrides ?? [],
          pendingRefunds: d.pendingRefunds ?? [],
          pendingExpenses: d.pendingExpenses ?? [],
          pendingConversionReviews: d.pendingConversionReviews ?? [],
        });
      } else {
        const msg =
          itemsRes.data?.error ||
          (itemsRes.status === 403
            ? 'You need audit access, refund approval, or sales / quotation management rights to load this dashboard.'
            : itemsRes.status === 401
              ? 'Sign in again to load management data.'
              : `Management lists could not be loaded (${itemsRes.status}).`);
        setLoadError(msg);
      }

    } finally {
      setLoading(false);
    }
  };

  const handleRefreshAll = async () => {
    await fetchData();
    await (ws.refresh?.() ?? Promise.resolve());
  };

  const openAttendanceModal = useCallback(() => {
    const branches = ws?.session?.branches ?? [];
    if (branches.length === 0) {
      showToast('Choose a branch in the workspace bar first.', { variant: 'error' });
      return;
    }
    const bid = String(ws?.session?.currentBranchId || branches[0]?.id || '').trim();
    setAttBranchId(bid);
    setAttDayIso(ymdLocal());
    setAttNotes('');
    setAttLoadError(null);
    setShowAttendanceModal(true);
  }, [ws?.session?.branches, ws?.session?.currentBranchId, showToast]);

  useEffect(() => {
    if (!showAttendanceModal || !attBranchId) return;
    let cancelled = false;
    (async () => {
      setAttLoading(true);
      setAttLoadError(null);
      const staffRes = await apiFetch('/api/hr/staff');
      if (cancelled) return;
      if (!staffRes.ok || !staffRes.data?.ok) {
        setAttStaffList([]);
        setAttStatusByUser({});
        setAttLoadError(staffRes.data?.error || 'Could not load staff for your role.');
        setAttLoading(false);
        return;
      }
      const all = Array.isArray(staffRes.data.staff) ? staffRes.data.staff : [];
      const inBranch = all.filter((s) => String(s.branchId || '') === String(attBranchId));
      setAttStaffList(inBranch);
      const rollRes = await apiFetch(
        `/api/hr/daily-roll?branchId=${encodeURIComponent(attBranchId)}&dayIso=${encodeURIComponent(attDayIso)}`
      );
      if (cancelled) return;
      const fromRoll =
        rollRes.ok && rollRes.data?.ok && rollRes.data.roll?.rows?.length
          ? Object.fromEntries(
              rollRes.data.roll.rows.map((r) => [
                String(r.userId),
                String(r.status || '').toLowerCase() === 'late' ? 'late' : 'present',
              ])
            )
          : {};
      const next = {};
      for (const s of inBranch) {
        const id = String(s.userId);
        next[id] = fromRoll[id] || 'present';
      }
      setAttStatusByUser(next);
      setAttLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [showAttendanceModal, attBranchId, attDayIso]);

  const saveAttendanceRoll = async (e) => {
    e?.preventDefault?.();
    if (!attBranchId || attStaffList.length === 0) return;
    setAttSaving(true);
    const rows = attStaffList.map((s) => ({
      userId: String(s.userId),
      status: attStatusByUser[String(s.userId)] === 'late' ? 'late' : 'present',
    }));
    const { ok, data } = await apiFetch('/api/hr/daily-roll', {
      method: 'POST',
      body: JSON.stringify({
        branchId: attBranchId,
        dayIso: attDayIso,
        rows,
        notes: attNotes.trim() || undefined,
      }),
    });
    setAttSaving(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not save attendance.', { variant: 'error' });
      return;
    }
    showToast('Attendance saved for this day.');
    setShowAttendanceModal(false);
  };

  useEffect(() => {
    fetchData();
  }, [ws?.refreshEpoch]);

  const fetchAudit = useCallback(async (quoteId) => {
    if (!quoteId) return;
    setLoadingAudit(true);
    const { ok, data } = await apiFetch(
      `/api/management/quotation-audit?quotationRef=${encodeURIComponent(quoteId)}`
    );
    if (ok && data) setAuditData(data);
    else setAuditData({ ok: false, error: data?.error || 'Could not load quotation audit.' });
    setLoadingAudit(false);
  }, []);

  /** Deep link: ?quoteRef= from Sales (cutting list, etc.) */
  useEffect(() => {
    const ref = (searchParams.get('quoteRef') || '').trim();
    if (!ref || loading) return;
    if (quoteDeepLinked.current === ref) return;
    quoteDeepLinked.current = ref;

    const fromClearance = displayItems.pendingClearance.find((q) => q.id === ref);
    const fromFlagged = displayItems.flagged.find((q) => q.id === ref);
    const fromProd = displayItems.productionOverrides.find((o) => o.quotation_ref === ref);
    setRefundIntelExtras(null);
    const row = fromClearance || fromFlagged;
    if (row) {
      setSelectedIntel({ kind: 'quotation', quoteId: ref, row: { ...row } });
    } else if (fromProd) {
      setSelectedIntel({
        kind: 'quotation',
        quoteId: ref,
        row: { id: ref, customer_name: fromProd.customer_name },
        cuttingListId: fromProd.id,
        fromProductionGate: true,
      });
    } else {
      setSelectedIntel({ kind: 'quotation', quoteId: ref, row: { id: ref, customer_name: '' } });
    }
    fetchAudit(ref);
    setActiveTab(fromProd ? 'production' : fromClearance ? 'clearance' : fromFlagged ? 'flagged' : 'clearance');
  }, [
    loading,
    searchParams,
    displayItems.pendingClearance,
    displayItems.flagged,
    displayItems.productionOverrides,
    fetchAudit,
  ]);

  /** If URL opened before queues loaded, merge customer row when data arrives. */
  useEffect(() => {
    if (selectedIntel?.kind !== 'quotation') return;
    const ref = selectedIntel.quoteId;
    if (!ref || String(selectedIntel.row?.customer_name || '').trim()) return;
    const row =
      displayItems.pendingClearance.find((q) => q.id === ref) || displayItems.flagged.find((q) => q.id === ref);
    const po = displayItems.productionOverrides.find((o) => o.quotation_ref === ref);
    if (row)
      setSelectedIntel((prev) =>
        prev?.kind === 'quotation' && prev.quoteId === ref ? { ...prev, row: { ...prev.row, ...row } } : prev
      );
    else if (po)
      setSelectedIntel((prev) =>
        prev?.kind === 'quotation' && prev.quoteId === ref
          ? {
              ...prev,
              row: { ...prev.row, customer_name: po.customer_name },
              cuttingListId: po.id,
              fromProductionGate: true,
            }
          : prev
      );
  }, [
    displayItems.pendingClearance,
    displayItems.flagged,
    displayItems.productionOverrides,
    selectedIntel?.kind,
    selectedIntel?.quoteId,
    selectedIntel?.row?.customer_name,
  ]);

  useEffect(() => {
    if (selectedIntel?.kind !== 'refund') {
      setRefundIntelExtras(null);
      setLoadingRefundIntel(false);
      return;
    }
    const qref = String(selectedIntel.row?.quotation_ref || '').trim();
    if (!qref) {
      setRefundIntelExtras(null);
      setLoadingRefundIntel(false);
      setAuditData(null);
      return;
    }
    void fetchAudit(qref);
    let cancelled = false;
    setLoadingRefundIntel(true);
    (async () => {
      const { ok, data } = await apiFetch(`/api/refunds/intelligence?quotationRef=${encodeURIComponent(qref)}`);
      if (cancelled) return;
      setLoadingRefundIntel(false);
      if (ok && data && data.ok !== false) setRefundIntelExtras(data);
      else setRefundIntelExtras(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedIntel, fetchAudit]);

  useEffect(() => {
    if (selectedIntel?.kind !== 'conversion') return;
    const qref = String(selectedIntel.row?.quotation_ref || '').trim();
    if (!qref) {
      setAuditData(null);
      return;
    }
    void fetchAudit(qref);
  }, [selectedIntel?.kind, selectedIntel?.row?.quotation_ref, selectedIntel?.jobId, fetchAudit]);

  const tabCounts = useMemo(
    () => ({
      clearance: displayItems.pendingClearance.length,
      production: displayItems.productionOverrides.length,
      conversions: (displayItems.pendingConversionReviews ?? []).length,
      flagged: displayItems.flagged.length,
      refunds: displayItems.pendingRefunds.length,
      payments: displayItems.pendingExpenses.length,
    }),
    [displayItems]
  );

  const totalOpenActions = useMemo(
    () =>
      tabCounts.clearance +
      tabCounts.production +
      tabCounts.conversions +
      tabCounts.flagged +
      tabCounts.refunds +
      tabCounts.payments,
    [tabCounts]
  );

  const filteredInboxRows = useMemo(() => {
    let list = [];
    if (activeTab === 'clearance') list = displayItems.pendingClearance;
    else if (activeTab === 'production') list = displayItems.productionOverrides;
    else if (activeTab === 'flagged') list = displayItems.flagged;
    else if (activeTab === 'refunds') list = displayItems.pendingRefunds;
    else if (activeTab === 'payments') list = displayItems.pendingExpenses;
    else if (activeTab === 'conversions') list = displayItems.pendingConversionReviews ?? [];
    return list.filter((row) => matchesInboxSearch(inboxSearch, row, activeTab));
  }, [activeTab, displayItems, inboxSearch]);

  const revenueProgress =
    displaySnapshots.targets?.nairaTarget > 0
      ? Math.min(100, Math.round((displaySnapshots.revenue / displaySnapshots.targets.nairaTarget) * 100))
      : 0;
  const metersProgress =
    displaySnapshots.targets?.meterTarget > 0
      ? Math.min(100, Math.round((displaySnapshots.metersProduced / displaySnapshots.targets.meterTarget) * 100))
      : 0;

  const openQuotationIntel = useCallback(
    (quotationId, row, extra = {}) => {
      if (!quotationId) return;
      const baseRow = row ? { ...row } : { id: quotationId, customer_name: '' };
      setRefundIntelExtras(null);
      setSelectedIntel({
        kind: 'quotation',
        quoteId: quotationId,
        row: baseRow,
        ...extra,
      });
      fetchAudit(quotationId);
    },
    [fetchAudit]
  );

  const handleReview = async (quotationId, decision, reason = '') => {
    if (!quotationId) return;
    setDecisionBusy(true);
    const { ok, data } = await apiFetch('/api/management/review', {
      method: 'POST',
      body: JSON.stringify({ quotationId, decision, reason }),
    });
    setDecisionBusy(false);
    if (!ok || data?.ok === false) {
      showToast(data?.error || 'Could not apply manager decision.', { variant: 'error' });
      return;
    }
    const labels = {
      clear: 'Clearance approved.',
      approve_production: 'Production override saved. Cutting list can proceed in Sales.',
      flag: 'Moved to flagged queue for audit.',
    };
    showToast(labels[decision] || 'Updated.', { variant: 'success' });
    await fetchData();
    await (ws.refresh?.() ?? Promise.resolve());
    if (selectedIntel?.kind === 'quotation' && selectedIntel.quoteId === quotationId) {
      setSelectedIntel(null);
      setAuditData(null);
    }
  };

  const handleRefundDecision = async (status) => {
    if (selectedIntel?.kind !== 'refund') return;
    const note =
      window.prompt(status === 'Approved' ? 'Optional note for approval' : 'Reason for rejection (optional)') ?? '';
    const amount = Number(selectedIntel.row?.amount_ngn) || 0;
    setDecisionBusy(true);
    const { ok, data } = await apiFetch(
      `/api/refunds/${encodeURIComponent(selectedIntel.refundId)}/decision`,
      {
        method: 'POST',
        body: JSON.stringify({
          status,
          managerComments: note.trim(),
          ...(status === 'Approved' && amount > 0 ? { approvedAmountNgn: amount } : {}),
        }),
      }
    );
    setDecisionBusy(false);
    if (!ok || data?.ok === false) {
      showToast(data?.error || 'Could not update refund.', { variant: 'error' });
      return;
    }
    showToast(status === 'Approved' ? 'Refund approved.' : 'Refund rejected.', { variant: 'success' });
    await fetchData();
    await (ws.refresh?.() ?? Promise.resolve());
    setSelectedIntel(null);
    setRefundIntelExtras(null);
  };

  const handlePaymentDecision = async (status) => {
    if (selectedIntel?.kind !== 'payment') return;
    const note =
      window.prompt(status === 'Approved' ? 'Optional note' : 'Reason for rejection (optional)') ?? '';
    setDecisionBusy(true);
    const { ok, data } = await apiFetch(
      `/api/payment-requests/${encodeURIComponent(selectedIntel.requestId)}/decision`,
      {
        method: 'POST',
        body: JSON.stringify({ status, note: note.trim() }),
      }
    );
    setDecisionBusy(false);
    if (!ok || data?.ok === false) {
      showToast(data?.error || 'Could not update payment request.', { variant: 'error' });
      return;
    }
    showToast(status === 'Approved' ? 'Payment request approved.' : 'Payment request rejected.', {
      variant: 'success',
    });
    await fetchData();
    await (ws.refresh?.() ?? Promise.resolve());
    setSelectedIntel(null);
  };

  const handleConversionSignoff = async () => {
    if (selectedIntel?.kind !== 'conversion') return;
    const remark = window.prompt('Sign-off remark (at least 3 characters)');
    if (!remark || remark.trim().length < 3) return;
    setDecisionBusy(true);
    const { ok, data } = await apiFetch(
      `/api/production-jobs/${encodeURIComponent(selectedIntel.jobId)}/manager-review-signoff`,
      {
        method: 'PATCH',
        body: JSON.stringify({ remark: remark.trim() }),
      }
    );
    setDecisionBusy(false);
    if (!ok || data?.ok === false) {
      showToast(data?.error || 'Could not sign off this job.', { variant: 'error' });
      return;
    }
    showToast('Conversion review signed off.', { variant: 'success' });
    await fetchData();
    await (ws.refresh?.() ?? Promise.resolve());
    setSelectedIntel(null);
  };

  const renderInboxRow = (row) => {
    if (activeTab === 'clearance') {
      return (
        <button
          key={row.id}
          type="button"
          onClick={() => openQuotationIntel(row.id, row)}
          className={`group w-full text-left p-4 border-b border-slate-100 last:border-0 transition-colors hover:bg-teal-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 focus-visible:ring-inset ${
            selectedIntel?.kind === 'quotation' && selectedIntel.quoteId === row.id ? 'bg-teal-50/80' : ''
          }`}
        >
          <div className="flex justify-between gap-2 mb-1">
            <span className="text-xs font-bold text-[#134e4a] tabular-nums">{row.id}</span>
            <span className="text-[10px] font-semibold text-slate-400 tabular-nums">
              {row.date_iso ? new Date(row.date_iso).toLocaleDateString() : '—'}
            </span>
          </div>
          <p className="text-[11px] font-semibold text-slate-700 truncate mb-2">{row.customer_name}</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-teal-800 bg-teal-100/90 px-2 py-0.5 rounded-md tabular-nums">
                {formatNgn(row.paid_ngn)}
              </span>
              <span className="text-[9px] text-slate-500">of {formatNgn(row.total_ngn)}</span>
            </div>
            <ChevronRight
              size={14}
              className="text-slate-300 group-hover:text-[#134e4a] transition-transform group-hover:translate-x-0.5 shrink-0"
            />
          </div>
        </button>
      );
    }
    if (activeTab === 'production') {
      const qref = row.quotation_ref;
      return (
        <button
          key={row.id}
          type="button"
          onClick={() =>
            openQuotationIntel(
              qref,
              { id: qref, customer_name: row.customer_name },
              { cuttingListId: row.id, fromProductionGate: true }
            )
          }
          className={`group w-full text-left p-4 border-b border-slate-100 last:border-0 transition-colors hover:bg-amber-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30 focus-visible:ring-inset ${
            selectedIntel?.kind === 'quotation' && selectedIntel.quoteId === qref ? 'bg-amber-50/80' : ''
          }`}
        >
          <div className="flex justify-between gap-2 mb-1">
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wide">Cutting list</span>
            <span className="text-xs font-mono font-bold text-slate-600">{row.id}</span>
          </div>
          <p className="text-xs font-bold text-[#134e4a] mb-1">{qref}</p>
          <p className="text-[11px] font-semibold text-slate-700 truncate mb-2">{row.customer_name}</p>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">
              Paid {formatNgn(row.paid_ngn)} / {formatNgn(row.total_ngn)}
            </span>
            <span className="font-bold text-amber-700 tabular-nums">{row.total_meters?.toLocaleString?.() ?? row.total_meters} m</span>
          </div>
        </button>
      );
    }
    if (activeTab === 'flagged') {
      return (
        <button
          key={row.id}
          type="button"
          onClick={() => openQuotationIntel(row.id, row)}
          className={`group w-full text-left p-4 border-b border-slate-100 last:border-0 transition-colors hover:bg-rose-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/40 focus-visible:ring-inset ${
            selectedIntel?.kind === 'quotation' && selectedIntel.quoteId === row.id ? 'bg-rose-50/70' : ''
          }`}
        >
          <div className="flex justify-between gap-2 mb-1">
            <span className="text-xs font-bold text-rose-900">{row.id}</span>
            <AlertTriangle size={14} className="text-rose-500 shrink-0" />
          </div>
          <p className="text-[11px] font-semibold text-slate-700 truncate mb-2">{row.customer_name}</p>
          <p className="text-[10px] text-rose-800/90 line-clamp-2 leading-snug">{row.manager_flag_reason || 'No reason on file.'}</p>
          <p className="text-[9px] text-slate-400 mt-2">
            {row.manager_flagged_at_iso ? new Date(row.manager_flagged_at_iso).toLocaleString() : '—'}
          </p>
        </button>
      );
    }
    if (activeTab === 'refunds') {
      return (
        <button
          key={row.refund_id}
          type="button"
          onClick={() => setSelectedIntel({ kind: 'refund', refundId: row.refund_id, row: { ...row } })}
          className={`group w-full text-left p-4 border-b border-slate-100 last:border-0 transition-colors hover:bg-amber-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40 focus-visible:ring-inset ${
            selectedIntel?.kind === 'refund' && selectedIntel.refundId === row.refund_id ? 'bg-amber-50/80' : ''
          }`}
        >
          <div className="flex justify-between gap-2 mb-1">
            <span className="text-xs font-mono font-bold text-slate-800">{row.refund_id}</span>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">{formatNgn(row.amount_ngn)}</span>
          </div>
          <p className="text-[11px] font-semibold text-slate-700 truncate">{row.customer_name}</p>
          <p className="text-[10px] text-slate-500 mt-1">
            {row.quotation_ref} · {formatRefundReasonCategory(row.reason_category)}
          </p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[9px] font-bold text-slate-400 uppercase">Transaction intel</span>
            <ChevronRight
              size={14}
              className="text-slate-300 group-hover:text-amber-700 transition-transform group-hover:translate-x-0.5 shrink-0"
            />
          </div>
        </button>
      );
    }
    if (activeTab === 'payments') {
      return (
        <button
          key={row.request_id}
          type="button"
          onClick={() => {
            setAuditData(null);
            setRefundIntelExtras(null);
            setSelectedIntel({ kind: 'payment', requestId: row.request_id, row: { ...row } });
          }}
          className={`group w-full text-left p-4 border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/50 focus-visible:ring-inset ${
            selectedIntel?.kind === 'payment' && selectedIntel.requestId === row.request_id ? 'bg-slate-100/90' : ''
          }`}
        >
          <div className="flex justify-between gap-2 mb-1">
            <span className="text-xs font-bold text-slate-800">{row.request_id}</span>
            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
              {formatNgn(row.amount_requested_ngn)}
            </span>
          </div>
          <p className="text-[11px] font-semibold text-slate-600 line-clamp-2">{row.description}</p>
          <p className="text-[9px] text-slate-400 mt-2 uppercase tracking-wide">{row.request_date}</p>
          <p className="text-[9px] text-slate-400 mt-1">Status: {row.approval_status ?? row.status ?? 'Pending'}</p>
          <div className="flex items-center justify-end mt-1">
            <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-600 shrink-0" />
          </div>
        </button>
      );
    }
    if (activeTab === 'conversions') {
      const alert = String(row.conversion_alert_state || '');
      return (
        <button
          key={row.job_id}
          type="button"
          onClick={() => {
            setAuditData(null);
            setRefundIntelExtras(null);
            setSelectedIntel({ kind: 'conversion', jobId: row.job_id, row: { ...row } });
          }}
          className={`group w-full text-left p-4 border-b border-slate-100 last:border-0 transition-colors hover:bg-violet-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/40 focus-visible:ring-inset ${
            selectedIntel?.kind === 'conversion' && selectedIntel.jobId === row.job_id ? 'bg-violet-50/80' : ''
          }`}
        >
          <div className="flex justify-between gap-2 mb-1">
            <span className="text-[10px] font-mono font-bold text-slate-700">{row.job_id}</span>
            <span
              className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                alert === 'High'
                  ? 'bg-rose-100 text-rose-800'
                  : alert === 'Low'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-slate-100 text-slate-600'
              }`}
            >
              {alert || 'Review'}
            </span>
          </div>
          <p className="text-xs font-bold text-[#134e4a] mb-0.5">{row.quotation_ref || '—'}</p>
          <p className="text-[11px] font-semibold text-slate-700 truncate">{row.customer_name}</p>
          <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{row.product_name}</p>
          <p className="text-[9px] text-slate-400 mt-2 tabular-nums">
            {row.actual_meters != null ? `${Number(row.actual_meters).toLocaleString()} m` : '—'}
            {row.completed_at_iso ? ` · ${new Date(row.completed_at_iso).toLocaleString()}` : ''}
          </p>
        </button>
      );
    }
    return null;
  };

  const tabMeta = INBOX_TABS.find((t) => t.key === activeTab);

  return (
    <PageShell className="pb-14">
      <PageHeader
        eyebrow="Management"
        title="Manager dashboard"
        subtitle="Review paid quotations, approve production when payment is below threshold, handle flags, and jump to refunds. Select any quotation row to open transaction intel and record a verdict."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl text-[10px] font-bold uppercase tracking-wide h-10 border-slate-200"
              onClick={() => navigate('/sales')}
            >
              Sales
            </Button>
            <button
              type="button"
              title="Reload management API and workspace snapshot"
              onClick={() => void handleRefreshAll()}
              className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <Button
              type="button"
              variant="outline"
              onClick={() => openAttendanceModal()}
              className="rounded-xl gap-2 font-bold uppercase text-[10px] h-10 border-teal-200 text-[#134e4a] hover:bg-teal-50"
            >
              <ClipboardList size={16} /> Mark attendance
            </Button>
            <Button
              type="button"
              onClick={() => setShowStockRequest(true)}
              className="rounded-xl gap-2 font-bold uppercase text-[10px] h-10"
            >
              <Plus size={16} /> Stock note
            </Button>
          </>
        }
      />

      {loadError ? (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 mb-6"
          role="alert"
        >
          {loadError}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-[#134e4a] via-[#0f3d39] to-[#0a2e2c] text-white p-6 sm:p-8 mb-6 shadow-lg shadow-teal-950/10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
              <LayoutDashboard size={28} className="text-teal-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-200/90">
                  {displaySnapshots.periodLabel ?? 'This month'}
                </p>
                {ws?.hasWorkspaceData ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-200">
                    <Radio size={10} className="text-emerald-300" aria-hidden />
                    Live workspace
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 border border-white/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/50">
                    No workspace
                  </span>
                )}
              </div>
              <div
                className="flex flex-wrap gap-1 mt-3 mb-1"
                role="group"
                aria-label="Metrics time range"
              >
                {MANAGER_METRIC_PERIODS.map((p) => {
                  const on = metricPeriod === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setMetricPeriod(p.key)}
                      className={`shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide border transition-colors ${
                        on
                          ? 'bg-white text-[#0f3d39] border-white shadow-sm'
                          : 'bg-white/5 text-teal-100/90 border-white/15 hover:bg-white/10 hover:border-white/25'
                      }`}
                    >
                      {p.shortLabel}
                    </button>
                  );
                })}
              </div>
              <p className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums">
                {formatNgn(displaySnapshots.revenue)}
              </p>
              <p className="text-xs text-white/70 mt-2 max-w-md">
                {totalOpenActions} open management item{totalOpenActions === 1 ? '' : 's'} across queues
                {loading ? ' · refreshing…' : ''}.
                {ws?.hasWorkspaceData
                  ? ' Numbers and inbox follow your signed-in workspace snapshot.'
                  : ' Connect the workspace to sync inbox rows with Sales and Operations in real time.'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:max-w-xl">
            <div className="rounded-xl bg-white/10 border border-white/10 px-3 py-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-teal-200/80">Quotes</p>
              <p className="text-lg font-black tabular-nums mt-1">{displaySnapshots.quoteCount}</p>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/10 px-3 py-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-teal-200/80">Low stock SKUs</p>
              <p className="text-lg font-black tabular-nums mt-1">{displaySnapshots.lowStockCount}</p>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/10 px-3 py-3 sm:col-span-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-teal-200/80">Meters (cutting lists)</p>
              <p className="text-lg font-black tabular-nums mt-1">
                {Number(displaySnapshots.metersProduced || 0).toLocaleString()} m
              </p>
            </div>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-teal-100/90 mb-1.5">
              <span>Revenue vs target</span>
              <span className="tabular-nums">{revenueProgress}%</span>
            </div>
            <div className="h-2 rounded-full bg-black/25 overflow-hidden">
              <div className="h-full rounded-full bg-teal-400 transition-all" style={{ width: `${revenueProgress}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-teal-100/90 mb-1.5">
              <span>Meters vs target</span>
              <span className="tabular-nums">{metersProgress}%</span>
            </div>
            <div className="h-2 rounded-full bg-black/25 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${metersProgress}%` }} />
            </div>
          </div>
        </div>
      </div>

      <DashboardKpiStrip
        sectionClassName="mb-6"
        metricsWindow={{
          startISO: managementPeriodStartISO(metricPeriod),
          label: displaySnapshots.periodLabel ?? 'This month',
        }}
      />

      {!ws?.hasWorkspaceData ? (
        <p className="text-xs font-semibold text-slate-500 mb-6">
          KPI strip uses live workspace data — connect to the API if figures look empty.
        </p>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 space-y-6">
          <Card className="overflow-hidden border-slate-200/90 shadow-sm">
            <div className="p-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                  <h2 className="text-sm font-black text-[#134e4a] tracking-tight flex items-center gap-2">
                    <ShieldCheck size={18} className="text-teal-600 shrink-0" />
                    Action inbox
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-1">{tabMeta?.description}</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={inboxSearch}
                    onChange={(e) => setInboxSearch(e.target.value)}
                    placeholder="Filter this queue…"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-[#134e4a]/15"
                  />
                </div>
              </div>
              <div className="flex gap-1 mt-4 overflow-x-auto pb-1 -mx-1 px-1 custom-scrollbar">
                {INBOX_TABS.map((t) => {
                  const active = activeTab === t.key;
                  const count = tabCounts[t.key];
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setActiveTab(t.key)}
                      className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-colors border ${
                        active
                          ? 'bg-[#134e4a] text-white border-[#134e4a] shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {t.label}
                      <span
                        className={`tabular-nums px-1.5 py-0.5 rounded-md text-[9px] ${
                          active ? 'bg-white/20' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="min-h-[420px] max-h-[min(56vh,560px)] overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
                  <RefreshCw size={28} className="animate-spin text-[#134e4a]" />
                  <p className="text-xs font-bold uppercase tracking-widest">Loading queues</p>
                </div>
              ) : filteredInboxRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-6 text-center text-slate-400">
                  {activeTab === 'clearance' ? (
                    <CheckCircle2 size={36} className="opacity-25 mb-3 text-teal-600" />
                  ) : activeTab === 'production' ? (
                    <Factory size={36} className="opacity-25 mb-3 text-amber-600" />
                  ) : activeTab === 'flagged' ? (
                    <Flag size={36} className="opacity-25 mb-3 text-rose-500" />
                  ) : activeTab === 'conversions' ? (
                    <BarChart3 size={36} className="opacity-25 mb-3 text-violet-600" />
                  ) : activeTab === 'refunds' ? (
                    <RotateCcw size={36} className="opacity-25 mb-3 text-amber-600" />
                  ) : (
                    <FileText size={36} className="opacity-25 mb-3 text-rose-500" />
                  )}
                  <p className="text-sm font-bold text-slate-600">Nothing in this queue</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    {inboxSearch.trim()
                      ? 'Try clearing the search filter.'
                      : 'When new items arrive, they will appear here.'}
                  </p>
                </div>
              ) : (
                <div>{filteredInboxRows.map((row) => renderInboxRow(row))}</div>
              )}
            </div>
          </Card>

          <Card className="p-5 border-slate-200/90 shadow-sm">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.18em] mb-4 flex items-center gap-2">
              <BarChart3 size={14} className="text-[#134e4a]" />
              Top customers ({(displaySnapshots.periodLabel ?? 'this month').toLowerCase()})
            </h3>
            <div className="space-y-4">
              {displaySnapshots.topByRevenue.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No revenue data for {(displaySnapshots.periodLabel ?? 'this period').toLowerCase()} yet.
                </p>
              ) : (
                displaySnapshots.topByRevenue.map((c, idx) => (
                  <div key={c.customer_id || idx} className="flex items-center gap-4">
                    <span className="text-xs font-black text-slate-400 w-5">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-[11px] font-bold text-slate-800 mb-1 gap-2">
                        <span className="truncate">{c.customer_name}</span>
                        <span className="tabular-nums shrink-0 text-[#134e4a]">{formatNgn(c.revenue)}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{
                            width: `${(c.revenue / (displaySnapshots.topByRevenue[0]?.revenue || 1)) * 100}%`,
                          }}
                          className="h-full bg-[#134e4a] rounded-full"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="xl:col-span-5 xl:sticky xl:top-6 space-y-4">
          <Card className="flex flex-col bg-slate-900 border-slate-800 shadow-xl overflow-hidden min-h-[min(88vh,920px)] max-h-[min(92vh,960px)]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-black text-white/50 uppercase tracking-[0.2em] flex items-center gap-2">
                <History size={14} className="text-teal-400" />
                Transaction intel
              </h3>
              {selectedIntel ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIntel(null);
                    setAuditData(null);
                    setRefundIntelExtras(null);
                  }}
                  className="text-[10px] font-bold uppercase text-white/40 hover:text-white transition-colors"
                >
                  Close
                </button>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar text-white min-h-0">
              {!selectedIntel ? (
                <div className="h-full min-h-[280px] flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                    <Search size={28} className="text-white/25" />
                  </div>
                  <p className="text-sm font-bold text-white/50">Select an inbox row</p>
                  <p className="text-xs text-white/35 mt-2 max-w-[240px] leading-relaxed">
                    Clearance, production gate, conversion review, flags, refunds, and payment requests all open here with actions.
                  </p>
                </div>
              ) : selectedIntel.kind === 'quotation' ? (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-teal-400/90 mb-1">Quotation</p>
                    <h2 className="text-xl font-black text-white leading-tight">{selectedIntel.quoteId}</h2>
                    <p className="text-sm font-semibold text-white/70 mt-1 truncate">
                      {selectedIntel.row?.customer_name || 'Customer name not on this list row'}
                    </p>
                    {selectedIntel.fromProductionGate ? (
                      <p className="text-[10px] text-amber-300/90 mt-2 leading-snug">
                        Opened from production gate (low payment). Use production override only after you accept the risk.
                      </p>
                    ) : null}
                  </div>

                  {loadingAudit ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-14 rounded-2xl border border-white/10 bg-white/[0.04]">
                      <RefreshCw className="text-teal-400 animate-spin" size={28} />
                      <span className="text-[11px] font-bold text-white/50">Loading quotation detail…</span>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-2xl border border-white/15 bg-white/[0.07] p-4 space-y-3">
                        <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Clearance decision</p>
                        <p className="text-[10px] text-white/50 leading-relaxed">
                          Approve records manager clearance. Disapprove or Flag both move the quote to the{' '}
                          <span className="text-white/70">Flagged</span> inbox with your reason.
                        </p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <button
                            type="button"
                            disabled={decisionBusy}
                            onClick={() => handleReview(selectedIntel.quoteId, 'clear')}
                            className="flex flex-col items-center gap-1.5 p-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                          >
                            <CheckCircle2 size={18} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Approve</span>
                          </button>
                          <button
                            type="button"
                            disabled={decisionBusy}
                            onClick={() => {
                              const reason = window.prompt('Why are you disapproving this clearance? (required)');
                              if (reason && reason.trim()) handleReview(selectedIntel.quoteId, 'flag', reason.trim());
                            }}
                            className="flex flex-col items-center gap-1.5 p-3.5 rounded-xl bg-slate-600 hover:bg-slate-500 text-white border border-white/10 disabled:opacity-50 transition-colors"
                          >
                            <RotateCcw size={18} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Disapprove</span>
                          </button>
                          <button
                            type="button"
                            disabled={decisionBusy}
                            onClick={() => {
                              const reason = window.prompt('Reason for audit flag? (required)');
                              if (reason && reason.trim()) handleReview(selectedIntel.quoteId, 'flag', reason.trim());
                            }}
                            className="flex flex-col items-center gap-1.5 p-3.5 rounded-xl bg-rose-600/85 hover:bg-rose-500 text-white disabled:opacity-50 transition-colors"
                          >
                            <Flag size={18} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Flag</span>
                          </button>
                        </div>
                        {selectedIntel.fromProductionGate ? (
                          <button
                            type="button"
                            disabled={decisionBusy}
                            onClick={() => handleReview(selectedIntel.quoteId, 'approve_production')}
                            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-teal-700 hover:bg-teal-600 text-white border border-white/10 disabled:opacity-50 transition-colors"
                          >
                            <Zap size={16} />
                            <span className="text-[10px] font-black uppercase tracking-widest">
                              Production override (low payment)
                            </span>
                          </button>
                        ) : null}
                      </div>

                      <ManagementAuditSections auditData={auditData} loadingAudit={false} formatNgn={formatNgn} />
                    </>
                  )}
                </div>
              ) : selectedIntel.kind === 'refund' ? (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300/90 mb-1">Refund request</p>
                    <h2 className="text-lg font-black text-white font-mono leading-tight">{selectedIntel.refundId}</h2>
                    <p className="text-sm font-semibold text-white/70 mt-1 truncate">{selectedIntel.row?.customer_name}</p>
                    <p className="text-xs text-white/50 mt-2 tabular-nums">{formatNgn(selectedIntel.row?.amount_ngn)}</p>
                    <p className="text-[10px] text-white/40 mt-2">
                      {selectedIntel.row?.quotation_ref ? `Quote ${selectedIntel.row.quotation_ref}` : '—'} ·{' '}
                      {formatRefundReasonCategory(selectedIntel.row?.reason_category)}
                    </p>
                  </div>

                  {loadingRefundIntel ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="text-amber-400 animate-spin" size={28} />
                    </div>
                  ) : refundIntelExtras ? (
                    <>
                      <section>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Receipts (quote context)</p>
                        <div className="space-y-2">
                          {!refundIntelExtras.receipts?.length ? (
                            <p className="text-xs text-white/35 py-2">None.</p>
                          ) : (
                            refundIntelExtras.receipts.map((rcpt, idx) => (
                              <div
                                key={rcpt.id || idx}
                                className="flex gap-3 p-3 rounded-xl bg-white/[0.06] border border-white/10"
                              >
                                <div className="p-2 bg-emerald-500/15 rounded-lg shrink-0">
                                  <DollarSign size={14} className="text-emerald-400" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-black text-white tabular-nums">{formatNgn(rcpt.amountNgn)}</p>
                                  <p className="text-[9px] text-white/30 mt-1 font-mono">{rcpt.id}</p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </section>
                      <section>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Cutting lists</p>
                        {!refundIntelExtras.cuttingLists?.length ? (
                          <p className="text-xs text-white/35 py-2">None linked.</p>
                        ) : (
                          <div className="space-y-2">
                            {refundIntelExtras.cuttingLists.map((cl, idx) => (
                              <div key={cl.id || idx} className="p-3 rounded-xl bg-white/[0.06] border border-white/10 text-[10px]">
                                <p className="font-bold text-white">{cl.id}</p>
                                <p className="text-white/40 mt-1 tabular-nums">{cl.totalMeters?.toLocaleString?.()} m</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    </>
                  ) : selectedIntel.row?.quotation_ref ? null : (
                    <p className="text-[10px] text-white/35">No quotation linked — context panels unavailable.</p>
                  )}

                  {selectedIntel.row?.quotation_ref ? (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-violet-300/90 uppercase tracking-widest">
                        Full quotation picture (orders, payments, balance, production, refunds)
                      </p>
                      <ManagementAuditSections auditData={auditData} loadingAudit={loadingAudit} formatNgn={formatNgn} />
                    </div>
                  ) : null}

                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Decision</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={decisionBusy}
                        onClick={() => handleRefundDecision('Approved')}
                        className="flex flex-col items-center gap-1.5 p-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle2 size={18} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Approve</span>
                      </button>
                      <button
                        type="button"
                        disabled={decisionBusy}
                        onClick={() => handleRefundDecision('Rejected')}
                        className="flex flex-col items-center gap-1.5 p-3.5 rounded-xl bg-rose-600/80 hover:bg-rose-500 text-white disabled:opacity-50 transition-colors"
                      >
                        <RotateCcw size={18} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Reject</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={decisionBusy}
                      onClick={() =>
                        navigate('/sales', {
                          state: {
                            focusSalesTab: 'refund',
                            openSalesRecord: { type: 'refund', id: selectedIntel.refundId },
                          },
                        })
                      }
                      className="w-full text-[10px] font-bold uppercase tracking-wide text-white/40 hover:text-white/70 py-2"
                    >
                      Open full refund flow in Sales
                    </button>
                  </div>
                </div>
              ) : selectedIntel.kind === 'payment' ? (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-rose-300/90 mb-1">Payment request</p>
                    <h2 className="text-lg font-black text-white leading-tight">{selectedIntel.requestId}</h2>
                    <p className="text-xs text-white/45 mt-2 font-mono">{selectedIntel.row?.expense_id}</p>
                    {selectedIntel.row?.expense_category ? (
                      <p className="text-[11px] text-teal-200/90 mt-2">
                        Category:{' '}
                        <span className="font-semibold text-white/90">{selectedIntel.row.expense_category}</span>
                      </p>
                    ) : null}
                    {selectedIntel.row?.request_reference ? (
                      <p className="text-[11px] text-white/55 mt-2">
                        Reference: <span className="font-semibold text-white/80">{selectedIntel.row.request_reference}</span>
                      </p>
                    ) : null}
                    <p className="text-sm font-semibold text-white/80 mt-3 tabular-nums">
                      {formatNgn(selectedIntel.row?.amount_requested_ngn)}
                    </p>
                    <p className="text-sm text-white/60 mt-3 leading-snug whitespace-pre-wrap">
                      {selectedIntel.row?.description}
                    </p>
                    <p className="text-[10px] text-white/35 mt-3 uppercase tracking-wide">{selectedIntel.row?.request_date}</p>
                    {Array.isArray(selectedIntel.row?.line_items) && selectedIntel.row.line_items.length > 0 ? (
                      <div className="mt-4 rounded-xl border border-white/10 overflow-hidden bg-black/20">
                        <table className="w-full text-[10px] text-left">
                          <thead>
                            <tr className="text-white/40 uppercase tracking-wide border-b border-white/10">
                              <th className="p-2 font-bold">Item</th>
                              <th className="p-2 font-bold text-right">Unit</th>
                              <th className="p-2 font-bold text-right">Price</th>
                              <th className="p-2 font-bold text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedIntel.row.line_items.map((ln, i) => (
                              <tr key={i} className="border-b border-white/5 text-white/75">
                                <td className="p-2">{ln.item || '—'}</td>
                                <td className="p-2 text-right tabular-nums">{Number(ln.unit) || 0}</td>
                                <td className="p-2 text-right tabular-nums">
                                  {formatNgn(Number(ln.unitPriceNgn ?? ln.unit_price_ngn) || 0)}
                                </td>
                                <td className="p-2 text-right tabular-nums font-semibold text-white/90">
                                  {formatNgn(Number(ln.lineTotalNgn ?? ln.line_total_ngn) || 0)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2 mt-4">
                      {selectedIntel.row?.attachment_present ? (
                        <a
                          href={apiUrl(
                            `/api/payment-requests/${encodeURIComponent(selectedIntel.requestId)}/attachment`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white"
                        >
                          <Paperclip size={14} />
                          {selectedIntel.row?.attachment_name || 'View attachment'}
                        </a>
                      ) : (
                        <span className="text-[10px] text-white/35">No attachment</span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          printExpenseRequestRecord(
                            {
                              requestID: selectedIntel.requestId,
                              requestDate: selectedIntel.row?.request_date,
                              requestReference: selectedIntel.row?.request_reference,
                              description: selectedIntel.row?.description,
                              expenseID: selectedIntel.row?.expense_id,
                              amountRequestedNgn: selectedIntel.row?.amount_requested_ngn,
                              approvalStatus: selectedIntel.row?.approval_status,
                              expenseCategory: selectedIntel.row?.expense_category,
                              lineItems: selectedIntel.row?.line_items,
                              attachmentName: selectedIntel.row?.attachment_name,
                              attachmentPresent: selectedIntel.row?.attachment_present,
                            },
                            formatNgn
                          )
                        }
                        className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white"
                      >
                        <Printer size={14} />
                        Print record
                      </button>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Decision</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={decisionBusy}
                        onClick={() => handlePaymentDecision('Approved')}
                        className="flex flex-col items-center gap-1.5 p-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle2 size={18} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Approve</span>
                      </button>
                      <button
                        type="button"
                        disabled={decisionBusy}
                        onClick={() => handlePaymentDecision('Rejected')}
                        className="flex flex-col items-center gap-1.5 p-3.5 rounded-xl bg-rose-600/80 hover:bg-rose-500 text-white disabled:opacity-50 transition-colors"
                      >
                        <Flag size={18} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Reject</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : selectedIntel.kind === 'conversion' ? (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300/90 mb-1">Conversion review</p>
                    <h2 className="text-lg font-black text-white font-mono leading-tight">{selectedIntel.jobId}</h2>
                    <p className="text-xs font-bold text-teal-300/90 mt-2">{selectedIntel.row?.quotation_ref || '—'}</p>
                    <p className="text-sm font-semibold text-white/70 mt-1 truncate">{selectedIntel.row?.customer_name}</p>
                    <p className="text-[10px] text-white/45 mt-2">{selectedIntel.row?.product_name}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="text-[9px] font-black uppercase px-2 py-1 rounded-md bg-white/10">
                        Alert: {selectedIntel.row?.conversion_alert_state || '—'}
                      </span>
                      {selectedIntel.row?.manager_review_required ? (
                        <span className="text-[9px] font-black uppercase px-2 py-1 rounded-md bg-amber-500/20 text-amber-200">
                          Manager review
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[10px] text-white/50 mt-4 tabular-nums">
                      Actual: {Number(selectedIntel.row?.actual_meters || 0).toLocaleString()} m
                      {selectedIntel.row?.actual_weight_kg != null
                        ? ` · ${Number(selectedIntel.row.actual_weight_kg).toLocaleString()} kg`
                        : ''}
                    </p>
                    <p className="text-[9px] text-white/30 mt-2">
                      {selectedIntel.row?.completed_at_iso
                        ? new Date(selectedIntel.row.completed_at_iso).toLocaleString()
                        : ''}
                    </p>
                  </div>

                  {selectedIntel.row?.quotation_ref ? (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-violet-300/90 uppercase tracking-widest">
                        Quotation context (payments, balance, meters, conversion trail)
                      </p>
                      <ManagementAuditSections auditData={auditData} loadingAudit={loadingAudit} formatNgn={formatNgn} />
                    </div>
                  ) : null}

                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Sign off</p>
                    <p className="text-[10px] text-white/45 leading-relaxed">
                      Confirms you have reviewed High/Low conversion or the open manager review for this completed job.
                    </p>
                    <button
                      type="button"
                      disabled={decisionBusy}
                      onClick={() => void handleConversionSignoff()}
                      className="w-full flex items-center justify-center gap-2 p-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black uppercase text-[9px] tracking-widest disabled:opacity-50 transition-colors"
                    >
                      <Factory size={18} />
                      Sign off review
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="p-3 border-t border-white/10 bg-black/30">
              <p className="text-[9px] font-semibold text-white/25 text-center uppercase tracking-widest">
                Management · Zarewa
              </p>
            </div>
          </Card>
        </div>
      </div>

      <ModalFrame
        isOpen={showAttendanceModal}
        onClose={() => setShowAttendanceModal(false)}
        title="Mark staff attendance"
        description="Record present or late for each staff member in your branch for one calendar day."
      >
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full max-h-[min(90dvh,720px)] flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center gap-3 shrink-0">
            <div>
              <h2 className="text-base font-bold text-[#134e4a]">Daily attendance</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Branch scope follows your workspace bar.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAttendanceModal(false)}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <form onSubmit={saveAttendanceRoll} className="flex flex-col flex-1 min-h-0">
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {attLoadError ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  {attLoadError}
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase" htmlFor="mgr-att-branch">
                    Branch
                  </label>
                  <select
                    id="mgr-att-branch"
                    value={attBranchId}
                    onChange={(e) => setAttBranchId(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none"
                  >
                    {(ws?.session?.branches ?? []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name || b.code || b.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase" htmlFor="mgr-att-day">
                    Date
                  </label>
                  <input
                    id="mgr-att-day"
                    type="date"
                    value={attDayIso}
                    onChange={(e) => setAttDayIso(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase" htmlFor="mgr-att-notes">
                  Notes (optional)
                </label>
                <input
                  id="mgr-att-notes"
                  value={attNotes}
                  onChange={(e) => setAttNotes(e.target.value)}
                  placeholder="e.g. half-day closure"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none"
                />
              </div>
              {attLoading ? (
                <p className="text-sm text-slate-500">Loading staff…</p>
              ) : attStaffList.length === 0 && !attLoadError ? (
                <p className="text-sm text-slate-600">No staff assigned to this branch in HR.</p>
              ) : (
                <ul className="space-y-2 border border-slate-100 rounded-xl divide-y divide-slate-100 max-h-[min(40vh,320px)] overflow-y-auto">
                  {attStaffList.map((s) => {
                    const id = String(s.userId);
                    const st = attStatusByUser[id] === 'late' ? 'late' : 'present';
                    return (
                      <li key={id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{s.displayName || s.username}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{s.jobTitle || '—'}</p>
                        </div>
                        <div className="flex rounded-lg border border-slate-200 overflow-hidden shrink-0">
                          <button
                            type="button"
                            onClick={() => setAttStatusByUser((m) => ({ ...m, [id]: 'present' }))}
                            className={`px-3 py-1.5 text-[10px] font-black uppercase ${
                              st === 'present' ? 'bg-[#134e4a] text-white' : 'bg-white text-slate-600'
                            }`}
                          >
                            Present
                          </button>
                          <button
                            type="button"
                            onClick={() => setAttStatusByUser((m) => ({ ...m, [id]: 'late' }))}
                            className={`px-3 py-1.5 text-[10px] font-black uppercase border-l border-slate-200 ${
                              st === 'late' ? 'bg-amber-600 text-white' : 'bg-white text-slate-600'
                            }`}
                          >
                            Late
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex flex-wrap gap-2 shrink-0 bg-slate-50/80">
              <Button
                type="submit"
                disabled={attLoading || attStaffList.length === 0 || attSaving || Boolean(attLoadError)}
                className="flex-1 min-w-[8rem] rounded-xl font-bold uppercase text-[10px] h-11"
              >
                {attSaving ? 'Saving…' : 'Save roll'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAttendanceModal(false)}
                className="rounded-xl font-bold uppercase text-[10px] h-11"
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame
        isOpen={showStockRequest}
        onClose={() => setShowStockRequest(false)}
        title="Inventory note"
        description="Placeholder stock request form"
      >
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
            <h2 className="text-base font-bold text-[#134e4a]">Inventory replenishment</h2>
            <button
              type="button"
              onClick={() => setShowStockRequest(false)}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-600">
              Draft a coil or material request for procurement. Wire this to your payment / PO flow when ready.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Material</label>
                <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none">
                  <option>Aluminium coil</option>
                  <option>PVC resin</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Weight (kg)</label>
                <input
                  type="number"
                  placeholder="5000"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1 rounded-xl font-bold uppercase text-[10px] h-11" type="button">
                Submit (placeholder)
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowStockRequest(false)}
                className="rounded-xl font-bold uppercase text-[10px] h-11"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </ModalFrame>
    </PageShell>
  );
};

export default ManagerDashboard;
