import { procurementKindFromPo } from './procurementPoKind';

/** @param {{ lines?: { qtyOrdered?: number }[]; procurementKind?: string }} po */
export function purchaseOrderCoilKgTotal(po) {
  if (procurementKindFromPo(po) !== 'coil') return 0;
  return (po.lines || []).reduce((s, l) => s + (Number(l.qtyOrdered) || 0), 0);
}

export function defaultTransportAgentProfile() {
  return {
    vehicleType: '',
    vehicleReg: '',
    typicalRoutes: '',
    paymentPreference: '',
    reliabilityNotes: '',
    emergencyContact: '',
  };
}

/** Normalize profile from API (may be partial). */
export function mergeTransportAgentProfile(raw) {
  return { ...defaultTransportAgentProfile(), ...(raw && typeof raw === 'object' ? raw : {}) };
}

/**
 * @param {string} agentId
 * @param {object[]} purchaseOrders
 */
export function buildTransportAgentIntel(agentId, purchaseOrders) {
  const id = String(agentId || '').trim();
  const rows = (purchaseOrders || []).filter((p) => String(p.transportAgentId || '').trim() === id);

  const withFee = rows.filter((p) => (Number(p.transportAmountNgn) || 0) > 0);
  let totalKgForWeighted = 0;
  let totalFeeForWeighted = 0;
  const perPoRates = [];

  const history = rows.map((p) => {
    const kind = procurementKindFromPo(p);
    const kg = purchaseOrderCoilKgTotal(p);
    const fee = Number(p.transportAmountNgn) || 0;
    const feePerKg = kg > 0 && fee > 0 ? fee / kg : null;
    if (fee > 0 && kg > 0) {
      totalKgForWeighted += kg;
      totalFeeForWeighted += fee;
      perPoRates.push(fee / kg);
    }
    let orderQtyLabel = '';
    if (kind === 'coil') {
      orderQtyLabel = kg > 0 ? `${Math.round(kg).toLocaleString()} kg` : '0 kg';
    } else if (kind === 'stone') {
      const m = (p.lines || []).reduce((s, l) => s + (Number(l.qtyOrdered) || 0), 0);
      orderQtyLabel = `${m.toLocaleString()} m (stone)`;
    } else {
      const u = (p.lines || []).reduce((s, l) => s + (Number(l.qtyOrdered) || 0), 0);
      orderQtyLabel = `${u.toLocaleString()} units`;
    }
    return {
      poID: p.poID,
      orderDateISO: p.orderDateISO,
      supplierName: p.supplierName,
      status: p.status,
      procurementKind: kind,
      kg,
      orderQtyLabel,
      transportAmountNgn: fee,
      transportPerKgNgn: feePerKg,
      transportReference: p.transportReference,
      transportPaid: p.transportPaid,
    };
  });

  history.sort((a, b) => String(b.orderDateISO || '').localeCompare(String(a.orderDateISO || '')));

  const weightedAvgTransportPerKgNgn =
    totalKgForWeighted > 0 && totalFeeForWeighted > 0 ? totalFeeForWeighted / totalKgForWeighted : null;
  const simpleAvgTransportPerKgNgn =
    perPoRates.length > 0 ? perPoRates.reduce((s, n) => s + n, 0) / perPoRates.length : null;

  const inTransitOrLoading = rows.filter((p) => p.status === 'On loading' || p.status === 'In Transit').length;

  const totalTransportNgn = withFee.reduce((s, p) => s + (Number(p.transportAmountNgn) || 0), 0);
  const totalPaidTransportNgn = withFee.reduce((s, p) => s + (Number(p.transportPaidNgn) || 0), 0);

  return {
    assignmentCount: rows.length,
    withTransportFeeCount: withFee.length,
    totalTransportNgn,
    totalPaidTransportNgn,
    totalCoilKg: rows.reduce((s, p) => s + purchaseOrderCoilKgTotal(p), 0),
    weightedAvgTransportPerKgNgn,
    simpleAvgTransportPerKgNgn,
    inTransitOrLoading,
    history,
    lastOrderISO: history[0]?.orderDateISO ?? null,
  };
}
