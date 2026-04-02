/* eslint-disable react-refresh/only-export-components -- context + hook */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { apiFetch } from '../lib/apiBase';
import { useWorkspace } from './WorkspaceContext';

const InventoryContext = createContext(null);

function clonePo(po) {
  return {
    ...po,
    lines: po.lines.map((l) => ({ ...l })),
  };
}

function nextPoId(list) {
  const nums = list
    .map((p) => parseInt(String(p.poID).replace(/\D/g, ''), 10))
    .filter((n) => !Number.isNaN(n));
  const n = nums.length ? Math.max(...nums) + 1 : 1;
  return `PO-2026-${String(n).padStart(3, '0')}`;
}

function normalizePoLine(l, idx, catalog = []) {
  const p = catalog.find((x) => x.productID === l.productID);
  const kg = Number(l.qtyOrdered) || 0;
  const perKg =
    l.unitPricePerKgNgn != null && l.unitPricePerKgNgn !== ''
      ? Number(l.unitPricePerKgNgn)
      : Number(l.unitPriceNgn) || 0;
  const legacyUnit = Number(l.unitPriceNgn) || 0;
  const hasExplicitPerKg = l.unitPricePerKgNgn != null && l.unitPricePerKgNgn !== '';
  return {
    ...l,
    lineKey: l.lineKey || `L${idx}-${l.productID}`,
    productName: l.productName || p?.name || l.productID,
    qtyOrdered: kg,
    unitPricePerKgNgn: hasExplicitPerKg ? perKg : legacyUnit,
    unitPriceNgn: hasExplicitPerKg ? perKg : legacyUnit,
    qtyReceived: Number(l.qtyReceived) || 0,
    color: l.color ?? '',
    gauge: l.gauge ?? '',
    metersOffered: l.metersOffered != null && l.metersOffered !== '' ? Number(l.metersOffered) : null,
    conversionKgPerM:
      l.conversionKgPerM != null && l.conversionKgPerM !== '' ? Number(l.conversionKgPerM) : null,
  };
}

function normalizePurchaseOrder(po, catalog = []) {
  return {
    ...po,
    transportAgentId: po.transportAgentId ?? '',
    transportAgentName: po.transportAgentName ?? '',
    transportReference: po.transportReference ?? '',
    transportNote: po.transportNote ?? '',
    transportTreasuryMovementId: po.transportTreasuryMovementId ?? '',
    transportAmountNgn: Number(po.transportAmountNgn) || 0,
    transportPaid: Boolean(po.transportPaid),
    transportPaidAtISO: po.transportPaidAtISO ?? '',
    supplierPaidNgn: Number(po.supplierPaidNgn) || 0,
    lines: po.lines.map((l, i) => normalizePoLine(l, i, catalog)),
  };
}

function poLineFullyReceived(line) {
  return Number(line.qtyReceived) >= Number(line.qtyOrdered);
}

function findPoLine(po, entry) {
  if (entry.lineKey) return po.lines.find((l) => l.lineKey === entry.lineKey);
  return po.lines.find((l) => l.productID === entry.productID);
}

