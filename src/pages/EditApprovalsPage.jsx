import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader, PageShell, MainPanel } from '../components/layout';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';
import { ClipboardCheck, RefreshCw } from 'lucide-react';

/**
 * Standalone queue for designated roles to approve second-party edit tokens (PATCH pre-approval).
 */
export default function EditApprovalsPage() {
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
    <PageShell>
      <PageHeader
        title="Edit approvals"
        subtitle="Approve one-time tokens so staff can complete sensitive saves (each token is consumed on the next successful PATCH)."
      />
      <MainPanel>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
            When someone requests approval from a quotation, purchase order, customer profile, delivery confirmation,
            or similar screen, their request appears here. Approve only after you agree with the change they described.
          </p>
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
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <RefreshCw size={28} className="animate-spin text-[#134e4a]" />
            <p className="text-xs font-bold uppercase tracking-widest">Loading queue</p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-8 py-16 text-center">
            <ClipboardCheck size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-600">No pending edit approvals</p>
            <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
              Requests appear here when a colleague uses &ldquo;Request approval&rdquo; before saving a protected change.
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
      </MainPanel>
    </PageShell>
  );
}
