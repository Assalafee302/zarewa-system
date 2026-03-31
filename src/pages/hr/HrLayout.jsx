import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { HrWorkspaceProvider, useHrWorkspace } from '../../context/HrWorkspaceContext';
import { PageShell } from '../../components/layout';

const links = [
  { to: '/hr', label: 'Overview', end: true },
  { to: '/hr/staff', label: 'Staff' },
  { to: '/hr/salary-welfare', label: 'Salary & welfare' },
  { to: '/hr/payroll', label: 'Payroll' },
  { to: '/hr/time', label: 'Time' },
  { to: '/hr/talent', label: 'Talent' },
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
      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200/80 pb-4">
        {links.map((l) => {
          const active = l.end ? path === '/hr' : path === l.to || path.startsWith(`${l.to}/`);
          return (
            <Link
              key={l.to}
              to={l.to}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? 'bg-violet-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
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
