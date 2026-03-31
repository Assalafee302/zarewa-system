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
import { buildBootstrap } from './bootstrap.js';
import {
  changePassword,
  clearSessionCookie,
  completePasswordReset,
  loginWithPassword,
  logoutSession,
  requestPasswordReset,
  requireAuth,
  requirePermission,
  setSessionCookie,
  updateUserProfile,
  userHasPermission,
} from './auth.js';
import { resolveBootstrapBranchScope } from './branchScope.js';
import { DEFAULT_BRANCH_ID, getBranch, listBranches } from './branches.js';
import {
  appendAuditLog,
  decidePaymentRequest,
  decideRefundRequest,
  insertPaymentRequest,
  insertRefundRequest,
  lockAccountingPeriod,
  previewRefundRequest,
  unlockAccountingPeriod,
  upsertTreasuryAccount,
} from './controlOps.js';
import { deleteMasterDataRecord, listMasterData, upsertMasterDataRecord } from './masterData.js';
import {
  completeProductionJob,
  listProductionJobCoilsForJob,
  previewProductionConversion,
  saveProductionJobAllocations,
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
  listAdvanceInEvents,
  listAuditLog,
  listAuditLogNdjsonRows,
  listPeriodLocks,
  listCustomerCrmInteractions,
  listSalesReceipts,
  listPurchaseOrders,
  listCuttingLists,
} from './readModel.js';
import { insertLedgerRows } from './writeOps.js';
import * as write from './writeOps.js';
import {
  computePayrollRun,
  createPayrollRun,
  getHrMeProfile,
  getPayrollRunById,
  hrListScope,
  listHrAttendance,
  listHrStaff,
  listPayrollLines,
  listPayrollRuns,
  patchHrLoanMaintenance,
  patchHrStaffBonusAccrualNote,
  patchPayrollRun,
  salaryWelfareSnapshot,
  upsertHrStaffProfile,
  uploadHrAttendance,
} from './hrOps.js';

const loginAttemptBuckets = new Map();
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
  return {
    ok: true,
    canViewDirectory:
      has('*') || has('hr.view_directory') || has('settings.view') || has('audit.view'),
    canPayroll: has('*') || has('hr.payroll') || has('finance.pay'),
    canManageStaff: has('*') || has('hr.manage') || has('settings.view'),
    canUploadAttendance: has('*') || has('hr.attendance') || has('operations.manage'),
    canLoanMaint: has('*') || has('hr.loan_maintain') || has('finance.approve'),
  };
}

