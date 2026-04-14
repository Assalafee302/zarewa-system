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

  const activeBranch = branches.find((b) => b.id === currentId) || branches[0] || null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
      {isHqRole ? (
        <div className="flex min-w-0 w-full items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5 shadow-sm sm:gap-2 sm:rounded-2xl sm:border-gray-100/90 sm:bg-white/95 sm:px-3 sm:py-2 sm:shadow-sm">
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
              className="w-full min-w-0 max-w-none cursor-pointer truncate bg-transparent text-[10px] font-bold uppercase tracking-wide text-[#134e4a] outline-none disabled:opacity-50 sm:z-toolbar-shell sm:text-[11px] sm:max-w-[240px]"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name || b.code || b.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 w-full items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5 shadow-sm sm:gap-2 sm:rounded-2xl sm:border-gray-100/90 sm:bg-white/95 sm:px-3 sm:py-2 sm:shadow-sm">
          <Building2 size={16} className="shrink-0 text-[#134e4a]/70" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-bold uppercase tracking-wide text-[#134e4a] sm:text-[11px]">
              {activeBranch ? activeBranch.name || activeBranch.code || activeBranch.id : 'Branch'}
            </p>
          </div>
        </div>
      )}

      {canHqRollup ? (
        <label className="flex w-full cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200/70 bg-white px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide text-gray-600 shadow-sm sm:w-auto sm:gap-2 sm:rounded-xl sm:border-gray-100/80 sm:bg-white/80 sm:px-3 sm:py-2 sm:text-[10px]">
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
