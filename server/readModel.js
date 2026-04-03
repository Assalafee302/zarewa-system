import { accessoryFulfillmentSummaryForQuotation } from './accessoryFulfillment.js';
import { publicUserFromRow } from './auth.js';
import { branchPredicate } from './branchSql.js';
/** @param {import('better-sqlite3').Database} db */

function hasColumn(db, table, column) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  } catch {
    return false;
  }
}

/** @param {'ALL' | string} scope */
function branchWhere(db, table, scope) {
  if (scope === 'ALL' || !scope || !hasColumn(db, table, 'branch_id')) {
    return { sql: '', args: [] };
  }
  return { sql: ` AND branch_id = ?`, args: [scope] };
}

function parseCrmTagsJson(raw) {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j.filter((t) => typeof t === 'string' && t.trim()) : [];
  } catch {
    return [];
  }
}

function parsePaymentRequestLineItemsJson(raw) {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function mapCustomerRow(row) {
  if (!row) return null;
  return {
    customerID: row.customer_id,
    name: row.name,
    phoneNumber: row.phone_number,
    email: row.email,
    addressShipping: row.address_shipping,
    addressBilling: row.address_billing,
    status: row.status,
    tier: row.tier,
    paymentTerms: row.payment_terms,
    createdBy: row.created_by,
    createdAtISO: row.created_at_iso,
    lastActivityISO: row.last_activity_iso,
    companyName: row.company_name ?? '',
    leadSource: row.lead_source ?? '',
    preferredContact: row.preferred_contact ?? '',
    followUpISO: row.follow_up_iso ?? '',
    crmTags: parseCrmTagsJson(row.crm_tags_json),
    crmProfileNotes: row.crm_profile_notes ?? '',
  };
}

export function listCustomers(db, branchScope = 'ALL') {
  const b = branchWhere(db, 'customers', branchScope);
  return db
    .prepare(`SELECT * FROM customers WHERE 1=1${b.sql} ORDER BY name COLLATE NOCASE`)
    .all(...b.args)
    .map((row) => mapCustomerRow(row));
}

export function getCustomer(db, customerId, branchScope = 'ALL') {
  const b = branchWhere(db, 'customers', branchScope);
  const row = db
    .prepare(`SELECT * FROM customers WHERE customer_id = ?${b.sql}`)
    .get(customerId, ...b.args);
  return mapCustomerRow(row);
}

export function listCustomerCrmInteractions(db, customerId, branchScope = 'ALL') {
  const b = branchWhere(db, 'customer_crm_interactions', branchScope);
  return db
    .prepare(
      `SELECT * FROM customer_crm_interactions WHERE customer_id = ?${b.sql} ORDER BY at_iso DESC, id DESC`
    )
    .all(customerId, ...b.args)
    .map((row) => ({
      id: row.id,
      customerID: row.customer_id,
      atIso: row.at_iso,
      kind: row.kind,
      title: row.title ?? '',
      detail: row.detail,
      createdByName: row.created_by_name ?? '',
    }));
}

function groupedFromQuotationLinesTableRows(rows) {
  const out = { products: [], accessories: [], services: [] };
  for (const r of rows) {
    const cat = r.category;
    if (!out[cat]) continue;
    out[cat].push({
      id: r.id,
      name: r.name,
      qty: String(r.qty ?? ''),
      unitPrice: String(r.unit_price_ngn ?? ''),
    });
  }
  return out;
}

function mapQuotationRow(row) {
  let quotationLines;
  let materialGauge = '';
  let materialColor = '';
  let materialDesign = '';
  try {
    const raw = row.lines_json;
    if (raw) {
      const j = JSON.parse(raw);
      if (j && typeof j === 'object') {
        if (typeof j.materialGauge === 'string') materialGauge = j.materialGauge;
        if (typeof j.materialColor === 'string') materialColor = j.materialColor;
        if (typeof j.materialDesign === 'string') materialDesign = j.materialDesign;
        if (
          Array.isArray(j.products) &&
          Array.isArray(j.accessories) &&
          Array.isArray(j.services)
        ) {
          quotationLines = {
            products: j.products,
            accessories: j.accessories,
            services: j.services,
          };
        }
      }
    }
  } catch {
    /* ignore */
  }
  return {
    id: row.id,
    customerID: row.customer_id,
    customer: row.customer_name,
    date: row.date_label,
    dateISO: row.date_iso,
    dueDateISO: row.due_date_iso,
    total: row.total_display,
    totalNgn: row.total_ngn,
    paidNgn: row.paid_ngn,
    paymentStatus: row.payment_status,
    status: row.status,
    approvalDate: row.approval_date,
    customerFeedback: row.customer_feedback,
    handledBy: row.handled_by,
    projectName: row.project_name || '',
    quotationLines,
    materialGauge,
    materialColor,
    materialDesign,
    branchId: row.branch_id ?? '',
    managerProductionApprovedAtISO: row.manager_production_approved_at_iso ?? null,
    managerClearedAtISO: row.manager_cleared_at_iso ?? null,
    managerFlaggedAtISO: row.manager_flagged_at_iso ?? null,
    managerFlagReason: row.manager_flag_reason ?? '',
  };
}

function enrichQuotationWithLineTable(db, mapped) {
  if (mapped.quotationLines) return mapped;
  const lr = db
    .prepare(`SELECT * FROM quotation_lines WHERE quotation_id = ? ORDER BY sort_order`)
    .all(mapped.id);
  if (lr.length) {
    return { ...mapped, quotationLines: groupedFromQuotationLinesTableRows(lr) };
  }
  return mapped;
}

export function listQuotations(db, branchScope = 'ALL') {
  const b = branchWhere(db, 'quotations', branchScope);
  return db
    .prepare(`SELECT * FROM quotations WHERE 1=1${b.sql} ORDER BY date_iso DESC, id DESC`)
    .all(...b.args)
    .map((row) => enrichQuotationWithLineTable(db, mapQuotationRow(row)));
}

export function getQuotation(db, id) {
  const row = db.prepare(`SELECT * FROM quotations WHERE id = ?`).get(id);
  if (!row) return null;
  return enrichQuotationWithLineTable(db, mapQuotationRow(row));
}

export function listManagementItems(db, branchScope = 'ALL') {
  const bQuo = branchWhere(db, 'quotations', branchScope);
  const bCL = branchWhere(db, 'cutting_lists', branchScope);
  const bRef = branchWhere(db, 'customer_refunds', branchScope);
  const bJob = branchWhere(db, 'production_jobs', branchScope);

  // 1. Quotations requiring clearance (Not cleared, not flagged yet, and has payments)
  const pendingClearance = db.prepare(`
    SELECT id, customer_name, total_ngn, paid_ngn, date_iso, status
    FROM quotations 
    WHERE manager_cleared_at_iso IS NULL 
      AND manager_flagged_at_iso IS NULL
      AND paid_ngn > 0
      ${bQuo.sql}
    ORDER BY date_iso DESC LIMIT 50
  `).all(...bQuo.args);

  // 2. Flagged transactions
  const flagged = db.prepare(`
    SELECT id, customer_name, total_ngn, manager_flag_reason, manager_flagged_at_iso
    FROM quotations 
    WHERE manager_flagged_at_iso IS NOT NULL
      ${bQuo.sql}
    ORDER BY manager_flagged_at_iso DESC LIMIT 50
  `).all(...bQuo.args);

  // 3. Production Overrides (70% threshold bypass requirements)
  const productionOverrides = db.prepare(`
    SELECT cl.id, cl.customer_name, cl.quotation_ref, cl.total_meters, q.paid_ngn, q.total_ngn
    FROM cutting_lists cl
    JOIN quotations q ON cl.quotation_ref = q.id
    WHERE cl.status = 'Draft' 
      AND (q.paid_ngn < (q.total_ngn * 0.7))
      AND q.manager_production_approved_at_iso IS NULL
      ${bCL.sql.replace('branch_id', 'cl.branch_id')}
    ORDER BY cl.date_iso DESC LIMIT 50
  `).all(...bCL.args);

  // 4. Refund Requests
  const pendingRefunds = db.prepare(`
    SELECT refund_id, customer_name, quotation_ref, amount_ngn, requested_at_iso, reason_category
    FROM customer_refunds
    WHERE status = 'Pending'
      ${bRef.sql}
    ORDER BY requested_at_iso DESC LIMIT 50
  `).all(...bRef.args);

  // 5. Payment requests pending approval (column is approval_status, not status)
  const pendingExpensesRaw = db.prepare(`
    SELECT pr.request_id, pr.expense_id, pr.amount_requested_ngn, pr.request_date, pr.description, pr.approval_status,
           pr.request_reference, pr.line_items_json, pr.attachment_name, pr.attachment_data_b64,
           e.category AS expense_category
    FROM payment_requests pr
    LEFT JOIN expenses e ON e.expense_id = pr.expense_id
    WHERE pr.approval_status = 'Pending'
    ORDER BY pr.request_date DESC LIMIT 50
  `).all();
  const pendingExpenses = pendingExpensesRaw.map((row) => ({
    request_id: row.request_id,
    expense_id: row.expense_id,
    amount_requested_ngn: row.amount_requested_ngn,
    request_date: row.request_date,
    description: row.description,
    approval_status: row.approval_status,
    request_reference: row.request_reference ?? '',
    line_items: parsePaymentRequestLineItemsJson(row.line_items_json),
    attachment_present: Boolean(row.attachment_data_b64 && String(row.attachment_data_b64).trim()),
    attachment_name: row.attachment_name ?? '',
    expense_category: row.expense_category ?? '',
  }));

  // 6. Completed production jobs awaiting conversion / manager review sign-off (High/Low or flag)
  const pendingConversionReviews = db.prepare(`
    SELECT job_id, cutting_list_id, quotation_ref, customer_name, product_name,
      conversion_alert_state, manager_review_required, actual_meters, actual_weight_kg, completed_at_iso
    FROM production_jobs
    WHERE status = 'Completed'
      AND (manager_review_signed_at_iso IS NULL OR TRIM(COALESCE(manager_review_signed_at_iso, '')) = '')
      AND (
        manager_review_required = 1
        OR UPPER(TRIM(COALESCE(conversion_alert_state, ''))) IN ('HIGH', 'LOW')
      )
      ${bJob.sql}
    ORDER BY completed_at_iso DESC
    LIMIT 50
  `).all(...bJob.args);

  return {
    pendingClearance,
    flagged,
    productionOverrides,
    pendingRefunds,
    pendingExpenses,
    pendingConversionReviews,
  };
}

const LEDGER_INFLOW_TYPES = new Set(['RECEIPT', 'ADVANCE_IN', 'OVERPAY_ADVANCE']);

export function listManagerQuotationAudit(db, quotationRef) {
  const qid = String(quotationRef || '').trim();
  if (!qid) {
    return {
      ok: false,
      error: 'quotationRef required',
      quotation: null,
      summary: null,
      ledgerEntries: [],
      receipts: [],
      cuttingLists: [],
      productionLogs: [],
      conversionChecks: [],
      jobCoils: [],
      refunds: [],
      totals: {
        cuttingListMetersSum: 0,
        completedProductionMetersSum: 0,
        productionJobsMetersSum: 0,
      },
    };
  }

  const quotation = getQuotation(db, qid);
  const qRow = db
    .prepare(
      `SELECT id, customer_name, total_ngn, paid_ngn, status, payment_status,
        manager_cleared_at_iso, manager_flagged_at_iso, manager_production_approved_at_iso
       FROM quotations WHERE id = ?`
    )
    .get(qid);

  const ledgerEntries = db
    .prepare(
      `SELECT id, at_iso, type, amount_ngn, payment_method, bank_reference, purpose, note, created_by_name
       FROM ledger_entries
       WHERE quotation_ref = ?
       ORDER BY at_iso ASC, id ASC`
    )
    .all(qid);

  const receipts = ledgerEntries.filter((e) => LEDGER_INFLOW_TYPES.has(String(e.type)));

  const cuttingLists = db
    .prepare(
      `SELECT id, date_iso, total_meters, status, handled_by
       FROM cutting_lists
       WHERE quotation_ref = ?
       ORDER BY date_iso DESC`
    )
    .all(qid);

  const cuttingListMetersSum = cuttingLists.reduce((s, cl) => s + (Number(cl.total_meters) || 0), 0);

  const productionLogs = db
    .prepare(
      `SELECT job_id, cutting_list_id, product_name, planned_meters, actual_meters, actual_weight_kg, status,
        conversion_alert_state, manager_review_required, completed_at_iso, operator_name,
        manager_review_signed_at_iso, manager_review_remark,
        start_date_iso, end_date_iso, machine_name, materials_note, created_at_iso
       FROM production_jobs
       WHERE quotation_ref = ?
       ORDER BY (completed_at_iso IS NULL), completed_at_iso DESC, created_at_iso DESC`
    )
    .all(qid);

  const jobIds = productionLogs.map((j) => j.job_id).filter(Boolean);
  let conversionChecks = [];
  let jobCoils = [];
  if (jobIds.length) {
    const ph = jobIds.map(() => '?').join(',');
    conversionChecks = db
      .prepare(
        `SELECT job_id, coil_no, alert_state, actual_conversion_kg_per_m, standard_conversion_kg_per_m,
          checked_at_iso, note, gauge_label, material_type_name
         FROM production_conversion_checks
         WHERE job_id IN (${ph})
         ORDER BY checked_at_iso DESC`
      )
      .all(...jobIds);
    jobCoils = db
      .prepare(
        `SELECT job_id, coil_no, meters_produced, consumed_weight_kg, opening_weight_kg, closing_weight_kg,
          actual_conversion_kg_per_m, sequence_no
         FROM production_job_coils
         WHERE job_id IN (${ph})
         ORDER BY job_id, sequence_no ASC`
      )
      .all(...jobIds);
  }

  const refunds = db
    .prepare(
      `SELECT refund_id, product, reason_category, amount_ngn, status, requested_at_iso, approved_amount_ngn,
        paid_amount_ngn, reason, calculation_notes, cutting_list_ref, manager_comments
       FROM customer_refunds
       WHERE quotation_ref = ?
       ORDER BY requested_at_iso DESC`
    )
    .all(qid);

  const orderTotal = Number(qRow?.total_ngn) || 0;
  const paid = Number(qRow?.paid_ngn) || 0;
  const outstanding = Math.max(0, orderTotal - paid);
  const completedMeters = productionLogs
    .filter((j) => String(j.status || '').toLowerCase() === 'completed')
    .reduce((s, j) => s + (Number(j.actual_meters) || 0), 0);
  const allJobMeters = productionLogs.reduce((s, j) => s + (Number(j.actual_meters) || 0), 0);

  return {
    ok: true,
    quotation,
    summary: qRow
      ? {
          orderTotalNgn: orderTotal,
          paidNgn: paid,
          outstandingNgn: outstanding,
          percentPaid: orderTotal > 0 ? Math.round((paid / orderTotal) * 1000) / 10 : null,
          status: qRow.status,
          paymentStatus: qRow.payment_status,
          managerClearedAtIso: qRow.manager_cleared_at_iso,
          managerFlaggedAtIso: qRow.manager_flagged_at_iso,
          managerProductionApprovedAtIso: qRow.manager_production_approved_at_iso,
        }
      : null,
    ledgerEntries,
    receipts,
    cuttingLists,
    productionLogs,
    conversionChecks,
    jobCoils,
    refunds,
    totals: {
      cuttingListMetersSum: cuttingListMetersSum,
      completedProductionMetersSum: completedMeters,
      productionJobsMetersSum: allJobMeters,
    },
  };
}

function listDeliveryLinesForId(db, deliveryId) {
  return db
    .prepare(`SELECT * FROM delivery_lines WHERE delivery_id = ? ORDER BY sort_order`)
    .all(deliveryId)
    .map((row) => ({
      lineNo: row.sort_order,
      productID: row.product_id,
      productName: row.product_name ?? row.product_id,
      qty: Number(row.qty) || 0,
      unit: row.unit || '',
      cuttingListLineNo: row.cutting_list_line_no ?? null,
    }));
}

function listCuttingListLinesForId(db, cuttingListId) {
  return db
    .prepare(`SELECT * FROM cutting_list_lines WHERE cutting_list_id = ? ORDER BY sort_order`)
    .all(cuttingListId)
    .map((row) => ({
      lineNo: row.sort_order,
      sheets: Number(row.sheets) || 0,
      lengthM: Number(row.length_m) || 0,
      totalM: Number(row.total_m) || 0,
      lineType: row.line_type || 'Roof',
    }));
}

function mapCuttingListRow(db, row) {
  const lines = listCuttingListLinesForId(db, row.id);
  const totalMeters =
    Number(row.total_meters) ||
    lines.reduce((sum, line) => sum + (Number(line.totalM) || 0), 0);
  const totalLabel =
    row.total_label ||
    `${totalMeters.toLocaleString('en-NG', {
      minimumFractionDigits: Number.isInteger(totalMeters) ? 0 : 2,
      maximumFractionDigits: 2,
    })} m`;
  return {
    id: row.id,
    customerID: row.customer_id,
    customer: row.customer_name,
    quotationRef: row.quotation_ref,
    productID: row.product_id ?? '',
    productName: row.product_name ?? '',
    date: row.date_label,
    dateISO: row.date_iso,
    sheetsToCut: Number(row.sheets_to_cut) || 0,
    totalMeters,
    total: totalLabel,
    status: row.status,
    machineName: row.machine_name ?? '',
    operatorName: row.operator_name ?? '',
    productionRegistered: Boolean(row.production_registered),
    productionRegisterRef: row.production_register_ref ?? '',
    handledBy: row.handled_by,
    lines,
    branchId: row.branch_id ?? '',
    productionReleasePending: Boolean(Number(row.production_release_pending)),
    productionReleasedAtISO: row.production_released_at_iso ?? '',
    productionReleasedBy: row.production_released_by ?? '',
  };
}

export function mapLedgerRow(row) {
  return {
    id: row.id,
    atISO: row.at_iso,
    type: row.type,
    customerID: row.customer_id,
    customerName: row.customer_name ?? undefined,
    amountNgn: row.amount_ngn,
    quotationRef: row.quotation_ref || '',
    paymentMethod: row.payment_method ?? undefined,
    bankReference: row.bank_reference ?? undefined,
    purpose: row.purpose ?? undefined,
    createdByUserId: row.created_by_user_id ?? '',
    createdByName: row.created_by_name ?? '',
    note: row.note ?? undefined,
    branchId: row.branch_id ?? '',
  };
}

export function listLedgerEntries(db, branchScope = 'ALL') {
  const b = branchWhere(db, 'ledger_entries', branchScope);
  return db
    .prepare(`SELECT * FROM ledger_entries WHERE 1=1${b.sql} ORDER BY at_iso DESC, id DESC`)
    .all(...b.args)
    .map(mapLedgerRow);
}

export function listLedgerEntriesForCustomer(db, customerId, branchScope = 'ALL') {
  const b = branchWhere(db, 'ledger_entries', branchScope);
  return db
    .prepare(
      `SELECT * FROM ledger_entries WHERE customer_id = ?${b.sql} ORDER BY at_iso DESC, id DESC`
    )
    .all(customerId, ...b.args)
    .map(mapLedgerRow);
}

export function listSuppliers(db, branchScope = 'ALL') {
  const b = branchWhere(db, 'suppliers', branchScope);
  return db
    .prepare(`SELECT * FROM suppliers WHERE 1=1${b.sql} ORDER BY name COLLATE NOCASE`)
    .all(...b.args)
    .map((row) => ({
      supplierID: row.supplier_id,
      name: row.name,
      city: row.city,
      paymentTerms: row.payment_terms,
      qualityScore: row.quality_score,
      notes: row.notes,
    }));
}

export function listTransportAgents(db, branchScope = 'ALL') {
  const b = branchWhere(db, 'transport_agents', branchScope);
  return db
    .prepare(`SELECT * FROM transport_agents WHERE 1=1${b.sql} ORDER BY name`)
    .all(...b.args)
    .map((row) => ({
      id: row.id,
      name: row.name,
      region: row.region,
      phone: row.phone,
    }));
}

export function listProducts(db, branchScope = 'ALL') {
  const b = branchWhere(db, 'products', branchScope);
  return db
    .prepare(`SELECT * FROM products WHERE 1=1${b.sql} ORDER BY name`)
    .all(...b.args)
    .map((row) => {
      let dashboardAttrs = {};
      try {
        dashboardAttrs = JSON.parse(row.dashboard_attrs_json || '{}');
      } catch {
        /* ignore */
      }
      return {
        productID: row.product_id,
        name: row.name,
        stockLevel: row.stock_level,
        unit: row.unit,
        lowStockThreshold: row.low_stock_threshold,
        reorderQty: row.reorder_qty,
        dashboardAttrs: {
          gauge: dashboardAttrs.gauge ?? row.gauge,
          colour: dashboardAttrs.colour ?? row.colour,
          materialType: dashboardAttrs.materialType ?? row.material_type,
        },
      };
    });
}

export function listPurchaseOrders(db, branchScope = 'ALL') {
  const b = branchWhere(db, 'purchase_orders', branchScope);
  const pos = db
    .prepare(`SELECT * FROM purchase_orders WHERE 1=1${b.sql} ORDER BY order_date_iso DESC`)
    .all(...b.args);
  const lineStmt = db.prepare(`SELECT * FROM purchase_order_lines WHERE po_id = ? ORDER BY line_key`);
  return pos.map((row) => ({
    poID: row.po_id,
    supplierID: row.supplier_id,
    supplierName: row.supplier_name,
    orderDateISO: row.order_date_iso,
    expectedDeliveryISO: row.expected_delivery_iso,
    status: row.status,
    invoiceNo: row.invoice_no ?? '',
    invoiceDateISO: row.invoice_date_iso ?? '',
    deliveryDateISO: row.delivery_date_iso ?? '',
    transportAgentId: row.transport_agent_id ?? '',
    transportAgentName: row.transport_agent_name ?? '',
    transportReference: row.transport_reference ?? '',
    transportNote: row.transport_note ?? '',
    transportTreasuryMovementId: row.transport_treasury_movement_id ?? '',
    transportAmountNgn: Number(row.transport_amount_ngn) || 0,
    transportPaid: Boolean(row.transport_paid),
    transportPaidAtISO: row.transport_paid_at_iso ?? '',
    supplierPaidNgn: row.supplier_paid_ngn ?? 0,
    lines: lineStmt.all(row.po_id).map((l) => ({
      lineKey: l.line_key,
      productID: l.product_id,
      productName: l.product_name,
      color: l.color ?? '',
      gauge: l.gauge ?? '',
      metersOffered: l.meters_offered,
      conversionKgPerM: l.conversion_kg_per_m,
      unitPricePerKgNgn: l.unit_price_per_kg_ngn,
      unitPriceNgn: l.unit_price_ngn,
      qtyOrdered: l.qty_ordered,
      qtyReceived: l.qty_received,
    })),
  }));
}

export function listCoilLots(db, branchScope = 'ALL') {
  const b = branchWhere(db, 'coil_lots', branchScope);
  return db
    .prepare(`SELECT * FROM coil_lots WHERE 1=1${b.sql} ORDER BY received_at_iso DESC, coil_no DESC`)
    .all(...b.args)
    .map((row) => ({
      coilNo: row.coil_no,
      productID: row.product_id,
      lineKey: row.line_key,
      qtyReceived: row.qty_received,
      weightKg: row.weight_kg,
      colour: row.colour ?? '',
      gaugeLabel: row.gauge_label ?? '',
      materialTypeName: row.material_type_name ?? '',
      supplierExpectedMeters: row.supplier_expected_meters,
      supplierConversionKgPerM: row.supplier_conversion_kg_per_m,
      qtyRemaining: Number(row.qty_remaining) || 0,
      qtyReserved: Number(row.qty_reserved) || 0,
      currentWeightKg: Number(row.current_weight_kg) || 0,
      currentStatus: row.current_status ?? 'Available',
      location: row.location,
      poID: row.po_id,
      supplierID: row.supplier_id,
      supplierName: row.supplier_name,
      receivedAtISO: row.received_at_iso,
      branchId: row.branch_id ?? '',
      parentCoilNo: row.parent_coil_no ?? '',
      materialOriginNote: row.material_origin_note ?? '',
      landedCostNgn: row.landed_cost_ngn != null ? Number(row.landed_cost_ngn) : null,
      unitCostNgnPerKg: row.unit_cost_ngn_per_kg != null ? Number(row.unit_cost_ngn_per_kg) : null,
    }));
}

export function listStockMovements(db) {
  return db
    .prepare(`SELECT * FROM stock_movements ORDER BY at_iso DESC, id DESC`)
    .all()
    .map((row) => ({
      id: row.id,
      atISO: row.at_iso,
      type: row.type,
      ref: row.ref,
      productID: row.product_id,
      qty: row.qty,
      detail: row.detail,
      dateISO: row.date_iso,
      unitPriceNgn: row.unit_price_ngn,
      valueNgn: row.value_ngn != null ? Number(row.value_ngn) : null,
    }));
}

export function getWipByProduct(db) {
  const rows = db.prepare(`SELECT * FROM wip_balances`).all();
  const o = {};
  for (const r of rows) o[r.product_id] = r.qty;
  return o;
}

export function listDeliveries(db, branchScope = 'ALL') {
  const b = branchWhere(db, 'deliveries', branchScope);
  return db
    .prepare(`SELECT * FROM deliveries WHERE 1=1${b.sql} ORDER BY id DESC`)
    .all(...b.args)
    .map((row) => {
      const lines = listDeliveryLinesForId(db, row.id);
      return {
        id: row.id,
        quotationRef: row.quotation_ref,
        customerID: row.customer_id ?? '',
        customer: row.customer_name,
        cuttingListId: row.cutting_list_id ?? '',
        destination: row.destination,
        method: row.method,
        status: row.status,
        trackingNo: row.tracking_no,
        shipDate: row.ship_date,
        eta: row.eta,
        deliveredDateISO: row.delivered_date_iso,
        podNotes: row.pod_notes,
        courierConfirmed: Boolean(row.courier_confirmed),
        customerSignedPod: Boolean(row.customer_signed_pod),
        fulfillmentPosted: Boolean(row.fulfillment_posted),
        lineCount: lines.length,
        totalQty: lines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0),
        lines,
      };
    });
}

