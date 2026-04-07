import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import { downloadCsv } from '../../lib/csvDownload';
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

function formatNgn(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₦${Math.round(Number(n)).toLocaleString('en-NG')}`;
}

export default function AccountingStatements() {
  const ws = useWorkspace();
  const [periodKey, setPeriodKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [pack, setPack] = useState(null);
  const [reconPack, setReconPack] = useState(null);
  const [cashFlowPack, setCashFlowPack] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const q = `periodKey=${encodeURIComponent(periodKey.trim())}`;
    const [stmRes, reconRes, cfRes] = await Promise.all([
      apiFetch(`/api/accounting/statements-pack?${q}`),
      apiFetch(`/api/accounting/reconciliation-pack?${q}`),
      apiFetch(`/api/accounting/cash-flow?${q}`),
    ]);
    setLoading(false);
    if (!stmRes.ok || !stmRes.data?.ok) {
      setError(stmRes.data?.error || 'Could not load statement pack.');
      setPack(null);
      setReconPack(null);
      setCashFlowPack(null);
      return;
    }
    setPack(stmRes.data);
    setReconPack(reconRes.ok && reconRes.data?.ok ? reconRes.data : null);
    setCashFlowPack(cfRes.ok && cfRes.data?.ok ? cfRes.data : null);
  }, [periodKey]);

  useEffect(() => {
    void load();
  }, [load, ws?.refreshEpoch]);

  const exportPlCsv = () => {
    if (!pack?.profitAndLoss) return;
    const h = ['accountCode', 'accountName', 'accountType', 'amountNgn'];
    const body = (pack.profitAndLoss.lines || []).map((r) => [r.accountCode, r.accountName, r.accountType, r.amountNgn]);
    downloadCsv(`pl-${pack.periodKey}.csv`, h, body);
  };

  const exportBsCsv = () => {
    if (!pack?.balanceSheet) return;
    const h = ['accountCode', 'accountName', 'accountType', 'balanceNgn'];
    const body = (pack.balanceSheet.lines || []).map((r) => [r.accountCode, r.accountName, r.accountType, r.balanceNgn]);
    downloadCsv(`balance-sheet-${pack.periodKey}-cumulative.csv`, h, body);
  };

  const exportReconCsv = () => {
    if (!reconPack) return;
    const h = [
      'periodKey',
      'branchScope',
      'salesReceiptsPostedNgn',
      'ledgerReceiptLikeNgn',
      'treasuryCustomerInNgn',
      'gl1000DebitNgn',
      'gl1000CreditNgn',
      'gl1000NetNgn',
      'gl1200DebitNgn',
      'gl1200CreditNgn',
      'gl1200NetNgn',
    ];
    const g1 = reconPack.glCash1000Month;
    const g2 = reconPack.glAr1200Month;
    downloadCsv(`reconciliation-${reconPack.periodKey}.csv`, h, [
      [
        reconPack.periodKey,
        String(reconPack.branchScope),
        reconPack.salesReceiptsPostedNgn,
        reconPack.ledgerReceiptLikeNgn,
        reconPack.treasuryCustomerInNgn,
        g1?.debitNgn ?? '',
        g1?.creditNgn ?? '',
        g1?.netNgn ?? '',
        g2?.debitNgn ?? '',
        g2?.creditNgn ?? '',
        g2?.netNgn ?? '',
      ],
    ]);
  };

  const exportCashFlowCsv = () => {
    if (!cashFlowPack?.rows) return;
    const h = ['periodKey', 'treasuryType', 'totalNgn'];
    const body = cashFlowPack.rows.map((r) => [cashFlowPack.periodKey, r.type, r.totalNgn]);
    downloadCsv(`cash-flow-treasury-${cashFlowPack.periodKey}.csv`, h, body);
  };

  const pl = pack?.profitAndLoss;
  const bs = pack?.balanceSheet;
  const hint = pack?.reconciliationHints;

  const plLines = useMemo(() => pl?.lines || [], [pl?.lines]);
  const bsLines = useMemo(() => bs?.lines || [], [bs?.lines]);
  const cfRows = useMemo(() => cashFlowPack?.rows || [], [cashFlowPack?.rows]);

  const plPage = useAppTablePaging(plLines, APP_DATA_TABLE_PAGE_SIZE, periodKey);
  const bsPage = useAppTablePaging(bsLines, APP_DATA_TABLE_PAGE_SIZE, periodKey);
  const cfPage = useAppTablePaging(cfRows, APP_DATA_TABLE_PAGE_SIZE, periodKey);

  return (
    <div className="space-y-5">
      <section className={PANEL}>
        <h2 className="text-lg font-black text-[#134e4a] tracking-tight mb-2">Financial statements (management)</h2>
        <p className="text-sm text-slate-600 font-medium leading-relaxed mb-4 max-w-3xl">
          <strong className="font-semibold text-slate-800">P&amp;L</strong> uses GL activity in the selected month
          (revenue and expense accounts). <strong className="font-semibold text-slate-800">Balance sheet</strong> uses
          cumulative GL balances from 2000-01-01 through month-end (assets, liabilities, equity). Branch scope follows
          your workspace for the receipts hint only.
        </p>

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="text-xs font-bold text-slate-600">
            Period (YYYY-MM)
            <input
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono font-medium"
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
              pattern="\d{4}-\d{2}"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-[#134e4a] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            Refresh
          </button>
        </div>

        {pack?.range ? (
          <p className="text-xs font-bold text-slate-500 mb-2">
            Range {pack.range.start} → {pack.range.end} · scope {String(pack.branchScope)}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm font-semibold text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {pl ? (
        <section className={PANEL}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-black uppercase tracking-wide text-[#134e4a]">Profit &amp; loss</h3>
            <button
              type="button"
              onClick={exportPlCsv}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700"
            >
              <Download className="h-3 w-3" aria-hidden />
              CSV
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-slate-500">Revenue</p>
              <p className="font-black text-teal-800">{formatNgn(pl.revenueTotalNgn)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-slate-500">Expenses</p>
              <p className="font-black text-slate-800">{formatNgn(pl.expenseTotalNgn)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-slate-500">Net income</p>
              <p className={`font-black ${pl.netIncomeNgn >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                {formatNgn(pl.netIncomeNgn)}
              </p>
            </div>
          </div>
          {pl.lines?.length ? (
            <>
              <AppTableWrap>
                <AppTable role="numeric">
                  <AppTableThead>
                    <AppTableTh>Account</AppTableTh>
                    <AppTableTh>Type</AppTableTh>
                    <AppTableTh align="right">Amount</AppTableTh>
                  </AppTableThead>
                  <AppTableBody>
                    {plPage.slice.map((r) => {
                      const acct = `${r.accountCode} ${r.accountName}`;
                      return (
                        <AppTableTr key={r.accountCode}>
                          <AppTableTd monospace title={acct}>
                            {acct}
                          </AppTableTd>
                          <AppTableTd className="text-slate-600" title={r.accountType}>
                            {r.accountType}
                          </AppTableTd>
                          <AppTableTd align="right" monospace title={String(r.amountNgn)}>
                            {formatNgn(r.amountNgn)}
                          </AppTableTd>
                        </AppTableTr>
                      );
                    })}
                  </AppTableBody>
                </AppTable>
              </AppTableWrap>
              <AppTablePager
                showingFrom={plPage.showingFrom}
                showingTo={plPage.showingTo}
                total={plPage.total}
                hasPrev={plPage.hasPrev}
                hasNext={plPage.hasNext}
                onPrev={plPage.goPrev}
                onNext={plPage.goNext}
              />
            </>
          ) : (
            <p className="rounded-xl border border-slate-200 px-3 py-4 text-sm text-slate-500">
              No revenue or expense GL activity this month.
            </p>
          )}
        </section>
      ) : null}

      {bs ? (
        <section className={PANEL}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-black uppercase tracking-wide text-[#134e4a]">Balance sheet (cumulative)</h3>
            <button
              type="button"
              onClick={exportBsCsv}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700"
            >
              <Download className="h-3 w-3" aria-hidden />
              CSV
            </button>
          </div>
          <div
            className={`mb-3 rounded-lg px-3 py-2 text-xs font-bold ${bs.balanced ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}
          >
            Assets {formatNgn(bs.assetsNgn)} · Liabilities + equity {formatNgn(bs.totalLiabilitiesAndEquityNgn)}{' '}
            {bs.balanced ? '(balanced)' : '(off — review GL)'}
          </div>
          {bs.lines?.length ? (
            <>
              <AppTableWrap>
                <AppTable role="numeric">
                  <AppTableThead>
                    <AppTableTh>Account</AppTableTh>
                    <AppTableTh>Type</AppTableTh>
                    <AppTableTh align="right">Balance</AppTableTh>
                  </AppTableThead>
                  <AppTableBody>
                    {bsPage.slice.map((r) => {
                      const acct = `${r.accountCode} ${r.accountName}`;
                      return (
                        <AppTableTr key={r.accountCode}>
                          <AppTableTd monospace title={acct}>
                            {acct}
                          </AppTableTd>
                          <AppTableTd className="text-slate-600" title={r.accountType}>
                            {r.accountType}
                          </AppTableTd>
                          <AppTableTd align="right" monospace title={String(r.balanceNgn)}>
                            {formatNgn(r.balanceNgn)}
                          </AppTableTd>
                        </AppTableTr>
                      );
                    })}
                  </AppTableBody>
                </AppTable>
              </AppTableWrap>
              <AppTablePager
                showingFrom={bsPage.showingFrom}
                showingTo={bsPage.showingTo}
                total={bsPage.total}
                hasPrev={bsPage.hasPrev}
                hasNext={bsPage.hasNext}
                onPrev={bsPage.goPrev}
                onNext={bsPage.goNext}
              />
            </>
          ) : (
            <p className="rounded-xl border border-slate-200 px-3 py-4 text-sm text-slate-500">
              No balance sheet accounts with balances.
            </p>
          )}
        </section>
      ) : null}

      {hint ? (
        <section className={PANEL}>
          <h3 className="text-sm font-black uppercase tracking-wide text-[#134e4a] mb-2">Reconciliation hint</h3>
          <p className="text-sm text-slate-600 font-medium">
            Sales receipts in period (sub-ledger): <span className="font-mono font-bold">{formatNgn(hint.salesReceiptsInPeriodNgn)}</span>
          </p>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">{hint.note}</p>
        </section>
      ) : null}

      {reconPack ? (
        <section className={PANEL}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-black uppercase tracking-wide text-[#134e4a]">Receipts &amp; cash reconciliation (MVP)</h3>
            <button
              type="button"
              onClick={exportReconCsv}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700"
            >
              <Download className="h-3 w-3" aria-hidden />
              CSV
            </button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm mb-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-slate-500">Sales receipts (posted)</p>
              <p className="font-black text-slate-900 font-mono text-xs">{formatNgn(reconPack.salesReceiptsPostedNgn)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-slate-500">Ledger receipt-like</p>
              <p className="font-black text-slate-900 font-mono text-xs">{formatNgn(reconPack.ledgerReceiptLikeNgn)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-slate-500">Treasury customer inflows</p>
              <p className="font-black text-slate-900 font-mono text-xs">{formatNgn(reconPack.treasuryCustomerInNgn)}</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-xs mb-2">
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="font-bold text-slate-700 mb-1">GL 1000 (month activity)</p>
              {reconPack.glCash1000Month ? (
                <p className="text-slate-600 font-mono">
                  Dr {formatNgn(reconPack.glCash1000Month.debitNgn)} · Cr {formatNgn(reconPack.glCash1000Month.creditNgn)} · net{' '}
                  {formatNgn(reconPack.glCash1000Month.netNgn)}
                </p>
              ) : (
                <p className="text-slate-500">No GL lines this month.</p>
              )}
            </div>
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="font-bold text-slate-700 mb-1">GL 1200 (month activity)</p>
              {reconPack.glAr1200Month ? (
                <p className="text-slate-600 font-mono">
                  Dr {formatNgn(reconPack.glAr1200Month.debitNgn)} · Cr {formatNgn(reconPack.glAr1200Month.creditNgn)} · net{' '}
                  {formatNgn(reconPack.glAr1200Month.netNgn)}
                </p>
              ) : (
                <p className="text-slate-500">No GL lines this month.</p>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">{reconPack.note}</p>
        </section>
      ) : null}

      {cashFlowPack ? (
        <section className={PANEL}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-black uppercase tracking-wide text-[#134e4a]">Cash flow — treasury by type</h3>
            <button
              type="button"
              onClick={exportCashFlowCsv}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700"
            >
              <Download className="h-3 w-3" aria-hidden />
              CSV
            </button>
          </div>
          <p className="text-xs text-slate-600 mb-2">
            Net movement (sum of types): <span className="font-mono font-bold">{formatNgn(cashFlowPack.netTreasuryMovementNgn)}</span>
          </p>
          {cashFlowPack.rows?.length ? (
            <>
              <AppTableWrap className="max-h-64 overflow-y-auto">
                <AppTable role="numeric">
                  <AppTableThead sticky>
                    <AppTableTh>Treasury type</AppTableTh>
                    <AppTableTh align="right">Total</AppTableTh>
                  </AppTableThead>
                  <AppTableBody>
                    {cfPage.slice.map((r) => (
                      <AppTableTr key={r.type}>
                        <AppTableTd monospace title={r.type}>
                          {r.type}
                        </AppTableTd>
                        <AppTableTd align="right" monospace title={String(r.totalNgn)}>
                          {formatNgn(r.totalNgn)}
                        </AppTableTd>
                      </AppTableTr>
                    ))}
                  </AppTableBody>
                </AppTable>
              </AppTableWrap>
              <AppTablePager
                showingFrom={cfPage.showingFrom}
                showingTo={cfPage.showingTo}
                total={cfPage.total}
                hasPrev={cfPage.hasPrev}
                hasNext={cfPage.hasNext}
                onPrev={cfPage.goPrev}
                onNext={cfPage.goNext}
              />
            </>
          ) : (
            <p className="rounded-xl border border-slate-200 px-3 py-4 text-sm text-slate-500">
              No treasury movements in this month.
            </p>
          )}
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">{cashFlowPack.note}</p>
        </section>
      ) : null}
    </div>
  );
}
