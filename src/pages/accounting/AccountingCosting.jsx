import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, SlidersHorizontal } from 'lucide-react';
import { ModalFrame } from '../../components/layout/ModalFrame';
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

export default function AccountingCosting() {
  const ws = useWorkspace();
  const [rows, setRows] = useState([]);
  const [scope, setScope] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState({
    standardMaterialCostNgnPerKg: '',
    standardOverheadNgnPerM: '',
    effectiveFromIso: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { ok, data } = await apiFetch('/api/accounting/costing-snapshot');
    if (!ok || !data?.ok) {
      setError(data?.error || 'Could not load costing snapshot.');
      setRows([]);
    } else {
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setScope(String(data.branchScope ?? ''));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, ws?.refreshEpoch]);

  const withStd = useMemo(() => rows.filter((r) => r.standardMaterialCostNgnPerKg != null), [rows]);
  const withVariance = useMemo(() => rows.filter((r) => r.varianceMaterialPct != null), [rows]);
  const costingPage = useAppTablePaging(rows, APP_DATA_TABLE_PAGE_SIZE, ws?.refreshEpoch);

  const openEdit = (r) => {
    setEditRow(r);
    setForm({
      standardMaterialCostNgnPerKg:
        r.standardMaterialCostNgnPerKg != null ? String(r.standardMaterialCostNgnPerKg) : '',
      standardOverheadNgnPerM: r.standardOverheadNgnPerM != null ? String(r.standardOverheadNgnPerM) : '',
      effectiveFromIso: r.effectiveFromIso || new Date().toISOString().slice(0, 10),
      notes: '',
    });
  };

  const exportCsv = () => {
    const headers = [
      'productId',
      'productName',
      'unit',
      'branchScope',
      'standardMaterialCostNgnPerKg',
      'standardOverheadNgnPerM',
      'effectiveFromIso',
      'actualAvgUnitCostNgnPerKg',
      'varianceMaterialPct',
      'coilLotCount',
      'coilLotsWithUnitCost',
      'consumedKgLast90d',
      'productionJobsLast90d',
    ];
    const body = rows.map((r) => [
      r.productId,
      r.productName,
      r.unit,
      scope,
      r.standardMaterialCostNgnPerKg ?? '',
      r.standardOverheadNgnPerM ?? '',
      r.effectiveFromIso,
      r.actualAvgUnitCostNgnPerKg ?? '',
      r.varianceMaterialPct ?? '',
      r.coilLotCount,
      r.coilLotsWithUnitCost,
      r.consumedKgLast90d,
      r.productionJobsLast90d,
    ]);
    downloadCsv(`costing-snapshot-${scope}-${new Date().toISOString().slice(0, 10)}.csv`, headers, body);
  };

  const submitStandard = async (e) => {
    e.preventDefault();
    if (!editRow) return;
    setSaving(true);
    setError('');
    const body = {
      standardMaterialCostNgnPerKg: form.standardMaterialCostNgnPerKg === '' ? null : Number(form.standardMaterialCostNgnPerKg),
      standardOverheadNgnPerM: form.standardOverheadNgnPerM === '' ? null : Number(form.standardOverheadNgnPerM),
      effectiveFromIso: form.effectiveFromIso,
      notes: form.notes.trim(),
    };
    const { ok, data } = await apiFetch(`/api/accounting/standard-costs/${encodeURIComponent(editRow.productId)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!ok || !data?.ok) {
      setError(data?.error || 'Could not save standard cost.');
      return;
    }
    setEditRow(null);
    void load();
  };

  return (
    <div className="space-y-5">
      <section className={PANEL}>
        <h2 className="text-lg font-black text-[#134e4a] tracking-tight mb-2">Product costing</h2>
        <p className="text-sm text-slate-600 font-medium leading-relaxed mb-4 max-w-3xl">
          Central <strong className="font-semibold text-slate-800">standard costs</strong> per SKU versus{' '}
          <strong className="font-semibold text-slate-800">actual GRN unit costs</strong> from coil receipts (average
          ₦/kg where landed). Production consumption (last 90 days) shows material throughput by product. Branch scope
          matches your workspace: <span className="font-mono text-xs">{scope || '—'}</span>.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap gap-4 text-xs font-bold text-slate-500">
            <span>
              Products: <span className="text-[#134e4a]">{rows.length}</span>
            </span>
            <span>
              With standard ₦/kg: <span className="text-[#134e4a]">{withStd.length}</span>
            </span>
            <span>
              With variance vs GRN: <span className="text-[#134e4a]">{withVariance.length}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export CSV
          </button>
        </div>

        {error ? (
          <p className="text-sm font-semibold text-red-600 mb-3" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-500 font-medium">Loading…</p>
        ) : (
          <>
            <AppTableWrap>
              <AppTable role="numeric">
                <AppTableThead>
                  <AppTableTh>Product</AppTableTh>
                  <AppTableTh>Unit</AppTableTh>
                  <AppTableTh align="right">Std ₦/kg</AppTableTh>
                  <AppTableTh align="right">Std OH ₦/m</AppTableTh>
                  <AppTableTh align="right">GRN avg ₦/kg</AppTableTh>
                  <AppTableTh align="right">Variance</AppTableTh>
                  <AppTableTh align="right">Coil lots</AppTableTh>
                  <AppTableTh align="right">Kg (90d)</AppTableTh>
                  <AppTableTh> </AppTableTh>
                </AppTableThead>
                <AppTableBody>
                  {costingPage.slice.map((r) => {
                    const v = r.varianceMaterialPct;
                    const vClass =
                      v == null
                        ? 'text-slate-400'
                        : v > 5
                          ? 'text-amber-700 font-bold'
                          : v < -5
                            ? 'text-teal-700 font-bold'
                            : 'text-slate-700';
                    const prod = `${r.productName} (${r.productId})`;
                    return (
                      <AppTableTr key={r.productId}>
                        <AppTableTd title={prod}>
                          <span className="font-semibold">{prod}</span>
                        </AppTableTd>
                        <AppTableTd title={r.unit || ''}>{r.unit || '—'}</AppTableTd>
                        <AppTableTd align="right" monospace>
                          {formatNgn(r.standardMaterialCostNgnPerKg)}
                        </AppTableTd>
                        <AppTableTd align="right" monospace>
                          {formatNgn(r.standardOverheadNgnPerM)}
                        </AppTableTd>
                        <AppTableTd align="right" monospace>
                          {formatNgn(r.actualAvgUnitCostNgnPerKg)}
                        </AppTableTd>
                        <AppTableTd align="right" monospace className={vClass}>
                          {v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`}
                        </AppTableTd>
                        <AppTableTd align="right" monospace title={`${r.coilLotsWithUnitCost}/${r.coilLotCount}`}>
                          {r.coilLotsWithUnitCost}/{r.coilLotCount}
                        </AppTableTd>
                        <AppTableTd align="right" monospace>
                          {r.consumedKgLast90d ? Math.round(r.consumedKgLast90d).toLocaleString('en-NG') : '—'}
                        </AppTableTd>
                        <AppTableTd truncate={false}>
                          <button
                            type="button"
                            onClick={() => openEdit(r)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                            Standard
                          </button>
                        </AppTableTd>
                      </AppTableTr>
                    );
                  })}
                </AppTableBody>
              </AppTable>
            </AppTableWrap>
            <AppTablePager
              showingFrom={costingPage.showingFrom}
              showingTo={costingPage.showingTo}
              total={costingPage.total}
              hasPrev={costingPage.hasPrev}
              hasNext={costingPage.hasNext}
              onPrev={costingPage.goPrev}
              onNext={costingPage.goNext}
            />
          </>
        )}
      </section>

      <ModalFrame isOpen={Boolean(editRow)} onClose={() => setEditRow(null)} title="Standard cost">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          {editRow ? (
            <>
              <h3 className="text-base font-black text-[#134e4a] mb-1">{editRow.productName}</h3>
              <p className="text-xs font-mono text-slate-500 mb-4">{editRow.productId}</p>
              <form onSubmit={submitStandard} className="space-y-3">
                <label className="block text-xs font-bold text-slate-600">
                  Standard material (₦/kg) — optional
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                    value={form.standardMaterialCostNgnPerKg}
                    onChange={(e) => setForm((f) => ({ ...f, standardMaterialCostNgnPerKg: e.target.value }))}
                    placeholder="Leave empty to clear"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-600">
                  Standard overhead (₦/m produced) — optional
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                    value={form.standardOverheadNgnPerM}
                    onChange={(e) => setForm((f) => ({ ...f, standardOverheadNgnPerM: e.target.value }))}
                    placeholder="Labour / OH proxy"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-600">
                  Effective from
                  <input
                    type="date"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                    value={form.effectiveFromIso}
                    onChange={(e) => setForm((f) => ({ ...f, effectiveFromIso: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-bold text-slate-600">
                  Notes
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </label>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditRow(null)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-[#134e4a] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save standard'}
                  </button>
                </div>
              </form>
            </>
          ) : null}
        </div>
      </ModalFrame>
    </div>
  );
}
