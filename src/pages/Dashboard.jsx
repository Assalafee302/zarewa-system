import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { PageShell } from '../components/layout';
import { AiAskButton } from '../components/AiAskButton';
import { OfficeRecordComposeDrawer } from '../components/office/OfficeRecordComposeDrawer';
import { OfficeThreadConversationDrawer } from '../components/office/OfficeThreadConversationDrawer';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';
import { WorkspaceKpiCard } from '../components/dashboard/WorkspaceKpiCard';
import { WorkspaceUpdatesPanel } from '../components/dashboard/WorkspaceUpdatesPanel';
import UnifiedWorkItemsPanel from '../components/workspace/UnifiedWorkItemsPanel';
import GmailStyleWorkspace from '../components/workspace/GmailStyleWorkspace';

const KPI_PLACEHOLDERS = [
  { label: 'Throughput', hint: 'Metric to be connected.' },
  { label: 'Cash & exposure', hint: 'Metric to be connected.' },
  { label: 'Open items', hint: 'Metric to be connected.' },
  { label: 'Risk & SLA', hint: 'Metric to be connected.' },
];

const Dashboard = () => {
  const ws = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [officeSummary, setOfficeSummary] = useState(null);
  const [officialDrawerOpen, setOfficialDrawerOpen] = useState(false);
  const [workItemsView, setWorkItemsView] = useState('needs_action');
  const [mailThreadId, setMailThreadId] = useState(null);
  const canOffice = Boolean(ws?.canAccessModule?.('office'));

  useEffect(() => {
    const st = location.state;
    if (!st || typeof st !== 'object') return;
    let consumed = false;
    if (st.openCompose === true) {
      setOfficialDrawerOpen(true);
      consumed = true;
    }
    if (st.selectedThreadId) {
      setMailThreadId(String(st.selectedThreadId));
      consumed = true;
    }
    if (consumed) navigate('.', { replace: true, state: {} });
  }, [location.state, navigate]);

  useEffect(() => {
    if (!canOffice) {
      setOfficeSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { ok, data } = await apiFetch('/api/office/summary');
      if (cancelled) return;
      if (ok && data?.ok) setOfficeSummary(data);
      else setOfficeSummary(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [canOffice, ws?.refreshEpoch]);

  const quotations = Array.isArray(ws?.snapshot?.quotations) ? ws.snapshot.quotations : [];
  const productionJobs = Array.isArray(ws?.snapshot?.productionJobs) ? ws.snapshot.productionJobs : [];
  const pendingCoilRequests = Array.isArray(ws?.snapshot?.coilRequests)
    ? ws.snapshot.coilRequests.filter((r) => r.status === 'pending')
    : [];

  return (
    <PageShell>
      <div className="space-y-8 px-1 pb-10">
        <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            {KPI_PLACEHOLDERS.map((k, i) => (
              <WorkspaceKpiCard key={k.label} index={i} label={k.label} hint={k.hint} />
            ))}
          </div>
          <AiAskButton
            mode="search"
            prompt="What needs my attention today across the workspace, and where should I go first?"
            pageContext={{
              source: 'dashboard-page',
              pendingCoilRequestCount: pendingCoilRequests.length,
              quotationCount: quotations.length,
              productionJobCount: productionJobs.length,
            }}
            resetConversation
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl border border-teal-100 bg-white px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-[#134e4a] shadow-sm transition hover:bg-teal-50 xl:mt-1"
          >
            Ask AI
          </AiAskButton>
        </div>

        {!canOffice ? (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/manager"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-700 hover:bg-slate-50"
              >
                <ShieldCheck size={14} aria-hidden />
                Management view
              </Link>
            </div>
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setWorkItemsView('needs_action')}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${
                  workItemsView === 'needs_action' ? 'bg-white text-[#134e4a] shadow-sm' : 'text-slate-500'
                }`}
              >
                Needs action
              </button>
              <button
                type="button"
                onClick={() => setWorkItemsView('all')}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${
                  workItemsView === 'all' ? 'bg-white text-[#134e4a] shadow-sm' : 'text-slate-500'
                }`}
              >
                In tray
              </button>
              <button
                type="button"
                onClick={() => setWorkItemsView('file')}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${
                  workItemsView === 'file' ? 'bg-white text-[#134e4a] shadow-sm' : 'text-slate-500'
                }`}
              >
                File
              </button>
              <button
                type="button"
                onClick={() => setWorkItemsView('unfiled')}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${
                  workItemsView === 'unfiled' ? 'bg-white text-[#134e4a] shadow-sm' : 'text-slate-500'
                }`}
              >
                Unfiled
              </button>
            </div>
          </div>
        ) : null}

        {canOffice ? (
          <GmailStyleWorkspace
            officeSummary={officeSummary}
            workItemsView={workItemsView}
            onWorkItemsViewChange={setWorkItemsView}
            mailThreadId={mailThreadId}
            onMailThreadIdChange={setMailThreadId}
            onCompose={() => setOfficialDrawerOpen(true)}
          />
        ) : (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
            <div className="min-h-0 min-w-0 lg:col-span-2">
              <UnifiedWorkItemsPanel hideFooter view={workItemsView} onOpenMailReader={setMailThreadId} />
            </div>
            <div className="min-h-0 min-w-0 lg:col-span-1">
              <WorkspaceUpdatesPanel officeSummary={officeSummary} canOffice={canOffice} />
            </div>
          </div>
        )}

        {canOffice ? (
          <div className="min-h-0 min-w-0">
            <WorkspaceUpdatesPanel officeSummary={officeSummary} canOffice={canOffice} />
          </div>
        ) : null}
      </div>

      <OfficeRecordComposeDrawer
        isOpen={officialDrawerOpen}
        onDismiss={() => setOfficialDrawerOpen(false)}
        presentation={canOffice ? 'gmail' : 'drawer'}
      />
      {!canOffice ? (
        <OfficeThreadConversationDrawer
          threadId={mailThreadId || ''}
          isOpen={Boolean(mailThreadId)}
          onDismiss={() => setMailThreadId(null)}
        />
      ) : null}
    </PageShell>
  );
};

export default Dashboard;
