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
  listAppUsers,
  listPeriodLocks,
  listApprovalActions,
  listAuditLog,
  computeProductionMetricsRollup,
} from './readModel.js';
import { listMasterData } from './masterData.js';
import { listProductionConversionChecks, listProductionJobCoils } from './productionTraceability.js';
import { listBranches } from './branches.js';

/**
 * Full workspace snapshot for SPA bootstrap (single round-trip).
 * @param {import('better-sqlite3').Database} db
 * @param {{
 *   session?: {authenticated: boolean, user?: object | null, permissions?: string[]};
 *   includeControls?: boolean;
 *   includeUsers?: boolean;
 *   branchScope?: 'ALL' | string;
 * }} [opts]
 */
export function buildBootstrap(db, opts = {}) {
  const branchScope = opts.branchScope ?? 'ALL';
  const customerDashboard = getJsonBlob(db, 'customer_dashboard') ?? {
    orders: [],
    interactions: [],
    salesTrendByCustomer: {},
  };
  const availableStock = getJsonBlob(db, 'sales_available_stock') ?? [];
  const session = opts.session ?? { authenticated: false, user: null, permissions: [] };

  return {
    ok: true,
    session,
    permissions: [...(session.permissions || [])],
    workspaceBranches: listBranches(db),
    branchScope,
    customers: listCustomers(db),
    quotations: listQuotations(db, branchScope),
    ledgerEntries: listLedgerEntries(db, branchScope),
    advanceInEvents: listAdvanceInEvents(db),
    suppliers: listSuppliers(db),
    transportAgents: listTransportAgents(db),
    products: listProducts(db),
    purchaseOrders: listPurchaseOrders(db, branchScope),
    coilLots: listCoilLots(db, branchScope),
    movements: listStockMovements(db),
    wipByProduct: getWipByProduct(db),
    deliveries: listDeliveries(db, branchScope),
    receipts: listSalesReceipts(db, branchScope),
    cuttingLists: listCuttingLists(db, branchScope),
    productionJobs: listProductionJobs(db, branchScope),
    productionMetrics: computeProductionMetricsRollup(db, branchScope),
    productionJobCoils: listProductionJobCoils(db),
    productionConversionChecks: listProductionConversionChecks(db),
    refunds: listRefunds(db, branchScope),
    masterData: listMasterData(db),
    treasuryAccounts: listTreasuryAccounts(db),
    treasuryMovements: listTreasuryMovements(db),
    expenses: listExpenses(db, branchScope),
    paymentRequests: listPaymentRequests(db),
    accountsPayable: listAccountsPayable(db),
    bankReconciliation: listBankReconciliation(db),
    coilRequests: listCoilRequests(db),
    yardCoilRegister: listYardCoils(db),
    procurementCatalog: listProcurementCatalog(db),
    salesAvailableStock: availableStock,
    customerDashboard,
    appUsers: opts.includeUsers ? listAppUsers(db) : [],
    periodLocks: opts.includeControls ? listPeriodLocks(db) : [],
    approvalActions: opts.includeControls ? listApprovalActions(db) : [],
    auditLog: opts.includeControls ? listAuditLog(db) : [],
  };
}