export function InventoryProvider({ children }) {
  const ws = useWorkspace();
  const [products, setProducts] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [movements, setMovements] = useState([]);
  const [coilLots, setCoilLots] = useState([]);
  const [wipByProduct, setWipByProduct] = useState({});

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const s = ws?.snapshot;
    if (!s) {
      setProducts([]);
      setPurchaseOrders([]);
      setMovements([]);
      setCoilLots([]);
      setWipByProduct({});
      return;
    }
    if (Array.isArray(s.products)) {
      setProducts(s.products.map((p) => ({ ...p })));
    }
    if (Array.isArray(s.purchaseOrders)) {
      const catalog = Array.isArray(s.products) ? s.products : [];
      setPurchaseOrders(s.purchaseOrders.map((po) => clonePo(normalizePurchaseOrder(po, catalog))));
    }
    if (Array.isArray(s.movements)) {
      setMovements(s.movements.map((m) => ({ ...m })));
    }
    if (Array.isArray(s.coilLots)) {
      setCoilLots(
        s.coilLots.map((lot) => ({
          coilNo: lot.coilNo,
          productID: lot.productID,
          lineKey: lot.lineKey ?? null,
          qtyReceived: lot.qtyReceived,
          weightKg: lot.weightKg,
          colour: lot.colour ?? '',
          gaugeLabel: lot.gaugeLabel ?? '',
          materialTypeName: lot.materialTypeName ?? '',
          supplierExpectedMeters: lot.supplierExpectedMeters ?? null,
          supplierConversionKgPerM: lot.supplierConversionKgPerM ?? null,
          qtyRemaining: Number(lot.qtyRemaining) || 0,
          qtyReserved: Number(lot.qtyReserved) || 0,
          currentWeightKg: Number(lot.currentWeightKg) || 0,
          currentStatus: lot.currentStatus ?? 'Available',
          location: lot.location,
          poID: lot.poID,
          supplierID: lot.supplierID,
          supplierName: lot.supplierName,
          receivedAtISO: lot.receivedAtISO,
          parentCoilNo: lot.parentCoilNo ?? '',
          materialOriginNote: lot.materialOriginNote ?? '',
        }))
      );
    }
    if (s.wipByProduct && typeof s.wipByProduct === 'object') {
      setWipByProduct({ ...s.wipByProduct });
    }
  }, [ws?.snapshot]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const appendMovement = useCallback((entry) => {
    setMovements((prev) => [
      {
        id: `MV-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        atISO: new Date().toISOString().slice(0, 19),
        ...entry,
      },
      ...prev,
    ]);
  }, []);

  const getProduct = useCallback(
    (productID) => products.find((p) => p.productID === productID),
    [products]
  );

  const createPurchaseOrder = useCallback(
    async ({
      supplierID,
      supplierName,
      orderDateISO,
      expectedDeliveryISO,
      lines,
      status = 'Approved',
    }) => {
      const normalizedLines = lines
        .filter((l) => l.productID && Number(l.qtyOrdered) > 0)
        .map((l, idx) =>
          normalizePoLine(
            {
              lineKey: l.lineKey || `L${Date.now()}-${idx}-${l.productID}`,
              productID: l.productID,
              productName: l.productName,
              color: l.color,
              gauge: l.gauge,
              metersOffered: l.metersOffered,
              conversionKgPerM: l.conversionKgPerM,
              unitPricePerKgNgn: l.unitPricePerKgNgn ?? l.unitPriceNgn,
              qtyOrdered: l.qtyOrdered,
              unitPriceNgn: l.unitPriceNgn ?? l.unitPricePerKgNgn,
              qtyReceived: 0,
            },
            idx,
            products
          )
        );
      if (!normalizedLines.length) return { ok: false, error: 'Add at least one valid line.' };

      if (ws?.canMutate) {
        const { ok, data } = await apiFetch('/api/purchase-orders', {
          method: 'POST',
          body: JSON.stringify({
            supplierID,
            supplierName,
            orderDateISO: orderDateISO || new Date().toISOString().slice(0, 10),
            expectedDeliveryISO: expectedDeliveryISO || '',
            status,
            lines: normalizedLines.map((l) => ({
              lineKey: l.lineKey,
              productID: l.productID,
              productName: l.productName,
              color: l.color,
              gauge: l.gauge,
              metersOffered: l.metersOffered,
              conversionKgPerM: l.conversionKgPerM,
              unitPricePerKgNgn: l.unitPricePerKgNgn,
              unitPriceNgn: l.unitPriceNgn,
              qtyOrdered: l.qtyOrdered,
              qtyReceived: 0,
            })),
          }),
        });
        if (!ok || !data?.ok) {
          return { ok: false, error: data?.error || 'Could not create PO on server.' };
        }
        await ws.refresh();
        return { ok: true, poID: data.poID };
      }

      let createdId = '';
      setPurchaseOrders((prev) => {
        const poID = nextPoId(prev);
        createdId = poID;
        const row = normalizePurchaseOrder(
          {
            poID,
            supplierID,
            supplierName,
            orderDateISO: orderDateISO || new Date().toISOString().slice(0, 10),
            expectedDeliveryISO: expectedDeliveryISO || '',
            status,
            invoiceNo: '',
            invoiceDateISO: '',
            deliveryDateISO: '',
            transportAgentId: '',
            transportAgentName: '',
            transportReference: '',
            transportNote: '',
            transportPaid: false,
            transportPaidAtISO: '',
            supplierPaidNgn: 0,
            lines: normalizedLines,
          },
          products
        );
        return [row, ...prev];
      });
      appendMovement({
        type: 'PO_CREATED',
        ref: createdId,
        detail: `${supplierName} · ${normalizedLines.length} coil line(s)`,
      });
      return { ok: true, poID: createdId };
    },
    [appendMovement, products, ws]
  );

  const linkTransportToPurchaseOrder = useCallback(
    async (poID, { transportAgentId, transportAgentName, transportReference, transportNote }) => {
      if (ws?.canMutate) {
        const { ok, data } = await apiFetch(
          `/api/purchase-orders/${encodeURIComponent(poID)}/link-transport`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              transportAgentId,
              transportAgentName,
              transportReference,
              transportNote,
            }),
          }
        );
        if (!ok || !data?.ok) {
          return { ok: false, error: data?.error || 'Could not link transport.' };
        }
        await ws.refresh();
        return { ok: true };
      }
      setPurchaseOrders((prev) =>
        prev.map((p) =>
          p.poID === poID && p.status === 'Approved'
            ? {
                ...p,
                transportAgentId: transportAgentId ?? '',
                transportAgentName: transportAgentName ?? '',
                transportReference: transportReference ?? '',
                transportNote: transportNote ?? '',
                status: 'On loading',
              }
            : p
        )
      );
      appendMovement({
        type: 'PO_TRANSPORT_LINK',
        ref: poID,
        detail: `${transportAgentName || transportAgentId}${transportReference ? ` · ${transportReference}` : ''}`,
      });
      return { ok: true };
    },
    [appendMovement, ws]
  );

  const postPurchaseOrderTransport = useCallback(
    async (poID, body = {}) => {
      if (ws?.canMutate) {
        const { ok, data } = await apiFetch(
          `/api/purchase-orders/${encodeURIComponent(poID)}/post-transport`,
          {
            method: 'POST',
            body: JSON.stringify(body),
          }
        );
        if (!ok || !data?.ok) {
          return { ok: false, error: data?.error || 'Could not post transport.' };
        }
        await ws.refresh();
        return { ok: true };
      }
      setPurchaseOrders((prev) =>
        prev.map((p) =>
          p.poID === poID && p.status === 'On loading'
            ? {
                ...p,
                status: 'In Transit',
                transportPaid: Boolean(
                  body.treasuryAccountId && Number(body.amountNgn) > 0
                ),
                transportPaidAtISO:
                  body.treasuryAccountId && Number(body.amountNgn) > 0
                    ? new Date().toISOString()
                    : p.transportPaidAtISO,
                transportAmountNgn:
                  body.treasuryAccountId && Number(body.amountNgn) > 0
                    ? Number(body.amountNgn)
                    : p.transportAmountNgn,
              }
            : p
        )
      );
      appendMovement({ type: 'PO_TRANSPORT_POSTED', ref: poID, detail: 'In transit' });
      return { ok: true };
    },
    [appendMovement, ws]
  );

  const markPurchaseTransportPaid = useCallback(
    async (poID) => {
      if (ws?.canMutate) {
        const { ok, data } = await apiFetch(
          `/api/purchase-orders/${encodeURIComponent(poID)}/transport-paid`,
          { method: 'PATCH' }
        );
        if (!ok || !data?.ok) {
          return { ok: false, error: data?.error || 'Could not mark transport paid.' };
        }
        await ws.refresh();
        return { ok: true };
      }
      setPurchaseOrders((prev) =>
        prev.map((p) =>
          p.poID === poID && ['On loading', 'In Transit'].includes(p.status)
            ? {
                ...p,
                transportPaid: true,
                transportPaidAtISO: new Date().toISOString(),
                status: 'In Transit',
              }
            : p
        )
      );
      appendMovement({ type: 'PO_TRANSPORT_PAID', ref: poID, detail: 'In transit' });
      return { ok: true };
    },
    [appendMovement, ws]
  );

  const recordPurchaseSupplierPayment = useCallback(
    async (poID, amountNgn, note = '', opts = {}) => {
      const amt = Number(amountNgn);
      if (Number.isNaN(amt) || amt <= 0) return { ok: false, error: 'Invalid amount.' };
      if (ws?.canMutate) {
        const { ok, data } = await apiFetch(
          `/api/purchase-orders/${encodeURIComponent(poID)}/supplier-payment`,
          {
            method: 'POST',
            body: JSON.stringify({
              amountNgn: amt,
              note,
              treasuryAccountId: opts.treasuryAccountId,
              reference: opts.reference,
              dateISO: opts.dateISO,
              createdBy: opts.createdBy,
            }),
          }
        );
        if (!ok || !data?.ok) {
          return { ok: false, error: data?.error || 'Could not record payment.' };
        }
        await ws.refresh();
        return { ok: true };
      }
      setPurchaseOrders((prev) =>
        prev.map((p) =>
          p.poID === poID
            ? { ...p, supplierPaidNgn: (Number(p.supplierPaidNgn) || 0) + amt }
            : p
        )
      );
      appendMovement({
        type: 'PO_SUPPLIER_PAYMENT',
        ref: poID,
        detail: `${amt}${note ? ` — ${note}` : ''}`,
      });
      return { ok: true };
    },
    [appendMovement, ws]
  );

  const setPurchaseOrderStatus = useCallback(
    async (poID, status) => {
      if (ws?.canMutate) {
        const { ok, data } = await apiFetch(
          `/api/purchase-orders/${encodeURIComponent(poID)}/status`,
          {
            method: 'PATCH',
            body: JSON.stringify({ status }),
          }
        );
        if (!ok || !data?.ok) {
          return { ok: false, error: data?.error || 'Could not update PO status.' };
        }
        await ws.refresh();
        return { ok: true };
      }
      setPurchaseOrders((prev) =>
        prev.map((p) => (p.poID === poID ? { ...p, status } : p))
      );
      appendMovement({ type: 'PO_STATUS', ref: poID, detail: status });
      return { ok: true };
    },
    [appendMovement, ws]
  );

  const attachSupplierInvoice = useCallback(
    async (poID, { invoiceNo, invoiceDateISO, deliveryDateISO }) => {
      if (ws?.canMutate) {
        const { ok, data } = await apiFetch(
          `/api/purchase-orders/${encodeURIComponent(poID)}/invoice`,
          {
            method: 'PATCH',
            body: JSON.stringify({ invoiceNo, invoiceDateISO, deliveryDateISO }),
          }
        );
        if (!ok || !data?.ok) {
          return { ok: false, error: data?.error || 'Could not save invoice.' };
        }
        await ws.refresh();
        return { ok: true };
      }
      setPurchaseOrders((prev) =>
        prev.map((p) =>
          p.poID === poID
            ? {
                ...p,
                invoiceNo: invoiceNo?.trim() ?? '',
                invoiceDateISO: invoiceDateISO ?? '',
                deliveryDateISO: deliveryDateISO ?? '',
              }
            : p
        )
      );
      appendMovement({
        type: 'SUPPLIER_INVOICE',
        ref: poID,
        detail: invoiceNo?.trim() || '—',
      });
      return { ok: true };
    },
    [appendMovement, ws]
  );

  const confirmStoreReceipt = useCallback(
    async (poID, entries, { supplierID: sid, supplierName: sname } = {}, opts = {}) => {
      const po = purchaseOrders.find((p) => p.poID === poID);
      if (!po) return { ok: false, error: 'Purchase order not found.' };
      if (!['On loading', 'In Transit', 'Approved'].includes(po.status)) {
        return {
          ok: false,
          error: 'PO must be on loading, in transit, or approved before store receipt.',
        };
      }
      for (const e of entries) {
        const qty = Number(e.qtyReceived);
        if (Number.isNaN(qty) || qty <= 0) {
          return { ok: false, error: 'Enter a valid quantity received.' };
        }
        const line = findPoLine(po, e);
        if (!line) {
          return {
            ok: false,
            error: e.lineKey
              ? `Line ${e.lineKey} not on this PO.`
              : `Product ${e.productID} not on this PO.`,
          };
        }
        const remaining = line.qtyOrdered - line.qtyReceived;
        const unitLabel = products.find((x) => x.productID === line.productID)?.unit ?? '';
        if (qty > remaining) {
          return {
            ok: false,
            error: `Qty exceeds remaining for ${line.productName} (max ${remaining} ${unitLabel}).`,
          };
        }
      }

      if (ws?.canMutate) {
        const { ok, data } = await apiFetch(
          `/api/purchase-orders/${encodeURIComponent(poID)}/grn`,
          {
            method: 'POST',
            body: JSON.stringify({
              entries,
              supplierID: sid,
              supplierName: sname,
              allowConversionMismatch: Boolean(opts.allowConversionMismatch),
            }),
          }
        );
        if (!ok || !data?.ok) {
          return { ok: false, error: data?.error || 'GRN failed on server.' };
        }
        await ws.refresh();
        return { ok: true, coilNos: data.coilNos || [] };
      }

      /* Offline / demo GRN (no API): synthetic coil IDs (CL-2026-####) from a local counter only.
         The live server assigns coil numbers when POST /api/purchase-orders/:id/grn succeeds — do not expect IDs to match. */
      const coilNumbers = [];

      setCoilLots((prevLots) => {
        let seq = prevLots.length;
        const newLots = entries.map((e) => {
          seq += 1;
          const coilNo =
            e.coilNo?.trim() ||
            `CL-2026-${String(seq).padStart(4, '0')}`;
          coilNumbers.push(coilNo);
          const w = e.weightKg != null && e.weightKg !== '' ? Number(e.weightKg) : null;
          const qty = Number(e.qtyReceived);
          const line = po.lines.find((l) =>
            e.lineKey ? l.lineKey === e.lineKey : l.productID === e.productID
          );
          const initialKg = w != null && !Number.isNaN(w) ? w : qty;
          return {
            coilNo,
            productID: e.productID,
            lineKey: e.lineKey ?? null,
            qtyReceived: qty,
            weightKg: w != null && !Number.isNaN(w) ? w : null,
            colour: line?.color ?? '',
            gaugeLabel: line?.gauge != null && line?.gauge !== '' ? String(line.gauge) : '',
            materialTypeName: '',
            supplierExpectedMeters: line?.metersOffered ?? null,
            supplierConversionKgPerM: line?.conversionKgPerM ?? null,
            qtyRemaining: initialKg,
            qtyReserved: 0,
            currentWeightKg: initialKg,
            currentStatus: 'Available',
            location: e.location?.trim() || null,
            poID,
            supplierID: sid ?? po.supplierID,
            supplierName: sname ?? po.supplierName,
            receivedAtISO: new Date().toISOString().slice(0, 10),
          };
        });
        return [...newLots, ...prevLots];
      });

      setPurchaseOrders((prev) =>
        prev.map((p) => {
          if (p.poID !== poID) return p;
          const nextLines = p.lines.map((l) => {
            const hit = entries.find((x) =>
              x.lineKey ? x.lineKey === l.lineKey : x.productID === l.productID
            );
            if (!hit) return l;
            const q = Number(hit.qtyReceived);
            return { ...l, qtyReceived: l.qtyReceived + q };
          });
          const allIn = nextLines.every(poLineFullyReceived);
          const nextStatus = allIn ? 'Received' : p.status;
          return { ...p, lines: nextLines, status: nextStatus };
        })
      );

      const deltaByProduct = {};
      for (const e of entries) {
        const pid = e.productID;
        deltaByProduct[pid] = (deltaByProduct[pid] || 0) + Number(e.qtyReceived);
      }
      setProducts((prev) =>
        prev.map((p) => {
          const d = deltaByProduct[p.productID];
          if (!d) return p;
          return { ...p, stockLevel: p.stockLevel + d };
        })
      );

      for (let i = 0; i < entries.length; i += 1) {
        const e = entries[i];
        appendMovement({
          type: 'STORE_GRN',
          ref: poID,
          productID: e.productID,
          qty: Number(e.qtyReceived),
          detail: `${coilNumbers[i] || 'GRN'} · ${e.location || 'main store'}`,
        });
      }

      return { ok: true, coilNos: coilNumbers };
    },
    [purchaseOrders, products, appendMovement, ws]
  );

  const adjustStock = useCallback(
    async (productID, type, qty, reasonCode, note, dateISO, opts = {}) => {
      const q = Number(qty);
      if (Number.isNaN(q) || q <= 0) return { ok: false, error: 'Invalid quantity.' };
      if (ws?.canMutate) {
        const { ok, status, data } = await apiFetch('/api/inventory/adjust', {
          method: 'POST',
          body: JSON.stringify({
            productID,
            type,
            qty: q,
            reasonCode,
            note,
            dateISO: dateISO || new Date().toISOString().slice(0, 10),
            acknowledgeCoilSkuDrift: Boolean(opts.acknowledgeCoilSkuDrift),
          }),
        });
        if (status === 409 && data?.code === 'COIL_SKU_DRIFT') {
          return {
            ok: false,
            code: data.code,
            error: data?.error || 'Coil lots exist for this SKU.',
            coilLotCount: data?.coilLotCount,
          };
        }
        if (!ok || !data?.ok) {
          return { ok: false, error: data?.error || 'Adjustment failed on server.' };
        }
        await ws.refresh();
        return { ok: true };
      }
      const delta = type === 'Increase' ? q : -q;
      setProducts((prev) =>
        prev.map((p) => {
          if (p.productID !== productID) return p;
          const next = Math.max(0, p.stockLevel + delta);
          return { ...p, stockLevel: next };
        })
      );
      appendMovement({
        type: 'ADJUSTMENT',
        productID,
        qty: delta,
        detail: `${reasonCode}${note ? ` — ${note}` : ''}`,
        dateISO: dateISO || new Date().toISOString().slice(0, 10),
      });
      return { ok: true };
    },
    [appendMovement, ws]
  );

  const transferToProduction = useCallback(
    async (productID, qty, productionOrderId, dateISO) => {
      const q = Number(qty);
      if (Number.isNaN(q) || q <= 0) return { ok: false, error: 'Invalid quantity.' };
      const p = products.find((x) => x.productID === productID);
      if (!p || p.stockLevel < q) {
        return { ok: false, error: 'Insufficient stock in store.' };
      }
      if (ws?.canMutate) {
        const { ok, data } = await apiFetch('/api/inventory/transfer-to-production', {
          method: 'POST',
          body: JSON.stringify({
            productID,
            qty: q,
            productionOrderId,
            dateISO: dateISO || new Date().toISOString().slice(0, 10),
          }),
        });
        if (!ok || !data?.ok) {
          return { ok: false, error: data?.error || 'Transfer failed on server.' };
        }
        await ws.refresh();
        return { ok: true };
      }
      setProducts((prev) =>
        prev.map((x) =>
          x.productID === productID ? { ...x, stockLevel: x.stockLevel - q } : x
        )
      );
      setWipByProduct((prev) => ({
        ...prev,
        [productID]: (prev[productID] || 0) + q,
      }));
      appendMovement({
        type: 'TRANSFER_TO_PRODUCTION',
        productID,
        qty: q,
        ref: productionOrderId,
        dateISO: dateISO || new Date().toISOString().slice(0, 10),
      });
      return { ok: true };
    },
    [products, appendMovement, ws]
  );

  const receiveFinishedGoods = useCallback(
    async (
      productID,
      qty,
      unitPriceNgn,
      productionOrderId,
      dateISO,
      wipRelease = null,
      extras = {}
    ) => {
      const q = Number(qty);
      if (Number.isNaN(q) || q <= 0) return { ok: false, error: 'Invalid quantity.' };

      const src = wipRelease?.wipSourceProductID?.trim?.() ?? '';
      const wqRaw = wipRelease?.wipQtyReleased;
      if (src) {
        const wq = Number(wqRaw);
        const cur = wipByProduct[src] || 0;
        if (Number.isNaN(wq) || wq <= 0) {
          return {
            ok: false,
            error: 'Enter WIP consumed (same unit as transfer, e.g. kg) for the selected source.',
          };
        }
        if (wq > cur) {
          return {
            ok: false,
            error: `Insufficient WIP on ${src} (${cur} available). Transfer from store first.`,
          };
        }
      }

      if (ws?.canMutate) {
        const { ok, data } = await apiFetch('/api/inventory/finished-goods', {
          method: 'POST',
          body: JSON.stringify({
            productID,
            qty: q,
            unitPriceNgn: Number(unitPriceNgn) || 0,
            productionOrderId,
            dateISO: dateISO || new Date().toISOString().slice(0, 10),
            wipRelease: wipRelease || undefined,
            extras: extras || {},
          }),
        });
        if (!ok || !data?.ok) {
          return { ok: false, error: data?.error || 'Finished goods post failed on server.' };
        }
        await ws.refresh();
        return { ok: true };
      }

      if (src) {
        const wq = Number(wqRaw);
        setWipByProduct((prev) => ({
          ...prev,
          [src]: Math.max(0, (prev[src] || 0) - wq),
        }));
        appendMovement({
          type: 'WIP_CONSUMED',
          productID: src,
          qty: -wq,
          ref: productionOrderId,
          detail: `Released to FG ${productID}`,
          dateISO: dateISO || new Date().toISOString().slice(0, 10),
        });
      }

      setProducts((prev) =>
        prev.map((x) =>
          x.productID === productID ? { ...x, stockLevel: x.stockLevel + q } : x
        )
      );
      const spool =
        extras.spoolKg != null && String(extras.spoolKg).trim() !== ''
          ? Number(extras.spoolKg)
          : null;
      const spoolPart =
        spool != null && !Number.isNaN(spool) && spool >= 0 ? `Spool ${spool} kg` : null;
      appendMovement({
        type: 'FINISHED_GOODS',
        productID,
        qty: q,
        unitPriceNgn: Number(unitPriceNgn) || 0,
        ref: productionOrderId,
        dateISO: dateISO || new Date().toISOString().slice(0, 10),
        ...(spoolPart ? { detail: spoolPart } : {}),
      });
      return { ok: true };
    },
    [appendMovement, wipByProduct, ws]
  );

  const value = useMemo(
    () => ({
      products,
      purchaseOrders,
      movements,
      coilLots,
      wipByProduct,
      getProduct,
      createPurchaseOrder,
      setPurchaseOrderStatus,
      attachSupplierInvoice,
      confirmStoreReceipt,
      linkTransportToPurchaseOrder,
      postPurchaseOrderTransport,
      markPurchaseTransportPaid,
      recordPurchaseSupplierPayment,
      adjustStock,
      transferToProduction,
      receiveFinishedGoods,
    }),
    [
      products,
      purchaseOrders,
      movements,
      coilLots,
      wipByProduct,
      getProduct,
      createPurchaseOrder,
      setPurchaseOrderStatus,
      attachSupplierInvoice,
      confirmStoreReceipt,
      linkTransportToPurchaseOrder,
      postPurchaseOrderTransport,
      markPurchaseTransportPaid,
      recordPurchaseSupplierPayment,
      adjustStock,
      transferToProduction,
      receiveFinishedGoods,
    ]
  );

  return (
    <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) {
    throw new Error('useInventory must be used within InventoryProvider');
  }
  return ctx;
}
