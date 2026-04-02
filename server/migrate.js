import { mapLegacyExpenseCategoryToCanonical, isAllowedExpenseCategory } from '../shared/expenseCategories.js';
import { seedDefaultGlAccounts } from './glOps.js';

/**
 * Idempotent SQLite migrations for existing DB files (CREATE IF NOT EXISTS misses new columns).
 * @param {import('better-sqlite3').Database} db
 */
export function runMigrations(db) {
  const tableCols = (name) => {
    const rows = db.prepare(`PRAGMA table_info(${name})`).all();
    return new Set(rows.map((c) => c.name));
  };

  const q = tableCols('quotations');
  if (!q.has('project_name')) {
    db.exec(`ALTER TABLE quotations ADD COLUMN project_name TEXT`);
  }
  if (!q.has('lines_json')) {
    db.exec(`ALTER TABLE quotations ADD COLUMN lines_json TEXT`);
  }
  if (!q.has('manager_cleared_at_iso')) {
    db.exec(`ALTER TABLE quotations ADD COLUMN manager_cleared_at_iso TEXT`);
  }
  if (!q.has('manager_flagged_at_iso')) {
    db.exec(`ALTER TABLE quotations ADD COLUMN manager_flagged_at_iso TEXT`);
  }
  if (!q.has('manager_flag_reason')) {
    db.exec(`ALTER TABLE quotations ADD COLUMN manager_flag_reason TEXT`);
  }
  if (!q.has('manager_production_approved_at_iso')) {
    db.exec(`ALTER TABLE quotations ADD COLUMN manager_production_approved_at_iso TEXT`);
  }

  const r = tableCols('sales_receipts');
  if (!r.has('ledger_entry_id')) {
    db.exec(`ALTER TABLE sales_receipts ADD COLUMN ledger_entry_id TEXT`);
  }

  const ledger = tableCols('ledger_entries');
  if (!ledger.has('created_by_user_id')) {
    db.exec(`ALTER TABLE ledger_entries ADD COLUMN created_by_user_id TEXT`);
  }
  if (!ledger.has('created_by_name')) {
    db.exec(`ALTER TABLE ledger_entries ADD COLUMN created_by_name TEXT`);
  }

  const payReq = tableCols('payment_requests');
  if (!payReq.has('approved_by')) {
    db.exec(`ALTER TABLE payment_requests ADD COLUMN approved_by TEXT`);
  }
  if (!payReq.has('approved_at_iso')) {
    db.exec(`ALTER TABLE payment_requests ADD COLUMN approved_at_iso TEXT`);
  }
  if (!payReq.has('approval_note')) {
    db.exec(`ALTER TABLE payment_requests ADD COLUMN approval_note TEXT`);
  }
  if (!payReq.has('paid_amount_ngn')) {
    db.exec(`ALTER TABLE payment_requests ADD COLUMN paid_amount_ngn INTEGER DEFAULT 0`);
  }
  if (!payReq.has('paid_at_iso')) {
    db.exec(`ALTER TABLE payment_requests ADD COLUMN paid_at_iso TEXT`);
  }
  if (!payReq.has('paid_by')) {
    db.exec(`ALTER TABLE payment_requests ADD COLUMN paid_by TEXT`);
  }
  if (!payReq.has('payment_note')) {
    db.exec(`ALTER TABLE payment_requests ADD COLUMN payment_note TEXT`);
  }
  if (!payReq.has('request_reference')) {
    db.exec(`ALTER TABLE payment_requests ADD COLUMN request_reference TEXT`);
  }
  if (!payReq.has('line_items_json')) {
    db.exec(`ALTER TABLE payment_requests ADD COLUMN line_items_json TEXT`);
  }
  if (!payReq.has('attachment_name')) {
    db.exec(`ALTER TABLE payment_requests ADD COLUMN attachment_name TEXT`);
  }
  if (!payReq.has('attachment_mime')) {
    db.exec(`ALTER TABLE payment_requests ADD COLUMN attachment_mime TEXT`);
  }
  if (!payReq.has('attachment_data_b64')) {
    db.exec(`ALTER TABLE payment_requests ADD COLUMN attachment_data_b64 TEXT`);
  }

  const deliveries = tableCols('deliveries');
  if (!deliveries.has('customer_id')) {
    db.exec(`ALTER TABLE deliveries ADD COLUMN customer_id TEXT`);
  }
  if (!deliveries.has('cutting_list_id')) {
    db.exec(`ALTER TABLE deliveries ADD COLUMN cutting_list_id TEXT`);
  }
  if (!deliveries.has('fulfillment_posted')) {
    db.exec(`ALTER TABLE deliveries ADD COLUMN fulfillment_posted INTEGER DEFAULT 0`);
  }

  const cutting = tableCols('cutting_lists');
  if (!cutting.has('product_id')) {
    db.exec(`ALTER TABLE cutting_lists ADD COLUMN product_id TEXT`);
  }
  if (!cutting.has('product_name')) {
    db.exec(`ALTER TABLE cutting_lists ADD COLUMN product_name TEXT`);
  }
  if (!cutting.has('sheets_to_cut')) {
    db.exec(`ALTER TABLE cutting_lists ADD COLUMN sheets_to_cut REAL DEFAULT 0`);
  }
  if (!cutting.has('total_meters')) {
    db.exec(`ALTER TABLE cutting_lists ADD COLUMN total_meters REAL DEFAULT 0`);
  }
  if (!cutting.has('machine_name')) {
    db.exec(`ALTER TABLE cutting_lists ADD COLUMN machine_name TEXT`);
  }
  if (!cutting.has('operator_name')) {
    db.exec(`ALTER TABLE cutting_lists ADD COLUMN operator_name TEXT`);
  }

  const clLines = tableCols('cutting_list_lines');
  if (clLines.size > 0 && !clLines.has('line_type')) {
    db.exec(`ALTER TABLE cutting_list_lines ADD COLUMN line_type TEXT`);
  }

  const prodJobs = tableCols('production_jobs');
  if (prodJobs.size > 0 && !prodJobs.has('operator_name')) {
    db.exec(`ALTER TABLE production_jobs ADD COLUMN operator_name TEXT`);
  }

  const purchaseOrders = tableCols('purchase_orders');
  if (!purchaseOrders.has('transport_reference')) {
    db.exec(`ALTER TABLE purchase_orders ADD COLUMN transport_reference TEXT`);
  }
  if (!purchaseOrders.has('transport_note')) {
    db.exec(`ALTER TABLE purchase_orders ADD COLUMN transport_note TEXT`);
  }
  if (!purchaseOrders.has('transport_treasury_movement_id')) {
    db.exec(`ALTER TABLE purchase_orders ADD COLUMN transport_treasury_movement_id TEXT`);
  }
  if (!purchaseOrders.has('transport_amount_ngn')) {
    db.exec(`ALTER TABLE purchase_orders ADD COLUMN transport_amount_ngn INTEGER NOT NULL DEFAULT 0`);
  }

  const coilLots = tableCols('coil_lots');
  if (!coilLots.has('colour')) {
    db.exec(`ALTER TABLE coil_lots ADD COLUMN colour TEXT`);
  }
  if (!coilLots.has('gauge_label')) {
    db.exec(`ALTER TABLE coil_lots ADD COLUMN gauge_label TEXT`);
  }
  if (!coilLots.has('material_type_name')) {
    db.exec(`ALTER TABLE coil_lots ADD COLUMN material_type_name TEXT`);
  }
  if (!coilLots.has('supplier_expected_meters')) {
    db.exec(`ALTER TABLE coil_lots ADD COLUMN supplier_expected_meters REAL`);
  }
  if (!coilLots.has('supplier_conversion_kg_per_m')) {
    db.exec(`ALTER TABLE coil_lots ADD COLUMN supplier_conversion_kg_per_m REAL`);
  }
  if (!coilLots.has('qty_remaining')) {
    db.exec(`ALTER TABLE coil_lots ADD COLUMN qty_remaining REAL NOT NULL DEFAULT 0`);
  }
  if (!coilLots.has('qty_reserved')) {
    db.exec(`ALTER TABLE coil_lots ADD COLUMN qty_reserved REAL NOT NULL DEFAULT 0`);
  }
  if (!coilLots.has('current_weight_kg')) {
    db.exec(`ALTER TABLE coil_lots ADD COLUMN current_weight_kg REAL NOT NULL DEFAULT 0`);
  }
  if (!coilLots.has('current_status')) {
    db.exec(`ALTER TABLE coil_lots ADD COLUMN current_status TEXT NOT NULL DEFAULT 'Available'`);
  }
  db.exec(`
    UPDATE coil_lots
    SET qty_remaining = CASE
      WHEN qty_remaining IS NULL OR qty_remaining = 0 THEN COALESCE(weight_kg, qty_received, 0)
      ELSE qty_remaining
    END,
        current_weight_kg = CASE
          WHEN current_weight_kg IS NULL OR current_weight_kg = 0 THEN COALESCE(weight_kg, qty_received, 0)
          ELSE current_weight_kg
        END,
        qty_reserved = COALESCE(qty_reserved, 0),
        current_status = CASE
          WHEN COALESCE(qty_remaining, COALESCE(weight_kg, qty_received, 0)) <= 0 THEN 'Consumed'
          WHEN COALESCE(qty_reserved, 0) >= COALESCE(qty_remaining, COALESCE(weight_kg, qty_received, 0)) AND COALESCE(qty_reserved, 0) > 0 THEN 'Reserved'
          ELSE COALESCE(current_status, 'Available')
        END
  `);

  const productionJobs = tableCols('production_jobs');
  if (!productionJobs.has('actual_meters')) {
    db.exec(`ALTER TABLE production_jobs ADD COLUMN actual_meters REAL NOT NULL DEFAULT 0`);
  }
  if (!productionJobs.has('actual_weight_kg')) {
    db.exec(`ALTER TABLE production_jobs ADD COLUMN actual_weight_kg REAL NOT NULL DEFAULT 0`);
  }
  if (!productionJobs.has('conversion_alert_state')) {
    db.exec(`ALTER TABLE production_jobs ADD COLUMN conversion_alert_state TEXT NOT NULL DEFAULT 'Pending'`);
  }
  if (!productionJobs.has('manager_review_required')) {
    db.exec(`ALTER TABLE production_jobs ADD COLUMN manager_review_required INTEGER NOT NULL DEFAULT 0`);
  }
  if (!productionJobs.has('manager_review_signed_at_iso')) {
    db.exec(`ALTER TABLE production_jobs ADD COLUMN manager_review_signed_at_iso TEXT`);
  }
  if (!productionJobs.has('manager_review_signed_by_user_id')) {
    db.exec(`ALTER TABLE production_jobs ADD COLUMN manager_review_signed_by_user_id TEXT`);
  }
  if (!productionJobs.has('manager_review_signed_by_name')) {
    db.exec(`ALTER TABLE production_jobs ADD COLUMN manager_review_signed_by_name TEXT`);
  }
  if (!productionJobs.has('manager_review_remark')) {
    db.exec(`ALTER TABLE production_jobs ADD COLUMN manager_review_remark TEXT`);
  }

  const refunds = tableCols('customer_refunds');
  // Legacy DBs: refunds table existed before workflow status column (listManagementItems filters on it).
  if (refunds.size > 0 && !refunds.has('status')) {
    db.exec(`ALTER TABLE customer_refunds ADD COLUMN status TEXT`);
  }
  if (!refunds.has('suggested_lines_json')) {
    db.exec(`ALTER TABLE customer_refunds ADD COLUMN suggested_lines_json TEXT`);
  }
  if (!refunds.has('approved_amount_ngn')) {
    db.exec(`ALTER TABLE customer_refunds ADD COLUMN approved_amount_ngn INTEGER`);
  }
  if (!refunds.has('paid_amount_ngn')) {
    db.exec(`ALTER TABLE customer_refunds ADD COLUMN paid_amount_ngn INTEGER NOT NULL DEFAULT 0`);
  }
  if (!refunds.has('payment_note')) {
    db.exec(`ALTER TABLE customer_refunds ADD COLUMN payment_note TEXT`);
  }
  if (!refunds.has('requested_by_user_id')) {
    db.exec(`ALTER TABLE customer_refunds ADD COLUMN requested_by_user_id TEXT`);
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_refunds_single_pending
      ON customer_refunds(quotation_ref, product)
      WHERE status IN ('Pending', 'Approved');
  `);
  db.exec(`
    UPDATE customer_refunds
    SET suggested_lines_json = CASE
      WHEN suggested_lines_json IS NULL OR suggested_lines_json = '' THEN calculation_lines_json
      ELSE suggested_lines_json
    END,
        approved_amount_ngn = CASE
          WHEN status IN ('Approved', 'Paid') AND (approved_amount_ngn IS NULL OR approved_amount_ngn = 0) THEN amount_ngn
          ELSE approved_amount_ngn
        END,
        paid_amount_ngn = CASE
          WHEN status = 'Paid' AND COALESCE(paid_amount_ngn, 0) = 0 THEN amount_ngn
          ELSE COALESCE(paid_amount_ngn, 0)
        END
  `);

  const customers = tableCols('customers');
  if (!customers.has('company_name')) {
    db.exec(`ALTER TABLE customers ADD COLUMN company_name TEXT`);
  }
  if (!customers.has('lead_source')) {
    db.exec(`ALTER TABLE customers ADD COLUMN lead_source TEXT`);
  }
  if (!customers.has('preferred_contact')) {
    db.exec(`ALTER TABLE customers ADD COLUMN preferred_contact TEXT`);
  }
  if (!customers.has('follow_up_iso')) {
    db.exec(`ALTER TABLE customers ADD COLUMN follow_up_iso TEXT`);
  }
  if (!customers.has('crm_tags_json')) {
    db.exec(`ALTER TABLE customers ADD COLUMN crm_tags_json TEXT`);
  }
  if (!customers.has('crm_profile_notes')) {
    db.exec(`ALTER TABLE customers ADD COLUMN crm_profile_notes TEXT`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_crm_interactions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      at_iso TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'note',
      title TEXT,
      detail TEXT NOT NULL,
      created_by_name TEXT,
      branch_id TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_crm_interactions_customer ON customer_crm_interactions(customer_id, at_iso DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS treasury_movements (
      id TEXT PRIMARY KEY,
      posted_at_iso TEXT NOT NULL,
      type TEXT NOT NULL,
      treasury_account_id INTEGER NOT NULL,
      amount_ngn INTEGER NOT NULL,
      reference TEXT,
      counterparty_kind TEXT,
      counterparty_id TEXT,
      counterparty_name TEXT,
      source_kind TEXT,
      source_id TEXT,
      note TEXT,
      created_by TEXT,
      reverses_movement_id TEXT,
      batch_id TEXT,
      FOREIGN KEY (treasury_account_id) REFERENCES treasury_accounts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_treasury_movements_account ON treasury_movements(treasury_account_id);
    CREATE INDEX IF NOT EXISTS idx_treasury_movements_source ON treasury_movements(source_kind, source_id);

    CREATE TABLE IF NOT EXISTS cutting_list_lines (
      cutting_list_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      sheets REAL NOT NULL DEFAULT 0,
      length_m REAL NOT NULL DEFAULT 0,
      total_m REAL NOT NULL DEFAULT 0,
      line_type TEXT,
      PRIMARY KEY (cutting_list_id, sort_order),
      FOREIGN KEY (cutting_list_id) REFERENCES cutting_lists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS production_jobs (
      job_id TEXT PRIMARY KEY,
      cutting_list_id TEXT,
      quotation_ref TEXT,
      customer_id TEXT,
      customer_name TEXT,
      product_id TEXT,
      product_name TEXT,
      planned_meters REAL DEFAULT 0,
      planned_sheets REAL DEFAULT 0,
      machine_name TEXT,
      start_date_iso TEXT,
      end_date_iso TEXT,
      materials_note TEXT,
      operator_name TEXT,
      status TEXT NOT NULL DEFAULT 'Planned',
      created_at_iso TEXT NOT NULL,
      completed_at_iso TEXT,
      actual_meters REAL NOT NULL DEFAULT 0,
      actual_weight_kg REAL NOT NULL DEFAULT 0,
      conversion_alert_state TEXT NOT NULL DEFAULT 'Pending',
      manager_review_required INTEGER NOT NULL DEFAULT 0,
      manager_review_signed_at_iso TEXT,
      manager_review_signed_by_user_id TEXT,
      manager_review_signed_by_name TEXT,
      manager_review_remark TEXT,
      FOREIGN KEY (cutting_list_id) REFERENCES cutting_lists(id)
    );

    CREATE TABLE IF NOT EXISTS production_job_coils (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      sequence_no INTEGER NOT NULL,
      coil_no TEXT NOT NULL,
      product_id TEXT,
      colour TEXT,
      gauge_label TEXT,
      opening_weight_kg REAL NOT NULL DEFAULT 0,
      closing_weight_kg REAL NOT NULL DEFAULT 0,
      consumed_weight_kg REAL NOT NULL DEFAULT 0,
      meters_produced REAL NOT NULL DEFAULT 0,
      actual_conversion_kg_per_m REAL,
      allocation_status TEXT NOT NULL DEFAULT 'Allocated',
      note TEXT,
      allocated_at_iso TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES production_jobs(job_id) ON DELETE CASCADE,
      FOREIGN KEY (coil_no) REFERENCES coil_lots(coil_no)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_production_job_coils_job_coil
      ON production_job_coils(job_id, coil_no);

    CREATE TABLE IF NOT EXISTS production_conversion_checks (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      coil_no TEXT NOT NULL,
      gauge_label TEXT,
      material_type_name TEXT,
      actual_conversion_kg_per_m REAL,
      standard_conversion_kg_per_m REAL,
      supplier_conversion_kg_per_m REAL,
      gauge_history_avg_kg_per_m REAL,
      coil_history_avg_kg_per_m REAL,
      alert_state TEXT NOT NULL DEFAULT 'OK',
      manager_review_required INTEGER NOT NULL DEFAULT 0,
      variance_summary_json TEXT,
      checked_at_iso TEXT NOT NULL,
      note TEXT,
      FOREIGN KEY (job_id) REFERENCES production_jobs(job_id) ON DELETE CASCADE,
      FOREIGN KEY (coil_no) REFERENCES coil_lots(coil_no)
    );

    CREATE INDEX IF NOT EXISTS idx_production_conversion_checks_job
      ON production_conversion_checks(job_id, checked_at_iso DESC);
    CREATE INDEX IF NOT EXISTS idx_production_conversion_checks_gauge
      ON production_conversion_checks(gauge_label, checked_at_iso DESC);
    CREATE INDEX IF NOT EXISTS idx_production_conversion_checks_coil
      ON production_conversion_checks(coil_no, checked_at_iso DESC);

    CREATE TABLE IF NOT EXISTS setup_quote_items (
      item_id TEXT PRIMARY KEY,
      item_type TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'unit',
      default_unit_price_ngn INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      inventory_product_id TEXT
    );

    CREATE TABLE IF NOT EXISTS setup_colours (
      colour_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      abbreviation TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS setup_gauges (
      gauge_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      gauge_mm REAL NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS setup_material_types (
      material_type_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      density_kg_per_m3 REAL NOT NULL DEFAULT 0,
      width_m REAL NOT NULL DEFAULT 1.2,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS setup_profiles (
      profile_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS setup_price_lists (
      price_id TEXT PRIMARY KEY,
      quote_item_id TEXT,
      item_name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'unit',
      unit_price_ngn INTEGER NOT NULL DEFAULT 0,
      gauge_id TEXT,
      colour_id TEXT,
      material_type_id TEXT,
      profile_id TEXT,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (quote_item_id) REFERENCES setup_quote_items(item_id)
    );

    CREATE TABLE IF NOT EXISTS setup_expense_categories (
      category_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS delivery_lines (
      delivery_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT,
      qty REAL NOT NULL DEFAULT 0,
      unit TEXT,
      cutting_list_line_no INTEGER,
      PRIMARY KEY (delivery_id, sort_order),
      FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role_key TEXT NOT NULL,
      department TEXT NOT NULL DEFAULT 'general',
      status TEXT NOT NULL DEFAULT 'active',
      last_login_at_iso TEXT,
      created_at_iso TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      session_token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      last_seen_at_iso TEXT NOT NULL,
      expires_at_iso TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at_iso);

    CREATE TABLE IF NOT EXISTS accounting_period_locks (
      period_key TEXT PRIMARY KEY,
      locked_from_iso TEXT NOT NULL,
      locked_at_iso TEXT NOT NULL,
      locked_by_user_id TEXT,
      locked_by_name TEXT,
      reason TEXT,
      FOREIGN KEY (locked_by_user_id) REFERENCES app_users(id)
    );

    CREATE TABLE IF NOT EXISTS approval_actions (
      id TEXT PRIMARY KEY,
      entity_kind TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT,
      acted_at_iso TEXT NOT NULL,
      acted_by_user_id TEXT,
      acted_by_name TEXT,
      FOREIGN KEY (acted_by_user_id) REFERENCES app_users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_approval_actions_entity
      ON approval_actions(entity_kind, entity_id, acted_at_iso DESC);

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      occurred_at_iso TEXT NOT NULL,
      actor_user_id TEXT,
      actor_name TEXT,
      action TEXT NOT NULL,
      entity_kind TEXT,
      entity_id TEXT,
      status TEXT NOT NULL,
      note TEXT,
      details_json TEXT,
      FOREIGN KEY (actor_user_id) REFERENCES app_users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log(occurred_at_iso DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action, occurred_at_iso DESC);
  `);

  migrateBranches(db);
  migrateCoilMaterialOps(db);
  migrateWorkflowExtensions(db);
  migratePrd101ToCoilAlu(db);
  migrateMaterialTypeLabels(db);
  migrateUserProfileAndPasswordReset(db);
  migrateHrStaffProfileColumns(db);
  migrateAccountingLayer(db);
  migrateExpenseCategoriesToCanonical(db);
  migrateAccessoryOperations(db);
}

