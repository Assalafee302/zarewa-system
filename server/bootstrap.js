import {
  listCustomers,
  listQuotations,
  listLedgerEntries,
  listSuppliers,
  listTransportAgents,
  listProducts,
  listPurchaseOrders,
  listCoilLots,
  listStockMovements,
  getWipByProduct,
  listDeliveries,
  listSalesReceipts,
  listCuttingLists,
  listRefunds,
  listTreasuryAccounts,
  listTreasuryMovements,
  listExpenses,
  listPaymentRequests,
  listAccountsPayable,
  listBankReconciliation,
  listCoilRequests,
  listYardCoils,
  listProcurementCatalog,
  getJsonBlob,
  listAdvanceInEvents,
  listProductionJobs,
  listProductionJobAccessoryUsage,
  listAppUsers,
  listPeriodLocks,
  listApprovalActions,
  listAuditLog,
  computeProductionMetricsRollup,
} from './readModel.js';
import { listMasterData } from './masterData.js';
import { listProductionConversionChecks, listProductionJobCoils } from './productionTraceability.js';
import { listBranches } from './branches.js';
import { SUGGESTED_ROLE_BY_DEPARTMENT, WORKSPACE_DEPARTMENT_IDS } from './departmentRoleTemplates.js';
import {
  canListTreasuryAccounts,
  canReadCoilAndMovements,
  canReadFinanceDomain,
  canReadLedgerRelated,
  canReadMasterData,
  canReadOperationsDomain,
  canReadProcurementDomain,
  canReadProductionSnapshot,
  canReadProductsCatalog,
  canReadSalesDomain,
  canSeeCoilRequests,
  canSeePaymentRequests,
  canSeeRefundsList,
  canReadYardRegister,
  EMPTY_MASTER_DATA,
} from './workspaceAccess.js';

/**
 * Full workspace snapshot for SPA bootstrap (single round-trip), filtered by the signed-in user.
 * @param {import('better-sqlite3').Database} db
 * @param {{
 *   user?: object | null;
 *   session?: {authenticated: boolean, user?: object | null, permissions?: string[]};
 *   includeControls?: boolean;
 *   includeUsers?: boolean;
 *   branchScope?: 'ALL' | string;
 * }} [opts]
 */