export function listSalesReceipts(db, branchScope = 'ALL') {
  const b = branchWhere(db, 'sales_receipts', branchScope);
  return db
    .prepare(`SELECT * FROM sales_receipts WHERE 1=1${b.sql} ORDER BY date_iso DESC, id DESC`)
    .all(...b.args)
    .map((row) => ({
      id: row.id,
      customerID: row.customer_id,
      customer: row.customer_name,
      quotationRef: row.quotation_ref,
      date: row.date_label,
      dateISO: row.date_iso,
      amount: row.amount_display,
      amountNgn: row.amount_ngn,
      method: row.method,
      status: row.status,
      handledBy: row.handled_by,
      ledgerEntryId: row.ledger_entry_id ?? null,
    }));
}

/** Advance deposits (ADVANCE_IN) mirrored at post time — query-friendly; balances still from ledger math. */
export function listAdvanceInEvents(db) {
  return db
    .prepare(`SELECT * FROM advance_in_events ORDER BY at_iso DESC, ledger_entry_id DESC`)
    .all()
    .map((row) => ({
      ledgerEntryId: row.ledger_entry_id,
      customerID: row.customer_id,
      customerName: row.customer_name,
      amountNgn: row.amount_ngn,
      atISO: row.at_iso,
      paymentMethod: row.payment_method,
      bankReference: row.bank_reference,
      purpose: row.purpose,
    }));
}

