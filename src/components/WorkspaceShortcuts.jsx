import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, LayoutGrid } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  filterWorkspaceLinksByPermissions,
  getWorkspaceGuideEntry,
  normalizeWorkspaceDepartmentId,
  WORKSPACE_DEPARTMENT_LABELS,
} from '../lib/departmentWorkspace';

export default function WorkspaceShortcuts() {
  const ws = useWorkspace();
  const user = ws?.session?.user;
  const perms = useMemo(() => ws?.permissions ?? [], [ws?.permissions]);
  const deptId = normalizeWorkspaceDepartmentId(user?.department);
  const entry = useMemo(() => getWorkspaceGuideEntry(deptId), [deptId]);
  const links = useMemo(
    () => filterWorkspaceLinksByPermissions(entry?.links ?? [], perms),
    [entry, perms]
  );

  if (!entry || links.length === 0) return null;

  const deptLabel = WORKSPACE_DEPARTMENT_LABELS[deptId] || deptId;

  return (
    <section
      className="mb-6 rounded-2xl border border-teal-100/80 bg-gradient-to-br from-teal-50/90 to-white px-4 py-4 sm:px-5 sm:py-5 shadow-sm"
      aria-labelledby="workspace-shortcuts-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            id="workspace-shortcuts-heading"
            className="text-[10px] font-black uppercase tracking-[0.2em] text-[#134e4a]/70"
          >
            Your workspace
          </p>
          <p className="mt-1 text-sm font-bold text-[#134e4a]">{deptLabel}</p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">{entry.primary}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#134e4a]/10 text-[#134e4a]">
          <LayoutGrid size={20} strokeWidth={2} />
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {links.map((link, idx) => (
          <li key={`${link.to}-${link.label}-${idx}`}>
            <Link
              to={link.to}
              state={link.state || undefined}
              className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#134e4a] shadow-sm transition hover:border-teal-300 hover:bg-teal-50/80"
            >
              {link.label}
              <ChevronRight size={14} className="opacity-60" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
