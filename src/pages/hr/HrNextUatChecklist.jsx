import React, { useEffect, useState } from 'react';
import { MainPanel, PageHeader } from '../../components/layout';
import { apiFetch } from '../../lib/apiBase';

export default function HrNextUatChecklist() {
  const [state, setState] = useState({ loading: true, gates: {}, canCutover: false, signoff: null });
  const [note, setNote] = useState('');

  const load = async (dead = false) => {
    const { ok, data } = await apiFetch('/api/hr/next-uat-readiness');
    if (dead) return;
    if (ok && data?.ok) {
      setState({
        loading: false,
        gates: data.gates || {},
        canCutover: Boolean(data.canCutover),
        signoff: data.signoff || null,
      });
    } else {
      setState({ loading: false, gates: {}, canCutover: false, signoff: null });
    }
  };

  useEffect(() => {
    let dead = false;
    void (async () => {
      await load(dead);
    })();
    return () => {
      dead = true;
    };
  }, []);

  const submitSignoff = async (approve) => {
    const { ok } = await apiFetch('/api/hr/next-uat-signoff', {
      method: 'POST',
      body: JSON.stringify({ approve, note }),
    });
    if (ok) await load(false);
  };

  return (
    <MainPanel>
      <PageHeader
        title="HR Next UAT checklist"
        subtitle="Gate review before replacing legacy /hr entry."
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-semibold text-slate-700">
          Cutover status:{' '}
          <span className={state.canCutover ? 'text-emerald-700' : 'text-amber-700'}>
            {state.loading ? 'Checking...' : state.canCutover ? 'Ready' : 'Not ready'}
          </span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Sign-off: {state.signoff?.approvedAtIso ? `approved by ${state.signoff.approvedByName}` : 'pending'}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Object.entries(state.gates || {}).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
              <span className="font-semibold">{k}</span>
              <span className="ml-2 text-slate-600">{String(v)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Sign-off note (optional)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => submitSignoff(true)}
              className="rounded bg-[#134e4a] px-3 py-1.5 text-xs font-bold text-white"
            >
              Approve cutover
            </button>
            <button
              type="button"
              onClick={() => submitSignoff(false)}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              Revoke sign-off
            </button>
          </div>
        </div>
      </div>
    </MainPanel>
  );
}
