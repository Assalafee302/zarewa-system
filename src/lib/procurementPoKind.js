/**
 * Classify purchase orders for UI (coil kg vs stone metres vs accessories).
 * Mirrors server/procurementPoKind.js for bootstrap payloads that omit procurementKind.
 */

export function deriveProcurementKindFromProductIds(productIds) {
  const ids = (productIds || []).map((x) => String(x ?? '').trim()).filter(Boolean);
  if (ids.length === 0) return 'coil';
  if (ids.every((id) => /^STONE-/i.test(id))) return 'stone';
  if (ids.every((id) => /^ACC-/i.test(id))) return 'accessory';
  return 'coil';
}

/** @param {{ procurementKind?: string; lines?: { productID?: string }[] }} po */
export function procurementKindFromPo(po) {
  const k = String(po?.procurementKind || '').trim().toLowerCase();
  if (k === 'stone' || k === 'accessory' || k === 'coil') return k;
  const pids = (po?.lines || []).map((l) => l.productID).filter(Boolean);
  return deriveProcurementKindFromProductIds(pids);
}

/**
 * Unit price used for comparisons and labels: ₦/kg (coil), ₦/m (stone), ₦/unit (accessory).
 * Falls back across `unitPricePerKgNgn` / `unitPriceNgn` when one is zero (legacy rows).
 * @param {'coil' | 'stone' | 'accessory'} kind
 */
export function poLineBenchmarkPriceNgn(line, kind) {
  const up = Math.round(Number(line?.unitPriceNgn) || 0);
  const upkg = Math.round(Number(line?.unitPricePerKgNgn) || 0);
  if (kind === 'stone') return up > 0 ? up : upkg;
  if (kind === 'accessory') return up > 0 ? up : upkg;
  return upkg > 0 ? upkg : up;
}

/** @param {'coil' | 'stone' | 'accessory'} kind */
export function poLineQtyLabel(line, kind) {
  const q = Number(line?.qtyOrdered) || 0;
  if (kind === 'stone') return `${q.toLocaleString()} m`;
  if (kind === 'accessory') return `${q.toLocaleString()} units`;
  return `${q.toLocaleString()} kg`;
}

/** @param {'coil' | 'stone' | 'accessory'} kind */
export function poLinePriceSuffix(kind) {
  if (kind === 'stone') return '/m';
  if (kind === 'accessory') return '/unit';
  return '/kg';
}
