import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Banknote,
  CalendarClock,
  ClipboardList,
  HeartHandshake,
  Sparkles,
  Users,
} from 'lucide-react';
import { MainPanel, PageHeader } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import HrCapsLoading from './hrCapsLoading';

const cardBase =
  'group flex flex-col rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[var(--shadow-zarewa-card)] transition hover:border-violet-200 hover:shadow-md';

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
        title="Human resources"
        subtitle="Directory, payroll, attendance, loans, and HR requests — wired to the same data as Account and finance."
      />

      {capsError ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {capsError} Using session permissions as fallback.
        </div>
      ) : null}

      {c.enabled === false ? (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950">
          HR database tables are not initialised on this deployment. Contact your administrator.
        </div>
      ) : null}

      <div className="mb-8 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white p-6">
        <div className="flex items-start gap-3">
          <Sparkles className="shrink-0 text-violet-600" size={22} />
          <div>
            <h2 className="text-sm font-black text-[#7028e6]">Your access</h2>
            <ul className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold uppercase text-slate-600">
              <li className={`rounded-full px-2.5 py-1 ${c.canViewDirectory ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100'}`}>
                Directory
              </li>
              <li className={`rounded-full px-2.5 py-1 ${c.canManageStaff ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100'}`}>
                Staff files
              </li>
              <li className={`rounded-full px-2.5 py-1 ${c.canPayroll ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100'}`}>
                Payroll
              </li>
              <li className={`rounded-full px-2.5 py-1 ${c.canUploadAttendance ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100'}`}>
                Attendance upload
              </li>
              <li className={`rounded-full px-2.5 py-1 ${c.canLoanMaint ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100'}`}>
                Loan maintenance
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {selfId ? (
          <Link to="/hr/staff/me" className={cardBase}>
            <span className="text-[10px] font-black uppercase tracking-wide text-violet-600">Profile</span>
            <h3 className="mt-2 text-base font-black text-slate-900 group-hover:text-violet-800">My HR file</h3>
            <p className="mt-1 flex-1 text-sm text-slate-600">View your employment record and compensation on file.</p>
            <span className="mt-4 text-[11px] font-black uppercase text-violet-700">Open →</span>
          </Link>
        ) : null}

        {c.canViewDirectory ? (
          <Link to="/hr/staff" className={cardBase}>
            <Users className="text-violet-600" size={24} />
            <h3 className="mt-2 text-base font-black text-slate-900 group-hover:text-violet-800">Staff directory</h3>
            <p className="mt-1 flex-1 text-sm text-slate-600">
              {staffCount != null ? (
                <>
                  <strong>{staffCount}</strong> profile(s) in your scope. Open records and register new staff.
                </>
              ) : (
                'Search, open profiles, and register new employees.'
              )}
            </p>
            <span className="mt-4 text-[11px] font-black uppercase text-violet-700">Open →</span>
          </Link>
        ) : null}

        {c.canViewDirectory || c.canPayroll ? (
          <Link to="/hr/salary-welfare" className={cardBase}>
            <HeartHandshake className="text-violet-600" size={24} />
            <h3 className="mt-2 text-base font-black text-slate-900 group-hover:text-violet-800">Salary &amp; welfare</h3>
            <p className="mt-1 flex-1 text-sm text-slate-600">
              Net pay calculator, compensation table, approved loans, and accrual notes.
            </p>
            <span className="mt-4 text-[11px] font-black uppercase text-violet-700">Open →</span>
          </Link>
        ) : null}

        {c.canPayroll ? (
          <Link to="/hr/payroll" className={cardBase}>
            <Banknote className="text-violet-600" size={24} />
            <h3 className="mt-2 text-base font-black text-slate-900 group-hover:text-violet-800">Payroll runs</h3>
            <p className="mt-1 flex-1 text-sm text-slate-600">
              Draft periods, recompute from attendance &amp; loans, lock, export treasury CSV, mark paid.
            </p>
            <span className="mt-4 text-[11px] font-black uppercase text-violet-700">Open →</span>
          </Link>
        ) : null}

        {c.canUploadAttendance || c.canPayroll || c.canViewDirectory ? (
          <Link to="/hr/time" className={cardBase}>
            <CalendarClock className="text-violet-600" size={24} />
            <h3 className="mt-2 text-base font-black text-slate-900 group-hover:text-violet-800">Time &amp; attendance</h3>
            <p className="mt-1 flex-1 text-sm text-slate-600">Upload monthly absent days per branch — feeds payroll deductions.</p>
            <span className="mt-4 text-[11px] font-black uppercase text-violet-700">Open →</span>
          </Link>
        ) : null}

        <Link to="/hr/talent" className={cardBase}>
          <ClipboardList className="text-violet-600" size={24} />
          <h3 className="mt-2 text-base font-black text-slate-900 group-hover:text-violet-800">Talent &amp; requests</h3>
          <p className="mt-1 flex-1 text-sm text-slate-600">
            Leave, loans, and other HR cases — submit, review, and hand off to finance for disbursement.
          </p>
          <span className="mt-4 text-[11px] font-black uppercase text-violet-700">Open →</span>
        </Link>
      </div>

      <p className="mt-8 text-xs text-slate-500">
        Approved staff loans create payment requests in{' '}
        <Link to="/accounts" className="text-violet-700 hover:underline">
          Account
        </Link>
        . After payment, deductions appear in payroll runs automatically.
      </p>
    </MainPanel>
  );
}
