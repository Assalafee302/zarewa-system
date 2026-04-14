import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquarePlus, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../lib/apiBase';
import { useToast } from '../../context/ToastContext';

/**
 * Internal correspondence list for the workspace home (replaces the separate Office Desk page).
 */
export default function WorkspaceOfficeThreadsBlock({ canOffice, officeSummary = null, onOpenThread, onRequestCompose }) {
  const { show: showToast } = useToast();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);

  const loadThreads = useCallback(async () => {
    if (!canOffice) return;
    setLoading(true);
    const q = mineOnly ? '?mine=1' : '';
    const { ok, data } = await apiFetch(`/api/office/threads${q}`);
    setLoading(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not load threads.', { variant: 'error' });
      setThreads([]);
      return;
    }
    setThreads(Array.isArray(data.threads) ? data.threads : []);
  }, [canOffice, mineOnly, showToast]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  if (!canOffice) return null;

  return (
    <section className="rounded-xl border border-slate-200/90 bg-white shadow-sm">
      <div className="flex h-1 bg-[#134e4a]" aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Workspace</p>
          <h2 className="text-sm font-bold text-[#134e4a]">Internal correspondence</h2>
          {officeSummary ? (
            <p className="mt-0.5 text-[10px] text-slate-500">
              <span className="font-mono font-semibold text-slate-600">
                {officeSummary.pendingActionApprox ?? 0} action
              </span>
              {' · '}
              <span className="font-mono font-semibold text-slate-600">{officeSummary.unreadApprox ?? 0} unread</span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
              className="rounded border-slate-300"
            />
            Mine only
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadThreads()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase text-slate-700 disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => onRequestCompose?.()}
            className="inline-flex items-center gap-1 rounded-lg bg-[#134e4a] px-2.5 py-1.5 text-[10px] font-black uppercase text-white"
          >
            <MessageSquarePlus size={12} />
            New memo
          </button>
        </div>
      </div>
      <ul className="max-h-[220px] divide-y divide-slate-100 overflow-y-auto">
        {loading && threads.length === 0 ? (
          <li className="px-4 py-6 text-center text-xs text-slate-500">Loading…</li>
        ) : threads.length === 0 ? (
          <li className="px-4 py-6 text-center text-xs text-slate-500">No threads yet.</li>
        ) : (
          threads.slice(0, 40).map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onOpenThread?.(t.id)}
                className="w-full px-4 py-2.5 text-left transition hover:bg-slate-50"
              >
                <p className="text-[13px] font-semibold text-slate-900 line-clamp-1">{t.subject}</p>
                <p className="mt-0.5 text-[10px] font-mono text-slate-500">{t.id}</p>
                <p className="mt-0.5 text-[10px] capitalize text-slate-400">
                  {t.status} · {t.kind}
                  {t.relatedPaymentRequestId ? ` · ${t.relatedPaymentRequestId}` : ''}
                </p>
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
