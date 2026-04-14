import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';

function hasOpsAck(ws) {
  return Boolean(ws?.hasPermission?.('operations.manage') || ws?.hasPermission?.('production.manage') || ws?.hasPermission?.('*'));
}

/**
 * Coil / material request triage in the workspace (acknowledge coil → procurement path).
 */
export default function WorkspaceCoilMaterialPanel({ item, onDone }) {
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [materialRows, setMaterialRows] = useState([]);

  const sourceKind = String(item?.sourceKind || '').trim().toLowerCase();
  const sourceId = String(item?.sourceId || '').trim();

  const coilRow = useMemo(() => {
    if (sourceKind !== 'coil_request' || !sourceId) return null;
    const rows = Array.isArray(ws?.snapshot?.coilRequests) ? ws.snapshot.coilRequests : [];
    return rows.find((r) => String(r.id || '').trim() === sourceId) || null;
  }, [sourceKind, sourceId, ws?.snapshot?.coilRequests]);

  useEffect(() => {
    if (sourceKind !== 'material_request' || !sourceId) {
      setMaterialRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { ok, data } = await apiFetch('/api/material-requests');
      if (cancelled) return;
      if (!ok || !data?.ok) {
        setMaterialRows([]);
        return;
      }
      const list = Array.isArray(data.requests) ? data.requests : [];
      setMaterialRows(list.filter((r) => String(r.id || '').trim() === sourceId));
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceKind, sourceId]);

  const acknowledgeCoil = useCallback(async () => {
    if (!sourceId || sourceKind !== 'coil_request') return;
    if (!hasOpsAck(ws)) {
      showToast('You do not have permission to acknowledge coil requests.', { variant: 'error' });
      return;
    }
    setBusy(true);
    try {
      const { ok, data } = await apiFetch(`/api/coil-requests/${encodeURIComponent(sourceId)}/acknowledge`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      if (!ok || data?.ok === false) {
        showToast(data?.error || 'Could not acknowledge.', { variant: 'error' });
        return;
      }
      showToast('Coil request acknowledged — procurement can proceed.');
      await ws.refresh?.();
      onDone?.();
    } finally {
      setBusy(false);
    }
  }, [onDone, showToast, sourceId, sourceKind, ws]);

  const mr = materialRows[0];
  const pendingCoil = coilRow && String(coilRow.status || '').toLowerCase() === 'pending';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-white px-4 py-5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-900/80">Operations</p>
      <h2 className="mt-1 text-lg font-semibold text-slate-900">{item?.title || 'Material request'}</h2>
      <p className="mt-2 text-sm text-slate-600">{item?.summary || '—'}</p>
      <p className="mt-1 font-mono text-xs text-slate-500">{sourceId}</p>

      {sourceKind === 'coil_request' && coilRow ? (
        <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 text-sm">
          <p>
            <span className="font-medium text-slate-700">Gauge:</span> {coilRow.gauge ?? '—'} mm
          </p>
          <p>
            <span className="font-medium text-slate-700">Colour:</span> {coilRow.colour ?? '—'}
          </p>
          <p>
            <span className="font-medium text-slate-700">Material:</span> {coilRow.materialType ?? '—'}
          </p>
          <p>
            <span className="font-medium text-slate-700">Requested:</span>{' '}
            {coilRow.requestedKg != null ? `${coilRow.requestedKg} kg` : '—'}
          </p>
          <p>
            <span className="font-medium text-slate-700">Status:</span>{' '}
            <span className="capitalize">{coilRow.status || '—'}</span>
          </p>
        </div>
      ) : null}

      {sourceKind === 'material_request' && mr ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 text-sm text-slate-800">
          <p className="font-medium text-slate-700">Material request record</p>
          <p className="mt-1 text-xs text-slate-600">Status: {String(mr.status || '—')}</p>
          {mr.summary ? <p className="mt-2 text-sm">{mr.summary}</p> : null}
        </div>
      ) : sourceKind === 'material_request' ? (
        <p className="mt-4 text-sm text-amber-800">Could not load material request details.</p>
      ) : null}

      {sourceKind === 'coil_request' && pendingCoil && hasOpsAck(ws) ? (
        <div className="mt-6">
          <button
            type="button"
            disabled={busy}
            onClick={() => void acknowledgeCoil()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#134e4a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0f3d3a] disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Acknowledge & route to procurement'}
          </button>
          <p className="mt-2 text-xs text-slate-500">Confirms operations has seen the coil need and opens the procurement workflow.</p>
        </div>
      ) : sourceKind === 'coil_request' && !pendingCoil ? (
        <p className="mt-6 text-sm text-slate-600">This coil request is not awaiting acknowledgement.</p>
      ) : sourceKind === 'material_request' ? (
        <p className="mt-6 text-sm text-slate-600">
          This material request is tracked in the workspace; fulfilment is handled by procurement and operations using
          their standard workflows.
        </p>
      ) : (
        <p className="mt-6 text-sm text-slate-600">Unsupported material source.</p>
      )}
    </div>
  );
}
