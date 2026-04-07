import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import { downloadCsv } from '../../lib/csvDownload';
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

function monthRangeDefaults() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${String(last).padStart(2, '0')}` };
}

const emptyLine = () => ({ accountCode: '', debitNgn: '', creditNgn: '', memo: '' });

function formatNgn(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Math.round(Number(n)).toLocaleString('en-NG');
}

export default function AccountingLedger() {
  const ws = useWorkspace();
  const perms = ws?.session?.permissions ?? [];
  const canPost = hasPermissionInList(perms, 'finance.post');

  const { start: defStart, end: defEnd } = useMemo(() => monthRangeDefaults(), []);
  const [startDate, setStartDate] = useState(defStart);
  const [endDate, setEndDate] = useState(defEnd);

  const [accounts, setAccounts] = useState([]);
  const [trialBalance, setTrialBalance] = useState(null);
  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [expandedId, setExpandedId] = useState('');
  const [linesByJournal, setLinesByJournal] = useState({});
  const [linesLoading, setLinesLoading] = useState('');

  const [journalOpen, setJournalOpen] = useState(false);
  const [journalDate, setJournalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [journalMemo, setJournalMemo] = useState('');
  const [journalLines, setJournalLines] = useState([emptyLine(), emptyLine()]);
  const [journalSaving, setJournalSaving] = useState(false);
  const [journalMsg, setJournalMsg] = useState('');

  const loadAccounts = useCallback(async () => {
    await Promise.resolve();
    const { ok, data } = await apiFetch('/api/gl/accounts');
    if (ok && data?.ok && Array.isArray(data.accounts)) {
      setAccounts(data.accounts.filter((a) => a.isActive === true || a.isActive === 1 || a.isActive == null));
    }
  }, []);

  const loadRange = useCallback(async () => {
    setLoading(true);
    setError('');
    const qs = `?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
    const [tbRes, jRes] = await Promise.all([
      apiFetch(`/api/gl/trial-balance${qs}`),
      apiFetch(`/api/gl/journals${qs}`),
    ]);
    if (!tbRes.ok || !tbRes.data?.ok) {
      setError(tbRes.data?.error || 'Could not load trial balance.');
      setTrialBalance(null);
    } else {
      setTrialBalance(tbRes.data);
    }
    if (!jRes.ok || !jRes.data?.ok) {
      setError((e) => e || jRes.data?.error || 'Could not load journals.');
      setJournals([]);
    } else {
      setJournals(jRes.data.journals || []);
    }
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts, ws?.refreshEpoch]);

  useEffect(() => {
    void loadRange();
  }, [loadRange, ws?.refreshEpoch]);

  const toggleJournal = async (jid) => {
    if (expandedId === jid) {
      setExpandedId('');
      return;
    }
    setExpandedId(jid);
    if (linesByJournal[jid]) return;
    setLinesLoading(jid);
    const { ok, data } = await apiFetch(`/api/gl/journals/${encodeURIComponent(jid)}/lines`);
    setLinesLoading('');
    if (ok && data?.ok && Array.isArray(data.lines)) {
      setLinesByJournal((m) => ({ ...m, [jid]: data.lines }));
    }
  };

  const addJournalLine = () => setJournalLines((ls) => [...ls, emptyLine()]);
  const removeJournalLine = (i) => setJournalLines((ls) => (ls.length > 2 ? ls.filter((_, j) => j !== i) : ls));

  const submitJournal = async (e) => {
    e.preventDefault();
    setJournalSaving(true);
    setJournalMsg('');
    const lines = journalLines
      .map((l) => ({
        accountCode: String(l.accountCode || '').trim(),
        debitNgn: l.debitNgn === '' ? 0 : Math.round(Number(l.debitNgn) || 0),
        creditNgn: l.creditNgn === '' ? 0 : Math.round(Number(l.creditNgn) || 0),
        memo: String(l.memo || '').trim() || undefined,
      }))
      .filter((l) => l.accountCode && (l.debitNgn > 0 || l.creditNgn > 0));

    const sid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `manual-${crypto.randomUUID()}`
        : `manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const { ok, data } = await apiFetch('/api/gl/journal', {
      method: 'POST',
      body: JSON.stringify({
        entryDateISO: journalDate,
        memo: journalMemo.trim() || undefined,
        sourceKind: 'MANUAL',
        sourceId: sid,
        lines,
      }),
    });
    setJournalSaving(false);
    if (!ok || !data?.ok) {
      setJournalMsg(data?.error || 'Journal was not posted.');
      return;
    }
    setJournalMsg(data.duplicate ? 'Journal already existed (idempotent).' : `Posted journal ${data.journalId || ''}.`);
    setJournalMemo('');
    setJournalLines([emptyLine(), emptyLine()]);
    void loadRange();
  };

  const tbRows = trialBalance?.rows || [];
  const nonzeroTb = tbRows.filter((r) => r.debitNgn > 0 || r.creditNgn > 0);
  const tbDisplayForPaging = useMemo(() => {
    const rows = trialBalance?.rows || [];
    const nz = rows.filter((r) => r.debitNgn > 0 || r.creditNgn > 0);
    return nz.length ? nz : rows;
  }, [trialBalance?.rows]);

  const accountsPage = useAppTablePaging(accounts, APP_DATA_TABLE_PAGE_SIZE, ws?.refreshEpoch);
  const tbPage = useAppTablePaging(tbDisplayForPaging, APP_DATA_TABLE_PAGE_SIZE, startDate, endDate);
  const journalsPage = useAppTablePaging(journals, APP_DATA_TABLE_PAGE_SIZE, startDate, endDate);

  const exportTrialBalanceCsv = () => {
    if (!trialBalance?.ok) return;
    const headers = ['accountCode', 'accountName', 'accountType', 'debitNgn', 'creditNgn', 'netNgn'];
    const src = nonzeroTb.length ? nonzeroTb : tbRows;
    const body = src.map((r) => [r.accountCode, r.accountName, r.accountType, r.debitNgn, r.creditNgn, r.netNgn]);
    downloadCsv(`trial-balance-${startDate}_${endDate}.csv`, headers, body);
  };

  return (
    <div className="space-y-5">
      <section className={PANEL}>
        <h2 className="text-lg font-black text-[#134e4a] tracking-tight mb-2">General ledger</h2>
        <p className="text-sm text-slate-600 font-medium leading-relaxed mb-4 max-w-3xl">
          Chart of accounts, trial balance, journal history, and balanced manual journals. System postings (receipts,
          advances, GRN inventory) appear with their source kind. Sub-ledgers stay in Finance; this view is the posted
          double-entry register.
        </p>

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="text-xs font-bold text-slate-600">
            From
            <input
              type="date"
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            To
            <input
              type="date"
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => void loadRange()}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100"
          >
            Refresh
          </button>
        </div>

        {error ? (
          <p className="text-sm font-semibold text-red-600 mb-3" role="alert">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="text-sm text-slate-500 font-medium inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading GL…
          </p>
        ) : null}
      </section>

      <section className={PANEL}>
        <h3 className="text-sm font-black uppercase tracking-wide text-[#134e4a] mb-3">Chart of accounts</h3>
        <AppTableWrap className="max-h-56 overflow-y-auto">
          <AppTable role="reference">
            <AppTableThead sticky>
              <AppTableTh>Code</AppTableTh>
              <AppTableTh>Name</AppTableTh>
              <AppTableTh>Type</AppTableTh>
            </AppTableThead>
            <AppTableBody>
              {accountsPage.slice.map((a) => (
                <AppTableTr key={a.id || a.code} role="reference">
                  <AppTableTd monospace title={a.code}>
                    {a.code}
                  </AppTableTd>
                  <AppTableTd title={a.name}>{a.name}</AppTableTd>
                  <AppTableTd className="text-slate-600" title={a.type}>
                    {a.type}
                  </AppTableTd>
                </AppTableTr>
              ))}
            </AppTableBody>
          </AppTable>
        </AppTableWrap>
        <AppTablePager
          showingFrom={accountsPage.showingFrom}
          showingTo={accountsPage.showingTo}
          total={accountsPage.total}
          hasPrev={accountsPage.hasPrev}
          hasNext={accountsPage.hasNext}
          onPrev={accountsPage.goPrev}
          onNext={accountsPage.goNext}
        />
      </section>

      <section className={PANEL}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-black uppercase tracking-wide text-[#134e4a]">Trial balance</h3>
          <div className="flex flex-wrap items-center gap-2">
            {trialBalance?.totals ? (
              <p className="text-xs font-bold text-slate-500">
                Debits {formatNgn(trialBalance.totals.debitNgn)} · Credits {formatNgn(trialBalance.totals.creditNgn)}
              </p>
            ) : null}
            {!loading && trialBalance?.ok ? (
              <button
                type="button"
                onClick={exportTrialBalanceCsv}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3 w-3" aria-hidden />
                CSV
              </button>
            ) : null}
          </div>
        </div>
        {!loading && trialBalance?.ok ? (
          <>
            <AppTableWrap>
              <AppTable role="numeric">
                <AppTableThead>
                  <AppTableTh>Account</AppTableTh>
                  <AppTableTh align="right">Debit</AppTableTh>
                  <AppTableTh align="right">Credit</AppTableTh>
                  <AppTableTh align="right">Net</AppTableTh>
                </AppTableThead>
                <AppTableBody>
                  {tbPage.slice.map((r) => {
                    const acct = `${r.accountCode} — ${r.accountName}`;
                    return (
                      <AppTableTr key={r.accountCode}>
                        <AppTableTd monospace title={acct}>
                          {acct}
                        </AppTableTd>
                        <AppTableTd align="right" monospace title={String(r.debitNgn)}>
                          {formatNgn(r.debitNgn)}
                        </AppTableTd>
                        <AppTableTd align="right" monospace title={String(r.creditNgn)}>
                          {formatNgn(r.creditNgn)}
                        </AppTableTd>
                        <AppTableTd align="right" monospace title={String(r.netNgn)}>
                          {formatNgn(r.netNgn)}
                        </AppTableTd>
                      </AppTableTr>
                    );
                  })}
                </AppTableBody>
              </AppTable>
            </AppTableWrap>
            <AppTablePager
              showingFrom={tbPage.showingFrom}
              showingTo={tbPage.showingTo}
              total={tbPage.total}
              hasPrev={tbPage.hasPrev}
              hasNext={tbPage.hasNext}
              onPrev={tbPage.goPrev}
              onNext={tbPage.goNext}
            />
          </>
        ) : null}
      </section>

      <section className={PANEL}>
        <h3 className="text-sm font-black uppercase tracking-wide text-[#134e4a] mb-3">Journals</h3>
        {!loading && journals.length === 0 ? (
          <p className="text-sm text-slate-500 font-medium">No journals in this date range.</p>
        ) : null}
        <div className="space-y-1">
          {journalsPage.slice.map((j) => {
            const linesAll = linesByJournal[j.journalId] || [];
            const linesShown = linesAll.slice(0, APP_DATA_TABLE_PAGE_SIZE);
            const linesExtra = linesAll.length - linesShown.length;
            return (
              <div key={j.journalId} className="rounded-xl border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => void toggleJournal(j.journalId)}
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                >
                  {expandedId === j.journalId ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                  )}
                  <span className="shrink-0 font-mono text-[13px] text-slate-500 whitespace-nowrap">
                    {j.entryDateISO}
                  </span>
                  <span className="min-w-0 flex-1 font-semibold text-slate-800 truncate" title={j.memo || '—'}>
                    {j.memo || '—'}
                  </span>
                  <span className="shrink-0 text-[13px] font-mono tabular-nums text-slate-500 whitespace-nowrap">
                    Dr {formatNgn(j.totalDebitNgn)} / Cr {formatNgn(j.totalCreditNgn)}
                  </span>
                </button>
                {expandedId === j.journalId ? (
                  <div className="border-t border-slate-100 bg-slate-50/80 px-3 py-2">
                    {linesLoading === j.journalId ? (
                      <p className="text-sm text-slate-500">Loading lines…</p>
                    ) : (
                      <AppTableWrap className="shadow-none">
                        <AppTable role="numeric" className="text-[13px]">
                          <AppTableThead>
                            <AppTableTh>Code</AppTableTh>
                            <AppTableTh>Account</AppTableTh>
                            <AppTableTh align="right">Debit</AppTableTh>
                            <AppTableTh align="right">Credit</AppTableTh>
                            <AppTableTh>Memo</AppTableTh>
                          </AppTableThead>
                          <AppTableBody>
                            {linesShown.map((l) => {
                              const memo = l.lineMemo || '';
                              const rowTitle = `${l.accountCode} ${l.accountName} · ${memo}`;
                              return (
                                <AppTableTr key={l.lineId} title={rowTitle}>
                                  <AppTableTd monospace title={l.accountCode}>
                                    {l.accountCode}
                                  </AppTableTd>
                                  <AppTableTd title={l.accountName}>{l.accountName}</AppTableTd>
                                  <AppTableTd align="right" monospace>
                                    {formatNgn(l.debitNgn)}
                                  </AppTableTd>
                                  <AppTableTd align="right" monospace>
                                    {formatNgn(l.creditNgn)}
                                  </AppTableTd>
                                  <AppTableTd className="text-slate-600" title={memo}>
                                    {memo || '—'}
                                  </AppTableTd>
                                </AppTableTr>
                              );
                            })}
                          </AppTableBody>
                        </AppTable>
                      </AppTableWrap>
                    )}
                    {linesExtra > 0 ? (
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        Showing first {APP_DATA_TABLE_PAGE_SIZE} lines ({linesExtra} more in this journal).
                      </p>
                    ) : null}
                    {j.sourceKind ? (
                      <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                        Source: {j.sourceKind} {j.sourceId ? `· ${j.sourceId}` : ''}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <AppTablePager
          showingFrom={journalsPage.showingFrom}
          showingTo={journalsPage.showingTo}
          total={journalsPage.total}
          hasPrev={journalsPage.hasPrev}
          hasNext={journalsPage.hasNext}
          onPrev={journalsPage.goPrev}
          onNext={journalsPage.goNext}
        />
      </section>

      {canPost ? (
        <section className={PANEL}>
          <button
            type="button"
            onClick={() => setJournalOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-wide text-[#134e4a]">
              <BookOpen className="h-4 w-4" aria-hidden />
              Manual journal
            </span>
            {journalOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
          {journalOpen ? (
            <form onSubmit={submitJournal} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs font-bold text-slate-600">
                  Entry date
                  <input
                    type="date"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={journalDate}
                    onChange={(e) => setJournalDate(e.target.value)}
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Memo
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={journalMemo}
                    onChange={(e) => setJournalMemo(e.target.value)}
                    placeholder="Description"
                  />
                </label>
              </div>
              <p className="text-xs text-slate-500 font-medium">Each line: account code, debit XOR credit (NGN). Debits must equal credits.</p>
              {journalLines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <label className="col-span-12 sm:col-span-3 text-[10px] font-bold text-slate-500">
                    Account
                    <select
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={line.accountCode}
                      onChange={(e) => {
                        const v = e.target.value;
                        setJournalLines((ls) => ls.map((x, j) => (j === i ? { ...x, accountCode: v } : x)));
                      }}
                    >
                      <option value="">—</option>
                      {accounts.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-6 sm:col-span-2 text-[10px] font-bold text-slate-500">
                    Debit
                    <input
                      type="number"
                      min={0}
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-mono"
                      value={line.debitNgn}
                      onChange={(e) => {
                        const v = e.target.value;
                        setJournalLines((ls) =>
                          ls.map((x, j) => (j === i ? { ...x, debitNgn: v, creditNgn: v ? '' : x.creditNgn } : x))
                        );
                      }}
                    />
                  </label>
                  <label className="col-span-6 sm:col-span-2 text-[10px] font-bold text-slate-500">
                    Credit
                    <input
                      type="number"
                      min={0}
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-mono"
                      value={line.creditNgn}
                      onChange={(e) => {
                        const v = e.target.value;
                        setJournalLines((ls) =>
                          ls.map((x, j) => (j === i ? { ...x, creditNgn: v, debitNgn: v ? '' : x.debitNgn } : x))
                        );
                      }}
                    />
                  </label>
                  <label className="col-span-12 sm:col-span-4 text-[10px] font-bold text-slate-500">
                    Line memo
                    <input
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={line.memo}
                      onChange={(e) => {
                        const v = e.target.value;
                        setJournalLines((ls) => ls.map((x, j) => (j === i ? { ...x, memo: v } : x)));
                      }}
                    />
                  </label>
                  <div className="col-span-12 sm:col-span-1 flex justify-end pb-1">
                    <button
                      type="button"
                      onClick={() => removeJournalLine(i)}
                      className="text-xs font-bold text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addJournalLine}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
                >
                  + Line
                </button>
                <button
                  type="submit"
                  disabled={journalSaving}
                  className="rounded-xl bg-[#134e4a] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {journalSaving ? 'Posting…' : 'Post journal'}
                </button>
              </div>
              {journalMsg ? <p className="text-sm font-medium text-teal-800">{journalMsg}</p> : null}
            </form>
          ) : null}
        </section>
      ) : (
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Manual posting requires finance.post permission.
        </p>
      )}
    </div>
  );
}
