import { actorName } from './auth.js';
import { DEFAULT_BRANCH_ID } from './branches.js';
import { appendAuditLog, assertPeriodOpen } from './controlOps.js';

function nextLedgerId() {
  return `LE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function nextMvId() {
  return `MV-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function nextTreasuryMovementId() {
  return `TM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function nextCuttingListIdValue() {
  return `CL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function nextProductionJobIdValue() {
  return `PRO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function nextDeliveryIdValue() {
  return `DN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function roundMoney(value) {
  return Math.round(Number(value) || 0);
}

function normalizeCrmTagsJson(row) {
  if (Array.isArray(row?.crmTags)) return JSON.stringify(row.crmTags);
  if (typeof row?.crmTagsJson === 'string' && row.crmTagsJson.trim()) return row.crmTagsJson.trim();
  return '[]';
}

function normalizeIsoTimestamp(value) {
  if (!value) return new Date().toISOString();
  const s = String(value).trim();
  if (!s) return new Date().toISOString();
  if (s.includes('T')) return s;
  return `${s}T12:00:00.000Z`;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {Array<Record<string, unknown>>} planRows
 */
export function insertLedgerRows(db, planRows, branchId = null) {
  const ins = db.prepare(`
    INSERT INTO ledger_entries (
      id, at_iso, type, customer_id, customer_name, amount_ngn, quotation_ref,
      payment_method, bank_reference, purpose, created_by_user_id, created_by_name, note, branch_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const run = db.transaction((rows) => {
    const saved = [];
    for (const r of rows) {
      const id = nextLedgerId();
      const atIso = r.atISO || new Date().toISOString();
      const bid = r.branchId != null && String(r.branchId).trim() ? String(r.branchId).trim() : branchId;
      ins.run(
        id,
        atIso,
        r.type,
        r.customerID,
        r.customerName ?? null,
        r.amountNgn,
        r.quotationRef || null,
        r.paymentMethod ?? null,
        r.bankReference ?? null,
        r.purpose ?? null,
        r.createdByUserId ?? null,
        r.createdByName ?? null,
        r.note ?? null,
        bid ?? null
      );
      saved.push({
        id,
        atISO: atIso,
        type: r.type,
        customerID: r.customerID,
        customerName: r.customerName,
        amountNgn: r.amountNgn,
        quotationRef: r.quotationRef || '',
        paymentMethod: r.paymentMethod,
        bankReference: r.bankReference,
        purpose: r.purpose,
        createdByUserId: r.createdByUserId ?? '',
        createdByName: r.createdByName ?? '',
        note: r.note,
        branchId: bid ?? '',
      });
    }
    return saved;
  });

  return run(planRows);
}

function appendMovementTx(db, entry) {
  const id = nextMvId();
  const atISO = new Date().toISOString().slice(0, 19);
  db.prepare(
    `INSERT INTO stock_movements (id, at_iso, type, ref, product_id, qty, detail, date_iso, unit_price_ngn)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    atISO,
    entry.type,
    entry.ref ?? null,
    entry.productID ?? null,
    entry.qty ?? null,
    entry.detail ?? null,
    entry.dateISO ?? atISO.slice(0, 10),
    entry.unitPriceNgn ?? null
  );
  return { id, atISO, ...entry };
}

function treasuryAccountRow(db, treasuryAccountId) {
  return db.prepare(`SELECT * FROM treasury_accounts WHERE id = ?`).get(treasuryAccountId);
}

function adjustTreasuryBalanceTx(db, treasuryAccountId, deltaNgn) {
  const row = treasuryAccountRow(db, treasuryAccountId);
  if (!row) throw new Error('Treasury account not found.');
  const nextBalance = roundMoney(row.balance) + roundMoney(deltaNgn);
  if (nextBalance < 0) {
    throw new Error(`Insufficient balance in ${row.name}.`);
  }
  db.prepare(`UPDATE treasury_accounts SET balance = ? WHERE id = ?`).run(nextBalance, treasuryAccountId);
  return { ...row, balance: nextBalance };
}

function insertTreasuryMovementTx(db, payload) {
  const treasuryAccountId = Number(payload.treasuryAccountId);
  if (!treasuryAccountId) throw new Error('treasuryAccountId is required.');
  const amountNgn = roundMoney(payload.amountNgn);
  if (amountNgn === 0) throw new Error('Treasury movement amount must be non-zero.');
  const account = adjustTreasuryBalanceTx(db, treasuryAccountId, amountNgn);
  const id = String(payload.id ?? '').trim() || nextTreasuryMovementId();
  const postedAtISO = normalizeIsoTimestamp(payload.postedAtISO);
  db.prepare(
    `INSERT INTO treasury_movements (
      id, posted_at_iso, type, treasury_account_id, amount_ngn, reference,
      counterparty_kind, counterparty_id, counterparty_name, source_kind, source_id,
      note, created_by, reverses_movement_id, batch_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    postedAtISO,
    payload.type,
    treasuryAccountId,
    amountNgn,
    payload.reference ?? null,
    payload.counterpartyKind ?? null,
    payload.counterpartyId ?? null,
    payload.counterpartyName ?? null,
    payload.sourceKind ?? null,
    payload.sourceId ?? null,
    payload.note ?? null,
    payload.createdBy ?? null,
    payload.reversesMovementId ?? null,
    payload.batchId ?? null
  );
  return {
    id,
    postedAtISO,
    treasuryAccountId,
    amountNgn,
    accountName: account.name,
    accountType: account.type,
    reference: payload.reference ?? '',
    sourceKind: payload.sourceKind ?? '',
    sourceId: payload.sourceId ?? '',
    batchId: payload.batchId ?? '',
  };
}

function insertTreasurySplitTx(db, lines, base) {
  const rows = [];
  const batchId = base.batchId || `TB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  for (const line of lines || []) {
    const amountNgn = roundMoney(line.amountNgn);
    if (!amountNgn) continue;
    rows.push(
      insertTreasuryMovementTx(db, {
        ...base,
        treasuryAccountId: line.treasuryAccountId,
        amountNgn,
        reference: line.reference ?? base.reference,
        note: line.note ?? base.note,
        batchId,
      })
    );
  }
  return rows;
}

function reverseTreasurySourceTx(db, sourceKind, sourceId, reversalType, note = '', actor = null) {
  const rows = db
    .prepare(
      `SELECT * FROM treasury_movements
       WHERE source_kind = ? AND source_id = ? AND reverses_movement_id IS NULL
       ORDER BY posted_at_iso, id`
    )
    .all(sourceKind, sourceId);
  const created = [];
  for (const row of rows) {
    const exists = db
      .prepare(`SELECT id FROM treasury_movements WHERE reverses_movement_id = ?`)
      .get(row.id);
    if (exists) continue;
    created.push(
      insertTreasuryMovementTx(db, {
        type: reversalType,
        treasuryAccountId: row.treasury_account_id,
        amountNgn: -roundMoney(row.amount_ngn),
        postedAtISO: new Date().toISOString(),
        reference: row.reference,
        counterpartyKind: row.counterparty_kind,
        counterpartyId: row.counterparty_id,
        counterpartyName: row.counterparty_name,
        sourceKind,
        sourceId,
        note: note || `Reverse ${row.type} ${sourceId}`,
        createdBy: actorName(actor),
        reversesMovementId: row.id,
        batchId: row.batch_id || null,
      })
    );
  }
  return created;
}

export function recordCustomerReceiptCash(db, payload) {
  const total = (payload.paymentLines || []).reduce((sum, line) => sum + roundMoney(line.amountNgn), 0);
  if (total <= 0) return [];
  return insertTreasurySplitTx(db, payload.paymentLines, {
    type: 'RECEIPT_IN',
    postedAtISO: payload.dateISO,
    reference: payload.reference || payload.sourceId,
    counterpartyKind: 'CUSTOMER',
    counterpartyId: payload.customerID,
    counterpartyName: payload.customerName,
    sourceKind: 'LEDGER_RECEIPT',
    sourceId: payload.sourceId,
    note: payload.note || 'Customer receipt',
    createdBy: payload.createdBy ?? 'Sales',
  });
}

export function recordCustomerAdvanceCash(db, payload) {
  const total = (payload.paymentLines || []).reduce((sum, line) => sum + roundMoney(line.amountNgn), 0);
  if (total <= 0) return [];
  return insertTreasurySplitTx(db, payload.paymentLines, {
    type: 'ADVANCE_IN',
    postedAtISO: payload.dateISO,
    reference: payload.reference || payload.sourceId,
    counterpartyKind: 'CUSTOMER',
    counterpartyId: payload.customerID,
    counterpartyName: payload.customerName,
    sourceKind: 'LEDGER_ADVANCE',
    sourceId: payload.sourceId,
    note: payload.note || 'Customer advance',
    createdBy: payload.createdBy ?? 'Sales',
  });
}

export function recordCustomerAdvanceRefundCash(db, payload) {
  const total = (payload.paymentLines || []).reduce((sum, line) => sum + roundMoney(line.amountNgn), 0);
  if (total <= 0) return [];
  return insertTreasurySplitTx(
    db,
    payload.paymentLines.map((line) => ({ ...line, amountNgn: -roundMoney(line.amountNgn) })),
    {
      type: 'ADVANCE_REFUND_OUT',
      postedAtISO: payload.dateISO,
      reference: payload.reference || payload.sourceId,
      counterpartyKind: 'CUSTOMER',
      counterpartyId: payload.customerID,
      counterpartyName: payload.customerName,
      sourceKind: 'LEDGER_ADVANCE_REFUND',
      sourceId: payload.sourceId,
      note: payload.note || 'Advance refunded to customer',
      createdBy: payload.createdBy ?? 'Finance',
    }
  );
}

/** @param {import('better-sqlite3').Database} db */
export function insertCustomer(db, row) {
  const id = row.customerID || `CUS-${Date.now()}`;
  const tagsJson = normalizeCrmTagsJson(row);
  db.prepare(
    `INSERT INTO customers (
      customer_id, name, phone_number, email, address_shipping, address_billing,
      status, tier, payment_terms, created_by, created_at_iso, last_activity_iso,
      company_name, lead_source, preferred_contact, follow_up_iso, crm_tags_json, crm_profile_notes
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    row.name,
    row.phoneNumber ?? '',
    row.email ?? '',
    row.addressShipping ?? '',
    row.addressBilling ?? '',
    row.status ?? 'Active',
    row.tier ?? 'Regular',
    row.paymentTerms ?? 'Due on receipt',
    row.createdBy ?? 'System',
    row.createdAtISO ?? new Date().toISOString().slice(0, 10),
    row.lastActivityISO ?? new Date().toISOString().slice(0, 10),
    String(row.companyName ?? '').trim(),
    String(row.leadSource ?? '').trim(),
    String(row.preferredContact ?? '').trim(),
    String(row.followUpISO ?? '').trim().slice(0, 10),
    tagsJson,
    String(row.crmProfileNotes ?? '').trim()
  );
  return id;
}

/** @param {import('better-sqlite3').Database} db */
export function updateCustomer(db, customerID, row) {
  const cur = db.prepare(`SELECT * FROM customers WHERE customer_id = ?`).get(customerID);
  if (!cur) return { ok: false, error: 'Customer not found.' };
  const name =
    row.name !== undefined ? String(row.name ?? '').trim() : String(cur.name ?? '').trim();
  if (!name) return { ok: false, error: 'Customer name is required.' };
  const pick = (key, col, def = '') =>
    row[key] !== undefined ? String(row[key] ?? '').trim() : String(cur[col] ?? def).trim();
  const tagsJson =
    row.crmTags !== undefined || row.crmTagsJson !== undefined
      ? normalizeCrmTagsJson(row)
      : cur.crm_tags_json || '[]';
  const profileNotes =
    row.crmProfileNotes !== undefined
      ? String(row.crmProfileNotes ?? '').trim()
      : String(cur.crm_profile_notes ?? '').trim();
  const r = db
    .prepare(
      `UPDATE customers
       SET name = ?, phone_number = ?, email = ?, address_shipping = ?, address_billing = ?,
           status = ?, tier = ?, payment_terms = ?, last_activity_iso = ?,
           company_name = ?, lead_source = ?, preferred_contact = ?, follow_up_iso = ?,
           crm_tags_json = ?, crm_profile_notes = ?
       WHERE customer_id = ?`
    )
    .run(
      name,
      String(row.phoneNumber ?? cur.phone_number ?? '').trim(),
      String(row.email ?? cur.email ?? '').trim(),
      String(row.addressShipping ?? cur.address_shipping ?? '').trim(),
      String(row.addressBilling ?? cur.address_billing ?? '').trim(),
      row.status ?? cur.status ?? 'Active',
      row.tier ?? cur.tier ?? 'Regular',
      row.paymentTerms ?? cur.payment_terms ?? 'Due on receipt',
      row.lastActivityISO ?? new Date().toISOString().slice(0, 10),
      pick('companyName', 'company_name'),
      pick('leadSource', 'lead_source'),
      pick('preferredContact', 'preferred_contact'),
      pick('followUpISO', 'follow_up_iso').slice(0, 10),
      tagsJson,
      profileNotes,
      customerID
    );
  if (r.changes === 0) return { ok: false, error: 'Customer not found.' };
  db.prepare(`UPDATE quotations SET customer_name = ? WHERE customer_id = ?`).run(name, customerID);
  db.prepare(`UPDATE sales_receipts SET customer_name = ? WHERE customer_id = ?`).run(name, customerID);
  db.prepare(`UPDATE cutting_lists SET customer_name = ? WHERE customer_id = ?`).run(name, customerID);
  db.prepare(`UPDATE customer_refunds SET customer_name = ? WHERE customer_id = ?`).run(name, customerID);
  db.prepare(`UPDATE ledger_entries SET customer_name = ? WHERE customer_id = ?`).run(name, customerID);
  db.prepare(`UPDATE advance_in_events SET customer_name = ? WHERE customer_id = ?`).run(name, customerID);
  return { ok: true };
}

/** @param {import('better-sqlite3').Database} db */
export function insertPurchaseOrder(db, payload, branchId = DEFAULT_BRANCH_ID) {
  const {
    poID,
    supplierID,
    supplierName,
    orderDateISO,
    expectedDeliveryISO,
    status,
    lines,
  } = payload;
  const insPo = db.prepare(`
    INSERT INTO purchase_orders (
      po_id, supplier_id, supplier_name, order_date_iso, expected_delivery_iso, status,
      invoice_no, invoice_date_iso, delivery_date_iso, transport_agent_id, transport_agent_name,
      transport_paid, transport_paid_at_iso, supplier_paid_ngn, branch_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insL = db.prepare(`
    INSERT INTO purchase_order_lines (
      po_id, line_key, product_id, product_name, color, gauge, meters_offered, conversion_kg_per_m,
      unit_price_per_kg_ngn, unit_price_ngn, qty_ordered, qty_received
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  db.transaction(() => {
    insPo.run(
      poID,
      supplierID,
      supplierName,
      orderDateISO || new Date().toISOString().slice(0, 10),
      expectedDeliveryISO || '',
      status || 'Approved',
      '',
      '',
      '',
      '',
      '',
      0,
      '',
      0,
      String(branchId || DEFAULT_BRANCH_ID).trim()
    );
    for (const l of lines || []) {
      insL.run(
        poID,
        l.lineKey,
        l.productID,
        l.productName,
        l.color ?? '',
        l.gauge ?? '',
        l.metersOffered ?? null,
        l.conversionKgPerM ?? null,
        l.unitPricePerKgNgn ?? l.unitPriceNgn,
        l.unitPriceNgn,
        l.qtyOrdered,
        l.qtyReceived ?? 0
      );
    }
    appendMovementTx(db, {
      type: 'PO_CREATED',
      ref: poID,
      detail: `${supplierName} · ${(lines || []).length} line(s)`,
    });
  })();

  return { ok: true, poID };
}

/** @param {import('better-sqlite3').Database} db */
export function linkTransport(db, poID, transportAgentId, transportAgentName, opts = {}) {
  const u = db.prepare(
    `UPDATE purchase_orders
     SET transport_agent_id = ?, transport_agent_name = ?, transport_reference = ?, transport_note = ?, status = 'On loading'
     WHERE po_id = ? AND status IN ('Approved', 'On loading')`
  );
  const transportReference = String(opts.transportReference ?? '').trim();
  const transportNote = String(opts.transportNote ?? '').trim();
  const r = u.run(transportAgentId, transportAgentName, transportReference || null, transportNote || null, poID);
  if (r.changes === 0) return { ok: false, error: 'PO not found or not ready for transit linking.' };
  appendMovementTx(db, {
    type: 'PO_TRANSPORT_LINK',
    ref: poID,
    detail: `${transportAgentName}${transportReference ? ` · ${transportReference}` : ''}`,
  });
  return { ok: true };
}

/**
 * Move PO to In Transit. Optionally posts a treasury outflow linked to this PO (source PURCHASE_ORDER).
 * @param {import('better-sqlite3').Database} db
 */
export function postPurchaseOrderTransport(db, poID, opts = {}) {
  const row = db.prepare(`SELECT * FROM purchase_orders WHERE po_id = ?`).get(poID);
  if (!row) return { ok: false, error: 'PO not found.' };
  if (row.status !== 'On loading') {
    return { ok: false, error: 'PO must be On loading (transport assigned) before posting to in transit.' };
  }
  if (!String(row.transport_agent_id ?? '').trim()) {
    return { ok: false, error: 'Assign a transport agent first.' };
  }
  const treasuryAccountId = Number(opts.treasuryAccountId);
  const amountNgn = roundMoney(opts.amountNgn);
  const hasTreasury = treasuryAccountId > 0 && amountNgn > 0;
  const dateISO = String(opts.dateISO || '').trim() || new Date().toISOString().slice(0, 10);
  const reference = String(opts.reference ?? row.transport_reference ?? poID).trim() || poID;
  const note = String(opts.note ?? '').trim() || 'PO transport / haulage';
  try {
    db.transaction(() => {
      let movementId = row.transport_treasury_movement_id || null;
      let paidFlag = Number(row.transport_paid) || 0;
      let paidAt = row.transport_paid_at_iso || '';
      let recordedAmount = Number(row.transport_amount_ngn) || 0;
      if (hasTreasury) {
        assertPeriodOpen(db, dateISO, 'Transport payment date');
        const m = insertTreasuryMovementTx(db, {
          type: 'TRANSPORT_PAYMENT',
          treasuryAccountId,
          amountNgn: -amountNgn,
          postedAtISO: opts.postedAtISO || new Date().toISOString(),
          reference,
          counterpartyKind: 'TRANSPORT_AGENT',
          counterpartyId: String(row.transport_agent_id ?? '').trim() || null,
          counterpartyName: String(row.transport_agent_name ?? '').trim() || null,
          sourceKind: 'PURCHASE_ORDER',
          sourceId: poID,
          note,
          createdBy: opts.createdBy ?? 'Procurement',
        });
        movementId = m.id;
        paidFlag = 1;
        paidAt = new Date().toISOString();
        recordedAmount = amountNgn;
      }
      db.prepare(
        `UPDATE purchase_orders SET
          status = 'In Transit',
          transport_treasury_movement_id = ?,
          transport_amount_ngn = ?,
          transport_paid = ?,
          transport_paid_at_iso = ?
         WHERE po_id = ? AND status = 'On loading'`
      ).run(movementId, recordedAmount, paidFlag, paidAt || null, poID);
      appendMovementTx(db, {
        type: 'PO_TRANSPORT_POSTED',
        ref: poID,
        detail: hasTreasury ? `${reference} · treasury` : `${reference} · in transit`,
      });
      appendAuditLog(db, {
        actor: opts.actor,
        action: 'purchase_order.post_transport',
        entityKind: 'purchase_order',
        entityId: poID,
        note: hasTreasury ? 'Transport posted with treasury movement' : 'Marked in transit (no treasury line)',
        details: { treasuryMovementId: movementId, amountNgn: hasTreasury ? amountNgn : 0 },
      });
    })();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export function markTransportPaid(db, poID) {
  const u = db.prepare(
    `UPDATE purchase_orders SET transport_paid = 1, transport_paid_at_iso = ?
     WHERE po_id = ? AND status = 'In Transit' AND COALESCE(transport_paid, 0) = 0`
  );
  const r = u.run(new Date().toISOString(), poID);
  if (r.changes === 0) return { ok: false, error: 'PO not in transit or haulage already marked paid.' };
  appendMovementTx(db, { type: 'PO_TRANSPORT_PAID', ref: poID, detail: 'Haulage settled (no treasury line)' });
  return { ok: true };
}

export function recordSupplierPayment(db, poID, amountNgn, note, opts = {}) {
  const amt = Number(amountNgn);
  if (Number.isNaN(amt) || amt <= 0) return { ok: false, error: 'Invalid amount.' };
  const row = db.prepare(`SELECT * FROM purchase_orders WHERE po_id = ?`).get(poID);
  if (!row) return { ok: false, error: 'PO not found.' };
  try {
    assertPeriodOpen(db, opts.dateISO || new Date().toISOString().slice(0, 10), 'Supplier payment date');
    db.transaction(() => {
      db.prepare(`UPDATE purchase_orders SET supplier_paid_ngn = ? WHERE po_id = ?`).run(
        (row.supplier_paid_ngn || 0) + amt,
        poID
      );
      appendMovementTx(db, {
        type: 'PO_SUPPLIER_PAYMENT',
        ref: poID,
        detail: `${amt}${note ? ` — ${note}` : ''}`,
      });
      if (opts.treasuryAccountId) {
        insertTreasuryMovementTx(db, {
          type: 'SUPPLIER_PAYMENT',
          treasuryAccountId: opts.treasuryAccountId,
          amountNgn: -amt,
          postedAtISO: opts.dateISO,
          reference: opts.reference || note || poID,
          counterpartyKind: 'SUPPLIER',
          counterpartyId: row.supplier_id,
          counterpartyName: row.supplier_name,
          sourceKind: 'PURCHASE_ORDER',
          sourceId: poID,
          note: note || 'Supplier settlement',
          createdBy: opts.createdBy ?? 'Procurement',
        });
      }
      appendAuditLog(db, {
        actor: opts.actor,
        action: 'purchase_order.pay_supplier',
        entityKind: 'purchase_order',
        entityId: poID,
        note: note || 'Supplier settlement recorded',
        details: { amountNgn: amt, treasuryAccountId: opts.treasuryAccountId ?? null },
      });
    })();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export function setPoStatus(db, poID, status) {
  const r = db.prepare(`UPDATE purchase_orders SET status = ? WHERE po_id = ?`).run(status, poID);
  if (r.changes === 0) return { ok: false, error: 'PO not found.' };
  appendMovementTx(db, { type: 'PO_STATUS', ref: poID, detail: status });
  return { ok: true };
}

export function attachSupplierInvoice(db, poID, invoiceNo, invoiceDateISO, deliveryDateISO) {
  db.prepare(
    `UPDATE purchase_orders SET invoice_no = ?, invoice_date_iso = ?, delivery_date_iso = ? WHERE po_id = ?`
  ).run(invoiceNo?.trim() ?? '', invoiceDateISO ?? '', deliveryDateISO ?? '', poID);
  appendMovementTx(db, {
    type: 'SUPPLIER_INVOICE',
    ref: poID,
    detail: invoiceNo?.trim() || '—',
  });
  return { ok: true };
}

export function confirmDelivery(db, deliveryId, payload = {}) {
  const row = db.prepare(`SELECT * FROM deliveries WHERE id = ?`).get(deliveryId);
  if (!row) return { ok: false, error: 'Delivery not found.' };
  const status = payload.status?.trim() || 'Delivered';
  const deliveredDateISO = payload.deliveredDateISO || new Date().toISOString().slice(0, 10);
  const podNotes = payload.podNotes?.trim?.() ?? '';
  const courierConfirmed = payload.courierConfirmed ? 1 : 0;
  const customerSignedPod = payload.customerSignedPod ? 1 : 0;
  try {
    db.transaction(() => {
      const lines = db.prepare(`SELECT * FROM delivery_lines WHERE delivery_id = ? ORDER BY sort_order`).all(deliveryId);
      if (status === 'Delivered' && !row.fulfillment_posted) {
        for (const line of lines) {
          const qty = Number(line.qty) || 0;
          if (qty <= 0) continue;
          const product = db
            .prepare(`SELECT stock_level, name FROM products WHERE product_id = ?`)
            .get(line.product_id);
          if (!product) throw new Error(`Delivery line product ${line.product_id} not found.`);
          if (Number(product.stock_level) < qty) {
            throw new Error(`Insufficient stock for ${product.name || line.product_id}.`);
          }
        }
        for (const line of lines) {
          const qty = Number(line.qty) || 0;
          if (qty <= 0) continue;
          db.prepare(`UPDATE products SET stock_level = stock_level - ? WHERE product_id = ?`).run(
            qty,
            line.product_id
          );
          appendMovementTx(db, {
            type: 'CUSTOMER_DELIVERY',
            ref: deliveryId,
            productID: line.product_id,
            qty: -qty,
            detail: `${row.customer_name || 'Customer'} · ${line.product_name || line.product_id}`,
            dateISO: deliveredDateISO,
          });
        }
      }
      db.prepare(
        `UPDATE deliveries
         SET status = ?, delivered_date_iso = ?, pod_notes = ?, courier_confirmed = ?, customer_signed_pod = ?,
             fulfillment_posted = CASE
               WHEN ? = 'Delivered' AND fulfillment_posted = 0 THEN CASE
                 WHEN EXISTS (SELECT 1 FROM delivery_lines WHERE delivery_id = ?) THEN 1
                 ELSE fulfillment_posted
               END
               ELSE fulfillment_posted
             END
         WHERE id = ?`
      ).run(
        status,
        deliveredDateISO,
        podNotes,
        courierConfirmed,
        customerSignedPod,
        status,
        deliveryId,
        deliveryId
      );
    })();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function findPoLine(poRows, entry) {
  if (entry.lineKey) return poRows.find((l) => l.line_key === entry.lineKey);
  return poRows.find((l) => l.product_id === entry.productID);
}

function conversionRelDiff(a, b) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return 0;
  return Math.abs(x - y) / Math.max(x, y);
}

/** @param {import('better-sqlite3').Database} db */
export function confirmGrn(
  db,
  poID,
  entries,
  supplierID,
  supplierName,
  branchFallback = DEFAULT_BRANCH_ID,
  opts = {}
) {
  const po = db.prepare(`SELECT * FROM purchase_orders WHERE po_id = ?`).get(poID);
  if (!po) return { ok: false, error: 'Purchase order not found.' };
  if (!['On loading', 'In Transit', 'Approved'].includes(po.status)) {
    return { ok: false, error: 'PO not in receivable status.' };
  }

  const lines = db.prepare(`SELECT * FROM purchase_order_lines WHERE po_id = ?`).all(poID);
  const products = db.prepare(`SELECT * FROM products`).all();
  const sid = supplierID ?? po.supplier_id;
  const sname = supplierName ?? po.supplier_name;

  for (const e of entries) {
    const qty = Number(e.qtyReceived);
    if (Number.isNaN(qty) || qty <= 0) return { ok: false, error: 'Enter a valid quantity received.' };
    const line = findPoLine(lines, e);
    if (!line) return { ok: false, error: 'Line not on this PO.' };
    const remaining = line.qty_ordered - line.qty_received;
    if (qty > remaining) return { ok: false, error: `Qty exceeds remaining for line ${line.line_key}.` };
  }

  const allowConvSkip = Boolean(opts.allowConversionMismatch);
  if (!allowConvSkip) {
    for (const e of entries) {
      const line = findPoLine(lines, e);
      const lc = Number(line.conversion_kg_per_m);
      const ec =
        e.supplierConversionKgPerM != null && e.supplierConversionKgPerM !== ''
          ? Number(e.supplierConversionKgPerM)
          : null;
      if (
        ec != null &&
        Number.isFinite(ec) &&
        lc > 0 &&
        Number.isFinite(lc) &&
        conversionRelDiff(lc, ec) > 0.05
      ) {
        return {
          ok: false,
          error: `GRN conversion kg/m (${ec}) does not align with PO line (${lc}). Fix the entry or use an override with purchase_orders.manage.`,
        };
      }
      const sm =
        e.supplierExpectedMeters != null && e.supplierExpectedMeters !== ''
          ? Number(e.supplierExpectedMeters)
          : line.meters_offered != null
            ? Number(line.meters_offered)
            : null;
      const w = e.weightKg != null && e.weightKg !== '' ? Number(e.weightKg) : null;
      const conv = ec != null && Number.isFinite(ec) && ec > 0 ? ec : lc;
      if (
        sm != null &&
        w != null &&
        conv > 0 &&
        Number.isFinite(sm) &&
        Number.isFinite(w) &&
        conversionRelDiff(w, sm * conv) > 0.1
      ) {
        return {
          ok: false,
          error:
            'GRN weight vs metres×conversion check failed. Confirm supplier metres, conversion, and weighbridge weight, or use an override.',
        };
      }
    }
  }

  const coilBranch =
    String(po.branch_id || '').trim() || String(branchFallback || DEFAULT_BRANCH_ID).trim();

  const insLot = db.prepare(`
    INSERT INTO coil_lots (
      coil_no, product_id, line_key, qty_received, weight_kg, colour, gauge_label, material_type_name,
      supplier_expected_meters, supplier_conversion_kg_per_m, qty_remaining, qty_reserved, current_weight_kg,
      current_status, location, po_id, supplier_id, supplier_name, received_at_iso, branch_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const updLine = db.prepare(
    `UPDATE purchase_order_lines SET qty_received = qty_received + ? WHERE po_id = ? AND line_key = ?`
  );
  const updProd = db.prepare(`UPDATE products SET stock_level = stock_level + ? WHERE product_id = ?`);
  const existingLots = db.prepare(`SELECT COUNT(*) AS c FROM coil_lots`).get().c;

  const coilNumbers = [];

  db.transaction(() => {
    let seq = existingLots;
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i];
      const line = findPoLine(lines, e);
      const qty = Number(e.qtyReceived);
      seq += 1;
      const coilNo =
        e.coilNo?.trim() || `CL-2026-${String(seq).padStart(4, '0')}`;
      coilNumbers.push(coilNo);
      const w = e.weightKg != null && e.weightKg !== '' ? Number(e.weightKg) : null;
      const product = products.find((row) => row.product_id === e.productID);
      const effectiveWeightKg = w != null && !Number.isNaN(w) ? w : qty;
      const supplierExpectedMeters =
        e.supplierExpectedMeters != null && e.supplierExpectedMeters !== ''
          ? Number(e.supplierExpectedMeters)
          : line.meters_offered;
      const supplierConversionKgPerM =
        e.supplierConversionKgPerM != null && e.supplierConversionKgPerM !== ''
          ? Number(e.supplierConversionKgPerM)
          : line.conversion_kg_per_m;
      insLot.run(
        coilNo,
        e.productID,
        line.line_key,
        qty,
        w != null && !Number.isNaN(w) ? w : null,
        String(e.colour ?? line.color ?? '').trim() || null,
        String(e.gaugeLabel ?? line.gauge ?? '').trim() || null,
        String(e.materialTypeName ?? product?.material_type ?? '').trim() || null,
        supplierExpectedMeters != null && !Number.isNaN(supplierExpectedMeters) ? supplierExpectedMeters : null,
        supplierConversionKgPerM != null && !Number.isNaN(supplierConversionKgPerM) ? supplierConversionKgPerM : null,
        effectiveWeightKg,
        0,
        effectiveWeightKg,
        'Available',
        e.location?.trim() || null,
        poID,
        sid,
        sname,
        new Date().toISOString().slice(0, 10),
        coilBranch
      );
      updLine.run(qty, poID, line.line_key);
      appendMovementTx(db, {
        type: 'STORE_GRN',
        ref: poID,
        productID: e.productID,
        qty,
        detail: `${coilNo} · ${e.location || 'main store'}`,
      });
    }

    const refreshed = db.prepare(`SELECT * FROM purchase_order_lines WHERE po_id = ?`).all(poID);
    const allIn = refreshed.every((l) => l.qty_received >= l.qty_ordered);
    const nextStatus = allIn ? 'Received' : po.status;
    db.prepare(`UPDATE purchase_orders SET status = ? WHERE po_id = ?`).run(nextStatus, poID);

    const deltaByProduct = {};
    for (const e of entries) {
      deltaByProduct[e.productID] = (deltaByProduct[e.productID] || 0) + Number(e.qtyReceived);
    }
    for (const pid of Object.keys(deltaByProduct)) {
      if (products.some((p) => p.product_id === pid)) {
        updProd.run(deltaByProduct[pid], pid);
      }
    }
  })();

  return { ok: true, coilNos: coilNumbers };
}

export function adjustStock(db, productID, type, qty, reasonCode, note, dateISO) {
  const q = Number(qty);
  if (Number.isNaN(q) || q <= 0) return { ok: false, error: 'Invalid quantity.' };
  const delta = type === 'Increase' ? q : -q;
  const p = db.prepare(`SELECT stock_level FROM products WHERE product_id = ?`).get(productID);
  if (!p) return { ok: false, error: 'Product not found.' };
  const next = Math.max(0, p.stock_level + delta);
  db.prepare(`UPDATE products SET stock_level = ? WHERE product_id = ?`).run(next, productID);
  appendMovementTx(db, {
    type: 'ADJUSTMENT',
    productID,
    qty: delta,
    detail: `${reasonCode}${note ? ` — ${note}` : ''}`,
    dateISO: dateISO || new Date().toISOString().slice(0, 10),
  });
  return { ok: true };
}

export function transferToProduction(db, productID, qty, productionOrderId, dateISO) {
  const q = Number(qty);
  if (Number.isNaN(q) || q <= 0) return { ok: false, error: 'Invalid quantity.' };
  const p = db.prepare(`SELECT stock_level FROM products WHERE product_id = ?`).get(productID);
  if (!p || p.stock_level < q) return { ok: false, error: 'Insufficient stock in store.' };
  db.prepare(`UPDATE products SET stock_level = stock_level - ? WHERE product_id = ?`).run(q, productID);
  db.prepare(
    `INSERT INTO wip_balances (product_id, qty) VALUES (?, ?)
     ON CONFLICT(product_id) DO UPDATE SET qty = wip_balances.qty + excluded.qty`
  ).run(productID, q);
  appendMovementTx(db, {
    type: 'TRANSFER_TO_PRODUCTION',
    productID,
    qty: q,
    ref: productionOrderId,
    dateISO: dateISO || new Date().toISOString().slice(0, 10),
  });
  return { ok: true };
}

export function receiveFinishedGoods(
  db,
  productID,
  qty,
  unitPriceNgn,
  productionOrderId,
  dateISO,
  wipRelease,
  extras
) {
  const q = Number(qty);
  if (Number.isNaN(q) || q <= 0) return { ok: false, error: 'Invalid quantity.' };

  const src = wipRelease?.wipSourceProductID?.trim?.() ?? '';
  const wqRaw = wipRelease?.wipQtyReleased;

  if (src) {
    const wq = Number(wqRaw);
    const wrow = db.prepare(`SELECT qty FROM wip_balances WHERE product_id = ?`).get(src);
    const cur = wrow?.qty || 0;
    if (Number.isNaN(wq) || wq <= 0) {
      return { ok: false, error: 'Enter WIP consumed for the selected source.' };
    }
    if (wq > cur) return { ok: false, error: `Insufficient WIP on ${src}.` };
    db.prepare(`UPDATE wip_balances SET qty = qty - ? WHERE product_id = ?`).run(wq, src);
    appendMovementTx(db, {
      type: 'WIP_CONSUMED',
      productID: src,
      qty: -wq,
      ref: productionOrderId,
      detail: `Released to FG ${productID}`,
      dateISO: dateISO || new Date().toISOString().slice(0, 10),
    });
  }

  db.prepare(`UPDATE products SET stock_level = stock_level + ? WHERE product_id = ?`).run(q, productID);

  const spool =
    extras?.spoolKg != null && String(extras.spoolKg).trim() !== ''
      ? Number(extras.spoolKg)
      : null;
  const spoolPart =
    spool != null && !Number.isNaN(spool) && spool >= 0 ? `Spool ${spool} kg` : null;

  appendMovementTx(db, {
    type: 'FINISHED_GOODS',
    productID,
    qty: q,
    unitPriceNgn: Number(unitPriceNgn) || 0,
    ref: productionOrderId,
    dateISO: dateISO || new Date().toISOString().slice(0, 10),
    detail: spoolPart || undefined,
  });
  return { ok: true };
}

export function addCoilRequest(db, payload) {
  const id = `CR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(
    `INSERT INTO coil_requests (id, status, created_at_iso, gauge, colour, material_type, requested_kg, note)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(
    id,
    'pending',
    new Date().toISOString(),
    payload.gauge ?? '',
    payload.colour ?? '',
    payload.materialType ?? '',
    Number(payload.requestedKg) || 0,
    payload.note ?? ''
  );
  return { ok: true, row: { id, status: 'pending', createdAtISO: new Date().toISOString(), ...payload } };
}

export function acknowledgeCoilRequest(db, id) {
  const r = db
    .prepare(
      `UPDATE coil_requests SET status = 'acknowledged', acknowledged_at_iso = ? WHERE id = ? AND status = 'pending'`
    )
    .run(new Date().toISOString(), id);
  if (r.changes === 0) return { ok: false, error: 'Request not found or not pending.' };
  return { ok: true };
}

export function replaceTreasuryAccounts(db, accounts) {
  const ins = db.prepare(
    `INSERT INTO treasury_accounts (id, name, bank_name, balance, type, acc_no)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       bank_name = excluded.bank_name,
       balance = excluded.balance,
       type = excluded.type,
       acc_no = excluded.acc_no`
  );
  db.transaction(() => {
    for (const a of accounts) {
      ins.run(a.id, a.name, a.bankName ?? '', Number(a.balance) || 0, a.type ?? 'Bank', a.accNo ?? 'N/A');
    }
  })();
  return { ok: true };
}

export function nextPoIdFromDb(db) {
  const rows = db.prepare(`SELECT po_id FROM purchase_orders`).all();
  const nums = rows
    .map((r) => parseInt(String(r.po_id).replace(/\D/g, ''), 10))
    .filter((n) => !Number.isNaN(n));
  const n = nums.length ? Math.max(...nums) + 1 : 1;
  return `PO-2026-${String(n).padStart(3, '0')}`;
}

export function nextSupplierIdFromDb(db) {
  const rows = db.prepare(`SELECT supplier_id FROM suppliers`).all();
  const nums = rows
    .map((r) => parseInt(String(r.supplier_id).replace(/\D/g, ''), 10))
    .filter((n) => !Number.isNaN(n));
  const n = nums.length ? Math.max(...nums) + 1 : 1;
  return `SUP-${String(n).padStart(3, '0')}`;
}

/** @param {import('better-sqlite3').Database} db */
export function insertSupplier(db, row) {
  const name = String(row.name ?? '').trim();
  if (!name) throw new Error('Supplier name is required.');
  const id = String(row.supplierID ?? '').trim() || nextSupplierIdFromDb(db);
  db.prepare(
    `INSERT INTO suppliers (supplier_id, name, city, payment_terms, quality_score, notes) VALUES (?,?,?,?,?,?)`
  ).run(
    id,
    name,
    String(row.city ?? '').trim() || '',
    row.paymentTerms ?? 'Credit',
    Number(row.qualityScore) || 80,
    String(row.notes ?? '').trim() || ''
  );
  return id;
}

export function updateSupplier(db, supplierID, row) {
  const name = String(row.name ?? '').trim();
  if (!name) return { ok: false, error: 'Supplier name is required.' };
  const r = db
    .prepare(
      `UPDATE suppliers SET name = ?, city = ?, payment_terms = ?, quality_score = ?, notes = ? WHERE supplier_id = ?`
    )
    .run(
      name,
      String(row.city ?? '').trim() || '',
      row.paymentTerms ?? 'Credit',
      Number(row.qualityScore) || 80,
      String(row.notes ?? '').trim() || '',
      supplierID
    );
  if (r.changes === 0) return { ok: false, error: 'Supplier not found.' };
  db.prepare(`UPDATE purchase_orders SET supplier_name = ? WHERE supplier_id = ?`).run(name, supplierID);
  return { ok: true };
}

export function deleteSupplier(db, supplierID) {
  const c = db.prepare(`SELECT COUNT(*) AS c FROM purchase_orders WHERE supplier_id = ?`).get(supplierID).c;
  if (c > 0) {
    return {
      ok: false,
      error: `Cannot delete supplier: ${c} purchase order(s) still reference this supplier.`,
    };
  }
  const r = db.prepare(`DELETE FROM suppliers WHERE supplier_id = ?`).run(supplierID);
  if (r.changes === 0) return { ok: false, error: 'Supplier not found.' };
  return { ok: true };
}

export function nextTransportAgentIdFromDb(db) {
  const rows = db.prepare(`SELECT id FROM transport_agents`).all();
  const nums = rows
    .map((r) => parseInt(String(r.id).replace(/\D/g, ''), 10))
    .filter((n) => !Number.isNaN(n));
  const n = nums.length ? Math.max(...nums) + 1 : 1;
  return `AG-${String(n).padStart(3, '0')}`;
}

export function insertTransportAgent(db, row) {
  const name = String(row.name ?? '').trim();
  if (!name) throw new Error('Agent name is required.');
  const id = String(row.id ?? '').trim() || nextTransportAgentIdFromDb(db);
  db.prepare(`INSERT INTO transport_agents (id, name, region, phone) VALUES (?,?,?,?)`).run(
    id,
    name,
    String(row.region ?? '').trim() || '',
    String(row.phone ?? '').trim() || ''
  );
  return id;
}

export function updateTransportAgent(db, id, row) {
  const name = String(row.name ?? '').trim();
  if (!name) return { ok: false, error: 'Agent name is required.' };
  const r = db
    .prepare(`UPDATE transport_agents SET name = ?, region = ?, phone = ? WHERE id = ?`)
    .run(
      name,
      String(row.region ?? '').trim() || '',
      String(row.phone ?? '').trim() || '',
      id
    );
  if (r.changes === 0) return { ok: false, error: 'Transport agent not found.' };
  db.prepare(`UPDATE purchase_orders SET transport_agent_name = ? WHERE transport_agent_id = ?`).run(
    name,
    id
  );
  return { ok: true };
}

export function deleteTransportAgent(db, id) {
  const r = db.prepare(`DELETE FROM transport_agents WHERE id = ?`).run(id);
  if (r.changes === 0) return { ok: false, error: 'Transport agent not found.' };
  return { ok: true };
}

export function replaceExpenses(db, list) {
  db.prepare(`DELETE FROM expenses`).run();
  const ins = db.prepare(
    `INSERT INTO expenses (expense_id, expense_type, amount_ngn, date, category, payment_method, reference) VALUES (?,?,?,?,?,?,?)`
  );
  for (const e of list || []) {
    ins.run(
      e.expenseID,
      e.expenseType,
      e.amountNgn,
      e.date,
      e.category,
      e.paymentMethod,
      e.reference
    );
  }
}

export function replacePaymentRequests(db, list) {
  db.prepare(`DELETE FROM payment_requests`).run();
  const ins = db.prepare(
    `INSERT INTO payment_requests (
      request_id, expense_id, amount_requested_ngn, request_date, approval_status, description,
      approved_by, approved_at_iso, approval_note
    ) VALUES (?,?,?,?,?,?,?,?,?)`
  );
  for (const p of list || []) {
    ins.run(
      p.requestID,
      p.expenseID,
      p.amountRequestedNgn,
      p.requestDate,
      p.approvalStatus,
      p.description,
      p.approvedBy ?? '',
      p.approvedAtISO ?? '',
      p.approvalNote ?? ''
    );
  }
}

export function replaceAccountsPayable(db, list) {
  db.prepare(`DELETE FROM accounts_payable`).run();
  const ins = db.prepare(
    `INSERT INTO accounts_payable (ap_id, supplier_name, po_ref, invoice_ref, amount_ngn, paid_ngn, due_date_iso, payment_method) VALUES (?,?,?,?,?,?,?,?)`
  );
  for (const a of list || []) {
    ins.run(
      a.apID,
      a.supplierName,
      a.poRef,
      a.invoiceRef,
      a.amountNgn,
      a.paidNgn,
      a.dueDateISO,
      a.paymentMethod ?? null
    );
  }
}

export function replaceBankReconciliation(db, list) {
  db.prepare(`DELETE FROM bank_reconciliation_lines`).run();
  const ins = db.prepare(
    `INSERT INTO bank_reconciliation_lines (id, bank_date_iso, description, amount_ngn, system_match, status) VALUES (?,?,?,?,?,?)`
  );
  for (const b of list || []) {
    ins.run(b.id, b.bankDateISO, b.description, b.amountNgn, b.systemMatch, b.status);
  }
}

/** @param {import('better-sqlite3').Database} db */
export function updateBankReconciliationLine(db, lineId, payload, actor) {
  const id = String(lineId ?? '').trim();
  if (!id) return { ok: false, error: 'Line id is required.' };
  const row = db.prepare(`SELECT * FROM bank_reconciliation_lines WHERE id = ?`).get(id);
  if (!row) return { ok: false, error: 'Bank line not found.' };
  const systemMatch =
    payload.systemMatch !== undefined ? String(payload.systemMatch ?? '').trim() : row.system_match;
  const status = payload.status !== undefined ? String(payload.status ?? '').trim() : row.status;
  if (!['Matched', 'Review', 'Excluded'].includes(status)) {
    return { ok: false, error: 'Status must be Matched, Review, or Excluded.' };
  }
  db.prepare(
    `UPDATE bank_reconciliation_lines SET system_match = ?, status = ? WHERE id = ?`
  ).run(systemMatch || null, status, id);
  appendAuditLog(db, {
    actor,
    action: 'bank_reconciliation.update',
    entityKind: 'bank_reconciliation_line',
    entityId: id,
    note: `Bank line ${status}${systemMatch ? `: ${systemMatch}` : ''}`,
    status: 'success',
    details: { systemMatch, status },
  });
  return { ok: true };
}

/** @param {import('better-sqlite3').Database} db */
export function insertCustomerCrmInteraction(db, customerID, payload, actor) {
  const cid = String(customerID ?? '').trim();
  if (!cid) return { ok: false, error: 'customerID is required.' };
  const cust = db.prepare(`SELECT customer_id FROM customers WHERE customer_id = ?`).get(cid);
  if (!cust) return { ok: false, error: 'Customer not found.' };
  const detail = String(payload.detail ?? '').trim();
  if (!detail) return { ok: false, error: 'Interaction detail is required.' };
  const kind = String(payload.kind ?? 'note').trim() || 'note';
  const title = String(payload.title ?? '').trim();
  const atIso = String(payload.atIso ?? '').trim() || new Date().toISOString();
  const id = `CRM-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const createdByName = actor?.displayName || actor?.username || '';
  db.prepare(
    `INSERT INTO customer_crm_interactions (id, customer_id, at_iso, kind, title, detail, created_by_name)
     VALUES (?,?,?,?,?,?,?)`
  ).run(id, cid, atIso, kind, title || null, detail, createdByName || null);
  appendAuditLog(db, {
    actor,
    action: 'crm.interaction.create',
    entityKind: 'customer',
    entityId: cid,
    note: title || kind,
    status: 'success',
    details: { interactionId: id, kind },
  });
  return { ok: true, interaction: { id, customerID: cid, atIso, kind, title, detail, createdByName } };
}

function shortDateFromIso(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const [, m, d] = s.split('-');
  if (!d || !m) return '—';
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    Number(m) - 1
  ];
  return `${d} ${mo}`;
}

/** Mirror RECEIPT ledger row into sales_receipts (same id as ledger entry). */
export function upsertSalesReceiptForLedgerEntry(db, entry, quotationRow, branchId = null) {
  if (entry.type !== 'RECEIPT' || !quotationRow?.id) return;
  const display = `₦${(Number(entry.amountNgn) || 0).toLocaleString('en-NG')}`;
  const dateIso = String(entry.atISO || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const bid =
    branchId != null && String(branchId).trim()
      ? String(branchId).trim()
      : String(entry.branchId || quotationRow.branchId || '').trim() || null;
  db.prepare(
    `
    INSERT INTO sales_receipts (
      id, customer_id, customer_name, quotation_ref, date_label, date_iso, amount_display, amount_ngn, method, status, handled_by, ledger_entry_id, branch_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      customer_id = excluded.customer_id,
      customer_name = excluded.customer_name,
      quotation_ref = excluded.quotation_ref,
      date_label = excluded.date_label,
      date_iso = excluded.date_iso,
      amount_display = excluded.amount_display,
      amount_ngn = excluded.amount_ngn,
      method = excluded.method,
      status = excluded.status,
      handled_by = excluded.handled_by,
      ledger_entry_id = excluded.ledger_entry_id,
      branch_id = excluded.branch_id
  `
  ).run(
    entry.id,
    entry.customerID,
    entry.customerName ?? quotationRow.customer ?? quotationRow.customer_name,
    quotationRow.id,
    shortDateFromIso(entry.atISO),
    dateIso,
    display,
    entry.amountNgn,
    entry.paymentMethod ?? '—',
    'Posted',
    '—',
    entry.id,
    bid
  );
}

/** Mirror ADVANCE_IN ledger row for reporting / joins (ledger remains source of truth). */
export function insertAdvanceInEvent(db, entry) {
  if (entry.type !== 'ADVANCE_IN') return;
  db.prepare(
    `
    INSERT OR REPLACE INTO advance_in_events (
      ledger_entry_id, customer_id, customer_name, amount_ngn, at_iso, payment_method, bank_reference, purpose
    ) VALUES (?,?,?,?,?,?,?,?)
  `
  ).run(
    entry.id,
    entry.customerID,
    entry.customerName ?? null,
    entry.amountNgn,
    entry.atISO,
    entry.paymentMethod ?? null,
    entry.bankReference ?? null,
    entry.purpose ?? null
  );
}

function reversalMarker(targetEntryId) {
  return `REVERSAL_OF:${targetEntryId}`;
}

function parseReversalTarget(value) {
  const m = String(value ?? '').match(/REVERSAL_OF:([A-Za-z0-9-]+)/);
  return m ? m[1] : '';
}

export function reversedEntryIdsFromRows(rows) {
  const set = new Set();
  for (const row of rows || []) {
    const id = parseReversalTarget(row.bank_reference ?? row.bankReference ?? row.note);
    if (id) set.add(id);
  }
  return set;
}

/** Reverse a posted receipt by creating a compensating ledger row and marking the mirror row reversed. */
export function reverseReceiptEntry(db, entryId, note = '', actor = null) {
  const target = db.prepare(`SELECT * FROM ledger_entries WHERE id = ? AND type = 'RECEIPT'`).get(entryId);
  if (!target) return { ok: false, error: 'Receipt entry not found.' };

  const existing = db
    .prepare(`SELECT id FROM ledger_entries WHERE type = 'RECEIPT_REVERSAL' AND (bank_reference = ? OR note LIKE ?)`)
    .get(reversalMarker(entryId), `%${entryId}%`);
  if (existing) return { ok: false, error: 'Receipt already reversed.' };

  const reversalNote = note || `Reverse receipt ${entryId}`;
  const reversalDateISO = new Date().toISOString().slice(0, 10);
  try {
    assertPeriodOpen(db, reversalDateISO, 'Receipt reversal date');
    let reversal;
    db.transaction(() => {
      reversal = insertLedgerRows(
        db,
        [
          {
            type: 'RECEIPT_REVERSAL',
            customerID: target.customer_id,
            customerName: target.customer_name,
            amountNgn: target.amount_ngn,
            quotationRef: target.quotation_ref || '',
            paymentMethod: target.payment_method,
            bankReference: reversalMarker(entryId),
            createdByUserId: actor?.id ?? null,
            createdByName: actorName(actor),
            note: reversalNote,
            atISO: new Date().toISOString(),
          },
        ],
        target.branch_id || null
      )[0];
      db.prepare(`UPDATE sales_receipts SET status = 'Reversed' WHERE id = ? OR ledger_entry_id = ?`).run(entryId, entryId);
      reverseTreasurySourceTx(db, 'LEDGER_RECEIPT', entryId, 'RECEIPT_REVERSAL_OUT', reversalNote, actor);
      appendAuditLog(db, {
        actor,
        action: 'ledger.reverse_receipt',
        entityKind: 'ledger_entry',
        entityId: entryId,
        note: reversalNote,
        details: { reversalEntryId: reversal?.id ?? '' },
      });
    })();
    return { ok: true, entry: reversal };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

/** Reverse a standalone advance deposit if present and not already reversed. */
export function reverseAdvanceEntry(db, entryId, note = '', actor = null) {
  const target = db
    .prepare(`SELECT * FROM ledger_entries WHERE id = ? AND type IN ('ADVANCE_IN','OVERPAY_ADVANCE')`)
    .get(entryId);
  if (!target) return { ok: false, error: 'Advance entry not found.' };

  const existing = db
    .prepare(`SELECT id FROM ledger_entries WHERE type = 'ADVANCE_REVERSAL' AND (bank_reference = ? OR note LIKE ?)`)
    .get(reversalMarker(entryId), `%${entryId}%`);
  if (existing) return { ok: false, error: 'Advance already reversed.' };

  const reversalNote = note || `Reverse advance ${entryId}`;
  const reversalDateISO = new Date().toISOString().slice(0, 10);
  try {
    assertPeriodOpen(db, reversalDateISO, 'Advance reversal date');
    let reversal;
    db.transaction(() => {
      reversal = insertLedgerRows(
        db,
        [
          {
            type: 'ADVANCE_REVERSAL',
            customerID: target.customer_id,
            customerName: target.customer_name,
            amountNgn: target.amount_ngn,
            quotationRef: target.quotation_ref || '',
            paymentMethod: target.payment_method,
            bankReference: reversalMarker(entryId),
            createdByUserId: actor?.id ?? null,
            createdByName: actorName(actor),
            note: reversalNote,
            atISO: new Date().toISOString(),
          },
        ],
        target.branch_id || null
      )[0];

      db.prepare(`DELETE FROM advance_in_events WHERE ledger_entry_id = ?`).run(entryId);
      if (target.type === 'ADVANCE_IN') {
        reverseTreasurySourceTx(db, 'LEDGER_ADVANCE', entryId, 'ADVANCE_REVERSAL_OUT', reversalNote, actor);
      }
      appendAuditLog(db, {
        actor,
        action: 'ledger.reverse_advance',
        entityKind: 'ledger_entry',
        entityId: entryId,
        note: reversalNote,
        details: { reversalEntryId: reversal?.id ?? '' },
      });
    })();
    return { ok: true, entry: reversal };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function formatMetersLabel(totalMeters) {
  const n = Number(totalMeters) || 0;
  const hasFraction = Math.abs(n - Math.round(n)) > 0.0001;
  return `${n.toLocaleString('en-NG', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })} m`;
}

const CUTTING_LIST_LINE_TYPES = new Set(['Roof', 'Flatsheet', 'Cladding']);

function normalizeCuttingListLines(lines) {
  const out = [];
  let order = 0;
  for (const raw of lines || []) {
    const sheets = Number(raw?.sheets ?? raw?.qty ?? 0);
    const lengthM = Number(raw?.lengthM ?? raw?.length_m ?? raw?.length ?? 0);
    if (!Number.isFinite(sheets) || !Number.isFinite(lengthM) || sheets <= 0 || lengthM <= 0) continue;
    order += 1;
    const totalM = Number((sheets * lengthM).toFixed(2));
    const rawType = String(raw?.lineType ?? raw?.line_type ?? 'Roof').trim();
    const lineType = CUTTING_LIST_LINE_TYPES.has(rawType) ? rawType : 'Roof';
    out.push({ sortOrder: order, sheets, lengthM, totalM, lineType });
  }
  return out;
}

function syncCuttingListLineRows(db, cuttingListId, lines) {
  db.prepare(`DELETE FROM cutting_list_lines WHERE cutting_list_id = ?`).run(cuttingListId);
  const ins = db.prepare(
    `INSERT INTO cutting_list_lines (cutting_list_id, sort_order, sheets, length_m, total_m, line_type) VALUES (?,?,?,?,?,?)`
  );
  for (const line of lines) {
    ins.run(
      cuttingListId,
      line.sortOrder,
      line.sheets,
      line.lengthM,
      line.totalM,
      line.lineType ?? 'Roof'
    );
  }
}

export function nextCuttingListId(db) {
  const rows = db.prepare(`SELECT id FROM cutting_lists`).all();
  let max = 0;
  for (const row of rows) {
    const m = String(row.id).match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max > 0 ? `CL-2026-${String(max + 1).padStart(3, '0')}` : nextCuttingListIdValue();
}

function validateQuotationForCuttingList(db, quotationRef, excludeCuttingListId) {
  const qref = String(quotationRef ?? '').trim();
  if (!qref) return { ok: false, error: 'Link a quotation.' };
  const qrow = db.prepare(`SELECT total_ngn, paid_ngn FROM quotations WHERE id = ?`).get(qref);
  if (!qrow) return { ok: false, error: 'Quotation not found.' };
  const total = Number(qrow.total_ngn) || 0;
  const paid = Number(qrow.paid_ngn) || 0;
  if (total <= 0) return { ok: false, error: 'Quotation total must be greater than zero.' };
  if (paid < total * 0.5 - 1e-6) {
    return { ok: false, error: 'At least 50% of the quotation must be paid before creating a cutting list.' };
  }
  const existing = excludeCuttingListId
    ? db
        .prepare(`SELECT id FROM cutting_lists WHERE quotation_ref = ? AND id != ?`)
        .get(qref, excludeCuttingListId)
    : db.prepare(`SELECT id FROM cutting_lists WHERE quotation_ref = ?`).get(qref);
  if (existing) return { ok: false, error: 'This quotation already has a cutting list.' };
  return { ok: true };
}

export function insertCuttingList(db, payload, branchFallback = DEFAULT_BRANCH_ID) {
  const quotationRef = String(payload.quotationRef ?? '').trim();
  const quote = quotationRef
    ? db
        .prepare(`SELECT id, customer_id, customer_name, branch_id FROM quotations WHERE id = ?`)
        .get(quotationRef)
    : null;
  const customerID = String(payload.customerID ?? quote?.customer_id ?? '').trim();
  if (!customerID) return { ok: false, error: 'Select a linked quotation or customer.' };
  const customer =
    db.prepare(`SELECT customer_id, name FROM customers WHERE customer_id = ?`).get(customerID) ||
    null;
  if (!customer) return { ok: false, error: 'Customer not found.' };
  const qCheck = validateQuotationForCuttingList(db, quotationRef, null);
  if (!qCheck.ok) return qCheck;
  const lines = normalizeCuttingListLines(payload.lines);
  if (!lines.length) return { ok: false, error: 'Add at least one valid cutting line.' };
  const id = String(payload.id ?? '').trim() || nextCuttingListId(db);
  const dateISO = String(payload.dateISO ?? '').trim() || new Date().toISOString().slice(0, 10);
  const dateLabel = shortDateFromIso(dateISO);
  const totalMeters = Number(
    payload.totalMeters ?? lines.reduce((sum, line) => sum + line.totalM, 0)
  );
  const sheetsToCut = Number(
    payload.sheetsToCut ?? lines.reduce((sum, line) => sum + line.sheets, 0)
  );
  const productID = String(payload.productID ?? '').trim();
  const productName = String(payload.productName ?? '').trim();
  const machineName = String(payload.machineName ?? '').trim();
  const status = 'Waiting';
  const handledBy = String(payload.handledBy ?? '').trim() || 'Sales';
  const branchId =
    String(quote?.branch_id || '').trim() || String(branchFallback || DEFAULT_BRANCH_ID).trim();
  const productionReleasePending =
    Boolean(payload.holdForProductionApproval) || Boolean(payload.holdProductionRelease) ? 1 : 0;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO cutting_lists (
        id, customer_id, customer_name, quotation_ref, product_id, product_name, date_label, date_iso,
        sheets_to_cut, total_meters, total_label, status, machine_name, operator_name,
        production_registered, production_register_ref, handled_by, branch_id,
        production_release_pending, production_released_at_iso, production_released_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id,
      customer.customer_id,
      customer.name,
      quotationRef || null,
      productID || null,
      productName || null,
      dateLabel,
      dateISO,
      sheetsToCut,
      totalMeters,
      formatMetersLabel(totalMeters),
      status,
      machineName || null,
      null,
      0,
      '',
      handledBy,
      branchId,
      productionReleasePending,
      null,
      null
    );
    syncCuttingListLineRows(db, id, lines);
  })();

  return { ok: true, id };
}

export function clearCuttingListProductionHold(db, cuttingListId, actor = null) {
  const row = db.prepare(`SELECT * FROM cutting_lists WHERE id = ?`).get(cuttingListId);
  if (!row) return { ok: false, error: 'Cutting list not found.' };
  if (!Number(row.production_release_pending)) {
    return { ok: false, error: 'This list is not waiting on a production release hold.' };
  }
  const iso = new Date().toISOString();
  const by = String(actor?.displayName || actor?.username || 'Manager').trim() || 'Manager';
  db.prepare(
    `UPDATE cutting_lists SET production_release_pending = 0, production_released_at_iso = ?, production_released_by = ? WHERE id = ?`
  ).run(iso, by, cuttingListId);
  appendAuditLog(db, {
    actor,
    action: 'cutting_list.production_release_cleared',
    entityKind: 'cutting_list',
    entityId: cuttingListId,
    note: 'Operations cleared production queue hold',
  });
  return { ok: true };
}

export function updateCuttingList(db, cuttingListId, payload) {
  const existing = db.prepare(`SELECT * FROM cutting_lists WHERE id = ?`).get(cuttingListId);
  if (!existing) return { ok: false, error: 'Cutting list not found.' };
  if (existing.production_registered) {
    return { ok: false, error: 'Cutting list is already tied to a production job.' };
  }
  const quotationRef =
    payload.quotationRef !== undefined ? String(payload.quotationRef ?? '').trim() : existing.quotation_ref || '';
  const prevRef = String(existing.quotation_ref ?? '').trim();
  if (payload.quotationRef !== undefined && quotationRef !== prevRef) {
    const qCheck = validateQuotationForCuttingList(db, quotationRef, cuttingListId);
    if (!qCheck.ok) return qCheck;
  }
  const quote = quotationRef
    ? db.prepare(`SELECT id, customer_id, customer_name, branch_id FROM quotations WHERE id = ?`).get(quotationRef)
    : null;
  const customerID =
    payload.customerID !== undefined
      ? String(payload.customerID ?? '').trim()
      : String(quote?.customer_id ?? existing.customer_id ?? '').trim();
  const customer =
    db.prepare(`SELECT customer_id, name FROM customers WHERE customer_id = ?`).get(customerID) ||
    null;
  if (!customer) return { ok: false, error: 'Customer not found.' };
  const lines = payload.lines
    ? normalizeCuttingListLines(payload.lines)
    : db
        .prepare(`SELECT * FROM cutting_list_lines WHERE cutting_list_id = ? ORDER BY sort_order`)
        .all(cuttingListId)
        .map((row) => ({
          sortOrder: row.sort_order,
          sheets: Number(row.sheets) || 0,
          lengthM: Number(row.length_m) || 0,
          totalM: Number(row.total_m) || 0,
          lineType: row.line_type || 'Roof',
        }));
  if (!lines.length) return { ok: false, error: 'Cutting list must keep at least one valid line.' };
  const dateISO = payload.dateISO ?? existing.date_iso;
  const totalMeters =
    payload.totalMeters !== undefined
      ? Number(payload.totalMeters) || 0
      : lines.reduce((sum, line) => sum + line.totalM, 0);
  const sheetsToCut =
    payload.sheetsToCut !== undefined
      ? Number(payload.sheetsToCut) || 0
      : lines.reduce((sum, line) => sum + line.sheets, 0);
  const productID =
    payload.productID !== undefined ? String(payload.productID ?? '').trim() : existing.product_id ?? '';
  const productName =
    payload.productName !== undefined
      ? String(payload.productName ?? '').trim()
      : existing.product_name ?? '';
  const machineName =
    payload.machineName !== undefined
      ? String(payload.machineName ?? '').trim()
      : existing.machine_name ?? '';
  const status = existing.status;
  const handledBy = payload.handledBy ?? existing.handled_by;

  db.transaction(() => {
    db.prepare(
      `UPDATE cutting_lists
       SET customer_id = ?, customer_name = ?, quotation_ref = ?, product_id = ?, product_name = ?,
           date_label = ?, date_iso = ?, sheets_to_cut = ?, total_meters = ?, total_label = ?,
           status = ?, machine_name = ?, operator_name = ?, handled_by = ?
       WHERE id = ?`
    ).run(
      customer.customer_id,
      customer.name,
      quotationRef || null,
      productID || null,
      productName || null,
      shortDateFromIso(dateISO),
      dateISO,
      sheetsToCut,
      totalMeters,
      formatMetersLabel(totalMeters),
      status,
      machineName || null,
      null,
      handledBy,
      cuttingListId
    );
    syncCuttingListLineRows(db, cuttingListId, lines);
  })();

  return { ok: true, id: cuttingListId };
}

export function nextProductionJobId(db) {
  const rows = db.prepare(`SELECT job_id FROM production_jobs`).all();
  let max = 0;
  for (const row of rows) {
    const m = String(row.job_id).match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max > 0 ? `PRO-2026-${String(max + 1).padStart(3, '0')}` : nextProductionJobIdValue();
}

export function insertProductionJob(db, payload, branchFallback = DEFAULT_BRANCH_ID) {
  const cuttingListId = String(payload.cuttingListId ?? '').trim();
  const cuttingList = cuttingListId
    ? db.prepare(`SELECT * FROM cutting_lists WHERE id = ?`).get(cuttingListId)
    : null;
  if (cuttingListId && !cuttingList) return { ok: false, error: 'Cutting list not found.' };
  if (cuttingList?.production_registered) {
    return { ok: false, error: 'Production is already registered for this cutting list.' };
  }
  if (cuttingListId && cuttingList && Number(cuttingList.production_release_pending) === 1) {
    return {
      ok: false,
      error:
        'This cutting list is waiting on operations approval before it can join the production queue. Clear the hold first.',
    };
  }
  const jobID = String(payload.jobID ?? '').trim() || nextProductionJobId(db);
  const quotationRef = String(payload.quotationRef ?? cuttingList?.quotation_ref ?? '').trim();
  const customerID = String(payload.customerID ?? cuttingList?.customer_id ?? '').trim();
  const customerName = String(payload.customerName ?? cuttingList?.customer_name ?? '').trim();
  const productID = String(payload.productID ?? cuttingList?.product_id ?? '').trim();
  const productName = String(payload.productName ?? cuttingList?.product_name ?? '').trim();
  const plannedMeters = Number(payload.plannedMeters ?? cuttingList?.total_meters ?? 0) || 0;
  const plannedSheets = Number(payload.plannedSheets ?? cuttingList?.sheets_to_cut ?? 0) || 0;
  const machineName = String(payload.machineName ?? cuttingList?.machine_name ?? '').trim();
  const startDateISO = String(payload.startDateISO ?? '').trim();
  const endDateISO = String(payload.endDateISO ?? '').trim();
  const materialsNote = String(payload.materialsNote ?? '').trim();
  const operatorName = String(payload.operatorName ?? '').trim();
  const status = 'Planned';
  const createdAtISO = new Date().toISOString();
  const branchId =
    String(cuttingList?.branch_id || '').trim() || String(branchFallback || DEFAULT_BRANCH_ID).trim();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO production_jobs (
        job_id, cutting_list_id, quotation_ref, customer_id, customer_name, product_id, product_name,
        planned_meters, planned_sheets, machine_name, operator_name, start_date_iso, end_date_iso, materials_note,
        status, created_at_iso, completed_at_iso, actual_meters, actual_weight_kg,
        conversion_alert_state, manager_review_required, branch_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      jobID,
      cuttingListId || null,
      quotationRef || null,
      customerID || null,
      customerName || null,
      productID || null,
      productName || null,
      plannedMeters,
      plannedSheets,
      machineName || null,
      operatorName || null,
      startDateISO || null,
      endDateISO || null,
      materialsNote || null,
      status,
      createdAtISO,
      null,
      0,
      0,
      'Pending',
      0,
      branchId
    );
    if (cuttingListId) {
      db.prepare(
        `UPDATE cutting_lists
         SET production_registered = 1, production_register_ref = ?, status = ?
         WHERE id = ?`
      ).run('', 'Waiting', cuttingListId);
    }
  })();

  return { ok: true, jobID };
}

export function setProductionJobStatus(db, jobID, status) {
  const row = db.prepare(`SELECT * FROM production_jobs WHERE job_id = ?`).get(jobID);
  if (!row) return { ok: false, error: 'Production job not found.' };
  const nextStatus = String(status ?? '').trim();
  if (!nextStatus) return { ok: false, error: 'Status is required.' };
  if (nextStatus === 'Running') {
    return { ok: false, error: 'Use the production start action after allocating coils.' };
  }
  if (nextStatus === 'Completed') {
    return { ok: false, error: 'Use the completion flow with coil readings to finish this job.' };
  }
  const completedAtISO = nextStatus === 'Completed' ? new Date().toISOString() : null;
  db.transaction(() => {
    db.prepare(`UPDATE production_jobs SET status = ?, completed_at_iso = ? WHERE job_id = ?`).run(
      nextStatus,
      completedAtISO,
      jobID
    );
    if (row.cutting_list_id) {
      db.prepare(`UPDATE cutting_lists SET status = ? WHERE id = ?`).run(
        nextStatus === 'Completed' ? 'Finished' : 'In production',
        row.cutting_list_id
      );
    }
  })();
  return { ok: true };
}

export function nextDeliveryId(db) {
  const rows = db.prepare(`SELECT id FROM deliveries`).all();
  let max = 0;
  for (const row of rows) {
    const m = String(row.id).match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max > 0 ? `DN-2026-${String(max + 1).padStart(3, '0')}` : nextDeliveryIdValue();
}

function normalizeDeliveryLines(payloadLines, cuttingListRow, cuttingListLines) {
  if (Array.isArray(payloadLines) && payloadLines.length > 0) {
    return payloadLines
      .map((line, index) => ({
        sortOrder: index + 1,
        productID: String(line.productID ?? '').trim(),
        productName: String(line.productName ?? '').trim(),
        qty: Number(line.qty) || 0,
        unit: String(line.unit ?? '').trim() || 'm',
        cuttingListLineNo: line.cuttingListLineNo ?? null,
      }))
      .filter((line) => line.productID && line.qty > 0);
  }
  if (!cuttingListRow || !cuttingListLines.length || !cuttingListRow.product_id) return [];
  return cuttingListLines.map((line) => ({
    sortOrder: line.sort_order,
    productID: cuttingListRow.product_id,
    productName: cuttingListRow.product_name || cuttingListRow.product_id,
    qty: Number(line.total_m) || 0,
    unit: 'm',
    cuttingListLineNo: line.sort_order,
  }));
}

function syncDeliveryLineRows(db, deliveryId, lines) {
  db.prepare(`DELETE FROM delivery_lines WHERE delivery_id = ?`).run(deliveryId);
  const ins = db.prepare(
    `INSERT INTO delivery_lines (
      delivery_id, sort_order, product_id, product_name, qty, unit, cutting_list_line_no
    ) VALUES (?,?,?,?,?,?,?)`
  );
  for (const line of lines) {
    ins.run(
      deliveryId,
      line.sortOrder,
      line.productID,
      line.productName || null,
      line.qty,
      line.unit || null,
      line.cuttingListLineNo ?? null
    );
  }
}

export function insertDelivery(db, payload, branchFallback = DEFAULT_BRANCH_ID) {
  const id = String(payload.id ?? '').trim() || nextDeliveryId(db);
  const cuttingListId = String(payload.cuttingListId ?? '').trim();
  const cuttingList = cuttingListId
    ? db.prepare(`SELECT * FROM cutting_lists WHERE id = ?`).get(cuttingListId)
    : null;
  if (cuttingListId && !cuttingList) return { ok: false, error: 'Cutting list not found.' };
  const cuttingListLines = cuttingListId
    ? db.prepare(`SELECT * FROM cutting_list_lines WHERE cutting_list_id = ? ORDER BY sort_order`).all(cuttingListId)
    : [];
  const quotationRef = String(payload.quotationRef ?? cuttingList?.quotation_ref ?? '').trim();
  const quote = quotationRef
    ? db.prepare(`SELECT customer_id, customer_name FROM quotations WHERE id = ?`).get(quotationRef)
    : null;
  const customerID = String(payload.customerID ?? cuttingList?.customer_id ?? quote?.customer_id ?? '').trim();
  const customerName = String(
    payload.customerName ?? cuttingList?.customer_name ?? quote?.customer_name ?? ''
  ).trim();
  if (!customerName) return { ok: false, error: 'Customer is required.' };
  const lines = normalizeDeliveryLines(payload.lines, cuttingList, cuttingListLines);
  if (!lines.length) return { ok: false, error: 'Add at least one delivery line.' };
  const status = String(payload.status ?? '').trim() || 'Scheduled';
  const destination = String(payload.destination ?? '').trim();
  const method = String(payload.method ?? '').trim() || 'Company truck';
  const trackingNo = String(payload.trackingNo ?? '').trim();
  const shipDate = String(payload.shipDate ?? '').trim() || new Date().toISOString().slice(0, 10);
  const eta = String(payload.eta ?? '').trim() || shipDate;
  const branchId =
    String(cuttingList?.branch_id || '').trim() || String(branchFallback || DEFAULT_BRANCH_ID).trim();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO deliveries (
        id, quotation_ref, customer_id, customer_name, cutting_list_id, destination, method, status,
        tracking_no, ship_date, eta, delivered_date_iso, pod_notes, courier_confirmed, customer_signed_pod, fulfillment_posted, branch_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id,
      quotationRef || null,
      customerID || null,
      customerName,
      cuttingListId || null,
      destination || null,
      method,
      status,
      trackingNo || null,
      shipDate,
      eta,
      null,
      null,
      0,
      0,
      0,
      branchId
    );
    syncDeliveryLineRows(db, id, lines);
    if (cuttingListId) {
      db.prepare(`UPDATE cutting_lists SET status = ? WHERE id = ?`).run('Ready for dispatch', cuttingListId);
    }
  })();

  return { ok: true, id };
}

export function insertExpenseEntry(db, payload, branchId = DEFAULT_BRANCH_ID) {
  const expenseID = String(payload.expenseID ?? '').trim() || `EXP-${Date.now()}`;
  const category = String(payload.category ?? '').trim();
  const amountNgn = roundMoney(payload.amountNgn);
  if (!category) return { ok: false, error: 'Expense category is required.' };
  if (amountNgn <= 0) return { ok: false, error: 'Expense amount must be positive.' };
  try {
    assertPeriodOpen(db, payload.date || new Date().toISOString().slice(0, 10), 'Expense date');
    db.transaction(() => {
      db.prepare(
        `INSERT INTO expenses (expense_id, expense_type, amount_ngn, date, category, payment_method, reference, branch_id)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(
        expenseID,
        payload.expenseType ?? '',
        amountNgn,
        payload.date || new Date().toISOString().slice(0, 10),
        category,
        payload.paymentMethod ?? '',
        payload.reference ?? '',
        String(branchId || DEFAULT_BRANCH_ID).trim()
      );
      if (payload.treasuryAccountId) {
        insertTreasuryMovementTx(db, {
          type: 'EXPENSE',
          treasuryAccountId: payload.treasuryAccountId,
          amountNgn: -amountNgn,
          postedAtISO: payload.date,
          reference: payload.reference || expenseID,
          counterpartyKind: 'EXPENSE',
          counterpartyId: expenseID,
          counterpartyName: category,
          sourceKind: 'EXPENSE',
          sourceId: expenseID,
          note: payload.expenseType || category,
          createdBy: payload.createdBy ?? 'Finance',
        });
      }
      appendAuditLog(db, {
        actor: payload.actor,
        action: 'expense.create',
        entityKind: 'expense',
        entityId: expenseID,
        note: payload.expenseType || category,
        details: { amountNgn, treasuryAccountId: payload.treasuryAccountId ?? null },
      });
    })();
    return { ok: true, expenseID };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export function transferTreasuryFunds(db, payload) {
  const fromId = Number(payload.fromId);
  const toId = Number(payload.toId);
  const amountNgn = roundMoney(payload.amountNgn);
  if (!fromId || !toId || fromId === toId) {
    return { ok: false, error: 'Choose two different accounts.' };
  }
  if (amountNgn <= 0) return { ok: false, error: 'Transfer amount must be positive.' };
  const batchId = `TR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    assertPeriodOpen(db, payload.dateISO || new Date().toISOString().slice(0, 10), 'Transfer date');
    const movements = db.transaction(() => {
      const out = insertTreasuryMovementTx(db, {
        type: 'INTERNAL_TRANSFER_OUT',
        treasuryAccountId: fromId,
        amountNgn: -amountNgn,
        postedAtISO: payload.dateISO,
        reference: payload.reference || batchId,
        counterpartyKind: 'INTERNAL',
        counterpartyId: String(toId),
        sourceKind: 'TREASURY_TRANSFER',
        sourceId: batchId,
        note: payload.reference || 'Internal transfer out',
        createdBy: payload.createdBy ?? 'Finance',
        batchId,
      });
      const inn = insertTreasuryMovementTx(db, {
        type: 'INTERNAL_TRANSFER_IN',
        treasuryAccountId: toId,
        amountNgn,
        postedAtISO: payload.dateISO,
        reference: payload.reference || batchId,
        counterpartyKind: 'INTERNAL',
        counterpartyId: String(fromId),
        sourceKind: 'TREASURY_TRANSFER',
        sourceId: batchId,
        note: payload.reference || 'Internal transfer in',
        createdBy: payload.createdBy ?? 'Finance',
        batchId,
      });
      appendAuditLog(db, {
        actor: payload.actor,
        action: 'treasury.transfer',
        entityKind: 'treasury_transfer',
        entityId: batchId,
        note: payload.reference || 'Internal fund transfer',
        details: { fromId, toId, amountNgn },
      });
      return [out, inn];
    })();
    return { ok: true, batchId, movements };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export function payPaymentRequest(db, requestID, payload) {
  const row = db.prepare(`SELECT * FROM payment_requests WHERE request_id = ?`).get(requestID);
  if (!row) return { ok: false, error: 'Payment request not found.' };
  if (String(row.approval_status || '') !== 'Approved') {
    return { ok: false, error: 'Only approved payment requests can be paid.' };
  }

  const requested = roundMoney(row.amount_requested_ngn);
  const alreadyPaid = roundMoney(row.paid_amount_ngn);
  const outstanding = requested - alreadyPaid;
  if (outstanding <= 0) {
    return { ok: false, error: 'Payment request is already fully paid.' };
  }

  let paymentLines = Array.isArray(payload.paymentLines)
    ? payload.paymentLines
        .map((line) => ({
          treasuryAccountId: Number(line?.treasuryAccountId),
          amountNgn: roundMoney(line?.amountNgn),
          reference: String(line?.reference ?? '').trim(),
          note: String(line?.note ?? '').trim(),
        }))
        .filter((line) => line.treasuryAccountId && line.amountNgn > 0)
    : [];

  if (paymentLines.length === 0) {
    const treasuryAccountId = Number(payload.treasuryAccountId);
    const amountNgn = roundMoney(payload.amountNgn) || outstanding;
    if (!treasuryAccountId) {
      return { ok: false, error: 'Select at least one treasury account for payment.' };
    }
    paymentLines = [
      {
        treasuryAccountId,
        amountNgn,
        reference: String(payload.reference ?? '').trim(),
        note: String(payload.note ?? '').trim(),
      },
    ];
  }

  const totalPaid = paymentLines.reduce((sum, line) => sum + roundMoney(line.amountNgn), 0);
  if (totalPaid <= 0) {
    return { ok: false, error: 'Payment amount must be positive.' };
  }
  if (totalPaid > outstanding) {
    return { ok: false, error: 'Payment exceeds the approved request balance.' };
  }

  const paidAtISO = String(payload.paidAtISO ?? '').trim() || new Date().toISOString().slice(0, 10);
  const paidBy = String(payload.paidBy ?? '').trim() || payload.createdBy || 'Finance';
  const paymentNote = String(payload.note ?? payload.reference ?? '').trim();

  try {
    assertPeriodOpen(db, paidAtISO, 'Payment request payout date');
    const movements = db.transaction(() => {
      const created = insertTreasurySplitTx(
        db,
        paymentLines.map((line) => ({
          ...line,
          amountNgn: -roundMoney(line.amountNgn),
        })),
        {
          type: 'PAYMENT_REQUEST_OUT',
          postedAtISO: paidAtISO,
          reference: String(payload.reference ?? '').trim() || requestID,
          counterpartyKind: 'EXPENSE',
          counterpartyId: row.expense_id,
          counterpartyName: row.description || row.request_id,
          sourceKind: 'PAYMENT_REQUEST',
          sourceId: requestID,
          note: row.description || 'Payment request payout',
          createdBy: paidBy,
        }
      );

      const nextPaid = alreadyPaid + totalPaid;
      db.prepare(
        `UPDATE payment_requests
         SET paid_amount_ngn = ?, paid_at_iso = ?, paid_by = ?, payment_note = ?
         WHERE request_id = ?`
      ).run(nextPaid, paidAtISO, paidBy, paymentNote, requestID);

      appendAuditLog(db, {
        actor: payload.actor,
        action: 'payment_request.pay',
        entityKind: 'payment_request',
        entityId: requestID,
        note: paymentNote || row.description || 'Payment request paid',
        details: {
          amountPaidNgn: totalPaid,
          paidAmountNgn: nextPaid,
          treasuryAccountIds: paymentLines.map((line) => line.treasuryAccountId),
        },
      });

      return created;
    })();

    return {
      ok: true,
      amountPaidNgn: totalPaid,
      paidAmountNgn: alreadyPaid + totalPaid,
      fullyPaid: alreadyPaid + totalPaid >= requested,
      movements,
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export function payAccountsPayable(db, apId, payload) {
  const row = db.prepare(`SELECT * FROM accounts_payable WHERE ap_id = ?`).get(apId);
  if (!row) return { ok: false, error: 'Payable not found.' };
  const amountNgn = roundMoney(payload.amountNgn);
  if (amountNgn <= 0) return { ok: false, error: 'Payment amount must be positive.' };
  const outstanding = roundMoney(row.amount_ngn) - roundMoney(row.paid_ngn);
  if (outstanding <= 0) return { ok: false, error: 'Invoice is already fully paid.' };
  const apply = Math.min(amountNgn, outstanding);
  try {
    assertPeriodOpen(db, payload.dateISO || new Date().toISOString().slice(0, 10), 'AP payment date');
    db.transaction(() => {
      db.prepare(`UPDATE accounts_payable SET paid_ngn = ?, payment_method = ? WHERE ap_id = ?`).run(
        roundMoney(row.paid_ngn) + apply,
        payload.paymentMethod ?? row.payment_method,
        apId
      );
      if (row.po_ref) {
        const po = db.prepare(`SELECT po_id FROM purchase_orders WHERE po_id = ?`).get(row.po_ref);
        if (po) {
          db.prepare(`UPDATE purchase_orders SET supplier_paid_ngn = supplier_paid_ngn + ? WHERE po_id = ?`).run(
            apply,
            row.po_ref
          );
          appendMovementTx(db, {
            type: 'PO_SUPPLIER_PAYMENT',
            ref: row.po_ref,
            detail: `${apply} — ${row.invoice_ref || apId}`,
          });
        }
      }
      insertTreasuryMovementTx(db, {
        type: 'AP_PAYMENT',
        treasuryAccountId: payload.treasuryAccountId,
        amountNgn: -apply,
        postedAtISO: payload.dateISO,
        reference: payload.reference || row.invoice_ref || apId,
        counterpartyKind: 'SUPPLIER',
        counterpartyName: row.supplier_name,
        sourceKind: 'ACCOUNTS_PAYABLE',
        sourceId: apId,
        note: payload.paymentMethod || 'Supplier payment',
        createdBy: payload.createdBy ?? 'Finance',
      });
      appendAuditLog(db, {
        actor: payload.actor,
        action: 'accounts_payable.pay',
        entityKind: 'accounts_payable',
        entityId: apId,
        note: payload.reference || row.invoice_ref || 'Supplier payment',
        details: { amountApplied: apply, treasuryAccountId: payload.treasuryAccountId },
      });
    })();
    return { ok: true, amountApplied: apply };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export function payRefundEntry(db, refundId, payload) {
  const row = db.prepare(`SELECT * FROM customer_refunds WHERE refund_id = ?`).get(refundId);
  if (!row) return { ok: false, error: 'Refund not found.' };
  if (String(row.status || '') !== 'Approved') {
    return { ok: false, error: 'Only approved refunds can be paid.' };
  }
  const approvedAmountNgn = roundMoney(row.approved_amount_ngn || row.amount_ngn);
  const paidAmountNgn = roundMoney(row.paid_amount_ngn);
  const outstandingAmountNgn = approvedAmountNgn - paidAmountNgn;
  if (outstandingAmountNgn <= 0) {
    return { ok: false, error: 'Refund has already been fully paid.' };
  }
  const paidAtISO = String(payload.paidAtISO ?? '').trim() || new Date().toISOString().slice(0, 10);
  const paidBy = String(payload.paidBy ?? '').trim() || 'Finance';
  const paymentNote = String(payload.paymentNote ?? '').trim();
  const fromExplicit = Array.isArray(payload.paymentLines)
    ? payload.paymentLines
        .map((line) => ({
          treasuryAccountId: Number(line?.treasuryAccountId),
          amountNgn: roundMoney(line?.amountNgn),
          reference: String(line?.reference ?? '').trim(),
          note: String(line?.note ?? '').trim(),
        }))
        .filter((line) => line.treasuryAccountId && line.amountNgn > 0)
    : [];
  const paymentLines =
    fromExplicit.length > 0
      ? fromExplicit
      : payload.treasuryAccountId
        ? [
            {
              treasuryAccountId: Number(payload.treasuryAccountId),
              amountNgn: outstandingAmountNgn,
              reference: String(payload.reference ?? '').trim(),
              note: String(payload.note ?? '').trim(),
            },
          ]
        : [];
  const payoutAmountNgn = paymentLines.reduce((sum, line) => sum + line.amountNgn, 0);
  if (!paymentLines.length || payoutAmountNgn <= 0) {
    return { ok: false, error: 'Add at least one payout line.' };
  }
  if (payoutAmountNgn > outstandingAmountNgn) {
    return { ok: false, error: 'Payout exceeds the approved refund balance.' };
  }
  try {
    assertPeriodOpen(db, paidAtISO, 'Refund payout date');
    const result = db.transaction(() => {
      const movements = insertTreasurySplitTx(db, paymentLines.map((line) => ({ ...line, amountNgn: -line.amountNgn })), {
        type: 'REFUND_PAYOUT',
        postedAtISO: paidAtISO,
        counterpartyKind: 'CUSTOMER',
        counterpartyId: row.customer_id,
        counterpartyName: row.customer_name,
        sourceKind: 'REFUND',
        sourceId: refundId,
        reference: payload.reference || refundId,
        note: paymentNote || row.reason || 'Customer refund',
        createdBy: paidBy,
      });
      const nextPaidAmountNgn = paidAmountNgn + payoutAmountNgn;
      const fullyPaid = nextPaidAmountNgn >= approvedAmountNgn;
      db.prepare(
        `UPDATE customer_refunds
         SET status = ?, paid_amount_ngn = ?, paid_at_iso = ?, paid_by = ?, payment_note = ?
         WHERE refund_id = ?`
      ).run(
        fullyPaid ? 'Paid' : 'Approved',
        nextPaidAmountNgn,
        paidAtISO,
        paidBy,
        paymentNote || row.payment_note || null,
        refundId
      );
      appendAuditLog(db, {
        actor: payload.actor,
        action: 'refund.pay',
        entityKind: 'refund',
        entityId: refundId,
        note: paymentNote || row.reason || 'Customer refund payout recorded',
        details: {
          payoutAmountNgn,
          approvedAmountNgn,
          paidAmountNgn: nextPaidAmountNgn,
          treasuryAccountIds: movements.map((movement) => movement.treasuryAccountId),
        },
      });
      return { movements, nextPaidAmountNgn, fullyPaid };
    })();
    const outstandingAfterNgn = approvedAmountNgn - result.nextPaidAmountNgn;
    return {
      ok: true,
      amountPaidNgn: payoutAmountNgn,
      paidAmountNgn: result.nextPaidAmountNgn,
      approvedAmountNgn,
      outstandingNgn: Math.max(0, outstandingAfterNgn),
      fullyPaid: result.fullyPaid,
      movements: result.movements,
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export function sumQuotationLinesJson(linesJson) {
  if (!linesJson || typeof linesJson !== 'object') return 0;
  let s = 0;
  for (const cat of ['products', 'accessories', 'services']) {
    const arr = linesJson[cat];
    if (!Array.isArray(arr)) continue;
    for (const row of arr) {
      const q = Number(String(row?.qty ?? '').replace(/,/g, ''));
      const p = Number(String(row?.unitPrice ?? '').replace(/,/g, ''));
      if (Number.isFinite(q) && Number.isFinite(p)) s += Math.round(q * p);
    }
  }
  return s;
}

function parseQuotationLinesJsonObject(raw) {
  try {
    const j = JSON.parse(raw || '{}');
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

export function nextQuotationId(db) {
  const rows = db.prepare(`SELECT id FROM quotations`).all();
  let max = 0;
  for (const r of rows) {
    const m = String(r.id).match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `QT-2026-${String(max + 1).padStart(3, '0')}`;
}

function syncQuotationLineRows(db, quotationId, linesJson) {
  db.prepare(`DELETE FROM quotation_lines WHERE quotation_id = ?`).run(quotationId);
  const ins = db.prepare(`
    INSERT INTO quotation_lines (id, quotation_id, sort_order, category, name, qty, unit, unit_price_ngn, line_total_ngn)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);
  let order = 0;
  for (const cat of ['products', 'accessories', 'services']) {
    const arr = linesJson?.[cat];
    if (!Array.isArray(arr)) continue;
    for (const row of arr) {
      const name = String(row?.name ?? '').trim();
      if (!name) continue;
      order += 1;
      const qty = Number(String(row?.qty ?? '').replace(/,/g, '')) || 0;
      const unitPrice = Math.round(Number(String(row?.unitPrice ?? '').replace(/,/g, '')) || 0);
      const lineTotal = Math.round(qty * unitPrice);
      const lid = `${quotationId}-L${order}`;
      ins.run(lid, quotationId, order, cat, name, qty, 'ea', unitPrice, lineTotal);
    }
  }
}

export function insertQuotation(db, payload, branchId = DEFAULT_BRANCH_ID) {
  const customerID = String(payload.customerID ?? '').trim();
  if (!customerID) throw new Error('customerID is required.');
  const cust = db.prepare(`SELECT customer_id, name FROM customers WHERE customer_id = ?`).get(customerID);
  if (!cust) throw new Error('Customer not found.');

  const linesJson = {
    products: payload.lines?.products ?? [],
    accessories: payload.lines?.accessories ?? [],
    services: payload.lines?.services ?? [],
  };
  if (payload.materialGauge !== undefined) linesJson.materialGauge = String(payload.materialGauge ?? '').trim();
  if (payload.materialColor !== undefined) linesJson.materialColor = String(payload.materialColor ?? '').trim();
  if (payload.materialDesign !== undefined) linesJson.materialDesign = String(payload.materialDesign ?? '').trim();
  const totalNgn = sumQuotationLinesJson(linesJson);
  const id = String(payload.id ?? '').trim() || nextQuotationId(db);
  const dateISO = payload.dateISO || new Date().toISOString().slice(0, 10);
  const dateLabel = shortDateFromIso(dateISO);
  const dueDateISO = payload.dueDateISO || '';
  const totalDisplay = `₦${totalNgn.toLocaleString('en-NG')}`;
  const paidNgn = Math.round(Number(payload.paidNgn) || 0);
  let paymentStatus = payload.paymentStatus;
  if (!paymentStatus) {
    if (paidNgn <= 0) paymentStatus = 'Unpaid';
    else if (totalNgn > 0 && paidNgn >= totalNgn) paymentStatus = 'Paid';
    else paymentStatus = 'Partial';
  }
  const status = payload.status || 'Pending';
  const handledBy = payload.handledBy || 'Sales';
  const projectName = String(payload.projectName ?? '').trim() || null;
  const linesStr = JSON.stringify(linesJson);

  db.transaction(() => {
    db.prepare(
      `
      INSERT INTO quotations (
        id, customer_id, customer_name, date_label, date_iso, due_date_iso,
        total_display, total_ngn, paid_ngn, payment_status, status, approval_date, customer_feedback, handled_by,
        project_name, lines_json, branch_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `
    ).run(
      id,
      customerID,
      cust.name,
      dateLabel,
      dateISO,
      dueDateISO,
      totalDisplay,
      totalNgn,
      paidNgn,
      paymentStatus,
      status,
      payload.approvalDate ?? '',
      payload.customerFeedback ?? '',
      handledBy,
      projectName,
      linesStr,
      String(branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID
    );
    syncQuotationLineRows(db, id, linesJson);
  })();

  return id;
}

export function updateQuotation(db, quotationId, payload) {
  const existing = db.prepare(`SELECT * FROM quotations WHERE id = ?`).get(quotationId);
  if (!existing) throw new Error('Quotation not found.');

  const prior = parseQuotationLinesJsonObject(existing.lines_json);
  const linesJson = { ...prior };
  if (payload.lines) {
    linesJson.products = payload.lines.products ?? [];
    linesJson.accessories = payload.lines.accessories ?? [];
    linesJson.services = payload.lines.services ?? [];
  }
  if (payload.materialGauge !== undefined) linesJson.materialGauge = String(payload.materialGauge ?? '').trim();
  if (payload.materialColor !== undefined) linesJson.materialColor = String(payload.materialColor ?? '').trim();
  if (payload.materialDesign !== undefined) linesJson.materialDesign = String(payload.materialDesign ?? '').trim();

  const totalNgn = payload.lines != null ? sumQuotationLinesJson(linesJson) : existing.total_ngn;
  const customerID =
    payload.customerID != null ? String(payload.customerID).trim() : existing.customer_id;
  const cust = db.prepare(`SELECT name FROM customers WHERE customer_id = ?`).get(customerID);
  if (!cust) throw new Error('Customer not found.');
  const customerName = cust.name;

  const dateISO = payload.dateISO ?? existing.date_iso;
  const dateLabel = shortDateFromIso(dateISO);
  const dueDateISO = payload.dueDateISO !== undefined ? payload.dueDateISO : existing.due_date_iso;
  const totalDisplay = `₦${(Number(totalNgn) || 0).toLocaleString('en-NG')}`;
  const paidNgn =
    payload.paidNgn != null ? Math.round(Number(payload.paidNgn) || 0) : existing.paid_ngn;
  let paymentStatus = payload.paymentStatus ?? existing.payment_status;
  if (payload.paidNgn != null || payload.lines) {
    const t = Number(totalNgn) || 0;
    const p = Number(paidNgn) || 0;
    if (p <= 0) paymentStatus = 'Unpaid';
    else if (t > 0 && p >= t) paymentStatus = 'Paid';
    else paymentStatus = 'Partial';
  }
  const status = payload.status ?? existing.status;
  const approvalDate = payload.approvalDate !== undefined ? payload.approvalDate : existing.approval_date;
  const customerFeedback =
    payload.customerFeedback !== undefined ? payload.customerFeedback : existing.customer_feedback;
  const handledBy = payload.handledBy ?? existing.handled_by;
  const projectName =
    payload.projectName !== undefined
      ? String(payload.projectName ?? '').trim() || null
      : existing.project_name;
  const linesStr = JSON.stringify(linesJson);

  db.transaction(() => {
    db.prepare(
      `
      UPDATE quotations SET
        customer_id = ?,
        customer_name = ?,
        date_label = ?,
        date_iso = ?,
        due_date_iso = ?,
        total_display = ?,
        total_ngn = ?,
        paid_ngn = ?,
        payment_status = ?,
        status = ?,
        approval_date = ?,
        customer_feedback = ?,
        handled_by = ?,
        project_name = ?,
        lines_json = ?
      WHERE id = ?
    `
    ).run(
      customerID,
      customerName,
      dateLabel,
      dateISO,
      dueDateISO ?? '',
      totalDisplay,
      totalNgn,
      paidNgn,
      paymentStatus,
      status,
      approvalDate ?? '',
      customerFeedback ?? '',
      handledBy,
      projectName,
      linesStr,
      quotationId
    );
    if (payload.lines) syncQuotationLineRows(db, quotationId, linesJson);
  })();

  return quotationId;
}

export function replaceRefunds(db, refunds) {
  db.prepare(`DELETE FROM customer_refunds`).run();
  const ins = db.prepare(`
    INSERT INTO customer_refunds (
      refund_id, customer_id, customer_name, quotation_ref, cutting_list_ref, product, reason_category, reason,
      amount_ngn, calculation_lines_json, suggested_lines_json, calculation_notes, status, requested_by, requested_at_iso,
      approval_date, approved_by, approved_amount_ngn, manager_comments, paid_amount_ngn, paid_at_iso, paid_by, payment_note, branch_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  db.transaction(() => {
    for (const r of refunds) {
      ins.run(
        r.refundID,
        r.customerID,
        r.customer,
        r.quotationRef,
        r.cuttingListRef,
        r.product,
        r.reasonCategory,
        r.reason,
        r.amountNgn,
        JSON.stringify(r.calculationLines || []),
        JSON.stringify(r.suggestedLines || r.calculationLines || []),
        r.calculationNotes,
        r.status,
        r.requestedBy,
        r.requestedAtISO,
        r.approvalDate,
        r.approvedBy,
        r.approvedAmountNgn ?? r.amountNgn ?? 0,
        r.managerComments,
        r.paidAmountNgn ?? (r.status === 'Paid' ? r.approvedAmountNgn ?? r.amountNgn ?? 0 : 0),
        r.paidAtISO,
        r.paidBy,
        r.paymentNote ?? '',
        String(r.branchId || DEFAULT_BRANCH_ID).trim()
      );
    }
  })();
  return { ok: true };
}
