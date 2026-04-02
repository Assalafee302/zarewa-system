import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { HrWorkspaceProvider, useHrWorkspace } from '../../context/HrWorkspaceContext';
import { PageShell } from '../../components/layout';

const links = [
  { to: '/hr/overview', label: 'Overview', end: true },
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
      {caps?.enabled === false ? (
        <div
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          HR tables are not enabled on this server — screens may be empty until the module is initialised.
        </div>
      ) : null}
      <nav
        className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 pb-3 -mx-1 px-1 overflow-x-auto"
        aria-label="HR sections"
      >
        {links.map((l) => {
          const active =
            path === l.to ||
            path.startsWith(`${l.to}/`) ||
            (l.to === '/hr/overview' && path === '/hr');
          return (
            <Link
              key={l.to}
              to={l.to}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                active ? 'bg-[#134e4a] text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {l.label}
            </Link>
          );
        })}
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
