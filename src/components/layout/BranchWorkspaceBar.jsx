import React, { useCallback, useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export function BranchWorkspaceBar() {
  const ws = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const branches = useMemo(
    () => ws.snapshot?.workspaceBranches ?? ws.session?.branches ?? [],
    [ws.snapshot?.workspaceBranches, ws.session?.branches]
  );

  const currentId = String(ws.session?.currentBranchId ?? '').trim();
  const viewAll = Boolean(ws.session?.viewAllBranches);
  const roleKey = String(ws.session?.user?.roleKey ?? '').trim().toLowerCase();
  const isHqRole = roleKey === 'admin' || roleKey === 'md' || roleKey === 'ceo';
  const canHqRollup = isHqRole && ws.hasPermission('hq.view_all_branches');

  const onBranchChange = useCallback(
    async (e) => {
      const id = String(e.target.value || '').trim();
      if (!id || id === currentId) return;
      setError(null);
      setBusy(true);
      const r = await ws.updateWorkspace({ currentBranchId: id });
      setBusy(false);
      if (!r.ok) setError(r.error || 'Update failed');
    },
    [currentId, ws]
  );

  const onToggleRollup = useCallback(
    async (e) => {
      const next = e.target.checked;
      setError(null);
      setBusy(true);
      const r = await ws.updateWorkspace({ viewAllBranches: next });
      setBusy(false);
      if (!r.ok) setError(r.error || 'Update failed');
    },
    [ws]
  );

  if (!ws.apiOnline || branches.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-gray-100/90 bg-white/95 px-3 py-2 shadow-sm">
        <Building2 size={16} className="shrink-0 text-[#134e4a]/70" aria-hidden />
        <div className="min-w-0 flex-1">
          <label htmlFor="zarewa-branch-workspace" className="sr-only">
            Active branch
          </label>
          <select
            id="zarewa-branch-workspace"
            value={currentId || (branches[0]?.id ?? '')}
            onChange={onBranchChange}
            disabled={busy}
            className="z-toolbar-shell w-full min-w-0 max-w-[200px] cursor-pointer truncate bg-transparent text-[11px] font-bold uppercase tracking-wide text-[#134e4a] outline-none disabled:opacity-50 sm:max-w-[240px]"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name || b.code || b.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {canHqRollup ? (
        <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-gray-100/80 bg-white/80 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-600 shadow-sm">
          <input
            type="checkbox"
            checked={viewAll}
            onChange={onToggleRollup}
            disabled={busy}
            className="h-3.5 w-3.5 rounded border-gray-300 text-[#134e4a] focus:ring-[#134e4a]"
          />
          All branches
        </label>
      ) : null}

      {viewAll && canHqRollup ? (
        <span className="hidden text-[10px] font-semibold text-teal-700 lg:inline">HQ roll-up</span>
      ) : null}

      {error ? (
        <p className="text-[10px] font-semibold text-red-600 sm:max-w-[200px]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