function hrScopeFromReq(req) {
  return hrListScope({
    user: req.user,
    workspaceBranchId: req.workspaceBranchId,
    workspaceViewAll: req.workspaceViewAll,
  });
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
        ...(result.devResetToken ? { devResetToken: result.devResetToken } : {}),
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
        const id = String(req.body.currentBranchId).trim();
        const br = getBranch(db, id);
        if (!br || !br.active) {
          return res.status(400).json({ ok: false, error: 'Invalid or inactive branch.' });
        }
        nextBranch = id;
      }

      let viewAll = Number(row.view_all_branches) === 1 ? 1 : 0;
      if (req.body?.viewAllBranches === true) {
        if (!userHasPermission(req.user, 'hq.view_all_branches')) {
          return res.status(403).json({ ok: false, error: 'HQ roll-up is not enabled for this role.' });
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

  app.use('/api', requireAuth);

  app.get('/api/bootstrap', (req, res) => {
    try {
      const includeControls =
        userHasPermission(req.user, 'audit.view') ||
        userHasPermission(req.user, 'period.manage') ||
        userHasPermission(req.user, 'finance.approve');
      const includeUsers = userHasPermission(req.user, 'settings.view');
      const branchScope = resolveBootstrapBranchScope(req);
      res.json(
        buildBootstrap(db, {
          session: req.session,
          includeControls,
          includeUsers,
          branchScope,
        })
      );
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Bootstrap failed' });
    }
  });

  /**
   * Permission-aware quick search (customers, quotes, receipts, POs, suppliers, cutting lists).
   */
  app.get('/api/workspace/search', (req, res) => {
    try {
      const raw = String(req.query.q ?? '').trim();
      const limit = Math.min(40, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
      if (raw.length < 2) {
        return res.json({ ok: true, results: [] });
      }
      const q = raw.toLowerCase();
      const branchScope = resolveBootstrapBranchScope(req);
      const results = [];
      const push = (row) => {
        if (results.length < limit) results.push(row);
      };

      const perm = (p) => userHasPermission(req.user, '*') || userHasPermission(req.user, p);

      if (perm('sales.view') || perm('customers.manage')) {
        for (const c of listCustomers(db)) {
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
        for (const row of listQuotations(db, branchScope)) {
          if (results.length >= limit) break;
          const blob = `${row.id} ${row.customerName || ''} ${row.customerID || ''} ${row.projectName || ''}`.toLowerCase();
          if (blob.includes(q)) {
            push({
              kind: 'quotation',
              id: row.id,
              label: row.id,
              sublabel: row.customerName,
              path: '/sales',
              state: { globalSearchQuery: row.id, focusSalesTab: 'quotations' },
            });
          }
        }
      }

      if (perm('receipts.post') || perm('finance.view') || perm('sales.view')) {
        for (const row of listSalesReceipts(db, branchScope)) {
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
        for (const row of listPurchaseOrders(db, branchScope)) {
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
        for (const s of listSuppliers(db)) {
          if (results.length >= limit) break;
          const blob = `${s.supplierID} ${s.name || ''} ${s.city || ''}`.toLowerCase();
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
        for (const row of listCuttingLists(db, branchScope)) {
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
      }

      return res.json({ ok: true, results });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'Search failed' });
    }
  });

  app.get('/api/suppliers', (_req, res) => {
    try {
      res.json({ ok: true, suppliers: listSuppliers(db) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load suppliers' });
    }
  });

  app.get('/api/transport-agents', (_req, res) => {
    try {
      res.json({ ok: true, transportAgents: listTransportAgents(db) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load agents' });
    }
  });

  app.post('/api/suppliers', requirePermission('suppliers.manage'), (req, res) => {
    try {
      const id = write.insertSupplier(db, req.body || {});
      res.status(201).json({ ok: true, supplierID: id });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/suppliers/:supplierId', requirePermission('suppliers.manage'), (req, res) => {
    const r = write.updateSupplier(db, req.params.supplierId, req.body || {});
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.delete('/api/suppliers/:supplierId', requirePermission('suppliers.manage'), (req, res) => {
    const r = write.deleteSupplier(db, req.params.supplierId);
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.post('/api/transport-agents', requirePermission('suppliers.manage'), (req, res) => {
    try {
      const id = write.insertTransportAgent(db, req.body || {});
      res.status(201).json({ ok: true, id });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/transport-agents/:id', requirePermission('suppliers.manage'), (req, res) => {
    const r = write.updateTransportAgent(db, req.params.id, req.body || {});
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.delete('/api/transport-agents/:id', requirePermission('suppliers.manage'), (req, res) => {
    const r = write.deleteTransportAgent(db, req.params.id);
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.get('/api/inventory/snapshot', (req, res) => {
    try {
      const includeControls =
        userHasPermission(req.user, 'audit.view') || userHasPermission(req.user, 'period.manage');
      res.json(
        buildBootstrap(db, {
          session: req.session,
          includeControls,
          includeUsers: userHasPermission(req.user, 'settings.view'),
        })
      );
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed' });
    }
  });

  app.post('/api/customers', requirePermission('customers.manage'), (req, res) => {
    try {
      const id = write.insertCustomer(db, req.body || {});
      res.status(201).json({ ok: true, customerID: id });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/purchase-orders', requirePermission('purchase_orders.manage'), (req, res) => {
    try {
      const body = req.body || {};
      const poID = body.poID || write.nextPoIdFromDb(db);
      const r = write.insertPurchaseOrder(db, { ...body, poID }, req.workspaceBranchId || DEFAULT_BRANCH_ID);
      res.status(201).json({ ok: true, ...r });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/purchase-orders/:poId/link-transport', requirePermission('purchase_orders.manage'), (req, res) => {
    const { transportAgentId, transportAgentName, transportReference, transportNote } = req.body || {};
    const r = write.linkTransport(db, req.params.poId, transportAgentId, transportAgentName, {
      transportReference,
      transportNote,
    });
    res.status(r.ok ? 200 : 400).json(r);
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
    const r = write.markTransportPaid(db, req.params.poId);
    res.status(r.ok ? 200 : 400).json(r);
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
    const { status } = req.body || {};
    const r = write.setPoStatus(db, req.params.poId, status);
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.patch('/api/purchase-orders/:poId/invoice', requirePermission('purchase_orders.manage'), (req, res) => {
    const { invoiceNo, invoiceDateISO, deliveryDateISO } = req.body || {};
    const r = write.attachSupplierInvoice(db, req.params.poId, invoiceNo, invoiceDateISO, deliveryDateISO);
    res.status(r.ok ? 200 : 400).json(r);
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
      const r = write.updateCuttingList(db, req.params.id, req.body || {});
      if (!r.ok) return res.status(400).json(r);
      const cuttingList = getCuttingList(db, req.params.id);
      res.json({ ok: true, cuttingList });
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
      const jobId = resolveCuttingListProductionJob(db, req.params.id);
      if (!jobId) {
        return res.status(404).json({ ok: false, error: 'No production run for this cutting list.' });
      }
      const r = saveProductionJobAllocations(db, jobId, req.body?.allocations || [], { actor: req.user });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/cutting-lists/:id/production/start', requirePermission('production.manage'), (req, res) => {
    try {
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
      const r = write.insertProductionJob(db, req.body || {}, req.workspaceBranchId || DEFAULT_BRANCH_ID);
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/production-jobs/:jobId/status', requirePermission('production.manage'), (req, res) => {
    try {
      const r = write.setProductionJobStatus(db, req.params.jobId, req.body?.status);
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/production-jobs/:jobId/coil-allocations', requirePermission('production.manage'), (req, res) => {
    try {
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
      const r = saveProductionJobAllocations(db, req.params.jobId, req.body?.allocations || [], {
        actor: req.user,
      });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/production-jobs/:jobId/start', requirePermission('production.manage'), (req, res) => {
    try {
      const r = startProductionJob(db, req.params.jobId, req.body || {}, { actor: req.user });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/production-jobs/:jobId/complete', requirePermission('production.manage'), (req, res) => {
    try {
      const r = completeProductionJob(db, req.params.jobId, req.body || {}, { actor: req.user });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/production-jobs/:jobId/conversion-preview', requirePermission('production.manage'), (req, res) => {
    try {
      const r = previewProductionConversion(db, req.params.jobId, req.body || {});
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/deliveries', requirePermission('deliveries.manage'), (req, res) => {
    try {
      const r = write.insertDelivery(db, req.body || {}, req.workspaceBranchId || DEFAULT_BRANCH_ID);
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/deliveries/:deliveryId/confirm', requirePermission('deliveries.manage'), (req, res) => {
    const r = write.confirmDelivery(db, req.params.deliveryId, req.body || {});
    res.status(r.ok ? 200 : 400).json(r);
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

  app.post('/api/inventory/adjust', requirePermission('inventory.adjust'), (req, res) => {
    const { productID, type, qty, reasonCode, note, dateISO } = req.body || {};
    const r = write.adjustStock(db, productID, type, qty, reasonCode, note, dateISO);
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.post('/api/inventory/transfer-to-production', requirePermission('production.manage'), (req, res) => {
    const { productID, qty, productionOrderId, dateISO } = req.body || {};
    const r = write.transferToProduction(db, productID, qty, productionOrderId, dateISO);
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.post('/api/inventory/finished-goods', requirePermission('production.manage'), (req, res) => {
    const { productID, qty, unitPriceNgn, productionOrderId, dateISO, wipRelease, extras } = req.body || {};
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
    const r = write.acknowledgeCoilRequest(db, req.params.id);
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.put('/api/treasury/accounts', requirePermission('treasury.manage'), (req, res) => {
    try {
      const reason = String(req.body?.reason ?? '').trim();
      if (!reason) return res.status(400).json({ ok: false, error: 'Reason is required for bulk treasury updates.' });
      write.replaceTreasuryAccounts(db, req.body?.accounts || []);
      appendAuditLog(db, {
        actor: req.user,
        action: 'treasury.bulk_replace',
        entityKind: 'treasury_account',
        entityId: 'bulk',
        note: reason,
        details: { accountCount: Array.isArray(req.body?.accounts) ? req.body.accounts.length : 0 },
      });
      res.json({ ok: true });
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
      const reason = String(req.body?.reason ?? '').trim();
      if (!reason) return res.status(400).json({ ok: false, error: 'Reason is required for bulk refund updates.' });
      write.replaceRefunds(db, req.body?.refunds || []);
      appendAuditLog(db, {
        actor: req.user,
        action: 'refund.bulk_replace',
        entityKind: 'refund',
        entityId: 'bulk',
        note: reason,
        details: { refundCount: Array.isArray(req.body?.refunds) ? req.body.refunds.length : 0 },
      });
      res.json({ ok: true });
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
      const r = upsertMasterDataRecord(db, req.params.kind, { ...(req.body || {}), id: req.params.id }, req.user);
      res.status(r.ok ? 200 : 400).json(r);
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
      const r = insertPaymentRequest(db, req.body || {}, req.user);
      res.status(r.ok ? 201 : 400).json(r);
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
      const reason = String(req.body?.reason ?? '').trim();
      if (!reason) return res.status(400).json({ ok: false, error: 'Reason is required for bulk finance updates.' });
      const b = req.body || {};
      db.transaction(() => {
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
      })();
      res.json({ ok: true });
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

  app.get('/api/controls/period-locks', requirePermission('period.manage'), (_req, res) => {
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

  app.get('/api/customers', (_req, res) => {
    try {
      res.json({ ok: true, customers: listCustomers(db) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load customers' });
    }
  });

  app.get('/api/customers/:customerId', (req, res) => {
    try {
      const row = getCustomer(db, req.params.customerId);
      if (!row) return res.status(404).json({ ok: false, error: 'Customer not found' });
      res.json({ ok: true, customer: row });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load customer' });
    }
  });

  app.get('/api/customers/:customerId/interactions', (req, res) => {
    try {
      const row = getCustomer(db, req.params.customerId);
      if (!row) return res.status(404).json({ ok: false, error: 'Customer not found' });
      res.json({
        ok: true,
        interactions: listCustomerCrmInteractions(db, req.params.customerId),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load CRM interactions' });
    }
  });

  app.post('/api/customers/:customerId/interactions', requirePermission('customers.manage'), (req, res) => {
    try {
      const r = write.insertCustomerCrmInteraction(db, req.params.customerId, req.body || {}, req.user);
      res.status(r.ok ? 201 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/bank-reconciliation/:lineId', requirePermission('finance.post'), (req, res) => {
    try {
      const r = write.updateBankReconciliationLine(db, req.params.lineId, req.body || {}, req.user);
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.patch('/api/customers/:customerId', requirePermission('customers.manage'), (req, res) => {
    try {
      const r = write.updateCustomer(db, req.params.customerId, req.body || {});
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/customers/:customerId/summary', (req, res) => {
    try {
      const id = req.params.customerId;
      const customer = getCustomer(db, id);
      if (!customer) return res.status(404).json({ ok: false, error: 'Customer not found' });

      const branchScope = resolveBootstrapBranchScope(req);
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

  app.get('/api/quotations', (req, res) => {
    try {
      const branchScope = resolveBootstrapBranchScope(req);
      res.json({ ok: true, quotations: listQuotations(db, branchScope) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load quotations' });
    }
  });

  app.get('/api/quotations/:id', (req, res) => {
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
      write.updateQuotation(db, qid, req.body || {});
      const quotation = getQuotation(db, qid);
      res.json({ ok: true, quotation });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.get('/api/advance-deposits', (_req, res) => {
    try {
      res.json({ ok: true, advances: listAdvanceInEvents(db) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to list advance deposits' });
    }
  });

  app.get('/api/ledger', (req, res) => {
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

  app.get('/api/refunds', (req, res) => {
    try {
      const branchScope = resolveBootstrapBranchScope(req);
      res.json({ ok: true, refunds: listRefunds(db, branchScope) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to load refunds' });
    }
  });

  app.post('/api/ledger/advance', requirePermission('receipts.post'), (req, res) => {
    try {
      const { customerID, customerName, amountNgn, paymentMethod, bankReference, purpose, dateISO } =
        req.body || {};
      if (!customerID) return res.status(400).json({ ok: false, error: 'customerID is required' });
      const cust = getCustomer(db, customerID);
      if (!cust) return res.status(404).json({ ok: false, error: 'Customer not found' });

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
      res.status(201).json({ ok: true, entry });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to record advance' });
    }
  });

  app.post('/api/ledger/apply-advance', requirePermission('receipts.post'), (req, res) => {
    try {
      const { customerID, customerName, quotationRef, amountNgn } = req.body || {};
      if (!customerID || !quotationRef) {
        return res.status(400).json({ ok: false, error: 'customerID and quotationRef are required' });
      }
      const cust = getCustomer(db, customerID);
      if (!cust) return res.status(404).json({ ok: false, error: 'Customer not found' });
      const qt = getQuotation(db, quotationRef);
      if (!qt) return res.status(404).json({ ok: false, error: 'Quotation not found' });
      if (qt.customerID !== customerID) {
        return res.status(400).json({ ok: false, error: 'Quotation does not belong to this customer' });
      }

      const branchScope = resolveBootstrapBranchScope(req);
      const entries = listLedgerEntries(db, branchScope);
      const plan = planAdvanceApplied(entries, {
        customerID,
        customerName: customerName || cust.name,
        quotationRef,
        amountNgn,
      });
      if (!plan.ok) return res.status(400).json(plan);

      const [entry] = insertLedgerRows(
        db,
        plan.rows.map((row) => ({
          ...row,
          createdByUserId: req.user.id,
          createdByName: req.user.displayName,
        })),
        req.workspaceBranchId || DEFAULT_BRANCH_ID
      );
      appendAuditLog(db, {
        actor: req.user,
        action: 'ledger.apply_advance',
        entityKind: 'ledger_entry',
        entityId: entry?.id ?? '',
        note: `Advance applied to ${quotationRef}`,
        details: { customerID, quotationRef, amountNgn: Math.round(Number(amountNgn) || 0) },
      });
      res.status(201).json({ ok: true, entry });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to apply advance' });
    }
  });

  app.post('/api/ledger/receipt', requirePermission('receipts.post'), (req, res) => {
    try {
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
      const cust = getCustomer(db, customerID);
      if (!cust) return res.status(404).json({ ok: false, error: 'Customer not found' });
      const qt = getQuotation(db, quotationId);
      if (!qt) return res.status(404).json({ ok: false, error: 'Quotation not found' });
      if (qt.customerID !== customerID) {
        return res.status(400).json({ ok: false, error: 'Quotation does not belong to this customer' });
      }

      const branchScope = resolveBootstrapBranchScope(req);
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
        return { saved: posted, receipt: parsed.receipt, overpay: parsed.overpay };
      })();
      res.status(201).json({ ok: true, receipt, overpay, entries: saved });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to record receipt' });
    }
  });

  app.post('/api/ledger/refund-advance', requirePermission('finance.pay'), (req, res) => {
    try {
      const { customerID, customerName, amountNgn, note, dateISO } = req.body || {};
      if (!customerID) return res.status(400).json({ ok: false, error: 'customerID is required' });
      const cust = getCustomer(db, customerID);
      if (!cust) return res.status(404).json({ ok: false, error: 'Customer not found' });

      const branchScope = resolveBootstrapBranchScope(req);
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
      res.status(201).json({ ok: true, entry });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Failed to record refund' });
    }
  });

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
    res.json(hrCapsForUser(req.user));
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
    const scope = hrScopeFromReq(req);
    const staff = listHrStaff(db, scope);
    res.json({ ok: true, staff });
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
    const scope = hrScopeFromReq(req);
    const staff = listHrStaff(db, scope);
    const profile = staff.find((s) => s.userId === uid);
    if (!profile) return res.status(404).json({ ok: false, error: 'Staff member not found in your scope.' });
    return res.json({ ok: true, mode: 'hr', profile });
  });

  app.patch('/api/hr/staff/:userId', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canManageStaff) {
      return res.status(403).json({ ok: false, error: 'Cannot edit staff files.' });
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

  app.get('/api/hr/payroll-runs', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canPayroll) return res.status(403).json({ ok: false, error: 'No access to payroll.' });
    res.json({ ok: true, runs: listPayrollRuns(db) });
  });

  app.post('/api/hr/payroll-runs', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canPayroll) return res.status(403).json({ ok: false, error: 'No access to payroll.' });
    const r = createPayrollRun(db, req.user, req.body || {});
    res.status(r.ok ? 201 : 400).json(r);
  });

  app.get('/api/hr/payroll-runs/:runId', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canPayroll) return res.status(403).json({ ok: false, error: 'No access to payroll.' });
    const run = getPayrollRunById(db, String(req.params.runId || ''));
    if (!run) return res.status(404).json({ ok: false, error: 'Run not found.' });
    const lines = listPayrollLines(db, run.id);
    res.json({ ok: true, run, lines });
  });

  app.patch('/api/hr/payroll-runs/:runId', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canPayroll) return res.status(403).json({ ok: false, error: 'No access to payroll.' });
    const r = patchPayrollRun(db, String(req.params.runId || ''), req.body || {});
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.post('/api/hr/payroll-runs/:runId/recompute', requireAuth, (req, res) => {
    const caps = hrCapsForUser(req.user);
    if (!caps.canPayroll) return res.status(403).json({ ok: false, error: 'No access to payroll.' });
    const r = computePayrollRun(db, String(req.params.runId || ''));
    res.status(r.ok ? 200 : 400).json(r);
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
    const r = uploadHrAttendance(db, req.user, req.body || {});
    res.status(r.ok ? 201 : 400).json(r);
  });
}
