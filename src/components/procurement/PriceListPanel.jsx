import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Download, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch, apiUrl } from '../../lib/apiBase';
import { formatNgn } from '../../Data/mockData';
import { APP_DATA_TABLE_PAGE_SIZE, useAppTablePaging } from '../../lib/appDataTable';
import { AppTablePager } from '../ui/AppDataTable';

const emptyForm = {
  gaugeKey: '',
  designKey: '',
  unitPricePerMeterNgn: '',
  sortOrder: '0',
  notes: '',
  branchId: '',
  effectiveFromIso: '',
  materialTypeKey: '',
  colourKey: '',
  profileKey: '',
};

function isValidYyyyMmDd(s) {
  const t = String(s || '').trim();
  if (!t) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(`${t}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}

/**
 * Price list CRUD (₦/m by gauge + design). Used on /price-list and embedded under Procurement → Conversion.
 * @param {{ embedded?: boolean }} props
 */
export function PriceListPanel({ embedded = false }) {
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(true);
  const [form, setForm] = useState(emptyForm);

  const canManage = ws?.hasPermission?.('pricing.manage');
  const canView = ws?.hasPermission?.('pricing.manage') || ws?.hasPermission?.('md.price_exception.approve');

  const masterData = ws?.snapshot?.masterData;
  const gaugeOptions = useMemo(() => masterData?.gauges || [], [masterData?.gauges]);
  const colourOptions = useMemo(() => masterData?.colours || [], [masterData?.colours]);
  const profileOptions = useMemo(() => masterData?.profiles || [], [masterData?.profiles]);
  const materialTypeOptions = useMemo(() => masterData?.materialTypes || [], [masterData?.materialTypes]);

  const dlGauge = useId();
  const dlDesign = useId();
  const dlMat = useId();
  const dlColour = useId();
  const dlProfile = useId();

  const load = useCallback(async () => {
    setBusy(true);
    const { ok, data } = await apiFetch('/api/pricing/price-list');
    setBusy(false);
    if (ok && data?.ok) setItems(data.items || []);
    else setItems([]);
  }, []);

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView, load]);

  const pricePage = useAppTablePaging(items, APP_DATA_TABLE_PAGE_SIZE, items.length);

  if (!canView) {
    return (
      <p className={embedded ? 'text-[10px] text-slate-500' : 'text-sm text-slate-600'}>
        Price list is available to pricing managers and MD price-exception approvers.
      </p>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    const unitPricePerMeterNgn = Math.round(Number(form.unitPricePerMeterNgn) || 0);
    if (!form.gaugeKey.trim() || !form.designKey.trim() || unitPricePerMeterNgn <= 0) {
      showToast('Gauge, design, and a positive price per metre are required.', { variant: 'error' });
      return;
    }
    if (!isValidYyyyMmDd(form.effectiveFromIso)) {
      showToast('Effective date must be empty (defaults to today) or a valid YYYY-MM-DD.', { variant: 'error' });
      return;
    }
    if (form.gaugeKey.trim().length > 120 || form.designKey.trim().length > 120) {
      showToast('Gauge and design are too long (max 120 characters).', { variant: 'error' });
      return;
    }
    setBusy(true);
    const { ok, data } = await apiFetch('/api/pricing/price-list', {
      method: 'POST',
      body: JSON.stringify({
        gaugeKey: form.gaugeKey.trim(),
        designKey: form.designKey.trim(),
        unitPricePerMeterNgn,
        sortOrder: Math.round(Number(form.sortOrder) || 0),
        notes: form.notes.trim() || undefined,
        branchId: form.branchId.trim() || undefined,
        effectiveFromIso: form.effectiveFromIso.trim() || undefined,
        materialTypeKey: form.materialTypeKey.trim() || undefined,
        colourKey: form.colourKey.trim() || undefined,
        profileKey: form.profileKey.trim() || undefined,
      }),
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not save.', { variant: 'error' });
      return;
    }
    showToast('Price list row saved.');
    setForm(emptyForm);
    void load();
  };

  const del = async (id) => {
    if (!canManage || !window.confirm('Delete this price list row?')) return;
    setBusy(true);
    const { ok, data } = await apiFetch(`/api/pricing/price-list/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not delete.', { variant: 'error' });
      return;
    }
    showToast('Deleted.');
    void load();
  };

  const inp = embedded
    ? 'mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold'
    : 'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm';
  const labelCls = embedded ? 'text-[9px] font-bold text-slate-500 uppercase block' : 'text-xs font-bold text-slate-700';
  const formWrap = embedded
    ? 'space-y-3 rounded-xl border border-slate-200/80 bg-white/90 p-3'
    : 'mb-8 space-y-4 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm';
  const tableWrap = embedded
    ? 'z-scroll-x max-w-full overflow-x-auto rounded-xl border border-slate-200/80 bg-white/90 shadow-sm'
    : 'z-scroll-x max-w-full overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm';

  const exportCsv = async () => {
    try {
      const r = await fetch(apiUrl('/api/pricing/price-list/export.csv'), { credentials: 'include' });
      if (!r.ok) throw new Error('Could not download CSV.');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `price-list-items-${new Date().toISOString().slice(0, 10)}.csv`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Download started.');
    } catch (err) {
      showToast(String(err?.message || err), { variant: 'error' });
    }
  };

  return (
    <div className={embedded ? 'space-y-3' : 'space-y-0'}>
      <div className={`flex flex-wrap justify-end gap-2 ${embedded ? '' : 'mb-2'}`}>
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={busy}
          className={
            embedded
              ? 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[9px] font-bold uppercase text-[#134e4a] disabled:opacity-50'
              : 'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[11px] font-black uppercase text-[#134e4a] disabled:opacity-50'
          }
        >
          <Download size={embedded ? 12 : 14} />
          Export CSV
        </button>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className={
            embedded
              ? 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[9px] font-bold uppercase text-[#134e4a] disabled:opacity-50'
              : 'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[11px] font-black uppercase text-[#134e4a] disabled:opacity-50'
          }
        >
          <RefreshCw size={embedded ? 12 : 14} className={busy ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
      <p
        className={
          embedded
            ? 'text-[9px] text-slate-500 leading-snug mb-2'
            : 'text-[11px] text-slate-600 leading-relaxed mb-4 max-w-3xl'
        }
      >
        Each row must be unique on gauge, design, branch, effective date, and optional material / colour / profile keys.
        Leave <strong className="text-slate-700">Effective from</strong> blank to use today&apos;s date. Invalid dates and
        duplicates are rejected by the server.
      </p>

      {canManage ? (
        <form onSubmit={submit} className={formWrap}>
          <h2 className={embedded ? 'text-[9px] font-black uppercase text-[#134e4a]' : 'text-[11px] font-black uppercase text-[#134e4a]'}>
            Add or update row
          </h2>
          <div className={`grid gap-3 ${embedded ? 'sm:grid-cols-2' : 'gap-4 sm:grid-cols-2 lg:grid-cols-3'}`}>
            <label className={labelCls}>
              Gauge key
              <input
                className={inp}
                list={dlGauge}
                value={form.gaugeKey}
                onChange={(e) => setForm((f) => ({ ...f, gaugeKey: e.target.value }))}
                placeholder="e.g. 0.45mm"
                autoComplete="off"
              />
              <datalist id={dlGauge}>
                {gaugeOptions.map((g) => (
                  <option key={g.id} value={g.label} />
                ))}
              </datalist>
            </label>
            <label className={labelCls}>
              Design key
              <input
                className={inp}
                list={dlDesign}
                value={form.designKey}
                onChange={(e) => setForm((f) => ({ ...f, designKey: e.target.value }))}
                placeholder="e.g. profile or colour token"
                autoComplete="off"
              />
              <datalist id={dlDesign}>
                {profileOptions.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
                {colourOptions.map((c) => (
                  <option key={c.id} value={c.abbreviation || c.name} />
                ))}
              </datalist>
            </label>
            <label className={labelCls}>
              Min ₦ / metre
              <input
                type="number"
                min={1}
                className={inp}
                value={form.unitPricePerMeterNgn}
                onChange={(e) => setForm((f) => ({ ...f, unitPricePerMeterNgn: e.target.value }))}
              />
            </label>
            <label className={labelCls}>
              Sort order
              <input
                type="number"
                className={inp}
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
              />
            </label>
            <label className={labelCls}>
              Branch (optional)
              <input
                className={inp}
                value={form.branchId}
                onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                placeholder="Blank = all branches"
              />
            </label>
            <label className={labelCls}>
              Effective from (YYYY-MM-DD)
              <input
                className={inp}
                value={form.effectiveFromIso}
                onChange={(e) => setForm((f) => ({ ...f, effectiveFromIso: e.target.value }))}
                placeholder="Blank = today"
              />
            </label>
            <label className={labelCls}>
              Material key (optional)
              <input
                className={inp}
                list={dlMat}
                value={form.materialTypeKey}
                onChange={(e) => setForm((f) => ({ ...f, materialTypeKey: e.target.value }))}
                placeholder="e.g. stone coated type name"
                autoComplete="off"
              />
              <datalist id={dlMat}>
                {materialTypeOptions.map((m) => (
                  <option key={m.id} value={m.name} />
                ))}
              </datalist>
            </label>
            <label className={labelCls}>
              Colour key (optional)
              <input
                className={inp}
                list={dlColour}
                value={form.colourKey}
                onChange={(e) => setForm((f) => ({ ...f, colourKey: e.target.value }))}
                placeholder="Matches quotation colour name"
                autoComplete="off"
              />
              <datalist id={dlColour}>
                {colourOptions.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </label>
            <label className={labelCls}>
              Profile key (optional)
              <input
                className={inp}
                list={dlProfile}
                value={form.profileKey}
                onChange={(e) => setForm((f) => ({ ...f, profileKey: e.target.value }))}
                placeholder="Design / profile name"
                autoComplete="off"
              />
              <datalist id={dlProfile}>
                {profileOptions.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </label>
          </div>
          <label className={`block ${embedded ? labelCls : 'text-xs font-bold text-slate-700'}`}>
            Notes
            <input className={inp} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </label>
          <button
            type="submit"
            disabled={busy}
            className={
              embedded
                ? 'inline-flex items-center gap-1.5 rounded-lg bg-[#134e4a] px-3 py-2 text-[10px] font-black uppercase text-white disabled:opacity-50'
                : 'inline-flex items-center gap-2 rounded-xl bg-[#134e4a] px-4 py-2.5 text-[11px] font-black uppercase text-white disabled:opacity-50'
            }
          >
            <Plus size={embedded ? 14 : 16} />
            Save row
          </button>
        </form>
      ) : (
        <p className={embedded ? 'text-[10px] text-slate-600' : 'mb-6 text-sm text-slate-600'}>
          You can view the list; only pricing managers can edit.
        </p>
      )}

      <div className={tableWrap}>
        <table className={`min-w-full border-collapse text-left ${embedded ? 'text-sm' : 'text-sm'}`}>
          <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-600">
            <tr>
              <th className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'}`}>Gauge</th>
              <th className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'}`}>Design</th>
              <th className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'}`}>Mat.</th>
              <th className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'}`}>Colour</th>
              <th className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'}`}>Profile</th>
              <th className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'} text-right`}>₦ / m</th>
              <th className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'}`}>Branch</th>
              <th className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'}`}>Effective</th>
              <th className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className={`${embedded ? 'px-2 py-4' : 'px-4 py-8'} text-center text-slate-500`}>
                  {busy ? 'Loading…' : 'No price list rows yet.'}
                </td>
              </tr>
            ) : (
              pricePage.slice.map((it) => (
                <tr key={it.id} className="border-t border-slate-100 hover:bg-teal-50/30">
                  <td
                    className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'} font-semibold text-slate-900 whitespace-nowrap truncate max-w-0`}
                    title={it.gaugeKey}
                  >
                    {it.gaugeKey}
                  </td>
                  <td
                    className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'} whitespace-nowrap truncate max-w-0`}
                    title={it.designKey}
                  >
                    {it.designKey}
                  </td>
                  <td
                    className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'} text-slate-600 whitespace-nowrap truncate max-w-0`}
                    title={it.materialTypeKey || ''}
                  >
                    {it.materialTypeKey || '—'}
                  </td>
                  <td
                    className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'} text-slate-600 whitespace-nowrap truncate max-w-0`}
                    title={it.colourKey || ''}
                  >
                    {it.colourKey || '—'}
                  </td>
                  <td
                    className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'} text-slate-600 whitespace-nowrap truncate max-w-0`}
                    title={it.profileKey || ''}
                  >
                    {it.profileKey || '—'}
                  </td>
                  <td
                    className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'} text-right font-mono tabular-nums whitespace-nowrap`}
                  >
                    ₦{formatNgn(it.unitPricePerMeterNgn)}
                  </td>
                  <td
                    className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'} text-slate-600 whitespace-nowrap truncate max-w-0`}
                  >
                    {it.branchId || 'All'}
                  </td>
                  <td
                    className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'} text-slate-600 whitespace-nowrap truncate max-w-0`}
                    title={it.effectiveFromIso || ''}
                  >
                    {it.effectiveFromIso || '—'}
                  </td>
                  <td className={`${embedded ? 'px-2 py-2.5' : 'px-3 py-2.5'} text-right whitespace-nowrap`}>
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => del(it.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-bold text-rose-700"
                      >
                        <Trash2 size={11} />
                        Delete
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {items.length > 0 ? (
        <AppTablePager
          showingFrom={pricePage.showingFrom}
          showingTo={pricePage.showingTo}
          total={pricePage.total}
          hasPrev={pricePage.hasPrev}
          hasNext={pricePage.hasNext}
          onPrev={pricePage.goPrev}
          onNext={pricePage.goNext}
        />
      ) : null}
    </div>
  );
}
