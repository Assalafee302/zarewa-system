import React, { useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { PageShell, PageHeader, PageTabs } from '../../components/layout';
import { useWorkspace } from '../../context/WorkspaceContext';

const links = [
  { to: '/accounting/overview', label: 'Overview' },
  { to: '/accounting/assets', label: 'Fixed assets' },
  { to: '/accounting/costing', label: 'Costing' },
  { to: '/accounting/ledger', label: 'General ledger' },
  { to: '/accounting/statements', label: 'Statements' },
  { to: '/accounting/controls', label: 'Period & controls' },
];

export default function AccountingLayout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const path = (loc.pathname || '/').replace(/\/$/, '') || '/';
  const viewAll = Boolean(ws?.session?.viewAllBranches);
  const roleKey = String(ws?.session?.user?.roleKey ?? '').trim().toLowerCase();
  const isHqRole = roleKey === 'admin' || roleKey === 'md' || roleKey === 'ceo';
  const canRollup = isHqRole && ws?.hasPermission?.('hq.view_all_branches');

  const tabValue =
    path === '/accounting' || path === '' ? '/accounting/overview' : path;

  const accountingTabs = useMemo(
    () => links.map((l) => ({ id: l.to, label: l.label })),
    []
  );

  return (
    <PageShell>
      <PageHeader
        title="Accounting"
        subtitle="Group charting, asset registers, product costing, ledger structure, and management statements. Operational cash and AP stay under Finance."
        tabs={
          <PageTabs
            tabs={accountingTabs}
            value={tabValue}
            onChange={(id) => navigate(id)}
          />
        }
      />

      {canRollup && !viewAll ? (
        <div
          className="mb-5 flex flex-wrap items-start gap-3 rounded-xl border border-teal-200/80 bg-teal-50/50 px-4 py-3 text-sm text-[#134e4a]"
          role="status"
        >
          <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden />
          <div>
            <p className="font-bold">Group view recommended</p>
            <p className="mt-1 text-xs font-medium text-slate-600 leading-relaxed">
              Turn on <span className="font-semibold text-[#134e4a]">All branches</span> in the branch bar for HQ roll-up
              figures. Single-branch selection shows one legal entity or site only.
            </p>
          </div>
        </div>
      ) : null}

      <Outlet />
    </PageShell>
  );
}
