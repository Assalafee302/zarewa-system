import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  Gauge,
  Link2,
  ListOrdered,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react';
import { apiFetch } from '../lib/apiBase';
import { APP_DATA_TABLE_PAGE_SIZE, useAppTablePaging } from '../lib/appDataTable';
import { AppTablePager } from './ui/AppDataTable';
import {
  buildExpectedCoilSpecFromQuotation,
  coilMatchesQuotationSpec,
  coilVersusQuotationAndProductWarning,
} from '../lib/coilSpecVersusProduct';
import { productionJobNeedsManagerReviewAttention } from '../lib/productionReview';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { EditSecondApprovalInline } from './EditSecondApprovalInline';

function createDraftLine(row = {}) {
  const hasPersistedId = row.id != null && row.id !== '';
  return {
    id: hasPersistedId ? row.id : `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    coilNo: row.coilNo || '',
    openingWeightKg:
      row.openingWeightKg != null && row.openingWeightKg !== 0 ? String(row.openingWeightKg) : '',
    closingWeightKg:
      row.closingWeightKg != null && row.closingWeightKg !== 0 ? String(row.closingWeightKg) : '',
    metersProduced:
      row.metersProduced != null && row.metersProduced !== 0 ? String(row.metersProduced) : '',
    note: row.note || '',
    specMismatch: Boolean(row.specMismatch),
  };
}

function formatKg(value) {
  const next = Number(value);
  return Number.isFinite(next) ? `${next.toFixed(2)} kg` : '—';
}

function formatMeters(value) {
  const next = Number(value);
  return Number.isFinite(next) ? `${next.toFixed(2)} m` : '—';
}

function formatKgPerM(value) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? `${next.toFixed(4)} kg/m` : '—';
}

/** Table cells for posted conversion (readable size, full precision). */
function formatKgPerMCompact(value) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next.toFixed(4) : '—';
}

function formatPct(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return '—';
  const sign = next > 0 ? '+' : '';
  return `${sign}${next.toFixed(1)}%`;
}

function alertTone(alertState) {
  switch (alertState) {
    case 'High':
      return 'border-red-200 bg-red-50 text-red-900';
    case 'Low':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'Watch':
      return 'border-sky-200 bg-sky-50 text-sky-900';
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  }
}

/** Table row background only (posted conversion). */
function postedCheckRowClass(alertState) {
  switch (alertState) {
    case 'High':
      return 'bg-red-50/85 text-red-950';
    case 'Low':
      return 'bg-amber-50/85 text-amber-950';
    case 'Watch':
      return 'bg-sky-50/85 text-sky-950';
    default:
      return 'bg-emerald-50/50 text-emerald-950';
  }
}

function statusTone(status) {
  switch (status) {
    case 'Completed':
      return 'bg-emerald-100 text-emerald-800';
    case 'Running':
      return 'bg-sky-100 text-sky-800';
    default:
      return 'bg-amber-100 text-amber-900';
  }
}

function isDraftAllocationRow(row) {
  return String(row?.id ?? '').startsWith('draft-');
}

function completionLineFromDraft(row) {
  const line = {
    coilNo: row.coilNo.trim(),
    closingWeightKg: Number(row.closingWeightKg),
    metersProduced: Number(row.metersProduced),
    note: row.note.trim(),
  };
  if (!isDraftAllocationRow(row) && row.id != null && row.id !== '') {
    return { ...line, allocationId: row.id };
  }
  return line;
}

/**
 * @param {{ focusCuttingListId?: string | null; hideJobSidebar?: boolean; inModal?: boolean; viewOnly?: boolean }} [props]
 */
export function LiveProductionMonitor({
  focusCuttingListId = null,
  hideJobSidebar = false,
  inModal = false,
  viewOnly = false,
} = {}) {
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const [selectedJobId, setSelectedJobId] = useState('');
  const [draftAllocations, setDraftAllocations] = useState([createDraftLine()]);
  const [savingAction, setSavingAction] = useState('');
  const [signoffRemark, setSignoffRemark] = useState('');
  const [signoffEditApprovalId, setSignoffEditApprovalId] = useState('');
  const [signoffSaving, setSignoffSaving] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [returnSaving, setReturnSaving] = useState(false);
  const [fgAdjDelta, setFgAdjDelta] = useState('');
  const [fgAdjNote, setFgAdjNote] = useState('');
  const [fgAdjSaving, setFgAdjSaving] = useState(false);
  const [stoneMetersConsumed, setStoneMetersConsumed] = useState('');
  const [stoneAllocAck, setStoneAllocAck] = useState(false);

  const productionJobs = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.productionJobs) ? ws.snapshot.productionJobs : []),
    [ws]
  );
  const jobCoils = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.productionJobCoils) ? ws.snapshot.productionJobCoils : []),
    [ws]
  );
  const conversionChecks = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.productionConversionChecks)
        ? ws.snapshot.productionConversionChecks
        : [],
    [ws]
  );
  const completionAdjustments = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.productionCompletionAdjustments)
        ? ws.snapshot.productionCompletionAdjustments
        : [],
    [ws]
  );
  const coilLots = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.coilLots) ? ws.snapshot.coilLots : []),
    [ws]
  );
  const products = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.products) ? ws.snapshot.products : []),
    [ws]
  );
  const coilAllocationCountByJob = useMemo(() => {
    const m = new Map();
    for (const row of jobCoils) {
      const id = row.jobID;
      if (!id) continue;
      m.set(id, (m.get(id) || 0) + 1);
    }
    return m;
  }, [jobCoils]);

  const sortedJobs = useMemo(() => {
    const order = { Running: 0, Planned: 1, Completed: 2 };
    return [...productionJobs].sort((a, b) => {
      const byStatus = (order[a.status] ?? 99) - (order[b.status] ?? 99);
      if (byStatus !== 0) return byStatus;
      return String(b.createdAtISO || '').localeCompare(String(a.createdAtISO || ''));
    });
  }, [productionJobs]);

  const focusClTrim = useMemo(
    () => (focusCuttingListId != null ? String(focusCuttingListId).trim() : ''),
    [focusCuttingListId]
  );

  const selectedJob = useMemo(() => {
    const found = sortedJobs.find((job) => job.jobID === selectedJobId);
    if (found) return found;
    if (focusClTrim) return null;
    return sortedJobs[0] ?? null;
  }, [selectedJobId, sortedJobs, focusClTrim]);

  useEffect(() => {
    setSignoffEditApprovalId('');
  }, [selectedJob?.jobID]);

  const selectedJobAllocations = useMemo(
    () =>
      jobCoils
        .filter((row) => row.jobID === selectedJob?.jobID)
        .sort((a, b) => (a.sequenceNo || 0) - (b.sequenceNo || 0)),
    [jobCoils, selectedJob?.jobID]
  );
  const selectedChecks = useMemo(
    () => conversionChecks.filter((row) => row.jobID === selectedJob?.jobID),
    [conversionChecks, selectedJob?.jobID]
  );
  const checksPage = useAppTablePaging(selectedChecks, APP_DATA_TABLE_PAGE_SIZE, selectedJob?.jobID);
  const selectedJobAdjustments = useMemo(
    () => completionAdjustments.filter((a) => a.jobID === selectedJob?.jobID),
    [completionAdjustments, selectedJob?.jobID]
  );
  const jobProductAttrs = useMemo(() => {
    const p = products.find((x) => x.productID === selectedJob?.productID);
    return p?.dashboardAttrs ?? null;
  }, [products, selectedJob?.productID]);
  const linkedQuotation = useMemo(() => {
    const ref = String(selectedJob?.quotationRef || '').trim();
    if (!ref || !Array.isArray(ws?.snapshot?.quotations)) return null;
    return ws.snapshot.quotations.find((q) => q.id === ref) ?? null;
  }, [selectedJob?.quotationRef, ws?.snapshot?.quotations]);
  const isStoneMeterQuote = Boolean(
    linkedQuotation && String(linkedQuotation.materialTypeId || '').trim() === 'MAT-005'
  );
  const quotationMaterialSpec = useMemo(
    () => buildExpectedCoilSpecFromQuotation(linkedQuotation, jobProductAttrs),
    [linkedQuotation, jobProductAttrs]
  );
  const coilByNo = useMemo(
    () => Object.fromEntries(coilLots.map((lot) => [lot.coilNo, lot])),
    [coilLots]
  );

  /** Opening kg already reserved for this job per coil (server state) — add back when showing kg free to allocate. */
  const savedOpeningKgByCoil = useMemo(() => {
    const m = new Map();
    for (const a of selectedJobAllocations) {
      const kg = Number(a.openingWeightKg);
      if (a.coilNo && Number.isFinite(kg) && kg > 0) m.set(a.coilNo, kg);
    }
    return m;
  }, [selectedJobAllocations]);

  const hasPersistedCoilAllocations = selectedJobAllocations.length > 0;

  const availableCoils = useMemo(() => {
    const selectedCoils = new Set(selectedJobAllocations.map((row) => row.coilNo));
    return coilLots
      .filter((coil) => coil.currentStatus !== 'Consumed' || selectedCoils.has(coil.coilNo))
      .sort((a, b) => String(a.coilNo || '').localeCompare(String(b.coilNo || '')));
  }, [coilLots, selectedJobAllocations]);
  const recommendedCoils = useMemo(
    () =>
      availableCoils.filter((coil) => coilMatchesQuotationSpec(coil, linkedQuotation, jobProductAttrs)),
    [availableCoils, linkedQuotation, jobProductAttrs]
  );
  const recommendedCoilNoSet = useMemo(
    () => new Set(recommendedCoils.map((c) => c.coilNo)),
    [recommendedCoils]
  );
  const otherCoilsForSelect = useMemo(
    () => availableCoils.filter((c) => !recommendedCoilNoSet.has(c.coilNo)),
    [availableCoils, recommendedCoilNoSet]
  );

  const reservedKg = useMemo(
    () =>
      draftAllocations.reduce((sum, row) => {
        const opening = Number(row.openingWeightKg);
        return sum + (Number.isFinite(opening) ? opening : 0);
      }, 0),
    [draftAllocations]
  );
  const recordedMeters = useMemo(() => {
    if (isStoneMeterQuote && selectedJob?.status === 'Running') {
      const m = Number(String(stoneMetersConsumed).replace(/,/g, ''));
      return Number.isFinite(m) && m > 0 ? m : 0;
    }
    return draftAllocations.reduce((sum, row) => {
      const meters = Number(row.metersProduced);
      return sum + (Number.isFinite(meters) ? meters : 0);
    }, 0);
  }, [draftAllocations, isStoneMeterQuote, selectedJob?.status, stoneMetersConsumed]);
  const recordedConsumedKg = useMemo(
    () =>
      draftAllocations.reduce((sum, row) => {
        const opening = Number(row.openingWeightKg);
        const closing = Number(row.closingWeightKg);
        if (!Number.isFinite(opening) || !Number.isFinite(closing) || closing > opening) return sum;
        return sum + (opening - closing);
      }, 0),
    [draftAllocations]
  );

  const canRunConversionPreview = useMemo(() => {
    if (selectedJob?.status !== 'Running' || !selectedJob?.jobID) return false;
    if (isStoneMeterQuote) {
      const m = Number(String(stoneMetersConsumed).replace(/,/g, ''));
      return Number.isFinite(m) && m > 0;
    }
    return draftAllocations.every((row) => {
      const coil = row.coilNo?.trim();
      const op = Number(row.openingWeightKg);
      const cl = Number(row.closingWeightKg);
      const m = Number(row.metersProduced);
      return (
        coil &&
        Number.isFinite(op) &&
        op > 0 &&
        Number.isFinite(cl) &&
        cl >= 0 &&
        cl <= op &&
        Number.isFinite(m) &&
        m > 0
      );
    });
  }, [
    draftAllocations,
    isStoneMeterQuote,
    selectedJob?.jobID,
    selectedJob?.status,
    stoneMetersConsumed,
  ]);

  const conversionPreviewTimerRef = useRef(null);
  const conversionPreviewSeqRef = useRef(0);
  const [conversionPreview, setConversionPreview] = useState(null);
  const [conversionPreviewError, setConversionPreviewError] = useState('');
  const [conversionPreviewLoading, setConversionPreviewLoading] = useState(false);

  useEffect(() => {
    if (focusClTrim) {
      const j = productionJobs.find((x) => x.cuttingListId === focusClTrim);
      if (j) {
        if (selectedJobId !== j.jobID) setSelectedJobId(j.jobID);
      } else if (selectedJobId !== '') {
        setSelectedJobId('');
      }
      return;
    }
    if (!sortedJobs.length) {
      setSelectedJobId('');
      return;
    }
    if (!selectedJobId || !sortedJobs.some((job) => job.jobID === selectedJobId)) {
      setSelectedJobId(sortedJobs[0].jobID);
    }
  }, [selectedJobId, sortedJobs, focusClTrim, productionJobs]);

  useEffect(() => {
    if (!selectedJob) {
      setDraftAllocations([createDraftLine()]);
      return;
    }
    setDraftAllocations(
      selectedJobAllocations.length
        ? selectedJobAllocations.map((row) => createDraftLine(row))
        : [createDraftLine()]
    );
  }, [selectedJob, selectedJobAllocations]);

  useEffect(() => {
    setSignoffRemark('');
    setReturnModalOpen(false);
    setReturnReason('');
    setFgAdjDelta('');
    setFgAdjNote('');
    setStoneMetersConsumed('');
    setStoneAllocAck(false);
  }, [selectedJob?.jobID]);

  const quotedAccessoryLines = useMemo(() => {
    const ref = selectedJob?.quotationRef;
    if (!ref || !Array.isArray(ws?.snapshot?.quotations)) return [];
    const q = ws.snapshot.quotations.find((x) => x.id === ref);
    const acc = q?.quotationLines?.accessories;
    if (!Array.isArray(acc)) return [];
    return acc
      .filter((r) => {
        const n = String(r?.name ?? '').trim();
        const qn = Number(String(r?.qty ?? '').replace(/,/g, '')) || 0;
        return n && qn > 0;
      })
      .map((r) => ({
        quoteLineId: String(r.id ?? '').trim(),
        name: String(r.name ?? '').trim(),
        ordered: Number(String(r.qty ?? '').replace(/,/g, '')) || 0,
      }));
  }, [selectedJob?.quotationRef, ws?.snapshot?.quotations]);

  const [accessoryCompletionDraft, setAccessoryCompletionDraft] = useState([]);

  useEffect(() => {
    const ref = selectedJob?.quotationRef;
    const jobId = selectedJob?.jobID;
    if (!ref || !jobId || !quotedAccessoryLines.length) {
      setAccessoryCompletionDraft([]);
      return;
    }
    const usage = (ws?.snapshot?.productionJobAccessoryUsage || []).filter((u) => u.quotationRef === ref);
    const next = quotedAccessoryLines.map((line) => {
      const stableKey = line.quoteLineId || `name:${line.name}`;
      let prior = 0;
      for (const u of usage) {
        if (u.jobID === jobId) continue;
        if (String(u.quoteLineId || '') === stableKey) prior += Number(u.suppliedQty) || 0;
      }
      const remaining = Math.max(0, line.ordered - prior);
      return {
        key: stableKey,
        quoteLineId: line.quoteLineId,
        name: line.name,
        ordered: line.ordered,
        priorSupplied: prior,
        suppliedThisJob: remaining,
      };
    });
    setAccessoryCompletionDraft(next);
  }, [selectedJob?.jobID, selectedJob?.quotationRef, quotedAccessoryLines, ws?.snapshot?.productionJobAccessoryUsage]);

  const accessoriesSuppliedForApi = useMemo(
    () =>
      accessoryCompletionDraft.map((r) => ({
        quoteLineId: r.quoteLineId,
        name: r.name,
        suppliedQty: Number(String(r.suppliedThisJob).replace(/,/g, '')) || 0,
      })),
    [accessoryCompletionDraft]
  );
  const accessoryDraftPage = useAppTablePaging(
    accessoryCompletionDraft,
    APP_DATA_TABLE_PAGE_SIZE,
    selectedJob?.jobID
  );

  const conversionPreviewKey = useMemo(() => {
    if (!canRunConversionPreview || !selectedJob?.jobID) return '';
    if (isStoneMeterQuote) {
      return JSON.stringify({
        job: selectedJob.jobID,
        stone: true,
        stoneMetersConsumed: Number(String(stoneMetersConsumed).replace(/,/g, '')),
        accessoriesSupplied: accessoriesSuppliedForApi,
      });
    }
    return JSON.stringify({
      job: selectedJob.jobID,
      lines: draftAllocations.map((row) => completionLineFromDraft(row)),
      accessoriesSupplied: accessoriesSuppliedForApi,
    });
  }, [
    accessoriesSuppliedForApi,
    canRunConversionPreview,
    draftAllocations,
    isStoneMeterQuote,
    selectedJob,
    stoneMetersConsumed,
  ]);

  useEffect(() => {
    if (conversionPreviewTimerRef.current) {
      clearTimeout(conversionPreviewTimerRef.current);
      conversionPreviewTimerRef.current = null;
    }
    if (!conversionPreviewKey || !selectedJob?.jobID) {
      conversionPreviewSeqRef.current += 1;
      setConversionPreview(null);
      setConversionPreviewError('');
      setConversionPreviewLoading(false);
      return;
    }
    setConversionPreviewLoading(true);
    setConversionPreviewError('');
    const seq = ++conversionPreviewSeqRef.current;
    conversionPreviewTimerRef.current = window.setTimeout(() => {
      conversionPreviewTimerRef.current = null;
      void (async () => {
        const parsed = JSON.parse(conversionPreviewKey);
        const previewPath = `/api/production-jobs/${encodeURIComponent(parsed.job)}/conversion-preview`;
        const previewBody = parsed.stone
          ? {
              stoneMetersConsumed: parsed.stoneMetersConsumed,
              accessoriesSupplied: parsed.accessoriesSupplied || [],
            }
          : {
              allocations: parsed.lines,
              accessoriesSupplied: parsed.accessoriesSupplied || [],
            };
        const { ok, data } = await apiFetch(previewPath, {
          method: 'POST',
          body: JSON.stringify(previewBody),
        });
        if (seq !== conversionPreviewSeqRef.current) return;
        setConversionPreviewLoading(false);
        if (!ok || !data?.ok) {
          setConversionPreview(null);
          setConversionPreviewError(data?.error || 'Could not preview conversion.');
          return;
        }
        setConversionPreview(data);
        setConversionPreviewError('');
      })();
    }, 450);
    return () => {
      if (conversionPreviewTimerRef.current) {
        clearTimeout(conversionPreviewTimerRef.current);
        conversionPreviewTimerRef.current = null;
      }
    };
  }, [conversionPreviewKey, selectedJob?.jobID]);

  const readOnly = Boolean(viewOnly) || selectedJob?.status === 'Completed';
  const canEditPlannedAllocations = selectedJob?.status === 'Planned' && !readOnly;
  const canAddSupplementalCoil = selectedJob?.status === 'Running' && !readOnly && !isStoneMeterQuote;
  const canCaptureRun = selectedJob?.status === 'Running' && !readOnly;
  const completionValidation = useMemo(() => {
    if (isStoneMeterQuote) {
      const m = Number(String(stoneMetersConsumed).replace(/,/g, ''));
      if (!Number.isFinite(m) || m <= 0) {
        return { validLineCount: 0, errors: ['Enter stone metres consumed.'], canComplete: false };
      }
      return { validLineCount: 1, errors: [], canComplete: true };
    }
    const errors = [];
    const seenCoils = new Set();
    let validLineCount = 0;
    draftAllocations.forEach((row, idx) => {
      const label = `Line ${idx + 1}`;
      const coil = row.coilNo?.trim();
      const opening = Number(row.openingWeightKg);
      const closing = Number(row.closingWeightKg);
      const meters = Number(row.metersProduced);
      if (!coil && !row.openingWeightKg && !row.closingWeightKg && !row.metersProduced) return;
      if (!coil) errors.push(`${label}: select a coil.`);
      if (!Number.isFinite(opening) || opening <= 0) errors.push(`${label}: opening kg must be greater than 0.`);
      if (!Number.isFinite(closing) || closing < 0) errors.push(`${label}: closing kg is required.`);
      if (Number.isFinite(opening) && Number.isFinite(closing) && closing > opening) {
        errors.push(`${label}: closing kg cannot exceed opening kg.`);
      }
      if (!Number.isFinite(meters) || meters <= 0) errors.push(`${label}: meters produced must be greater than 0.`);
      if (coil) {
        if (seenCoils.has(coil)) errors.push(`${label}: duplicate coil ${coil}.`);
        seenCoils.add(coil);
      }
      if (
        coil &&
        Number.isFinite(opening) &&
        opening > 0 &&
        Number.isFinite(closing) &&
        closing >= 0 &&
        closing <= opening &&
        Number.isFinite(meters) &&
        meters > 0
      ) {
        validLineCount += 1;
      }
    });
    return { validLineCount, errors, canComplete: validLineCount > 0 && errors.length === 0 };
  }, [draftAllocations, isStoneMeterQuote, stoneMetersConsumed]);

  const appendSaveReady = useMemo(
    () =>
      draftAllocations.some(
        (r) => isDraftAllocationRow(r) && r.coilNo?.trim() && Number(r.openingWeightKg) > 0
      ),
    [draftAllocations]
  );
  const plannedAllocSaveReady = useMemo(
    () =>
      isStoneMeterQuote ||
      draftAllocations.some((r) => r.coilNo?.trim() && Number(r.openingWeightKg) > 0),
    [draftAllocations, isStoneMeterQuote]
  );
  const canManageConversionSignoff =
    Boolean(ws?.hasPermission?.('production.release')) ||
    Boolean(ws?.hasPermission?.('operations.manage')) ||
    Boolean(ws?.hasPermission?.('production.manage'));
  /** Undo “Start” — same broad gate as other production fixes (tighten in roles if needed). */
  const canReturnJobToPlanned =
    Boolean(ws?.hasPermission?.('production.release')) ||
    Boolean(ws?.hasPermission?.('operations.manage')) ||
    Boolean(ws?.hasPermission?.('production.manage'));
  /** Finished-goods metre corrections after completion — manager / release only (not plain production.manage). */
  const canPostFgCompletionAdjustment =
    Boolean(ws?.hasPermission?.('production.release')) || Boolean(ws?.hasPermission?.('operations.manage'));
  const plannedMetersValue = Number(selectedJob?.plannedMeters || 0);
  const hasPlannedMeters = Number.isFinite(plannedMetersValue) && plannedMetersValue > 0;
  const overProducedMeters =
    hasPlannedMeters && Number.isFinite(recordedMeters) ? recordedMeters - plannedMetersValue : 0;
  const requiresManagerOverrunApproval = overProducedMeters > 0.01;

  const planProgressPct = useMemo(() => {
    if (!hasPlannedMeters) return null;
    const pct = (recordedMeters / plannedMetersValue) * 100;
    return Math.min(200, Math.round(pct * 10) / 10);
  }, [hasPlannedMeters, recordedMeters, plannedMetersValue]);

  const workflowStep = selectedJob?.status === 'Planned' ? 0 : selectedJob?.status === 'Running' ? 1 : 2;
  const postedOutputM = Number(selectedJob?.actualMeters ?? 0);
  const fgAdjTotalM = Number(selectedJob?.fgAdjustmentMetersTotal ?? 0);
  const effectiveOutputM = Number(
    selectedJob?.effectiveOutputMeters ?? postedOutputM + fgAdjTotalM
  );

  const submitManagerSignoff = async () => {
    if (!selectedJob?.jobID) return;
    const remark = signoffRemark.trim();
    if (remark.length < 3) {
      showToast('Enter a sign-off remark (at least 3 characters).', { variant: 'error' });
      return;
    }
    if (!ws?.canMutate) {
      showToast('Reconnect to sign off — workspace is read-only.', { variant: 'error' });
      return;
    }
    /** Always use job-scoped URL — cutting-list routes require `production_registered` and can 404 on legacy rows. */
    const path = `/api/production-jobs/${encodeURIComponent(selectedJob.jobID)}/manager-review-signoff`;
    setSignoffSaving(true);
    try {
      const { ok, data } = await apiFetch(path, {
        method: 'PATCH',
        body: JSON.stringify({
          remark,
          ...(signoffEditApprovalId.trim() ? { editApprovalId: signoffEditApprovalId.trim() } : {}),
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || `Could not record sign-off (${data?.code || 'request failed'}).`, {
          variant: 'error',
        });
        return;
      }
      await ws.refresh();
      showToast('Manager sign-off recorded.');
      setSignoffRemark('');
      setSignoffEditApprovalId('');
    } catch (e) {
      showToast(e?.message || 'Network error — could not reach server.', { variant: 'error' });
    } finally {
      setSignoffSaving(false);
    }
  };

  const submitReturnToPlanned = async () => {
    if (!selectedJob?.jobID) return;
    const reason = returnReason.trim();
    if (reason.length < 8) {
      showToast('Enter a reason (at least 8 characters) for the audit trail.', { variant: 'error' });
      return;
    }
    if (!ws?.canMutate) {
      showToast('Reconnect to apply changes — workspace is read-only.', { variant: 'error' });
      return;
    }
    const path = `/api/production-jobs/${encodeURIComponent(selectedJob.jobID)}/return-to-planned`;
    setReturnSaving(true);
    try {
      const { ok, data } = await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not return job to plan.', { variant: 'error' });
        return;
      }
      setReturnModalOpen(false);
      setReturnReason('');
      await ws.refresh();
      showToast('Job returned to plan — you can fix coils and save allocation again.');
    } catch (e) {
      showToast(e?.message || 'Network error.', { variant: 'error' });
    } finally {
      setReturnSaving(false);
    }
  };

  const submitFgAdjustment = async () => {
    if (!selectedJob?.jobID) return;
    const delta = Number(String(fgAdjDelta).replace(/,/g, ''));
    const note = fgAdjNote.trim();
    if (!Number.isFinite(delta) || Math.abs(delta) < 1e-6) {
      showToast('Enter a non-zero adjustment in metres (use negative to reduce stock).', { variant: 'error' });
      return;
    }
    if (note.length < 12) {
      showToast('Enter a detailed note (at least 12 characters).', { variant: 'error' });
      return;
    }
    if (!ws?.canMutate) {
      showToast('Reconnect to apply changes — workspace is read-only.', { variant: 'error' });
      return;
    }
    const okConfirm = window.confirm(
      `Post finished-goods adjustment of ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} m to ${selectedJob.productID || 'SKU'}? This is logged and updates stock — it does not rewrite the original completion.`
    );
    if (!okConfirm) return;
    const path = `/api/production-jobs/${encodeURIComponent(selectedJob.jobID)}/completion-adjustments`;
    setFgAdjSaving(true);
    try {
      const { ok, data } = await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify({ deltaFinishedGoodsM: delta, note }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not post adjustment.', { variant: 'error' });
        return;
      }
      setFgAdjDelta('');
      setFgAdjNote('');
      await ws.refresh();
      showToast(`Adjustment recorded. Stock now ~${Number(data.productStockMetersAfter).toFixed(2)} m for SKU.`);
    } catch (e) {
      showToast(e?.message || 'Network error.', { variant: 'error' });
    } finally {
      setFgAdjSaving(false);
    }
  };

  const updateDraftRow = (id, patch) => {
    setDraftAllocations((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addDraftRow = () => {
    if (!canEditPlannedAllocations && !canAddSupplementalCoil) return;
    setDraftAllocations((prev) => [...prev, createDraftLine()]);
  };

  const removeDraftRow = (id) => {
    const row = draftAllocations.find((r) => r.id === id);
    if (!row) return;
    if (canEditPlannedAllocations) {
      setDraftAllocations((prev) => (prev.length <= 1 ? [createDraftLine()] : prev.filter((r) => r.id !== id)));
      return;
    }
    if (canAddSupplementalCoil && isDraftAllocationRow(row)) {
      setDraftAllocations((prev) => (prev.length <= 1 ? [createDraftLine()] : prev.filter((r) => r.id !== id)));
    }
  };

  const buildCompleteBody = () => {
    if (isStoneMeterQuote) {
      return {
        completedAtISO: new Date().toISOString().slice(0, 10),
        stoneMetersConsumed: Number(String(stoneMetersConsumed).replace(/,/g, '')),
        accessoriesSupplied: accessoriesSuppliedForApi,
        allocations: [],
      };
    }
    return {
      completedAtISO: new Date().toISOString().slice(0, 10),
      allocations: draftAllocations.map((row) => completionLineFromDraft(row)),
      accessoriesSupplied: accessoriesSuppliedForApi,
    };
  };

  const persist = async (type) => {
    if (!selectedJob?.jobID) return;
    if (!ws?.canMutate) {
      showToast(
        ws?.usingCachedData
          ? 'Read-only workspace — reconnect to save production changes.'
          : 'Start the API server to use live production traceability.',
        { variant: 'error' }
      );
      return;
    }
    const jobApi = `/api/production-jobs/${encodeURIComponent(selectedJob.jobID)}`;
    const listLabel = selectedJob.cuttingListId || selectedJob.jobID;
    setSavingAction(type);
    let path = '';
    let body = {};
    if (type === 'allocations') {
      path = `${jobApi}/allocations`;
      if (isStoneMeterQuote && selectedJob.status === 'Planned') {
        setSavingAction('');
        const res = await apiFetch(path, { method: 'POST', body: JSON.stringify({ allocations: [] }) });
        if (!res.ok || !res.data?.ok) {
          showToast(res.data?.error || 'Could not save stone job allocation.', { variant: 'error' });
          return;
        }
        await ws.refresh();
        setStoneAllocAck(true);
        showToast(`Stone-coated job ready to start (${listLabel}).`);
        return;
      }
      const buildAllocBody = (withAck) => {
        if (selectedJob.status === 'Running') {
          const toAppend = draftAllocations.filter(
            (row) => isDraftAllocationRow(row) && row.coilNo?.trim() && Number(row.openingWeightKg) > 0
          );
          if (!toAppend.length) return null;
          return {
            append: true,
            allocations: toAppend.map((row) => ({
              coilNo: row.coilNo.trim(),
              openingWeightKg: Number(row.openingWeightKg),
              note: row.note.trim(),
              ...(withAck ? { specMismatchAcknowledged: true } : {}),
            })),
          };
        }
        const allocations = draftAllocations
          .map((row) => ({
            coilNo: row.coilNo.trim(),
            openingWeightKg: Number(row.openingWeightKg),
            note: row.note.trim(),
            ...(withAck ? { specMismatchAcknowledged: true } : {}),
          }))
          .filter((row) => row.coilNo && row.openingWeightKg > 0);
        if (!allocations.length) return null;
        return { allocations };
      };
      const firstBody = buildAllocBody(false);
      if (!firstBody) {
        showToast(
          selectedJob.status === 'Running'
            ? 'Add a new coil row with opening kg, then save to attach it to this run.'
            : 'Add at least one coil with opening kg before saving.',
          { variant: 'info' }
        );
        setSavingAction('');
        return;
      }
      let res = await apiFetch(path, { method: 'POST', body: JSON.stringify(firstBody) });
      if (!res.ok && res.data?.code === 'PRODUCTION_SPEC_MISMATCH') {
        const detail = (res.data.mismatches || [])
          .map((m) => `${m.coilNo}: ${m.detail}`)
          .join('\n');
        const go = window.confirm(
          `These coils do not match the quotation material specification (gauge / colour / material):\n\n${detail}\n\nSave anyway and flag the branch manager for review?`
        );
        if (go) {
          const second = buildAllocBody(true);
          if (second) res = await apiFetch(path, { method: 'POST', body: JSON.stringify(second) });
        }
      }
      setSavingAction('');
      if (!res.ok || !res.data?.ok) {
        showToast(res.data?.error || 'Could not update production.', { variant: 'error' });
        return;
      }
      await ws.refresh();
      showToast(
        selectedJob.status === 'Running'
          ? `Supplemental coil(s) saved on ${listLabel}.`
          : `Coil allocation saved for ${listLabel}.`
      );
      return;
    } else if (type === 'start') {
      path = `${jobApi}/start`;
      body = { startedAtISO: new Date().toISOString().slice(0, 10) };
    } else {
      if (!completionValidation.canComplete) {
        showToast(
          completionValidation.errors[0] ||
            'Complete run log fields (coil, opening, closing, meters) before completion.',
          { variant: 'error' }
        );
        setSavingAction('');
        return;
      }
      if (requiresManagerOverrunApproval) {
        if (!canManageConversionSignoff) {
          showToast(
            `Recorded metres (${recordedMeters.toFixed(2)}m) exceed planned (${plannedMetersValue.toFixed(2)}m). Seek manager approval to complete.`,
            { variant: 'error' }
          );
          setSavingAction('');
          return;
        }
        const remark = signoffRemark.trim();
        if (remark.length < 3) {
          showToast('Manager approval remark is required for meter overrun (at least 3 characters).', {
            variant: 'error',
          });
          setSavingAction('');
          return;
        }
        const proceedOverrun = window.confirm(
          `Metres recorded exceed plan by ${overProducedMeters.toFixed(2)}m. Continue as manager-approved overrun?`
        );
        if (!proceedOverrun) {
          setSavingAction('');
          return;
        }
      }
      const completeBody = buildCompleteBody();
      const previewUrl = `${jobApi}/conversion-preview`;
      const prev = await apiFetch(previewUrl, {
        method: 'POST',
        body: JSON.stringify(completeBody),
      });
      if (prev.ok && prev.data?.ok && prev.data.managerReviewRequired) {
        const proceed = window.confirm(
          'This completion will flag manager review (conversion outside expected bands versus multiple references). Post anyway?'
        );
        if (!proceed) {
          setSavingAction('');
          setConversionPreview(prev.data);
          return;
        }
      }
      path = `${jobApi}/complete`;
      body = completeBody;
    }
    const { ok, data } = await apiFetch(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setSavingAction('');
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not update production.', { variant: 'error' });
      return;
    }
    await ws.refresh();
    if (type === 'start') {
      showToast(`Production started for ${listLabel}.`);
    } else {
      setConversionPreview(null);
      if (data.managerReviewRequired) {
        showToast(`Production completed — manager review required (${data.alertState || 'alert'}).`, {
          variant: 'error',
        });
      } else if (data.alertState && data.alertState !== 'OK') {
        showToast(`Production completed — conversion ${String(data.alertState).toLowerCase()} band.`, {
          variant: 'warning',
        });
      } else {
        showToast(`Production completed for ${listLabel}.`);
      }
    }
  };

  if (!ws?.hasWorkspaceData) {
    return (
      <div className="mb-8 rounded-zarewa border border-dashed border-slate-200 bg-slate-50/70 px-5 py-6 text-sm text-slate-500">
        Live production traceability appears after you sign in with a reachable server.
      </div>
    );
  }

  if (!selectedJob) {
    const missing = focusClTrim || null;
    return (
      <div
        className={`${
          inModal ? 'mb-0' : 'mb-8'
        } rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-4 text-xs text-slate-500`}
      >
        {missing ? (
          <>
            Cutting list <span className="font-mono font-bold text-slate-700">{missing}</span> is not registered for
            production or data is still syncing. Close and pick another row, or refresh the workspace.
          </>
        ) : (
          <>
            No cutting lists on the production queue yet. In Sales, open a cutting list and use{" "}
            <strong className="font-semibold text-slate-600">Send to production line</strong> after the quote is paid
            enough to qualify.
          </>
        )}
        <div className="mt-2">
          <button type="button" className="z-btn-secondary" onClick={() => void ws?.refresh?.()}>
            Refresh workspace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${
        inModal ? 'mb-0' : 'mb-6'
      } rounded-xl border border-slate-200/80 bg-slate-50/50 overflow-hidden shadow-sm`}
    >
      {/* Header: title, workflow stepper, actions */}
      <div
        className={`border-b border-slate-200/80 bg-gradient-to-r from-white via-teal-50/25 to-white ${
          inModal ? 'px-2.5 py-2 sm:px-3 sticky top-0 z-20 backdrop-blur-md bg-white/90' : 'px-3 py-2 sm:px-4'
        }`}
      >
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#134e4a] to-teal-700 text-white shadow-sm">
              <Gauge size={18} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-sm font-bold tracking-tight text-slate-900">Production record</h3>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-teal-100/90 px-1.5 py-px text-[9px] font-semibold text-teal-900">
                  <Sparkles size={10} className="shrink-0" aria-hidden />
                  Live
                </span>
              </div>
              <p className="mt-0.5 hidden max-w-2xl text-[11px] leading-snug text-slate-500 md:block">
                Mistakes before start: save allocation again. Wrong coil after start: Return to plan (reason required).
                After completion: original record stays; FG metre fixes use manager adjustment. Conversion alerts:
                manager sign-off.
              </p>
              {/* Stepper */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1" role="list" aria-label="Workflow steps">
                {['Allocate coils', 'Run & log', 'Review'].map((label, i) => (
                  <React.Fragment key={label}>
                    {i > 0 ? (
                      <span className="hidden text-slate-300 sm:inline" aria-hidden>
                        →
                      </span>
                    ) : null}
                    <span
                      role="listitem"
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-semibold transition-colors ${
                        i === workflowStep
                          ? 'bg-[#134e4a] text-white shadow-sm'
                          : i < workflowStep
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <ListOrdered size={12} className="shrink-0 opacity-80" aria-hidden />
                      {label}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
            {readOnly ? (
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">
                View only
              </span>
            ) : (
              <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200/80 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => void persist('allocations')}
                  disabled={
                    savingAction !== '' ||
                    (selectedJob.status === 'Planned' && (!canEditPlannedAllocations || !plannedAllocSaveReady)) ||
                    (selectedJob.status === 'Running' && (!canAddSupplementalCoil || !appendSaveReady))
                  }
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-45 ${
                    savingAction === 'allocations'
                      ? 'bg-slate-100 text-slate-500'
                      : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  <Save size={15} />
                  {savingAction === 'allocations'
                    ? 'Saving…'
                    : selectedJob.status === 'Running'
                      ? 'Save extra coil'
                      : 'Save allocation'}
                </button>
                <button
                  type="button"
                  onClick={() => void persist('start')}
                  disabled={
                    selectedJob.status !== 'Planned' ||
                    savingAction !== '' ||
                    (!hasPersistedCoilAllocations && !(isStoneMeterQuote && stoneAllocAck))
                  }
                  title={
                    !hasPersistedCoilAllocations && !(isStoneMeterQuote && stoneAllocAck)
                      ? isStoneMeterQuote
                        ? 'Save allocations (stone job) before starting.'
                        : 'Save at least one coil with opening kg before starting.'
                      : undefined
                  }
                  className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:opacity-45"
                >
                  <Play size={13} />
                  {savingAction === 'start' ? 'Starting…' : 'Start'}
                </button>
                <button
                  type="button"
                  onClick={() => void persist('complete')}
                  disabled={!canCaptureRun || savingAction !== '' || !completionValidation.canComplete}
                  title={
                    completionValidation.canComplete
                      ? undefined
                      : completionValidation.errors[0] || 'Complete all run-log fields before completion.'
                  }
                  className="inline-flex items-center gap-1 rounded-md bg-[#134e4a] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#0f3d39] disabled:opacity-45"
                >
                  <CheckCircle2 size={13} />
                  {savingAction === 'complete' ? 'Completing…' : 'Complete'}
                </button>
                {selectedJob.status === 'Running' && canReturnJobToPlanned ? (
                  <button
                    type="button"
                    onClick={() => setReturnModalOpen(true)}
                    disabled={savingAction !== '' || returnSaving}
                    title="Undo Start: go back to Planned so you can change coil allocation (audit reason required)."
                    className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-45"
                  >
                    <Undo2 size={13} />
                    Return to plan
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Smart alerts — compact chips */}
      <div className="border-b border-slate-100 bg-slate-50/70 px-2 py-1 sm:px-3">
        <div className="flex flex-wrap gap-1.5">
          {readOnly ? (
            <span className="inline-flex max-w-full items-start gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
              Finished run — review conversion below; actions are off.
              {Math.abs(fgAdjTotalM) > 1e-6 ? (
                <span className="block w-full pt-0.5 text-slate-500">
                  Effective output {formatMeters(effectiveOutputM)} m (posted {formatMeters(postedOutputM)} m + adjustments{' '}
                  {fgAdjTotalM >= 0 ? '+' : ''}
                  {formatMeters(fgAdjTotalM)} m).
                </span>
              ) : null}
            </span>
          ) : null}
          {!readOnly ? (
            <span className="inline-flex max-w-full items-start gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600">
              <ClipboardList size={14} className="mt-0.5 shrink-0 text-slate-500" />
              <span>
                <strong className="text-slate-700">Designed for real teams:</strong> easy steps, spec hints, and
                guarded corrections (reasons + permissions) so honest errors are fixable without hiding audit history.
              </span>
            </span>
          ) : null}
          {canEditPlannedAllocations && !hasPersistedCoilAllocations && !isStoneMeterQuote ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-950">
              <AlertTriangle size={14} className="shrink-0" />
              Save coil + opening kg before start.
            </span>
          ) : null}
          {canEditPlannedAllocations && isStoneMeterQuote && !stoneAllocAck ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-950">
              <AlertTriangle size={14} className="shrink-0" />
              Stone-coated: save allocation once (no coils), then start.
            </span>
          ) : null}
          {canAddSupplementalCoil ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] text-sky-950">
              <Plus size={14} className="shrink-0" />
              Mid-run: <strong className="font-semibold">Add coil</strong> if one roll is not enough.
            </span>
          ) : null}
          {selectedJob?.coilSpecMismatchPending ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-950">
              <AlertTriangle size={14} className="shrink-0" />
              Spec exception logged — manager flag active.
            </span>
          ) : null}
          {canCaptureRun && !completionValidation.canComplete ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-900">
              <AlertTriangle size={14} className="shrink-0" />
              {completionValidation.errors[0] || 'Complete all coil rows to finish.'}
            </span>
          ) : null}
          {canCaptureRun && requiresManagerOverrunApproval ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-950">
              <BarChart3 size={14} className="shrink-0" />
              +{overProducedMeters.toFixed(2)}m over plan — manager remark needed to complete.
            </span>
          ) : null}
          {!readOnly &&
          canCaptureRun &&
          completionValidation.canComplete &&
          !requiresManagerOverrunApproval &&
          hasPlannedMeters ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-900">
              <Sparkles size={14} className="shrink-0" />
              {planProgressPct != null
                ? `${planProgressPct}% of planned metres logged — preview updates as you type.`
                : 'Ready to preview conversion when all fields are valid.'}
            </span>
          ) : null}
        </div>
      </div>

      <div
        className={`grid ${inModal ? 'gap-2 p-2 sm:p-3' : 'gap-3 p-3 sm:p-3.5'} ${
          hideJobSidebar ? '' : 'lg:grid-cols-[minmax(0,11.5rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,12.5rem)_minmax(0,1fr)]'
        }`}
      >
        {!hideJobSidebar ? (
          <aside className="space-y-1 lg:sticky lg:top-2 lg:self-start">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Queue</p>
              <span className="rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                {sortedJobs.length}
              </span>
            </div>
            <div className="flex max-h-[min(58vh,22rem)] flex-col gap-1 overflow-y-auto pr-0.5 custom-scrollbar">
              {sortedJobs.map((job) => {
                const active = selectedJob.jobID === job.jobID;
                const allocN = coilAllocationCountByJob.get(job.jobID) || 0;
                return (
                  <button
                    key={job.jobID}
                    type="button"
                    onClick={() => setSelectedJobId(job.jobID)}
                    className={`w-full rounded-lg border p-1.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/30 ${
                      active
                        ? 'border-[#134e4a]/40 bg-white shadow-sm ring-1 ring-[#134e4a]/15'
                        : 'border-slate-200/90 bg-white/80 hover:border-teal-300/60 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-mono text-[11px] font-bold text-[#134e4a]">
                        {job.cuttingListId || job.jobID}
                      </p>
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[8px] font-bold uppercase ${statusTone(job.status)}`}
                      >
                        {job.status === 'Running' ? 'Run' : job.status === 'Planned' ? 'Plan' : 'Done'}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-700">{job.customerName || '—'}</p>
                    <p className="truncate text-[9px] text-slate-500">{job.productName || job.productID || '—'}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-slate-500">
                      <span className="tabular-nums">{formatMeters(job.plannedMeters)} plan</span>
                      {job.quotationRef ? <span className="text-slate-400">· {job.quotationRef}</span> : null}
                    </div>
                    {job.status === 'Planned' ? (
                      <p
                        className={`mt-1 text-[9px] font-semibold ${allocN === 0 ? 'text-amber-700' : 'text-slate-500'}`}
                      >
                        {allocN === 0 ? 'No coils saved' : `${allocN} coil(s)`}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </aside>
        ) : null}

        <div className={`min-w-0 ${inModal ? 'space-y-2' : 'space-y-2.5'}`}>
          {/* Mission control — single dense card */}
          <div className="overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-100 bg-gradient-to-br from-slate-50/80 to-white p-2 sm:flex-row sm:items-center sm:justify-between sm:p-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="font-mono text-sm font-bold tracking-tight text-[#134e4a]">
                    {selectedJob.cuttingListId || '—'}
                  </p>
                  <span
                    className={`rounded-md px-1.5 py-px text-[9px] font-bold uppercase ${statusTone(selectedJob.status)}`}
                  >
                    {selectedJob.status}
                  </span>
                </div>
                <p className="mt-0.5 text-xs font-semibold text-slate-800">{selectedJob.customerName || '—'}</p>
                <p className="text-[11px] leading-tight text-slate-600">{selectedJob.productName || selectedJob.productID || '—'}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedJob.quotationRef ? (
                    <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-px text-[9px] font-medium text-slate-700">
                      Q <span className="ml-0.5 font-mono">{selectedJob.quotationRef}</span>
                    </span>
                  ) : null}
                  <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-px text-[9px] font-medium text-slate-700">
                    {selectedJob.machineName || 'Line'}
                  </span>
                </div>
              </div>
              <div className="grid w-full shrink-0 grid-cols-3 gap-1 sm:w-auto sm:min-w-[13rem]">
                <div className="rounded-md border border-teal-100 bg-teal-50/60 px-1.5 py-1 text-center" title="Reserved kg">
                  <p className="text-[8px] font-bold uppercase tracking-wide text-teal-800/80">Rsvd</p>
                  <p className="text-xs font-bold tabular-nums text-[#134e4a]">{formatKg(reservedKg)}</p>
                </div>
                <div className="rounded-md border border-teal-100 bg-teal-50/60 px-1.5 py-1 text-center" title="Output metres">
                  <p className="text-[8px] font-bold uppercase tracking-wide text-teal-800/80">Out</p>
                  <p className="text-xs font-bold tabular-nums text-[#134e4a]">
                    {formatMeters(recordedMeters)}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50/80 px-1.5 py-1 text-center" title="Consumed kg">
                  <p className="text-[8px] font-bold uppercase tracking-wide text-slate-500">Used</p>
                  <p className="text-xs font-bold tabular-nums text-slate-800">
                    {formatKg(recordedConsumedKg)}
                  </p>
                </div>
              </div>
            </div>
            {hasPlannedMeters && (selectedJob.status === 'Running' || selectedJob.status === 'Planned') ? (
              <div className="border-b border-slate-100 px-2 py-1 sm:px-2.5">
                <div className="flex items-center justify-between gap-2 text-[9px] font-medium text-slate-600">
                  <span>vs plan</span>
                  <span className="tabular-nums">
                    {formatMeters(recordedMeters)} / {formatMeters(plannedMetersValue)}
                    {planProgressPct != null ? (
                      <span className="ml-1 text-[#134e4a]">({planProgressPct}%)</span>
                    ) : null}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200/80">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      planProgressPct != null && planProgressPct > 100 ? 'bg-amber-500' : 'bg-gradient-to-r from-teal-500 to-[#134e4a]'
                    }`}
                    style={{
                      width: `${Math.min(100, planProgressPct != null ? planProgressPct : 0)}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
            <div className="p-2 sm:p-2.5">
              <p className="text-[9px] font-bold uppercase tracking-wide text-[#134e4a]/90">Target spec</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {[
                  ['Gauge', quotationMaterialSpec.gauge],
                  ['Colour', quotationMaterialSpec.colour],
                  ['Material', quotationMaterialSpec.materialType],
                  ['Design', quotationMaterialSpec.design],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="min-w-0 flex-1 rounded border border-slate-100 bg-slate-50/80 px-1.5 py-1 sm:max-w-[7rem] sm:flex-none"
                  >
                    <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-400">{k}</p>
                    <p className="truncate text-[11px] font-bold text-slate-800">{v || '—'}</p>
                  </div>
                ))}
              </div>
              {recommendedCoils.length > 0 ? (
                <p className="mt-1 flex items-start gap-1 text-[10px] font-medium text-teal-800">
                  <Sparkles size={14} className="mt-0.5 shrink-0" />
                  {recommendedCoils.length} matching coil{recommendedCoils.length === 1 ? '' : 's'} in stock — shown first
                  in the picker.
                </p>
              ) : linkedQuotation || jobProductAttrs ? (
                <p className="mt-1 flex items-start gap-1 text-[10px] font-medium text-amber-800">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  No perfect stock match — choose closest coil or save with acknowledgement.
                </p>
              ) : null}
            </div>
          </div>

          {canCaptureRun && accessoryCompletionDraft.length > 0 ? (
            <div className="rounded-lg border border-teal-200/80 bg-teal-50/40 p-2 sm:p-2.5 space-y-1.5">
              <p className="text-[9px] font-black uppercase tracking-widest text-[#134e4a]">
                Accessories issued (this completion)
              </p>
              <p className="text-[9px] text-slate-600 leading-snug">
                Ordered on the quote vs already posted from other completed jobs. Adjust &ldquo;This job&rdquo; to match
                what leaves stock; shortfalls can be refunded under Accessory shortfall.
              </p>
              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-2 py-2">Item</th>
                        <th className="px-2 py-2 text-right">Ordered</th>
                        <th className="px-2 py-2 text-right">Prior jobs</th>
                        <th className="px-2 py-2 text-right">Remaining</th>
                        <th className="px-2 py-2 text-right">This job</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {accessoryDraftPage.slice.map((row) => {
                        const remaining = Math.max(0, row.ordered - row.priorSupplied);
                        return (
                          <tr key={row.key} className="hover:bg-teal-50/20">
                            <td className="max-w-0 px-2 py-2 font-semibold text-slate-800 whitespace-nowrap truncate" title={row.name}>
                              {row.name}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-600">{row.ordered}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-600">{row.priorSupplied}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-600">{remaining}</td>
                            <td className="px-2 py-2 text-right whitespace-nowrap">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.suppliedThisJob}
                                onChange={(e) =>
                                  setAccessoryCompletionDraft((prev) =>
                                    prev.map((r) =>
                                      r.key === row.key ? { ...r, suppliedThisJob: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-right font-mono text-sm font-bold text-[#134e4a] outline-none focus:ring-2 focus:ring-teal-500/20"
                                aria-label={`Supplied this job for ${row.name}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {accessoryCompletionDraft.length > APP_DATA_TABLE_PAGE_SIZE ? (
                  <div className="border-t border-slate-100 px-2 py-2">
                    <AppTablePager
                      showingFrom={accessoryDraftPage.showingFrom}
                      showingTo={accessoryDraftPage.showingTo}
                      total={accessoryDraftPage.total}
                      hasPrev={accessoryDraftPage.hasPrev}
                      hasNext={accessoryDraftPage.hasNext}
                      onPrev={accessoryDraftPage.goPrev}
                      onNext={accessoryDraftPage.goNext}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {readOnly &&
          selectedJob?.status === 'Completed' &&
          (ws?.snapshot?.productionJobAccessoryUsage || []).some((u) => u.jobID === selectedJob.jobID) ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2 sm:p-2.5 space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Accessories posted</p>
              <ul className="space-y-1 text-[10px] text-slate-700">
                {(ws?.snapshot?.productionJobAccessoryUsage || [])
                  .filter((u) => u.jobID === selectedJob.jobID)
                  .map((u) => (
                    <li key={u.id} className="flex justify-between gap-2">
                      <span className="font-semibold">{u.name}</span>
                      <span className="font-mono tabular-nums">
                        supplied {u.suppliedQty} / ordered {u.orderedQty}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          {selectedJob.status === 'Completed' && selectedJob.managerReviewSignedAtISO ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 px-2.5 py-2 text-xs text-emerald-950">
              <div className="flex items-start gap-1.5">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-700" />
                <div className="min-w-0 space-y-1">
                  <p className="font-black uppercase tracking-wide text-emerald-900">Manager sign-off recorded</p>
                  <p className="text-xs text-emerald-900/90">
                    <span className="font-semibold">{selectedJob.managerReviewSignedByName || 'Manager'}</span>
                    {selectedJob.managerReviewSignedAtISO ? (
                      <span className="text-emerald-800/80">
                        {' '}
                        · {String(selectedJob.managerReviewSignedAtISO).slice(0, 10)}
                      </span>
                    ) : null}
                  </p>
                  {selectedJob.managerReviewRemark ? (
                    <p className="text-xs text-emerald-900/85 border-t border-emerald-200/80 pt-2 mt-2 whitespace-pre-wrap">
                      {selectedJob.managerReviewRemark}
                    </p>
                  ) : null}
                  <p className="text-[9px] text-emerald-800/70 pt-0.5">
                    Conversion alert on this job remains visible below for audit; dashboards no longer flag it for
                    action.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {readOnly && selectedJob.status === 'Completed' && selectedJob.productID ? (
            <div className="rounded-lg border border-indigo-200/90 bg-indigo-50/60 p-2.5 sm:p-3 space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-indigo-900/90">
                Finished-goods metres (after completion)
              </p>
              <p className="text-[11px] leading-snug text-indigo-950/90">
                Posted <span className="font-mono font-bold">{formatMeters(postedOutputM)}</span> m on this job
                {Math.abs(fgAdjTotalM) > 1e-6 ? (
                  <>
                    {' '}
                    · Adjustments{' '}
                    <span className="font-mono font-bold">
                      {fgAdjTotalM >= 0 ? '+' : ''}
                      {formatMeters(fgAdjTotalM)}
                    </span>{' '}
                    · Effective{' '}
                    <span className="font-mono font-bold">{formatMeters(effectiveOutputM)}</span> m
                  </>
                ) : (
                  <> · No FG adjustments yet</>
                )}
                . Original completion and coil conversion table below are <strong className="font-semibold">not</strong>{' '}
                rewritten — corrections are separate audit rows + stock movements.
              </p>
              {selectedJobAdjustments.length > 0 ? (
                <ul className="space-y-1 rounded-md border border-indigo-100 bg-white/90 px-2 py-1.5 text-[10px] text-slate-800">
                  {selectedJobAdjustments.map((a) => (
                    <li key={a.id} className="flex flex-col gap-0.5 border-b border-slate-100 pb-1 last:border-0 last:pb-0">
                      <span className="font-mono font-bold text-[#134e4a]">
                        {a.deltaFinishedGoodsM >= 0 ? '+' : ''}
                        {formatMeters(a.deltaFinishedGoodsM)} m
                      </span>
                      <span className="text-slate-600">
                        {a.createdByName || '—'} · {String(a.atISO || '').slice(0, 10)}
                      </span>
                      <span className="whitespace-pre-wrap text-slate-700">{a.note}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {canPostFgCompletionAdjustment ? (
                <div className="rounded-md border border-indigo-200 bg-white/95 p-2 space-y-1.5">
                  <p className="text-[10px] font-semibold text-indigo-950">Post adjustment (manager / release)</p>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex min-w-[8rem] flex-1 flex-col gap-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                      Δ metres (FG)
                      <input
                        type="text"
                        inputMode="decimal"
                        value={fgAdjDelta}
                        onChange={(e) => setFgAdjDelta(e.target.value)}
                        placeholder="e.g. -2.5 or 1"
                        className="rounded-md border border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-900"
                      />
                    </label>
                    <label className="flex min-w-[12rem] flex-[2] flex-col gap-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                      Note (≥12 chars)
                      <input
                        type="text"
                        value={fgAdjNote}
                        onChange={(e) => setFgAdjNote(e.target.value)}
                        placeholder="Physical recount / scanner error / …"
                        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-900"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={fgAdjSaving || !ws?.canMutate}
                    onClick={() => void submitFgAdjustment()}
                    className="inline-flex items-center justify-center gap-1 rounded-md bg-indigo-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-800 disabled:opacity-45"
                  >
                    {fgAdjSaving ? 'Posting…' : 'Post FG adjustment'}
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-indigo-900/80">
                  FG metre corrections require <strong className="font-semibold">Production release</strong> or{' '}
                  <strong className="font-semibold">Operations manager</strong> (so line staff cannot silently change
                  stock after completion).
                </p>
              )}
            </div>
          ) : null}

          {productionJobNeedsManagerReviewAttention(selectedJob) ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-900 space-y-2">
              <div className="flex items-start gap-1.5">
                <FileWarning size={15} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-black uppercase tracking-wide">Manager review required</p>
                  <p className="mt-1 text-xs">
                    Conversion is outside the expected band (High/Low versus references). Review the four-reference
                    checks below, then sign off with a short remark when satisfied.
                  </p>
                </div>
              </div>
              {canManageConversionSignoff ? (
                <div className="rounded-md border border-red-200/80 bg-white/80 p-2 space-y-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-red-900/80">
                    Sign-off remark
                  </label>
                  <textarea
                    value={signoffRemark}
                    onChange={(e) => setSignoffRemark(e.target.value)}
                    rows={2}
                    placeholder="e.g. Variance explained — coil edge trim / scale loss. Approved to close."
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-800 outline-none focus:ring-2 focus:ring-red-200 resize-y min-h-[2.75rem]"
                  />
                  {selectedJob?.jobID ? (
                    <EditSecondApprovalInline
                      entityKind="production_job"
                      entityId={selectedJob.jobID}
                      value={signoffEditApprovalId}
                      onChange={setSignoffEditApprovalId}
                    />
                  ) : null}
                  <button
                    type="button"
                    disabled={signoffSaving || !ws?.canMutate}
                    onClick={() => void submitManagerSignoff()}
                    className="z-btn-primary w-full sm:w-auto justify-center"
                  >
                    <CheckCircle2 size={16} /> {signoffSaving ? 'Saving…' : 'Record manager sign-off'}
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-red-900/85 font-medium">
                  Sign-off requires <strong className="font-semibold">Production manage</strong>,{' '}
                  <strong className="font-semibold">Production release</strong>, or{' '}
                  <strong className="font-semibold">Operations manage</strong> (admin has full access).
                </p>
              )}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
            <div className="flex flex-col gap-1.5 border-b border-slate-100 bg-slate-50/50 px-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-2.5">
              <div className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#134e4a]/10 text-[#134e4a]">
                  <ClipboardList size={15} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900">
                    {isStoneMeterQuote ? 'Stone-coated run' : 'Coils & run log'}
                  </p>
                  <p className="mt-px max-w-prose text-[10px] leading-tight text-slate-600 line-clamp-2">
                    {isStoneMeterQuote
                      ? 'Save allocation → Start → enter metres consumed from stone stock → Complete.'
                      : canEditPlannedAllocations
                        ? 'Coil + opening kg → Save → Start; then closing kg & metres.'
                        : canAddSupplementalCoil
                          ? 'Extra coil: new rows only until saved.'
                          : canCaptureRun
                            ? 'Closing weight & metres each row → Complete.'
                            : 'Closed — read-only.'}
                  </p>
                </div>
              </div>
              {!isStoneMeterQuote && (canEditPlannedAllocations || canAddSupplementalCoil) ? (
                <button
                  type="button"
                  onClick={addDraftRow}
                  className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-dashed border-[#134e4a]/35 bg-white px-2 py-1 text-[11px] font-semibold text-[#134e4a] hover:bg-teal-50"
                >
                  <Plus size={14} strokeWidth={2.5} />
                  Add coil
                </button>
              ) : null}
            </div>

            <div className={`${inModal ? 'space-y-1.5 p-2' : 'space-y-2 p-2 sm:p-2.5'}`}>
              {isStoneMeterQuote ? (
                <div className="rounded-lg border border-teal-100 bg-teal-50/50 p-3 text-[11px] text-slate-700 space-y-2">
                  <p>
                    <strong className="text-[#134e4a]">Stone-coated</strong> stock is tracked in metres (no coil
                    numbers). Use <strong>Save allocation</strong> once, then <strong>Start</strong>.
                  </p>
                  {selectedJob.status === 'Running' ? (
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Metres consumed (stone stock)
                      <input
                        type="text"
                        inputMode="decimal"
                        value={stoneMetersConsumed}
                        onChange={(e) => setStoneMetersConsumed(e.target.value)}
                        placeholder="e.g. 120.5"
                        className="mt-1 w-full max-w-[12rem] rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-sm font-bold text-[#134e4a]"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
              {!isStoneMeterQuote
                ? draftAllocations.map((row, index) => {
                const lot = coilByNo[row.coilNo];
                const addBackThisJob = row.coilNo ? savedOpeningKgByCoil.get(row.coilNo) ?? 0 : 0;
                const freeKg = lot
                  ? Math.max(
                      0,
                      Number(lot.qtyRemaining || 0) - Number(lot.qtyReserved || 0) + addBackThisJob
                    )
                  : 0;
                const draftRow = isDraftAllocationRow(row);
                const canPickCoilAndOpening =
                  canEditPlannedAllocations || (canAddSupplementalCoil && draftRow);
                const specWarn =
                  lot && (linkedQuotation || jobProductAttrs)
                    ? coilVersusQuotationAndProductWarning(lot, linkedQuotation, jobProductAttrs)
                    : null;
                const showRemove =
                  canEditPlannedAllocations ||
                  (canAddSupplementalCoil && draftRow && draftAllocations.length > 1);
                const coilSelectTitle = lot
                  ? `Remaining ${formatKg(lot.qtyRemaining)}${lot.productID ? ` · ${lot.productID}` : ''} · free ${formatKg(freeKg)}`
                  : 'Choose a received coil from stock.';
                return (
                  <div
                    key={row.id}
                    className={`rounded-lg border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/30 ${
                      inModal ? 'p-1.5' : 'p-2'
                    }`}
                  >
                    <div className="flex min-w-0 flex-nowrap items-end gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#134e4a] text-[9px] font-black text-white"
                        title={`Coil line ${index + 1}`}
                      >
                        {index + 1}
                      </span>
                      {lot ? (
                        <span
                          className="hidden max-w-[4.5rem] shrink-0 truncate text-[9px] leading-tight text-slate-500 xl:block"
                          title={`${lot.productID} · free ${formatKg(freeKg)}`}
                        >
                          {lot.productID}
                        </span>
                      ) : null}
                      <div className="flex min-w-[10rem] shrink-0 flex-col gap-px">
                        <label className="whitespace-nowrap text-[8px] font-bold uppercase tracking-wide text-slate-500">
                          Coil
                        </label>
                        <select
                          disabled={!canPickCoilAndOpening}
                          title={coilSelectTitle}
                          value={row.coilNo}
                          onChange={(e) => updateDraftRow(row.id, { coilNo: e.target.value })}
                          className="min-w-[10rem] max-w-[16rem] rounded-md border border-slate-200 bg-white py-1.5 px-2 text-[11px] font-bold text-[#134e4a] outline-none transition-all focus:border-[#134e4a]/40 focus:ring-1 focus:ring-[#134e4a]/20 disabled:opacity-60"
                        >
                          <option value="">Select coil...</option>
                          {recommendedCoils.length > 0 ? (
                            <optgroup label="Recommended (matches quotation)">
                              {recommendedCoils.map((coil) => {
                                const addBack = savedOpeningKgByCoil.get(coil.coilNo) ?? 0;
                                const optFree = Math.max(
                                  0,
                                  Number(coil.qtyRemaining || 0) - Number(coil.qtyReserved || 0) + addBack
                                );
                                return (
                                  <option key={coil.coilNo} value={coil.coilNo}>
                                    {coil.coilNo} — {coil.colour || '—'} {coil.gaugeLabel || '—'} · free{' '}
                                    {optFree.toFixed(1)} kg
                                  </option>
                                );
                              })}
                            </optgroup>
                          ) : null}
                          {otherCoilsForSelect.length > 0 ? (
                            <optgroup
                              label={recommendedCoils.length > 0 ? 'Other coils' : 'Available coils'}
                            >
                              {otherCoilsForSelect.map((coil) => {
                                const addBack = savedOpeningKgByCoil.get(coil.coilNo) ?? 0;
                                const optFree = Math.max(
                                  0,
                                  Number(coil.qtyRemaining || 0) - Number(coil.qtyReserved || 0) + addBack
                                );
                                return (
                                  <option key={coil.coilNo} value={coil.coilNo}>
                                    {coil.coilNo} — {coil.colour || '—'} {coil.gaugeLabel || '—'} · free{' '}
                                    {optFree.toFixed(1)} kg
                                  </option>
                                );
                              })}
                            </optgroup>
                          ) : null}
                        </select>
                      </div>

                      <div className="flex w-[4.25rem] shrink-0 flex-col gap-px">
                        <label className="whitespace-nowrap text-[8px] font-bold uppercase tracking-wide text-slate-500">
                          Open kg
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={!canPickCoilAndOpening}
                          value={row.openingWeightKg}
                          onChange={(e) => updateDraftRow(row.id, { openingWeightKg: e.target.value })}
                          className="w-full rounded-md border border-slate-200 bg-white py-1.5 px-1.5 text-xs font-bold tabular-nums text-[#134e4a] outline-none transition-all focus:border-[#134e4a]/40 focus:ring-1 focus:ring-[#134e4a]/20 disabled:opacity-60"
                        />
                      </div>

                      <div className="flex w-[4.25rem] shrink-0 flex-col gap-px">
                        <label className="whitespace-nowrap text-[8px] font-bold uppercase tracking-wide text-slate-500">
                          Close kg
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={!canCaptureRun}
                          value={row.closingWeightKg}
                          onChange={(e) => updateDraftRow(row.id, { closingWeightKg: e.target.value })}
                          className="w-full rounded-md border border-slate-200 bg-white py-1.5 px-1.5 text-xs font-bold tabular-nums text-[#134e4a] outline-none transition-all focus:border-[#134e4a]/40 focus:ring-1 focus:ring-[#134e4a]/20 disabled:opacity-60"
                        />
                      </div>

                      <div className="flex w-[4.25rem] shrink-0 flex-col gap-px">
                        <label className="whitespace-nowrap text-[8px] font-bold uppercase tracking-wide text-slate-500">
                          Metres
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={!canCaptureRun}
                          value={row.metersProduced}
                          onChange={(e) => updateDraftRow(row.id, { metersProduced: e.target.value })}
                          className="w-full rounded-md border border-slate-200 bg-white py-1.5 px-1.5 text-xs font-bold tabular-nums text-[#134e4a] outline-none transition-all focus:border-[#134e4a]/40 focus:ring-1 focus:ring-[#134e4a]/20 disabled:opacity-60"
                        />
                      </div>

                      <div className="flex min-w-[5.5rem] flex-1 flex-col gap-px">
                        <label className="whitespace-nowrap text-[8px] font-bold uppercase tracking-wide text-slate-500">
                          Note
                        </label>
                        <input
                          type="text"
                          value={row.note}
                          onChange={(e) => updateDraftRow(row.id, { note: e.target.value })}
                          disabled={
                            selectedJob.status === 'Completed' ||
                            (selectedJob.status === 'Running' && !draftRow)
                          }
                          placeholder="Trim, splice…"
                          className="min-w-[5rem] w-full rounded-md border border-slate-200 bg-white py-1.5 px-2 text-[11px] font-medium text-slate-800 outline-none transition-all focus:border-slate-300 focus:ring-1 focus:ring-slate-200/80 disabled:opacity-60"
                        />
                      </div>

                      <div className="flex w-[3.25rem] shrink-0 flex-col items-center gap-px text-center">
                        <span className="whitespace-nowrap text-[8px] font-bold uppercase tracking-wide text-teal-800/90">
                          Used
                        </span>
                        <span className="text-xs font-black tabular-nums leading-none text-[#134e4a]">
                          {Number(row.openingWeightKg) >= Number(row.closingWeightKg || 0) && row.closingWeightKg !== ''
                            ? formatKg(Number(row.openingWeightKg) - Number(row.closingWeightKg || 0))
                            : '—'}
                        </span>
                      </div>

                      {showRemove ? (
                        <button
                          type="button"
                          onClick={() => removeDraftRow(row.id)}
                          className="mb-px shrink-0 rounded-md border border-transparent p-1 text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove coil row"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>

                    {row.specMismatch || specWarn ? (
                      <div className="mt-1 space-y-1 border-t border-slate-100/80 pt-1">
                        {row.specMismatch ? (
                          <p className="flex items-start gap-1 rounded border border-amber-300 bg-amber-100/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-950">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
                            Saved as spec exception — manager review
                          </p>
                        ) : null}
                        {specWarn ? (
                          <p className="flex items-start gap-1 rounded border border-amber-200 bg-amber-50/90 px-2 py-0.5 text-[9px] font-semibold text-amber-950">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
                            {specWarn}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
                : null}
            </div>
          </div>

          {canCaptureRun ? (
            <div className="overflow-hidden rounded-lg border border-indigo-200/60 bg-gradient-to-br from-indigo-50/35 via-white to-white shadow-sm">
              <div
                className={`flex flex-col gap-0.5 border-b border-indigo-100/80 bg-indigo-50/30 sm:flex-row sm:items-center sm:justify-between ${
                  inModal ? 'px-2 py-2' : 'px-2.5 py-2'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <BarChart3 size={15} className="text-indigo-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900">Conversion preview</p>
                    <p className="text-[10px] text-slate-600 leading-tight">
                      Same as submit; nothing posts until Complete.
                    </p>
                  </div>
                </div>
                {conversionPreviewLoading ? (
                  <span className="text-[11px] font-medium text-indigo-600">Updating…</span>
                ) : null}
              </div>
              <div className={inModal ? 'p-2' : 'p-2.5'}>
                {!canRunConversionPreview ? (
                  <p className="rounded-md border border-dashed border-slate-200 bg-slate-50/80 px-2 py-2 text-[11px] text-slate-600">
                    Enter <strong className="font-semibold text-slate-800">closing kg</strong> and{' '}
                    <strong className="font-semibold text-slate-800">metres</strong> on each coil to preview conversion
                    and alerts.
                  </p>
                ) : conversionPreviewLoading ? (
                  <p className="text-xs font-semibold text-slate-500">Calculating…</p>
                ) : conversionPreviewError ? (
                  <p className="text-xs text-red-700">{conversionPreviewError}</p>
                ) : conversionPreview?.rows?.length ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-600">
                      <span className="font-semibold text-[#134e4a]">
                        Job rollup: {formatMeters(conversionPreview.totalMeters)} ·{' '}
                        {formatKg(conversionPreview.totalWeightKg)} consumed
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                          conversionPreview.aggregatedAlertState === 'OK'
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {conversionPreview.aggregatedAlertState}
                      </span>
                      {conversionPreview.managerReviewRequired ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-black uppercase text-red-900">
                          Manager review likely
                        </span>
                      ) : null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {conversionPreview.rows.map((row, rowIdx) => {
                        const lot = coilByNo[row.coilNo];
                        return (
                          <div
                            key={
                              row.allocationId != null && row.allocationId !== ''
                                ? `conv-${row.allocationId}`
                                : `conv-${row.coilNo}-${rowIdx}`
                            }
                            className={`rounded-lg border p-2 text-xs shadow-sm ${alertTone(row.alertState)}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-1.5">
                              <div className="min-w-0">
                                <p className="font-mono text-[11px] font-bold">{row.coilNo}</p>
                                <p className="mt-px text-[9px] font-medium text-slate-700 line-clamp-2">
                                  {lot?.gaugeLabel || '—'} · {lot?.colour || '—'} ·{' '}
                                  {lot?.materialTypeName || '—'}
                                </p>
                              </div>
                              <span className="rounded-md bg-white/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                                {row.alertState}
                              </span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
                              <div className="rounded-md bg-white/70 px-1.5 py-1">
                                <p className="text-[7px] font-black uppercase opacity-70">Act</p>
                                <p className="text-[11px] font-black tabular-nums">{formatKgPerM(row.actualConversionKgPerM)}</p>
                              </div>
                              <div
                                className="rounded-md bg-white/70 px-1.5 py-1"
                                title={
                                  row.standardConversionSource === 'procurement_catalog'
                                    ? 'Standard kg/m from Procurement → Conversion catalogue'
                                    : row.standardConversionSource === 'setup_density'
                                      ? 'Standard kg/m from setup material density × width × gauge'
                                      : undefined
                                }
                              >
                                <p className="text-[7px] font-black uppercase opacity-70">
                                  Std
                                  {row.standardConversionSource === 'procurement_catalog' ? (
                                    <span className="normal-case font-semibold text-slate-600"> · conv.</span>
                                  ) : null}
                                </p>
                                <p className="text-[11px] font-black tabular-nums">{formatKgPerM(row.standardConversionKgPerM)}</p>
                              </div>
                              <div className="rounded-md bg-white/70 px-1.5 py-1">
                                <p className="text-[7px] font-black uppercase opacity-70">Sup</p>
                                <p className="text-[11px] font-black tabular-nums">{formatKgPerM(row.supplierConversionKgPerM)}</p>
                              </div>
                              <div className="rounded-md bg-white/70 px-1.5 py-1">
                                <p className="text-[7px] font-black uppercase opacity-70">G hist</p>
                                <p className="text-[11px] font-black tabular-nums">{formatKgPerM(row.gaugeHistoryAvgKgPerM)}</p>
                              </div>
                              <div className="rounded-md bg-white/70 px-1.5 py-1">
                                <p className="text-[7px] font-black uppercase opacity-70">C hist</p>
                                <p className="text-[11px] font-black tabular-nums">{formatKgPerM(row.coilHistoryAvgKgPerM)}</p>
                              </div>
                              <div className="col-span-2 rounded-md bg-white/70 px-1.5 py-1 sm:col-span-3">
                                <p className="text-[7px] font-black uppercase opacity-70">Var %</p>
                                <p className="text-[9px] font-semibold tabular-nums leading-tight">
                                  Std {formatPct(row.variances?.standardPct)} · Supp{' '}
                                  {formatPct(row.variances?.supplierPct)} · G hist {formatPct(row.variances?.gaugeHistoryPct)}{' '}
                                  · C hist {formatPct(row.variances?.coilHistoryPct)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Preview when inputs are valid.</p>
                )}
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/70 px-3 py-2">
              <p className="text-sm font-bold text-slate-900">Posted conversion check</p>
              <p className="mt-0.5 text-xs leading-snug text-slate-600">
                kg/m compared to standard, supplier, gauge history, and coil history after completion.
              </p>
            </div>

            <div className="p-2 sm:p-3">
              {selectedChecks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-center text-sm text-slate-500">
                  Complete the job with closing weights and metres — checks will show here for audit.
                </div>
              ) : (
                <div className="rounded-md border border-slate-100">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[44rem] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-bold uppercase tracking-wide text-slate-600">
                          <th className="sticky left-0 z-[1] bg-slate-50 px-2 py-2 text-left font-mono normal-case tracking-normal text-slate-800">
                            Coil
                          </th>
                          <th className="px-2 py-2 text-right whitespace-nowrap">Actual</th>
                          <th className="px-2 py-2 text-right whitespace-nowrap">Standard</th>
                          <th className="px-2 py-2 text-right whitespace-nowrap">Supplier</th>
                          <th className="px-2 py-2 text-right whitespace-nowrap">Gauge hist.</th>
                          <th className="px-2 py-2 text-right whitespace-nowrap">Coil hist.</th>
                          <th className="min-w-[7rem] px-2 py-2 text-right whitespace-nowrap">Variance %</th>
                          <th className="px-2 py-2 text-center whitespace-nowrap">Alert</th>
                          <th className="min-w-[5rem] px-2 py-2 text-left">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {checksPage.slice.map((check) => {
                          const v = check.varianceSummary?.variances;
                          const deltaTitle = `Std ${formatPct(v?.standardPct)} · Sup ${formatPct(v?.supplierPct)} · Gauge ${formatPct(v?.gaugeHistoryPct)} · Coil ${formatPct(v?.coilHistoryPct)}`;
                          const deltaCell = `${formatPct(v?.standardPct)} / ${formatPct(v?.supplierPct)} · ${formatPct(v?.gaugeHistoryPct)} / ${formatPct(v?.coilHistoryPct)}`;
                          const noteShort = check.managerReviewRequired
                            ? 'Manager review'
                            : check.alertState === 'Watch'
                              ? 'Near threshold'
                              : 'In range';
                          const noteTitle = check.managerReviewRequired
                            ? 'Out of band — escalate to manager.'
                            : check.alertState === 'Watch'
                              ? 'Close to the alert threshold.'
                              : 'Within expected range.';
                          const gaugeMat = `${check.gaugeLabel || '—'} · ${check.materialTypeName || '—'}`;
                          return (
                            <tr
                              key={check.id}
                              className={`border-b border-slate-100 last:border-0 ${postedCheckRowClass(check.alertState)}`}
                            >
                              <td
                                className={`sticky left-0 z-[1] max-w-[9rem] px-2 py-2 font-mono text-sm font-bold shadow-[2px_0_0_rgba(148,163,184,0.2)] ${postedCheckRowClass(check.alertState)}`}
                                title={gaugeMat}
                              >
                                <span className="block truncate">{check.coilNo}</span>
                              </td>
                              <td className="px-2 py-2 text-right font-semibold tabular-nums whitespace-nowrap" title={formatKgPerM(check.actualConversionKgPerM)}>
                                {formatKgPerMCompact(check.actualConversionKgPerM)}
                              </td>
                              <td className="px-2 py-2 text-right font-semibold tabular-nums whitespace-nowrap" title={formatKgPerM(check.standardConversionKgPerM)}>
                                {formatKgPerMCompact(check.standardConversionKgPerM)}
                              </td>
                              <td className="px-2 py-2 text-right font-semibold tabular-nums whitespace-nowrap" title={formatKgPerM(check.supplierConversionKgPerM)}>
                                {formatKgPerMCompact(check.supplierConversionKgPerM)}
                              </td>
                              <td className="px-2 py-2 text-right font-semibold tabular-nums whitespace-nowrap" title={formatKgPerM(check.gaugeHistoryAvgKgPerM)}>
                                {formatKgPerMCompact(check.gaugeHistoryAvgKgPerM)}
                              </td>
                              <td className="px-2 py-2 text-right font-semibold tabular-nums whitespace-nowrap" title={formatKgPerM(check.coilHistoryAvgKgPerM)}>
                                {formatKgPerMCompact(check.coilHistoryAvgKgPerM)}
                              </td>
                              <td
                                className="max-w-0 px-2 py-2 text-right text-xs font-medium tabular-nums text-slate-800 whitespace-nowrap truncate"
                                title={deltaTitle}
                              >
                                {deltaCell}
                              </td>
                              <td className="px-2 py-2 text-center text-xs font-black whitespace-nowrap">{check.alertState}</td>
                              <td className="max-w-0 px-2 py-2 text-xs font-medium text-slate-800 whitespace-nowrap truncate" title={noteTitle}>
                                {noteShort}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {selectedChecks.length > 0 ? (
                    <div className="border-t border-slate-100 px-2 py-2 bg-white">
                      <AppTablePager
                        showingFrom={checksPage.showingFrom}
                        showingTo={checksPage.showingTo}
                        total={checksPage.total}
                        hasPrev={checksPage.hasPrev}
                        hasNext={checksPage.hasNext}
                        onPrev={checksPage.goPrev}
                        onNext={checksPage.goNext}
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded-lg border border-slate-200 bg-white p-2 text-center sm:text-left">
              <p className="text-[8px] font-bold uppercase tracking-wide text-slate-500">Planned</p>
              <p className="text-sm font-black tabular-nums text-[#134e4a]">
                {formatMeters(selectedJob.plannedMeters)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-2 text-center sm:text-left">
              <p className="text-[8px] font-bold uppercase tracking-wide text-slate-500">Actual</p>
              <p className="text-sm font-black tabular-nums text-[#134e4a]">
                {formatMeters(selectedJob.actualMeters)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-2 text-center sm:text-left">
              <p className="text-[8px] font-bold uppercase tracking-wide text-slate-500">Alert</p>
              <p className="truncate text-sm font-black text-[#134e4a]">
                {selectedJob.conversionAlertState || 'Pending'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-slate-200/80 bg-slate-50/90 px-2 py-2 text-[10px] text-slate-600 sm:px-2.5">
            {selectedJob.status === 'Completed' ? (
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
            ) : selectedJob.status === 'Running' ? (
              <Activity size={14} className="mt-0.5 shrink-0 text-sky-600" />
            ) : (
              <Link2 size={14} className="mt-0.5 shrink-0 text-[#134e4a]" />
            )}
            <p className="leading-snug">
              <strong className="font-semibold text-slate-800">Stock logic:</strong> reserved kg stays on the coil until
              you complete; only consumed kg is deducted. One coil can back several jobs.
            </p>
          </div>
        </div>
      </div>

      {returnModalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="return-to-plan-title"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-amber-200 bg-white p-4 shadow-xl">
            <h4 id="return-to-plan-title" className="text-sm font-bold text-amber-950">
              Return job to plan?
            </h4>
            <p className="mt-2 text-xs leading-snug text-slate-600">
              This undoes <strong className="font-semibold">Start</strong> only. Coil reservations stay as saved; you can
              then change allocation and save again. Use a clear reason — it is stored in the audit log.
            </p>
            <label className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Reason (≥8 characters)
            </label>
            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-200"
              placeholder="e.g. Wrong coil selected — need to swap CL-12 for CL-15 before run."
            />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setReturnModalOpen(false);
                  setReturnReason('');
                }}
                disabled={returnSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={returnSaving || returnReason.trim().length < 8}
                onClick={() => void submitReturnToPlanned()}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-45"
              >
                {returnSaving ? 'Applying…' : 'Confirm return to plan'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
