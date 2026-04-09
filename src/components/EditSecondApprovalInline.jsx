import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/apiBase';
import { useWorkspace } from '../context/WorkspaceContext';
import { editMutationNeedsSecondApprovalRole } from '../lib/editApprovalUi';

/**
 * Shown when the signed-in role must obtain a manager/admin approval before PATCHing this entity.
 * @param {{ entityKind: string; entityId: string; value: string; onChange: (v: string) => void; className?: string }} props
 */
export function EditSecondApprovalInline({ entityKind, entityId, value, onChange, className = '' }) {
  const ws = useWorkspace();
  const roleKey = ws?.session?.user?.roleKey;
  const needs = editMutationNeedsSecondApprovalRole(roleKey);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pollRef = useRef(null);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    []
  );

  if (!needs || !String(entityId || '').trim()) return null;

  const startPoll = (approvalId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const r = await apiFetch(`/api/edit-approvals/${encodeURIComponent(approvalId)}`);
      if (r.ok && r.data?.ok && r.data.approval?.status === 'approved') {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        onChange(approvalId);
      }
    }, 2000);
  };

  const request = async () => {
    setBusy(true);
    setErr('');
    const { ok, data } = await apiFetch('/api/edit-approvals/request', {
      method: 'POST',
      body: JSON.stringify({ entityKind, entityId: String(entityId).trim() }),
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      setErr(data?.error || 'Could not create approval request.');
      return;
    }
    const id = data.approvalId;
    if (!id) {
      setErr('Unexpected response.');
      return;
    }
    onChange('');
    startPoll(id);
  };

  return (
    <div
      className={`rounded-lg border border-amber-200/90 bg-amber-50/95 p-3 text-[11px] text-amber-950 ${className}`}
    >
      <p className="font-bold text-amber-900 mb-1">Second approval for this change</p>
      <p className="text-amber-800/95 mb-2 leading-snug">
        Use <strong className="font-semibold">Request approval</strong>, then ask an approver to open{' '}
        <strong className="font-semibold">Edit approvals</strong> in the sidebar (badge when something is waiting) or{' '}
        <strong className="font-semibold">Management → Edit OKs</strong>. You can stay on this screen — the approval ID
        fills in when ready. Each token works for one successful save only.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          disabled={busy}
          onClick={() => void request()}
          className="shrink-0 rounded-lg bg-amber-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {busy ? 'Requesting…' : 'Request approval'}
        </button>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="Approval ID (EA-…)"
          className="min-w-[12rem] flex-1 rounded-lg border border-amber-300/80 bg-white px-2 py-1.5 text-[11px] font-mono text-slate-800"
        />
      </div>
      {err ? <p className="text-rose-700 font-semibold mt-2 text-[10px]">{err}</p> : null}
    </div>
  );
}
