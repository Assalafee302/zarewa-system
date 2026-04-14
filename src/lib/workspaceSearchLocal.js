import { canWorkspaceSearchProducts, canWorkspaceSearchRefunds } from './workspaceSearchClientGates.js';

/**
 * Search cached workspace snapshot (offline / degraded) with permission checks.
 * @param {object} snapshot
 * @param {string} rawQuery
 * @param {(p: string) => boolean} hasPermission
 * @param {number} [limit]
 */
export function searchWorkspaceSnapshot(snapshot, rawQuery, hasPermission, limit = 20) {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (q.length < 2 || !snapshot) return [];

  const perm = (p) => hasPermission('*') || hasPermission(p);
  const results = [];
  const push = (row) => {
    if (results.length < limit) results.push(row);
  };

  if (perm('sales.view') || perm('customers.manage')) {
    for (const c of snapshot.customers || []) {
      if (results.length >= limit) break;
      const blob = `${c.customerID} ${c.name} ${c.phoneNumber || ''} ${c.email || ''} ${c.companyName || ''}`.toLowerCase();
      if (blob.includes(q)) {
        push({
          kind: 'customer',
          id: c.customerID,
          label: c.name,
          sublabel: c.customerID,
          path: `/customers/${encodeURIComponent(c.customerID)}`,
        });
      }
    }
  }

  if (perm('quotations.manage') || perm('sales.view')) {
    for (const row of snapshot.quotations || []) {
      if (results.length >= limit) break;
      const blob = `${row.id} ${row.customer || ''} ${row.customerID || ''} ${row.projectName || ''}`.toLowerCase();
      if (blob.includes(q)) {
        push({
          kind: 'quotation',
          id: row.id,
          label: row.id,
          sublabel: row.customer,
          path: '/sales',
          state: { globalSearchQuery: row.id, focusSalesTab: 'quotations' },
        });
      }
    }
  }

  if (perm('receipts.post') || perm('finance.view') || perm('sales.view')) {
    for (const row of snapshot.receipts || []) {
      if (results.length >= limit) break;
      const blob = `${row.id} ${row.customer || ''} ${row.customerID || ''} ${row.quotationRef || ''}`.toLowerCase();
      if (blob.includes(q)) {
        push({
          kind: 'receipt',
          id: row.id,
          label: row.id,
          sublabel: row.customer,
          path: '/sales',
          state: { globalSearchQuery: row.id, focusSalesTab: 'receipts' },
        });
      }
    }
  }

  if (perm('procurement.view') || perm('purchase_orders.manage')) {
    for (const row of snapshot.purchaseOrders || []) {
      if (results.length >= limit) break;
      const blob = `${row.poID} ${row.supplierName || ''} ${row.supplierID || ''}`.toLowerCase();
      if (blob.includes(q)) {
        push({
          kind: 'purchase_order',
          id: row.poID,
          label: row.poID,
          sublabel: row.supplierName,
          path: '/procurement',
          state: { focusTab: 'purchases' },
        });
      }
    }
    for (const s of snapshot.suppliers || []) {
      if (results.length >= limit) break;
      const p = s.supplierProfile || {};
      const blob = `${s.supplierID} ${s.name || ''} ${s.city || ''} ${p.companyEmail || ''} ${p.phoneMain || ''}`.toLowerCase();
      if (blob.includes(q)) {
        push({
          kind: 'supplier',
          id: s.supplierID,
          label: s.name,
          sublabel: s.supplierID,
          path: `/procurement/suppliers/${encodeURIComponent(s.supplierID)}`,
        });
      }
    }
  }

  if (perm('operations.view') || perm('production.manage')) {
    for (const row of snapshot.cuttingLists || []) {
      if (results.length >= limit) break;
      const blob = `${row.id} ${row.customer || ''} ${row.customerID || ''} ${row.quotationRef || ''}`.toLowerCase();
      if (blob.includes(q)) {
        push({
          kind: 'cutting_list',
          id: row.id,
          label: row.id,
          sublabel: row.customer,
          path: '/operations',
          state: { focusOpsTab: 'production', highlightCuttingListId: row.id },
        });
      }
    }
    for (const lot of snapshot.coilLots || []) {
      if (results.length >= limit) break;
      const blob = `${lot.coilNo || ''} ${lot.productID || ''} ${lot.poID || ''} ${lot.supplierName || ''} ${
        lot.colour || ''
      } ${lot.gaugeLabel || ''}`.toLowerCase();
      if (blob.includes(q)) {
        push({
          kind: 'coil',
          id: lot.coilNo,
          label: lot.coilNo,
          sublabel: `${lot.colour || '—'} · ${lot.gaugeLabel || '—'} · ${lot.productID || ''}`,
          path: `/operations/coils/${encodeURIComponent(lot.coilNo)}`,
        });
      }
    }
  }

  if (canWorkspaceSearchRefunds(hasPermission)) {
    for (const row of snapshot.refunds || []) {
      if (results.length >= limit) break;
      const blob = `${row.refundID || ''} ${row.customer || ''} ${row.customerID || ''} ${row.quotationRef || ''} ${
        row.product || ''
      } ${row.reasonCategory || ''}`.toLowerCase();
      if (blob.includes(q)) {
        push({
          kind: 'refund',
          id: row.refundID,
          label: row.refundID,
          sublabel: row.customer,
          path: '/sales',
          state: { globalSearchQuery: row.refundID, focusSalesTab: 'refund' },
        });
      }
    }
  }

  if (canWorkspaceSearchProducts(hasPermission)) {
    for (const row of snapshot.products || []) {
      if (results.length >= limit) break;
      const blob = `${row.productID || ''} ${row.name || ''}`.toLowerCase();
      if (blob.includes(q)) {
        push({
          kind: 'product',
          id: row.productID,
          label: row.name || row.productID,
          sublabel: row.productID,
          path: '/operations',
          state: { focusOpsTab: 'inventory', opsInventorySkuQuery: row.productID },
        });
      }
    }
  }

  return results;
}
