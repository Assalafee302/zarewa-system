import React, { useEffect, useMemo, useState } from 'react';
import { Activity, FileCheck2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MainPanel, PageHeader } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import { HrOpsToolbar } from './hrUx';

export default function HrCompliance() {
  const { caps } = useHrWorkspace();
  const ws = useWorkspace();
  const [policyVersion, setPolicyVersion] = useState('2026.04');
  const [signatureName, setSignatureName] = useState(ws?.session?.user?.displayName || '');
  const [loading, setLoading] = useState(false);
  const [acks, setAcks] = useState([]);
  const [obs, setObs] = useState({ summary: {}, events: [] });
  const [uat, setUat] = useState({ gates: {}, canCutover: false });
  const [error, setError] = useState('');

  const canAccess = Boolean(caps?.canCompliance);

  const reload = async () => {
    if (!canAccess) return;
    setLoading(true);
    setError('');
    try {
      const [aRes, oRes, uRes] = await Promise.all([
        apiFetch('/api/hr/policy-acknowledgements?policyKey=employee_handbook'),
        apiFetch('/api/hr/observability'),
        apiFetch('/api/hr/next-uat-readiness'),
      ]);
      if (aRes.ok && aRes.data?.ok) setAcks(Array.isArray(aRes.data.acknowledgements) ? aRes.data.acknowledgements : []);
      if (oRes.ok && oRes.data?.ok) {
        setObs({
          summary: oRes.data.summary || {},
          events: Array.isArray(oRes.data.events) ? oRes.data.events : [],
        });
      }
      if (uRes.ok && uRes.data?.ok) {
        setUat({ gates: uRes.data.gates || {}, canCutover: Boolean(uRes.data.canCutover) });
      }
      if (!aRes.ok || !oRes.ok) {
        setError(aRes.data?.error || oRes.data?.error || 'Could not load compliance data.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  const latestAck = useMemo(() => (acks.length ? acks[0] : null), [acks]);

  const submitAck = async (e) => {
    e.preventDefault();
    if (!signatureName.trim() || !policyVersion.trim()) return;
    setLoading(true);
    setError('');
    const { ok, data } = await apiFetch('/api/hr/policy-acknowledgements', {
      method: 'POST',
      body: JSON.stringify({
        policyKey: 'employee_handbook',
        policyVersion: policyVersion.trim(),
        signatureName: signatureName.trim(),
        context: { channel: 'hr-compliance-page' },
      }),
    });
    setLoading(false);
    if (!ok || !data?.ok) {
      setError(data?.error || 'Could not record acknowledgement.');
      return;
    }
    await reload();
  };

  if (!canAccess) {
    return (
      <MainPanel>
        <PageHeader title="Compliance & audits" subtitle="Handbook sign-off and who changed what in HR" />
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          You do not have compliance access for this module.
        </div>
      </MainPanel>
    );
  }

  return (
    <MainPanel>
      <PageHeader
        title="Compliance & audits"
        subtitle="Who signed the handbook, recent HR audit events, and (for admins) go-live checklist status."
      />
      <HrOpsToolbar
        left={<p className="text-xs font-semibold text-slate-600">Signatures · audit trail · UAT readiness</p>}
        right={
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700"
          >
            Refresh
          </button>
        }
      />

      {error ? (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-bold uppercase text-slate-500">Total events</p>
          <p className="mt-1 text-2xl font-black text-[#134e4a] tabular-nums">{obs.summary.totalEvents || 0}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <p className="text-[10px] font-bold uppercase text-amber-800">Pending reviews</p>
          <p className="mt-1 text-2xl font-black text-amber-900 tabular-nums">
            {(obs.summary.pendingHrReview || 0) + (obs.summary.pendingManagerReview || 0)}
          </p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4">
          <p className="text-[10px] font-bold uppercase text-rose-800">Overdue requests</p>
          <p className="mt-1 text-2xl font-black text-rose-900 tabular-nums">{obs.summary.overdueRequests || 0}</p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 mb-6">
        <h3 className="text-sm font-black text-[#134e4a] flex items-center gap-2">
          <FileCheck2 size={16} /> Handbook acknowledgement
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Record policy acceptance with signature and version control for audit.
        </p>
        <form onSubmit={submitAck} className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={policyVersion}
            onChange={(e) => setPolicyVersion(e.target.value)}
            placeholder="Policy version"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <input
            value={signatureName}
            onChange={(e) => setSignatureName(e.target.value)}
            placeholder="Signer name"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <button type="submit" disabled={loading} className="z-btn-primary justify-center">
            <ShieldCheck size={16} /> {loading ? 'Saving...' : 'Record acceptance'}
          </button>
        </form>
        {latestAck ? (
          <p className="mt-3 text-[11px] text-slate-600">
            Latest: <strong>{latestAck.policyVersion}</strong> by {latestAck.signatureName || latestAck.userId} on{' '}
            {String(latestAck.acceptedAtIso || '').slice(0, 10)}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-black text-[#134e4a] flex items-center gap-2">
          <Activity size={16} /> Recent HR audit events
        </h3>
        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-100">
              <tr>
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Actor</th>
                <th className="py-2 pr-3">Entity</th>
              </tr>
            </thead>
            <tbody>
              {obs.events.slice(0, 40).map((e) => (
                <tr key={e.id} className="border-b border-slate-50">
                  <td className="py-2 pr-3 text-slate-500">{String(e.atIso || '').slice(0, 10)}</td>
                  <td className="py-2 pr-3 font-semibold text-slate-700">{e.action}</td>
                  <td className="py-2 pr-3 text-slate-600">{e.actorDisplayName || e.actorUserId || '—'}</td>
                  <td className="py-2 pr-3 text-slate-500">{e.entityKind}{e.entityId ? ` · ${e.entityId}` : ''}</td>
                </tr>
              ))}
              {obs.events.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={4}>
                    {loading ? 'Loading events...' : 'No HR audit events yet.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-black text-[#134e4a]">Go-live / UAT readiness</h3>
        <p className="mt-1 text-xs text-slate-500">
          Summary of checks before you treat HR as production-ready. Full checklist and sign-off live on a dedicated page.
        </p>
        <div className="mt-2">
          <Link to="/hr/uat-checklist" className="text-xs font-semibold text-[#134e4a] hover:underline">
            Open UAT checklist &amp; sign-off
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {Object.entries(uat.gates || {}).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
              <span className="font-semibold text-slate-700">{k}</span>
              <span className="ml-2 text-slate-500">{String(v)}</span>
            </div>
          ))}
        </div>
      </section>
    </MainPanel>
  );
}
