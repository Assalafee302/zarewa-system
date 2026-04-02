/**
 * SQLite DDL for Zarewa (single-file DB). FK enabled from JS: db.pragma('foreign_keys = ON').
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS customers (
  customer_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone_number TEXT,
  email TEXT,
  address_shipping TEXT,
  address_billing TEXT,
  status TEXT,
  tier TEXT,
  payment_terms TEXT,
  created_by TEXT,
  created_at_iso TEXT,
  last_activity_iso TEXT,
  company_name TEXT,
  lead_source TEXT,
  preferred_contact TEXT,
  follow_up_iso TEXT,
  crm_tags_json TEXT,
  crm_profile_notes TEXT,
  branch_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_crm_interactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  at_iso TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',
  title TEXT,
  detail TEXT NOT NULL,
  created_by_name TEXT,
  branch_id TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_interactions_customer ON customer_crm_interactions(customer_id, at_iso DESC);

CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  date_label TEXT,
  date_iso TEXT,
  due_date_iso TEXT,
  total_display TEXT,
  total_ngn INTEGER NOT NULL DEFAULT 0,
  paid_ngn INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT,
  status TEXT,
  approval_date TEXT,
  customer_feedback TEXT,
  handled_by TEXT,
  project_name TEXT,
  lines_json TEXT,
  manager_cleared_at_iso TEXT,
  manager_flagged_at_iso TEXT,
  manager_flag_reason TEXT,
  manager_production_approved_at_iso TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  at_iso TEXT NOT NULL,
  type TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  amount_ngn INTEGER NOT NULL,
  quotation_ref TEXT,
  payment_method TEXT,
  bank_reference TEXT,
  purpose TEXT,
  created_by_user_id TEXT,
  created_by_name TEXT,
  note TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_customer ON ledger_entries(customer_id);
CREATE INDEX IF NOT EXISTS idx_ledger_quotation ON ledger_entries(quotation_ref);

CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT,
  payment_terms TEXT,
  quality_score INTEGER,
  notes TEXT,
  branch_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transport_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT,
  phone TEXT,
  branch_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  product_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  stock_level REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  low_stock_threshold REAL NOT NULL DEFAULT 0,
  reorder_qty REAL NOT NULL DEFAULT 0,
  gauge TEXT,
  colour TEXT,
  material_type TEXT,
  dashboard_attrs_json TEXT,
  branch_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  po_id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  order_date_iso TEXT,
  expected_delivery_iso TEXT,
  status TEXT,
  invoice_no TEXT,
  invoice_date_iso TEXT,
  delivery_date_iso TEXT,
  transport_agent_id TEXT,
  transport_agent_name TEXT,
  transport_reference TEXT,
  transport_note TEXT,
  transport_treasury_movement_id TEXT,
  transport_amount_ngn INTEGER NOT NULL DEFAULT 0,
  transport_paid INTEGER NOT NULL DEFAULT 0,
  transport_paid_at_iso TEXT,
  supplier_paid_ngn INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id)
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  po_id TEXT NOT NULL,
  line_key TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT,
  color TEXT,
  gauge TEXT,
  meters_offered REAL,
  conversion_kg_per_m REAL,
  unit_price_per_kg_ngn INTEGER,
  unit_price_ngn INTEGER,
  qty_ordered REAL NOT NULL,
  qty_received REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (po_id, line_key),
  FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS coil_lots (
  coil_no TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  line_key TEXT,
  qty_received REAL NOT NULL,
  weight_kg REAL,
  colour TEXT,
  gauge_label TEXT,
  material_type_name TEXT,
  supplier_expected_meters REAL,
  supplier_conversion_kg_per_m REAL,
  qty_remaining REAL NOT NULL DEFAULT 0,
  qty_reserved REAL NOT NULL DEFAULT 0,
  current_weight_kg REAL NOT NULL DEFAULT 0,
  current_status TEXT NOT NULL DEFAULT 'Available',
  location TEXT,
  po_id TEXT,
  supplier_id TEXT,
  supplier_name TEXT,
  received_at_iso TEXT,
  parent_coil_no TEXT,
  material_origin_note TEXT,
  landed_cost_ngn INTEGER,
  unit_cost_ngn_per_kg INTEGER
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  at_iso TEXT NOT NULL,
  type TEXT NOT NULL,
  ref TEXT,
  product_id TEXT,
  qty REAL,
  detail TEXT,
  date_iso TEXT,
  unit_price_ngn INTEGER,
  value_ngn INTEGER
);

CREATE TABLE IF NOT EXISTS wip_balances (
  product_id TEXT PRIMARY KEY,
  qty REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  quotation_ref TEXT,
  customer_id TEXT,
  customer_name TEXT,
  cutting_list_id TEXT,
  destination TEXT,
  method TEXT,
  status TEXT,
  tracking_no TEXT,
  ship_date TEXT,
  eta TEXT,
  delivered_date_iso TEXT,
  pod_notes TEXT,
  courier_confirmed INTEGER DEFAULT 0,
  customer_signed_pod INTEGER DEFAULT 0,
  fulfillment_posted INTEGER DEFAULT 0
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

CREATE TABLE IF NOT EXISTS sales_receipts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  quotation_ref TEXT,
  date_label TEXT,
  date_iso TEXT,
  amount_display TEXT,
  amount_ngn INTEGER NOT NULL,
  method TEXT,
  status TEXT,
  handled_by TEXT,
  ledger_entry_id TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE IF NOT EXISTS advance_in_events (
  ledger_entry_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  amount_ngn INTEGER NOT NULL,
  at_iso TEXT NOT NULL,
  payment_method TEXT,
  bank_reference TEXT,
  purpose TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
  FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id)
);

CREATE INDEX IF NOT EXISTS idx_advance_in_customer ON advance_in_events(customer_id);

CREATE TABLE IF NOT EXISTS cutting_lists (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  quotation_ref TEXT,
  product_id TEXT,
  product_name TEXT,
  date_label TEXT,
  date_iso TEXT,
  sheets_to_cut REAL DEFAULT 0,
  total_meters REAL DEFAULT 0,
  total_label TEXT,
  status TEXT,
  machine_name TEXT,
  operator_name TEXT,
  production_registered INTEGER DEFAULT 0,
  production_register_ref TEXT,
  handled_by TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

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

CREATE TABLE IF NOT EXISTS customer_refunds (
  refund_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  quotation_ref TEXT,
  cutting_list_ref TEXT,
  product TEXT,
  reason_category TEXT,
  reason TEXT,
  amount_ngn INTEGER NOT NULL,
  calculation_lines_json TEXT,
  suggested_lines_json TEXT,
  calculation_notes TEXT,
  status TEXT,
  requested_by TEXT,
  requested_by_user_id TEXT,
  requested_at_iso TEXT,
  approval_date TEXT,
  approved_by TEXT,
  approved_amount_ngn INTEGER,
  manager_comments TEXT,
  paid_amount_ngn INTEGER NOT NULL DEFAULT 0,
  paid_at_iso TEXT,
  paid_by TEXT,
  payment_note TEXT,
  branch_id TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_refunds_single_pending
  ON customer_refunds(quotation_ref, product)
  WHERE status IN ('Pending', 'Approved');

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

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role_key TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'active',
  permissions_json TEXT,
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

CREATE INDEX IF NOT EXISTS idx_approval_actions_entity ON approval_actions(entity_kind, entity_id, acted_at_iso DESC);

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

CREATE TABLE IF NOT EXISTS treasury_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  bank_name TEXT,
  balance INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  acc_no TEXT
);

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

CREATE TABLE IF NOT EXISTS expenses (
  expense_id TEXT PRIMARY KEY,
  expense_type TEXT,
  amount_ngn INTEGER NOT NULL,
  date TEXT,
  category TEXT,
  payment_method TEXT,
  reference TEXT
);

CREATE TABLE IF NOT EXISTS payment_requests (
  request_id TEXT PRIMARY KEY,
  expense_id TEXT,
  amount_requested_ngn INTEGER,
  request_date TEXT,
  approval_status TEXT,
  description TEXT,
  approved_by TEXT,
  approved_at_iso TEXT,
  approval_note TEXT,
  paid_amount_ngn INTEGER DEFAULT 0,
  paid_at_iso TEXT,
  paid_by TEXT,
  payment_note TEXT,
  request_reference TEXT,
  line_items_json TEXT,
  attachment_name TEXT,
  attachment_mime TEXT,
  attachment_data_b64 TEXT
);

CREATE TABLE IF NOT EXISTS accounts_payable (
  ap_id TEXT PRIMARY KEY,
  supplier_name TEXT,
  po_ref TEXT,
  invoice_ref TEXT,
  amount_ngn INTEGER,
  paid_ngn INTEGER,
  due_date_iso TEXT,
  payment_method TEXT
);

CREATE TABLE IF NOT EXISTS bank_reconciliation_lines (
  id TEXT PRIMARY KEY,
  bank_date_iso TEXT,
  description TEXT,
  amount_ngn INTEGER,
  system_match TEXT,
  status TEXT,
  branch_id TEXT
);

CREATE TABLE IF NOT EXISTS coil_requests (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  created_at_iso TEXT NOT NULL,
  acknowledged_at_iso TEXT,
  gauge TEXT,
  colour TEXT,
  material_type TEXT,
  requested_kg REAL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS yard_coils (
  id TEXT PRIMARY KEY,
  colour TEXT,
  gauge_label TEXT,
  material_type TEXT,
  weight_kg REAL,
  loc TEXT
);

CREATE TABLE IF NOT EXISTS procurement_catalog (
  id TEXT PRIMARY KEY,
  color TEXT,
  gauge TEXT,
  product_id TEXT NOT NULL,
  offer_kg REAL,
  offer_meters REAL,
  conversion_kg_per_m REAL,
  label TEXT
);

CREATE TABLE IF NOT EXISTS app_json_blobs (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotation_lines (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  name TEXT NOT NULL,
  qty REAL,
  unit TEXT,
  unit_price_ngn INTEGER,
  line_total_ngn INTEGER,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_po_lines_po ON purchase_order_lines(po_id);
CREATE INDEX IF NOT EXISTS idx_quotation_lines_q ON quotation_lines(quotation_id);
CREATE INDEX IF NOT EXISTS idx_coil_lots_po ON coil_lots(po_id);

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
CREATE UNIQUE INDEX IF NOT EXISTS idx_gl_journal_source ON gl_journal_entries(source_kind, source_id)
  WHERE source_kind IS NOT NULL AND source_id IS NOT NULL;

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
CREATE INDEX IF NOT EXISTS idx_hr_audit_events_entity ON hr_audit_events(entity_kind, entity_id, occurred_at_iso DESC);

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

CREATE INDEX IF NOT EXISTS idx_hr_leave_ledger_user ON hr_leave_accrual_ledger(user_id, created_at_iso DESC);

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

CREATE INDEX IF NOT EXISTS idx_hr_attendance_events_user_date ON hr_attendance_events(user_id, event_date_iso DESC);

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
`;
