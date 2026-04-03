/**
 * Dashboard / Sales spot table from workspace master data (Setup → price list).
 */

function byId(list) {
  const m = {};
  (list || []).forEach((row) => {
    if (row?.id) m[row.id] = row;
  });
  return m;
}

/**
 * @param {{ priceList?: object[], gauges?: object[], materialTypes?: object[], colours?: object[], profiles?: object[] } | null | undefined} masterData
 */
export function spotPricesRowsFromMasterData(masterData) {
  const priceList = masterData?.priceList;
  if (!Array.isArray(priceList) || priceList.length === 0) return [];

  const gauges = byId(masterData?.gauges);
  const materials = byId(masterData?.materialTypes);
  const colours = byId(masterData?.colours);
  const profiles = byId(masterData?.profiles);

  const rows = priceList
    .filter((row) => row.active !== false && String(row.unit || '').toLowerCase() === 'm')
    .map((row) => {
      const g = row.gaugeId ? gauges[row.gaugeId] : null;
      const gaugeLabel = g?.label || (g?.gaugeMm != null && g.gaugeMm !== '' ? `${g.gaugeMm} mm` : '—');
      const mat = row.materialTypeId ? materials[row.materialTypeId] : null;
      const productType = row.itemName || mat?.name || '—';
      const col = row.colourId ? colours[row.colourId] : null;
      const colourBit =
        col?.abbreviation || col?.name ? `${col.abbreviation || col.name}` : '';
      const prof = row.profileId ? profiles[row.profileId] : null;
      const profileBit = prof?.name || '';
      const extra = [colourBit && `Colour ${colourBit}`, profileBit && profileBit].filter(Boolean);
      const note = [row.notes, ...extra].filter(Boolean).join(' · ') || '';

      return {
        id: row.id,
        gaugeLabel,
        productType,
        note,
        priceNgn: Number(row.unitPriceNgn) || 0,
        setupRow: { ...row },
      };
    });

  rows.sort((a, b) => {
    const sa = Number(a.setupRow.sortOrder) || 0;
    const sb = Number(b.setupRow.sortOrder) || 0;
    if (sa !== sb) return sa - sb;
    const ga = gauges[a.setupRow.gaugeId]?.gaugeMm ?? 0;
    const gb = gauges[b.setupRow.gaugeId]?.gaugeMm ?? 0;
    if (ga !== gb) return ga - gb;
    return String(a.gaugeLabel).localeCompare(String(b.gaugeLabel));
  });

  return rows;
}

/**
 * Full payload for PATCH /api/setup/price-list/:id (matches server normalizePayload).
 */
export function buildPriceListSaveBody(base, patch) {
  const row = { ...base, ...patch };
  return {
    id: row.id,
    quoteItemId: row.quoteItemId ?? '',
    itemName: row.itemName,
    unit: row.unit ?? 'm',
    unitPriceNgn: Number(row.unitPriceNgn) || 0,
    gaugeId: row.gaugeId ?? '',
    colourId: row.colourId ?? '',
    materialTypeId: row.materialTypeId ?? '',
    profileId: row.profileId ?? '',
    notes: row.notes ?? '',
    active: row.active !== false,
    sortOrder: Number(row.sortOrder) || 0,
    bookLabel: row.bookLabel ?? 'Standard',
    bookVersion: Math.max(1, Number(row.bookVersion) || 1),
    effectiveFromISO: String(row.effectiveFromISO || '2020-01-01').slice(0, 10),
  };
}
