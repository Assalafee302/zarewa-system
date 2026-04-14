export function firstGaugeNumeric(gaugeStr) {
  const m = String(gaugeStr ?? '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1], 10) : null;
}

/** Rough yield for sales-side planning — not dispatch truth. */
export function roughMetersFromKg(kg, gaugeMm) {
  if (kg == null || Number.isNaN(kg) || kg <= 0) return null;
  const g = gaugeMm ?? 0.26;
  const kgPerM = g <= 0.22 ? 2.35 : g <= 0.26 ? 2.65 : g <= 0.3 ? 2.9 : g <= 0.45 ? 3.4 : 3.8;
  return Math.max(0, Math.round(kg / kgPerM));
}

export function colourShort(colourStr) {
  const s = String(colourStr ?? '').trim();
  if (!s) return '—';
  const tok = s.split(/[·,]/)[0].trim();
  return tok.length > 8 ? `${tok.slice(0, 7)}…` : tok;
}

/**
 * Remaining kg for a coil lot (prefers live book fields from Operations — not original receipt weight).
 * @param {Record<string, unknown>} lot — workspace `coilLots` row
 */
export function coilLotRemainingKg(lot) {
  if (!lot || typeof lot !== 'object') return null;
  const cw = Number(lot.currentWeightKg);
  if (Number.isFinite(cw) && cw > 0) return cw;
  const qr = Number(lot.qtyRemaining);
  if (Number.isFinite(qr) && qr > 0) return qr;
  const w = Number(lot.weightKg);
  if (Number.isFinite(w) && w > 0) return w;
  return null;
}

/** Lots that must not appear as “available coil” in Sales stock / readiness (fully used or closed). */
export function isCoilLotUnavailableForPlanning(lot) {
  const st = String(lot?.currentStatus ?? '').trim();
  return st === 'Consumed' || st === 'Finished';
}

export function buildStockVerdict(stockSearchActive, stockSearchMatches) {
  if (!stockSearchActive) return null;
  if (!Array.isArray(stockSearchMatches) || stockSearchMatches.length === 0) {
    return {
      kind: 'none',
      title: 'Not available',
      detail: 'No matching coil or stock line for this combination.',
    };
  }
  const totalKg = stockSearchMatches.reduce((s, r) => s + (Number(r.kg) || 0), 0);
  const estM = stockSearchMatches.reduce((s, r) => s + (r.estMeters ?? 0), 0);
  const anyLow = stockSearchMatches.some((r) => r.low);
  const allLow = stockSearchMatches.every((r) => r.low);
  if (totalKg <= 0) {
    return {
      kind: 'none',
      title: 'Not available',
      detail: 'Matches on file show zero kg — check Operations for receipts.',
    };
  }
  const summary = `${stockSearchMatches.length} line(s) · ${totalKg.toLocaleString()} kg · ~${estM.toLocaleString()} m est.`;
  if (allLow) return { kind: 'low', title: 'Low stock', detail: summary };
  if (anyLow) return { kind: 'mixed', title: 'Available (some lines below reorder)', detail: summary };
  return { kind: 'ok', title: 'Available', detail: summary };
}

