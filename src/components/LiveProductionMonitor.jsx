import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Gauge,
  Link2,
  Play,
  Plus,
  Ruler,
  Save,
  Scale,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../lib/apiBase';
import { coilVersusJobProductWarning } from '../lib/coilSpecVersusProduct';
import { productionJobNeedsManagerReviewAttention } from '../lib/productionReview';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';

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
  const [signoffSaving, setSignoffSaving] = useState(false);

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
  const jobProductAttrs = useMemo(() => {
    const p = products.find((x) => x.productID === selectedJob?.productID);
    return p?.dashboardAttrs ?? null;
  }, [products, selectedJob?.productID]);
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

  const reservedKg = useMemo(
    () =>
      draftAllocations.reduce((sum, row) => {
        const opening = Number(row.openingWeightKg);
        return sum + (Number.isFinite(opening) ? opening : 0);
      }, 0),
    [draftAllocations]
  );
  const recordedMeters = useMemo(
    () =>
      draftAllocations.reduce((sum, row) => {
        const meters = Number(row.metersProduced);
        return sum + (Number.isFinite(meters) ? meters : 0);
      }, 0),
    [draftAllocations]
  );
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
  }, [draftAllocations, selectedJob?.jobID, selectedJob?.status]);

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

  const conversionPreviewKey = useMemo(() => {
    if (!canRunConversionPreview || !selectedJob?.jobID) return '';
    return JSON.stringify({
      job: selectedJob.jobID,
      lines: draftAllocations.map((row) => completionLineFromDraft(row)),
      accessoriesSupplied: accessoriesSuppliedForApi,
    });
  }, [canRunConversionPreview, draftAllocations, selectedJob, accessoriesSuppliedForApi]);

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
        const { ok, data } = await apiFetch(previewPath, {
          method: 'POST',
          body: JSON.stringify({
            allocations: parsed.lines,
            accessoriesSupplied: parsed.accessoriesSupplied || [],
          }),
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
  const canAddSupplementalCoil = selectedJob?.status === 'Running' && !readOnly;
  const canCaptureRun = selectedJob?.status === 'Running' && !readOnly;
  const completionValidation = useMemo(() => {
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
  }, [draftAllocations]);

  const appendSaveReady = useMemo(
    () =>
      draftAllocations.some(
        (r) => isDraftAllocationRow(r) && r.coilNo?.trim() && Number(r.openingWeightKg) > 0
      ),
    [draftAllocations]
  );
  const plannedAllocSaveReady = useMemo(
    () => draftAllocations.some((r) => r.coilNo?.trim() && Number(r.openingWeightKg) > 0),
    [draftAllocations]
  );
  const canManageConversionSignoff =
    Boolean(ws?.hasPermission?.('production.release')) ||
    Boolean(ws?.hasPermission?.('operations.manage')) ||
    Boolean(ws?.hasPermission?.('production.manage'));
  const plannedMetersValue = Number(selectedJob?.plannedMeters || 0);
  const hasPlannedMeters = Number.isFinite(plannedMetersValue) && plannedMetersValue > 0;
  const overProducedMeters =
    hasPlannedMeters && Number.isFinite(recordedMeters) ? recordedMeters - plannedMetersValue : 0;
  const requiresManagerOverrunApproval = overProducedMeters > 0.01;

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
        body: JSON.stringify({ remark }),
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
    } catch (e) {
      showToast(e?.message || 'Network error — could not reach server.', { variant: 'error' });
    } finally {
      setSignoffSaving(false);
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

  const buildCompleteBody = () => ({
    completedAtISO: new Date().toISOString().slice(0, 10),
    allocations: draftAllocations.map((row) => completionLineFromDraft(row)),
    accessoriesSupplied: accessoriesSuppliedForApi,
  });

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
      if (selectedJob.status === 'Running') {
        const toAppend = draftAllocations.filter(
          (row) => isDraftAllocationRow(row) && row.coilNo?.trim() && Number(row.openingWeightKg) > 0
        );
        if (!toAppend.length) {
          showToast('Add a new coil row with opening kg, then save to attach it to this run.', { variant: 'info' });
          setSavingAction('');
          return;
        }
        body = {
          append: true,
          allocations: toAppend.map((row) => ({
            coilNo: row.coilNo.trim(),
            openingWeightKg: Number(row.openingWeightKg),
            note: row.note.trim(),
          })),
        };
      } else {
        body = {
          allocations: draftAllocations
            .map((row) => ({
              coilNo: row.coilNo.trim(),
              openingWeightKg: Number(row.openingWeightKg),
              note: row.note.trim(),
            }))
            .filter((row) => row.coilNo && row.openingWeightKg > 0),
        };
      }
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
            `Recorded meters (${recordedMeters.toFixed(2)}m) exceed planned (${plannedMetersValue.toFixed(2)}m). Seek manager approval to complete.`,
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
          `Meters recorded exceed plan by ${overProducedMeters.toFixed(2)}m. Continue as manager-approved overrun?`
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
    if (type === 'allocations') {
      showToast(
        selectedJob.status === 'Running'
          ? `Supplemental coil(s) saved on ${listLabel}.`
          : `Coil allocation saved for ${listLabel}.`
      );
    } else if (type === 'start') {
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
        } rounded-zarewa border border-dashed border-slate-200 bg-slate-50/70 px-5 py-6 text-sm text-slate-500`}
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
        <div className="mt-4">
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
        inModal ? 'mb-0' : 'mb-8'
      } rounded-zarewa border border-[#134e4a]/15 bg-gradient-to-br from-[#134e4a]/[0.04] via-white to-teal-50/30 shadow-sm overflow-hidden`}
    >
      <div
        className={`flex flex-col gap-2 border-b border-slate-100 bg-white/90 ${
          inModal ? 'px-4 py-3 sm:px-5 sticky top-0 z-20 backdrop-blur' : 'px-5 py-4 sm:px-6'
        } sm:flex-row sm:items-center sm:justify-between`}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#134e4a] text-[#5eead4]">
            <Gauge size={22} />
          </span>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-[#134e4a]">
              Production traceability
            </h3>
            <p className="mt-0.5 text-[10px] text-slate-500 leading-relaxed">
              Reserve coils before start, record kg before and after, and compare actual conversion against
              standard, supplier, gauge history, and coil history.
            </p>
          </div>
        </div>
        <div className={`flex flex-wrap items-center gap-2 ${inModal ? 'sm:justify-end' : ''}`}>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
            {selectedJob.status === 'Planned'
              ? 'Step 1: allocate'
              : selectedJob.status === 'Running'
                ? 'Step 2: run log'
                : 'Step 3: review'}
          </span>
          {readOnly ? (
            <span className="text-[11px] font-semibold text-slate-500 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              Read-only record
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void persist('allocations')}
                disabled={
                  savingAction !== '' ||
                  (selectedJob.status === 'Planned' && (!canEditPlannedAllocations || !plannedAllocSaveReady)) ||
                  (selectedJob.status === 'Running' && (!canAddSupplementalCoil || !appendSaveReady))
                }
                className={`z-btn-secondary ${inModal ? 'text-[11px] px-3 py-2' : ''}`}
              >
                <Save size={16} />{' '}
                {savingAction === 'allocations'
                  ? 'Saving...'
                  : selectedJob.status === 'Running'
                    ? 'Save supplemental coil(s)'
                    : 'Save allocations'}
              </button>
              <button
                type="button"
                onClick={() => void persist('start')}
                disabled={
                  selectedJob.status !== 'Planned' || savingAction !== '' || !hasPersistedCoilAllocations
                }
                title={
                  !hasPersistedCoilAllocations
                    ? 'Save at least one coil with opening kg before starting.'
                    : undefined
                }
                className={`z-btn-primary ${inModal ? 'text-[11px] px-3 py-2' : ''}`}
              >
                <Play size={16} /> {savingAction === 'start' ? 'Starting...' : 'Start job'}
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
                className={`z-btn-primary ${inModal ? 'text-[11px] px-3 py-2' : ''}`}
              >
                <CheckCircle2 size={16} /> {savingAction === 'complete' ? 'Completing...' : 'Complete job'}
              </button>
            </>
          )}
        </div>
      </div>
      {readOnly ? (
        <div className="border-b border-slate-100 bg-slate-50/90 px-5 py-3 text-[11px] text-slate-600 sm:px-6">
          This cutting list run is finished. You can review planned vs actual output and conversion checks below;
          actions stay disabled.
        </div>
      ) : null}
      {canEditPlannedAllocations && !hasPersistedCoilAllocations ? (
        <div className="border-b border-amber-100 bg-amber-50/90 px-4 py-2.5 text-[10px] font-semibold text-amber-950 sm:px-5">
          Save coil allocations (coil number and opening kg) before starting — production cannot run without a posted
          allocation.
        </div>
      ) : null}
      {canAddSupplementalCoil ? (
        <div className="border-b border-sky-100 bg-sky-50/80 px-4 py-2 text-[10px] font-medium text-sky-950 sm:px-5">
          Job is running — use <strong className="font-semibold">Add coil</strong> for extra material if the first coil
          does not cover planned metres. Save opens kg on the new coil only; existing lines stay locked.
        </div>
      ) : null}
      {canCaptureRun && !completionValidation.canComplete ? (
        <div className="border-b border-red-100 bg-red-50/80 px-4 py-2 text-[10px] font-medium text-red-900 sm:px-5">
          Completion blocked: {completionValidation.errors[0] || 'fill all required run-log fields.'}
        </div>
      ) : null}
      {canCaptureRun && requiresManagerOverrunApproval ? (
        <div className="border-b border-amber-100 bg-amber-50/90 px-4 py-2 text-[10px] font-medium text-amber-950 sm:px-5">
          Overrun detected: recorded {recordedMeters.toFixed(2)}m vs planned {plannedMetersValue.toFixed(2)}m
          ({overProducedMeters.toFixed(2)}m above plan).{' '}
          {canManageConversionSignoff
            ? 'Manager approval remark is required before completion.'
            : 'Seek manager approval before completion.'}
        </div>
      ) : null}

      <div
        className={`grid ${inModal ? 'gap-3 p-3 sm:p-4' : 'gap-4 p-4 sm:p-5'} ${
          hideJobSidebar ? '' : 'sm:grid-cols-[16rem_minmax(0,1fr)]'
        }`}
      >
        {!hideJobSidebar ? (
          <aside className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Production queue</p>
            {sortedJobs.map((job) => (
              <button
                key={job.jobID}
                type="button"
                onClick={() => setSelectedJobId(job.jobID)}
                className={`w-full rounded-2xl border p-4 text-left transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 ${
                  selectedJob.jobID === job.jobID
                    ? 'border-[#134e4a]/35 bg-white shadow-sm ring-1 ring-[#134e4a]/10'
                    : 'border-slate-200/80 bg-white/70 hover:border-teal-200 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-black text-[#134e4a]">
                      {job.cuttingListId || job.jobID}
                    </p>
                    <p className="mt-1 text-[11px] font-bold text-slate-700">{job.customerName || '—'}</p>
                    <p className="mt-1 text-[10px] text-slate-500">{job.productName || job.productID || '—'}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${statusTone(job.status)}`}
                  >
                    {job.status}
                  </span>
                </div>
                <p className="mt-3 text-[10px] font-semibold text-slate-500">
                  Planned {formatMeters(job.plannedMeters)}
                </p>
                {job.quotationRef ? (
                  <p className="mt-1 text-[10px] text-slate-400">Quote {job.quotationRef}</p>
                ) : null}
                {job.status === 'Planned' ? (
                  <p
                    className={`mt-1 text-[10px] font-bold ${
                      (coilAllocationCountByJob.get(job.jobID) || 0) === 0 ? 'text-amber-700' : 'text-slate-500'
                    }`}
                  >
                    {(coilAllocationCountByJob.get(job.jobID) || 0) === 0
                      ? 'No coil allocation saved'
                      : `${coilAllocationCountByJob.get(job.jobID)} coil(s) allocated`}
                  </p>
                ) : null}
              </button>
            ))}
          </aside>
        ) : null}

        <div className={`min-w-0 ${inModal ? 'space-y-3' : 'space-y-4'}`}>
          <div className={`grid ${inModal ? 'gap-2.5' : 'gap-3'} lg:grid-cols-4`}>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors duration-200 hover:border-slate-300 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Cutting list</p>
                  <p className="mt-0.5 text-base font-black text-[#134e4a] font-mono">
                    {selectedJob.cuttingListId || '—'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    {selectedJob.customerName || '—'} · {selectedJob.productName || selectedJob.productID || '—'}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${statusTone(selectedJob.status)}`}
                >
                  {selectedJob.status}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 text-[11px]">
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-2">
                  <p className="font-semibold text-slate-400">Quotation</p>
                  <p className="mt-0.5 font-bold text-slate-700">{selectedJob.quotationRef || '—'}</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-2">
                  <p className="font-semibold text-slate-400">Machine</p>
                  <p className="mt-0.5 font-bold text-slate-700">{selectedJob.machineName || 'Production line'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors duration-200 hover:border-slate-300">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Reserved</p>
              <p className="mt-0.5 text-xl font-black text-[#134e4a]">{formatKg(reservedKg)}</p>
              <p className="mt-0.5 text-[9px] text-slate-500">Opening kg locked on this job</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors duration-200 hover:border-slate-300">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Recorded output</p>
              <p className="mt-0.5 text-xl font-black text-[#134e4a]">{formatMeters(recordedMeters)}</p>
              <p className="mt-0.5 text-[9px] text-slate-500">{formatKg(recordedConsumedKg)} consumed so far</p>
            </div>
          </div>

          {canCaptureRun && accessoryCompletionDraft.length > 0 ? (
            <div className="rounded-xl border border-teal-200/80 bg-teal-50/40 p-3 sm:p-4 space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-[#134e4a]">
                Accessories issued (this completion)
              </p>
              <p className="text-[10px] text-slate-600 leading-snug">
                Ordered on the quote vs already posted from other completed jobs. Adjust &ldquo;This job&rdquo; to match
                what leaves stock; shortfalls can be refunded under Accessory shortfall.
              </p>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full min-w-[520px] text-left text-[10px]">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[8px] font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Item</th>
                      <th className="px-2 py-2 text-right">Ordered</th>
                      <th className="px-2 py-2 text-right">Prior jobs</th>
                      <th className="px-2 py-2 text-right">Remaining</th>
                      <th className="px-2 py-2 text-right">This job</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessoryCompletionDraft.map((row) => {
                      const remaining = Math.max(0, row.ordered - row.priorSupplied);
                      return (
                        <tr key={row.key} className="border-b border-slate-100 last:border-0">
                          <td className="px-2 py-2 font-semibold text-slate-800">{row.name}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-600">{row.ordered}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                            {row.priorSupplied}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-600">{remaining}</td>
                          <td className="px-2 py-2 text-right">
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
                              className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-right font-mono text-[10px] font-bold text-[#134e4a] outline-none focus:ring-2 focus:ring-teal-500/20"
                              aria-label={`Supplied this job for ${row.name}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {readOnly &&
          selectedJob?.status === 'Completed' &&
          (ws?.snapshot?.productionJobAccessoryUsage || []).some((u) => u.jobID === selectedJob.jobID) ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4 space-y-2">
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
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950">
              <div className="flex items-start gap-2">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-700" />
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
                  <p className="text-[10px] text-emerald-800/70 pt-1">
                    Conversion alert on this job remains visible below for audit; dashboards no longer flag it for
                    action.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {productionJobNeedsManagerReviewAttention(selectedJob) ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900 space-y-3">
              <div className="flex items-start gap-2">
                <FileWarning size={18} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-black uppercase tracking-wide">Manager review required</p>
                  <p className="mt-1 text-xs">
                    Conversion is outside the expected band (High/Low versus references). Review the four-reference
                    checks below, then sign off with a short remark when satisfied.
                  </p>
                </div>
              </div>
              {canManageConversionSignoff ? (
                <div className="rounded-xl border border-red-200/80 bg-white/80 p-3 space-y-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-red-900/80">
                    Sign-off remark
                  </label>
                  <textarea
                    value={signoffRemark}
                    onChange={(e) => setSignoffRemark(e.target.value)}
                    rows={3}
                    placeholder="e.g. Variance explained — coil edge trim / scale loss. Approved to close."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-red-200 resize-y min-h-[4rem]"
                  />
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

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm transition-colors duration-200 hover:border-slate-300">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                  Coil allocation and run log
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">
                  {canEditPlannedAllocations
                    ? 'Pick one or more coils, reserve opening kg, then save before starting.'
                    : canAddSupplementalCoil
                      ? 'Add another coil if you need more material mid-run; save reserves opening kg on new lines only.'
                      : canCaptureRun
                        ? 'Capture closing kg and metres for every allocated coil.'
                        : 'Job is closed. Allocation and conversion details are read-only.'}
                </p>
              </div>
              {canEditPlannedAllocations || canAddSupplementalCoil ? (
                <button type="button" onClick={addDraftRow} className="z-btn-secondary text-xs py-1.5 px-2.5">
                  <Plus size={14} /> Add coil
                </button>
              ) : null}
            </div>

            <div className={`${inModal ? 'space-y-2 p-2.5' : 'space-y-2.5 p-3'}`}>
              {draftAllocations.map((row, index) => {
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
                const specWarn = lot && jobProductAttrs ? coilVersusJobProductWarning(lot, jobProductAttrs) : null;
                const showRemove =
                  canEditPlannedAllocations ||
                  (canAddSupplementalCoil && draftRow && draftAllocations.length > 1);
                return (
                  <div
                    key={row.id}
                    className={`grid gap-2 rounded-lg border border-slate-100 bg-slate-50/60 ${
                      inModal ? 'p-2' : 'p-2.5'
                    } lg:grid-cols-[1.35fr_repeat(3,minmax(0,0.75fr))_1fr_auto] transition-all duration-200 hover:border-slate-200 hover:bg-slate-50`}
                  >
                    <div>
                      <label className="ml-0.5 mb-0.5 block text-[8px] font-black uppercase tracking-widest text-slate-400">
                        Coil {index + 1}
                      </label>
                      <div className="relative">
                        <select
                          disabled={!canPickCoilAndOpening}
                          value={row.coilNo}
                          onChange={(e) => updateDraftRow(row.id, { coilNo: e.target.value })}
                          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-[11px] font-bold text-[#134e4a] outline-none transition-all duration-150 focus:border-[#134e4a]/35 focus:ring-2 focus:ring-[#134e4a]/15 disabled:opacity-70"
                        >
                          <option value="">Select coil...</option>
                          {availableCoils.map((coil) => {
                            const addBack = savedOpeningKgByCoil.get(coil.coilNo) ?? 0;
                            const optFree = Math.max(
                              0,
                              Number(coil.qtyRemaining || 0) - Number(coil.qtyReserved || 0) + addBack
                            );
                            return (
                              <option key={coil.coilNo} value={coil.coilNo}>
                                {coil.coilNo} - {coil.colour || '-'} {coil.gaugeLabel || '-'} - free{' '}
                                {optFree.toFixed(1)}kg
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      {specWarn ? (
                        <p className="mt-1.5 flex items-start gap-1 rounded border border-amber-200 bg-amber-50/90 px-2 py-1 text-[9px] font-semibold text-amber-950">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
                          {specWarn}
                        </p>
                      ) : null}
                      {lot ? (
                        <p className="mt-1 text-[9px] text-slate-500">
                          {lot.productID} · rem {formatKg(lot.qtyRemaining)} · free {formatKg(freeKg)}
                        </p>
                      ) : (
                        <p className="mt-1 text-[9px] text-slate-400">Pick a received coil to continue.</p>
                      )}
                    </div>

                    <div>
                      <label className="ml-0.5 mb-0.5 block text-[8px] font-black uppercase tracking-widest text-slate-400">
                        Opening kg
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={!canPickCoilAndOpening}
                        value={row.openingWeightKg}
                        onChange={(e) => updateDraftRow(row.id, { openingWeightKg: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs font-black text-[#134e4a] outline-none transition-all duration-150 focus:border-[#134e4a]/35 focus:ring-2 focus:ring-[#134e4a]/15 disabled:opacity-70"
                      />
                    </div>

                    <div>
                      <label className="ml-0.5 mb-0.5 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-slate-400">
                        <Scale size={11} /> Closing kg
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={!canCaptureRun}
                        value={row.closingWeightKg}
                        onChange={(e) => updateDraftRow(row.id, { closingWeightKg: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs font-black text-[#134e4a] outline-none transition-all duration-150 focus:border-[#134e4a]/35 focus:ring-2 focus:ring-[#134e4a]/15 disabled:opacity-70"
                      />
                    </div>

                    <div>
                      <label className="ml-0.5 mb-0.5 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-slate-400">
                        <Ruler size={11} /> Meters
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={!canCaptureRun}
                        value={row.metersProduced}
                        onChange={(e) => updateDraftRow(row.id, { metersProduced: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs font-black text-[#134e4a] outline-none transition-all duration-150 focus:border-[#134e4a]/35 focus:ring-2 focus:ring-[#134e4a]/15 disabled:opacity-70"
                      />
                    </div>

                    <div>
                      <label className="ml-0.5 mb-0.5 block text-[8px] font-black uppercase tracking-widest text-slate-400">
                        Notes
                      </label>
                      <input
                        type="text"
                        value={row.note}
                        onChange={(e) => updateDraftRow(row.id, { note: e.target.value })}
                        disabled={
                          selectedJob.status === 'Completed' ||
                          (selectedJob.status === 'Running' && !draftRow)
                        }
                        placeholder="Operator note"
                        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-[11px] font-semibold text-slate-700 outline-none transition-all duration-150 focus:border-[#134e4a]/30 focus:ring-2 focus:ring-[#134e4a]/10 disabled:opacity-70"
                      />
                    </div>

                    <div className="flex items-end justify-between gap-2">
                      <div className="text-right text-[9px] text-slate-500">
                        <p className="font-semibold">Consumed</p>
                        <p className="mt-0.5 font-black text-[#134e4a] tabular-nums">
                          {Number(row.openingWeightKg) >= Number(row.closingWeightKg || 0) && row.closingWeightKg !== ''
                            ? formatKg(Number(row.openingWeightKg) - Number(row.closingWeightKg || 0))
                            : '—'}
                        </p>
                      </div>
                      {showRemove ? (
                        <button
                          type="button"
                          onClick={() => removeDraftRow(row.id)}
                          className="rounded-lg p-1.5 text-slate-300 transition-all duration-150 hover:scale-105 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove coil row"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {canCaptureRun ? (
            <div className="rounded-2xl border border-dashed border-[#134e4a]/25 bg-white shadow-sm transition-colors duration-200 hover:border-[#134e4a]/35">
              <div className={`${inModal ? 'border-b border-slate-100 px-3 py-3' : 'border-b border-slate-100 px-4 py-4'}`}>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Pre-submit conversion preview
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Read-only: same four-reference logic as completion. Updates shortly after all coils have valid
                  closing kg and metres. Nothing is posted until you press Complete job.
                </p>
              </div>
              <div className={inModal ? 'p-3' : 'p-4'}>
                {!canRunConversionPreview ? (
                  <p className="text-sm text-slate-500">
                    Enter closing kg and metres for every allocated coil to see expected conversion and alerts.
                  </p>
                ) : conversionPreviewLoading ? (
                  <p className="text-sm font-semibold text-slate-500">Calculating preview…</p>
                ) : conversionPreviewError ? (
                  <p className="text-sm text-red-700">{conversionPreviewError}</p>
                ) : conversionPreview?.rows?.length ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
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
                    <div className="grid gap-3 lg:grid-cols-2">
                      {conversionPreview.rows.map((row, rowIdx) => {
                        const lot = coilByNo[row.coilNo];
                        return (
                          <div
                            key={
                              row.allocationId != null && row.allocationId !== ''
                                ? `conv-${row.allocationId}`
                                : `conv-${row.coilNo}-${rowIdx}`
                            }
                            className={`rounded-2xl border p-3 text-sm shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow ${alertTone(row.alertState)}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-mono text-xs font-black">{row.coilNo}</p>
                                <p className="mt-0.5 text-[10px] font-semibold text-slate-700">
                                  {lot?.gaugeLabel || '—'} · {lot?.colour || '—'} ·{' '}
                                  {lot?.materialTypeName || '—'}
                                </p>
                              </div>
                              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-black uppercase">
                                {row.alertState}
                              </span>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                              <div className="rounded-lg bg-white/70 p-2">
                                <p className="text-[8px] font-black uppercase opacity-70">Actual</p>
                                <p className="font-black tabular-nums">{formatKgPerM(row.actualConversionKgPerM)}</p>
                              </div>
                              <div className="rounded-lg bg-white/70 p-2">
                                <p className="text-[8px] font-black uppercase opacity-70">Standard</p>
                                <p className="font-black tabular-nums">{formatKgPerM(row.standardConversionKgPerM)}</p>
                              </div>
                              <div className="rounded-lg bg-white/70 p-2">
                                <p className="text-[8px] font-black uppercase opacity-70">Supplier</p>
                                <p className="font-black tabular-nums">{formatKgPerM(row.supplierConversionKgPerM)}</p>
                              </div>
                              <div className="rounded-lg bg-white/70 p-2">
                                <p className="text-[8px] font-black uppercase opacity-70">Gauge hist.</p>
                                <p className="font-black tabular-nums">{formatKgPerM(row.gaugeHistoryAvgKgPerM)}</p>
                              </div>
                              <div className="rounded-lg bg-white/70 p-2">
                                <p className="text-[8px] font-black uppercase opacity-70">Coil hist.</p>
                                <p className="font-black tabular-nums">{formatKgPerM(row.coilHistoryAvgKgPerM)}</p>
                              </div>
                              <div className="col-span-2 rounded-lg bg-white/70 p-2 sm:col-span-3">
                                <p className="text-[8px] font-black uppercase opacity-70">Variance vs refs (%)</p>
                                <p className="text-[10px] font-semibold tabular-nums">
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
                  <p className="text-sm text-slate-500">Preview will appear here when inputs are valid.</p>
                )}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm transition-colors duration-200 hover:border-slate-300">
            <div className={inModal ? 'border-b border-slate-100 px-3 py-3' : 'border-b border-slate-100 px-4 py-4'}>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Four-reference conversion check
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Standard = material density × coil width (default 1.2 m) × gauge thickness. Supplier = expected
                metres on the coil at GRN (or stored kg/m). Gauge history and coil history are rolling averages
                from prior completed runs (other jobs only while this job is being closed).
              </p>
            </div>

            <div className={`grid ${inModal ? 'gap-3 p-3' : 'gap-4 p-4'} lg:grid-cols-2`}>
              {selectedChecks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500 lg:col-span-2">
                  Conversion checks will appear here after the job is completed with closing weights and actual
                  metres.
                </div>
              ) : (
                selectedChecks.map((check) => (
                  <div
                    key={check.id}
                    className={`rounded-2xl border p-4 text-sm shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow ${alertTone(check.alertState)}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs font-black">{check.coilNo}</p>
                        <p className="mt-1 text-[11px] font-semibold">
                          {check.gaugeLabel || 'No gauge'} · {check.materialTypeName || 'No material type'}
                        </p>
                      </div>
                      <span className="rounded-full bg-white/70 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide">
                        {check.alertState}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-white/70 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Actual</p>
                        <p className="mt-1 text-lg font-black">{formatKgPerM(check.actualConversionKgPerM)}</p>
                      </div>
                      <div className="rounded-xl bg-white/70 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Standard</p>
                        <p className="mt-1 text-lg font-black">{formatKgPerM(check.standardConversionKgPerM)}</p>
                      </div>
                      <div className="rounded-xl bg-white/70 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Supplier</p>
                        <p className="mt-1 text-lg font-black">{formatKgPerM(check.supplierConversionKgPerM)}</p>
                      </div>
                      <div className="rounded-xl bg-white/70 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Gauge history</p>
                        <p className="mt-1 text-lg font-black">{formatKgPerM(check.gaugeHistoryAvgKgPerM)}</p>
                      </div>
                      <div className="rounded-xl bg-white/70 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Coil history</p>
                        <p className="mt-1 text-lg font-black">{formatKgPerM(check.coilHistoryAvgKgPerM)}</p>
                      </div>
                      <div className="rounded-xl bg-white/70 p-3 sm:col-span-2">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-70">
                          Variance vs references (%)
                        </p>
                        <p className="mt-1 text-xs font-semibold tabular-nums">
                          Std {formatPct(check.varianceSummary?.variances?.standardPct)} · Supp{' '}
                          {formatPct(check.varianceSummary?.variances?.supplierPct)} · Gauge hist{' '}
                          {formatPct(check.varianceSummary?.variances?.gaugeHistoryPct)} · Coil hist{' '}
                          {formatPct(check.varianceSummary?.variances?.coilHistoryPct)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/70 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Variance note</p>
                        <p className="mt-1 text-xs font-semibold">
                          {check.managerReviewRequired
                            ? 'Out of band - escalate to manager.'
                            : check.alertState === 'Watch'
                              ? 'Close to the alert threshold.'
                              : 'Within expected range.'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={`grid ${inModal ? 'gap-3' : 'gap-4'} lg:grid-cols-3`}>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Planned</p>
              <p className="mt-1 text-2xl font-black text-[#134e4a]">{formatMeters(selectedJob.plannedMeters)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Actual posted</p>
              <p className="mt-1 text-2xl font-black text-[#134e4a]">{formatMeters(selectedJob.actualMeters)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Alert state</p>
              <p className="mt-1 text-2xl font-black text-[#134e4a]">
                {selectedJob.conversionAlertState || 'Pending'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-600">
            <div className="flex items-start gap-2">
              {selectedJob.status === 'Completed' ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
              ) : selectedJob.status === 'Running' ? (
                <Activity size={16} className="mt-0.5 shrink-0 text-sky-600" />
              ) : (
                <Link2 size={16} className="mt-0.5 shrink-0 text-[#134e4a]" />
              )}
              <p>
                One job can use multiple coils and one coil can serve many jobs. Reserved kg stays blocked until
                the job is completed, then only the consumed kg is removed from the coil balance.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