export function listCuttingLists(db, branchScope = 'ALL') {
  const b = branchWhere(db, 'cutting_lists', branchScope);
  return db
    .prepare(`SELECT * FROM cutting_lists WHERE 1=1${b.sql} ORDER BY date_iso DESC`)
    .all(...b.args)
    .map((row) => mapCuttingListRow(db, row));
}

export function getCuttingList(db, id) {
  const row = db.prepare(`SELECT * FROM cutting_lists WHERE id = ?`).get(id);
  if (!row) return null;
  return mapCuttingListRow(db, row);
}

export function listProductionJobs(db, branchScope = 'ALL') {
  const b = branchWhere(db, 'production_jobs', branchScope);
  return db
    .prepare(`SELECT * FROM production_jobs WHERE 1=1${b.sql} ORDER BY created_at_iso DESC, job_id DESC`)
    .all(...b.args)
    .map((row) => ({
      jobID: row.job_id,
      cuttingListId: row.cutting_list_id ?? '',
      quotationRef: row.quotation_ref ?? '',
      customerID: row.customer_id ?? '',
      customerName: row.customer_name ?? '',
      productID: row.product_id ?? '',
      productName: row.product_name ?? '',
      plannedMeters: Number(row.planned_meters) || 0,
      plannedSheets: Number(row.planned_sheets) || 0,
      machineName: row.machine_name ?? '',
      startDateISO: row.start_date_iso ?? '',
      endDateISO: row.end_date_iso ?? '',
      materialsNote: row.materials_note ?? '',
      status: row.status ?? 'Planned',
      createdAtISO: row.created_at_iso,
      completedAtISO: row.completed_at_iso ?? '',
      actualMeters: Number(row.actual_meters) || 0,
      actualWeightKg: Number(row.actual_weight_kg) || 0,
      conversionAlertState: row.conversion_alert_state ?? 'Pending',
      managerReviewRequired: Boolean(row.manager_review_required),
      managerReviewSignedAtISO: row.manager_review_signed_at_iso ?? '',
      managerReviewSignedByUserId: row.manager_review_signed_by_user_id ?? '',
      managerReviewSignedByName: row.manager_review_signed_by_name ?? '',
      managerReviewRemark: row.manager_review_remark ?? '',
      operatorName: row.operator_name ?? '',
      branchId: row.branch_id ?? '',
    }));
}

