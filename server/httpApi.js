import {
  advanceBalanceFromEntries,
  amountDueOnQuotationFromEntries,
  ledgerReceiptTotalFromEntries,
  planAdvanceIn,
  planAdvanceApplied,
  planReceiptWithQuotation,
  planRefundAdvance,
  receiptResultFromSavedRows,
} from '../src/lib/customerLedgerCore.js';
import { productionTransactionReportRows } from '../src/lib/productionTransactionReportCore.js';
import { buildBootstrap, buildDashboardBootstrap } from './bootstrap.js';
import {
  CUSTOMER_AND_AR_READ_PERMS,
  LEDGER_RELATED_PERMS,
  OPERATIONS_DOMAIN_PERMS,
  PROCUREMENT_DOMAIN_PERMS,
  REFUNDS_VISIBLE_PERMS,
  SALES_DOMAIN_PERMS,
} from './workspaceAccess.js';
import {
  allKnownPermissionKeys,
  canUseAllBranchesRollup,
  changePassword,
  clearCsrfCookie,
  clearSessionCookie,
  completePasswordReset,
  createAppUserRecord,
  listAllAppUsers,
  loginWithPassword,
  logoutSession,
  patchAppUserWorkspaceDepartment,
  requestPasswordReset,
  requireAuth,
  requirePermission,
  ROLE_DEFINITIONS,
  setCsrfCookie,
  setSessionCookie,
  updateAppUserPermissions,
  updateAppUserRole,
  updateAppUserStatus,
  updateUserProfile,
  userCanApproveEditMutations,
  userHasPermission,
} from './auth.js';
import {
  assertCustomerLedgerPostingBranch,
  resolveBootstrapBranchScope,
} from './branchScope.js';
import {
  assertCuttingListIdInWorkspace,
  assertCuttingListRowInWorkspace,
  assertProductIdInWorkspace,
  assertProductionJobIdInWorkspace,
} from './workspaceBranchGuards.js';
import { sendIdempotentReplayIfAny, storeIdempotentSuccess } from './idempotency.js';
import { DEFAULT_BRANCH_ID, getBranch, listBranches } from './branches.js';
import {
  appendAuditLog,
  decidePaymentRequest,
  decideRefundRequest,
  insertPaymentRequest,
  insertRefundRequest,
  lockAccountingPeriod,
  previewRefundRequest,
  getEligibleRefundQuotations,
  reviewQuotation,
  unlockAccountingPeriod,
  upsertTreasuryAccount,
} from './controlOps.js';
import {
  approveEditApproval,
  createEditApprovalRequest,
  getEditApproval,
  handlePatchWithEditApproval,
  handlePatchWithEditApprovalQuotation,
  listPendingEditApprovals,
} from './editApproval.js';
import { deleteMasterDataRecord, listMasterData, upsertMasterDataRecord } from './masterData.js';
import {
  applyProductionCompletionAdjustment,
  completeProductionJob,
  listProductionJobCoilsForJob,
  listProductionJobCoils,
  previewProductionConversion,
  returnProductionJobToPlanned,
  saveProductionJobAllocations,
  signOffProductionManagerReview,
  startProductionJob,
} from './productionTraceability.js';
import {
  listCustomers,
  getCustomer,
  listQuotations,
  getQuotation,
  getCuttingList,
  listLedgerEntries,
  listLedgerEntriesForCustomer,
  listSuppliers,
  listTransportAgents,
  listRefunds,
  getRefundIntelligenceForQuotation,
  listAdvanceInEvents,
  listAuditLog,
  listAuditLogNdjsonRows,
  listPeriodLocks,
  listCustomerCrmInteractions,
  listCoilLots,
  listStockMovementsForProduct,
  listProductionJobs,
  getJsonBlob,
  setJsonBlob,
  workspaceReportAggregateCounts,
  dashboardSummary,
  execOrgSummary,
  listManagementItems,
  listManagerQuotationAudit,
  listBankReconciliation,
} from './readModel.js';
import {
  approveMdPriceExceptionForQuotation,
  deletePriceListItem,
  listPriceListItems,
  priceListItemsToCsv,
  upsertPriceListItem,
} from './pricingOps.js';
import { workspaceQuickSearch } from './workspaceSearchOps.js';
import { insertLedgerRows } from './writeOps.js';
import { resolveQuotedUnitPrice } from './pricingResolve.js';
import { ensureStoneProduct } from './stoneInventory.js';
import * as write from './writeOps.js';
import {
  createInterBranchLoan,
  getInterBranchLoan,
  interBranchLoanBalances,
  listInterBranchLoans,
  mdApproveInterBranchLoan,
  mdRejectInterBranchLoan,
  recordInterBranchLoanRepayment,
} from './interBranchLoanOps.js';
import {
  listGlAccounts,
  listGlActivityLines,
  listGlJournalEntries,
  listGlJournalLinesForJournal,
  postBalancedJournal,
  trialBalanceRows,
  tryPostCustomerAdvanceGl,
  tryPostCustomerReceiptGl,
} from './glOps.js';
import {
  createFixedAsset,
  disposeFixedAsset,
  getCostingSnapshot,
  listFixedAssets,
  listProductStandardCosts,
  updateFixedAsset,
  upsertProductStandardCost,
} from './accountingPhase2Ops.js';
import { getAccountingStatementsPack } from './accountingStatementsOps.js';
import { getCashFlowPack, getReconciliationPack } from './accountingReconciliationOps.js';
import { postDepreciationRun, previewDepreciationRun } from './depreciationRunOps.js';
import { readAiAssistConfig, runAiChat } from './aiAssist.js';
import {
  computePayrollRun,
  createHrRequest,
  createPayrollRun,
  deleteHrRequestDraft,
  exportPayrollPayslipsCsv,
  exportPayrollStatutoryPackCsv,
  exportPayrollTreasuryPackCsv,
  exportPayrollGlJournalTemplateCsv,
  generateEmploymentLetter,
  getHrMeProfile,
  getHrDailyRollCall,
  getPayrollRunById,
  hrListScope,
  hrReviewRequest,
  hrTablesReady,
  listEmploymentLetters,
  listHrAttendance,
  listHrCompensationInsights,
  listHrDataCleanupQueue,
  applyHrDataCleanupAction,
  hrNextUatReadiness,
  listHrRequests,
  listHrStaff,
  listPayrollLines,
  listPayrollRuns,
  managerReviewRequest,
  branchManagerEndorseRequest,
  gmHrReviewRequest,
  patchHrLoanMaintenance,
  patchHrStaffBonusAccrualNote,
  patchPayrollRun,
  approvePayrollRunByMd,
  recomputeHrLeaveBalances,
  registerNewStaffWithProfile,
  salaryWelfareSnapshot,
  submitHrRequest,
  acceptHrPolicy,
  listMissingHrPolicyAcceptances,
  listHrObservability,
  listHrPolicyAcknowledgements,
  listHrLeaveBalances,
  adjustHrLeaveBalance,
  appendHrAuditEvent,
  upsertHrDailyRollCall,
  upsertHrStaffProfile,
  uploadHrAttendance,
  getHrInboxSummary,
  listHrStaffBranchHistory,
  listHrPublicHolidays,
  putHrPublicHoliday,
  leaveOverlayForBranchDay,
  listHrDisciplineCases,
  createHrDisciplineCase,
  appendHrDisciplineEvent,
  listHrDisciplineEvents,
  listHrAppraisalCycles,
  createHrAppraisalCycle,
  listHrAppraisalForms,
  upsertHrAppraisalForm,
  listHrFeedbackNotes,
  createHrFeedbackNote,
  runHrScheduledJobs,
} from './hrOps.js';
import { requiredHrPoliciesFor } from './hrPolicy.js';

const loginAttemptBuckets = new Map();
const ledgerPostBuckets = new Map();
const bankFinanceImportBuckets = new Map();
const aiChatBuckets = new Map();

const STRICT_BRANCH_AUDIT_TABLES = [
  { table: 'customers', idColumn: 'customer_id' },
  { table: 'customer_crm_interactions', idColumn: 'id' },
  { table: 'suppliers', idColumn: 'supplier_id' },
  { table: 'transport_agents', idColumn: 'id' },
  { table: 'products', idColumn: 'product_id' },
  { table: 'quotations', idColumn: 'id' },
  { table: 'ledger_entries', idColumn: 'id' },
  { table: 'sales_receipts', idColumn: 'id' },
  { table: 'cutting_lists', idColumn: 'id' },
  { table: 'purchase_orders', idColumn: 'po_id' },
  { table: 'coil_lots', idColumn: 'coil_no' },
  { table: 'deliveries', idColumn: 'id' },
  { table: 'production_jobs', idColumn: 'id' },
  { table: 'customer_refunds', idColumn: 'refund_id' },
  { table: 'expenses', idColumn: 'expense_id' },
];

function tableHasColumn(db, table, column) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  } catch {
    return false;
  }
}
const forgotPasswordBuckets = new Map();

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim().slice(0, 64);
  return String(req.socket?.remoteAddress || '0').slice(0, 64);
}

/**
 * Sliding window rate limit. @returns {boolean} true if allowed
 */
function allowRateLimit(buckets, key, maxEvents, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
  }
  b.count += 1;
  buckets.set(key, b);
  return b.count <= maxEvents;
}

const skipAuthedRateLimit =
  process.env.VITEST === 'true' ||
  process.env.NODE_ENV === 'test' ||
  process.env.ZAREWA_TEST_SKIP_RATE_LIMIT === '1';

/** @param {Map<string, { count: number; resetAt: number }>} buckets */
function rateLimitAuthedUser(buckets, label, maxEvents, windowMs) {
  return (req, res, next) => {
    if (skipAuthedRateLimit) return next();
    const uid = String(req.user?.id || '').trim();
    if (!uid) return next();
    const key = `${label}:${uid}`;
    if (!allowRateLimit(buckets, key, maxEvents, windowMs)) {
      return res.status(429).json({
        ok: false,
        error: 'Too many requests. Try again shortly.',
        code: 'RATE_LIMIT',
      });
    }
    return next();
  };
}

const loginDelayMs = () =>
  new Promise((resolve) => setTimeout(resolve, 90 + Math.floor(Math.random() * 70)));

function normalizeTreasuryLines(body) {
  const rawLines = Array.isArray(body?.paymentLines)
    ? body.paymentLines
    : body?.treasuryAccountId
      ? [
          {
            treasuryAccountId: body.treasuryAccountId,
            amountNgn: body.amountNgn,
            reference: body.reference ?? body.bankReference,
          },
        ]
      : [];
  return rawLines
    .map((line) => ({
      treasuryAccountId: Number(line?.treasuryAccountId),
      amountNgn: Math.round(Number(line?.amountNgn) || 0),
      reference: String(line?.reference ?? '').trim(),
      note: String(line?.note ?? '').trim(),
    }))
    .filter((line) => line.treasuryAccountId && line.amountNgn > 0);
}

function totalTreasuryLines(lines) {
  return (lines || []).reduce((sum, line) => sum + (Number(line.amountNgn) || 0), 0);
}

function hrCapsForUser(user) {
  const has = (p) => userHasPermission(user, p);
  const star = has('*');
  return {
    ok: true,
    canViewDirectory: star || has('hr.directory.view') || has('hr.staff.manage'),
    canPayroll: star || has('hr.payroll.manage'),
    canManageStaff: star || has('hr.staff.manage'),
    canMarkDailyRoll:
      star || has('hr.attendance.upload') || has('hr.daily_roll.mark') || has('hr.payroll.manage'),
    canUploadAttendance:
      star || has('hr.attendance.upload'),
    canLoanMaint:
      star ||
      has('hr.requests.final_approve') ||
      has('hr.requests.gm_approve') ||
      has('hr.loan_maintain') ||
      has('hr.staff.manage'),
    canHrReview: star || has('hr.requests.hr_review'),
    /** @deprecated use canGmHrApprove — kept for API/clients */
    canFinalApprove: star || has('hr.requests.final_approve') || has('hr.requests.gm_approve'),
    canGmHrApprove: star || has('hr.requests.gm_approve') || has('hr.requests.final_approve'),
    canBranchEndorse: star || has('hr.branch.endorse_staff'),
    canIssueLetters: star || has('hr.letters.generate'),
    canViewSensitiveHr:
      star || has('hr.staff.manage') || has('hr.payroll.manage'),
    canCompliance: star || has('hr.compliance') || has('hr.staff.manage'),
  };
}

function hrScopeFromReq(req) {
  return hrListScope({
    user: req.user,
    workspaceBranchId: req.workspaceBranchId,
    workspaceViewAll: req.workspaceViewAll,
  });
}

function defaultAttendanceSchedule() {
  return {
    graceMinutesLate: 10,
    week: {
      mon: { start: '08:00', end: '17:00' },
      tue: { start: '08:00', end: '17:00' },
      wed: { start: '08:00', end: '17:00' },
      thu: { start: '08:00', end: '17:00' },
      fri: { start: '08:00', end: '17:00' },
      sat: { start: '09:00', end: '16:00' },
    },
  };
}

function parseHmToMinutes(hm) {
  const m = String(hm || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return hh * 60 + mm;
}

function weekdayKeyFromIso(dayIso) {
  const d = new Date(`${dayIso}T00:00:00Z`);
  const idx = d.getUTCDay(); // 0 Sun .. 6 Sat
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][idx] || 'mon';
}

function computeMinutesLateFromSchedule(schedule, dayIso, arrivalHm) {
  const wk = weekdayKeyFromIso(dayIso);
  const startHm = schedule?.week?.[wk]?.start || schedule?.week?.mon?.start || '08:00';
  const startMin = parseHmToMinutes(startHm);
  const arrMin = parseHmToMinutes(arrivalHm);
  if (startMin == null || arrMin == null) return 0;
  const grace = Math.max(0, Math.round(Number(schedule?.graceMinutesLate) || 0));
  return Math.max(0, arrMin - startMin - grace);
}

function resolveHrStaffUserIdParam(req) {
  const raw = String(req.params.userId || '').trim();
  return raw === 'me' ? req.user.id : raw;
}

/**
 * @param {import('express').Express} app
 * @param {import('better-sqlite3').Database} db
 */
