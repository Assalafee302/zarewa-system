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
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';

function createDraftLine(row = {}) {
  return {
    id: row.id || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
  const useClScopedApi = Boolean(focusClTrim);

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

  const conversionPreviewKey = useMemo(() => {
    if (!canRunConversionPreview || !selectedJob?.jobID) return '';
    return JSON.stringify({
      job: selectedJob.jobID,
      lines: draftAllocations.map((row) => ({
        coilNo: row.coilNo.trim(),
        closingWeightKg: Number(row.closingWeightKg),
        metersProduced: Number(row.metersProduced),
        note: row.note.trim(),
      })),
    });
  }, [canRunConversionPreview, draftAllocations, selectedJob]);

  const conversionPreviewTimerRef = useRef(null);
  const conversionPreviewSeqRef = useRef(0);
  const [conversionPreview, setConversionPreview] = useState(null);
  const [conversionPreviewError, setConversionPreviewError] = useState('');
  const [conversionPreviewLoading, setConversionPreviewLoading] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
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
        const previewPath = useClScopedApi
          ? `/api/cutting-lists/${encodeURIComponent(focusClTrim)}/production/conversion-preview`
          : `/api/production-jobs/${encodeURIComponent(parsed.job)}/conversion-preview`;
        const { ok, data } = await apiFetch(previewPath, {
          method: 'POST',
          body: JSON.stringify({ allocations: parsed.lines }),
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
  }, [conversionPreviewKey, selectedJob?.jobID, useClScopedApi, focusClTrim]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const readOnly = Boolean(viewOnly) || selectedJob?.status === 'Completed';
  const canEditAllocation = selectedJob?.status === 'Planned' && !readOnly;
  const canCaptureRun = selectedJob?.status === 'Running' && !readOnly;

  const updateDraftRow = (id, patch) => {
    setDraftAllocations((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addDraftRow = () => {
    if (!canEditAllocation) return;
    setDraftAllocations((prev) => [...prev, createDraftLine()]);
  };

  const removeDraftRow = (id) => {
    if (!canEditAllocation) return;
    setDraftAllocations((prev) => (prev.length <= 1 ? [createDraftLine()] : prev.filter((row) => row.id !== id)));
  };

  const buildCompleteBody = () => ({
    completedAtISO: new Date().toISOString().slice(0, 10),
    allocations: draftAllocations.map((row) => ({
      coilNo: row.coilNo.trim(),
      closingWeightKg: Number(row.closingWeightKg),
      metersProduced: Number(row.metersProduced),
      note: row.note.trim(),
    })),
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
    const clBase = useClScopedApi
      ? `/api/cutting-lists/${encodeURIComponent(focusClTrim)}/production`
      : null;
    const listLabel = selectedJob.cuttingListId || selectedJob.jobID;
    setSavingAction(type);
    let path = '';
    let body = {};
    if (type === 'allocations') {
      path = clBase
        ? `${clBase}/allocations`
        : `/api/production-jobs/${encodeURIComponent(selectedJob.jobID)}/allocations`;
      body = {
        allocations: draftAllocations
          .map((row) => ({
            coilNo: row.coilNo.trim(),
            openingWeightKg: Number(row.openingWeightKg),
            note: row.note.trim(),
          }))
          .filter((row) => row.coilNo && row.openingWeightKg > 0),
      };
    } else if (type === 'start') {
      path = clBase
        ? `${clBase}/start`
        : `/api/production-jobs/${encodeURIComponent(selectedJob.jobID)}/start`;
      body = { startedAtISO: new Date().toISOString().slice(0, 10) };
    } else {
      const completeBody = buildCompleteBody();
      const previewUrl = clBase
        ? `${clBase}/conversion-preview`
        : `/api/production-jobs/${encodeURIComponent(selectedJob.jobID)}/conversion-preview`;
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
      path = clBase ? `${clBase}/complete` : `/api/production-jobs/${encodeURIComponent(selectedJob.jobID)}/complete`;
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
      showToast(`Coil allocation saved for ${listLabel}.`);
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
      </div>
    );
  }

  return (
    <div
      className={`${
        inModal ? 'mb-0' : 'mb-8'
      } rounded-zarewa border border-[#134e4a]/15 bg-gradient-to-br from-[#134e4a]/[0.04] via-white to-teal-50/30 shadow-sm overflow-hidden`}
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-white/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#134e4a] text-[#5eead4]">
            <Gauge size={22} />
          </span>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-[#134e4a]">
              Production traceability
            </h3>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Reserve coils before start, record kg before and after, and compare actual conversion against
              standard, supplier, gauge history, and coil history.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readOnly ? (
            <span className="text-[11px] font-semibold text-slate-500 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              Read-only record
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void persist('allocations')}
                disabled={!canEditAllocation || savingAction !== ''}
                className="z-btn-secondary"
              >
                <Save size={16} /> {savingAction === 'allocations' ? 'Saving...' : 'Save allocations'}
              </button>
              <button
                type="button"
                onClick={() => void persist('start')}
                disabled={!canEditAllocation || savingAction !== '' || !hasPersistedCoilAllocations}
                title={
                  !hasPersistedCoilAllocations
                    ? 'Save at least one coil with opening kg before starting.'
                    : undefined
                }
                className="z-btn-primary"
              >
                <Play size={16} /> {savingAction === 'start' ? 'Starting...' : 'Start job'}
              </button>
              <button
                type="button"
                onClick={() => void persist('complete')}
                disabled={!canCaptureRun || savingAction !== ''}
                className="z-btn-primary"
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
      {canEditAllocation && !hasPersistedCoilAllocations ? (
        <div className="border-b border-amber-100 bg-amber-50/90 px-5 py-3 text-[11px] font-semibold text-amber-950 sm:px-6">
          Save coil allocations (coil number and opening kg) before starting — production cannot run without a posted
          allocation.
        </div>
      ) : null}

      <div
        className={`grid gap-6 p-5 sm:p-6 ${
          hideJobSidebar ? '' : 'sm:grid-cols-[18rem_minmax(0,1fr)]'
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
                className={`w-full rounded-2xl border p-4 text-left transition-all ${
                  selectedJob.jobID === job.jobID
                    ? 'border-[#134e4a]/30 bg-white shadow-sm'
                    : 'border-slate-200/80 bg-white/70 hover:border-teal-200'
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

        <div className="space-y-5 min-w-0">
          <div className="grid gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Cutting list</p>
                  <p className="mt-1 text-lg font-black text-[#134e4a] font-mono">
                    {selectedJob.cuttingListId || '—'}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {selectedJob.customerName || '—'} · {selectedJob.productName || selectedJob.productID || '—'}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(selectedJob.status)}`}
                >
                  {selectedJob.status}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  <p className="font-semibold text-slate-400">Quotation</p>
                  <p className="mt-1 font-bold text-slate-700">{selectedJob.quotationRef || '—'}</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  <p className="font-semibold text-slate-400">Machine</p>
                  <p className="mt-1 font-bold text-slate-700">{selectedJob.machineName || 'Production line'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Reserved</p>
              <p className="mt-1 text-2xl font-black text-[#134e4a]">{formatKg(reservedKg)}</p>
              <p className="mt-1 text-[10px] text-slate-500">Opening kg locked before start</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Recorded output</p>
              <p className="mt-1 text-2xl font-black text-[#134e4a]">{formatMeters(recordedMeters)}</p>
              <p className="mt-1 text-[10px] text-slate-500">{formatKg(recordedConsumedKg)} consumed so far</p>
            </div>
          </div>

          {selectedJob.managerReviewRequired ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <div className="flex items-start gap-2">
                <FileWarning size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-black uppercase tracking-wide">Manager review required</p>
                  <p className="mt-1 text-xs">
                    The conversion result for this job moved outside the expected range. Review the four
                    reference values before closing the variance.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Coil allocation and run log
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {canEditAllocation
                    ? 'Pick one or more coils, reserve opening kg, then save before starting.'
                    : canCaptureRun
                      ? 'Capture closing kg and meters produced for every allocated coil.'
                      : 'Job is closed. Allocation and conversion details are read-only.'}
                </p>
              </div>
              {canEditAllocation ? (
                <button type="button" onClick={addDraftRow} className="z-btn-secondary">
                  <Plus size={16} /> Add coil
                </button>
              ) : null}
            </div>

            <div className="space-y-4 p-4">
              {draftAllocations.map((row, index) => {
                const lot = coilByNo[row.coilNo];
                const addBackThisJob = row.coilNo ? savedOpeningKgByCoil.get(row.coilNo) ?? 0 : 0;
                const freeKg = lot
                  ? Math.max(
                      0,
                      Number(lot.qtyRemaining || 0) - Number(lot.qtyReserved || 0) + addBackThisJob
                    )
                  : 0;
                return (
                  <div
                    key={row.id}
                    className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 lg:grid-cols-[1.4fr_repeat(3,minmax(0,0.8fr))_1fr_auto]"
                  >
                    <div>
                      <label className="ml-1 mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Coil {index + 1}
                      </label>
                      <div className="relative">
                        <select
                          disabled={!canEditAllocation}
                          value={row.coilNo}
                          onChange={(e) => updateDraftRow(row.id, { coilNo: e.target.value })}
                          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-xs font-bold text-[#134e4a] outline-none disabled:opacity-70"
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
                      {lot ? (
                        <p className="mt-2 text-[10px] text-slate-500">
                          {lot.productID} - remaining {formatKg(lot.qtyRemaining)} - free {formatKg(freeKg)}
                        </p>
                      ) : (
                        <p className="mt-2 text-[10px] text-slate-400">Pick a received coil to continue.</p>
                      )}
                    </div>

                    <div>
                      <label className="ml-1 mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Opening kg
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={!canEditAllocation}
                        value={row.openingWeightKg}
                        onChange={(e) => updateDraftRow(row.id, { openingWeightKg: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm font-black text-[#134e4a] outline-none disabled:opacity-70"
                      />
                    </div>

                    <div>
                      <label className="ml-1 mb-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        <Scale size={12} /> Closing kg
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={!canCaptureRun}
                        value={row.closingWeightKg}
                        onChange={(e) => updateDraftRow(row.id, { closingWeightKg: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm font-black text-[#134e4a] outline-none disabled:opacity-70"
                      />
                    </div>

                    <div>
                      <label className="ml-1 mb-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        <Ruler size={12} /> Meters
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={!canCaptureRun}
                        value={row.metersProduced}
                        onChange={(e) => updateDraftRow(row.id, { metersProduced: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm font-black text-[#134e4a] outline-none disabled:opacity-70"
                      />
                    </div>

                    <div>
                      <label className="ml-1 mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Notes
                      </label>
                      <input
                        type="text"
                        value={row.note}
                        onChange={(e) => updateDraftRow(row.id, { note: e.target.value })}
                        disabled={selectedJob.status === 'Completed'}
                        placeholder="Operator note"
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-xs font-semibold text-slate-700 outline-none disabled:opacity-70"
                      />
                    </div>

                    <div className="flex items-end justify-between gap-3">
                      <div className="text-right text-[10px] text-slate-500">
                        <p className="font-semibold">Consumed</p>
                        <p className="mt-1 font-black text-[#134e4a]">
                          {Number(row.openingWeightKg) >= Number(row.closingWeightKg || 0) && row.closingWeightKg !== ''
                            ? formatKg(Number(row.openingWeightKg) - Number(row.closingWeightKg || 0))
                            : '—'}
                        </p>
                      </div>
                      {canEditAllocation ? (
                        <button
                          type="button"
                          onClick={() => removeDraftRow(row.id)}
                          className="rounded-xl p-2 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove coil row"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {canCaptureRun ? (
            <div className="rounded-2xl border border-dashed border-[#134e4a]/25 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Pre-submit conversion preview
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Read-only: same four-reference logic as completion. Updates shortly after all coils have valid
                  closing kg and metres. Nothing is posted until you press Complete job.
                </p>
              </div>
              <div className="p-4">
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
                      {conversionPreview.rows.map((row) => {
                        const lot = coilByNo[row.coilNo];
                        return (
                          <div
                            key={row.coilNo}
                            className={`rounded-2xl border p-3 text-sm shadow-sm ${alertTone(row.alertState)}`}
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

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Four-reference conversion check
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Standard = material density × coil width (default 1.2 m) × gauge thickness. Supplier = expected
                metres on the coil at GRN (or stored kg/m). Gauge history and coil history are rolling averages
                from prior completed runs (other jobs only while this job is being closed).
              </p>
            </div>

            <div className="grid gap-4 p-4 lg:grid-cols-2">
              {selectedChecks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500 lg:col-span-2">
                  Conversion checks will appear here after the job is completed with closing weights and actual
                  metres.
                </div>
              ) : (
                selectedChecks.map((check) => (
                  <div
                    key={check.id}
                    className={`rounded-2xl border p-4 text-sm shadow-sm ${alertTone(check.alertState)}`}
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

          <div className="grid gap-4 lg:grid-cols-3">
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