export function listProductionJobAccessoryUsage(db, branchScope = 'ALL') {
  const b = branchWhere(db, 'production_jobs', branchScope);
  const branchSql = b.sql ? b.sql.replace(/\bbranch_id\b/g, 'j.branch_id') : '';
  const rows = db
    .prepare(
      `SELECT u.id AS id, u.job_id AS job_id, u.quotation_ref AS quotation_ref, u.quote_line_id AS quote_line_id,
              u.name AS name, u.ordered_qty AS ordered_qty, u.supplied_qty AS supplied_qty,
              u.inventory_product_id AS inventory_product_id, u.posted_at_iso AS posted_at_iso
       FROM production_job_accessory_usage u
       INNER JOIN production_jobs j ON j.job_id = u.job_id
       WHERE 1=1${branchSql}
       ORDER BY u.posted_at_iso DESC`
    )
    .all(...b.args);
  return rows.map((row) => ({
    id: row.id,
    jobID: row.job_id,
    quotationRef: row.quotation_ref ?? '',
    quoteLineId: row.quote_line_id ?? '',
    name: row.name ?? '',
    orderedQty: Number(row.ordered_qty) || 0,
    suppliedQty: Number(row.supplied_qty) || 0,
    inventoryProductId: row.inventory_product_id ?? '',
    postedAtISO: row.posted_at_iso ?? '',
  }));
}

