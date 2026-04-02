import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, CalendarClock, HeartHandshake, Users } from 'lucide-react';
import { MainPanel, PageHeader } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import HrCapsLoading from './hrCapsLoading';

const linkClass =
  'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-[#134e4a] shadow-sm hover:border-teal-200 hover:bg-teal-50/50 no-underline';

export default function HrHome() {
  const { caps, capsError } = useHrWorkspace();
  const ws = useWorkspace();
  const selfId = ws?.session?.user?.id;
  const [staffCount, setStaffCount] = useState(null);

  useEffect(() => {
    if (caps == null || !caps.canViewDirectory) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      void (async () => {
        const { ok, data } = await apiFetch('/api/hr/staff');
        if (!cancelled && ok && data?.ok) setStaffCount((data.staff || []).length);
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [caps]);

  if (caps === null) return <HrCapsLoading />;

  const c = caps || {};

  return (
    <MainPanel>
      <PageHeader
        title="HR"
        subtitle="Everything here reads and writes the same HR database your admins use — not a separate demo layer."
      />

      {capsError ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {capsError} Using session permissions as fallback.
        </div>
      ) : null}

      {c.enabled === false ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950">
          HR database tables are not initialised on this deployment. Contact your administrator.
        </div>
      ) : null}

      <p className="mb-6 max-w-2xl text-sm text-slate-600 leading-relaxed">
        Use the tabs above to move between areas. Staff profiles support full edit (where you have permission) via{' '}
        <strong>Edit file</strong> on each record. Payroll recomputes from current files, monthly attendance uploads, daily
        present/late rolls, loans, and per-staff PAYE where set.
      </p>

      <div className="flex flex-wrap gap-2">
        {selfId ? (
          <Link to="/hr/staff/me" className={linkClass}>
            My HR file
          </Link>
        ) : null}
        {c.canViewDirectory ? (
          <Link to="/hr/staff" className={linkClass}>
            <Users size={16} />
            Staff
            {staffCount != null ? ` (${staffCount})` : ''}
          </Link>
        ) : null}
        {c.canViewDirectory || c.canPayroll ? (
          <Link to="/hr/salary-welfare" className={linkClass}>
            <HeartHandshake size={16} />
            Salary &amp; benefits
          </Link>
        ) : null}
        {c.canPayroll ? (
          <Link to="/hr/payroll" className={linkClass}>
            <Banknote size={16} />
            Payroll
          </Link>
        ) : null}
        {c.canUploadAttendance || c.canPayroll || c.canViewDirectory ? (
          <Link to="/hr/time" className={linkClass}>
            <CalendarClock size={16} />
            Time &amp; attendance
          </Link>
        ) : null}
        <Link to="/hr/talent" className={linkClass}>
          Leave &amp; requests
        </Link>
        {c.canCompliance ? (
          <Link to="/hr/compliance" className={linkClass}>
            Compliance
          </Link>
        ) : null}
        {c.canViewDirectory ? (
          <Link to="/hr/staff/directory-quality" className={`${linkClass} border-dashed`}>
            Directory data quality
          </Link>
        ) : null}
      </div>
    </MainPanel>
  );
}
