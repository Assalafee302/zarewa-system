import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { HrWorkspaceProvider, useHrWorkspace } from '../../context/HrWorkspaceContext';
import { PageShell } from '../../components/layout';

const links = [
  { to: '/hr/my-profile', label: 'My profile' },
  { to: '/hr/staff', label: 'Staff' },
  { to: '/hr/salary-welfare', label: 'Salary & benefits' },
  { to: '/hr/payroll', label: 'Payroll' },
  { to: '/hr/time', label: 'Time' },
  { to: '/hr/talent', label: 'Requests' },
  { to: '/hr/compliance', label: 'Compliance' },
];

function HrLayoutInner() {
  const loc = useLocation();
  const { caps } = useHrWorkspace();
  const path = (loc.pathname || '/').replace(/\/$/, '') || '/';

  return (
    <>
      <div className="mb-6 sm:mb-8 z-toolbar-shell px-4 py-4 sm:px-6 sm:py-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Human resources</p>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-3xl">
          Staff files, payroll, attendance, and approvals — use the sections below to move between areas.
        </p>
      </div>

      {caps?.enabled === false ? (
        <div
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          HR tables are not enabled on this server — screens may be empty until the module is initialised.
        </div>
      ) : null}

      <nav
        className="mb-6 flex flex-wrap gap-1 border-b border-slate-200 pb-3 -mx-1 px-1 overflow-x-auto"
        aria-label="HR sections"
      >
        {links.map((l) => {
          let active =
            path === l.to ||
            path.startsWith(`${l.to}/`) ||
            (l.to === '/hr/my-profile' && path === '/hr');
          if (l.to === '/hr/staff' && path.startsWith('/hr/staff/directory-quality')) {
            active = false;
          }
          return (
            <Link
              key={l.to}
              to={l.to}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                active ? 'bg-[#134e4a] text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {l.label}
            </Link>
          );
        })}
        {caps?.canViewDirectory ? (
          <Link
            to="/hr/staff/directory-quality"
            className={`inline-flex min-h-11 shrink-0 items-center rounded-lg border border-dashed px-3 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
              path.startsWith('/hr/staff/directory-quality')
                ? 'border-[#134e4a] bg-[#134e4a] text-white'
                : 'border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            Directory data quality
          </Link>
        ) : null}
      </nav>

      <Outlet />
    </>
  );
}

export default function HrLayout() {
  return (
    <HrWorkspaceProvider>
      <PageShell>
        <HrLayoutInner />
      </PageShell>
    </HrWorkspaceProvider>
  );
}