/** Receipts, cutting lists, and produced metres for the refund modal “Transaction Intelligence” panel. */
export function getRefundIntelligenceForQuotation(db, quotationRef, branchScope = 'ALL') {
  const ref = String(quotationRef || '').trim();
  if (!ref) {
    return {
      receipts: [],
      cuttingLists: [],
      summary: { producedMeters: 0, accessoriesSummary: { lines: [] } },
    };
  }
  const receipts = listSalesReceipts(db, branchScope)
    .filter((r) => String(r.quotationRef || '').trim() === ref)
    .map((r) => ({ id: r.id, amountNgn: r.amountNgn }));
  const cuttingLists = listCuttingLists(db, branchScope).filter(
    (cl) => String(cl.quotationRef || '').trim() === ref
  );
  const jobs = listProductionJobs(db, branchScope).filter(
    (j) => String(j.quotationRef || '').trim() === ref
  );
  const producedMeters = jobs.reduce((sum, j) => sum + (Number(j.actualMeters) || 0), 0);
  const accLines = accessoryFulfillmentSummaryForQuotation(db, ref);
  return {
    receipts,
    cuttingLists,
    summary: {
      producedMeters,
      accessoriesSummary: { lines: accLines },
    },
  };
}

export function listRefunds(db, branchScope = 'ALL') {
  const payoutStmt = db.prepare(
    `SELECT tm.*, ta.name AS account_name
     FROM treasury_movements tm
     LEFT JOIN treasury_accounts ta ON ta.id = tm.treasury_account_id
     WHERE tm.source_kind = 'REFUND' AND tm.source_id = ?
     ORDER BY tm.posted_at_iso ASC, tm.id ASC`
  );
  const b = branchWhere(db, 'customer_refunds', branchScope);
  return db
    .prepare(`SELECT * FROM customer_refunds WHERE 1=1${b.sql} ORDER BY requested_at_iso DESC`)
    .all(...b.args)
    .map((row) => {
      let calculationLines = [];
      let suggestedLines = [];
      try {
        calculationLines = JSON.parse(row.calculation_lines_json || '[]');
      } catch {
        /* ignore */
      }
      try {
        suggestedLines = JSON.parse(row.suggested_lines_json || '[]');
      } catch {
        /* ignore */
      }
      const approvedAmountNgn = row.approved_amount_ngn != null ? Number(row.approved_amount_ngn) || 0 : 0;
      const paidAmountNgn = Number(row.paid_amount_ngn) || 0;
      const finalApprovedAmountNgn =
        row.status === 'Approved' || row.status === 'Paid'
          ? approvedAmountNgn || Number(row.amount_ngn) || 0
          : approvedAmountNgn;
      const payoutHistory = payoutStmt.all(row.refund_id).map((movement) => ({
        id: movement.id,
        postedAtISO: movement.posted_at_iso,
        treasuryAccountId: movement.treasury_account_id,
        accountName: movement.account_name ?? '',
        amountNgn: Math.abs(Number(movement.amount_ngn) || 0),
        reference: movement.reference ?? '',
        note: movement.note ?? '',
      }));
      return {
        refundID: row.refund_id,
        customerID: row.customer_id,
        customer: row.customer_name,
        quotationRef: row.quotation_ref,
        cuttingListRef: row.cutting_list_ref,
        product: row.product,
        reasonCategory: row.reason_category,
        reason: row.reason,
        amountNgn: row.amount_ngn,
        calculationLines,
        suggestedLines,
        calculationNotes: row.calculation_notes,
        status: row.status,
        requestedBy: row.requested_by,
        requestedAtISO: row.requested_at_iso,
        approvalDate: row.approval_date,
        approvedBy: row.approved_by,
        approvedAmountNgn: finalApprovedAmountNgn,
        managerComments: row.manager_comments,
        paidAmountNgn,
        paidAtISO: row.paid_at_iso,
        paidBy: row.paid_by,
        paymentNote: row.payment_note ?? '',
        payoutHistory,
        branchId: row.branch_id ?? '',
      };
    });
}

