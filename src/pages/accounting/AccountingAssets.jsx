import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Plus, Pencil, Ban } from 'lucide-react';
import { ModalFrame } from '../../components/layout/ModalFrame';
import { EditSecondApprovalInline } from '../../components/EditSecondApprovalInline';
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

const CATEGORIES = [
  { value: 'plant', label: 'Plant & machinery' },
  { value: 'vehicle', label: 'Vehicles' },
  { value: 'it', label: 'IT equipment' },
  { value: 'building', label: 'Buildings' },
  { value: 'land', label: 'Land' },
  { value: 'other', label: 'Other' },
];

function formatNgn(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₦${Math.round(Number(n)).toLocaleString('en-NG')}`;
}

const emptyForm = () => ({
  name: '',
  category: 'other',
  branchId: '',
  acquisitionDateIso: new Date().toISOString().slice(0, 10),
  costNgn: '',
  salvageNgn: '0',
  usefulLifeMonths: '60',
  treasuryReference: '',
  notes: '',
});

export default function AccountingAssets() {
  const ws = useWorkspace();
  const branches = useMemo(
    () => ws?.snapshot?.workspaceBranches ?? ws?.session?.branches ?? [],
    [ws?.snapshot?.workspaceBranches, ws?.session?.branches]
  );

  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [fixedAssetEditApprovalId, setFixedAssetEditApprovalId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [disposeId, setDisposeId] = useState(null);
  const [disposeDate, setDisposeDate] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { ok, data } = await apiFetch('/api/accounting/fixed-assets');
    if (!ok || !data?.ok) {
      setError(data?.error || 'Could not load fixed assets.');
      setAssets([]);
    } else {
      setAssets(Array.isArray(data.assets) ? data.assets : []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, ws?.refreshEpoch]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyForm(),
      branchId: branches[0]?.id || '',
    });
    setModalOpen(true);
  };

  const openEdit = (a) => {
    setEditingId(a.id);
    setFixedAssetEditApprovalId('');
    setForm({
      name: a.name,
      category: a.category,
      branchId: a.branchId,
      acquisitionDateIso: a.acquisitionDateIso,
      costNgn: String(a.costNgn),
      salvageNgn: String(a.salvageNgn),
      usefulLifeMonths: String(a.usefulLifeMonths),
      treasuryReference: a.treasuryReference || '',
      notes: a.notes || '',
    });
    setModalOpen(true);
  };

  const submitForm = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      name: form.name.trim(),
      category: form.category,
      branchId: form.branchId,
      acquisitionDateIso: form.acquisitionDateIso,
      costNgn: Number(form.costNgn) || 0,
      salvageNgn: Number(form.salvageNgn) || 0,
      usefulLifeMonths: Number(form.usefulLifeMonths) || 60,
      treasuryReference: form.treasuryReference.trim(),
      notes: form.notes.trim(),
    };
    const path = editingId ? `/api/accounting/fixed-assets/${encodeURIComponent(editingId)}` : '/api/accounting/fixed-assets';
    const method = editingId ? 'PATCH' : 'POST';
    const payload =
      method === 'PATCH' && String(fixedAssetEditApprovalId || '').trim()
        ? { ...body, editApprovalId: String(fixedAssetEditApprovalId).trim() }
        : body;
    const { ok, data } = await apiFetch(path, { method, body: JSON.stringify(payload) });
    setSaving(false);
    if (!ok || !data?.ok) {
      setError(data?.error || 'Save failed.');
      return;
    }
    setModalOpen(false);
    void load();
  };

  const submitDispose = async () => {
    if (!disposeId) return;
    setSaving(true);
    setError('');
    const { ok, data } = await apiFetch(`/api/accounting/fixed-assets/${encodeURIComponent(disposeId)}/dispose`, {
      method: 'POST',
      body: JSON.stringify({ disposalDateIso: disposeDate }),
    });
    setSaving(false);
    if (!ok || !data?.ok) {
      setError(data?.error || 'Dispose failed.');
      return;
    }
    setDisposeId(null);
    void load();
  };

  const branchLabel = (id) => branches.find((b) => b.id === id)?.name || id;
  const assetsPage = useAppTablePaging(assets, APP_DATA_TABLE_PAGE_SIZE, ws?.refreshEpoch);

  const exportCsv = () => {
    const headers = [
      'id',
      'name',
      'category',
      'branch',
      'acquisitionDateIso',
      'costNgn',
      'salvageNgn',
      'usefulLifeMonths',
      'status',
      'disposalDateIso',
      'monthlyDepreciationNgn',
      'accumulatedDepreciationNgn',
      'netBookValueNgn',
      'treasuryReference',
      'notes',
    ];
    const rows = assets.map((a) => [
      a.id,
      a.name,
      CATEGORIES.find((c) => c.value === a.category)?.label || a.category,
      branchLabel(a.branchId),
      a.acquisitionDateIso,
      a.costNgn,
      a.salvageNgn,
      a.usefulLifeMonths,
      a.status,
      a.disposalDateIso,
      a.monthlyDepreciationNgn,
      a.accumulatedDepreciationNgn,
      a.netBookValueNgn,
      a.treasuryReference,
      a.notes,
    ]);
    downloadCsv(`fixed-assets-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  return (
    <div className="space-y-5">
      <section className={PANEL}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-black text-[#134e4a] tracking-tight">Fixed assets register</h2>
            <p className="text-sm text-slate-600 font-medium leading-relaxed mt-1 max-w-3xl">
              HQ register with straight-line depreciation estimates. Optional treasury reference links payouts. Scoped to
              your branch workspace unless you use all-branches roll-up (API returns combined list for HQ).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={assets.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-40"
            >
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-[#134e4a] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#0f3d3a]"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add asset
            </button>
          </div>
        </div>

        {error ? (
          <p className="text-sm font-semibold text-red-600 mb-3" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-500 font-medium">Loading…</p>
        ) : assets.length === 0 ? (
          <p className="text-sm text-slate-500 font-medium">No assets yet. Add the first record for your branch.</p>
        ) : (
          <>
            <AppTableWrap>
              <AppTable role="numeric">
                <AppTableThead>
                  <AppTableTh>Name</AppTableTh>
                  <AppTableTh>Category</AppTableTh>
                  <AppTableTh>Branch</AppTableTh>
                  <AppTableTh>Acquired</AppTableTh>
                  <AppTableTh align="right">Cost</AppTableTh>
                  <AppTableTh align="right">Mo. dep.</AppTableTh>
                  <AppTableTh align="right">NBV</AppTableTh>
                  <AppTableTh>Treasury</AppTableTh>
                  <AppTableTh>Status</AppTableTh>
                  <AppTableTh> </AppTableTh>
                </AppTableThead>
                <AppTableBody>
                  {assetsPage.slice.map((a) => {
                    const cat = CATEGORIES.find((c) => c.value === a.category)?.label || a.category;
                    return (
                      <AppTableTr key={a.id}>
                        <AppTableTd title={a.name}>
                          <span className="font-semibold">{a.name}</span>
                        </AppTableTd>
                        <AppTableTd title={cat}>{cat}</AppTableTd>
                        <AppTableTd title={branchLabel(a.branchId)}>{branchLabel(a.branchId)}</AppTableTd>
                        <AppTableTd monospace title={a.acquisitionDateIso}>
                          {a.acquisitionDateIso}
                        </AppTableTd>
                        <AppTableTd align="right" monospace>
                          {formatNgn(a.costNgn)}
                        </AppTableTd>
                        <AppTableTd align="right" monospace>
                          {formatNgn(a.monthlyDepreciationNgn)}
                        </AppTableTd>
                        <AppTableTd align="right" monospace>
                          {formatNgn(a.netBookValueNgn)}
                        </AppTableTd>
                        <AppTableTd title={a.treasuryReference || ''}>
                          {a.treasuryReference ? (
                            <Link
                              to={`/accounts?treasuryRef=${encodeURIComponent(a.treasuryReference)}`}
                              className="font-semibold text-sky-700 hover:underline"
                            >
                              {a.treasuryReference}
                            </Link>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </AppTableTd>
                        <AppTableTd truncate={false}>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                              a.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {a.status}
                          </span>
                        </AppTableTd>
                        <AppTableTd truncate={false}>
                          {a.status === 'active' ? (
                            <span className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => openEdit(a)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDisposeId(a.id);
                                  setDisposeDate(new Date().toISOString().slice(0, 10));
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100"
                              >
                                <Ban className="h-3.5 w-3.5" aria-hidden />
                                Dispose
                              </button>
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">{a.disposalDateIso || '—'}</span>
                          )}
                        </AppTableTd>
                      </AppTableTr>
                    );
                  })}
                </AppTableBody>
              </AppTable>
            </AppTableWrap>
            <AppTablePager
              showingFrom={assetsPage.showingFrom}
              showingTo={assetsPage.showingTo}
              total={assetsPage.total}
              hasPrev={assetsPage.hasPrev}
              hasNext={assetsPage.hasNext}
              onPrev={assetsPage.goPrev}
              onNext={assetsPage.goNext}
            />
          </>
        )}
      </section>

      <ModalFrame isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit asset' : 'Add asset'}>
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          <h3 className="text-base font-black text-[#134e4a] mb-4">{editingId ? 'Edit fixed asset' : 'New fixed asset'}</h3>
          <form onSubmit={submitForm} className="space-y-3">
            <label className="block text-xs font-bold text-slate-600">
              Name
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Category
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Branch
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                value={form.branchId}
                onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                required
              >
                {branches.length === 0 ? <option value="">No branches</option> : null}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name || b.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-slate-600">
                Acquisition date
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                  value={form.acquisitionDateIso}
                  onChange={(e) => setForm((f) => ({ ...f, acquisitionDateIso: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-xs font-bold text-slate-600">
                Useful life (months)
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                  value={form.usefulLifeMonths}
                  onChange={(e) => setForm((f) => ({ ...f, usefulLifeMonths: e.target.value }))}
                  required
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-slate-600">
                Cost (NGN)
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                  value={form.costNgn}
                  onChange={(e) => setForm((f) => ({ ...f, costNgn: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-xs font-bold text-slate-600">
                Salvage (NGN)
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                  value={form.salvageNgn}
                  onChange={(e) => setForm((f) => ({ ...f, salvageNgn: e.target.value }))}
                />
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-600">
              Treasury reference (optional)
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                value={form.treasuryReference}
                onChange={(e) => setForm((f) => ({ ...f, treasuryReference: e.target.value }))}
                placeholder="Payment ref / batch id"
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Notes
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium min-h-[72px]"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
            {editingId ? (
              <EditSecondApprovalInline
                entityKind="fixed_asset"
                entityId={editingId}
                value={fixedAssetEditApprovalId}
                onChange={setFixedAssetEditApprovalId}
              />
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setFixedAssetEditApprovalId('');
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[#134e4a] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={Boolean(disposeId)} onClose={() => setDisposeId(null)} title="Dispose asset">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          <p className="text-sm text-slate-600 font-medium mb-4">Record disposal date. The asset will be marked disposed and excluded from active planning.</p>
          <label className="block text-xs font-bold text-slate-600 mb-4">
            Disposal date
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
              value={disposeDate}
              onChange={(e) => setDisposeDate(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDisposeId(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submitDispose()}
              className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Confirm dispose'}
            </button>
          </div>
        </div>
      </ModalFrame>
    </div>
  );
}
