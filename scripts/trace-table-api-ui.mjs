#!/usr/bin/env node
/**
 * Inventory: schema tables vs server references, bootstrap payload keys, and SPA usage.
 *
 * Usage:
 *   node scripts/trace-table-api-ui.mjs
 *   node scripts/trace-table-api-ui.mjs --out reports/table-api-ui.csv
 *   node scripts/trace-table-api-ui.mjs --json
 *
 * Heuristics (read the columns; they are not formal proofs):
 * - hits_* count whole-word matches (\b) of the SQL table name (snake_case).
 * - httpApi almost never mentions raw table names; use hits_server instead for API wiring.
 * - bootstrap_key: top-level GET /api/bootstrap field (camelCase) or "masterData.<prop>" or "-".
 * - hits_snapshot_key counts snapshot?.field / ws.snapshot.field / s.field for that camel key.
 * - setup_* tables map to masterData JSON; procurement_catalog also appears as top-level procurementCatalog.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** Table name -> top-level bootstrap key (exceptions to snake_case → camelCase). */
const BOOTSTRAP_KEY_OVERRIDES = {
  stock_movements: 'movements',
  sales_receipts: 'receipts',
  customer_refunds: 'refunds',
  accounting_period_locks: 'periodLocks',
  yard_coils: 'yardCoilRegister',
  wip_balances: 'wipByProduct',
  org_policy_kv: 'orgGovernanceLimits',
  ledger_entries: 'ledgerEntries',
  advance_in_events: 'advanceInEvents',
  purchase_orders: 'purchaseOrders',
  coil_lots: 'coilLots',
  cutting_lists: 'cuttingLists',
  production_jobs: 'productionJobs',
  production_job_coils: 'productionJobCoils',
  production_conversion_checks: 'productionConversionChecks',
  production_completion_adjustments: 'productionCompletionAdjustments',
  production_job_accessory_usage: 'productionJobAccessoryUsage',
  transport_agents: 'transportAgents',
  coil_requests: 'coilRequests',
  material_requests: 'materialRequests',
  in_transit_loads: 'inTransitLoads',
  treasury_accounts: 'treasuryAccounts',
  treasury_movements: 'treasuryMovements',
  payment_requests: 'paymentRequests',
  accounts_payable: 'accountsPayable',
  bank_reconciliation_lines: 'bankReconciliation',
  app_users: 'appUsers',
  approval_actions: 'approvalActions',
  audit_log: 'auditLog',
  /** Stored rows; bootstrap exposes prefs and other blobs via getJsonBlob — main SPA field: */
  app_json_blobs: 'dashboardPrefs',
  /** CRM rows also sync via REST; snapshot preloads `customerDashboard` JSON. */
  customer_crm_interactions: 'customerDashboard',
};

/** setup_* / catalog: bootstrap path + extra tokens to grep in src for UI. */
const MASTERDATA_OR_TOPLEVEL = {
  setup_quote_items: { path: 'masterData.quoteItems', srcTokens: ['quoteItems'] },
  setup_colours: { path: 'masterData.colours', srcTokens: ['colours'] },
  setup_gauges: { path: 'masterData.gauges', srcTokens: ['gauges'] },
  setup_material_types: { path: 'masterData.materialTypes', srcTokens: ['materialTypes'] },
  setup_profiles: { path: 'masterData.profiles', srcTokens: ['profiles'] },
  setup_price_lists: { path: 'masterData.priceList', srcTokens: ['priceList'] },
  setup_expense_categories: { path: 'masterData.expenseCategories', srcTokens: ['expenseCategories'] },
  procurement_catalog: { path: 'procurementCatalog', srcTokens: ['procurementCatalog'] },
};

/** Child / ledger tables that are usually only embedded in a parent bootstrap list. */
const IMPLICIT_PARENT_BOOTSTRAP = {
  quotation_lines: 'quotations',
  purchase_order_lines: 'purchaseOrders',
  cutting_list_lines: 'cuttingLists',
  delivery_lines: 'deliveries',
  in_transit_load_lines: 'inTransitLoads',
  material_request_lines: 'materialRequests',
  gl_journal_lines: 'gl_journal_entries',
};