export function listTreasuryAccounts(db) {
  return db
    .prepare(`SELECT * FROM treasury_accounts ORDER BY id`)
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      bankName: row.bank_name,
      balance: row.balance,
      type: row.type,
      accNo: row.acc_no,
    }));
}

export function listTreasuryMovements(db) {
  return db
    .prepare(
      `SELECT tm.*, ta.name AS account_name, ta.type AS account_type, ta.acc_no AS account_no
       FROM treasury_movements tm
       LEFT JOIN treasury_accounts ta ON ta.id = tm.treasury_account_id
       ORDER BY tm.posted_at_iso DESC, tm.id DESC`
    )
    .all()
    .map((row) => ({
      id: row.id,
      postedAtISO: row.posted_at_iso,
      type: row.type,
      treasuryAccountId: row.treasury_account_id,
      accountName: row.account_name ?? '',
      accountType: row.account_type ?? '',
      accountNo: row.account_no ?? '',
      amountNgn: row.amount_ngn,
      reference: row.reference ?? '',
      counterpartyKind: row.counterparty_kind ?? '',
      counterpartyId: row.counterparty_id ?? '',
      counterpartyName: row.counterparty_name ?? '',
      sourceKind: row.source_kind ?? '',
      sourceId: row.source_id ?? '',
      note: row.note ?? '',
      createdBy: row.created_by ?? '',
      reversesMovementId: row.reverses_movement_id ?? '',
      batchId: row.batch_id ?? '',
    }));
}

export function listExpenses(db, branchScope = 'ALL') {
  const b = branchWhere(db, 'expenses', branchScope);
  return db
    .prepare(`SELECT * FROM expenses WHERE 1=1${b.sql} ORDER BY date DESC`)
    .all(...b.args)
    .map((row) => ({
      expenseID: row.expense_id,
      expenseType: row.expense_type,
      amountNgn: row.amount_ngn,
      date: row.date,
      category: row.category,
      paymentMethod: row.payment_method,
      reference: row.reference,
      branchId: row.branch_id ?? '',
    }));
}

