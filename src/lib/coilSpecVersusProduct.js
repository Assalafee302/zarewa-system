/** First numeric gauge in a label, e.g. "0.24mm" → 0.24 */
export function firstGaugeNumber(value) {
  const m = String(value ?? '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1], 10) : null;
}

/**
 * Compare selected coil lot to finished-good product attrs (from quotation / product master).
 * @param {Record<string, unknown> | null | undefined} lot
 * @param {{ gauge?: string; colour?: string; materialType?: string } | null | undefined} jobProductAttrs
 * @returns {string | null} Warning sentence or null if aligned / insufficient data
 */
export function coilVersusJobProductWarning(lot, jobProductAttrs) {
  if (!lot || !jobProductAttrs) return null;
  const gProd = firstGaugeNumber(jobProductAttrs.gauge);
  const gCoil = firstGaugeNumber(lot.gaugeLabel);
  const cProd = String(jobProductAttrs.colour || '').trim().toLowerCase();
  const cCoil = String(lot.colour || '').trim().toLowerCase();
  const mProd = String(jobProductAttrs.materialType || '').trim().toLowerCase();
  const mCoil = String(lot.materialTypeName || '').trim().toLowerCase();

  const hasExpected = gProd != null || cProd.length > 0 || mProd.length > 0;
  if (!hasExpected) return null;

  const issues = [];
  if (gProd != null && gCoil != null && Math.abs(gProd - gCoil) > 0.02) {
    issues.push(
      `gauge (coil ${lot.gaugeLabel || '—'} vs quoted product ${jobProductAttrs.gauge || '—'})`
    );
  }
  if (cProd && cCoil && !cCoil.includes(cProd) && !cProd.includes(cCoil)) {
    issues.push(`colour (coil ${lot.colour || '—'} vs quoted ${jobProductAttrs.colour || '—'})`);
  }
  if (mProd && mCoil) {
    const a = mProd.split(/\s+/)[0];
    const b = mCoil.split(/\s+/)[0];
    if (a.length > 2 && b.length > 2 && !mCoil.includes(a) && !mProd.includes(b)) {
      issues.push(`material (coil ${lot.materialTypeName || '—'} vs ${jobProductAttrs.materialType || '—'})`);
    }
  }
  if (!issues.length) return null;
  return `Spec check: this coil may not match the quoted product — ${issues.join('; ')}. Confirm before allocating.`;
}
