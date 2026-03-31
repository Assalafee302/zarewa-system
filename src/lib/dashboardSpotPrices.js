import { DEFAULT_DASHBOARD_SPOT_PRICES } from '../Data/mockData';

const KEY = 'zarewa.dashboard.spotPrices';

function cloneDefaults() {
  return DEFAULT_DASHBOARD_SPOT_PRICES.map((r) => ({ ...r }));
}

export function loadSpotPrices() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return cloneDefaults();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return cloneDefaults();
    const byId = Object.fromEntries(parsed.map((r) => [r.id, r]));
    return DEFAULT_DASHBOARD_SPOT_PRICES.map((d) => ({
      ...d,
      ...(byId[d.id] && typeof byId[d.id].priceNgn === 'number' ? { priceNgn: byId[d.id].priceNgn } : {}),
      ...(byId[d.id]?.note != null ? { note: String(byId[d.id].note) } : {}),
    }));
  } catch {
    return cloneDefaults();
  }
}

export function saveSpotPrices(rows) {
  const minimal = rows.map(({ id, priceNgn, note }) => ({
    id,
    priceNgn: Number(priceNgn) || 0,
    note: note ?? '',
  }));
  localStorage.setItem(KEY, JSON.stringify(minimal));
}