export function listPaymentRequests(db, branchScope = 'ALL') {
  const useScope = branchScope !== 'ALL' && String(branchScope || '').trim();
  const scopeSql = useScope ? ` AND (e.branch_id = ? OR e.branch_id IS NULL)` : '';
  const scopeArgs = useScope ? [branchScope] : [];
  return db
    .prepare(
      `SELECT pr.*, e.branch_id AS expense_branch_id, e.category AS expense_category, e.reference AS expense_reference,
              hr.user_id AS staff_user_id, u.display_name AS staff_display_name
       FROM payment_requests pr
       LEFT JOIN expenses e ON e.expense_id = pr.expense_id
       LEFT JOIN hr_requests hr ON hr.id = e.reference
       LEFT JOIN app_users u ON u.id = hr.user_id
       WHERE 1=1${scopeSql}
       ORDER BY pr.request_date DESC`
    )
    .all(...scopeArgs)
    .map((row) => {
      const b64 = row.attachment_data_b64;
      const hasAttachment = Boolean(b64 && String(b64).length > 0);
      return {
        requestID: row.request_id,
        expenseID: row.expense_id,
        amountRequestedNgn: row.amount_requested_ngn,
        requestDate: row.request_date,
        approvalStatus: row.approval_status,
        description: row.description,
        approvedBy: row.approved_by ?? '',
        approvedAtISO: row.approved_at_iso ?? '',
        approvalNote: row.approval_note ?? '',
        paidAmountNgn: row.paid_amount_ngn ?? 0,
        paidAtISO: row.paid_at_iso ?? '',
        paidBy: row.paid_by ?? '',
        paymentNote: row.payment_note ?? '',
        branchId: row.expense_branch_id ?? '',
        expenseCategory: row.expense_category ?? '',
        isStaffLoan: String(row.expense_category || '').toLowerCase().includes('staff loan'),
        hrRequestId: row.expense_reference ?? '',
        staffUserId: row.staff_user_id ?? '',
        staffDisplayName: row.staff_display_name ?? '',
        requestReference: row.request_reference ?? '',
        lineItems: parsePaymentRequestLineItemsJson(row.line_items_json),
        attachmentName: row.attachment_name ?? '',
        attachmentMime: row.attachment_mime ?? '',
        attachmentPresent: hasAttachment,
      };
    });
}

export function listAccountsPayable(db, branchScope = 'ALL') {
  const b = branchPredicate(db, 'purchase_orders', branchScope, 'po');
  return db
    .prepare(
      `SELECT ap.* FROM accounts_payable ap
       LEFT JOIN purchase_orders po ON po.po_id = ap.po_ref
       WHERE 1=1${b.sql}
       ORDER BY ap.due_date_iso DESC`
    )
    .all(...b.args)
    .map((row) => ({
      apID: row.ap_id,
      supplierName: row.supplier_name,
      poRef: row.po_ref,
      invoiceRef: row.invoice_ref,
      amountNgn: row.amount_ngn,
      paidNgn: row.paid_ngn,
      dueDateISO: row.due_date_iso,
      paymentMethod: row.payment_method,
    }));
}

export function listBankReconciliation(db, branchScope = 'ALL') {
  const b = branchWhere(db, 'bank_reconciliation_lines', branchScope);
  return db
    .prepare(`SELECT * FROM bank_reconciliation_lines WHERE 1=1${b.sql} ORDER BY bank_date_iso DESC`)
    .all(...b.args)
    .map((row) => ({
      id: row.id,
      bankDateISO: row.bank_date_iso,
      description: row.description,
      amountNgn: row.amount_ngn,
      systemMatch: row.system_match,
      status: row.status,
      branchId: row.branch_id || '',
    }));
}

export function listCoilRequests(db) {
  return db
    .prepare(`SELECT * FROM coil_requests ORDER BY created_at_iso DESC`)
    .all()
    .map((row) => ({
      id: row.id,
      status: row.status,
      createdAtISO: row.created_at_iso,
      acknowledgedAtISO: row.acknowledged_at_iso,
      gauge: row.gauge,
      colour: row.colour,
      materialType: row.material_type,
      requestedKg: row.requested_kg,
      note: row.note,
    }));
}

export function listYardCoils(db) {
  return db
    .prepare(`SELECT * FROM yard_coils ORDER BY id`)
    .all()
    .map((row) => ({
      id: row.id,
      colour: row.colour,
      gaugeLabel: row.gauge_label,
      materialType: row.material_type,
      weightKg: row.weight_kg,
      loc: row.loc,
    }));
}

export function listProcurementCatalog(db) {
  return db
    .prepare(`SELECT * FROM procurement_catalog ORDER BY id`)
    .all()
    .map((row) => ({
      id: row.id,
      color: row.color,
      gauge: row.gauge,
      productID: row.product_id,
      offerKg: row.offer_kg,
      offerMeters: row.offer_meters,
      conversionKgPerM: row.conversion_kg_per_m,
      label: row.label,
    }));
}

export function listAppUsers(db) {
  return db
    .prepare(`SELECT * FROM app_users ORDER BY display_name COLLATE NOCASE, username COLLATE NOCASE`)
    .all()
    .map((row) => {
      const u = publicUserFromRow(row);
      const rawJson = row.permissions_json ?? row.permissionsJson;
      let hasCustomPermissions = false;
      if (rawJson && String(rawJson).trim()) {
        try {
          const p = JSON.parse(rawJson);
          hasCustomPermissions = Array.isArray(p);
        } catch {
          /* ignore */
        }
      }
      return {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        email: u.email && String(u.email).trim() ? String(u.email).trim().toLowerCase() : '',
        roleKey: u.roleKey,
        department: u.department,
        status: u.status,
        permissions: u.permissions,
        hasCustomPermissions,
        lastLoginAtISO: u.lastLoginAtISO || '',
        createdAtISO: u.createdAtISO || row.created_at_iso || '',
      };
    });
}

export function listPeriodLocks(db) {
  return db
    .prepare(`SELECT * FROM accounting_period_locks ORDER BY period_key DESC`)
    .all()
    .map((row) => ({
      periodKey: row.period_key,
      lockedFromISO: row.locked_from_iso,
      lockedAtISO: row.locked_at_iso,
      lockedByUserId: row.locked_by_user_id ?? '',
      lockedByName: row.locked_by_name ?? '',
      reason: row.reason ?? '',
    }));
}

export function listApprovalActions(db, limit = 120) {
  return db
    .prepare(`SELECT * FROM approval_actions ORDER BY acted_at_iso DESC, id DESC LIMIT ?`)
    .all(limit)
    .map((row) => ({
      id: row.id,
      entityKind: row.entity_kind,
      entityId: row.entity_id,
      action: row.action,
      status: row.status,
      note: row.note ?? '',
      actedAtISO: row.acted_at_iso,
      actedByUserId: row.acted_by_user_id ?? '',
      actedByName: row.acted_by_name ?? '',
    }));
}