/** Quote item → inventory SKU mapping; per-job accessory fulfillment for refunds and stock. */
function migrateAccessoryOperations(db) {
  const sqiCols = db.prepare(`PRAGMA table_info(setup_quote_items)`).all();
  const sqiNames = new Set(sqiCols.map((c) => c.name));
  if (sqiCols.length > 0 && !sqiNames.has('inventory_product_id')) {
    db.exec(`ALTER TABLE setup_quote_items ADD COLUMN inventory_product_id TEXT`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS production_job_accessory_usage (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      quotation_ref TEXT,
      quote_line_id TEXT NOT NULL,
      name TEXT NOT NULL,
      ordered_qty REAL NOT NULL DEFAULT 0,
      supplied_qty REAL NOT NULL DEFAULT 0,
      inventory_product_id TEXT,
      posted_at_iso TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES production_jobs(job_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_prod_job_acc_usage_quotation
      ON production_job_accessory_usage(quotation_ref, quote_line_id);
    CREATE INDEX IF NOT EXISTS idx_prod_job_acc_usage_job
      ON production_job_accessory_usage(job_id);
  `);
}

/** Map legacy free-text expense categories on `expenses` to canonical labels; refresh treasury counterparty names. */
function migrateExpenseCategoriesToCanonical(db) {
  if (!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='expenses'`).get()) return;
  const rows = db.prepare(`SELECT expense_id, category FROM expenses WHERE category IS NOT NULL`).all();
  const upd = db.prepare(`UPDATE expenses SET category = ? WHERE expense_id = ?`);
  for (const r of rows) {
    const cur = String(r.category ?? '').trim();
    if (!cur || isAllowedExpenseCategory(cur)) continue;
    const next = mapLegacyExpenseCategoryToCanonical(cur);
    if (next !== cur) upd.run(next, r.expense_id);
  }
  if (!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='treasury_movements'`).get()) return;
  db.prepare(
    `UPDATE treasury_movements
     SET counterparty_name = COALESCE(
       (SELECT e.category FROM expenses e WHERE e.expense_id = treasury_movements.counterparty_id),
       counterparty_name
     )
     WHERE counterparty_kind = 'EXPENSE'
       AND source_kind = 'EXPENSE'
       AND EXISTS (SELECT 1 FROM expenses e WHERE e.expense_id = treasury_movements.counterparty_id)`
  ).run();
}

/** Landed cost on coil lots, movement values, GL tables + seed chart. */
function migrateAccountingLayer(db) {
  const tableCols = (name) => {
    try {
      const rows = db.prepare(`PRAGMA table_info(${name})`).all();
      return new Set(rows.map((c) => c.name));
    } catch {
      return new Set();
    }
  };
  const cl = tableCols('coil_lots');
  if (cl.size && !cl.has('landed_cost_ngn')) {
    db.exec(`ALTER TABLE coil_lots ADD COLUMN landed_cost_ngn INTEGER`);
  }
  if (cl.size && !cl.has('unit_cost_ngn_per_kg')) {
    db.exec(`ALTER TABLE coil_lots ADD COLUMN unit_cost_ngn_per_kg INTEGER`);
  }
  const sm = tableCols('stock_movements');
  if (sm.size && !sm.has('value_ngn')) {
    db.exec(`ALTER TABLE stock_movements ADD COLUMN value_ngn INTEGER`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS gl_accounts (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS gl_journal_entries (
      id TEXT PRIMARY KEY,
      entry_date_iso TEXT NOT NULL,
      period_key TEXT NOT NULL,
      memo TEXT,
      source_kind TEXT,
      source_id TEXT,
      created_at_iso TEXT NOT NULL,
      created_by_user_id TEXT,
      branch_id TEXT
    );
    CREATE TABLE IF NOT EXISTS gl_journal_lines (
      id TEXT PRIMARY KEY,
      journal_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      debit_ngn INTEGER NOT NULL DEFAULT 0,
      credit_ngn INTEGER NOT NULL DEFAULT 0,
      memo TEXT,
      FOREIGN KEY (journal_id) REFERENCES gl_journal_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES gl_accounts(id)
    );
    CREATE INDEX IF NOT EXISTS idx_gl_lines_journal ON gl_journal_lines(journal_id);
    CREATE INDEX IF NOT EXISTS idx_gl_lines_account ON gl_journal_lines(account_id);
  `);
  try {
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_gl_journal_source ON gl_journal_entries(source_kind, source_id) WHERE source_kind IS NOT NULL AND source_id IS NOT NULL AND TRIM(source_id) != '';`
    );
  } catch {
    /* ignore */
  }

  seedDefaultGlAccounts(db);
}

/** Extra columns on hr_staff_profiles (idempotent). */
function migrateHrStaffProfileColumns(db) {
  const tableCols = (name) => {
    try {
      const rows = db.prepare(`PRAGMA table_info(${name})`).all();
      return new Set(rows.map((c) => c.name));
    } catch {
      return new Set();
    }
  };
  const hr = tableCols('hr_staff_profiles');
  if (hr.size && !hr.has('academic_qualification')) {
    db.exec(`ALTER TABLE hr_staff_profiles ADD COLUMN academic_qualification TEXT`);
  }
  if (hr.size && !hr.has('paye_tax_percent')) {
    db.exec(`ALTER TABLE hr_staff_profiles ADD COLUMN paye_tax_percent REAL`);
  }
  if (hr.size && !hr.has('pension_percent_override')) {
    db.exec(`ALTER TABLE hr_staff_profiles ADD COLUMN pension_percent_override REAL`);
  }
  migrateHrModule(db);
}

/** HR staff files, requests, payroll, attendance (idempotent). */
function migrateHrModule(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hr_staff_profiles (
      user_id TEXT PRIMARY KEY,
      branch_id TEXT,
      employee_no TEXT,
      job_title TEXT,
      department TEXT,
      employment_type TEXT,
      date_joined_iso TEXT,
      probation_end_iso TEXT,
      bank_account_name TEXT,
      bank_name TEXT,
      bank_account_no_masked TEXT,
      tax_id TEXT,
      pension_rsa_pin TEXT,
      next_of_kin_json TEXT,
      base_salary_ngn INTEGER NOT NULL DEFAULT 0,
      housing_allowance_ngn INTEGER NOT NULL DEFAULT 0,
      transport_allowance_ngn INTEGER NOT NULL DEFAULT 0,
      bonus_accrual_note TEXT,
      minimum_qualification TEXT,
      academic_qualification TEXT,
      promotion_grade TEXT,
      welfare_notes TEXT,
      training_summary TEXT,
      profile_extra_json TEXT,
      paye_tax_percent REAL,
      pension_percent_override REAL,
      updated_at_iso TEXT,
      updated_by_user_id TEXT,
      FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hr_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      payload_json TEXT,
      created_at_iso TEXT NOT NULL,
      submitted_at_iso TEXT,
      hr_reviewer_user_id TEXT,
      hr_reviewer_note TEXT,
      hr_reviewed_at_iso TEXT,
      manager_reviewer_user_id TEXT,
      manager_note TEXT,
      manager_reviewed_at_iso TEXT,
      FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_hr_requests_branch ON hr_requests(branch_id);
    CREATE INDEX IF NOT EXISTS idx_hr_requests_user ON hr_requests(user_id);

    CREATE TABLE IF NOT EXISTS hr_payroll_runs (
      id TEXT PRIMARY KEY,
      period_yyyymm TEXT NOT NULL,
      status TEXT NOT NULL,
      tax_percent REAL NOT NULL,
      pension_percent REAL NOT NULL,
      notes TEXT,
      created_at_iso TEXT NOT NULL,
      created_by_user_id TEXT
    );

    CREATE TABLE IF NOT EXISTS hr_payroll_lines (
      run_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      gross_ngn INTEGER NOT NULL,
      bonus_ngn INTEGER NOT NULL,
      attendance_deduction_ngn INTEGER NOT NULL,
      other_deduction_ngn INTEGER NOT NULL,
      tax_ngn INTEGER NOT NULL,
      pension_ngn INTEGER NOT NULL,
      net_ngn INTEGER NOT NULL,
      PRIMARY KEY (run_id, user_id),
      FOREIGN KEY (run_id) REFERENCES hr_payroll_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES app_users(id)
    );

    CREATE TABLE IF NOT EXISTS hr_payroll_line_loans (
      run_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      hr_request_id TEXT NOT NULL,
      period_yyyymm TEXT NOT NULL,
      amount_ngn INTEGER NOT NULL,
      loan_title TEXT,
      computed_at_iso TEXT,
      PRIMARY KEY (run_id, hr_request_id),
      FOREIGN KEY (run_id) REFERENCES hr_payroll_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hr_attendance_uploads (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL,
      period_yyyymm TEXT NOT NULL,
      uploaded_by_user_id TEXT,
      notes TEXT,
      rows_json TEXT NOT NULL,
      created_at_iso TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hr_daily_roll_calls (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL,
      day_iso TEXT NOT NULL,
      recorded_by_user_id TEXT,
      notes TEXT,
      rows_json TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL,
      UNIQUE(branch_id, day_iso)
    );
    CREATE INDEX IF NOT EXISTS idx_hr_daily_roll_branch_day ON hr_daily_roll_calls(branch_id, day_iso);

    CREATE TABLE IF NOT EXISTS hr_employment_letters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      letter_kind TEXT NOT NULL,
      content_text TEXT NOT NULL,
      issued_at_iso TEXT NOT NULL,
      issued_by_user_id TEXT,
      FOREIGN KEY (user_id) REFERENCES app_users(id)
    );

    CREATE TABLE IF NOT EXISTS hr_policy_acknowledgements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      policy_key TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      accepted_at_iso TEXT NOT NULL,
      signature_name TEXT,
      accepted_by_user_id TEXT,
      context_json TEXT,
      record_hash TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES app_users(id),
      FOREIGN KEY (accepted_by_user_id) REFERENCES app_users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_hr_policy_ack_user ON hr_policy_acknowledgements(user_id, accepted_at_iso DESC);
    CREATE INDEX IF NOT EXISTS idx_hr_policy_ack_policy ON hr_policy_acknowledgements(policy_key, policy_version);

    CREATE TABLE IF NOT EXISTS hr_audit_events (
      id TEXT PRIMARY KEY,
      occurred_at_iso TEXT NOT NULL,
      actor_user_id TEXT,
      actor_display_name TEXT,
      action TEXT NOT NULL,
      entity_kind TEXT NOT NULL,
      entity_id TEXT,
      branch_id TEXT,
      reason TEXT,
      details_json TEXT,
      correlation_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_hr_audit_events_time ON hr_audit_events(occurred_at_iso DESC);

    CREATE TABLE IF NOT EXISTS hr_leave_balances (
      user_id TEXT NOT NULL,
      leave_type TEXT NOT NULL,
      period_yyyymm TEXT NOT NULL,
      opening_days REAL NOT NULL DEFAULT 0,
      accrued_days REAL NOT NULL DEFAULT 0,
      used_days REAL NOT NULL DEFAULT 0,
      adjusted_days REAL NOT NULL DEFAULT 0,
      closing_days REAL NOT NULL DEFAULT 0,
      updated_at_iso TEXT NOT NULL,
      PRIMARY KEY (user_id, leave_type, period_yyyymm),
      FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hr_leave_accrual_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      leave_type TEXT NOT NULL,
      period_yyyymm TEXT NOT NULL,
      movement_kind TEXT NOT NULL,
      days REAL NOT NULL,
      reference_id TEXT,
      note TEXT,
      created_at_iso TEXT NOT NULL,
      created_by_user_id TEXT,
      FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hr_attendance_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      event_date_iso TEXT NOT NULL,
      status TEXT NOT NULL,
      minutes_late INTEGER NOT NULL DEFAULT 0,
      source_kind TEXT NOT NULL DEFAULT 'upload',
      source_id TEXT,
      created_at_iso TEXT NOT NULL,
      created_by_user_id TEXT,
      FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hr_request_leave (
      request_id TEXT PRIMARY KEY,
      leave_type TEXT,
      start_date_iso TEXT,
      end_date_iso TEXT,
      days_requested REAL,
      handover_to TEXT,
      contact_during_leave TEXT,
      FOREIGN KEY (request_id) REFERENCES hr_requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hr_request_loan (
      request_id TEXT PRIMARY KEY,
      amount_ngn INTEGER,
      repayment_months INTEGER,
      deduction_per_month_ngn INTEGER,
      purpose TEXT,
      FOREIGN KEY (request_id) REFERENCES hr_requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hr_request_discipline (
      request_id TEXT PRIMARY KEY,
      case_type TEXT,
      severity TEXT,
      incident_date_iso TEXT,
      summary TEXT,
      FOREIGN KEY (request_id) REFERENCES hr_requests(id) ON DELETE CASCADE
    );
  `);
}

/** User profile fields + password reset token table. */
function migrateUserProfileAndPasswordReset(db) {
  const tableCols = (name) => {
    try {
      const rows = db.prepare(`PRAGMA table_info(${name})`).all();
      return new Set(rows.map((c) => c.name));
    } catch {
      return new Set();
    }
  };

  const users = tableCols('app_users');
  if (users.size && !users.has('email')) {
    db.exec(`ALTER TABLE app_users ADD COLUMN email TEXT`);
  }
  if (users.size && !users.has('avatar_url')) {
    db.exec(`ALTER TABLE app_users ADD COLUMN avatar_url TEXT`);
  }
  if (users.size && !users.has('department')) {
    db.exec(`ALTER TABLE app_users ADD COLUMN department TEXT NOT NULL DEFAULT 'general'`);
    db.prepare(
      `UPDATE app_users SET department = CASE role_key
        WHEN 'admin' THEN 'it'
        WHEN 'finance_manager' THEN 'finance'
        WHEN 'sales_manager' THEN 'sales'
        WHEN 'sales_staff' THEN 'sales'
        WHEN 'procurement_officer' THEN 'purchase'
        WHEN 'operations_officer' THEN 'inventory'
        WHEN 'viewer' THEN 'reports'
        ELSE 'general' END`
    ).run();
  }

  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email_unique
      ON app_users(email) WHERE email IS NOT NULL AND trim(email) != '';
    `);
  } catch {
    /* ignore if SQLite version disallows — rare */
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      expires_at_iso TEXT NOT NULL,
      used_at_iso TEXT,
      FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_pwreset_user ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_pwreset_expires ON password_reset_tokens(expires_at_iso);
    CREATE INDEX IF NOT EXISTS idx_pwreset_token_hash ON password_reset_tokens(token_hash);
  `);
}

/** Cutting-list production hold, price-list book versioning. */
function migrateWorkflowExtensions(db) {
  const tableCols = (name) => {
    try {
      const rows = db.prepare(`PRAGMA table_info(${name})`).all();
      return new Set(rows.map((c) => c.name));
    } catch {
      return new Set();
    }
  };

  const cl = tableCols('cutting_lists');
  if (cl.size && !cl.has('production_release_pending')) {
    db.exec(`ALTER TABLE cutting_lists ADD COLUMN production_release_pending INTEGER NOT NULL DEFAULT 0`);
  }
  if (cl.size && !cl.has('production_released_at_iso')) {
    db.exec(`ALTER TABLE cutting_lists ADD COLUMN production_released_at_iso TEXT`);
  }
  if (cl.size && !cl.has('production_released_by')) {
    db.exec(`ALTER TABLE cutting_lists ADD COLUMN production_released_by TEXT`);
  }

  const pl = tableCols('setup_price_lists');
  if (pl.size && !pl.has('book_label')) {
    db.exec(`ALTER TABLE setup_price_lists ADD COLUMN book_label TEXT NOT NULL DEFAULT 'Standard'`);
  }
  if (pl.size && !pl.has('book_version')) {
    db.exec(`ALTER TABLE setup_price_lists ADD COLUMN book_version INTEGER NOT NULL DEFAULT 1`);
  }
  if (pl.size && !pl.has('effective_from_iso')) {
    db.exec(`ALTER TABLE setup_price_lists ADD COLUMN effective_from_iso TEXT NOT NULL DEFAULT '2020-01-01'`);
    db.prepare(`UPDATE setup_price_lists SET effective_from_iso = '2020-01-01' WHERE effective_from_iso IS NULL OR effective_from_iso = ''`).run();
  }
}

/** Coil split lineage + scrap SKU for off-cuts / scrap posting. */
function migrateCoilMaterialOps(db) {
  const tableCols = (name) => {
    try {
      const rows = db.prepare(`PRAGMA table_info(${name})`).all();
      return new Set(rows.map((c) => c.name));
    } catch {
      return new Set();
    }
  };
  const cl = tableCols('coil_lots');
  if (cl.size && !cl.has('parent_coil_no')) {
    db.exec(`ALTER TABLE coil_lots ADD COLUMN parent_coil_no TEXT`);
  }
  if (cl.size && !cl.has('material_origin_note')) {
    db.exec(`ALTER TABLE coil_lots ADD COLUMN material_origin_note TEXT`);
  }
  if (!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='products'`).get()) return;
  if (!db.prepare(`SELECT 1 FROM products WHERE product_id = 'SCRAP-COIL'`).get()) {
    db.prepare(
      `INSERT INTO products (product_id, name, stock_level, unit, low_stock_threshold, reorder_qty, gauge, colour, material_type, dashboard_attrs_json, branch_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      'SCRAP-COIL',
      'Coil scrap / off-cuts (kg)',
      0,
      'kg',
      0,
      0,
      'Mixed',
      'Mixed',
      'Scrap',
      '{}',
      'BR-KAD'
    );
  }
}

/** Branches + branch_id on operational tables + session workspace columns. */
function migrateBranches(db) {
  const tableCols = (name) => {
    try {
      const rows = db.prepare(`PRAGMA table_info(${name})`).all();
      return new Set(rows.map((c) => c.name));
    } catch {
      return new Set();
    }
  };

  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);
  const bc = db.prepare(`SELECT COUNT(*) AS c FROM branches`).get().c;
  if (bc === 0) {
    db.exec(`
      INSERT INTO branches (id, code, name, active, sort_order) VALUES
      ('BR-KAD', 'KAD', 'Kaduna (HQ)', 1, 1),
      ('BR-YOL', 'YOL', 'Yola Factory', 1, 2),
      ('BR-MAI', 'MAI', 'Maiduguri Factory', 1, 3);
    `);
  }

  const sessions = tableCols('user_sessions');
  if (!sessions.has('current_branch_id')) {
    db.exec(`ALTER TABLE user_sessions ADD COLUMN current_branch_id TEXT`);
  }
  if (!sessions.has('view_all_branches')) {
    db.exec(`ALTER TABLE user_sessions ADD COLUMN view_all_branches INTEGER NOT NULL DEFAULT 0`);
  }

  const defaultBranch = 'BR-KAD';
  const addBranch = (table) => {
    const cols = tableCols(table);
    if (!cols.size) return;
    if (!cols.has('branch_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN branch_id TEXT`);
    }
    db.prepare(
      `UPDATE ${table} SET branch_id = ? WHERE branch_id IS NULL OR TRIM(COALESCE(branch_id, '')) = ''`
    ).run(defaultBranch);
  };

  addBranch('quotations');
  addBranch('sales_receipts');
  addBranch('ledger_entries');
  addBranch('cutting_lists');
  addBranch('purchase_orders');
  addBranch('coil_lots');
  addBranch('deliveries');
  addBranch('production_jobs');
  addBranch('customer_refunds');
  addBranch('expenses');
  addBranch('customers');
  addBranch('customer_crm_interactions');
  addBranch('suppliers');
  addBranch('transport_agents');
  addBranch('products');
  addBranch('bank_reconciliation_lines');
}

/** Align setup material type names with product.material_type (Aluminium / Aluzinc). */
function migrateMaterialTypeLabels(db) {
  if (!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='setup_material_types'`).get()) {
    return;
  }
  db.prepare(
    `UPDATE setup_material_types SET name = 'Aluminium' WHERE material_type_id = 'MAT-001' AND name != 'Aluminium'`
  ).run();
  db.prepare(
    `UPDATE setup_material_types SET name = 'Aluzinc' WHERE material_type_id = 'MAT-002' AND name != 'Aluzinc'`
  ).run();
}

/** Replace removed SKU PRD-101 with COIL-ALU (aluminium kg stock). */
function migratePrd101ToCoilAlu(db) {
  if (!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='products'`).get()) return;
  const hasOld = db.prepare(`SELECT 1 FROM products WHERE product_id = 'PRD-101'`).get();
  if (!hasOld) return;

  const hasNew = db.prepare(`SELECT 1 FROM products WHERE product_id = 'COIL-ALU'`).get();

  const dashJson = JSON.stringify({
    gauge: 'Per PO / coil',
    colour: 'Per PO / coil (HMB, GB, TB, …)',
    materialType: 'Aluminium',
  });

  db.transaction(() => {
    const oldRow = db.prepare(`SELECT * FROM products WHERE product_id = 'PRD-101'`).get();
    if (!hasNew) {
      db.prepare(
        `INSERT INTO products (product_id, name, stock_level, unit, low_stock_threshold, reorder_qty, gauge, colour, material_type, dashboard_attrs_json, branch_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        'COIL-ALU',
        'Aluminium coil (kg)',
        oldRow.stock_level,
        oldRow.unit,
        oldRow.low_stock_threshold,
        oldRow.reorder_qty,
        'Per PO / coil',
        'Per PO / coil (HMB, GB, TB, …)',
        'Aluminium',
        dashJson,
        'BR-KAD'
      );
    } else {
      const cur = db.prepare(`SELECT stock_level FROM products WHERE product_id = 'COIL-ALU'`).get();
      const merged = Number(cur?.stock_level || 0) + Number(oldRow.stock_level || 0);
      db.prepare(`UPDATE products SET stock_level = ? WHERE product_id = 'COIL-ALU'`).run(merged);
    }

    db.prepare(
      `UPDATE purchase_order_lines SET product_id = 'COIL-ALU', product_name = 'Aluminium coil (kg)' WHERE product_id = 'PRD-101'`
    ).run();
    db.prepare(`UPDATE coil_lots SET product_id = 'COIL-ALU' WHERE product_id = 'PRD-101'`).run();
    db.prepare(`UPDATE stock_movements SET product_id = 'COIL-ALU' WHERE product_id = 'PRD-101'`).run();
    db.prepare(`UPDATE production_jobs SET product_id = 'COIL-ALU' WHERE product_id = 'PRD-101'`).run();
    db.prepare(`UPDATE production_job_coils SET product_id = 'COIL-ALU' WHERE product_id = 'PRD-101'`).run();
    if (db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='procurement_catalog'`).get()) {
      db.prepare(`UPDATE procurement_catalog SET product_id = 'COIL-ALU' WHERE product_id = 'PRD-101'`).run();
    }

    const oldWip = db.prepare(`SELECT qty FROM wip_balances WHERE product_id = 'PRD-101'`).get();
    if (oldWip) {
      const newWip = db.prepare(`SELECT qty FROM wip_balances WHERE product_id = 'COIL-ALU'`).get();
      const mergedWip = Number(newWip?.qty || 0) + Number(oldWip.qty || 0);
      db.prepare(`DELETE FROM wip_balances WHERE product_id IN ('PRD-101', 'COIL-ALU')`).run();
      db.prepare(`INSERT INTO wip_balances (product_id, qty) VALUES ('COIL-ALU', ?)`).run(mergedWip);
    }

    db.prepare(`DELETE FROM products WHERE product_id = 'PRD-101'`).run();
  })();
}