function walkFiles(dir, exts, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
      walkFiles(p, exts, acc);
    } else if (e.isFile()) {
      const ext = path.extname(e.name);
      if (exts.includes(ext)) acc.push(p);
    }
  }
  return acc;
}

function readAll(files) {
  const parts = [];
  for (const f of files) {
    try {
      parts.push(fs.readFileSync(f, 'utf8'));
    } catch {
      /* skip */
    }
  }
  return parts.join('\n');
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countWord(hay, word) {
  if (!hay || !word) return 0;
  const re = new RegExp(`\\b${escapeRe(word)}\\b`, 'g');
  const m = hay.match(re);
  return m ? m.length : 0;
}

function snakeToCamel(table) {
  const parts = table.split('_').filter(Boolean);
  if (!parts.length) return table;
  return parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

function extractBootstrapTopLevelKeys(bootstrapSrc) {
  const fnIdx = bootstrapSrc.indexOf('export function buildBootstrap');
  if (fnIdx < 0) return new Set();
  const retIdx = bootstrapSrc.indexOf('return {', fnIdx);
  if (retIdx < 0) return new Set();
  let i = retIdx + 'return '.length;
  while (i < bootstrapSrc.length && bootstrapSrc[i] !== '{') i++;
  const startBrace = i;
  let depth = 0;
  for (; i < bootstrapSrc.length; i++) {
    const c = bootstrapSrc[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const inner = bootstrapSrc.slice(startBrace + 1, i);
        const keys = new Set();
        for (const line of inner.split('\n')) {
          const m = line.match(/^    ([a-zA-Z][a-zA-Z0-9]*)\s*[:,]/);
          if (m) keys.add(m[1]);
        }
        return keys;
      }
    }
  }
  return new Set();
}

function countSnapshotStyle(hay, camelKey) {
  if (!hay || !camelKey) return 0;
  const k = escapeRe(camelKey);
  const patterns = [
    new RegExp(`\\bsnapshot\\.${k}\\b`, 'g'),
    new RegExp(`\\bsnapshot\\?\\.${k}\\b`, 'g'),
    new RegExp(`\\bws\\.snapshot\\.${k}\\b`, 'g'),
    new RegExp(`\\bws\\?\\.snapshot\\.${k}\\b`, 'g'),
    new RegExp(`\\bs\\.${k}\\b`, 'g'),
  ];
  let n = 0;
  for (const re of patterns) {
    const m = hay.match(re);
    if (m) n += m.length;
  }
  return n;
}

function countMasterDataTokens(hay, tokens) {
  let n = 0;
  for (const t of tokens) {
    n += countWord(hay, t);
  }
  return n;
}

function parseSchemaTables(schemaPath) {
  const src = fs.readFileSync(schemaPath, 'utf8');
  const re = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(/gi;
  const tables = [];
  let m;
  while ((m = re.exec(src))) tables.push(m[1]);
  return [...new Set(tables)].sort();
}

function resolveBootstrapKey(table) {
  if (MASTERDATA_OR_TOPLEVEL[table]) return MASTERDATA_OR_TOPLEVEL[table].path;
  if (BOOTSTRAP_KEY_OVERRIDES[table]) return BOOTSTRAP_KEY_OVERRIDES[table];
  if (IMPLICIT_PARENT_BOOTSTRAP[table]) {
    const parentTable = IMPLICIT_PARENT_BOOTSTRAP[table];
    const parentKey =
      BOOTSTRAP_KEY_OVERRIDES[parentTable] || snakeToCamel(parentTable);
    return `embedded_in.${parentKey}`;
  }
  return snakeToCamel(table);
}

function topLevelCamelFromPath(path) {
  if (path.startsWith('masterData.')) return 'masterData';
  if (path.startsWith('embedded_in.')) return path.replace('embedded_in.', '');
  return path;
}

function classifyRow(r) {
  const boot = r.in_bootstrap_top_level === 'yes' || r.bootstrap_path.startsWith('masterData');
  const ui =
    Number(r.hits_src_snake) > 0 ||
    Number(r.hits_snapshot_key) > 0 ||
    Number(r.hits_masterdata_src_tokens) > 0;
  if (boot && ui) return 'bootstrap_or_masterdata_to_ui';
  if (boot && !ui) return 'bootstrap_payload_low_ui_signal';
  if (!boot && ui) return 'ui_signal_without_bootstrap_key_match';
  if (Number(r.hits_server) > 0) return 'server_only_heuristic';
  return 'no_server_hits_check_migrations';
}

function parseArgs(argv) {
  const out = { file: null, json: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--out' && argv[i + 1]) {
      out.file = argv[++i];
    }
  }
  return out;
}

function csvEscape(s) {
  const t = String(s ?? '');
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function main() {
  const args = parseArgs(process.argv);
  const schemaPath = path.join(ROOT, 'server', 'schemaSql.js');
  const tables = parseSchemaTables(schemaPath);

  const serverFiles = walkFiles(path.join(ROOT, 'server'), ['.js']);
  const srcFiles = walkFiles(path.join(ROOT, 'src'), ['.js', '.jsx']);
  const e2eFiles = walkFiles(path.join(ROOT, 'e2e'), ['.js']);

  const serverHay = readAll(serverFiles);
  const srcHay = readAll(srcFiles);
  const e2eHay = readAll(e2eFiles);
  const httpApiPath = path.join(ROOT, 'server', 'httpApi.js');
  const bootstrapPath = path.join(ROOT, 'server', 'bootstrap.js');
  const httpApiHay = fs.existsSync(httpApiPath) ? fs.readFileSync(httpApiPath, 'utf8') : '';
  const bootstrapHay = fs.existsSync(bootstrapPath) ? fs.readFileSync(bootstrapPath, 'utf8') : '';

  const bootstrapKeys = extractBootstrapTopLevelKeys(bootstrapHay);

  const rows = [];
  for (const table of tables) {
    const pathLabel = resolveBootstrapKey(table);
    const topCamel = topLevelCamelFromPath(pathLabel);
    const inTop = bootstrapKeys.has(topCamel) ? 'yes' : 'no';
    const md = MASTERDATA_OR_TOPLEVEL[table];
    const hitsMd = md ? countMasterDataTokens(srcHay, md.srcTokens) : 0;

    let snapHits = 0;
    if (pathLabel.startsWith('embedded_in.')) {
      const parentKey = pathLabel.replace('embedded_in.', '');
      snapHits = countSnapshotStyle(srcHay, parentKey);
    } else if (pathLabel.startsWith('masterData.')) {
      snapHits = countSnapshotStyle(srcHay, 'masterData');
    } else {
      snapHits = countSnapshotStyle(srcHay, topCamel);
    }

    const row = {
      table_name: table,
      bootstrap_path: pathLabel,
      in_bootstrap_top_level: inTop,
      hits_server: countWord(serverHay, table),
      hits_httpApi: countWord(httpApiHay, table),
      hits_bootstrap_js: countWord(bootstrapHay, table),
      hits_src_snake: countWord(srcHay, table),
      hits_snapshot_key: snapHits,
      hits_masterdata_src_tokens: hitsMd,
      hits_e2e_snake: countWord(e2eHay, table),
      classification: '',
    };
    row.classification = classifyRow(row);
    rows.push(row);
  }

  if (args.json) {
    const payload = JSON.stringify(rows, null, 2);
    if (args.file) {
      fs.mkdirSync(path.dirname(args.file), { recursive: true });
      fs.writeFileSync(args.file, payload, 'utf8');
    } else {
      console.log(payload);
    }
    return;
  }

  const headers = [
    'table_name',
    'bootstrap_path',
    'in_bootstrap_top_level',
    'hits_server',
    'hits_httpApi',
    'hits_bootstrap_js',
    'hits_src_snake',
    'hits_snapshot_key',
    'hits_masterdata_src_tokens',
    'hits_e2e_snake',
    'classification',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  }
  const csv = lines.join('\n');
  if (args.file) {
    fs.mkdirSync(path.dirname(args.file), { recursive: true });
    fs.writeFileSync(args.file, csv, 'utf8');
    console.error(`Wrote ${args.file} (${rows.length} tables)`);
  } else {
    console.log(csv);
  }
}

main();
