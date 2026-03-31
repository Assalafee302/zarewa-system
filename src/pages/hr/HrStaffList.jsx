import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { MainPanel, PageHeader } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import HrCapsLoading from './hrCapsLoading';

export default function HrStaffList() {
  const { caps } = useHrWorkspace();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const { ok, data } = await apiFetch('/api/hr/staff');
    setBusy(false);
    if (ok && data?.ok) setRows(data.staff || []);
    else setRows([]);
  }, []);

  useEffect(() => {
    if (caps === null) return;
    if (caps.canViewDirectory) load();
  }, [caps, load]);

  if (caps === null) return <HrCapsLoading />;
  if (!caps.canViewDirectory) {
    return <Navigate to="/hr" replace />;
  }

  return (
    <MainPanel>
      <PageHeader title="Staff directory" actions={null} />
      <p className="mb-4 text-sm text-slate-500">
        {busy ? 'Loading…' : `${rows.length} profile(s).`}
      </p>
      <ul className="divide-y divide-slate-200/80 rounded-2xl border border-slate-200/80 bg-white/80">
        {rows.map((s) => (
          <li key={s.userId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <div className="font-medium text-slate-900">{s.displayName || s.username}</div>
              <div className="text-xs text-slate-500">{s.jobTitle || '—'} · {s.branchId || ''}</div>
            </div>
            <Link
              className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
              to={`/hr/staff/${encodeURIComponent(s.userId)}`}
            >
              Open
            </Link>
          </li>
        ))}
      </ul>
    </MainPanel>
  );
}
