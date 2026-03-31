import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { MainPanel, PageHeader } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import HrCapsLoading from './hrCapsLoading';

export default function StaffProfile() {
  const { userId: userIdParam } = useParams();
  const userId = userIdParam ? decodeURIComponent(userIdParam) : '';
  const ws = useWorkspace();
  const selfId = ws?.session?.user?.id;
  const isSelf = useMemo(
    () => Boolean(userId && (userId === 'me' || (selfId && userId === selfId))),
    [userId, selfId]
  );
  const { caps } = useHrWorkspace();
  const [row, setRow] = useState(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (caps === null || !userId) return;
    if (!isSelf && !caps.canViewDirectory) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      const { ok, data } = await apiFetch(`/api/hr/staff/${encodeURIComponent(userId)}`);
      if (!cancelled) {
        setBusy(false);
        if (ok && data?.ok) {
          if (data.profile) setRow(data.profile);
          else if (data.user) {
            setRow({
              userId: data.user.id,
              username: data.user.username,
              displayName: data.user.displayName,
              jobTitle: data.hr?.jobTitle,
              branchId: data.hr?.branchId,
              employeeNo: data.hr?.employeeNo,
            });
          } else setRow(null);
        } else setRow(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caps, userId, isSelf]);

  if (caps === null) return <HrCapsLoading />;
  if (!isSelf && !caps.canViewDirectory) return <Navigate to="/hr" replace />;
  if (busy) return <HrCapsLoading />;
  if (!row) {
    return (
      <MainPanel>
        <PageHeader title="Staff profile" />
        <p className="text-sm text-slate-600">Profile not found.</p>
        <Link className="mt-4 inline-block text-sm text-violet-700 hover:underline" to="/hr/staff">
          Back to directory
        </Link>
      </MainPanel>
    );
  }

  return (
    <MainPanel>
      <PageHeader title={row.displayName || row.username || 'Staff'} subtitle={row.jobTitle || ''} />
      <dl className="mt-4 grid max-w-lg gap-2 text-sm">
        <dt className="text-slate-500">Username</dt>
        <dd className="font-medium text-slate-900">{row.username}</dd>
        <dt className="text-slate-500">Branch</dt>
        <dd className="font-medium text-slate-900">{row.branchId || '—'}</dd>
        <dt className="text-slate-500">Employee no.</dt>
        <dd className="font-medium text-slate-900">{row.employeeNo || '—'}</dd>
      </dl>
      <Link className="mt-6 inline-block text-sm text-violet-700 hover:underline" to="/hr/staff">
        ← Directory
      </Link>
    </MainPanel>
  );
}