export function buildBootstrap(db, opts = {}) {
  const branchScope = opts.branchScope ?? 'ALL';
  const user = opts.user ?? opts.session?.user ?? null;
  const session = opts.session ?? { authenticated: false, user: null, permissions: [] };

  const salesOk = canReadSalesDomain(user);
  const procOk = canReadProcurementDomain(user);
  const opsOk = canReadOperationsDomain(user);
  const finOk = canReadFinanceDomain(user);
  const ledgerOk = canReadLedgerRelated(user);
  const treasuryOk = canListTreasuryAccounts(user);
  const refundsOk = canSeeRefundsList(user);
  const payReqOk = canSeePaymentRequests(user);
  const coilReqOk = canSeeCoilRequests(user);
  const masterOk = canReadMasterData(user);
  const productsOk = canReadProductsCatalog(user);
  const prodRollupOk = canReadProductionSnapshot(user);
  const coilMovOk = canReadCoilAndMovements(user);
  const yardOk = canReadYardRegister(user);

  const productionOk = prodRollupOk && opsOk;
  const MAX_PROD_ROWS = Math.min(
    5000,
    Math.max(200, Number(process.env.ZAREWA_BOOTSTRAP_MAX_PRODUCTION_ROWS) || 2000)
  );

  const customerDashboard = salesOk
    ? getJsonBlob(db, 'customer_dashboard') ?? { orders: [], interactions: [], salesTrendByCustomer: {} }
    : { orders: [], interactions: [], salesTrendByCustomer: {} };
  const availableStock = salesOk ? getJsonBlob(db, 'sales_available_stock') ?? [] : [];

  return {
    ok: true,
    session,
    permissions: [...(session.permissions || [])],
    workspaceBranches: listBranches(db),
    branchScope,
    customers: salesOk ? listCustomers(db, branchScope) : [],
    quotations: salesOk ? listQuotations(db, branchScope) : [],
    ledgerEntries: ledgerOk ? listLedgerEntries(db, branchScope) : [],
    advanceInEvents: ledgerOk ? listAdvanceInEvents(db) : [],
    suppliers: procOk ? listSuppliers(db, branchScope) : [],
    transportAgents: procOk ? listTransportAgents(db, branchScope) : [],
    products: productsOk ? listProducts(db, branchScope) : [],
    purchaseOrders: procOk ? listPurchaseOrders(db, branchScope) : [],
    coilLots: coilMovOk ? listCoilLots(db, branchScope) : [],
    movements: coilMovOk ? listStockMovements(db, branchScope) : [],
    wipByProduct: opsOk ? getWipByProduct(db) : {},
    deliveries: opsOk ? listDeliveries(db, branchScope) : [],
    receipts: salesOk ? listSalesReceipts(db, branchScope) : [],
    cuttingLists: opsOk || salesOk ? listCuttingLists(db, branchScope) : [],
    productionJobs: prodRollupOk ? listProductionJobs(db, branchScope) : [],
    productionJobAccessoryUsage: prodRollupOk ? listProductionJobAccessoryUsage(db, branchScope) : [],
    productionMetrics: productionOk
      ? computeProductionMetricsRollup(db, branchScope)
      : {
          jobCount: 0,
          byStatus: {},
          totalPlannedMeters: 0,
          totalActualMeters: 0,
          completedActualMeters: 0,
        },
    productionJobCoils: prodRollupOk ? listProductionJobCoils(db, branchScope, { limit: MAX_PROD_ROWS }) : [],
    productionConversionChecks: prodRollupOk ? listProductionConversionChecks(db, branchScope, { limit: MAX_PROD_ROWS }) : [],
    refunds: refundsOk ? listRefunds(db, branchScope) : [],
    masterData: masterOk ? listMasterData(db) : EMPTY_MASTER_DATA,
    treasuryAccounts: treasuryOk ? listTreasuryAccounts(db) : [],
    treasuryMovements: finOk ? listTreasuryMovements(db) : [],
    expenses: finOk ? listExpenses(db, branchScope) : [],
    paymentRequests: payReqOk ? listPaymentRequests(db, branchScope) : [],
    accountsPayable: finOk ? listAccountsPayable(db, branchScope) : [],
    bankReconciliation: finOk ? listBankReconciliation(db, branchScope) : [],
    coilRequests: coilReqOk ? listCoilRequests(db) : [],
    yardCoilRegister: yardOk ? listYardCoils(db) : [],
    procurementCatalog: procOk ? listProcurementCatalog(db) : [],
    salesAvailableStock: availableStock,
    customerDashboard,
    appUsers: opts.includeUsers ? listAppUsers(db) : [],
    periodLocks: opts.includeControls ? listPeriodLocks(db) : [],
    approvalActions: opts.includeControls ? listApprovalActions(db) : [],
    auditLog: opts.includeControls ? listAuditLog(db) : [],
    dashboardPrefs:
      session?.user?.id != null
        ? getJsonBlob(db, `user_dashboard_prefs:${session.user.id}`) ?? {}
        : {},
    workspaceDepartmentIds: [...WORKSPACE_DEPARTMENT_IDS],
    suggestedRoleByDepartment: { ...SUGGESTED_ROLE_BY_DEPARTMENT },
  };
}

function take(list, limit) {
  if (!Array.isArray(list)) return [];
  if (!limit || limit <= 0) return list;
  return list.slice(0, limit);
}

/**
 * Dashboard-focused snapshot: same shape as bootstrap, but trims heavy arrays.
 * Intended to make the initial dashboard render fast; the app can refresh full bootstrap later.
 */
export function buildDashboardBootstrap(db, opts = {}) {
  const limit = Math.min(5000, Math.max(200, Number(opts.limit) || 600));
  const full = buildBootstrap(db, opts);
  return {
    ...full,
    // Heavy arrays trimmed for dashboard charts/KPIs
    customers: take(full.customers, limit),
    quotations: take(full.quotations, limit),
    receipts: take(full.receipts, limit),
    cuttingLists: take(full.cuttingLists, limit),
    purchaseOrders: take(full.purchaseOrders, limit),
    deliveries: take(full.deliveries, limit),
    refunds: take(full.refunds, limit),
    expenses: take(full.expenses, limit),
    paymentRequests: take(full.paymentRequests, limit),
    treasuryMovements: take(full.treasuryMovements, limit),
    movements: take(full.movements, limit),
    coilLots: take(full.coilLots, limit),
    productionJobs: take(full.productionJobs, limit),
    productionJobCoils: take(full.productionJobCoils, limit),
    productionConversionChecks: take(full.productionConversionChecks, limit),
    // Ledger entries can be extremely large; dashboard doesn't need the full list.
    ledgerEntries: take(full.ledgerEntries, Math.min(limit, 300)),
  };
}