export function registerHttpApi(app, db) {
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'zarewa-api',
      time: new Date().toISOString(),
      /** Lets you confirm the running Node process loaded this build (e.g. after deploy / restart). */
      capabilities: {
        cuttingListRegisterProduction: true,
      },
    });
  });

  app.get('/api/ai/status', requireAuth, (_req, res) => {
    res.json({ ok: true, enabled: readAiAssistConfig().enabled });
  });

  app.post(
    '/api/ai/chat',
    requireAuth,
    rateLimitAuthedUser(aiChatBuckets, 'ai-chat', 24, 60_000),
    async (req, res) => {
    try {
      if (!readAiAssistConfig().enabled) {
        return res.status(503).json({ ok: false, error: 'AI assistant is not configured on this server.' });
      }
      const { messages, context } = req.body || {};
      const result = await runAiChat({
        messages,
        context: typeof context === 'string' ? context : '',
        userDisplay: req.user?.displayName,
      });
      return res.json({ ok: true, message: result.content });
    } catch (e) {
      const code = e?.code;
      if (code === 'AI_BAD_REQUEST') {
        return res.status(400).json({ ok: false, error: String(e.message || e) });
      }
      console.error('AI chat error', e);
      return res.status(502).json({ ok: false, error: String(e.message || e) });
    }
  }
  );

  app.get(
    '/api/management/items',
    requirePermission(['audit.view', 'refunds.approve', 'sales.manage', 'quotations.manage']),
    (req, res) => {
      try {
        const branchScope = resolveBootstrapBranchScope(req);
        res.json(listManagementItems(db, branchScope));
      } catch (e) {
        console.error(e);
        res.status(500).json({ ok: false, error: 'Failed to load management items.' });
      }
    }
  );

  app.post('/api/edit-approvals/request', requireAuth, (req, res) => {
    try {
      const { entityKind, entityId } = req.body || {};
      const r = createEditApprovalRequest(db, {
        entityKind,
        entityId,
        branchId: req.workspaceBranchId || DEFAULT_BRANCH_ID,
        actor: req.user,
      });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/edit-approvals/pending', requireAuth, (req, res) => {
    if (!userCanApproveEditMutations(req.user)) {
      return res.status(403).json({ ok: false, error: 'You cannot review edit approvals.' });
    }
    try {
      res.json({ ok: true, items: listPendingEditApprovals(db) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/edit-approvals/:id', requireAuth, (req, res) => {
    try {
      const row = getEditApproval(db, req.params.id);
      if (!row) return res.status(404).json({ ok: false, error: 'Not found.' });
      const uid = String(req.user?.id || '').trim();
      if (row.requestedByUserId !== uid && !userCanApproveEditMutations(req.user)) {
        return res.status(403).json({ ok: false, error: 'Forbidden.' });
      }
      res.json({ ok: true, approval: row });
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/edit-approvals/:id/approve', requireAuth, (req, res) => {
    try {
      const r = approveEditApproval(db, { approvalId: req.params.id, actor: req.user });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/management/targets', requireAuth, requirePermission('quotations.manage'), (req, res) => {
    try {
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'manager_targets', 'manager_targets', (stripped) => {
        const { targets } = stripped || {};
        db.prepare(`INSERT OR REPLACE INTO app_json_blobs (key, payload) VALUES (?, ?)`).run(
          'manager_targets',
          JSON.stringify(targets)
        );
        return { ok: true };
      });
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get(
    '/api/management/quotation-audit',
    requirePermission(['audit.view', 'refunds.approve', 'sales.manage', 'quotations.manage']),
    (req, res) => {
      try {
        res.json(listManagerQuotationAudit(db, req.query.quotationRef));
      } catch (e) {
        console.error(e);
        res.status(500).json({ ok: false, error: 'Failed to load quotation audit.' });
      }
    }
  );

  app.post('/api/management/review', requireAuth, requirePermission('quotations.manage'), (req, res) => {
    try {
      const { quotationId, decision, reason } = req.body || {};
      const r = reviewQuotation(
        db,
        String(quotationId ?? '').trim(),
        { decision, note: reason },
        req.user
      );
      res.json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/dashboard/summary', requirePermission('dashboard.view'), (req, res) => {
    try {
      const branchScope = resolveBootstrapBranchScope(req);
      const payload = dashboardSummary(db, branchScope, { recentLimit: 12 });
      const etag = `W/"${Buffer.from(JSON.stringify(payload)).toString('base64').slice(0, 64)}"`;
      if (String(req.headers['if-none-match'] || '') === etag) {
        return res.status(304).end();
      }
      res.setHeader('ETag', etag);
      return res.json(payload);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'Failed' });
    }
  });

  app.get('/api/session', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, authenticated: false, user: null, permissions: [] });
    }
    return res.json({ ok: true, ...req.session });
  });

  app.post('/api/session/login', async (req, res) => {
    try {
      const ip = clientIp(req);
      const userKey = `${ip}:${String(req.body?.username || '').trim().toLowerCase()}`;
      const { username, password } = req.body || {};
      const result = loginWithPassword(db, username, password);
      if (!result.ok) {
        if (!allowRateLimit(loginAttemptBuckets, userKey, 12, 30 * 60 * 1000)) {
          await loginDelayMs();
          return res.status(429).json({
            ok: false,
            error: 'Too many sign-in attempts. Wait up to 30 minutes or try another network.',
          });
        }
        await loginDelayMs();
        return res.status(401).json({ ok: false, error: result.error });
      }
      setSessionCookie(res, result.sessionToken);
      // CSRF cookie used by the SPA to protect cookie-authenticated write requests.
      setCsrfCookie(res);
      appendAuditLog(db, {
        actor: result.session.user,
        action: 'session.login',
        entityKind: 'user',
        entityId: result.session.user?.id ?? '',
        note: 'User signed in',
      });
      return res.json({ ok: true, ...result.session });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'Login failed' });
    }
  });

  app.post('/api/session/forgot-password', async (req, res) => {
    try {
      const ip = clientIp(req);
      if (!allowRateLimit(forgotPasswordBuckets, ip, 6, 60 * 60 * 1000)) {
        await loginDelayMs();
        return res.status(429).json({ ok: false, error: 'Too many reset requests. Try again in an hour.' });
      }
      await loginDelayMs();
      const identifier = req.body?.username ?? req.body?.email ?? req.body?.identifier;
      const result = requestPasswordReset(db, identifier);
      return res.json({
        ok: true,
        message:
          'If an account matches, a single-use reset code was created. It expires in one hour. ' +
          'Delivered only through your configured channel (for example email from your administrator). ' +
          'Use the same username or email together with the code on the reset screen.',
        ...(process.env.NODE_ENV !== 'production' && result.devResetToken
          ? { devResetToken: result.devResetToken }
          : {}),
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'Could not process reset request.' });
    }
  });

  app.post('/api/session/reset-password', async (req, res) => {
    try {
      const ip = clientIp(req);
      if (!allowRateLimit(loginAttemptBuckets, `${ip}:reset`, 10, 30 * 60 * 1000)) {
        await loginDelayMs();
        return res.status(429).json({ ok: false, error: 'Too many attempts. Try again later.' });
      }
      await loginDelayMs();
      const { identifier, token, newPassword } = req.body || {};
      const result = completePasswordReset(db, identifier, token, newPassword);
      if (!result.ok) {
        return res.status(400).json(result);
      }
      appendAuditLog(db, {
        actor: { id: null, displayName: 'Password reset', username: String(identifier || '').trim() },
        action: 'session.password_reset_complete',
        entityKind: 'user',
        entityId: String(identifier || '').trim(),
        note: 'Password reset via token',
      });
      return res.json({ ok: true, message: 'Password updated. You can sign in with your new password.' });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'Could not reset password.' });
    }
  });

  app.post('/api/session/logout', requireAuth, (req, res) => {
    try {
      appendAuditLog(db, {
        actor: req.user,
        action: 'session.logout',
        entityKind: 'user',
        entityId: req.user?.id ?? '',
        note: 'User signed out',
      });
      logoutSession(db, req.sessionToken);
      clearSessionCookie(res);
      clearCsrfCookie(res);
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Logout failed' });
    }
  });

  app.patch('/api/session/workspace', requireAuth, (req, res) => {
    try {
      const token = req.sessionToken;
      if (!token) return res.status(401).json({ ok: false, error: 'No session.' });
      const branchCol = db.prepare(`PRAGMA table_info(user_sessions)`).all().some((c) => c.name === 'current_branch_id');
      if (!branchCol) {
        return res.status(500).json({ ok: false, error: 'Workspace columns missing; restart server after migration.' });
      }
      const row = db
        .prepare(`SELECT current_branch_id, view_all_branches FROM user_sessions WHERE session_token = ?`)
        .get(token);
      if (!row) return res.status(401).json({ ok: false, error: 'Session expired.' });

      let nextBranch = String(row.current_branch_id || '').trim() || DEFAULT_BRANCH_ID;
      if (req.body?.currentBranchId != null && String(req.body.currentBranchId).trim()) {
        if (!canUseAllBranchesRollup(req.user)) {
          return res.status(403).json({ ok: false, error: 'Only Admin, MD, or CEO can change branch.' });
        }
        const id = String(req.body.currentBranchId).trim();
        const br = getBranch(db, id);
        if (!br || !br.active) {
          return res.status(400).json({ ok: false, error: 'Invalid or inactive branch.' });
        }
        nextBranch = id;
      }

      let viewAll = Number(row.view_all_branches) === 1 ? 1 : 0;
      if (req.body?.viewAllBranches === true) {
        if (!canUseAllBranchesRollup(req.user)) {
          return res.status(403).json({ ok: false, error: 'Only Admin, MD, or CEO can view all branches.' });
        }
        viewAll = 1;
      } else if (req.body?.viewAllBranches === false) {
        viewAll = 0;
      }

      if (
        req.body?.currentBranchId == null &&
        req.body?.viewAllBranches === undefined
      ) {
        return res.status(400).json({ ok: false, error: 'Send currentBranchId and/or viewAllBranches.' });
      }

      db.prepare(
        `UPDATE user_sessions SET current_branch_id = ?, view_all_branches = ? WHERE session_token = ?`
      ).run(nextBranch, viewAll, token);

      appendAuditLog(db, {
        actor: req.user,
        action: 'session.workspace',
        entityKind: 'branch',
        entityId: nextBranch,
        note: viewAll ? 'HQ: all branches' : 'Branch workspace',
      });
      return res.json({
        ok: true,
        currentBranchId: nextBranch,
        viewAllBranches: Boolean(viewAll),
        branches: listBranches(db),
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'Could not update workspace.' });
    }
  });

  app.post('/api/session/change-password', requireAuth, (req, res) => {
    try {
      const r = changePassword(db, req.user.id, req.body?.currentPassword, req.body?.newPassword);
      if (!r.ok) return res.status(400).json(r);
      appendAuditLog(db, {
        actor: req.user,
        action: 'session.change_password',
        entityKind: 'user',
        entityId: req.user.id,
        note: 'Password changed',
      });
      return res.json({ ok: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'Could not change password' });
    }
  });

  app.patch('/api/session/profile', requireAuth, (req, res) => {
    try {
      const r = updateUserProfile(db, req.user.id, {
        displayName: req.body?.displayName,
        email: req.body?.email,
        avatarUrl: req.body?.avatarUrl,
      });
      if (!r.ok) return res.status(400).json(r);
      appendAuditLog(db, {
        actor: req.user,
        action: 'session.profile_update',
        entityKind: 'user',
        entityId: req.user.id,
        note: 'Profile updated',
      });
      return res.json({ ok: true, user: r.user });
    } catch (e) {
      console.error(e);
      if (String(e?.message || e).toLowerCase().includes('unique')) {
        return res.status(400).json({ ok: false, error: 'That email is already in use.' });
      }
      return res.status(500).json({ ok: false, error: 'Could not update profile.' });
    }
  });

  app.patch('/api/session/dashboard-prefs', requireAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const prev = getJsonBlob(db, `user_dashboard_prefs:${req.user.id}`) || {};
      const prevMt = prev.managerTargets && typeof prev.managerTargets === 'object' ? prev.managerTargets : {};
      const bodyMt = body.managerTargets && typeof body.managerTargets === 'object' ? body.managerTargets : {};
      const naira = Number(bodyMt.nairaTargetPerMonth);
      const met = Number(bodyMt.meterTargetPerMonth);
      const next = {
        showCharts: body.showCharts !== false,
        showReportsStrip: body.showReportsStrip !== false,
        showAlertBanner: body.showAlertBanner !== false,
        managerTargetsPersonalOverride: Object.prototype.hasOwnProperty.call(body, 'managerTargetsPersonalOverride')
          ? body.managerTargetsPersonalOverride === true
          : Boolean(prev.managerTargetsPersonalOverride),
        managerTargets: {
          nairaTargetPerMonth:
            Number.isFinite(naira) && naira > 0
              ? naira
              : Number(prevMt.nairaTargetPerMonth) > 0
                ? Number(prevMt.nairaTargetPerMonth)
                : 50_000_000,
          meterTargetPerMonth:
            Number.isFinite(met) && met > 0
              ? met
              : Number(prevMt.meterTargetPerMonth) > 0
                ? Number(prevMt.meterTargetPerMonth)
                : 250_000,
        },
      };
      setJsonBlob(db, `user_dashboard_prefs:${req.user.id}`, next);
      return res.json({ ok: true, dashboardPrefs: next });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'Could not save dashboard preferences.' });
    }
  });

  app.patch('/api/setup/org-manager-targets', requireAuth, requirePermission('settings.view'), (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      if (body.clear === true) {
        setJsonBlob(db, 'org.manager_targets.v1', null);
        appendAuditLog(db, {
          actor: req.user,
          action: 'org.manager_targets.clear',
          entityKind: 'settings',
          entityId: 'org.manager_targets.v1',
          note: 'Cleared company manager dashboard targets',
        });
        return res.json({ ok: true, orgManagerTargets: null });
      }
      const prev = getJsonBlob(db, 'org.manager_targets.v1') || {};
      const next = { ...prev };
      if (Object.prototype.hasOwnProperty.call(body, 'nairaTargetPerMonth')) {
        const n = Number(body.nairaTargetPerMonth);
        if (Number.isFinite(n) && n > 0) next.nairaTargetPerMonth = n;
        else delete next.nairaTargetPerMonth;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'meterTargetPerMonth')) {
        const m = Number(body.meterTargetPerMonth);
        if (Number.isFinite(m) && m > 0) next.meterTargetPerMonth = m;
        else delete next.meterTargetPerMonth;
      }
      if (Object.keys(next).length === 0) {
        setJsonBlob(db, 'org.manager_targets.v1', null);
        appendAuditLog(db, {
          actor: req.user,
          action: 'org.manager_targets.clear',
          entityKind: 'settings',
          entityId: 'org.manager_targets.v1',
          note: 'Cleared company manager dashboard targets (empty save)',
        });
        return res.json({ ok: true, orgManagerTargets: null });
      }
      setJsonBlob(db, 'org.manager_targets.v1', next);
      appendAuditLog(db, {
        actor: req.user,
        action: 'org.manager_targets.update',
        entityKind: 'settings',
        entityId: 'org.manager_targets.v1',
        note: 'Updated company manager dashboard targets',
        details: next,
      });
      return res.json({ ok: true, orgManagerTargets: next });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'Could not save company manager targets.' });
    }
  });

  app.use('/api', requireAuth);

  app.get('/api/bootstrap', (req, res) => {
    try {
      const includeControls =
        userHasPermission(req.user, 'audit.view') ||
        userHasPermission(req.user, 'period.manage') ||
        userHasPermission(req.user, 'finance.approve');
      const includeUsers = userHasPermission(req.user, 'settings.view');
      const branchScope = resolveBootstrapBranchScope(req);
      const mode = String(req.query?.mode ?? '').trim().toLowerCase();
      const limit = parseInt(String(req.query?.limit ?? '600'), 10) || 600;
      const payload =
        mode === 'dashboard'
          ? buildDashboardBootstrap(db, {
              user: req.user,
              session: req.session,
              includeControls,
              includeUsers,
              branchScope,
              limit,
            })
          : buildBootstrap(db, {
              user: req.user,
              session: req.session,
              includeControls,
              includeUsers,
              branchScope,
            });
      if (payload.ok && payload.session?.user?.id) {
        const me = getHrMeProfile(db, payload.session.user.id);
        payload.session = {
          ...payload.session,
          user: {
            ...payload.session.user,
            hrSelfServiceEligible: Boolean(me.hr?.selfServiceEligible),
          },
        };
      }
      res.json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Bootstrap failed' });
    }
  });

  app.patch('/api/workspace/app-users/:userId/department', requirePermission('settings.view'), (req, res) => {
    try {
      const uid = req.params.userId;
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'user', uid, (stripped) => {
        const r = patchAppUserWorkspaceDepartment(db, req.user, uid, stripped?.department);
        if (!r.ok) return { ok: false, error: r.error };
        appendAuditLog(db, {
          actor: req.user,
          action: 'user.workspace_department',
          entityKind: 'user',
          entityId: r.user.id,
          note: String(r.user.department || ''),
        });
        return { ok: true, user: r.user };
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'Could not update workspace department.' });
    }
  });

  app.get('/api/users', requirePermission('settings.view'), (req, res) => {
    try {
      res.json({ ok: true, users: listAllAppUsers(db) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not list users.' });
    }
  });

  app.post('/api/users', requirePermission('settings.view'), (req, res) => {
    try {
      const r = createAppUserRecord(db, req.body || {});
      if (!r.ok) return res.status(400).json(r);
      appendAuditLog(db, {
        actor: req.user,
        action: 'user.create',
        entityKind: 'user',
        entityId: r.userId,
        note: `Created user ${req.body.username}`,
      });
      res.status(201).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/users/:id/role', requirePermission('settings.view'), (req, res) => {
    try {
      const id = req.params.id;
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'user', id, (stripped) => {
        const r = updateAppUserRole(db, id, stripped?.roleKey);
        if (!r.ok) return r;
        appendAuditLog(db, {
          actor: req.user,
          action: 'user.update_role',
          entityKind: 'user',
          entityId: id,
          note: `Role updated to ${stripped?.roleKey}`,
        });
        return { ok: true };
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/users/:id/permissions', requirePermission('settings.view'), (req, res) => {
    try {
      const id = req.params.id;
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'user', id, (stripped) => {
        const r = updateAppUserPermissions(db, id, stripped?.permissions);
        if (!r.ok) return r;
        appendAuditLog(db, {
          actor: req.user,
          action: 'user.update_permissions',
          entityKind: 'user',
          entityId: id,
          note: 'Granular permissions updated',
        });
        return { ok: true };
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/roles', requirePermission('settings.view'), (_req, res) => {
    try {
      const roles = Object.entries(ROLE_DEFINITIONS).map(([key, v]) => ({
        key,
        label: v.label,
        permissions: [...v.permissions],
      }));
      roles.sort((a, b) => a.key.localeCompare(b.key));
      res.json({
        ok: true,
        roles,
        permissionKeys: allKnownPermissionKeys(),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not load roles.' });
    }
  });

  app.patch('/api/users/:id/status', requirePermission('settings.view'), (req, res) => {
    try {
      const id = req.params.id;
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'user', id, (stripped) => {
        const r = updateAppUserStatus(db, id, stripped?.status, { actorUserId: req.user.id });
        if (!r.ok) return r;
        appendAuditLog(db, {
          actor: req.user,
          action: 'user.update_status',
          entityKind: 'user',
          entityId: id,
          note: `Status updated to ${stripped?.status}`,
        });
        return { ok: true };
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/gl/accounts', requirePermission('finance.view'), (req, res) => {
    try {
      res.json({ ok: true, accounts: listGlAccounts(db) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/gl/trial-balance', requirePermission('finance.view'), (req, res) => {
    const startDate = String(req.query.startDate || '').slice(0, 10);
    const endDate = String(req.query.endDate || '').slice(0, 10);
    const r = trialBalanceRows(db, startDate, endDate);
    if (!r.ok) return res.status(400).json(r);
    res.json(r);
  });

  app.get('/api/gl/journals', requirePermission('finance.view'), (req, res) => {
    const startDate = String(req.query.startDate || '').slice(0, 10);
    const endDate = String(req.query.endDate || '').slice(0, 10);
    const r = listGlJournalEntries(db, startDate, endDate);
    if (!r.ok) return res.status(400).json(r);
    res.json(r);
  });

  app.get('/api/gl/journals/:journalId/lines', requirePermission('finance.view'), (req, res) => {
    const r = listGlJournalLinesForJournal(db, String(req.params.journalId || ''));
    if (!r.ok) return res.status(400).json(r);
    res.json(r);
  });

  app.get('/api/gl/activity', requirePermission('finance.view'), (req, res) => {
    const startDate = String(req.query.startDate || '').slice(0, 10);
    const endDate = String(req.query.endDate || '').slice(0, 10);
    const r = listGlActivityLines(db, startDate, endDate);
    if (!r.ok) return res.status(400).json(r);
    res.json(r);
  });

  app.post('/api/gl/journal', requirePermission('finance.post'), (req, res) => {
    try {
      const r = postBalancedJournal(db, {
        entryDateISO: req.body?.entryDateISO,
        memo: req.body?.memo,
        sourceKind: req.body?.sourceKind,
        sourceId: req.body?.sourceId,
        branchId: req.workspaceBranchId,
        createdByUserId: req.user?.id,
        lines: req.body?.lines || [],
      });
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/accounting/fixed-assets', requirePermission('finance.view'), (req, res) => {
    try {
      const branchScope = resolveBootstrapBranchScope(req);
      res.json(listFixedAssets(db, branchScope));
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/accounting/fixed-assets', requirePermission('finance.post'), (req, res) => {
    try {
      const r = createFixedAsset(db, req.body, req.user);
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/accounting/fixed-assets/:id', requirePermission('finance.post'), (req, res) => {
    try {
      const fid = req.params.id;
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'fixed_asset', fid, (stripped) =>
        updateFixedAsset(db, fid, stripped, req.user)
      );
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/accounting/fixed-assets/:id/dispose', requirePermission('finance.post'), (req, res) => {
    try {
      const r = disposeFixedAsset(db, req.params.id, req.body?.disposalDateIso, req.user);
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/accounting/standard-costs', requirePermission('finance.view'), (req, res) => {
    try {
      res.json(listProductStandardCosts(db));
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.put('/api/accounting/standard-costs/:productId', requirePermission('finance.post'), (req, res) => {
    try {
      const pid = req.params.productId;
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'standard_cost', pid, (stripped) =>
        upsertProductStandardCost(db, pid, stripped, req.user)
      );
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/accounting/costing-snapshot', requirePermission('finance.view'), (req, res) => {
    try {
      const branchScope = resolveBootstrapBranchScope(req);
      res.json(getCostingSnapshot(db, branchScope));
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/accounting/statements-pack', requirePermission('finance.view'), (req, res) => {
    try {
      const periodKey = String(req.query.periodKey || '').trim();
      const branchScope = resolveBootstrapBranchScope(req);
      const pack = getAccountingStatementsPack(db, periodKey, branchScope);
      res.status(pack.ok ? 200 : 400).json(pack);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/accounting/reconciliation-pack', requirePermission('finance.view'), (req, res) => {
    try {
      const periodKey = String(req.query.periodKey || '').trim();
      const branchScope = resolveBootstrapBranchScope(req);
      const pack = getReconciliationPack(db, periodKey, branchScope);
      res.status(pack.ok ? 200 : 400).json(pack);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/accounting/cash-flow', requirePermission('finance.view'), (req, res) => {
    try {
      const periodKey = String(req.query.periodKey || '').trim();
      const pack = getCashFlowPack(db, periodKey);
      res.status(pack.ok ? 200 : 400).json(pack);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/accounting/depreciation-preview', requirePermission('finance.view'), (req, res) => {
    try {
      const periodKey = String(req.query.periodKey || '').trim();
      const branchScope = resolveBootstrapBranchScope(req);
      const r = previewDepreciationRun(db, periodKey, branchScope);
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/accounting/depreciation-run', requirePermission('finance.post'), (req, res) => {
    try {
      const periodKey = String(req.body?.periodKey || '').trim();
      const branchScope = resolveBootstrapBranchScope(req);
      const r = postDepreciationRun(db, periodKey, branchScope, req.user, req.workspaceBranchId || DEFAULT_BRANCH_ID);
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/reports/summary', requirePermission('reports.view'), (req, res) => {
    try {
      const branchScope = resolveBootstrapBranchScope(req);
      const counts = workspaceReportAggregateCounts(db, branchScope);
      res.json({ ok: true, branchScope, counts });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not load report summary' });
    }
  });

  app.get('/api/reports/production-transaction', requirePermission('reports.view'), (req, res) => {
    try {
      const startDate = String(req.query.startDate || '').slice(0, 10);
      const endDate = String(req.query.endDate || '').slice(0, 10);
      const branchScope = resolveBootstrapBranchScope(req);
      const jobs = listProductionJobs(db, branchScope);
      const coils = listProductionJobCoils(db, branchScope, { limit: 0 });
      const quotations = listQuotations(db, branchScope);
      const refunds = listRefunds(db, branchScope);
      const coilLots = listCoilLots(db, branchScope);
      const rows = productionTransactionReportRows(jobs, coils, quotations, refunds, coilLots, startDate, endDate);
      res.json({ ok: true, startDate, endDate, branchScope, rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not build production transaction report.' });
    }
  });

  app.get('/api/exec/summary', requirePermission('exec.dashboard.view'), (req, res) => {
    try {
      res.json(execOrgSummary(db));
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not load executive summary.' });
    }
  });

  app.get('/api/pricing/price-list', requirePermission(['pricing.manage', 'md.price_exception.approve']), (req, res) => {
    try {
      res.json({ ok: true, items: listPriceListItems(db) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not load price list.' });
    }
  });

  app.get(
    '/api/pricing/price-list/export.csv',
    requirePermission(['pricing.manage', 'md.price_exception.approve']),
    (req, res) => {
      try {
        const csv = priceListItemsToCsv(listPriceListItems(db));
        const name = `price-list-items-${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
        res.send(`\uFEFF${csv}`);
      } catch (e) {
        console.error(e);
        res.status(500).send('Could not export price list.');
      }
    }
  );

  app.post('/api/pricing/price-list', requirePermission('pricing.manage'), (req, res) => {
    try {
      const r = upsertPriceListItem(db, req.body || {}, req.user);
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not save price list row.' });
    }
  });

  app.delete('/api/pricing/price-list/:id', requirePermission('pricing.manage'), (req, res) => {
    try {
      const r = deletePriceListItem(db, String(req.params.id || ''), req.user);
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not delete price list row.' });
    }
  });

  app.patch(
    '/api/quotations/:quotationId/md-price-exception',
    requirePermission('md.price_exception.approve'),
    (req, res) => {
      try {
        const qid = String(req.params.quotationId || '');
        return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'quotation', qid, () =>
          approveMdPriceExceptionForQuotation(db, qid, req.user)
        );
      } catch (e) {
        console.error(e);
        res.status(500).json({ ok: false, error: 'Could not record MD price approval.' });
      }
    }
  );

  app.patch(
    '/api/sales-receipts/:receiptId/bank-confirmation',
    requirePermission(['finance.pay', 'receipts.post']),
    (req, res) => {
      try {
        const rid = String(req.params.receiptId || '');
        return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'sales_receipt', rid, (stripped) => {
          const confirmed = Boolean(stripped?.confirmed);
          return write.patchSalesReceiptBankConfirmation(db, rid, confirmed, req.user);
        });
      } catch (e) {
        console.error(e);
        res.status(500).json({ ok: false, error: 'Could not update bank confirmation.' });
      }
    }
  );

  app.patch(
    '/api/sales-receipts/:receiptId/finance-settlement',
    requirePermission(['finance.pay', 'finance.post']),
    (req, res) => {
      try {
        const rid = String(req.params.receiptId || '');
        return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'sales_receipt', rid, (stripped) =>
          write.patchSalesReceiptFinanceSettlement(db, rid, stripped || {}, req.user)
        );
      } catch (e) {
        console.error(e);
        res.status(500).json({ ok: false, error: String(e.message || e) });
      }
    }
  );

  /**
   * Permission-aware quick search (SQL LIMIT per category): CRM, sales docs, procurement, ops,
   * refunds, product SKUs, HR directory.
   */
  app.get('/api/workspace/search', requireAuth, (req, res) => {
    try {
      if (String(req.user?.roleKey || '').toLowerCase() === 'ceo') {
        return res.status(403).json({ ok: false, error: 'Workspace search is not available for the executive role.' });
      }
      const raw = String(req.query.q ?? '').trim();
      const limit = Math.min(40, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
      if (raw.length < 2) {
        return res.json({ ok: true, results: [] });
      }
      const results = workspaceQuickSearch(db, req, raw, limit);
      return res.json({ ok: true, results });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'Search failed' });
    }
  });

  app.get('/api/suppliers', requirePermission(PROCUREMENT_DOMAIN_PERMS), (req, res) => {
    try {
      const branchScope = resolveBootstrapBranchScope(req);
      res.json({ ok: true, suppliers: listSuppliers(db, branchScope) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load suppliers' });
    }
  });

  app.get('/api/transport-agents', requirePermission(PROCUREMENT_DOMAIN_PERMS), (req, res) => {
    try {
      const branchScope = resolveBootstrapBranchScope(req);
      res.json({ ok: true, transportAgents: listTransportAgents(db, branchScope) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load agents' });
    }
  });

  app.post('/api/suppliers', requirePermission('suppliers.manage'), (req, res) => {
    try {
      const id = write.insertSupplier(db, req.body || {}, req.workspaceBranchId || DEFAULT_BRANCH_ID);
      res.status(201).json({ ok: true, supplierID: id });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/suppliers/:supplierId', requirePermission('suppliers.manage'), (req, res) => {
    const sid = req.params.supplierId;
    return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'supplier', sid, (stripped) =>
      write.updateSupplier(db, sid, stripped, req.workspaceBranchId || DEFAULT_BRANCH_ID)
    );
  });

  app.delete('/api/suppliers/:supplierId', requirePermission('suppliers.manage'), (req, res) => {
    const r = write.deleteSupplier(db, req.params.supplierId, req.workspaceBranchId || DEFAULT_BRANCH_ID);
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.post(
    '/api/transport-agents',
    requirePermission(['suppliers.manage', 'purchase_orders.manage']),
    (req, res) => {
      try {
        const id = write.insertTransportAgent(db, req.body || {}, req.workspaceBranchId || DEFAULT_BRANCH_ID);
        res.status(201).json({ ok: true, id });
      } catch (e) {
        console.error(e);
        res.status(400).json({ ok: false, error: String(e.message || e) });
      }
    }
  );

  app.patch(
    '/api/transport-agents/:id',
    requirePermission(['suppliers.manage', 'purchase_orders.manage']),
    (req, res) => {
      const tid = req.params.id;
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'transport_agent', tid, (stripped) =>
        write.updateTransportAgent(db, tid, stripped, req.workspaceBranchId || DEFAULT_BRANCH_ID)
      );
    }
  );

  app.delete(
    '/api/transport-agents/:id',
    requirePermission(['suppliers.manage', 'purchase_orders.manage']),
    (req, res) => {
    const r = write.deleteTransportAgent(db, req.params.id, req.workspaceBranchId || DEFAULT_BRANCH_ID);
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.get('/api/inventory/snapshot', (req, res) => {
    try {
      const includeControls =
        userHasPermission(req.user, 'audit.view') || userHasPermission(req.user, 'period.manage');
      const branchScope = resolveBootstrapBranchScope(req);
      res.json(
        buildBootstrap(db, {
          user: req.user,
          session: req.session,
          includeControls,
          includeUsers: userHasPermission(req.user, 'settings.view'),
          branchScope,
        })
      );
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed' });
    }
  });

  app.post('/api/customers', requirePermission('customers.manage'), (req, res) => {
    try {
      const id = write.insertCustomer(db, req.body || {}, req.workspaceBranchId || DEFAULT_BRANCH_ID);
      res.status(201).json({ ok: true, customerID: id });
    } catch (e) {
      if (e?.code === 'DUPLICATE_CUSTOMER_REGISTRATION') {
        return res.status(409).json({
          ok: false,
          error: String(e.message || e),
          code: e.code,
          existingCustomerId: e.existingCustomerId,
          conflictField: e.conflictField,
        });
      }
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/purchase-orders', requirePermission('purchase_orders.manage'), (req, res) => {
    try {
      const body = req.body || {};
      const poID = body.poID || write.nextPoIdFromDb(db, req.workspaceBranchId || DEFAULT_BRANCH_ID);
      const r = write.insertPurchaseOrder(db, { ...body, poID }, req.workspaceBranchId || DEFAULT_BRANCH_ID);
      res.status(201).json({ ok: true, ...r });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/purchase-orders/:poId', requirePermission('purchase_orders.manage'), (req, res) => {
    try {
      const poId = req.params.poId;
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'purchase_order', poId, (stripped) =>
        write.updatePurchaseOrderCoilDraft(db, poId, stripped, req.workspaceBranchId || DEFAULT_BRANCH_ID)
      );
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/purchase-orders/:poId/link-transport', requirePermission('purchase_orders.manage'), (req, res) => {
    const poId = req.params.poId;
    return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'purchase_order', poId, (stripped) => {
      const { transportAgentId, transportAgentName, transportReference, transportNote } = stripped || {};
      return write.linkTransport(db, poId, transportAgentId, transportAgentName, {
        transportReference,
        transportNote,
      });
    });
  });

  app.post('/api/purchase-orders/:poId/post-transport', requirePermission('purchase_orders.manage'), (req, res) => {
    try {
      const body = req.body || {};
      const amt = Number(body.amountNgn);
      const acct = Number(body.treasuryAccountId);
      const needsTreasury = acct > 0 && !Number.isNaN(amt) && amt > 0;
      if (needsTreasury && !userHasPermission(req.user, 'finance.pay')) {
        return res.status(403).json({
          ok: false,
          error: 'Recording haulage against treasury requires finance.pay permission.',
        });
      }
      const r = write.postPurchaseOrderTransport(db, req.params.poId, {
        treasuryAccountId: body.treasuryAccountId,
        amountNgn: body.amountNgn,
        reference: body.reference,
        dateISO: body.dateISO,
        postedAtISO: body.postedAtISO,
        note: body.note,
        createdBy: body.createdBy || req.user.displayName,
        actor: req.user,
      });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/purchase-orders/:poId/transport-paid', requirePermission('purchase_orders.manage'), (req, res) => {
    const poId = req.params.poId;
    return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'purchase_order', poId, () =>
      write.markTransportPaid(db, poId)
    );
  });

  app.post('/api/purchase-orders/:poId/supplier-payment', requirePermission('finance.pay'), (req, res) => {
    const { amountNgn, note, treasuryAccountId, reference, dateISO, createdBy } = req.body || {};
    const r = write.recordSupplierPayment(db, req.params.poId, amountNgn, note, {
      treasuryAccountId,
      reference,
      dateISO,
      createdBy: createdBy || req.user.displayName,
      actor: req.user,
    });
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.patch('/api/purchase-orders/:poId/status', requirePermission('purchase_orders.manage'), (req, res) => {
    const poId = req.params.poId;
    return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'purchase_order', poId, (stripped) => {
      const { status } = stripped || {};
      return write.setPoStatus(db, poId, status);
    });
  });

  app.patch('/api/purchase-orders/:poId/invoice', requirePermission('purchase_orders.manage'), (req, res) => {
    const poId = req.params.poId;
    return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'purchase_order', poId, (stripped) => {
      const { invoiceNo, invoiceDateISO, deliveryDateISO } = stripped || {};
      return write.attachSupplierInvoice(db, poId, invoiceNo, invoiceDateISO, deliveryDateISO);
    });
  });

  app.post('/api/cutting-lists', requirePermission(['sales.manage', 'operations.manage']), (req, res) => {
    try {
      const r = write.insertCuttingList(db, req.body || {}, req.workspaceBranchId || DEFAULT_BRANCH_ID);
      if (!r.ok) return res.status(400).json(r);
      const cuttingList = getCuttingList(db, r.id);
      res.status(201).json({ ok: true, id: r.id, cuttingList });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/cutting-lists/:id', requirePermission(['sales.manage', 'operations.manage']), (req, res) => {
    try {
      const cid = req.params.id;
      const cl0 = getCuttingList(db, cid);
      const bg = assertCuttingListRowInWorkspace(req, cl0);
      if (!bg.ok) return res.status(bg.status).json({ ok: false, error: bg.error });
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'cutting_list', cid, (stripped) => {
        const r = write.updateCuttingList(db, cid, stripped || {});
        if (!r.ok) return r;
        const cuttingList = getCuttingList(db, cid);
        return { ok: true, cuttingList };
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  function productionJobIdForCuttingList(dbConn, cuttingListId) {
    const row = dbConn
      .prepare(
        `SELECT job_id FROM production_jobs WHERE cutting_list_id = ? ORDER BY created_at_iso DESC LIMIT 1`
      )
      .get(cuttingListId);
    return row?.job_id ? String(row.job_id) : null;
  }

  function resolveCuttingListProductionJob(dbConn, cuttingListId) {
    const cl = getCuttingList(dbConn, cuttingListId);
    if (!cl || !cl.productionRegistered) return null;
    return productionJobIdForCuttingList(dbConn, cuttingListId);
  }

  app.post(
    '/api/cutting-lists/:id/clear-production-hold',
    requirePermission('production.release'),
    (req, res) => {
      try {
        const hg = assertCuttingListIdInWorkspace(db, req, req.params.id);
        if (!hg.ok) return res.status(hg.status).json({ ok: false, error: hg.error });
        const r = write.clearCuttingListProductionHold(db, req.params.id, req.user);
        if (!r.ok) return res.status(400).json(r);
        const cuttingList = getCuttingList(db, req.params.id);
        res.json({ ok: true, cuttingList });
      } catch (e) {
        console.error(e);
        res.status(400).json({ ok: false, error: String(e.message || e) });
      }
    }
  );

  app.post(
    '/api/cutting-lists/:id/register-production',
    requirePermission(['sales.manage', 'production.manage', 'operations.manage']),
    (req, res) => {
      try {
        const clId = req.params.id;
        const cl = getCuttingList(db, clId);
        if (!cl) return res.status(404).json({ ok: false, error: 'Cutting list not found.' });
        const rg = assertCuttingListRowInWorkspace(req, cl);
        if (!rg.ok) return res.status(rg.status).json({ ok: false, error: rg.error });
        if (cl.productionRegistered) {
          return res.status(400).json({
            ok: false,
            error: 'This cutting list is already on the production queue.',
          });
        }
        const body = req.body || {};
        const r = write.insertProductionJob(
          db,
          {
            cuttingListId: clId,
            productID: cl.productID,
            productName: cl.productName,
            plannedMeters: cl.totalMeters,
            plannedSheets: cl.sheetsToCut,
            machineName: body.machineName || cl.machineName || 'Production line',
            operatorName: body.operatorName || '',
            materialsNote: body.materialsNote,
          },
          req.workspaceBranchId || DEFAULT_BRANCH_ID
        );
        if (!r.ok) return res.status(400).json(r);
        const cuttingList = getCuttingList(db, clId);
        res.status(201).json({ ok: true, cuttingList });
      } catch (e) {
        console.error(e);
        res.status(400).json({ ok: false, error: String(e.message || e) });
      }
    }
  );

  app.get('/api/cutting-lists/:id/production/coil-allocations', requirePermission('production.manage'), (req, res) => {
    try {
      const wg = assertCuttingListIdInWorkspace(db, req, req.params.id);
      if (!wg.ok) return res.status(wg.status).json({ ok: false, error: wg.error });
      const jobId = resolveCuttingListProductionJob(db, req.params.id);
      if (!jobId) {
        return res.status(404).json({ ok: false, error: 'No production run for this cutting list.' });
      }
      const allocations = listProductionJobCoilsForJob(db, jobId);
      res.json({ ok: true, cuttingListId: req.params.id, jobID: jobId, allocations });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/cutting-lists/:id/production/allocations', requirePermission('production.manage'), (req, res) => {
    try {
      const wg = assertCuttingListIdInWorkspace(db, req, req.params.id);
      if (!wg.ok) return res.status(wg.status).json({ ok: false, error: wg.error });
      let jobId = resolveCuttingListProductionJob(db, req.params.id);
      if (!jobId) jobId = productionJobIdForCuttingList(db, req.params.id);
      if (!jobId) {
        return res.status(404).json({ ok: false, error: 'No production run for this cutting list.' });
      }
      const r = saveProductionJobAllocations(db, jobId, req.body?.allocations || [], {
        actor: req.user,
        append: Boolean(req.body?.append),
      });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/cutting-lists/:id/production/start', requirePermission('production.manage'), (req, res) => {
    try {
      const wg = assertCuttingListIdInWorkspace(db, req, req.params.id);
      if (!wg.ok) return res.status(wg.status).json({ ok: false, error: wg.error });
      const jobId = resolveCuttingListProductionJob(db, req.params.id);
      if (!jobId) {
        return res.status(404).json({ ok: false, error: 'No production run for this cutting list.' });
      }
      const r = startProductionJob(db, jobId, req.body || {}, { actor: req.user });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/cutting-lists/:id/production/complete', requirePermission('production.manage'), (req, res) => {
    try {
      const wg = assertCuttingListIdInWorkspace(db, req, req.params.id);
      if (!wg.ok) return res.status(wg.status).json({ ok: false, error: wg.error });
      const jobId = resolveCuttingListProductionJob(db, req.params.id);
      if (!jobId) {
        return res.status(404).json({ ok: false, error: 'No production run for this cutting list.' });
      }
      const r = completeProductionJob(db, jobId, req.body || {}, { actor: req.user });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/cutting-lists/:id/production/conversion-preview', requirePermission('production.manage'), (req, res) => {
    try {
      const wg = assertCuttingListIdInWorkspace(db, req, req.params.id);
      if (!wg.ok) return res.status(wg.status).json({ ok: false, error: wg.error });
      const jobId = resolveCuttingListProductionJob(db, req.params.id);
      if (!jobId) {
        return res.status(404).json({ ok: false, error: 'No production run for this cutting list.' });
      }
      const r = previewProductionConversion(db, jobId, req.body || {});
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/production-jobs', requirePermission('production.manage'), (req, res) => {
    try {
      const clId = String((req.body || {}).cuttingListId ?? '').trim();
      if (!clId) {
        return res.status(400).json({ ok: false, error: 'cuttingListId is required to create a production job.' });
      }
      const cg = assertCuttingListIdInWorkspace(db, req, clId);
      if (!cg.ok) return res.status(cg.status).json({ ok: false, error: cg.error });
      const r = write.insertProductionJob(db, req.body || {}, req.workspaceBranchId || DEFAULT_BRANCH_ID);
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/production-jobs/:jobId/status', requirePermission('production.manage'), (req, res) => {
    try {
      const jid = req.params.jobId;
      const jg = assertProductionJobIdInWorkspace(db, req, jid);
      if (!jg.ok) return res.status(jg.status).json({ ok: false, error: jg.error });
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'production_job', jid, (stripped) =>
        write.setProductionJobStatus(db, jid, stripped?.status)
      );
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/production-jobs/:jobId/coil-allocations', requirePermission('production.manage'), (req, res) => {
    try {
      const jg = assertProductionJobIdInWorkspace(db, req, req.params.jobId);
      if (!jg.ok) return res.status(jg.status).json({ ok: false, error: jg.error });
      const job = db.prepare(`SELECT job_id FROM production_jobs WHERE job_id = ?`).get(req.params.jobId);
      if (!job) return res.status(404).json({ ok: false, error: 'Production job not found.' });
      const allocations = listProductionJobCoilsForJob(db, req.params.jobId);
      res.json({ ok: true, jobID: req.params.jobId, allocations });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/production-jobs/:jobId/allocations', requirePermission('production.manage'), (req, res) => {
    try {
      const jg = assertProductionJobIdInWorkspace(db, req, req.params.jobId);
      if (!jg.ok) return res.status(jg.status).json({ ok: false, error: jg.error });
      const r = saveProductionJobAllocations(db, req.params.jobId, req.body?.allocations || [], {
        actor: req.user,
        append: Boolean(req.body?.append),
      });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/production-jobs/:jobId/start', requirePermission('production.manage'), (req, res) => {
    try {
      const jg = assertProductionJobIdInWorkspace(db, req, req.params.jobId);
      if (!jg.ok) return res.status(jg.status).json({ ok: false, error: jg.error });
      const r = startProductionJob(db, req.params.jobId, req.body || {}, { actor: req.user });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/production-jobs/:jobId/complete', requirePermission('production.manage'), (req, res) => {
    try {
      const jg = assertProductionJobIdInWorkspace(db, req, req.params.jobId);
      if (!jg.ok) return res.status(jg.status).json({ ok: false, error: jg.error });
      const r = completeProductionJob(db, req.params.jobId, req.body || {}, { actor: req.user });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/production-jobs/:jobId/conversion-preview', requirePermission('production.manage'), (req, res) => {
    try {
      const jg = assertProductionJobIdInWorkspace(db, req, req.params.jobId);
      if (!jg.ok) return res.status(jg.status).json({ ok: false, error: jg.error });
      const r = previewProductionConversion(db, req.params.jobId, req.body || {});
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  const managerReviewSignoffPerms = ['production.release', 'operations.manage', 'production.manage'];
  /** Stricter than day-to-day production.manage — undo start / post-completion FG corrections. */
  const productionCorrectionPerms = ['production.release', 'operations.manage'];
  const returnToPlannedPerms = ['production.release', 'operations.manage', 'production.manage'];

  app.post('/api/production-jobs/:jobId/return-to-planned', requirePermission(returnToPlannedPerms), (req, res) => {
    try {
      const jg = assertProductionJobIdInWorkspace(db, req, req.params.jobId);
      if (!jg.ok) return res.status(jg.status).json({ ok: false, error: jg.error });
      const r = returnProductionJobToPlanned(db, req.params.jobId, req.body || {}, { actor: req.user });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post(
    '/api/production-jobs/:jobId/completion-adjustments',
    requirePermission(productionCorrectionPerms),
    (req, res) => {
      try {
        const jg = assertProductionJobIdInWorkspace(db, req, req.params.jobId);
        if (!jg.ok) return res.status(jg.status).json({ ok: false, error: jg.error });
        const r = applyProductionCompletionAdjustment(db, req.params.jobId, req.body || {}, { actor: req.user });
        res.status(r.ok ? 200 : 400).json(r);
      } catch (e) {
        console.error(e);
        res.status(400).json({ ok: false, error: String(e.message || e) });
      }
    }
  );

  app.patch('/api/production-jobs/:jobId/manager-review-signoff', requirePermission(managerReviewSignoffPerms), (req, res) => {
    try {
      const jid = req.params.jobId;
      const jg = assertProductionJobIdInWorkspace(db, req, jid);
      if (!jg.ok) return res.status(jg.status).json({ ok: false, error: jg.error });
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'production_job', jid, (stripped) =>
        signOffProductionManagerReview(db, jid, stripped || {}, { actor: req.user })
      );
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/cutting-lists/:id/production/manager-review-signoff', requirePermission(managerReviewSignoffPerms), (req, res) => {
    try {
      const clid = req.params.id;
      const wg = assertCuttingListIdInWorkspace(db, req, clid);
      if (!wg.ok) return res.status(wg.status).json({ ok: false, error: wg.error });
      let jobId = resolveCuttingListProductionJob(db, clid);
      if (!jobId) jobId = productionJobIdForCuttingList(db, clid);
      if (!jobId) {
        return res.status(404).json({ ok: false, error: 'No production run for this cutting list.' });
      }
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'cutting_list', clid, (stripped) =>
        signOffProductionManagerReview(db, jobId, stripped || {}, { actor: req.user })
      );
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/deliveries', requirePermission('deliveries.manage'), (req, res) => {
    try {
      const clid = String((req.body || {}).cuttingListId ?? '').trim();
      if (clid) {
        const dg = assertCuttingListIdInWorkspace(db, req, clid);
        if (!dg.ok) return res.status(dg.status).json({ ok: false, error: dg.error });
      }
      const r = write.insertDelivery(db, req.body || {}, req.workspaceBranchId || DEFAULT_BRANCH_ID);
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/deliveries/:deliveryId/confirm', requirePermission('deliveries.manage'), (req, res) => {
    const did = req.params.deliveryId;
    return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'delivery', did, (stripped) =>
      write.confirmDelivery(db, did, stripped || {})
    );
  });

  app.post('/api/purchase-orders/:poId/grn', requirePermission('inventory.receive'), (req, res) => {
    const { entries, supplierID, supplierName, allowConversionMismatch } = req.body || {};
    const allowMismatch =
      Boolean(allowConversionMismatch) && userHasPermission(req.user, 'purchase_orders.manage');
    const r = write.confirmGrn(
      db,
      req.params.poId,
      entries || [],
      supplierID,
      supplierName,
      req.workspaceBranchId || DEFAULT_BRANCH_ID,
      { allowConversionMismatch: allowMismatch, actor: req.user }
    );
    if (r.ok && allowMismatch) {
      appendAuditLog(db, {
        actor: req.user,
        action: 'inventory.grn_conversion_override',
        entityKind: 'purchase_order',
        entityId: req.params.poId,
        note: 'GRN posted with conversion alignment override',
      });
    }
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.post('/api/inventory/stone-receipt', requirePermission('inventory.receive'), (req, res) => {
    try {
      const r = write.postStoneInventoryReceipt(db, req.body || {}, req.workspaceBranchId || DEFAULT_BRANCH_ID, {
        actor: req.user,
      });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/inventory/accessory-receipt', requirePermission('inventory.receive'), (req, res) => {
    try {
      const r = write.postAccessoryInventoryReceipt(db, req.body || {}, req.workspaceBranchId || DEFAULT_BRANCH_ID, {
        actor: req.user,
      });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/inventory/product-movements/:productId', requirePermission(OPERATIONS_DOMAIN_PERMS), (req, res) => {
    try {
      const lim = req.query?.limit != null ? Number(req.query.limit) : 500;
      const rows = listStockMovementsForProduct(db, req.params.productId, lim);
      res.json({ ok: true, movements: rows });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/inventory/ensure-stone-product', requirePermission('purchase_orders.manage'), (req, res) => {
    try {
      const designLabel = String(req.body?.designLabel ?? '').trim();
      const colourLabel = String(req.body?.colourLabel ?? '').trim();
      const gaugeLabel = String(req.body?.gaugeLabel ?? '').trim();
      if (!designLabel || !colourLabel || !gaugeLabel) {
        return res.status(400).json({ ok: false, error: 'designLabel, colourLabel, and gaugeLabel are required.' });
      }
      const productId = ensureStoneProduct(db, {
        designLabel,
        colourLabel,
        gaugeLabel,
        branchId: req.workspaceBranchId || DEFAULT_BRANCH_ID,
      });
      res.json({ ok: true, productId });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/pricing/resolve', requirePermission(SALES_DOMAIN_PERMS), (req, res) => {
    try {
      const q = req.query || {};
      const result = resolveQuotedUnitPrice(db, {
        quoteItemId: q.quoteItemId,
        gaugeId: q.gaugeId,
        colourId: q.colourId,
        materialTypeId: q.materialTypeId,
        profileId: q.profileId,
        branchId: q.branchId || req.workspaceBranchId || null,
        gaugeLabel: q.gaugeLabel,
        colourName: q.colourName,
        profileName: q.profileName,
        materialTypeName: q.materialTypeName,
        designLabel: q.designLabel,
      });
      res.json({ ok: true, result });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/inventory/adjust', requirePermission('inventory.adjust'), (req, res) => {
    const { productID, type, qty, reasonCode, note, dateISO, acknowledgeCoilSkuDrift } = req.body || {};
    const pg = assertProductIdInWorkspace(db, req, productID);
    if (!pg.ok) return res.status(pg.status).json({ ok: false, error: pg.error });
    if (String(type) === 'Decrease' && productID && !acknowledgeCoilSkuDrift) {
      const n = write.countCoilLotsForProductInWorkspace(db, productID, req.workspaceBranchId);
      if (n > 0) {
        return res.status(409).json({
          ok: false,
          code: 'COIL_SKU_DRIFT',
          coilLotCount: n,
          error:
            'This SKU has coil lots in your branch. Use Operations → coil split / scrap / return to change physical stock. To force a book-only decrease, resend with acknowledgeCoilSkuDrift: true.',
        });
      }
    }
    const r = write.adjustStock(db, productID, type, qty, reasonCode, note, dateISO);
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.post('/api/inventory/transfer-to-production', requirePermission('production.manage'), (req, res) => {
    const { productID, qty, productionOrderId, dateISO } = req.body || {};
    const pg = assertProductIdInWorkspace(db, req, productID);
    if (!pg.ok) return res.status(pg.status).json({ ok: false, error: pg.error });
    const r = write.transferToProduction(db, productID, qty, productionOrderId, dateISO);
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.post('/api/inventory/finished-goods', requirePermission('production.manage'), (req, res) => {
    const { productID, qty, unitPriceNgn, productionOrderId, dateISO, wipRelease, extras } = req.body || {};
    const pg = assertProductIdInWorkspace(db, req, productID);
    if (!pg.ok) return res.status(pg.status).json({ ok: false, error: pg.error });
    const ws = wipRelease?.wipSourceProductID?.trim?.();
    if (ws) {
      const sg = assertProductIdInWorkspace(db, req, ws);
      if (!sg.ok) return res.status(sg.status).json({ ok: false, error: sg.error });
    }
    const r = write.receiveFinishedGoods(
      db,
      productID,
      qty,
      unitPriceNgn,
      productionOrderId,
      dateISO,
      wipRelease,
      extras || {}
    );
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.post('/api/coil-lots/import', requirePermission('purchase_orders.manage'), (req, res) => {
    try {
      const r = write.importCoilLotsFromSpreadsheet(
        db,
        req.body || {},
        req.workspaceBranchId || DEFAULT_BRANCH_ID,
        req.user
      );
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  const coilMaterialPerms = ['inventory.adjust', 'operations.manage'];
  app.post('/api/coil-lots/:coilNo/split', requirePermission(coilMaterialPerms), (req, res) => {
    try {
      const r = write.splitCoilLot(
        db,
        { ...req.body, parentCoilNo: req.params.coilNo },
        { workspaceBranchId: req.workspaceBranchId, actor: req.user }
      );
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });
  app.post('/api/coil-lots/:coilNo/scrap', requirePermission(coilMaterialPerms), (req, res) => {
    try {
      const r = write.postCoilScrap(
        db,
        { ...req.body, coilNo: req.params.coilNo },
        { workspaceBranchId: req.workspaceBranchId, actor: req.user }
      );
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });
  app.post('/api/coil-lots/:coilNo/return-material', requirePermission(coilMaterialPerms), (req, res) => {
    try {
      const r = write.returnCoilMaterialToStock(
        db,
        { ...req.body, coilNo: req.params.coilNo },
        { workspaceBranchId: req.workspaceBranchId, actor: req.user }
      );
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/coil-requests', requirePermission(['operations.manage', 'production.manage']), (req, res) => {
    try {
      const r = write.addCoilRequest(db, req.body || {});
      res.status(201).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/coil-requests/:id/acknowledge', requirePermission(['operations.manage', 'production.manage']), (req, res) => {
    const crid = req.params.id;
    return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'coil_request', crid, () =>
      write.acknowledgeCoilRequest(db, crid)
    );
  });

  app.put('/api/treasury/accounts', requirePermission('treasury.manage'), (req, res) => {
    try {
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'treasury_accounts', 'bulk', (stripped) => {
        const reason = String(stripped?.reason ?? '').trim();
        if (!reason) return { ok: false, error: 'Reason is required for bulk treasury updates.' };
        const accounts = stripped?.accounts || [];
        write.replaceTreasuryAccounts(db, accounts);
        appendAuditLog(db, {
          actor: req.user,
          action: 'treasury.bulk_replace',
          entityKind: 'treasury_account',
          entityId: 'bulk',
          note: reason,
          details: { accountCount: Array.isArray(accounts) ? accounts.length : 0 },
        });
        return { ok: true };
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/treasury/accounts', requirePermission('treasury.manage'), (req, res) => {
    try {
      const r = upsertTreasuryAccount(db, req.body || {}, req.user);
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/treasury/transfer', requirePermission(['treasury.manage', 'finance.pay']), (req, res) => {
    try {
      const r = write.transferTreasuryFunds(db, {
        ...(req.body || {}),
        createdBy: req.user.displayName,
        actor: req.user,
      });
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/inter-branch-loans', requirePermission('finance.view'), (req, res) => {
    try {
      const branchScope = resolveBootstrapBranchScope(req);
      res.json({
        ok: true,
        loans: listInterBranchLoans(db, branchScope),
        balances: interBranchLoanBalances(db, branchScope),
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/inter-branch-loans/:loanId', requirePermission('finance.view'), (req, res) => {
    try {
      const branchScope = resolveBootstrapBranchScope(req);
      const r = getInterBranchLoan(db, String(req.params.loanId || '').trim(), branchScope);
      res.status(r.ok ? 200 : r.error === 'Loan not found.' ? 404 : 403).json(r.ok ? { ok: true, ...r } : r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post(
    '/api/inter-branch-loans',
    requirePermission(['treasury.manage', 'finance.post']),
    (req, res) => {
      try {
        const r = createInterBranchLoan(db, req.body || {}, req.user);
        res.status(r.ok ? 201 : 400).json(r);
      } catch (e) {
        console.error(e);
        res.status(400).json({ ok: false, error: String(e.message || e) });
      }
    }
  );

  app.post('/api/inter-branch-loans/:loanId/md-approve', requirePermission('inter_branch_loan.md_approve'), (req, res) => {
    try {
      const r = mdApproveInterBranchLoan(db, String(req.params.loanId || '').trim(), req.user);
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/inter-branch-loans/:loanId/md-reject', requirePermission('inter_branch_loan.md_approve'), (req, res) => {
    try {
      const r = mdRejectInterBranchLoan(db, String(req.params.loanId || '').trim(), req.body || {}, req.user);
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post(
    '/api/inter-branch-loans/:loanId/repay',
    requirePermission(['treasury.manage', 'finance.pay']),
    (req, res) => {
      try {
        const r = recordInterBranchLoanRepayment(
          db,
          String(req.params.loanId || '').trim(),
          req.body || {},
          req.user
        );
        res.status(r.ok ? 200 : 400).json(r);
      } catch (e) {
        console.error(e);
        res.status(400).json({ ok: false, error: String(e.message || e) });
      }
    }
  );

  app.post('/api/expenses', requirePermission('finance.post'), (req, res) => {
    try {
      const r = write.insertExpenseEntry(
        db,
        {
          ...(req.body || {}),
          createdBy: req.user.displayName,
          actor: req.user,
        },
        req.workspaceBranchId || DEFAULT_BRANCH_ID
      );
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.put('/api/refunds', requirePermission('settings.view'), (req, res) => {
    try {
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'refunds_bulk', 'bulk', (stripped) => {
        const reason = String(stripped?.reason ?? '').trim();
        if (!reason) return { ok: false, error: 'Reason is required for bulk refund updates.' };
        const refunds = stripped?.refunds || [];
        write.replaceRefunds(db, refunds);
        appendAuditLog(db, {
          actor: req.user,
          action: 'refund.bulk_replace',
          entityKind: 'refund',
          entityId: 'bulk',
          note: reason,
          details: { refundCount: Array.isArray(refunds) ? refunds.length : 0 },
        });
        return { ok: true };
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/refunds/preview', requirePermission(['refunds.request', 'refunds.approve', 'finance.approve']), (req, res) => {
    try {
      const r = previewRefundRequest(db, req.body || {});
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/refunds/eligible-quotations', requirePermission(['refunds.request', 'refunds.approve', 'finance.approve']), (req, res) => {
    try {
      const rows = getEligibleRefundQuotations(db);
      res.json({ ok: true, quotations: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to fetch eligible quotations' });
    }
  });

  app.get('/api/refunds/intelligence', requirePermission(['refunds.request', 'refunds.approve', 'finance.approve']), (req, res) => {
    try {
      const quotationRef = String(req.query.quotationRef || '').trim();
      if (!quotationRef) {
        return res.status(400).json({ ok: false, error: 'quotationRef is required' });
      }
      const branchScope = resolveBootstrapBranchScope(req);
      const { receipts, cuttingLists, summary } = getRefundIntelligenceForQuotation(db, quotationRef, branchScope);
      res.json({ ok: true, receipts, cuttingLists, summary });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load refund intelligence' });
    }
  });

  app.post('/api/refunds', requirePermission('refunds.request'), (req, res) => {
    try {
      const r = insertRefundRequest(
        db,
        req.body || {},
        req.user,
        req.workspaceBranchId || DEFAULT_BRANCH_ID
      );
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/refunds/:refundId/decision', requirePermission(['refunds.approve', 'finance.approve']), (req, res) => {
    try {
      const r = decideRefundRequest(db, req.params.refundId, req.body || {}, req.user);
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/refunds/:refundId/pay', requirePermission('finance.pay'), (req, res) => {
    try {
      const treasuryLines = normalizeTreasuryLines(req.body || {});
      const r = write.payRefundEntry(db, req.params.refundId, {
        ...(req.body || {}),
        paymentLines: treasuryLines,
        paidBy: req.user.displayName,
        actor: req.user,
      });
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/setup', requirePermission('settings.view'), (_req, res) => {
    try {
      res.json({ ok: true, masterData: listMasterData(db) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load setup data' });
    }
  });

  app.get('/api/branches/strict-audit', requirePermission('settings.view'), (_req, res) => {
    try {
      const branchIds = new Set(listBranches(db).map((b) => String(b.id || '').trim()).filter(Boolean));
      const rows = [];
      for (const t of STRICT_BRANCH_AUDIT_TABLES) {
        if (!tableHasColumn(db, t.table, 'branch_id') || !tableHasColumn(db, t.table, t.idColumn)) continue;
        const missing = Number(
          db
            .prepare(
              `SELECT COUNT(*) AS c FROM ${t.table}
               WHERE branch_id IS NULL OR TRIM(COALESCE(branch_id,'')) = ''`
            )
            .get()?.c ?? 0
        );
        const invalid = Number(
          db
            .prepare(
              `SELECT COUNT(*) AS c FROM ${t.table}
               WHERE NOT (branch_id IS NULL OR TRIM(COALESCE(branch_id,'')) = '')
                 AND branch_id NOT IN (SELECT id FROM branches)`
            )
            .get()?.c ?? 0
        );
        const sampleIds = db
          .prepare(
            `SELECT ${t.idColumn} AS id FROM ${t.table}
             WHERE branch_id IS NULL OR TRIM(COALESCE(branch_id,'')) = ''
                OR branch_id NOT IN (SELECT id FROM branches)
             LIMIT 10`
          )
          .all()
          .map((r) => String(r.id || ''));
        rows.push({
          table: t.table,
          missingBranchIdRows: missing,
          invalidBranchIdRows: invalid,
          sampleIds,
        });
      }
      const totals = rows.reduce(
        (acc, r) => {
          acc.missingBranchIdRows += r.missingBranchIdRows;
          acc.invalidBranchIdRows += r.invalidBranchIdRows;
          return acc;
        },
        { missingBranchIdRows: 0, invalidBranchIdRows: 0 }
      );
      res.json({
        ok: true,
        strictBranchIsolationOk: totals.missingBranchIdRows === 0 && totals.invalidBranchIdRows === 0,
        knownBranches: Array.from(branchIds),
        totals,
        tables: rows,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not run strict branch audit.' });
    }
  });

  app.post('/api/setup/:kind', requirePermission('settings.view'), (req, res) => {
    try {
      const r = upsertMasterDataRecord(db, req.params.kind, req.body || {}, req.user);
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/setup/:kind/:id', requirePermission('settings.view'), (req, res) => {
    try {
      const kind = req.params.kind;
      const id = req.params.id;
      const entityId = `${kind}:${id}`;
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'setup_record', entityId, (stripped) =>
        upsertMasterDataRecord(db, kind, { ...(stripped || {}), id }, req.user)
      );
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.delete('/api/setup/:kind/:id', requirePermission('settings.view'), (req, res) => {
    try {
      const r = deleteMasterDataRecord(db, req.params.kind, req.params.id, req.user);
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/accounts-payable/:apId/pay', requirePermission('finance.pay'), (req, res) => {
    try {
      const r = write.payAccountsPayable(db, req.params.apId, {
        ...(req.body || {}),
        createdBy: req.user.displayName,
        actor: req.user,
      });
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/payment-requests', requirePermission('finance.post'), (req, res) => {
    try {
      const r = insertPaymentRequest(db, { ...(req.body || {}), workspaceBranchId: req.workspaceBranchId }, req.user);
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/payment-requests/:requestId/attachment', requireAuth, (req, res) => {
    try {
      const can =
        userHasPermission(req.user, 'finance.post') ||
        userHasPermission(req.user, 'finance.approve') ||
        userHasPermission(req.user, 'finance.pay');
      if (!can) {
        res.status(403).json({ ok: false, error: 'Forbidden' });
        return;
      }
      const requestId = String(req.params.requestId || '').trim();
      const row = db
        .prepare(
          `SELECT attachment_name, attachment_mime, attachment_data_b64 FROM payment_requests WHERE request_id = ?`
        )
        .get(requestId);
      const b64 = row?.attachment_data_b64;
      if (!row || !b64 || !String(b64).trim()) {
        res.status(404).json({ ok: false, error: 'No attachment on this request.' });
        return;
      }
      const buf = Buffer.from(String(b64).trim(), 'base64');
      const mime = String(row.attachment_mime || 'application/octet-stream').split(';')[0].trim();
      const name = String(row.attachment_name || 'attachment').replace(/[^\w.-]+/g, '_');
      res.setHeader('Content-Type', mime || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${name}"`);
      res.send(buf);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/payment-requests/:requestId/decision', requirePermission('finance.approve'), (req, res) => {
    try {
      const r = decidePaymentRequest(db, req.params.requestId, req.body || {}, req.user);
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/payment-requests/:requestId/pay', requirePermission('finance.pay'), (req, res) => {
    try {
      const treasuryLines = normalizeTreasuryLines(req.body || {});
      const r = write.payPaymentRequest(db, req.params.requestId, {
        ...(req.body || {}),
        paymentLines: treasuryLines,
        createdBy: req.user.displayName,
        paidBy: req.user.displayName,
        workspaceBranchId: req.workspaceBranchId,
        workspaceViewAll: Boolean(req.workspaceViewAll),
        actor: req.user,
      });
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.put('/api/finance/core', requirePermission('settings.view'), (req, res) => {
    try {
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'finance_core', 'bulk', (stripped) => {
        const reason = String(stripped?.reason ?? '').trim();
        if (!reason) return { ok: false, error: 'Reason is required for bulk finance updates.' };
        const b = stripped || {};
        if (Array.isArray(b.expenses)) write.replaceExpenses(db, b.expenses);
        if (Array.isArray(b.paymentRequests)) write.replacePaymentRequests(db, b.paymentRequests);
        if (Array.isArray(b.accountsPayable)) write.replaceAccountsPayable(db, b.accountsPayable);
        if (Array.isArray(b.bankReconciliation)) write.replaceBankReconciliation(db, b.bankReconciliation);
        appendAuditLog(db, {
          actor: req.user,
          action: 'finance.bulk_replace',
          entityKind: 'finance_core',
          entityId: 'bulk',
          note: reason,
          details: {
            expenses: Array.isArray(b.expenses) ? b.expenses.length : 0,
            paymentRequests: Array.isArray(b.paymentRequests) ? b.paymentRequests.length : 0,
            accountsPayable: Array.isArray(b.accountsPayable) ? b.accountsPayable.length : 0,
            bankReconciliation: Array.isArray(b.bankReconciliation) ? b.bankReconciliation.length : 0,
          },
        });
        return { ok: true };
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/controls/period-locks', requirePermission('period.manage'), (req, res) => {
    try {
      const r = lockAccountingPeriod(db, req.body || {}, req.user);
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/controls/period-locks', requirePermission(['period.manage', 'finance.view', 'treasury.manage']), (_req, res) => {
    try {
      res.json({ ok: true, periodLocks: listPeriodLocks(db) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not load period locks' });
    }
  });

  app.delete('/api/controls/period-locks/:periodKey', requirePermission('period.manage'), (req, res) => {
    try {
      const r = unlockAccountingPeriod(db, req.params.periodKey, req.user, req.body?.reason || '');
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/audit-log', requirePermission('audit.view'), (_req, res) => {
    try {
      res.json({ ok: true, auditLog: listAuditLog(db) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not load audit log' });
    }
  });

  app.get('/api/audit/export.ndjson', requirePermission('audit.view'), (_req, res) => {
    try {
      const rows = listAuditLogNdjsonRows(db);
      const body = `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="zarewa-audit-export.ndjson"');
      res.send(body);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not export audit log' });
    }
  });

  app.get('/api/customers', requirePermission(SALES_DOMAIN_PERMS), (req, res) => {
    try {
      const branchScope = resolveBootstrapBranchScope(req);
      res.json({ ok: true, customers: listCustomers(db, branchScope) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load customers' });
    }
  });

  app.get('/api/customers/:customerId', requirePermission(SALES_DOMAIN_PERMS), (req, res) => {
    try {
      const branchScope = resolveBootstrapBranchScope(req);
      const row = getCustomer(db, req.params.customerId, branchScope);
      if (!row) return res.status(404).json({ ok: false, error: 'Customer not found' });
      res.json({ ok: true, customer: row });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load customer' });
    }
  });

  app.get('/api/customers/:customerId/interactions', requirePermission(SALES_DOMAIN_PERMS), (req, res) => {
    try {
      const branchScope = resolveBootstrapBranchScope(req);
      const row = getCustomer(db, req.params.customerId, branchScope);
      if (!row) return res.status(404).json({ ok: false, error: 'Customer not found' });
      res.json({
        ok: true,
        interactions: listCustomerCrmInteractions(db, req.params.customerId, branchScope),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load CRM interactions' });
    }
  });

  app.post('/api/customers/:customerId/interactions', requirePermission('customers.manage'), (req, res) => {
    try {
      const r = write.insertCustomerCrmInteraction(
        db,
        req.params.customerId,
        req.body || {},
        req.user,
        req.workspaceBranchId || DEFAULT_BRANCH_ID
      );
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/bank-reconciliation', requirePermission('finance.view'), (req, res) => {
    try {
      const branchScope = resolveBootstrapBranchScope(req);
      res.json({ ok: true, lines: listBankReconciliation(db, branchScope) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load bank reconciliation lines.' });
    }
  });

  app.post('/api/bank-reconciliation', requirePermission('finance.post'), (req, res) => {
    try {
      let branchId = req.workspaceBranchId || DEFAULT_BRANCH_ID;
      if (req.workspaceViewAll && canUseAllBranchesRollup(req.user)) {
        const requested = String(req.body?.branchId ?? '').trim();
        if (requested && getBranch(db, requested)) branchId = requested;
      }
      const r = write.insertBankReconciliationLine(
        db,
        { ...(req.body || {}), actor: req.user },
        branchId
      );
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post(
    '/api/bank-reconciliation/import-csv',
    requirePermission('finance.post'),
    rateLimitAuthedUser(bankFinanceImportBuckets, 'bank-import', 20, 60_000),
    (req, res) => {
    try {
      const csvText = String(req.body?.csvText ?? '').trim();
      if (!csvText) {
        return res.status(400).json({ ok: false, error: 'Body.csvText is required.' });
      }
      const parsed = write.parseBankReconciliationCsvText(csvText);
      if (!parsed.ok) {
        return res.status(400).json({ ok: false, error: parsed.error, parseErrors: parsed.parseErrors });
      }
      const rows = parsed.lines || [];
      if (rows.length > 500) {
        return res.status(400).json({ ok: false, error: 'Maximum 500 data rows per import.' });
      }
      let branchId = req.workspaceBranchId || DEFAULT_BRANCH_ID;
      if (req.workspaceViewAll && canUseAllBranchesRollup(req.user)) {
        const requested = String(req.body?.branchId ?? '').trim();
        if (requested && getBranch(db, requested)) branchId = requested;
      }
      const created = [];
      const errors = [];
      for (let i = 0; i < rows.length; i += 1) {
        const r = write.insertBankReconciliationLine(
          db,
          { ...rows[i], actor: req.user },
          branchId
        );
        if (r.ok) created.push(r.id);
        else errors.push({ index: i, error: r.error || 'Insert failed.' });
      }
      res.status(200).json({
        ok: errors.length === 0,
        createdIds: created,
        createdCount: created.length,
        errorCount: errors.length,
        errors,
        parseWarnings: parsed.parseErrors?.length ? parsed.parseErrors : undefined,
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  }
  );

  app.post(
    '/api/bank-reconciliation/import',
    requirePermission('finance.post'),
    rateLimitAuthedUser(bankFinanceImportBuckets, 'bank-import', 20, 60_000),
    (req, res) => {
    try {
      const lines = req.body?.lines;
      if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ ok: false, error: 'Body.lines must be a non-empty array.' });
      }
      if (lines.length > 500) {
        return res.status(400).json({ ok: false, error: 'Maximum 500 lines per import.' });
      }
      let branchId = req.workspaceBranchId || DEFAULT_BRANCH_ID;
      if (req.workspaceViewAll && canUseAllBranchesRollup(req.user)) {
        const requested = String(req.body?.branchId ?? '').trim();
        if (requested && getBranch(db, requested)) branchId = requested;
      }
      const created = [];
      const errors = [];
      for (let i = 0; i < lines.length; i += 1) {
        const r = write.insertBankReconciliationLine(
          db,
          { ...(lines[i] || {}), actor: req.user },
          branchId
        );
        if (r.ok) created.push(r.id);
        else errors.push({ index: i, error: r.error || 'Insert failed.' });
      }
      res.status(200).json({
        ok: errors.length === 0,
        createdIds: created,
        createdCount: created.length,
        errorCount: errors.length,
        errors,
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  }
  );

  app.patch('/api/bank-reconciliation/:lineId', requirePermission('finance.post'), (req, res) => {
    try {
      const lid = req.params.lineId;
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'bank_reconciliation_line', lid, (stripped) =>
        write.updateBankReconciliationLine(db, lid, stripped || {}, req.user)
      );
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post(
    '/api/bank-reconciliation/:lineId/approve-variance',
    requirePermission('finance.approve'),
    (req, res) => {
      try {
        const r = write.approveBankReconciliationVariance(db, req.params.lineId, req.user);
        res.status(r.ok ? 200 : 400).json(r);
      } catch (e) {
        console.error(e);
        res.status(400).json({ ok: false, error: String(e.message || e) });
      }
    }
  );

  app.patch('/api/customers/:customerId', requirePermission('customers.manage'), (req, res) => {
    try {
      const cid = req.params.customerId;
      return handlePatchWithEditApproval(res, db, req.user, req.body || {}, 'customer', cid, (stripped) =>
        write.updateCustomer(db, cid, stripped || {}, req.workspaceBranchId || DEFAULT_BRANCH_ID)
      );
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.delete('/api/customers/:customerId', requirePermission('sales.manage'), (req, res) => {
    try {
      const r = write.deleteCustomerIfAllowed(db, req.params.customerId, req.workspaceBranchId || DEFAULT_BRANCH_ID);
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/customers/:customerId/summary', requirePermission(CUSTOMER_AND_AR_READ_PERMS), (req, res) => {
    try {
      const id = req.params.customerId;
      const branchScope = resolveBootstrapBranchScope(req);
      const customer = getCustomer(db, id, branchScope);
      if (!customer) return res.status(404).json({ ok: false, error: 'Customer not found' });
      const entries = listLedgerEntriesForCustomer(db, id, branchScope);
      const advanceNgn = advanceBalanceFromEntries(entries, id);
      const receiptTotalNgn = ledgerReceiptTotalFromEntries(entries, id);

      const quotations = listQuotations(db, branchScope).filter((q) => q.customerID === id);
      const ledgerScope = listLedgerEntries(db, branchScope);
      const outstandingByQuotation = quotations.map((q) => ({
        quotationId: q.id,
        totalNgn: q.totalNgn,
        paidNgn: q.paidNgn,
        amountDueNgn: amountDueOnQuotationFromEntries(ledgerScope, q),
      }));

      res.json({
        ok: true,
        customerId: id,
        advanceNgn,
        receiptTotalNgn,
        entries,
        outstandingByQuotation,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to build summary' });
    }
  });

  app.get('/api/quotations', requirePermission(SALES_DOMAIN_PERMS), (req, res) => {
    try {
      const branchScope = resolveBootstrapBranchScope(req);
      res.json({ ok: true, quotations: listQuotations(db, branchScope) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load quotations' });
    }
  });

  app.get('/api/quotations/:id', requirePermission(SALES_DOMAIN_PERMS), (req, res) => {
    try {
      const row = getQuotation(db, req.params.id);
      if (!row) return res.status(404).json({ ok: false, error: 'Quotation not found' });
      const branchScope = resolveBootstrapBranchScope(req);
      const allEntries = listLedgerEntries(db, branchScope);
      const amountDueNgn = amountDueOnQuotationFromEntries(allEntries, row);
      res.json({ ok: true, quotation: row, amountDueNgn });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load quotation' });
    }
  });

  app.post('/api/quotations', requirePermission('quotations.manage'), (req, res) => {
    try {
      const id = write.insertQuotation(db, req.body || {}, req.workspaceBranchId || DEFAULT_BRANCH_ID);
      const quotation = getQuotation(db, id);
      res.status(201).json({ ok: true, quotationId: id, quotation });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/quotations/:id', requirePermission('quotations.manage'), (req, res) => {
    try {
      const qid = req.params.id;
      if (!getQuotation(db, qid)) {
        return res.status(404).json({ ok: false, error: 'Quotation not found' });
      }
      return handlePatchWithEditApprovalQuotation(res, db, req.user, req.body, qid, (stripped) => {
        write.updateQuotation(db, qid, stripped || {});
        return getQuotation(db, qid);
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/quotations/:id/revive', requirePermission('quotations.manage'), (req, res) => {
    try {
      const qid = req.params.id;
      if (!getQuotation(db, qid)) {
        return res.status(404).json({ ok: false, error: 'Quotation not found' });
      }
      write.reviveQuotation(db, qid);
      const quotation = getQuotation(db, qid);
      res.json({ ok: true, quotation });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post(
    '/api/quotations/:id/sync-paid-from-ledger',
    requirePermission([
      'quotations.manage',
      'refunds.request',
      'refunds.approve',
      'finance.post',
      'finance.approve',
    ]),
    (req, res) => {
      try {
        const r = write.syncQuotationPaidFromLedger(db, req.params.id);
        res.status(r.ok ? 200 : 400).json(r);
      } catch (e) {
        console.error(e);
        res.status(500).json({ ok: false, error: String(e.message || e) });
      }
    }
  );

  app.get('/api/advance-deposits', requirePermission(LEDGER_RELATED_PERMS), (req, res) => {
    try {
      res.json({ ok: true, advances: listAdvanceInEvents(db) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to list advance deposits' });
    }
  });

  app.get('/api/ledger', requirePermission(LEDGER_RELATED_PERMS), (req, res) => {
    try {
      const customerId = req.query.customerId;
      const branchScope = resolveBootstrapBranchScope(req);
      const entries = customerId
        ? listLedgerEntriesForCustomer(db, String(customerId), branchScope)
        : listLedgerEntries(db, branchScope);
      res.json({ ok: true, entries });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load ledger' });
    }
  });

  app.get('/api/refunds', requirePermission(REFUNDS_VISIBLE_PERMS), (req, res) => {
    try {
      const branchScope = resolveBootstrapBranchScope(req);
      res.json({ ok: true, refunds: listRefunds(db, branchScope) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load refunds' });
    }
  });

  app.post(
    '/api/ledger/advance',
    requirePermission('receipts.post'),
    rateLimitAuthedUser(ledgerPostBuckets, 'ledger-post', 45, 60_000),
    (req, res) => {
    try {
      if (sendIdempotentReplayIfAny(db, req, res, 'ledger.advance')) return;
      const { customerID, customerName, amountNgn, paymentMethod, bankReference, purpose, dateISO } =
        req.body || {};
      if (!customerID) return res.status(400).json({ ok: false, error: 'customerID is required' });
      const branchScope = resolveBootstrapBranchScope(req);
      const cust = getCustomer(db, customerID, branchScope);
      if (!cust) return res.status(404).json({ ok: false, error: 'Customer not found' });
      const postingBr = assertCustomerLedgerPostingBranch(cust, req);
      if (!postingBr.ok) return res.status(400).json({ ok: false, error: postingBr.error });

      const plan = planAdvanceIn({
        customerID,
        customerName: customerName || cust.name,
        amountNgn,
        paymentMethod,
        bankReference,
        purpose,
        dateISO,
      });
      if (!plan.ok) return res.status(400).json(plan);

      const treasuryLines = normalizeTreasuryLines(req.body || {});
      if (treasuryLines.length > 0 && totalTreasuryLines(treasuryLines) !== Math.round(Number(amountNgn) || 0)) {
        return res.status(400).json({ ok: false, error: 'Treasury lines must equal the advance amount.' });
      }

      const [entry] = db.transaction(() => {
        const wb = req.workspaceBranchId || DEFAULT_BRANCH_ID;
        const saved = insertLedgerRows(
          db,
          plan.rows.map((row) => ({
            ...row,
            createdByUserId: req.user.id,
            createdByName: req.user.displayName,
          })),
          wb
        );
        for (const row of saved) {
          write.insertAdvanceInEvent(db, row);
        }
        const [created] = saved;
        if (created && treasuryLines.length > 0) {
          write.recordCustomerAdvanceCash(db, {
            sourceId: created.id,
            customerID,
            customerName: customerName || cust.name,
            dateISO,
            reference: bankReference,
            note: purpose,
            paymentLines: treasuryLines,
            createdBy: req.user.displayName,
          });
        }
        if (created && treasuryLines.length > 0) {
          const glA = tryPostCustomerAdvanceGl(db, {
            ledgerEntryId: created.id,
            amountNgn: created.amountNgn,
            entryDateISO: dateISO,
            branchId: wb,
            createdByUserId: req.user.id,
          });
          if (!glA.ok && !glA.skipped && !glA.duplicate) {
            throw new Error(glA.error || 'Could not post advance to general ledger.');
          }
        }
        appendAuditLog(db, {
          actor: req.user,
          action: 'ledger.advance',
          entityKind: 'ledger_entry',
          entityId: created?.id ?? '',
          note: purpose || 'Customer advance posted',
          details: { customerID, amountNgn: Math.round(Number(amountNgn) || 0) },
        });
        return saved;
      })();
      const payload = { ok: true, entry };
      storeIdempotentSuccess(db, req, 'ledger.advance', 201, payload);
      res.status(201).json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to record advance' });
    }
  }
  );

  app.post(
    '/api/ledger/apply-advance',
    requirePermission('receipts.post'),
    rateLimitAuthedUser(ledgerPostBuckets, 'ledger-post', 45, 60_000),
    (req, res) => {
    try {
      if (sendIdempotentReplayIfAny(db, req, res, 'ledger.apply_advance')) return;
      const { customerID, customerName, quotationRef, amountNgn } = req.body || {};
      if (!customerID || !quotationRef) {
        return res.status(400).json({ ok: false, error: 'customerID and quotationRef are required' });
      }
      const branchScope = resolveBootstrapBranchScope(req);
      const cust = getCustomer(db, customerID, branchScope);
      if (!cust) return res.status(404).json({ ok: false, error: 'Customer not found' });
      const postingBr = assertCustomerLedgerPostingBranch(cust, req);
      if (!postingBr.ok) return res.status(400).json({ ok: false, error: postingBr.error });
      const qt = getQuotation(db, quotationRef);
      if (!qt) return res.status(404).json({ ok: false, error: 'Quotation not found' });
      if (qt.customerID !== customerID) {
        return res.status(400).json({ ok: false, error: 'Quotation does not belong to this customer' });
      }

      const entries = listLedgerEntries(db, branchScope);
      const plan = planAdvanceApplied(entries, {
        customerID,
        customerName: customerName || cust.name,
        quotationRef,
        amountNgn,
      });
      if (!plan.ok) return res.status(400).json(plan);

      const [entry] = db.transaction(() => {
        const saved = insertLedgerRows(
          db,
          plan.rows.map((row) => ({
            ...row,
            createdByUserId: req.user.id,
            createdByName: req.user.displayName,
          })),
          req.workspaceBranchId || DEFAULT_BRANCH_ID
        );
        write.syncQuotationPaidFromLedger(db, quotationRef);
        appendAuditLog(db, {
          actor: req.user,
          action: 'ledger.apply_advance',
          entityKind: 'ledger_entry',
          entityId: saved[0]?.id ?? '',
          note: `Advance applied to ${quotationRef}`,
          details: { customerID, quotationRef, amountNgn: Math.round(Number(amountNgn) || 0) },
        });
        return saved;
      })();
      const payload = { ok: true, entry };
      storeIdempotentSuccess(db, req, 'ledger.apply_advance', 201, payload);
      res.status(201).json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to apply advance' });
    }
  }
  );

  app.post(
    '/api/ledger/receipt',
    requirePermission('receipts.post'),
    rateLimitAuthedUser(ledgerPostBuckets, 'ledger-post', 45, 60_000),
    (req, res) => {
    try {
      if (sendIdempotentReplayIfAny(db, req, res, 'ledger.receipt')) return;
      const {
        customerID,
        customerName,
        quotationId,
        amountNgn,
        paymentMethod,
        bankReference,
        dateISO,
      } = req.body || {};
      if (!customerID || !quotationId) {
        return res.status(400).json({ ok: false, error: 'customerID and quotationId are required' });
      }
      const branchScope = resolveBootstrapBranchScope(req);
      const cust = getCustomer(db, customerID, branchScope);
      if (!cust) return res.status(404).json({ ok: false, error: 'Customer not found' });
      const postingBr = assertCustomerLedgerPostingBranch(cust, req);
      if (!postingBr.ok) return res.status(400).json({ ok: false, error: postingBr.error });
      const qt = getQuotation(db, quotationId);
      if (!qt) return res.status(404).json({ ok: false, error: 'Quotation not found' });
      if (qt.customerID !== customerID) {
        return res.status(400).json({ ok: false, error: 'Quotation does not belong to this customer' });
      }

      const entries = listLedgerEntries(db, branchScope);
      const plan = planReceiptWithQuotation(entries, {
        customerID,
        customerName: customerName || cust.name,
        quotationRow: qt,
        amountNgn,
        paymentMethod,
        bankReference,
        dateISO,
      });
      if (!plan.ok) return res.status(400).json(plan);

      const treasuryLines = normalizeTreasuryLines(req.body || {});
      if (treasuryLines.length > 0 && totalTreasuryLines(treasuryLines) !== Math.round(Number(amountNgn) || 0)) {
        return res.status(400).json({ ok: false, error: 'Treasury lines must equal the receipt amount.' });
      }

      const { saved, receipt, overpay } = db.transaction(() => {
        const wb = req.workspaceBranchId || DEFAULT_BRANCH_ID;
        const posted = insertLedgerRows(
          db,
          plan.rows.map((row) => ({
            ...row,
            createdByUserId: req.user.id,
            createdByName: req.user.displayName,
          })),
          wb
        );
        for (const row of posted) {
          if (row.type === 'RECEIPT') {
            write.upsertSalesReceiptForLedgerEntry(db, row, qt, wb);
          }
        }
        const parsed = receiptResultFromSavedRows(posted);
        if ((parsed.receipt || parsed.overpay) && treasuryLines.length > 0) {
          write.recordCustomerReceiptCash(db, {
            sourceId: parsed.receipt?.id || parsed.overpay?.id,
            customerID,
            customerName: customerName || cust.name,
            dateISO,
            reference: bankReference,
            note: parsed.overpay ? `Receipt ${qt.id} with overpayment to advance` : `Receipt ${qt.id}`,
            paymentLines: treasuryLines,
            createdBy: req.user.displayName,
          });
        }
        if (parsed.receipt?.id && treasuryLines.length > 0) {
          const glR = tryPostCustomerReceiptGl(db, {
            ledgerEntryId: parsed.receipt.id,
            amountNgn: parsed.receipt.amountNgn,
            entryDateISO: dateISO,
            branchId: wb,
            createdByUserId: req.user.id,
          });
          if (!glR.ok && !glR.skipped && !glR.duplicate) {
            throw new Error(glR.error || 'Could not post receipt to general ledger.');
          }
        }
        appendAuditLog(db, {
          actor: req.user,
          action: 'ledger.receipt',
          entityKind: 'quotation',
          entityId: quotationId,
          note: `Receipt posted against ${quotationId}`,
          details: {
            receiptEntryId: parsed.receipt?.id ?? '',
            overpayEntryId: parsed.overpay?.id ?? '',
            amountNgn: Math.round(Number(amountNgn) || 0),
          },
        });
        write.syncQuotationPaidFromLedger(db, quotationId);
        return { saved: posted, receipt: parsed.receipt, overpay: parsed.overpay };
      })();
      const payload = { ok: true, receipt, overpay, entries: saved };
      storeIdempotentSuccess(db, req, 'ledger.receipt', 201, payload);
      res.status(201).json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to record receipt' });
    }
  }
  );

  app.post(
    '/api/ledger/refund-advance',
    requirePermission('finance.pay'),
    rateLimitAuthedUser(ledgerPostBuckets, 'ledger-post', 45, 60_000),
    (req, res) => {
    try {
      if (sendIdempotentReplayIfAny(db, req, res, 'ledger.refund_advance')) return;
      const { customerID, customerName, amountNgn, note, dateISO } = req.body || {};
      if (!customerID) return res.status(400).json({ ok: false, error: 'customerID is required' });
      const branchScope = resolveBootstrapBranchScope(req);
      const cust = getCustomer(db, customerID, branchScope);
      if (!cust) return res.status(404).json({ ok: false, error: 'Customer not found' });
      const postingBr = assertCustomerLedgerPostingBranch(cust, req);
      if (!postingBr.ok) return res.status(400).json({ ok: false, error: postingBr.error });
      const entries = listLedgerEntries(db, branchScope);
      const plan = planRefundAdvance(entries, {
        customerID,
        customerName: customerName || cust.name,
        amountNgn,
        note,
      });
      if (!plan.ok) return res.status(400).json(plan);

      const treasuryLines = normalizeTreasuryLines(req.body || {});
      if (treasuryLines.length > 0 && totalTreasuryLines(treasuryLines) !== Math.round(Number(amountNgn) || 0)) {
        return res.status(400).json({ ok: false, error: 'Treasury lines must equal the refund amount.' });
      }

      const [entry] = db.transaction(() => {
        const wb = req.workspaceBranchId || DEFAULT_BRANCH_ID;
        const saved = insertLedgerRows(
          db,
          plan.rows.map((row) => ({
            ...row,
            createdByUserId: req.user.id,
            createdByName: req.user.displayName,
          })),
          wb
        );
        const [created] = saved;
        if (created && treasuryLines.length > 0) {
          write.recordCustomerAdvanceRefundCash(db, {
            sourceId: created.id,
            customerID,
            customerName: customerName || cust.name,
            dateISO,
            reference: note,
            note,
            paymentLines: treasuryLines,
            createdBy: req.user.displayName,
          });
        }
        appendAuditLog(db, {
          actor: req.user,
          action: 'ledger.refund_advance',
          entityKind: 'ledger_entry',
          entityId: created?.id ?? '',
          note: note || 'Advance refund posted',
          details: { customerID, amountNgn: Math.round(Number(amountNgn) || 0) },
        });
        return saved;
      })();
      const payload = { ok: true, entry };
      storeIdempotentSuccess(db, req, 'ledger.refund_advance', 201, payload);
      res.status(201).json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to record refund' });
    }
  }
  );

  app.post('/api/ledger/reverse-receipt', requirePermission('finance.reverse'), (req, res) => {
    try {
      const { entryId, note } = req.body || {};
      if (!entryId) return res.status(400).json({ ok: false, error: 'entryId is required' });
      const r = write.reverseReceiptEntry(db, String(entryId), String(note ?? '').trim(), req.user);
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to reverse receipt' });
    }
  });

  app.post('/api/ledger/reverse-advance', requirePermission('finance.reverse'), (req, res) => {
    try {
      const { entryId, note } = req.body || {};
      if (!entryId) return res.status(400).json({ ok: false, error: 'entryId is required' });
      const r = write.reverseAdvanceEntry(db, String(entryId), String(note ?? '').trim(), req.user);
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to reverse advance' });
    }
  });

  /* ——— HR ——— */
  app.get('/api/hr/caps', requireAuth, (req, res) => {
    const required = [
      ...requiredHrPoliciesFor('hr_staff_edit'),
      ...requiredHrPoliciesFor('hr_payroll'),
      ...requiredHrPoliciesFor('hr_attendance_upload'),
      ...requiredHrPoliciesFor('hr_approvals'),
    ].filter((p, idx, all) => all.findIndex((x) => x.key === p.key && x.version === p.version) === idx);
    const missing = listMissingHrPolicyAcceptances(db, req.user.id, required);
    res.json({
      ...hrCapsForUser(req.user),
      enabled: hrTablesReady(db),
      policy: { required, missing },
    });
  });

  app.get('/api/hr/policy-requirements', requireAuth, (req, res) => {
    const actionKey = String(req.query.actionKey || '').trim();
    const required = actionKey
      ? requiredHrPoliciesFor(actionKey)
      : [
          ...requiredHrPoliciesFor('hr_staff_edit'),
          ...requiredHrPoliciesFor('hr_payroll'),
          ...requiredHrPoliciesFor('hr_sensitive_view'),
          ...requiredHrPoliciesFor('hr_attendance_upload'),
          ...requiredHrPoliciesFor('hr_approvals'),
        ].filter((p, idx, all) => all.findIndex((x) => x.key === p.key && x.version === p.version) === idx);
    const missing = listMissingHrPolicyAcceptances(db, req.user.id, required);
    res.json({ ok: true, required, missing });
  });

  app.get('/api/hr/attendance/schedule', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canUploadAttendance && !caps.canPayroll && !caps.canManageStaff) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    const raw = getJsonBlob(db, 'hr.attendance.schedule.v1')?.payload || null;
    const payload = raw ? JSON.parse(raw) : { byBranchId: {}, default: defaultAttendanceSchedule() };
    res.json({ ok: true, schedule: payload });
  });

  app.put('/api/hr/attendance/schedule', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff) return res.status(403).json({ ok: false, error: 'No access.' });
    const next = req.body?.schedule;
    if (!next || typeof next !== 'object') return res.status(400).json({ ok: false, error: 'schedule is required.' });
    setJsonBlob(db, 'hr.attendance.schedule.v1', next);
    res.json({ ok: true });
  });

  app.get('/api/hr/me', requireAuth, (req, res) => {
    const payload = getHrMeProfile(db, req.user.id);
    res.json({ ok: true, ...payload });
  });

  app.get('/api/hr/staff', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canViewDirectory) {
      return res.status(403).json({ ok: false, error: 'No access to staff directory.' });
    }
    const missingSensitive = listMissingHrPolicyAcceptances(
      db,
      req.user.id,
      requiredHrPoliciesFor('hr_sensitive_view')
    );
    const scope = hrScopeFromReq(req);
    const staff = listHrStaff(db, scope).map((row) => {
      if (caps.canViewSensitiveHr && missingSensitive.length === 0) return row;
      return {
        ...row,
        taxId: row.taxId ? '***' : row.taxId,
        pensionRsaPin: row.pensionRsaPin ? '***' : row.pensionRsaPin,
        bankAccountNoMasked: row.bankAccountNoMasked ? '***' : row.bankAccountNoMasked,
        bankAccountName: row.bankAccountName ? 'Restricted' : row.bankAccountName,
        baseSalaryNgn: 0,
        housingAllowanceNgn: 0,
        transportAllowanceNgn: 0,
      };
    });
    if (caps.canViewSensitiveHr && missingSensitive.length === 0) {
      appendHrAuditEvent(db, {
        actorUserId: req.user.id,
        actorDisplayName: req.user.displayName || req.user.username || null,
        action: 'hr.staff.sensitive_view',
        entityKind: 'hr_staff_profiles',
        entityId: null,
        branchId: scope?.branchId || null,
        details: { kind: 'list', count: staff.length },
      });
    }
    res.json({ ok: true, staff });
  });

  app.post('/api/hr/staff/register', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff) {
      return res.status(403).json({ ok: false, error: 'Cannot register staff.' });
    }
    const r = registerNewStaffWithProfile(db, req.user.id, req.body || {});
    res.status(r.ok ? 201 : 400).json(r);
  });

  app.get('/api/hr/staff/:userId', requireAuth, (req, res) => {
    const uid = resolveHrStaffUserIdParam(req);
    if (!uid) return res.status(400).json({ ok: false, error: 'userId required.' });
    const caps = hrCapsForUser(req.user);

    if (uid === req.user.id) {
      const payload = getHrMeProfile(db, req.user.id);
      return res.json({ ok: true, mode: 'self', ...payload });
    }
    if (!caps.canViewDirectory) {
      return res.status(403).json({ ok: false, error: 'No access to this profile.' });
    }
    const missingSensitive = listMissingHrPolicyAcceptances(
      db,
      req.user.id,
      requiredHrPoliciesFor('hr_sensitive_view')
    );
    const scope = hrScopeFromReq(req);
    const staff = listHrStaff(db, scope);
    let profile = staff.find((s) => s.userId === uid);
    if (!profile) return res.status(404).json({ ok: false, error: 'Staff member not found in your scope.' });
    if (!caps.canViewSensitiveHr || missingSensitive.length) {
      profile = {
        ...profile,
        taxId: profile.taxId ? '***' : profile.taxId,
        pensionRsaPin: profile.pensionRsaPin ? '***' : profile.pensionRsaPin,
        bankAccountNoMasked: profile.bankAccountNoMasked ? '***' : profile.bankAccountNoMasked,
        bankAccountName: profile.bankAccountName ? 'Restricted' : profile.bankAccountName,
      };
    }
    if (caps.canViewSensitiveHr && missingSensitive.length === 0) {
      appendHrAuditEvent(db, {
        actorUserId: req.user.id,
        actorDisplayName: req.user.displayName || req.user.username || null,
        action: 'hr.staff.sensitive_view',
        entityKind: 'hr_staff_profile',
        entityId: uid,
        branchId: scope?.branchId || null,
        details: { kind: 'read', userId: uid },
      });
    }
    return res.json({ ok: true, mode: 'hr', profile });
  });

  app.get('/api/hr/staff/:userId/branch-history', requireAuth, (req, res) => {
    const uid = resolveHrStaffUserIdParam(req);
    if (!uid) return res.status(400).json({ ok: false, error: 'userId required.' });
    const caps = hrCapsForUser(req.user);
    if (uid !== req.user.id && !caps.canViewDirectory) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    const scope = hrScopeFromReq(req);
    if (uid !== req.user.id) {
      const staff = listHrStaff(db, scope);
      if (!staff.some((s) => s.userId === uid)) {
        return res.status(404).json({ ok: false, error: 'Staff member not found in your scope.' });
      }
    }
    res.json({ ok: true, history: listHrStaffBranchHistory(db, uid) });
  });

  app.patch('/api/hr/staff/:userId', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff) {
      return res.status(403).json({ ok: false, error: 'Cannot edit staff files.' });
    }
    const missing = listMissingHrPolicyAcceptances(db, req.user.id, requiredHrPoliciesFor('hr_staff_edit'));
    if (missing.length) {
      return res.status(403).json({
        ok: false,
        code: 'POLICY_ACK_REQUIRED',
        error: 'Policy acknowledgement required before editing staff files.',
        missing,
      });
    }
    const uid = resolveHrStaffUserIdParam(req);
    if (!uid) return res.status(400).json({ ok: false, error: 'userId required.' });
    const scope = hrScopeFromReq(req);
    const staff = listHrStaff(db, scope);
    if (!staff.some((s) => s.userId === uid)) {
      return res.status(404).json({ ok: false, error: 'Staff member not found.' });
    }
    const body = { ...req.body, userId: uid };
    const r = upsertHrStaffProfile(db, req.user.id, body);
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.patch('/api/hr/staff/:userId/bonus-accrual-note', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff) {
      return res.status(403).json({ ok: false, error: 'Cannot edit staff files.' });
    }
    const uid = resolveHrStaffUserIdParam(req);
    const note = req.body?.note;
    const r = patchHrStaffBonusAccrualNote(db, req.user.id, uid, note);
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.get('/api/hr/salary-welfare/snapshot', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canViewDirectory && !caps.canPayroll) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    const scope = hrScopeFromReq(req);
    const snap = salaryWelfareSnapshot(db, scope);
    res.json(snap);
  });

  app.get('/api/hr/requests', requireAuth, (req, res) => {
    try {
      if (!hrTablesReady(db)) return res.json({ ok: true, requests: [] });
      const caps = hrCapsForUser(req.user);
      const filter = {
        status: String(req.query.status || '').trim() || undefined,
        kind: String(req.query.kind || '').trim() || undefined,
        search: String(req.query.q || '').trim() || undefined,
      };
      const canSeeBranchQueue =
        caps.canHrReview ||
        caps.canFinalApprove ||
        caps.canGmHrApprove ||
        caps.canBranchEndorse ||
        caps.canManageStaff;
      const workspaceScope = hrScopeFromReq(req);
      // Admin / MD / CEO must see every branch in the HR inbox without requiring "view all" workspace toggle.
      const queueScope =
        canSeeBranchQueue && canUseAllBranchesRollup(req.user)
          ? { viewAll: true, branchId: workspaceScope.branchId || DEFAULT_BRANCH_ID }
          : workspaceScope;
      const requests = canSeeBranchQueue
        ? listHrRequests(db, queueScope, filter)
        : listHrRequests(
            db,
            { viewAll: true, branchId: DEFAULT_BRANCH_ID, includeUnassigned: true },
            { ...filter, userId: req.user.id }
          );
      res.json({ ok: true, requests });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not list requests.' });
    }
  });

  app.post('/api/hr/requests', requireAuth, (req, res) => {
    try {
      if (!hrTablesReady(db)) return res.status(503).json({ ok: false, error: 'HR tables missing.' });
      const r = createHrRequest(db, req.user.id, req.body || {});
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not create request.' });
    }
  });

  app.patch('/api/hr/requests/:requestId/submit', requireAuth, (req, res) => {
    try {
      if (!hrTablesReady(db)) return res.status(503).json({ ok: false, error: 'HR tables missing.' });
      const r = submitHrRequest(db, String(req.params.requestId || ''), req.user.id);
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not submit request.' });
    }
  });

  app.patch('/api/hr/requests/:requestId/hr-review', requireAuth, (req, res) => {
    try {
      if (!hrTablesReady(db)) return res.status(503).json({ ok: false, error: 'HR tables missing.' });
      const caps = hrCapsForUser(req.user);
      if (!caps.canManageStaff && !caps.canHrReview) {
        return res.status(403).json({ ok: false, error: 'Not allowed.' });
      }
      const r = hrReviewRequest(
        db,
        String(req.params.requestId || ''),
        req.user,
        Boolean(req.body?.approve),
        req.body?.note,
        req.body?.reasonCode
      );
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not record HR review.' });
    }
  });

  app.patch('/api/hr/requests/:requestId/manager-review', requireAuth, (req, res) => {
    try {
      if (!hrTablesReady(db)) return res.status(503).json({ ok: false, error: 'HR tables missing.' });
      const caps = hrCapsForUser(req.user);
      const row = db.prepare(`SELECT status FROM hr_requests WHERE id = ?`).get(String(req.params.requestId || ''));
      const st = String(row?.status || '');
      const needBm = st === 'branch_manager_review';
      const needGm = st === 'gm_hr_review';
      if (needBm && !caps.canBranchEndorse && !userHasPermission(req.user, '*')) {
        return res.status(403).json({ ok: false, error: 'Branch manager endorsement not allowed.' });
      }
      if (needGm && !caps.canGmHrApprove && !userHasPermission(req.user, '*')) {
        return res.status(403).json({ ok: false, error: 'GM HR approval not allowed.' });
      }
      if (!needBm && !needGm && !caps.canFinalApprove && !userHasPermission(req.user, '*')) {
        return res.status(403).json({ ok: false, error: 'Not allowed.' });
      }
      const r = managerReviewRequest(
        db,
        String(req.params.requestId || ''),
        req.user,
        Boolean(req.body?.approve),
        req.body?.note,
        req.body?.reasonCode
      );
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not record executive review.' });
    }
  });

  app.patch('/api/hr/requests/:requestId/branch-endorse', requireAuth, (req, res) => {
    try {
      if (!hrTablesReady(db)) return res.status(503).json({ ok: false, error: 'HR tables missing.' });
      const caps = hrCapsForUser(req.user);
      if (!caps.canBranchEndorse && !userHasPermission(req.user, '*')) {
        return res.status(403).json({ ok: false, error: 'Not allowed.' });
      }
      const scope = hrScopeFromReq(req);
      const rid = String(req.params.requestId || '');
      const reqRow = db.prepare(`SELECT branch_id FROM hr_requests WHERE id = ?`).get(rid);
      if (!reqRow) return res.status(404).json({ ok: false, error: 'Request not found.' });
      if (!scope.viewAll && String(reqRow.branch_id) !== String(scope.branchId)) {
        return res.status(403).json({ ok: false, error: 'Request is outside your branch.' });
      }
      const r = branchManagerEndorseRequest(
        db,
        rid,
        req.user,
        Boolean(req.body?.approve),
        req.body?.note,
        req.body?.reasonCode
      );
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not record branch endorsement.' });
    }
  });

  app.patch('/api/hr/requests/:requestId/gm-hr-review', requireAuth, (req, res) => {
    try {
      if (!hrTablesReady(db)) return res.status(503).json({ ok: false, error: 'HR tables missing.' });
      const caps = hrCapsForUser(req.user);
      if (!caps.canGmHrApprove && !userHasPermission(req.user, '*')) {
        return res.status(403).json({ ok: false, error: 'Not allowed.' });
      }
      const r = gmHrReviewRequest(
        db,
        String(req.params.requestId || ''),
        req.user,
        Boolean(req.body?.approve),
        req.body?.note,
        req.body?.reasonCode
      );
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not record GM HR review.' });
    }
  });

  app.get('/api/hr/inbox-summary', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (
      !caps.canManageStaff &&
      !caps.canHrReview &&
      !caps.canPayroll &&
      !caps.canBranchEndorse &&
      !caps.canGmHrApprove &&
      !userHasPermission(req.user, '*')
    ) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    const r = getHrInboxSummary(db, hrScopeFromReq(req));
    res.json({ ok: true, ...r });
  });

  app.get('/api/hr/public-holidays', requireAuth, (req, res) => {
    res.json({ ok: true, holidays: listHrPublicHolidays(db) });
  });

  app.put('/api/hr/public-holidays', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff && !userHasPermission(req.user, '*')) {
      return res.status(403).json({ ok: false, error: 'Not allowed.' });
    }
    const r = putHrPublicHoliday(db, req.user, req.body || {});
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.get('/api/hr/attendance/leave-overlay', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canMarkDailyRoll && !caps.canUploadAttendance && !caps.canPayroll && !caps.canManageStaff) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    const branchId = String(req.query.branchId || req.workspaceBranchId || '').trim();
    const dayIso = String(req.query.dayIso || '').trim().slice(0, 10);
    if (!branchId || !dayIso) return res.status(400).json({ ok: false, error: 'branchId and dayIso required.' });
    const scope = hrScopeFromReq(req);
    if (!scope.viewAll && branchId !== scope.branchId) {
      return res.status(403).json({ ok: false, error: 'Branch not in scope.' });
    }
    res.json({ ok: true, overlay: leaveOverlayForBranchDay(db, branchId, dayIso) });
  });

  app.get('/api/hr/discipline/cases', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    const subjectUserId = String(req.query.subjectUserId || '').trim();
    const scope = hrScopeFromReq(req);
    if (subjectUserId) {
      if (!caps.canViewDirectory && !caps.canManageStaff && !userHasPermission(req.user, '*')) {
        return res.status(403).json({ ok: false, error: 'No access.' });
      }
      const staff = listHrStaff(db, scope);
      const inScope = subjectUserId === req.user.id || staff.some((s) => s.userId === subjectUserId);
      if (!inScope) {
        return res.status(403).json({ ok: false, error: 'Staff member not in your scope.' });
      }
      return res.json({
        ok: true,
        cases: listHrDisciplineCases(db, { viewAll: true, branchId: scope.branchId, subjectUserId }),
      });
    }
    if (!caps.canManageStaff && !userHasPermission(req.user, '*')) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    res.json({ ok: true, cases: listHrDisciplineCases(db, scope) });
  });

  app.post('/api/hr/discipline/cases', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff && !userHasPermission(req.user, '*')) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    const r = createHrDisciplineCase(db, req.user, req.body || {});
    res.status(r.ok ? 201 : 400).json(r);
  });

  app.post('/api/hr/discipline/cases/:caseId/events', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff && !userHasPermission(req.user, '*')) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    const r = appendHrDisciplineEvent(db, req.user, String(req.params.caseId || ''), req.body || {});
    res.status(r.ok ? 201 : 400).json(r);
  });

  app.get('/api/hr/discipline/cases/:caseId/events', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    const caseId = String(req.params.caseId || '').trim();
    let subjectUserId = null;
    try {
      const row = db.prepare(`SELECT user_id AS userId FROM hr_discipline_cases WHERE id = ?`).get(caseId);
      subjectUserId = row?.userId != null ? String(row.userId) : null;
    } catch {
      subjectUserId = null;
    }
    if (!subjectUserId) return res.status(404).json({ ok: false, error: 'Case not found.' });
    const scope = hrScopeFromReq(req);
    const staff = listHrStaff(db, scope);
    const allowed =
      caps.canManageStaff ||
      userHasPermission(req.user, '*') ||
      (caps.canViewDirectory && (subjectUserId === req.user.id || staff.some((s) => s.userId === subjectUserId)));
    if (!allowed) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    res.json({ ok: true, events: listHrDisciplineEvents(db, caseId) });
  });

  app.get('/api/hr/appraisal/cycles', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff && !caps.canViewDirectory && !userHasPermission(req.user, '*')) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    res.json({ ok: true, cycles: listHrAppraisalCycles(db) });
  });

  app.post('/api/hr/appraisal/cycles', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff && !userHasPermission(req.user, '*')) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    const r = createHrAppraisalCycle(db, req.user, req.body || {});
    res.status(r.ok ? 201 : 400).json(r);
  });

  app.get('/api/hr/appraisal/cycles/:cycleId/forms', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff && !caps.canViewDirectory && !userHasPermission(req.user, '*')) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    res.json({ ok: true, forms: listHrAppraisalForms(db, String(req.params.cycleId || '')) });
  });

  app.put('/api/hr/appraisal/forms', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff && !userHasPermission(req.user, '*')) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    const r = upsertHrAppraisalForm(db, req.user, req.body || {});
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.get('/api/hr/feedback/:userId', requireAuth, (req, res) => {
    const uid = resolveHrStaffUserIdParam(req);
    if (!uid) return res.status(400).json({ ok: false, error: 'userId required.' });
    const caps = hrCapsForUser(req.user);
    if (uid !== req.user.id && !caps.canManageStaff && !userHasPermission(req.user, '*')) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    res.json({ ok: true, notes: listHrFeedbackNotes(db, uid) });
  });

  app.post('/api/hr/feedback', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff && !userHasPermission(req.user, '*')) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    const r = createHrFeedbackNote(db, req.user, req.body || {});
    res.status(r.ok ? 201 : 400).json(r);
  });

  app.post('/api/hr/maintenance/run-jobs', requireAuth, (req, res) => {
    if (!userHasPermission(req.user, '*') && !userHasPermission(req.user, 'settings.view')) {
      return res.status(403).json({ ok: false, error: 'Not allowed.' });
    }
    res.json(runHrScheduledJobs(db));
  });

  app.patch('/api/hr/requests/:requestId/loan-maintenance', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canLoanMaint) {
      return res.status(403).json({ ok: false, error: 'Loan maintenance not permitted.' });
    }
    const requestId = String(req.params.requestId || '').trim();
    const r = patchHrLoanMaintenance(db, requestId, req.user.id, req.body || {});
    if (r.ok) {
      appendAuditLog(db, {
        actor: req.user,
        action: 'hr.loan_maintenance',
        entityKind: 'hr_request',
        entityId: requestId,
        note: String(req.body?.note || '').trim() || 'Loan maintenance',
      });
    }
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.delete('/api/hr/requests/:requestId', requireAuth, (req, res) => {
    try {
      if (!hrTablesReady(db)) return res.status(503).json({ ok: false, error: 'HR tables missing.' });
      const r = deleteHrRequestDraft(db, String(req.params.requestId || ''), req.user.id);
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not delete request.' });
    }
  });

  app.get('/api/hr/payroll-runs', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    const mdPayroll =
      userHasPermission(req.user, 'hr.payroll.md_approve') || userHasPermission(req.user, '*');
    if (!caps.canPayroll && !mdPayroll) {
      return res.status(403).json({ ok: false, error: 'No access to payroll.' });
    }
    res.json({ ok: true, runs: listPayrollRuns(db) });
  });

  app.post('/api/hr/payroll-runs', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canPayroll) return res.status(403).json({ ok: false, error: 'No access to payroll.' });
    const missing = listMissingHrPolicyAcceptances(db, req.user.id, requiredHrPoliciesFor('hr_payroll'));
    if (missing.length) {
      return res.status(403).json({
        ok: false,
        code: 'POLICY_ACK_REQUIRED',
        error: 'Policy acknowledgement required before running payroll.',
        missing,
      });
    }
    const r = createPayrollRun(db, req.user, req.body || {});
    res.status(r.ok ? 201 : 400).json(r);
  });

  app.get('/api/hr/payroll-runs/:runId/treasury-pack', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canPayroll) return res.status(403).json({ ok: false, error: 'No access to payroll.' });
    const r = exportPayrollTreasuryPackCsv(db, String(req.params.runId || ''));
    if (!r.ok) return res.status(400).json(r);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${r.filename}"`);
    res.send(r.csv);
  });

  app.get('/api/hr/payroll-runs/:runId/gl-journal-template', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canPayroll) return res.status(403).json({ ok: false, error: 'No access to payroll.' });
    const r = exportPayrollGlJournalTemplateCsv(db, String(req.params.runId || ''));
    if (!r.ok) return res.status(400).json(r);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${r.filename}"`);
    res.send(r.csv);
  });

  app.get('/api/hr/payroll-runs/:runId/payslips-pack', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canPayroll) return res.status(403).json({ ok: false, error: 'No access to payroll.' });
    const r = exportPayrollPayslipsCsv(db, String(req.params.runId || ''));
    if (!r.ok) return res.status(400).json(r);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${r.filename}"`);
    res.send(r.csv);
  });

  app.get('/api/hr/payroll-runs/:runId/statutory-pack', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canPayroll) return res.status(403).json({ ok: false, error: 'No access to payroll.' });
    const r = exportPayrollStatutoryPackCsv(db, String(req.params.runId || ''));
    if (!r.ok) return res.status(400).json(r);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${r.filename}"`);
    res.send(r.csv);
  });

  app.get('/api/hr/payroll-runs/:runId/lines', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canPayroll) return res.status(403).json({ ok: false, error: 'No access to payroll.' });
    const runId = String(req.params.runId || '');
    const run = getPayrollRunById(db, runId);
    if (!run) return res.status(404).json({ ok: false, error: 'Run not found.' });
    res.json({ ok: true, lines: listPayrollLines(db, runId) });
  });

  app.get('/api/hr/payroll-runs/:runId', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canPayroll) return res.status(403).json({ ok: false, error: 'No access to payroll.' });
    const run = getPayrollRunById(db, String(req.params.runId || ''));
    if (!run) return res.status(404).json({ ok: false, error: 'Run not found.' });
    const lines = listPayrollLines(db, run.id);
    res.json({ ok: true, run, lines });
  });

  app.post('/api/hr/payroll-runs/:runId/md-approve', requireAuth, (req, res) => {
    const r = approvePayrollRunByMd(db, String(req.params.runId || ''), req.user);
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.patch('/api/hr/payroll-runs/:runId', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canPayroll) return res.status(403).json({ ok: false, error: 'No access to payroll.' });
    const missing = listMissingHrPolicyAcceptances(db, req.user.id, requiredHrPoliciesFor('hr_payroll'));
    if (missing.length) {
      return res.status(403).json({
        ok: false,
        code: 'POLICY_ACK_REQUIRED',
        error: 'Policy acknowledgement required before updating payroll runs.',
        missing,
      });
    }
    const r = patchPayrollRun(db, String(req.params.runId || ''), req.body || {}, req.user);
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.post('/api/hr/payroll-runs/:runId/recompute', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canPayroll) return res.status(403).json({ ok: false, error: 'No access to payroll.' });
    const missing = listMissingHrPolicyAcceptances(db, req.user.id, requiredHrPoliciesFor('hr_payroll'));
    if (missing.length) {
      return res.status(403).json({
        ok: false,
        code: 'POLICY_ACK_REQUIRED',
        error: 'Policy acknowledgement required before recomputing payroll.',
        missing,
      });
    }
    const runId = String(req.params.runId || '');
    const r = computePayrollRun(db, runId);
    if (!r.ok) return res.status(400).json(r);
    res.json({ ok: true, lines: listPayrollLines(db, runId) });
  });

  app.get('/api/hr/attendance', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canUploadAttendance && !caps.canPayroll && !caps.canViewDirectory) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    const scope = hrScopeFromReq(req);
    res.json({ ok: true, uploads: listHrAttendance(db, scope) });
  });

  app.post('/api/hr/attendance/upload', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canUploadAttendance && !caps.canPayroll) {
      return res.status(403).json({ ok: false, error: 'Cannot upload attendance.' });
    }
    const missing = listMissingHrPolicyAcceptances(db, req.user.id, requiredHrPoliciesFor('hr_attendance_upload'));
    if (missing.length) {
      return res.status(403).json({
        ok: false,
        code: 'POLICY_ACK_REQUIRED',
        error: 'Policy acknowledgement required before uploading attendance.',
        missing,
      });
    }
    const scope = hrScopeFromReq(req);
    const branchId = String(req.body?.branchId || '').trim();
    if (branchId && !scope.viewAll && String(scope.branchId || '') !== branchId) {
      return res.status(403).json({ ok: false, error: 'Branch not in your workspace scope.' });
    }
    // Optionally compute minutesLate from schedule if arrivalTimeHm is provided.
    let body = req.body || {};
    try {
      const blob = getJsonBlob(db, 'hr.attendance.schedule.v1')?.payload || null;
      const sched = blob ? JSON.parse(blob) : null;
      const schedule = sched?.byBranchId?.[branchId] || sched?.default || defaultAttendanceSchedule();
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      body = {
        ...body,
        rows: rows.map((row) => {
          const arrivalHm = String(row?.arrivalTimeHm || '').trim();
          const minutesLate =
            row?.minutesLate != null
              ? Math.max(0, Math.round(Number(row.minutesLate) || 0))
              : arrivalHm
                ? computeMinutesLateFromSchedule(schedule, `${body.periodYyyymm.slice(0, 4)}-${body.periodYyyymm.slice(4, 6)}-01`, arrivalHm)
                : 0;
          return { ...row, minutesLate };
        }),
      };
    } catch {
      /* ignore schedule parsing */
    }
    const r = uploadHrAttendance(db, req.user, body);
    res.status(r.ok ? 201 : 400).json(r);
  });

  app.get('/api/hr/daily-roll', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canUploadAttendance && !caps.canPayroll && !caps.canViewDirectory) {
      return res.status(403).json({ ok: false, error: 'No access.' });
    }
    const scope = hrScopeFromReq(req);
    const branchId = String(req.query.branchId || '').trim();
    const dayIso = String(req.query.dayIso || '').trim();
    if (branchId && !scope.viewAll && String(scope.branchId || '') !== branchId) {
      return res.status(403).json({ ok: false, error: 'Branch not in your workspace scope.' });
    }
    const r = getHrDailyRollCall(db, scope, branchId, dayIso);
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.post('/api/hr/daily-roll', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canUploadAttendance && !caps.canPayroll && !caps.canMarkDailyRoll) {
      return res.status(403).json({ ok: false, error: 'Cannot record daily roll.' });
    }
    const scope = hrScopeFromReq(req);
    const branchId = String(req.body?.branchId || '').trim();
    if (branchId && !scope.viewAll && String(scope.branchId || '') !== branchId) {
      return res.status(403).json({ ok: false, error: 'Branch not in your workspace scope.' });
    }
    const r = upsertHrDailyRollCall(db, req.user, scope, req.body || {});
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.post('/api/hr/leave/recompute', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff && !caps.canPayroll) {
      return res.status(403).json({ ok: false, error: 'No access to leave engine.' });
    }
    const r = recomputeHrLeaveBalances(db, req.user, req.body || {});
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.post('/api/hr/leave/adjust', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff) {
      return res.status(403).json({ ok: false, error: 'No access to adjust leave balances.' });
    }
    const r = adjustHrLeaveBalance(db, req.user, req.body || {});
    res.status(r.ok ? 201 : 400).json(r);
  });

  app.get('/api/hr/leave/balances', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff && !caps.canPayroll) {
      return res.status(403).json({ ok: false, error: 'No access to leave balances.' });
    }
    const userId = String(req.query.userId || '').trim();
    const leaveType = String(req.query.leaveType || '').trim() || undefined;
    const periodYyyymm = String(req.query.periodYyyymm || '').trim() || undefined;
    const balances = listHrLeaveBalances(db, { userId: userId || undefined, leaveType, periodYyyymm });
    res.json({ ok: true, balances });
  });

  app.post('/api/hr/policy-acknowledgements', requireAuth, (req, res) => {
    const body = { ...(req.body || {}), userId: String(req.body?.userId || req.user.id) };
    const r = acceptHrPolicy(db, req.user, body);
    res.status(r.ok ? 201 : 400).json(r);
  });

  app.get('/api/hr/policy-acknowledgements', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canCompliance) {
      return res.status(403).json({ ok: false, error: 'No compliance access.' });
    }
    const userId = String(req.query.userId || '').trim();
    const policyKey = String(req.query.policyKey || '').trim();
    const rows = listHrPolicyAcknowledgements(db, {
      userId: userId || undefined,
      policyKey: policyKey || undefined,
    });
    res.json({ ok: true, acknowledgements: rows });
  });

  app.get('/api/hr/observability', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canCompliance) return res.status(403).json({ ok: false, error: 'No observability access.' });
    const scope = hrScopeFromReq(req);
    res.json({ ok: true, ...listHrObservability(db, scope) });
  });

  app.get('/api/hr/compensation-insights', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canViewDirectory && !caps.canPayroll) {
      return res.status(403).json({ ok: false, error: 'No compensation insights access.' });
    }
    const scope = hrScopeFromReq(req);
    res.json({ ok: true, ...listHrCompensationInsights(db, scope, { canViewSensitiveHr: caps.canViewSensitiveHr }) });
  });

  app.get('/api/hr/data-cleanup-queue', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff && !caps.canCompliance) {
      return res.status(403).json({ ok: false, error: 'No cleanup access.' });
    }
    const scope = hrScopeFromReq(req);
    res.json({ ok: true, queue: listHrDataCleanupQueue(db, scope) });
  });

  app.post('/api/hr/data-cleanup-queue/resolve', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff && !caps.canCompliance) {
      return res.status(403).json({ ok: false, error: 'No cleanup access.' });
    }
    const r = applyHrDataCleanupAction(db, req.user, req.body || {});
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.get('/api/hr/next-uat-readiness', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canCompliance && !caps.canManageStaff) {
      return res.status(403).json({ ok: false, error: 'No UAT readiness access.' });
    }
    const scope = hrScopeFromReq(req);
    const readiness = hrNextUatReadiness(db, scope);
    const signoff = getJsonBlob(db, 'hr_next_uat_signoff') || null;
    res.json({ ok: true, ...readiness, signoff, canCutover: Boolean(readiness.canCutover && signoff?.approvedAtIso) });
  });

  app.post('/api/hr/next-uat-signoff', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canCompliance) {
      return res.status(403).json({ ok: false, error: 'No UAT sign-off access.' });
    }
    const approve = Boolean(req.body?.approve);
    if (!approve) {
      setJsonBlob(db, 'hr_next_uat_signoff', null);
      return res.json({ ok: true, signoff: null });
    }
    const signoff = {
      approvedAtIso: new Date().toISOString(),
      approvedByUserId: req.user.id,
      approvedByName: req.user.displayName || req.user.username || req.user.id,
      note: String(req.body?.note || '').trim() || null,
    };
    setJsonBlob(db, 'hr_next_uat_signoff', signoff);
    appendAuditLog(db, {
      actor: req.user,
      action: 'hr.next_uat_signoff',
      entityKind: 'hr',
      entityId: 'hr-next',
      note: signoff.note || 'HR Next UAT sign-off',
    });
    return res.json({ ok: true, signoff });
  });

  app.get(
    '/api/hr/employment-letters',
    requirePermission(['settings.view', 'hr.manage', 'hr.letters.generate']),
    (req, res) => {
      try {
        const userId = String(req.query.userId || '').trim();
        const letters = listEmploymentLetters(db, userId || null);
        res.json({ ok: true, letters });
      } catch (e) {
        console.error(e);
        res.status(500).json({ ok: false, error: 'Could not list employment letters.' });
      }
    }
  );

  app.post('/api/hr/employment-letters', requireAuth, (req, res) => {
    try {
      if (!hrTablesReady(db)) return res.status(503).json({ ok: false, error: 'HR module not initialised.' });
      const caps = hrCapsForUser(req.user);
      if (!caps.canIssueLetters) {
        return res.status(403).json({ ok: false, error: 'Cannot issue letters.' });
      }
      const r = generateEmploymentLetter(db, req.user, req.body || {});
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Could not generate letter.' });
    }
  });
}
