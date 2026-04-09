import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, RefreshCw, Users } from 'lucide-react';
import { MainPanel, PageHeader } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import HrCapsLoading from './hrCapsLoading';
import { HrSectionCard } from './hrUx';

export default function HrHome() {
  const { caps } = useHrWorkspace();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    const { ok, data } = await apiFetch('/api/hr/inbox-summary');
    setBusy(false);
    if (ok && data?.ok) setSummary(data.counts || {});
    else setSummary(null);
  }, []);

  useEffect(() => {
    if (caps === null || caps.enabled === false) return;
    void load();
  }, [caps, load]);

  if (caps === null) return <HrCapsLoading />;
  if (caps.enabled === false) {
    return (
      <MainPanel>
        <PageHeader title="HR overview" />
        <p className="text-sm text-amber-800">HR data is not initialised on this server.</p>
      </MainPanel>
    );
  }

  const c = summary || {};

  return (
    <>
      <MainPanel>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
            Queues and payroll drafts that need attention — jump to the right screen from the cards below.
          </p>
          <button
            type="button"
            onClick={() => load()}
            disabled={busy}
            className="z-btn-secondary gap-2 py-2 px-4 text-xs disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <HrSectionCard
            title="Approvals"
            subtitle="Leave, loans, and other HR requests"
            actions={
              <Link
                to="/hr/talent"
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-black uppercase text-[#134e4a] no-underline"
              >
                Open queue
              </Link>
            }
          >
            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex justify-between gap-2">
                <span className="flex items-center gap-2">
                  <ClipboardList size={16} className="text-amber-700 shrink-0" />
                  HR review
                </span>
                <span className="font-black text-slate-900">{c.pendingHrReview ?? '—'}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>Branch endorsement</span>
                <span className="font-black text-slate-900">{c.pendingBranchEndorse ?? '—'}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>GM HR final</span>
                <span className="font-black text-slate-900">{c.pendingGmHrReview ?? '—'}</span>
              </li>
              <li className="flex justify-between gap-2 border-t border-slate-100 pt-2 text-amber-900">
                <span>Overdue (SLA)</span>
                <span className="font-black">{c.overdueRequests ?? '—'}</span>
              </li>
            </ul>
          </HrSectionCard>

          <HrSectionCard
            title="Payroll"
            subtitle="Draft runs awaiting MD sign-off and lock"
            actions={
              <Link
                to="/hr/payroll"
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-black uppercase text-[#134e4a] no-underline"
              >
                Payroll
              </Link>
            }
          >
            <p className="text-3xl font-black text-[#134e4a]">{c.draftPayrollRuns ?? '—'}</p>
            <p className="mt-1 text-xs text-slate-500">Draft runs in the system (all branches).</p>
          </HrSectionCard>

          <HrSectionCard
            title="Directory"
            subtitle="Staff files and profiles"
            actions={
              <Link
                to="/hr/staff"
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-black uppercase text-[#134e4a] no-underline"
              >
                <Users size={14} />
                Staff
              </Link>
            }
          >
            <p className="text-sm text-slate-600">
              Use <strong>Staff</strong> for line manager assignment, leave band, and branch history on each profile.
            </p>
          </HrSectionCard>
        </div>
      </MainPanel>
    </>
  );
}
