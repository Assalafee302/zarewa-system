import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { ModalFrame } from '../layout';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/apiBase';
import { formatNgn } from '../../Data/mockData';

const MATERIAL_OPTIONS = [
  { key: 'alu', label: 'Aluminium' },
  { key: 'aluzinc', label: 'Aluzinc (PPGI)' },
];

function numOrUndef(v) {
  const t = String(v ?? '').trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function costPerM(used, costKg) {
  const u = Number(used);
  const c = Number(costKg);
  if (!Number.isFinite(u) || u <= 0 || !Number.isFinite(c) || c < 0) return null;
  return u * c;
}

function avgThree(std, ref, hist) {
  const vals = [std, ref, hist].filter((x) => x != null && Number.isFinite(Number(x)) && Number(x) > 0).map(Number);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function suggested(used, costKg, oh, pr) {
  const u = Number(used);
  const ck = Number(costKg);
  const o = Number(oh) || 0;
  const p = Number(pr) || 0;
  if (!Number.isFinite(u) || u <= 0 || !Number.isFinite(ck) || ck < 0) return null;
  return Math.round(u * ck + o + p);
}

/**
 * Coil material pricing workbook: conversions, suggested ₦/m, minimum floor, change log.
 * @param {{ open: boolean; onClose: () => void; initialMaterialKey?: string }} props
 */
export function MaterialPricingWorkbookModal({ open, onClose, initialMaterialKey = 'alu' }) {
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const branches = useMemo(
    () => ws?.snapshot?.workspaceBranches ?? ws?.session?.branches ?? [],
    [ws?.snapshot?.workspaceBranches, ws?.session?.branches]
  );
  const [materialKey, setMaterialKey] = useState(initialMaterialKey);
  const [branchId, setBranchId] = useState(() => branches[0]?.id || '');
  const [sheet, setSheet] = useState(null);
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [savingGauge, setSavingGauge] = useState(null);
  const [draftByGauge, setDraftByGauge] = useState({});

  useEffect(() => {
    if (open) setMaterialKey(initialMaterialKey);
  }, [open, initialMaterialKey]);

  useEffect(() => {
    if (branches.length && !branches.some((b) => b.id === branchId)) {
      setBranchId(branches[0]?.id || '');
    }
  }, [branches, branchId]);

  const loadEvents = useCallback(async (mk) => {
    const { ok, data } = await apiFetch(
      `/api/pricing/material-sheet/events?materialKey=${encodeURIComponent(mk)}&limit=60`
    );
    if (ok && data?.ok) setEvents(data.events || []);
    else setEvents([]);
  }, []);

  const loadSheet = useCallback(async () => {
    if (!materialKey || !branchId) return;
    setBusy(true);
    const [r1, r2] = await Promise.all([
      apiFetch(
        `/api/pricing/material-sheet?materialKey=${encodeURIComponent(materialKey)}&branchId=${encodeURIComponent(branchId)}`
      ),
      apiFetch(
        `/api/pricing/material-sheet/events?materialKey=${encodeURIComponent(materialKey)}&limit=60`
      ),
    ]);
    setBusy(false);
    if (!r1.ok || !r1.data?.ok) {
      setSheet(null);
      setDraftByGauge({});
      showToast(r1.data?.error || 'Could not load workbook.', { variant: 'error' });
      return;
    }
    setSheet(r1.data);
    if (r2.ok && r2.data?.ok) setEvents(r2.data.events || []);

    const d = {};
    for (const g of r1.data.gauges || []) {
      const row = (r1.data.rows || []).find((x) => x.gaugeMm === g && !x.designKey);
      const th = r1.data.theoreticalStandardByGauge?.[g];
      d[g] = {
        conversionStandardKgPerM: row?.conversionStandardKgPerM != null ? String(row.conversionStandardKgPerM) : '',
        conversionReferenceKgPerM: row?.conversionReferenceKgPerM != null ? String(row.conversionReferenceKgPerM) : '',
        conversionHistoryKgPerM: row?.conversionHistoryKgPerM != null ? String(row.conversionHistoryKgPerM) : '',
        conversionUsedKgPerM: row?.conversionUsedKgPerM != null ? String(row.conversionUsedKgPerM) : '',
        costPerKgNgn: row?.costPerKgNgn != null ? String(row.costPerKgNgn) : '',
        overheadNgnPerM: row?.overheadNgnPerM != null ? String(row.overheadNgnPerM) : '',
        profitNgnPerM: row?.profitNgnPerM != null ? String(row.profitNgnPerM) : '',
        minimumPricePerMeterNgn: row?.minimumPricePerMeterNgn != null ? String(row.minimumPricePerMeterNgn) : '',
        notes: row?.notes || '',
        syncMinimumToPriceList: false,
        syncDesignKey: '',
        theoreticalHint: th != null ? th : null,
      };
    }
    setDraftByGauge(d);
  }, [materialKey, branchId, showToast]);

  useEffect(() => {
    if (open && branchId) void loadSheet();
  }, [open, branchId, materialKey, loadSheet]);

  const persistRow = async (gaugeMm) => {
    const dr = draftByGauge[gaugeMm];
    if (!dr || !branchId) return;
    setSavingGauge(gaugeMm);
    const body = {
      materialKey,
      gaugeMm,
      branchId,
      designKey: '',
      conversionStandardKgPerM: numOrUndef(dr.conversionStandardKgPerM),
      conversionReferenceKgPerM: numOrUndef(dr.conversionReferenceKgPerM),
      conversionHistoryKgPerM: numOrUndef(dr.conversionHistoryKgPerM),
      conversionUsedKgPerM: numOrUndef(dr.conversionUsedKgPerM),
      costPerKgNgn: numOrUndef(dr.costPerKgNgn) ?? 0,
      overheadNgnPerM: numOrUndef(dr.overheadNgnPerM) ?? 0,
      profitNgnPerM: numOrUndef(dr.profitNgnPerM) ?? 0,
      minimumPricePerMeterNgn: Math.round(Number(dr.minimumPricePerMeterNgn) || 0),
      notes: dr.notes?.trim() || undefined,
      syncMinimumToPriceList: Boolean(dr.syncMinimumToPriceList),
      syncDesignKey: dr.syncDesignKey?.trim() || undefined,
    };
    const { ok, data } = await apiFetch('/api/pricing/material-sheet/rows', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setSavingGauge(null);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Save failed.', { variant: 'error' });
      return;
    }
    if (data.priceListSync && !data.priceListSync.ok) {
      showToast(`Saved row. Price list: ${data.priceListSync.error || 'sync skipped.'}`, { variant: 'error' });
    } else {
      showToast(data.priceListSync?.ok ? 'Saved row and synced floor price.' : 'Saved row.');
    }
    void loadSheet();
    void loadEvents(materialKey);
  };

  const setDraft = (gaugeMm, patch) => {
    setDraftByGauge((prev) => ({
      ...prev,
      [gaugeMm]: { ...prev[gaugeMm], ...patch },
    }));
  };

  const thMap = sheet?.theoreticalStandardByGauge || {};
  const catMap = sheet?.catalogHintByGauge || {};

  return (
    <ModalFrame isOpen={open} onClose={onClose}>
      <div className="z-modal-panel max-w-[min(96vw,1100px)] max-h-[min(90vh,820px)] flex flex-col p-0 overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-base font-black text-[#134e4a]">Material pricing workbook</h2>
            <p className="text-[10px] text-slate-600 mt-1 max-w-xl leading-relaxed">
              Pick a coil material and branch. <strong className="text-slate-800">Avg conversion</strong> is from
              standard, reference, and history where entered. Enter <strong className="text-slate-800">conversion used</strong>{' '}
              for economics. <strong className="text-slate-800">Suggested ₦/m</strong> is derived (not locked). Set{' '}
              <strong className="text-slate-800">minimum ₦/m</strong> as the floor; quotations below it still require MD
              approval. MD and pricing roles can edit all fields here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-800 shrink-0"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 px-4 py-3 sm:px-5 border-b border-slate-100 bg-white">
          <label className="text-[10px] font-bold uppercase text-slate-500 block min-w-[140px]">
            Material
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-sm font-semibold text-slate-800"
              value={materialKey}
              onChange={(e) => setMaterialKey(e.target.value)}
            >
              {MATERIAL_OPTIONS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase text-slate-500 block min-w-[180px]">
            Branch
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white py-2 px-2 text-sm font-semibold text-slate-800"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {branches.length === 0 ? <option value="">No branches</option> : null}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name || b.code || b.id}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadSheet()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase text-[#134e4a] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-2 sm:px-4 py-3">
          {busy && !sheet ? (
            <p className="text-sm text-slate-500 px-2">Loading…</p>
          ) : (
            <div className="z-scroll-x overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-[920px] w-full border-collapse text-left text-xs">
                <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wide text-slate-600 sticky top-0 z-[1]">
                  <tr>
                    <th className="px-2 py-2 border-b border-slate-200 whitespace-nowrap">Gauge</th>
                    <th className="px-2 py-2 border-b border-slate-200 whitespace-nowrap">Std kg/m</th>
                    <th className="px-2 py-2 border-b border-slate-200 whitespace-nowrap">Ref</th>
                    <th className="px-2 py-2 border-b border-slate-200 whitespace-nowrap">Hist</th>
                    <th className="px-2 py-2 border-b border-slate-200 whitespace-nowrap">Avg</th>
                    <th className="px-2 py-2 border-b border-slate-200 whitespace-nowrap">Used</th>
                    <th className="px-2 py-2 border-b border-slate-200 whitespace-nowrap">₦/kg</th>
                    <th className="px-2 py-2 border-b border-slate-200 whitespace-nowrap">Cost/m</th>
                    <th className="px-2 py-2 border-b border-slate-200 whitespace-nowrap">OH/m</th>
                    <th className="px-2 py-2 border-b border-slate-200 whitespace-nowrap">Profit/m</th>
                    <th className="px-2 py-2 border-b border-slate-200 whitespace-nowrap">Suggested</th>
                    <th className="px-2 py-2 border-b border-slate-200 whitespace-nowrap">Min ₦/m</th>
                    <th className="px-2 py-2 border-b border-slate-200 whitespace-nowrap">Sync floor</th>
                    <th className="px-2 py-2 border-b border-slate-200 whitespace-nowrap w-[120px]" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(sheet?.gauges || []).map((g) => {
                    const dr = draftByGauge[g] || {};
                    const std = numOrUndef(dr.conversionStandardKgPerM);
                    const ref = numOrUndef(dr.conversionReferenceKgPerM);
                    const hist = numOrUndef(dr.conversionHistoryKgPerM);
                    const av = avgThree(std, ref, hist);
                    const used = numOrUndef(dr.conversionUsedKgPerM);
                    const ck = numOrUndef(dr.costPerKgNgn);
                    const oh = numOrUndef(dr.overheadNgnPerM);
                    const pr = numOrUndef(dr.profitNgnPerM);
                    const cm = costPerM(used ?? av, ck);
                    const sug = suggested(used ?? av, ck ?? 0, oh, pr);
                    const th = thMap[g];
                    const cat = catMap[g];
                    const inp =
                      'w-full min-w-[64px] rounded border border-slate-200 px-1 py-1 font-mono text-[11px] tabular-nums';
                    return (
                      <tr key={g} className="hover:bg-teal-50/20">
                        <td className="px-2 py-1.5 font-bold text-slate-800 whitespace-nowrap">{g} mm</td>
                        <td className="px-2 py-1.5 align-top">
                          <input
                            className={inp}
                            value={dr.conversionStandardKgPerM ?? ''}
                            placeholder={th != null ? th.toFixed(4) : cat != null ? String(cat.toFixed(4)) : '—'}
                            onChange={(e) => setDraft(g, { conversionStandardKgPerM: e.target.value })}
                          />
                          {th != null ? (
                            <p className="text-[8px] text-slate-400 mt-0.5">ρ calc {th.toFixed(4)}</p>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className={inp}
                            value={dr.conversionReferenceKgPerM ?? ''}
                            onChange={(e) => setDraft(g, { conversionReferenceKgPerM: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className={inp}
                            value={dr.conversionHistoryKgPerM ?? ''}
                            onChange={(e) => setDraft(g, { conversionHistoryKgPerM: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[11px] text-slate-700 tabular-nums">
                          {av == null ? '—' : av.toFixed(4)}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className={inp}
                            value={dr.conversionUsedKgPerM ?? ''}
                            placeholder={av != null ? av.toFixed(4) : ''}
                            onChange={(e) => setDraft(g, { conversionUsedKgPerM: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className={inp}
                            value={dr.costPerKgNgn ?? ''}
                            onChange={(e) => setDraft(g, { costPerKgNgn: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[11px] text-slate-600 tabular-nums">
                          {cm == null ? '—' : formatNgn(Math.round(cm))}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className={inp}
                            value={dr.overheadNgnPerM ?? ''}
                            onChange={(e) => setDraft(g, { overheadNgnPerM: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className={inp}
                            value={dr.profitNgnPerM ?? ''}
                            onChange={(e) => setDraft(g, { profitNgnPerM: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[11px] font-semibold text-[#134e4a] tabular-nums">
                          {sug == null ? '—' : formatNgn(sug)}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className={inp}
                            value={dr.minimumPricePerMeterNgn ?? ''}
                            onChange={(e) => setDraft(g, { minimumPricePerMeterNgn: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5 align-top space-y-1">
                          <label className="flex items-center gap-1 text-[9px] text-slate-600 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={Boolean(dr.syncMinimumToPriceList)}
                              onChange={(e) => setDraft(g, { syncMinimumToPriceList: e.target.checked })}
                            />
                            Sync
                          </label>
                          <input
                            className={`${inp} text-[10px]`}
                            placeholder="Design key"
                            value={dr.syncDesignKey ?? ''}
                            onChange={(e) => setDraft(g, { syncDesignKey: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            disabled={Boolean(savingGauge) || busy}
                            onClick={() => void persistRow(g)}
                            className="rounded-lg bg-[#134e4a] px-2 py-1.5 text-[9px] font-black uppercase text-white disabled:opacity-50"
                          >
                            {savingGauge === g ? '…' : 'Save'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <h3 className="text-[10px] font-black uppercase text-[#134e4a] mb-2">Price change log</h3>
            {events.length === 0 ? (
              <p className="text-[11px] text-slate-500">No changes recorded for this material yet.</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {events.map((ev) => {
                  const snap = ev.payload?.after || {};
                  const when = ev.changedAtIso ? new Date(ev.changedAtIso).toLocaleString() : '';
                  return (
                    <li
                      key={ev.id}
                      className="text-[10px] text-slate-700 border-b border-slate-200/80 pb-2 last:border-0 leading-snug"
                    >
                      <span className="font-bold text-slate-900">{when}</span>
                      {' · '}
                      <span className="font-mono">{ev.branchId}</span> · gauge {ev.gaugeMm} mm
                      {snap.minimumPricePerMeterNgn != null ? (
                        <>
                          {' '}
                          · min <span className="font-mono">₦{formatNgn(snap.minimumPricePerMeterNgn)}</span>/m
                        </>
                      ) : null}
                      {snap.suggestedPricePerMeterNgn != null ? (
                        <>
                          {' '}
                          · suggested{' '}
                          <span className="font-mono">₦{formatNgn(snap.suggestedPricePerMeterNgn)}</span>/m
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}
