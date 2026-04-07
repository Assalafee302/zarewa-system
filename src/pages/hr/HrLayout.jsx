import React, { useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { HrWorkspaceProvider, useHrWorkspace } from '../../context/HrWorkspaceContext';
import { PageShell, PageHeader, PageTabs } from '../../components/layout';

const links = [
  { to: '/hr/home', label: 'Overview' },
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
  const navigate = useNavigate();
  const { caps } = useHrWorkspace();
  const path = (loc.pathname || '/').replace(/\/$/, '') || '/';

  const hrTabs = useMemo(() => {
    const t = links.map((l) => ({ id: l.to, label: l.label }));
    if (caps?.canViewDirectory) {
      t.push({ id: '/hr/staff/directory-quality', label: 'Directory data quality' });
    }
    return t;
  }, [caps?.canViewDirectory]);

  const tabValue = useMemo(() => {
    if (path.startsWith('/hr/staff/directory-quality')) return '/hr/staff/directory-quality';
    const match = links.find((l) => {
      let active =
        path === l.to || path.startsWith(`${l.to}/`) || (l.to === '/hr/my-profile' && path === '/hr');
      if (l.to === '/hr/staff' && path.startsWith('/hr/staff/directory-quality')) active = false;
      return active;
    });
    return match?.to ?? '/hr/home';
  }, [path]);

  return (
    <>
      <PageHeader
        title="Human resources"
        subtitle="Staff files, payroll, attendance, and approvals."
        tabs={
          <PageTabs tabs={hrTabs} value={tabValue} onChange={(id) => navigate(id)} />
        }
      />

      {caps?.enabled === false ? (
        <div
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          HR tables are not enabled on this server — screens may be empty until the module is initialised.
        </div>
      ) : null}

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
