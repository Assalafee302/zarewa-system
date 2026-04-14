import React, { useCallback, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';

/**
 * Grant edit-token approval from the workspace inbox (no Manager page).
 */
export default function WorkspaceEditApprovalPanel({ item, onDone }) {
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const id = String(item?.sourceId || item?.referenceNo || '').trim();

  const approve = useCallback(async () => {
    if (!id) return;
    if (!ws?.canMutate) {
      showToast('Reconnect to approve — workspace is read-only.', { variant: 'info' });
      return;
    }
    setBusy(true);
    try {
      const { ok, data } = await apiFetch(`/api/edit-approvals/${encodeURIComponent(id)}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not approve.', { variant: 'error' });
        return;
      }
      showToast('Edit approval granted — one save is allowed with this token.');
      await ws.refresh?.();
      onDone?.();
    } finally {
      setBusy(false);
    }
  }, [id, onDone, showToast, ws]);

  if (!id) {
    return <p className="p-4 text-sm text-slate-500">Missing approval id.</p>;
  }

  const summary = String(item?.summary || '').trim() || '—';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-white px-4 py-5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-900/80">Edit approval</p>
      <h2 className="mt-1 text-lg font-semibold text-slate-900">{item?.title || 'Edit approval'}</h2>
      <p className="mt-2 font-mono text-xs text-slate-500">{id}</p>
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 text-sm text-slate-800">
        <p className="text-[11px] font-semibold uppercase text-slate-500">Target</p>
        <p className="mt-1">{summary}</p>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Approving issues a short-lived token so the requester can complete their controlled save.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void approve()}
          className="inline-flex items-center gap-2 rounded-xl bg-[#134e4a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0f3d3a] disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Approve edit'}
        </button>
      </div>
    </div>
  );
}