export function listAuditLog(db, limit = 120) {
  return db
    .prepare(`SELECT * FROM audit_log ORDER BY occurred_at_iso DESC, id DESC LIMIT ?`)
    .all(limit)
    .map((row) => {
      let details = null;
      try {
        details = row.details_json ? JSON.parse(row.details_json) : null;
      } catch {
        details = null;
      }
      return {
        id: row.id,
        occurredAtISO: row.occurred_at_iso,
        actorUserId: row.actor_user_id ?? '',
        actorName: row.actor_name ?? '',
        action: row.action,
        entityKind: row.entity_kind ?? '',
        entityId: row.entity_id ?? '',
        status: row.status,
        note: row.note ?? '',
        details,
      };
    });
}

/** Chronological export rows for compliance download (cap for safety). */
export function listAuditLogNdjsonRows(db, maxRows = 250000) {
  return db
    .prepare(`SELECT * FROM audit_log ORDER BY occurred_at_iso ASC, id ASC LIMIT ?`)
    .all(maxRows)
    .map((row) => ({
      id: row.id,
      occurredAtISO: row.occurred_at_iso,
      actorUserId: row.actor_user_id ?? '',
      actorName: row.actor_name ?? '',
      action: row.action,
      entityKind: row.entity_kind ?? '',
      entityId: row.entity_id ?? '',
      status: row.status,
      note: row.note ?? '',
      detailsJson: row.details_json ?? null,
    }));
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string | import('./branchScope.js').BranchScope} [branchScope]
 */
export function computeProductionMetricsRollup(db, branchScope = 'ALL') {
  const b = branchWhere(db, 'production_jobs', branchScope);
  const rows = db
    .prepare(
      `SELECT status,
              COALESCE(SUM(planned_meters), 0) AS planned_m,
              COALESCE(SUM(actual_meters), 0) AS actual_m,
              COUNT(*) AS cnt
         FROM production_jobs WHERE 1=1${b.sql}
         GROUP BY status`
    )
    .all(...b.args);
  const byStatus = {};
  let totalPlannedMeters = 0;
  let totalActualMeters = 0;
  let completedActualMeters = 0;
  let jobCount = 0;
  for (const r of rows) {
    const st = String(r.status || 'Unknown');
    const pm = Number(r.planned_m) || 0;
    const am = Number(r.actual_m) || 0;
    const cnt = Number(r.cnt) || 0;
    byStatus[st] = { count: cnt, plannedMeters: pm, actualMeters: am };
    totalPlannedMeters += pm;
    totalActualMeters += am;
    jobCount += cnt;
    if (st === 'Completed') completedActualMeters += am;
  }
  return {
    jobCount,
    byStatus,
    totalPlannedMeters,
    totalActualMeters,
    completedActualMeters,
  };
}

/**
 * Branch-scoped aggregate counts for reports (no row payloads).
 * @param {import('better-sqlite3').Database} db
 * @param {string | import('./branchScope.js').BranchScope} [branchScope]
 */
export function workspaceReportAggregateCounts(db, branchScope = 'ALL') {
  const countWhere = (table) => {
    const b = branchWhere(db, table, branchScope);
    const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE 1=1${b.sql}`).get(...b.args);
    return Number(row?.c) || 0;
  };
  const countAll = (table) => Number(db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get()?.c) || 0;
  return {
    customersTotal: countAll('customers'),
    suppliersTotal: countAll('suppliers'),
    productsTotal: countAll('products'),
    quotationsTotal: countWhere('quotations'),
    receiptsTotal: countWhere('sales_receipts'),
    purchaseOrdersTotal: countWhere('purchase_orders'),
    deliveriesTotal: countWhere('deliveries'),
    cuttingListsTotal: countWhere('cutting_lists'),
    ledgerEntriesTotal: countWhere('ledger_entries'),
    refundsTotal: countWhere('customer_refunds'),
    expensesTotal: countWhere('expenses'),
    productionJobsTotal: countWhere('production_jobs'),
    coilLotsTotal: countWhere('coil_lots'),
    stockMovementsTotal: countWhere('stock_movements'),
    treasuryMovementsTotal: countAll('treasury_movements'),
  };
}

/**
 * Dashboard-only payload: aggregates + small recent slices.
 * Keep this fast and stable for caching.
 * @param {import('better-sqlite3').Database} db
 * @param {string | import('./branchScope.js').BranchScope} [branchScope]
 * @param {{ recentLimit?: number }} [opts]
 */
export function dashboardSummary(db, branchScope = 'ALL', opts = {}) {
  const recentLimit = Math.max(1, Math.min(100, Number(opts.recentLimit) || 12));
  const counts = workspaceReportAggregateCounts(db, branchScope);
  const productionMetrics = computeProductionMetricsRollup(db, branchScope);

  const rq = branchWhere(db, 'quotations', branchScope);
  const recentQuotations = db
    .prepare(`SELECT id, customer_id, customer_name, date_iso, total_ngn, status FROM quotations WHERE 1=1${rq.sql} ORDER BY date_iso DESC, id DESC LIMIT ?`)
    .all(...rq.args, recentLimit)
    .map((row) => ({
      id: row.id,
      customerID: row.customer_id ?? '',
      customer: row.customer_name ?? '',
      dateISO: row.date_iso ?? '',
      totalNgn: Number(row.total_ngn) || 0,
      status: row.status ?? '',
    }));

  const rr = branchWhere(db, 'sales_receipts', branchScope);
  const recentReceipts = db
    .prepare(
      `SELECT id, customer_id, customer_name, quotation_ref, date_iso, amount_ngn, method, status
         FROM sales_receipts WHERE 1=1${rr.sql}
         ORDER BY date_iso DESC, id DESC
         LIMIT ?`
    )
    .all(...rr.args, recentLimit)
    .map((row) => ({
      id: row.id,
      customerID: row.customer_id ?? '',
      customer: row.customer_name ?? '',
      quotationRef: row.quotation_ref ?? '',
      dateISO: row.date_iso ?? '',
      amountNgn: Number(row.amount_ngn) || 0,
      method: row.method ?? '',
      status: row.status ?? '',
    }));

  return {
    ok: true,
    branchScope,
    counts,
    productionMetrics,
    recent: {
      quotations: recentQuotations,
      receipts: recentReceipts,
    },
  };
}

export function getJsonBlob(db, key) {
  const row = db.prepare(`SELECT payload FROM app_json_blobs WHERE key = ?`).get(key);
  if (!row) return null;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

export function setJsonBlob(db, key, value) {
  const payload = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  db.prepare(`INSERT OR REPLACE INTO app_json_blobs (key, payload) VALUES (?,?)`).run(key, payload);
}
