import {
  buildExpectedCoilSpecFromQuotation,
  coilSpecMismatchIssues,
  expectedGaugeBoundsMm,
} from './coilSpecVersusProduct';

function skipMaterialCompareToCoil(expectedMaterialType) {
  const m = String(expectedMaterialType ?? '').toLowerCase();
  if (!m) return false;
  if (/\bfinished\b/.test(m)) return true;
  if (/\broofing sheet\b/.test(m)) return true;
  if (/\baccessory\b/.test(m)) return true;
  if (/\bsteeltile\b/.test(m) && !/\bcoil\b/.test(m)) return true;
  return false;
}

const TERMINAL = /^(finished|completed|ready\s*for\s*dispatch)$/i;
const IN_PRODUCTION = /^in\s+production$/i;

/** Cutting lists not finished / not actively on the line — can still need coil. */
export function isWaitingCuttingListForMaterial(cl) {
  const s = String(cl?.status || '').trim();
  if (!s) return true;
  if (TERMINAL.test(s)) return false;
  if (IN_PRODUCTION.test(s)) return false;
  return true;
}

function inventoryRowToCoilLot(row) {
  return {
    gaugeLabel: row.gaugeLabel,
    colour: row.colour,
    materialTypeName: row.materialType,
  };
}

/**
 * Strict match: quote must have comparable material fields; coil row must pass spec check and have kg.
 * @param {Record<string, unknown>} row — Sales coilInventoryRows shape
 * @param {Record<string, unknown>} quotation
 */
export function inventoryRowMatchesQuotationCoilSpec(row, quotation) {
  if (!row || !quotation) return false;
  if (Number(row.kg) <= 0) return false;
  const lot = inventoryRowToCoilLot(row);
  const expected = buildExpectedCoilSpecFromQuotation(quotation, null);
  const { issues, hasExpected } = coilSpecMismatchIssues(lot, expected);
  if (!hasExpected) return false;
  return issues.length === 0;
}

/** True when quotation header / lines give enough to compare to coil inventory (same idea as coilSpecMismatchIssues). */
export function quotationHasComparableCoilSpec(quotation) {
  const e = buildExpectedCoilSpecFromQuotation(quotation, null);
  const gBounds = expectedGaugeBoundsMm(e.gauge);
  const cExp = String(e.colour || '').trim().toLowerCase();
  const mRaw = String(e.materialType || '').trim();
  const mExp = skipMaterialCompareToCoil(mRaw) ? '' : mRaw.toLowerCase();
  return gBounds != null || cExp.length > 0 || mExp.length > 0;
}

/**
 * @param {object[]} cuttingLists
 * @param {object[]} quotations
 * @param {object[]} coilInventoryRows — from Sales.jsx coilInventoryRows
 * @returns {{ ready: Array<{ cl: object, quotation: object, matches: object[], totalKg: number, totalEstM: number, needM: number, meterCoverageOk: boolean }>, waitingWithSpecNoStock: number }}
 */
export function computeCuttingListMaterialReadiness(cuttingLists, quotations, coilInventoryRows) {
  const byQ = new Map(quotations.map((q) => [String(q.id), q]));
  const ready = [];
  let waitingWithSpecNoStock = 0;

  for (const cl of cuttingLists || []) {
    if (!isWaitingCuttingListForMaterial(cl)) continue;
    const q = byQ.get(String(cl.quotationRef || '').trim());
    if (!q || !quotationHasComparableCoilSpec(q)) continue;

    const matches = (coilInventoryRows || []).filter((r) => inventoryRowMatchesQuotationCoilSpec(r, q));
    if (matches.length === 0) {
      waitingWithSpecNoStock += 1;
      continue;
    }

    const totalKg = matches.reduce((s, r) => s + (Number(r.kg) || 0), 0);
    const totalEstM = matches.reduce((s, r) => s + (Number(r.estMeters) || 0), 0);
    const needM = Number(cl.totalMeters) || 0;
    const meterCoverageOk = needM <= 0 || totalEstM >= needM * 0.85;

    ready.push({ cl, quotation: q, matches, totalKg, totalEstM, needM, meterCoverageOk });
  }

  ready.sort((a, b) => {
    if (a.meterCoverageOk !== b.meterCoverageOk) return a.meterCoverageOk ? -1 : 1;
    return b.totalEstM - a.totalEstM;
  });

  return { ready, waitingWithSpecNoStock };
}
