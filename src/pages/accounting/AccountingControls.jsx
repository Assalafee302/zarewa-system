import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, RefreshCw, Unlock } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import { hasPermissionInList } from '../../lib/moduleAccess';
import { APP_DATA_TABLE_PAGE_SIZE, useAppTablePaging } from '../../lib/appDataTable';
import {
  AppTable,
  AppTableBody,
  AppTablePager,
  AppTableTd,
  AppTableTh,
  AppTableThead,
  AppTableTr,
  AppTableWrap,
} from '../../components/ui/AppDataTable';

const PANEL = 'z-panel-section rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm';

export default function AccountingControls() {
  const ws = useWorkspace();
  const perms = ws?.session?.permissions ?? [];
  const canManagePeriod = hasPermissionInList(perms, 'period.manage');
  const canPost = hasPermissionInList(perms, 'finance.post');

  const [locks, setLocks] = useState([]);
  const [locksLoading, setLocksLoading] = useState(true);
  const [locksError, setLocksError] = useState('');
  const [periodKey, setPeriodKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [lockReason, setLockReason] = useState('');
  const [busy, setBusy] = useState(false);

  const [depPeriod, setDepPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [depPreview, setDepPreview] = useState(null);
  const [depLoading, setDepLoading] = useState(false);
  const [depError, setDepError] = useState('');
  const [depMsg, setDepMsg] = useState('');

  const loadLocks = useCallback(async () => {
    setLocksLoading(true);
    setLocksError('');
    const { ok, data } = await apiFetch('/api/controls/period-locks');
    setLocksLoading(false);
    if (!ok || !data?.ok) {
      setLocksError(data?.error || 'Could not load period locks.');
      setLocks([]);
      return;
    }
    setLocks(Array.isArray(data.periodLocks) ? data.periodLocks : []);
  }, []);

  useEffect(() => {
    void loadLocks();
  }, [loadLocks, ws?.refreshEpoch]);

  const lockPeriod = async (e) => {
    e.preventDefault();
    const pk = periodKey.trim();
    if (!pk) return;
    setBusy(true);
    setLocksError('');
    const { ok, data } = await apiFetch('/api/controls/period-locks', {
      method: 'POST',
      body: JSON.stringify({ periodKey: pk, reason: lockReason.trim() }),
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      setLocksError(data?.error || 'Lock failed.');
      return;
    }
    setLockReason('');
    void loadLocks();
    ws?.refresh?.();
  };

  const unlockPeriod = async (pk) => {
    setBusy(true);
    setLocksError('');
    const { ok, data } = await apiFetch(`/api/controls/period-locks/${encodeURIComponent(pk)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason: 'Unlocked from Accounting HQ' }),
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      setLocksError(data?.error || 'Unlock failed.');
      return;
    }
    void loadLocks();
    ws?.refresh?.();
  };

  const loadDepPreview = useCallback(async () => {
    setDepLoading(true);
    setDepError('');
    const { ok, data } = await apiFetch(
      `/api/accounting/depreciation-preview?periodKey=${encodeURIComponent(depPeriod.trim())}`
    );
    setDepLoading(false);
    if (!ok || !data?.ok) {
      setDepPreview(null);
      setDepError(data?.error || 'Preview failed.');
      return;
    }
    setDepPreview(data);
  }, [depPeriod]);

  useEffect(() => {
    void loadDepPreview();
  }, [loadDepPreview, ws?.refreshEpoch]);

  const postDepreciation = async () => {
    setBusy(true);
    setDepMsg('');
    setDepError('');
    const { ok, data } = await apiFetch('/api/accounting/depreciation-run', {
      method: 'POST',
      body: JSON.stringify({ periodKey: depPeriod.trim() }),
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      setDepError(data?.error || 'Post failed.');
      return;
    }
    setDepMsg(data.duplicate ? 'Already posted (idempotent).' : `Posted journal ${data.journalId || ''}.`);
    void loadDepPreview();
    ws?.refresh?.();
  };

  const depRows = useMemo(() => depPreview?.rows || [], [depPreview?.rows]);
  const depRowsPage = useAppTablePaging(depRows, APP_DATA_TABLE_PAGE_SIZE, depPeriod);

  return (
    <div className="space-y-5">
      <section className={PANEL}>
        <h2 className="text-lg font-black text-[#134e4a] tracking-tight mb-2">Period close and controls</h2>
        <p className="text-sm text-slate-600 font-medium leading-relaxed mb-4 max-w-3xl">
          Locked periods block back-dated operational postings and GL journals (including depreciation). Finance leads with{' '}
          <span className="font-semibold text-slate-800">period.manage</span> can lock and unlock here;{' '}
          <span className="font-semibold text-slate-800">finance.view</span> or{' '}
          <span className="font-semibold text-slate-800">treasury.manage</span> can review the lock list.
        </p>

        {locksError ? (
          <p className="text-sm font-semibold text-red-600 mb-3" role="alert">
            {locksError}
          </p>
        ) : null}

        {locksLoading ? (
          <p className="text-sm text-slate-500">Loading locks…</p>
        ) : (
          <ul className="space-y-2 mb-6">
            {locks.length === 0 ? (
              <li className="text-sm text-slate-500 font-medium">No periods locked.</li>
            ) : (
              locks.map((l) => (
                <li
                  key={l.periodKey}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-black text-[#134e4a]">{l.periodKey}</p>
                    <p className="text-xs text-slate-600 font-medium">
                      {l.reason || 'Locked'} · {l.lockedByName || '—'} · {l.lockedAtISO?.slice(0, 16) || ''}
                    </p>
                  </div>
                  {canManagePeriod ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void unlockPeriod(l.periodKey)}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                    >
                      <Unlock className="h-3.5 w-3.5" aria-hidden />
                      Unlock
                    </button>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        )}

        {canManagePeriod ? (
          <form onSubmit={lockPeriod} className="rounded-xl border border-teal-100 bg-teal-50/40 p-4 space-y-3">
            <p className="text-xs font-black uppercase text-[#134e4a]">Lock a period</p>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="text-xs font-bold text-slate-600">
                YYYY-MM
                <input
                  className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                  value={periodKey}
                  onChange={(e) => setPeriodKey(e.target.value)}
                />
              </label>
              <label className="text-xs font-bold text-slate-600 flex-1 min-w-[200px]">
                Reason
                <input
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={lockReason}
                  onChange={(e) => setLockReason(e.target.value)}
                  placeholder="Month-end close"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-[#134e4a] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                <Lock className="h-4 w-4" aria-hidden />
                Lock
              </button>
            </div>
          </form>
        ) : (
          <p className="text-xs font-semibold text-slate-400">You do not have period.manage — unlock/lock is disabled.</p>
        )}

        <button
          type="button"
          onClick={() => void loadLocks()}
          className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-[#134e4a]"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Reload locks
        </button>
      </section>

      <section className={PANEL}>
        <h2 className="text-lg font-black text-[#134e4a] tracking-tight mb-2">Depreciation run (GL)</h2>
        <p className="text-sm text-slate-600 font-medium leading-relaxed mb-4">
          Straight-line estimate per active fixed asset for the month. Posts one journal: Dr 6100 Depreciation expense, Cr
          1398 Accumulated depreciation. Idempotent per period and branch scope. Respects period lock on month-end date.
        </p>

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="text-xs font-bold text-slate-600">
            Period
            <input
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
              value={depPeriod}
              onChange={(e) => setDepPeriod(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => void loadDepPreview()}
            disabled={depLoading}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-800"
          >
            Refresh preview
          </button>
          {canPost ? (
            <button
              type="button"
              disabled={busy || depLoading || !depPreview?.totalDepreciationNgn}
              onClick={() => void postDepreciation()}
              className="rounded-xl bg-[#134e4a] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Post to GL
            </button>
          ) : null}
        </div>

        {depError ? (
          <p className="text-sm text-red-600 font-semibold mb-2" role="alert">
            {depError}
          </p>
        ) : null}
        {depMsg ? (
          <p className="text-sm text-teal-800 font-semibold mb-2">{depMsg}</p>
        ) : null}

        {depLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : depPreview?.ok ? (
          <div className="space-y-2">
            <p className="text-sm font-bold text-slate-800">
              Total {depPreview.totalDepreciationNgn?.toLocaleString('en-NG') || 0} NGN · {depPreview.rows?.length || 0}{' '}
              asset line(s) · entry date {depPreview.entryDateISO}
            </p>
            <AppTableWrap className="max-h-48 overflow-y-auto shadow-none">
              <AppTable role="numeric" className="text-sm">
                <AppTableThead sticky>
                  <AppTableTh>Asset</AppTableTh>
                  <AppTableTh>Branch</AppTableTh>
                  <AppTableTh align="right">Amount (NGN)</AppTableTh>
                </AppTableThead>
                <AppTableBody>
                  {depRowsPage.slice.map((r) => (
                    <AppTableTr key={r.assetId}>
                      <AppTableTd title={r.name}>{r.name}</AppTableTd>
                      <AppTableTd monospace title={r.branchId}>
                        {r.branchId}
                      </AppTableTd>
                      <AppTableTd align="right" monospace>
                        {r.amountNgn?.toLocaleString('en-NG')}
                      </AppTableTd>
                    </AppTableTr>
                  ))}
                </AppTableBody>
              </AppTable>
            </AppTableWrap>
            <AppTablePager
              showingFrom={depRowsPage.showingFrom}
              showingTo={depRowsPage.showingTo}
              total={depRowsPage.total}
              hasPrev={depRowsPage.hasPrev}
              hasNext={depRowsPage.hasNext}
              onPrev={depRowsPage.goPrev}
              onNext={depRowsPage.goNext}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
