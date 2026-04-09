import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';

/**
 * Compact dashboard container for designated roles to approve second-party edit tokens.
 * Mirrors `src/pages/EditApprovalsPage.jsx` without page shell/layout.
 */
export default function EditApprovalsPanel() {
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await apiFetch('/api/edit-approvals/pending');
    setLoading(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not load pending edit approvals.', { variant: 'error' });
      setItems([]);
      return;
    }
    setItems(Array.isArray(data.items) ? data.items : []);
    await (ws?.refreshEditApprovalsPending?.() ?? Promise.resolve());
  }, [showToast, ws]);

  useEffect(() => {
    void load();
  }, [load, ws?.refreshEpoch]);

  const approve = async (id) => {
    setBusyId(id);
    const { ok, data } = await apiFetch(`/api/edit-approvals/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setBusyId('');
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not approve.', { variant: 'error' });
      return;
    }
    showToast('Edit approval granted — the colleague can save once with this token.');
    await load();
  };

  return (
    <section className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
      <div className="h-1 bg-[#134e4a]" aria-hidden />
      <div className="p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Approvals
            </p>
            <h2 className="text-base font-bold text-slate-900 mt-1 flex items-center gap-2">
              <ClipboardCheck size={18} className="text-[#134e4a]" />
              Edit approvals
            </h2>
            <p className="text-[11px] text-slate-500 mt-2 max-w-xl leading-relaxed">
              Approve one-time tokens so staff can complete sensitive saves (each token is consumed on the next successful PATCH).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400 gap-2">
            <RefreshCw size={24} className="animate-spin text-[#134e4a]" />
            <p className="text-[10px] font-bold uppercase tracking-widest">Loading queue</p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-8 py-12 text-center">
            <ClipboardCheck size={34} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-600">No pending edit approvals</p>
            <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
              Requests appear here when a colleague requests approval before saving a protected change.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-mono font-bold text-slate-700">{e.id}</p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">
                    {e.entityKind} · <span className="font-mono text-[13px]">{e.entityId}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Requested by {e.requestedByDisplay || e.requestedByUserId || '—'}
                    {e.requestedAtISO ? (
                      <span className="text-slate-400">
                        {' '}
                        · {new Date(e.requestedAtISO).toLocaleString()}
                      </span>
                    ) : null}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyId === e.id}
                  onClick={() => void approve(e.id)}
                  className="shrink-0 rounded-lg bg-[#134e4a] px-4 py-2 text-[10px] font-black uppercase tracking-wide text-white hover:brightness-105 disabled:opacity-50"
                >
                  {busyId === e.id ? 'Approving…' : 'Approve'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

