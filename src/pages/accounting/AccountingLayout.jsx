import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { PageShell, PageHeader } from '../../components/layout';
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
  const ws = useWorkspace();
  const path = (loc.pathname || '/').replace(/\/$/, '') || '/';
  const viewAll = Boolean(ws?.session?.viewAllBranches);
  const roleKey = String(ws?.session?.user?.roleKey ?? '').trim().toLowerCase();
  const isHqRole = roleKey === 'admin' || roleKey === 'md' || roleKey === 'ceo';
  const canRollup = isHqRole && ws?.hasPermission?.('hq.view_all_branches');

  return (
    <PageShell>
      <PageHeader
        eyebrow="Headquarters"
        title="Accounting"
        subtitle="Headquarters module for group charting, asset registers, product costing, ledger structure, and management statements. Operational cash and AP stay under Finance."
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

      <nav
        className="mb-6 flex flex-wrap gap-1 border-b border-slate-200 pb-3 -mx-1 px-1 overflow-x-auto"
        aria-label="Accounting sections"
      >
        {links.map((l) => {
          const active = path === l.to || (l.to === '/accounting/overview' && path === '/accounting');
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
      </nav>

      <Outlet />
    </PageShell>
  );
}
