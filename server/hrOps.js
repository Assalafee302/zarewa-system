import crypto from 'node:crypto';
import { createAppUserRecord, roleLabel, userHasPermission } from './auth.js';
import { DEFAULT_BRANCH_ID } from './branches.js';
import { provisionStaffLoanForFinanceQueue } from './writeOps.js';

const REQUEST_KINDS = new Set([
  'leave',
  'loan',
  'retirement',
  'appeal',
  'profile_change',
  'bonus',
  'training',
  'promotion',
  'welfare',
  'other',
]);

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(10).toString('hex')}`;
}

function safeJsonParse(raw, fallback) {
  try {
    const v = JSON.parse(String(raw || ''));
    return v && typeof v === 'object' ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function hrTablesReady(db) {
  return Boolean(
    db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='hr_staff_profiles'`).get()
  );
}

/**
 * @param {{ user: object; workspaceBranchId?: string; workspaceViewAll?: boolean }} req
 */
export function hrListScope(req) {
  const viewAll =
    Boolean(req.workspaceViewAll) && userHasPermission(req.user, 'hq.view_all_branches');
  const branchId = String(req.workspaceBranchId || '').trim() || DEFAULT_BRANCH_ID;
  return { viewAll, branchId };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ viewAll: boolean; branchId: string; includeUnassigned?: boolean }} scope
 * @param {{ includeInactive?: boolean }} [opts]
 */
export function listHrStaff(db, scope, opts = {}) {
  if (!hrTablesReady(db)) return [];
  const { viewAll, branchId, includeUnassigned } = scope;
  const includeInactive = Boolean(opts.includeInactive);

  let sql = `
    SELECT u.id AS userId, u.username, u.display_name AS displayName, u.email, u.role_key AS roleKey, u.status,
           p.branch_id AS branchId, p.employee_no AS employeeNo, p.job_title AS jobTitle, p.department,
           p.employment_type AS employmentType, p.date_joined_iso AS dateJoinedIso,
           p.base_salary_ngn AS baseSalaryNgn, p.housing_allowance_ngn AS housingAllowanceNgn,
           p.transport_allowance_ngn AS transportAllowanceNgn, p.minimum_qualification AS minimumQualification,
           p.academic_qualification AS academicQualification,
           p.promotion_grade AS promotionGrade, p.welfare_notes AS welfareNotes, p.training_summary AS trainingSummary,
           p.tax_id AS taxId, p.pension_rsa_pin AS pensionRsaPin, p.bank_name AS bankName,
           p.bank_account_name AS bankAccountName, p.bank_account_no_masked AS bankAccountNoMasked,
           p.bonus_accrual_note AS bonusAccrualNote,
           p.profile_extra_json AS profileExtraJson
    FROM app_users u
    LEFT JOIN hr_staff_profiles p ON p.user_id = u.id
    WHERE 1=1
  `;
  const args = [];
  if (!includeInactive) {
    sql += ` AND u.status = 'active'`;
  }
  if (!viewAll) {
    if (includeUnassigned) {
      sql += ` AND (p.branch_id = ? OR p.branch_id IS NULL)`;
      args.push(branchId);
    } else {
      sql += ` AND p.branch_id = ?`;
      args.push(branchId);
    }
  }
  sql += ` ORDER BY u.display_name ASC`;

  const rows = db.prepare(sql).all(...args);
  return rows.map((row) => ({
    ...row,
    profileExtra: safeJsonParse(row.profileExtraJson, {}),
    profileExtraJson: undefined,
  }));
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} userId
 */
export function getHrStaffOne(db, userId) {
  if (!hrTablesReady(db)) return null;
  const list = listHrStaff(
    db,
    { viewAll: true, branchId: DEFAULT_BRANCH_ID, includeUnassigned: true },
    { includeInactive: true }
  );
  return list.find((s) => s.userId === userId) ?? null;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ viewAll: boolean; branchId: string; includeUnassigned?: boolean }} scope
 * @param {{ includeInactive?: boolean }} listOpts
 */
export function listRecentDisciplinaryEvents(db, scope, listOpts = {}) {
  if (!hrTablesReady(db)) return [];
  const staff = listHrStaff(db, scope, listOpts);
  const out = [];
  for (const s of staff) {
    const ev = s.profileExtra?.disciplinaryEvents;
    if (!Array.isArray(ev)) continue;
    for (const e of ev) {
      out.push({
        ...e,
        staffUserId: s.userId,
        staffDisplayName: s.displayName,
        staffEmployeeNo: s.employeeNo,
      });
    }
  }
  out.sort((a, b) => String(b.createdAtIso || '').localeCompare(String(a.createdAtIso || '')));
  return out.slice(0, 150);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} userId
 * @param {{ kind?: string; dateIso?: string; summary?: string }} body
 * @param {string} actorUserId
 */
export function appendHrDisciplinaryEvent(db, userId, body, actorUserId) {
  if (!hrTablesReady(db)) return { ok: false, error: 'HR module not initialised.' };
  const row = db.prepare(`SELECT profile_extra_json FROM hr_staff_profiles WHERE user_id = ?`).get(userId);
  if (!row) return { ok: false, error: 'No HR employee file for this user.' };
  const extra = safeJsonParse(row.profile_extra_json, {});
  const events = Array.isArray(extra.disciplinaryEvents) ? extra.disciplinaryEvents : [];
  const kind = String(body?.kind || 'warning').trim();
  const summary = String(body?.summary || '').trim();
  if (summary.length < 3) return { ok: false, error: 'Summary must be at least 3 characters.' };
  const dateIso = String(body?.dateIso || '').trim().slice(0, 10) || nowIso().slice(0, 10);
  events.unshift({
    id: newId('HRD'),
    kind,
    dateIso,
    summary,
    recordedByUserId: actorUserId,
    createdAtIso: nowIso(),
  });
  extra.disciplinaryEvents = events;
  const now = nowIso();
  db.prepare(
    `UPDATE hr_staff_profiles SET profile_extra_json = ?, updated_at_iso = ?, updated_by_user_id = ? WHERE user_id = ?`
  ).run(JSON.stringify(extra), now, actorUserId, userId);
  return { ok: true, events };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} actorUserId
 * @param {object} body
 */
export function upsertHrStaffProfile(db, actorUserId, body) {
  if (!hrTablesReady(db)) return { ok: false, error: 'HR module not initialised.' };
  const userId = String(body?.userId || '').trim();
  if (!userId) return { ok: false, error: 'userId is required.' };
  const u = db.prepare(`SELECT id FROM app_users WHERE id = ? AND status = 'active'`).get(userId);
  if (!u) return { ok: false, error: 'User not found or inactive.' };

  const branchId = String(body?.branchId || '').trim() || DEFAULT_BRANCH_ID;
  const now = nowIso();
  const existing = db.prepare(`SELECT user_id FROM hr_staff_profiles WHERE user_id = ?`).get(userId);
  const prevExtraRow =
    existing &&
    body?.profileExtra === undefined &&
    db.prepare(`SELECT profile_extra_json FROM hr_staff_profiles WHERE user_id = ?`).get(userId);

  const row = {
    user_id: userId,
    branch_id: branchId,
    employee_no: String(body?.employeeNo ?? '').trim() || null,
    job_title: String(body?.jobTitle ?? '').trim() || null,
    department: String(body?.department ?? '').trim() || null,
    employment_type: String(body?.employmentType ?? '').trim() || null,
    date_joined_iso: String(body?.dateJoinedIso ?? '').trim() || null,
    probation_end_iso: String(body?.probationEndIso ?? '').trim() || null,
    bank_account_name: String(body?.bankAccountName ?? '').trim() || null,
    bank_name: String(body?.bankName ?? '').trim() || null,
    bank_account_no_masked: String(body?.bankAccountNoMasked ?? '').trim() || null,
    tax_id: String(body?.taxId ?? '').trim() || null,
    pension_rsa_pin: String(body?.pensionRsaPin ?? '').trim() || null,
    next_of_kin_json: body?.nextOfKin != null ? JSON.stringify(body.nextOfKin) : null,
    base_salary_ngn: Math.max(0, Math.round(Number(body?.baseSalaryNgn) || 0)),
    housing_allowance_ngn: Math.max(0, Math.round(Number(body?.housingAllowanceNgn) || 0)),
    transport_allowance_ngn: Math.max(0, Math.round(Number(body?.transportAllowanceNgn) || 0)),
    bonus_accrual_note: String(body?.bonusAccrualNote ?? '').trim() || null,
    minimum_qualification: String(body?.minimumQualification ?? '').trim() || null,
    academic_qualification: String(body?.academicQualification ?? '').trim() || null,
    promotion_grade: String(body?.promotionGrade ?? '').trim() || null,
    welfare_notes: String(body?.welfareNotes ?? '').trim() || null,
    training_summary: String(body?.trainingSummary ?? '').trim() || null,
    profile_extra_json:
      body?.profileExtra != null
        ? JSON.stringify(body.profileExtra)
        : prevExtraRow
          ? prevExtraRow.profile_extra_json
          : null,
    updated_at_iso: now,
    updated_by_user_id: actorUserId,
  };

  if (existing) {
    db.prepare(
      `UPDATE hr_staff_profiles SET
        branch_id=@branch_id, employee_no=@employee_no, job_title=@job_title, department=@department,
        employment_type=@employment_type, date_joined_iso=@date_joined_iso, probation_end_iso=@probation_end_iso,
        bank_account_name=@bank_account_name, bank_name=@bank_name, bank_account_no_masked=@bank_account_no_masked,
        tax_id=@tax_id, pension_rsa_pin=@pension_rsa_pin, next_of_kin_json=@next_of_kin_json,
        base_salary_ngn=@base_salary_ngn, housing_allowance_ngn=@housing_allowance_ngn,
        transport_allowance_ngn=@transport_allowance_ngn, bonus_accrual_note=@bonus_accrual_note,
        minimum_qualification=@minimum_qualification, academic_qualification=@academic_qualification,
        promotion_grade=@promotion_grade,
        welfare_notes=@welfare_notes, training_summary=@training_summary, profile_extra_json=@profile_extra_json,
        updated_at_iso=@updated_at_iso, updated_by_user_id=@updated_by_user_id
      WHERE user_id=@user_id`
    ).run(row);
  } else {
    db.prepare(
      `INSERT INTO hr_staff_profiles (
        user_id, branch_id, employee_no, job_title, department, employment_type, date_joined_iso, probation_end_iso,
        bank_account_name, bank_name, bank_account_no_masked, tax_id, pension_rsa_pin, next_of_kin_json,
        base_salary_ngn, housing_allowance_ngn, transport_allowance_ngn, bonus_accrual_note,
        minimum_qualification, academic_qualification, promotion_grade, welfare_notes, training_summary, profile_extra_json,
        updated_at_iso, updated_by_user_id
      ) VALUES (
        @user_id, @branch_id, @employee_no, @job_title, @department, @employment_type, @date_joined_iso, @probation_end_iso,
        @bank_account_name, @bank_name, @bank_account_no_masked, @tax_id, @pension_rsa_pin, @next_of_kin_json,
        @base_salary_ngn, @housing_allowance_ngn, @transport_allowance_ngn, @bonus_accrual_note,
        @minimum_qualification, @academic_qualification, @promotion_grade, @welfare_notes, @training_summary, @profile_extra_json,
        @updated_at_iso, @updated_by_user_id
      )`
    ).run(row);
  }
  return { ok: true, profile: getHrStaffOne(db, userId) };
}

/**
 * Bonus / welfare narrative on file (partial update — does not touch other profile columns).
 * @param {import('better-sqlite3').Database} db
 * @param {string} actorUserId
 * @param {string} userId
 * @param {string | null | undefined} note
 */
export function patchHrStaffBonusAccrualNote(db, actorUserId, userId, note) {
  if (!hrTablesReady(db)) return { ok: false, error: 'HR module not initialised.' };
  const uid = String(userId || '').trim();
  if (!uid) return { ok: false, error: 'userId is required.' };
  const exists = db.prepare(`SELECT user_id FROM hr_staff_profiles WHERE user_id = ?`).get(uid);
  if (!exists) return { ok: false, error: 'No HR employee file for this user.' };
  const now = nowIso();
  const v = note == null ? null : String(note).trim() || null;
  db.prepare(
    `UPDATE hr_staff_profiles SET bonus_accrual_note = ?, updated_at_iso = ?, updated_by_user_id = ? WHERE user_id = ?`
  ).run(v, now, actorUserId, uid);
  return { ok: true, profile: getHrStaffOne(db, uid) };
}

/**
 * Reference tax/pension (from payroll runs) + approved staff loans for welfare planning.
 * @param {import('better-sqlite3').Database} db
 * @param {{ viewAll: boolean; branchId: string }} scope
 */
export function salaryWelfareSnapshot(db, scope) {
  if (!hrTablesReady(db)) {
    return {
      ok: true,
      referenceRun: null,
      taxPercent: 7.5,
      pensionPercent: 8,
      approvedLoans: [],
    };
  }

  const draftRun = db
    .prepare(
      `SELECT id, period_yyyymm, tax_percent, pension_percent, status, notes, created_at_iso
       FROM hr_payroll_runs WHERE status = 'draft' ORDER BY created_at_iso DESC LIMIT 1`
    )
    .get();
  const latestRun =
    draftRun ||
    db
      .prepare(
        `SELECT id, period_yyyymm, tax_percent, pension_percent, status, notes, created_at_iso
         FROM hr_payroll_runs ORDER BY created_at_iso DESC LIMIT 1`
      )
      .get();

  const taxPercent =
    latestRun != null && Number(latestRun.tax_percent) >= 0 ? Number(latestRun.tax_percent) : 7.5;
  const pensionPercent =
    latestRun != null && Number(latestRun.pension_percent) >= 0 ? Number(latestRun.pension_percent) : 8;

  const referenceRun = latestRun
    ? {
        id: latestRun.id,
        periodYyyymm: latestRun.period_yyyymm,
        status: latestRun.status,
        taxPercent: Number(latestRun.tax_percent),
        pensionPercent: Number(latestRun.pension_percent),
        notes: latestRun.notes,
        createdAtIso: latestRun.created_at_iso,
        isDraft: latestRun.status === 'draft',
      }
    : null;

  let sql = `
    SELECT r.id, r.user_id, r.title, r.payload_json,
           COALESCE(r.manager_reviewed_at_iso, r.hr_reviewed_at_iso, r.created_at_iso) AS decided_at_iso,
           u.display_name AS staffDisplayName, u.username AS staffUsername,
           p.employee_no AS employeeNo
    FROM hr_requests r
    JOIN app_users u ON u.id = r.user_id
    LEFT JOIN hr_staff_profiles p ON p.user_id = r.user_id
    WHERE r.kind = 'loan' AND r.status = 'approved'`;
  const args = [];
  if (!scope.viewAll) {
    sql += ` AND r.branch_id = ?`;
    args.push(scope.branchId);
  }
  sql += ` ORDER BY decided_at_iso DESC LIMIT 200`;

  const rows = db.prepare(sql).all(...args);
  const approvedLoans = rows.map((row) => {
    const payload = safeJsonParse(row.payload_json, {});
    const disbursed = Boolean(payload.loanDisbursedAtIso);
    const monthsTotal = Math.round(Number(payload.repaymentMonths) || 0);
    const monthsDone = Math.round(Number(payload.loanMonthsDeducted) || 0);
    const principalOut = Number.isFinite(Number(payload.principalOutstandingNgn))
      ? Math.max(0, Math.round(Number(payload.principalOutstandingNgn)))
      : null;
    const deductionsActive = Boolean(
      payload.deductionsActive &&
        disbursed &&
        (monthsTotal <= 0 || monthsDone < monthsTotal) &&
        (principalOut === null || principalOut > 0)
    );
    const repaymentMonthsRemaining =
      monthsTotal > 0 ? Math.max(0, monthsTotal - monthsDone) : null;
    return {
      requestId: row.id,
      userId: row.user_id,
      title: row.title,
      staffDisplayName: row.staffDisplayName,
      staffUsername: row.staffUsername,
      employeeNo: row.employeeNo,
      amountNgn: Math.round(Number(payload.amountNgn) || 0),
      repaymentMonths: monthsTotal,
      deductionPerMonthNgn: Math.round(Number(payload.deductionPerMonthNgn) || 0),
      loanMonthsDeducted: monthsDone,
      repaymentMonthsRemaining,
      principalOutstandingNgn: principalOut,
      decidedAtIso: row.decided_at_iso,
      loanDisbursedAtIso: payload.loanDisbursedAtIso || null,
      loanRepaidByScheduleAtIso: payload.loanRepaidByScheduleAtIso || null,
      loanRepaidByPrincipalAtIso: payload.loanRepaidByPrincipalAtIso || null,
      loanClosedEarlyAtIso: payload.loanClosedEarlyAtIso || null,
      deductionsActive,
      pendingDisbursement: !disbursed,
      financePaymentRequestId: payload.financePaymentRequestId || null,
      disbursementQueueStatus: payload.disbursementQueueStatus || null,
      financeRejectionNote: payload.financeRejectionNote || null,
    };
  });

  return { ok: true, referenceRun, taxPercent, pensionPercent, approvedLoans };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ viewAll: boolean; branchId: string; canManage: boolean }} scope
 * @param {{ status?: string; userId?: string }} filter
 */
const HR_REQUEST_SEARCH_MAX = 200;

export function listHrRequests(db, scope, filter = {}) {
  if (!hrTablesReady(db)) return [];
  let sql = `
    SELECT r.*, u.display_name AS staffDisplayName, u.username AS staffUsername
    FROM hr_requests r
    JOIN app_users u ON u.id = r.user_id
    WHERE 1=1
  `;
  const args = [];
  if (!scope.viewAll) {
    sql += ` AND r.branch_id = ?`;
    args.push(scope.branchId);
  }
  if (filter.status) {
    sql += ` AND r.status = ?`;
    args.push(filter.status);
  }
  if (filter.userId) {
    sql += ` AND r.user_id = ?`;
    args.push(filter.userId);
  }
  if (filter.kind) {
    sql += ` AND r.kind = ?`;
    args.push(String(filter.kind).trim());
  }
  const rawSearch = String(filter.search || '').trim();
  if (rawSearch) {
    const clipped = rawSearch.slice(0, HR_REQUEST_SEARCH_MAX);
    const esc = clipped.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const term = `%${esc}%`;
    sql += ` AND (
      r.title LIKE ? ESCAPE '\\' OR IFNULL(r.body, '') LIKE ? ESCAPE '\\'
      OR u.display_name LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\'
    )`;
    args.push(term, term, term, term);
  }
  sql += ` ORDER BY r.created_at_iso DESC`;
  return db
    .prepare(sql)
    .all(...args)
    .map((row) => ({
      id: row.id,
      userId: row.user_id,
      branchId: row.branch_id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      payload: safeJsonParse(row.payload_json, {}),
      submittedAtIso: row.submitted_at_iso,
      hrReviewerUserId: row.hr_reviewer_user_id,
      hrReviewerNote: row.hr_reviewer_note,
      hrReviewedAtIso: row.hr_reviewed_at_iso,
      managerReviewerUserId: row.manager_reviewer_user_id,
      managerNote: row.manager_note,
      managerReviewedAtIso: row.manager_reviewed_at_iso,
      createdAtIso: row.created_at_iso,
      staffDisplayName: row.staffDisplayName,
      staffUsername: row.staffUsername,
    }));
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} userId
 * @param {object} body
 */
export function createHrRequest(db, userId, body) {
  if (!hrTablesReady(db)) return { ok: false, error: 'HR module not initialised.' };
  const kind = String(body?.kind || '').trim();
  if (!REQUEST_KINDS.has(kind)) return { ok: false, error: 'Invalid request kind.' };
  const title = String(body?.title || '').trim();
  if (title.length < 2) return { ok: false, error: 'Title is required.' };
  const prof = db.prepare(`SELECT branch_id FROM hr_staff_profiles WHERE user_id = ?`).get(userId);
  const branchId = prof?.branch_id || DEFAULT_BRANCH_ID;
  const id = newId('HRR');
  const now = nowIso();
  db.prepare(
    `INSERT INTO hr_requests (
      id, user_id, branch_id, kind, status, title, body, payload_json, created_at_iso
    ) VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    userId,
    branchId,
    kind,
    'draft',
    title,
    String(body?.body ?? '').trim() || null,
    body?.payload != null ? JSON.stringify(body.payload) : null,
    now
  );
  const reqRow = listHrRequests(db, { viewAll: true, branchId: DEFAULT_BRANCH_ID }, {}).find((r) => r.id === id);
  return { ok: true, request: reqRow };
}

export function submitHrRequest(db, requestId, userId) {
  if (!hrTablesReady(db)) return { ok: false, error: 'HR module not initialised.' };
  const row = db.prepare(`SELECT * FROM hr_requests WHERE id = ?`).get(requestId);
  if (!row || row.user_id !== userId) return { ok: false, error: 'Request not found.' };
  if (row.status !== 'draft') return { ok: false, error: 'Only draft requests can be submitted.' };
  const now = nowIso();
  db.prepare(
    `UPDATE hr_requests SET status = 'hr_review', submitted_at_iso = ? WHERE id = ?`
  ).run(now, requestId);
  return { ok: true };
}

export function hrReviewRequest(db, requestId, actor, approve, note) {
  if (!hrTablesReady(db)) return { ok: false, error: 'HR module not initialised.' };
  const row = db.prepare(`SELECT * FROM hr_requests WHERE id = ?`).get(requestId);
  if (!row) return { ok: false, error: 'Request not found.' };
  if (row.status !== 'hr_review') {
    return { ok: false, error: 'Request is not awaiting HR review.' };
  }
  const now = nowIso();
  if (!approve) {
    db.prepare(
      `UPDATE hr_requests SET status = 'rejected', hr_reviewer_user_id = ?, hr_reviewer_note = ?, hr_reviewed_at_iso = ? WHERE id = ?`
    ).run(actor.id, String(note || '').trim() || null, now, requestId);
    return { ok: true };
  }
  db.prepare(
    `UPDATE hr_requests SET status = 'manager_review', hr_reviewer_user_id = ?, hr_reviewer_note = ?, hr_reviewed_at_iso = ? WHERE id = ?`
  ).run(actor.id, String(note || '').trim() || null, now, requestId);
  return { ok: true };
}

export function managerReviewRequest(db, requestId, actor, approve, note) {
  if (!hrTablesReady(db)) return { ok: false, error: 'HR module not initialised.' };
  const row = db.prepare(`SELECT * FROM hr_requests WHERE id = ?`).get(requestId);
  if (!row) return { ok: false, error: 'Request not found.' };
  if (row.status !== 'manager_review') {
    return { ok: false, error: 'Request is not awaiting executive approval.' };
  }
  const now = nowIso();
  if (!approve) {
    db.prepare(
      `UPDATE hr_requests SET status = 'rejected', manager_reviewer_user_id = ?, manager_note = ?, manager_reviewed_at_iso = ? WHERE id = ?`
    ).run(actor.id, String(note || '').trim() || null, now, requestId);
    return { ok: true };
  }
  const isLoan = String(row.kind) === 'loan';
  if (isLoan) {
    try {
      db.transaction(() => {
        db.prepare(
          `UPDATE hr_requests SET status = 'approved', manager_reviewer_user_id = ?, manager_note = ?, manager_reviewed_at_iso = ? WHERE id = ?`
        ).run(actor.id, String(note || '').trim() || null, now, requestId);
        const refreshed = db.prepare(`SELECT * FROM hr_requests WHERE id = ?`).get(requestId);
        const prov = provisionStaffLoanForFinanceQueue(db, actor, refreshed);
        if (!prov.ok) throw new Error(prov.error);
      })();
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
    return { ok: true };
  }
  db.prepare(
    `UPDATE hr_requests SET status = 'approved', manager_reviewer_user_id = ?, manager_note = ?, manager_reviewed_at_iso = ? WHERE id = ?`
  ).run(actor.id, String(note || '').trim() || null, now, requestId);
  return { ok: true };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {object} actor
 * @param {{ branchId: string; periodYyyymm: string; notes?: string; rows: object[] }} body
 */
export function uploadHrAttendance(db, actor, body) {
  if (!hrTablesReady(db)) return { ok: false, error: 'HR module not initialised.' };
  const branchId = String(body?.branchId || '').trim();
  const periodYyyymm = String(body?.periodYyyymm || '').trim().replace(/\D/g, '').slice(0, 6);
  if (!/^\d{6}$/.test(periodYyyymm)) return { ok: false, error: 'periodYyyymm must be YYYYMM (e.g. 202603).' };
  if (!branchId) return { ok: false, error: 'branchId is required.' };
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) return { ok: false, error: 'rows must be a non-empty array.' };
  const id = newId('HRA');
  const now = nowIso();
  db.prepare(
    `INSERT INTO hr_attendance_uploads (id, branch_id, period_yyyymm, uploaded_by_user_id, notes, rows_json, created_at_iso)
     VALUES (?,?,?,?,?,?,?)`
  ).run(
    id,
    branchId,
    periodYyyymm,
    actor.id,
    String(body?.notes ?? '').trim() || null,
    JSON.stringify(rows),
    now
  );
  return { ok: true, id };
}

export function listHrAttendance(db, scope) {
  if (!hrTablesReady(db)) return [];
  let sql = `SELECT * FROM hr_attendance_uploads WHERE 1=1`;
  const args = [];
  if (!scope.viewAll) {
    sql += ` AND branch_id = ?`;
    args.push(scope.branchId);
  }
  sql += ` ORDER BY created_at_iso DESC LIMIT 200`;
  return db.prepare(sql).all(...args).map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    periodYyyymm: row.period_yyyymm,
    uploadedByUserId: row.uploaded_by_user_id,
    notes: row.notes,
    rows: safeJsonParse(row.rows_json, []),
    createdAtIso: row.created_at_iso,
  }));
}

/**
 * Attendance effect: absent days deduct (base/22) per working month assumption.
 */
/**
 * Staff loans that deduct this payroll period (disbursed, active, within repayment term).
 * @returns {{ total: number; loans: { hrRequestId: string; amountNgn: number; title: string }[] }}
 */
function activeStaffLoanBreakdown(db, userId) {
  const rows = db
    .prepare(`SELECT id, title, payload_json FROM hr_requests WHERE user_id = ? AND kind = 'loan' AND status = 'approved'`)
    .all(userId);
  const loans = [];
  for (const r of rows) {
    const p = safeJsonParse(r.payload_json, {});
    if (!p.deductionsActive || !p.loanDisbursedAtIso) continue;
    const monthsTotal = Math.round(Number(p.repaymentMonths) || 0);
    const cur = Math.round(Number(p.loanMonthsDeducted) || 0);
    if (monthsTotal > 0 && cur >= monthsTotal) continue;
    const principalRaw = p.principalOutstandingNgn;
    const trackedPrincipal = Number.isFinite(Number(principalRaw));
    if (trackedPrincipal && Math.round(Number(principalRaw)) <= 0) continue;
    let amountNgn = Math.round(Number(p.deductionPerMonthNgn) || 0);
    if (amountNgn <= 0) continue;
    if (trackedPrincipal && Math.round(Number(principalRaw)) > 0) {
      amountNgn = Math.min(amountNgn, Math.max(0, Math.round(Number(principalRaw))));
    }
    if (amountNgn <= 0) continue;
    loans.push({
      hrRequestId: r.id,
      amountNgn,
      title: String(r.title || '').trim() || r.id,
    });
  }
  const total = loans.reduce((s, x) => s + x.amountNgn, 0);
  return { total, loans };
}

function settleLoanAfterPayrollDeduction(db, loanId, userId, deductedNgn) {
  const loan = db
    .prepare(`SELECT id, payload_json FROM hr_requests WHERE id = ? AND user_id = ? AND kind = 'loan' AND status = 'approved'`)
    .get(loanId, userId);
  if (!loan) return;
  const p = safeJsonParse(loan.payload_json, {});
  if (!p.deductionsActive || !p.loanDisbursedAtIso) return;
  const ded = Math.max(0, Math.round(Number(deductedNgn) || 0));
  const merged = { ...p };

  const monthsTotal = Math.round(Number(p.repaymentMonths) || 0);
  if (monthsTotal > 0) {
    const cur = Math.round(Number(p.loanMonthsDeducted) || 0);
    if (cur < monthsTotal) {
      const nextCount = cur + 1;
      merged.loanMonthsDeducted = nextCount;
      if (nextCount >= monthsTotal) {
        merged.deductionsActive = false;
        merged.loanRepaidByScheduleAtIso = new Date().toISOString().slice(0, 10);
      }
    }
  }

  const prRaw = p.principalOutstandingNgn;
  if (Number.isFinite(Number(prRaw)) && Number(prRaw) > 0 && ded > 0) {
    const nextPr = Math.max(0, Math.round(Number(prRaw)) - ded);
    merged.principalOutstandingNgn = nextPr;
    if (nextPr <= 0) {
      merged.deductionsActive = false;
      merged.loanRepaidByPrincipalAtIso = new Date().toISOString().slice(0, 10);
    }
  }

  db.prepare(`UPDATE hr_requests SET payload_json = ? WHERE id = ?`).run(JSON.stringify(merged), loan.id);
}

/**
 * When a payroll run is marked paid: count repayment months (if a term is set) and reduce principal by each
 * loan line’s deducted amount (`hr_payroll_line_loans.amount_ngn`).
 */
function incrementLoanMonthsFromPayrollRun(db, runId) {
  const items = db
    .prepare(`SELECT user_id, hr_request_id, amount_ngn FROM hr_payroll_line_loans WHERE run_id = ? AND amount_ngn > 0`)
    .all(runId);
  for (const item of items) {
    settleLoanAfterPayrollDeduction(db, item.hr_request_id, item.user_id, item.amount_ngn);
  }
}

function attendanceDeductionForUser(db, userId, branchId, periodYyyymm) {
  const upload = db
    .prepare(
      `SELECT rows_json FROM hr_attendance_uploads WHERE branch_id = ? AND period_yyyymm = ? ORDER BY created_at_iso DESC LIMIT 1`
    )
    .get(branchId, periodYyyymm);
  if (!upload) return { absentDays: 0, deductionNgn: 0 };
  const rows = safeJsonParse(upload.rows_json, []);
  const hit = rows.find((r) => String(r?.userId || '').trim() === userId);
  if (!hit) return { absentDays: 0, deductionNgn: 0 };
  const absentDays = Math.max(0, Math.round(Number(hit.absentDays) || 0));
  const prof = db.prepare(`SELECT base_salary_ngn FROM hr_staff_profiles WHERE user_id = ?`).get(userId);
  const base = Math.round(Number(prof?.base_salary_ngn) || 0);
  const daily = base > 0 ? Math.round(base / 22) : 0;
  return { absentDays, deductionNgn: absentDays * daily };
}

export function createPayrollRun(db, actor, body) {
  if (!hrTablesReady(db)) return { ok: false, error: 'HR module not initialised.' };
  const periodYyyymm = String(body?.periodYyyymm || '').trim().replace(/\D/g, '').slice(0, 6);
  if (!/^\d{6}$/.test(periodYyyymm)) return { ok: false, error: 'periodYyyymm must be YYYYMM.' };
  const id = newId('HRP');
  const now = nowIso();
  db.prepare(
    `INSERT INTO hr_payroll_runs (id, period_yyyymm, status, tax_percent, pension_percent, notes, created_at_iso, created_by_user_id)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(
    id,
    periodYyyymm,
    'draft',
    Number(body?.taxPercent) >= 0 ? Number(body.taxPercent) : 7.5,
    Number(body?.pensionPercent) >= 0 ? Number(body.pensionPercent) : 8,
    String(body?.notes ?? '').trim() || null,
    now,
    actor.id
  );
  return { ok: true, id };
}

export function computePayrollRun(db, runId) {
  if (!hrTablesReady(db)) return { ok: false, error: 'HR module not initialised.' };
  const run = db.prepare(`SELECT * FROM hr_payroll_runs WHERE id = ?`).get(runId);
  if (!run) return { ok: false, error: 'Payroll run not found.' };
  if (run.status !== 'draft') return { ok: false, error: 'Only draft runs can be recomputed.' };
  const period = run.period_yyyymm;
  const taxP = Number(run.tax_percent) || 0;
  const penP = Number(run.pension_percent) || 0;

  db.prepare(`DELETE FROM hr_payroll_line_loans WHERE run_id = ?`).run(runId);
  db.prepare(`DELETE FROM hr_payroll_lines WHERE run_id = ?`).run(runId);

  const staff = db
    .prepare(
      `SELECT p.user_id, p.branch_id, p.base_salary_ngn, p.housing_allowance_ngn, p.transport_allowance_ngn
       FROM hr_staff_profiles p
       JOIN app_users u ON u.id = p.user_id AND u.status = 'active'`
    )
    .all();

  const ins = db.prepare(
    `INSERT INTO hr_payroll_lines (
      run_id, user_id, gross_ngn, bonus_ngn, attendance_deduction_ngn, other_deduction_ngn, tax_ngn, pension_ngn, net_ngn
    ) VALUES (?,?,?,?,?,?,?,?,?)`
  );
  const insLoan = db.prepare(
    `INSERT INTO hr_payroll_line_loans (
      run_id, user_id, hr_request_id, period_yyyymm, amount_ngn, loan_title, computed_at_iso
    ) VALUES (?,?,?,?,?,?,?)`
  );
  const computedAt = nowIso();

  for (const s of staff) {
    const base = Math.round(Number(s.base_salary_ngn) || 0);
    const housing = Math.round(Number(s.housing_allowance_ngn) || 0);
    const transport = Math.round(Number(s.transport_allowance_ngn) || 0);
    const bonus = 0;
    const { deductionNgn } = attendanceDeductionForUser(db, s.user_id, s.branch_id, period);
    const gross = base + housing + transport + bonus - deductionNgn;
    const tax = Math.round((gross * taxP) / 100);
    const pension = Math.round((gross * penP) / 100);
    const { total: other, loans: loanParts } = activeStaffLoanBreakdown(db, s.user_id);
    const net = gross - tax - pension - other;
    ins.run(runId, s.user_id, gross, bonus, deductionNgn, other, tax, pension, net);
    for (const ln of loanParts) {
      insLoan.run(runId, s.user_id, ln.hrRequestId, period, ln.amountNgn, ln.title, computedAt);
    }
  }
  return { ok: true };
}

const PAYROLL_RUN_STATUSES = new Set(['draft', 'locked', 'paid']);

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} runId
 * @param {{ status?: string; taxPercent?: number; pensionPercent?: number; notes?: string | null }} body
 */
export function patchPayrollRun(db, runId, body) {
  if (!hrTablesReady(db)) return { ok: false, error: 'HR module not initialised.' };
  const run = db.prepare(`SELECT * FROM hr_payroll_runs WHERE id = ?`).get(runId);
  if (!run) return { ok: false, error: 'Payroll run not found.' };

  if (body?.status != null) {
    const ns = String(body.status).trim().toLowerCase();
    if (!PAYROLL_RUN_STATUSES.has(ns)) return { ok: false, error: 'Invalid status.' };
    if (run.status === 'paid' && ns !== 'paid') {
      return { ok: false, error: 'Paid runs cannot be changed to another status here.' };
    }
    // Policy: locked → draft is allowed (unlock for corrections + recompute). Paid is terminal.
    if (ns === 'draft' && run.status !== 'locked' && run.status !== 'draft') {
      return { ok: false, error: 'Only a locked run can be returned to draft.' };
    }
    const wasPaid = run.status === 'paid';
    db.prepare(`UPDATE hr_payroll_runs SET status = ? WHERE id = ?`).run(ns, runId);
    if (ns === 'paid' && !wasPaid) {
      incrementLoanMonthsFromPayrollRun(db, runId);
    }
    return { ok: true };
  }

  if (run.status !== 'draft') {
    return { ok: false, error: 'Only draft runs can edit tax, pension, or notes.' };
  }
  if (body?.taxPercent != null || body?.pensionPercent != null) {
    const t = body?.taxPercent != null ? Number(body.taxPercent) : Number(run.tax_percent);
    const p = body?.pensionPercent != null ? Number(body.pensionPercent) : Number(run.pension_percent);
    db.prepare(`UPDATE hr_payroll_runs SET tax_percent = ?, pension_percent = ? WHERE id = ?`).run(t, p, runId);
  }
  if (body?.notes !== undefined) {
    db.prepare(`UPDATE hr_payroll_runs SET notes = ? WHERE id = ?`).run(
      String(body.notes ?? '').trim() || null,
      runId
    );
  }
  return { ok: true };
}

export function listPayrollRuns(db) {
  if (!hrTablesReady(db)) return [];
  return db
    .prepare(`SELECT * FROM hr_payroll_runs ORDER BY created_at_iso DESC LIMIT 100`)
    .all()
    .map((row) => ({
      id: row.id,
      periodYyyymm: row.period_yyyymm,
      status: row.status,
      taxPercent: row.tax_percent,
      pensionPercent: row.pension_percent,
      notes: row.notes,
      createdAtIso: row.created_at_iso,
      createdByUserId: row.created_by_user_id,
    }));
}

export function listPayrollLines(db, runId) {
  if (!hrTablesReady(db)) return [];
  const loanRows = db
    .prepare(
      `SELECT user_id, hr_request_id, amount_ngn, loan_title FROM hr_payroll_line_loans WHERE run_id = ?`
    )
    .all(runId);
  const loansByUser = new Map();
  for (const lr of loanRows) {
    const uid = lr.user_id;
    if (!loansByUser.has(uid)) loansByUser.set(uid, []);
    loansByUser.get(uid).push({
      hrRequestId: lr.hr_request_id,
      amountNgn: lr.amount_ngn,
      title: lr.loan_title || lr.hr_request_id,
    });
  }
  return db
    .prepare(
      `SELECT l.*, u.display_name AS displayName
       FROM hr_payroll_lines l
       JOIN app_users u ON u.id = l.user_id
       WHERE l.run_id = ?
       ORDER BY u.display_name ASC`
    )
    .all(runId)
    .map((row) => ({
      userId: row.user_id,
      displayName: row.displayName,
      grossNgn: row.gross_ngn,
      bonusNgn: row.bonus_ngn,
      attendanceDeductionNgn: row.attendance_deduction_ngn,
      otherDeductionNgn: row.other_deduction_ngn,
      taxNgn: row.tax_ngn,
      pensionNgn: row.pension_ngn,
      netNgn: row.net_ngn,
      loanDeductions: loansByUser.get(row.user_id) || [],
    }));
}

export function getPayrollRunById(db, runId) {
  if (!hrTablesReady(db)) return null;
  const row = db.prepare(`SELECT * FROM hr_payroll_runs WHERE id = ?`).get(runId);
  if (!row) return null;
  return {
    id: row.id,
    periodYyyymm: row.period_yyyymm,
    status: row.status,
    taxPercent: Number(row.tax_percent),
    pensionPercent: Number(row.pension_percent),
    notes: row.notes,
    createdAtIso: row.created_at_iso,
    createdByUserId: row.created_by_user_id,
  };
}

/**
 * CSV for finance / treasury: net pay per employee, loan split, totals. Allowed when run is locked or paid.
 */
export function exportPayrollTreasuryPackCsv(db, runId) {
  const run = getPayrollRunById(db, runId);
  if (!run) return { ok: false, error: 'Payroll run not found.' };
  if (run.status !== 'locked' && run.status !== 'paid') {
    return { ok: false, error: 'Lock or mark this run paid before treasury export.' };
  }
  const lines = listPayrollLines(db, runId);
  const headers = [
    'period_yyyymm',
    'run_id',
    'run_status',
    'user_id',
    'display_name',
    'gross_ngn',
    'attendance_deduction_ngn',
    'other_deduction_ngn',
    'staff_loan_detail',
    'tax_ngn',
    'pension_ngn',
    'net_ngn',
  ];
  const esc = (v) => {
    const t = String(v ?? '');
    if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
    return t;
  };
  const rows = lines.map((l) => {
    const br = (l.loanDeductions || []).map((x) => `${x.hrRequestId}:${x.amountNgn}`).join(';');
    return [
      run.periodYyyymm,
      run.id,
      run.status,
      l.userId,
      l.displayName,
      l.grossNgn,
      l.attendanceDeductionNgn,
      l.otherDeductionNgn,
      br,
      l.taxNgn,
      l.pensionNgn,
      l.netNgn,
    ].map(esc);
  });
  let sumNet = 0;
  let sumOther = 0;
  for (const l of lines) {
    sumNet += Math.round(Number(l.netNgn) || 0);
    sumOther += Math.round(Number(l.otherDeductionNgn) || 0);
  }
  const summaryRow = [
    run.periodYyyymm,
    run.id,
    run.status,
    '',
    'TOTALS',
    '',
    '',
    sumOther,
    '',
    '',
    '',
    sumNet,
  ].map(esc);
  const csv = [headers.join(','), ...rows.map((r) => r.join(',')), summaryRow.join(',')].join('\r\n');
  return {
    ok: true,
    csv,
    filename: `treasury-payroll-${run.periodYyyymm}-${String(run.id).replace(/[^\w-]/g, '').slice(0, 12)}.csv`,
  };
}

/**
 * Close a loan early or adjust repayment terms (post-disbursement). Audited in HTTP layer.
 * @param {import('better-sqlite3').Database} db
 * @param {string} requestId
 * @param {string} actorUserId
 * @param {{ closeLoan?: boolean; note?: string | null; deductionPerMonthNgn?: number; repaymentMonths?: number; principalOutstandingNgn?: number }} body
 */
export function patchHrLoanMaintenance(db, requestId, actorUserId, body) {
  if (!hrTablesReady(db)) return { ok: false, error: 'HR module not initialised.' };
  const row = db.prepare(`SELECT * FROM hr_requests WHERE id = ?`).get(requestId);
  if (!row) return { ok: false, error: 'Request not found.' };
  if (String(row.kind) !== 'loan' || row.status !== 'approved') {
    return { ok: false, error: 'Only approved loan requests can be maintained.' };
  }
  const p = safeJsonParse(row.payload_json, {});
  if (!p.loanDisbursedAtIso) return { ok: false, error: 'Loan is not disbursed yet.' };
  const merged = { ...p };
  const nowDay = nowIso().slice(0, 10);
  if (body?.closeLoan === true) {
    merged.deductionsActive = false;
    merged.principalOutstandingNgn = 0;
    merged.loanClosedEarlyAtIso = nowDay;
    merged.loanMaintenanceNote = String(body.note ?? '').trim() || null;
    merged.loanMaintenanceByUserId = actorUserId;
    merged.loanMaintenanceAtIso = nowIso();
  } else {
    if (body?.deductionPerMonthNgn != null) {
      merged.deductionPerMonthNgn = Math.max(0, Math.round(Number(body.deductionPerMonthNgn) || 0));
    }
    if (body?.repaymentMonths != null) {
      merged.repaymentMonths = Math.max(0, Math.round(Number(body.repaymentMonths) || 0));
    }
    if (body?.principalOutstandingNgn != null) {
      merged.principalOutstandingNgn = Math.max(0, Math.round(Number(body.principalOutstandingNgn) || 0));
    }
    merged.loanMaintenanceNote = String(body.note ?? '').trim() || null;
    merged.loanMaintenanceByUserId = actorUserId;
    merged.loanMaintenanceAtIso = nowIso();
  }
  db.prepare(`UPDATE hr_requests SET payload_json = ? WHERE id = ?`).run(JSON.stringify(merged), requestId);
  return { ok: true };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {object} actor
 * @param {{ userId: string; letterKind?: string }} body
 */
export function generateEmploymentLetter(db, actor, body) {
  if (!hrTablesReady(db)) return { ok: false, error: 'HR module not initialised.' };
  const userId = String(body?.userId || '').trim();
  if (!userId) return { ok: false, error: 'userId is required.' };
  const u = db.prepare(`SELECT display_name, username FROM app_users WHERE id = ?`).get(userId);
  if (!u) return { ok: false, error: 'User not found.' };
  const p = db.prepare(`SELECT * FROM hr_staff_profiles WHERE user_id = ?`).get(userId);
  const jobTitle = p?.job_title || 'Staff';
  const dept = p?.department || 'General';
  const joined = p?.date_joined_iso || 'TBD';
  const company = 'Zarewa Aluminium and Plastics Ltd';
  const content = [
    `${company}`,
    '',
    `Date: ${nowIso().slice(0, 10)}`,
    '',
    `TO WHOM IT MAY CONCERN`,
    '',
    `RE: Letter of employment — ${u.display_name}`,
    '',
    `This is to certify that ${u.display_name} (${u.username}) is employed with ${company} as ${jobTitle} in ${dept}, effective from ${joined}.`,
    '',
    `This letter is issued at the request of the employee for official use.`,
    '',
    `Yours faithfully,`,
    `${actor.displayName || actor.username || 'HR'}`,
    `Human Resources (HQ)`,
  ].join('\n');

  const id = newId('HRL');
  const now = nowIso();
  db.prepare(
    `INSERT INTO hr_employment_letters (id, user_id, letter_kind, content_text, issued_at_iso, issued_by_user_id)
     VALUES (?,?,?,?,?,?)`
  ).run(id, userId, String(body?.letterKind || 'employment').trim() || 'employment', content, now, actor.id);
  return { ok: true, id, contentText: content };
}

export function listEmploymentLetters(db, userId) {
  if (!hrTablesReady(db)) return [];
  let sql = `SELECT * FROM hr_employment_letters WHERE 1=1`;
  const args = [];
  if (userId) {
    sql += ` AND user_id = ?`;
    args.push(userId);
  }
  sql += ` ORDER BY issued_at_iso DESC LIMIT 100`;
  return db
    .prepare(sql)
    .all(...args)
    .map((row) => ({
      id: row.id,
      userId: row.user_id,
      letterKind: row.letter_kind,
      contentText: row.content_text,
      issuedAtIso: row.issued_at_iso,
      issuedByUserId: row.issued_by_user_id,
    }));
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} userId
 */
export function getHrMeProfile(db, userId) {
  const u = db
    .prepare(
      `SELECT id, username, display_name, email, role_key, status, avatar_url FROM app_users WHERE id = ?`
    )
    .get(userId);
  if (!u) return { user: null, hr: null };
  const user = {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    email: u.email,
    roleKey: u.role_key,
    roleLabel: roleLabel(u.role_key),
    status: u.status,
    avatarUrl: u.avatar_url,
  };
  if (!hrTablesReady(db)) return { user, hr: null };
  const p = db.prepare(`SELECT * FROM hr_staff_profiles WHERE user_id = ?`).get(userId);
  if (!p) return { user, hr: null };
  const hr = {
    branchId: p.branch_id,
    employeeNo: p.employee_no,
    jobTitle: p.job_title,
    department: p.department,
    employmentType: p.employment_type,
    dateJoinedIso: p.date_joined_iso,
    probationEndIso: p.probation_end_iso,
    bankAccountName: p.bank_account_name,
    bankName: p.bank_name,
    bankAccountNoMasked: p.bank_account_no_masked,
    taxId: p.tax_id,
    pensionRsaPin: p.pension_rsa_pin,
    baseSalaryNgn: p.base_salary_ngn,
    housingAllowanceNgn: p.housing_allowance_ngn,
    transportAllowanceNgn: p.transport_allowance_ngn,
    minimumQualification: p.minimum_qualification,
    academicQualification: p.academic_qualification,
    promotionGrade: p.promotion_grade,
    welfareNotes: p.welfare_notes,
    trainingSummary: p.training_summary,
    bonusAccrualNote: p.bonus_accrual_note,
    nextOfKin: safeJsonParse(p.next_of_kin_json, null),
    profileExtra: safeJsonParse(p.profile_extra_json, {}),
  };
  return { user, hr };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} actorUserId
 * @param {object} body
 */
/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} userId
 * @param {'active' | 'inactive'} status
 * @param {string} actorUserId
 */
export function setAppUserAccountStatus(db, userId, status, actorUserId) {
  const s = String(status || '').trim().toLowerCase();
  if (s !== 'active' && s !== 'inactive') {
    return { ok: false, error: 'Status must be active or inactive.' };
  }
  if (userId === actorUserId) {
    return { ok: false, error: 'You cannot change your own account status.' };
  }
  const row = db.prepare(`SELECT id FROM app_users WHERE id = ?`).get(userId);
  if (!row) return { ok: false, error: 'User not found.' };
  db.prepare(`UPDATE app_users SET status = ? WHERE id = ?`).run(s, userId);
  return { ok: true };
}

export function deleteHrRequestDraft(db, requestId, userId) {
  if (!hrTablesReady(db)) return { ok: false, error: 'HR module not initialised.' };
  const row = db.prepare(`SELECT * FROM hr_requests WHERE id = ?`).get(requestId);
  if (!row) return { ok: false, error: 'Request not found.' };
  if (row.user_id !== userId) return { ok: false, error: 'Not your request.' };
  if (row.status !== 'draft') return { ok: false, error: 'Only drafts can be deleted.' };
  db.prepare(`DELETE FROM hr_requests WHERE id = ?`).run(requestId);
  return { ok: true };
}

export function registerNewStaffWithProfile(db, actorUserId, body) {
  if (!hrTablesReady(db)) return { ok: false, error: 'HR module not initialised.' };
  const created = createAppUserRecord(db, {
    username: body.username,
    displayName: body.displayName,
    password: body.password,
    roleKey: body.roleKey,
  });
  if (!created.ok) return created;
  const up = upsertHrStaffProfile(db, actorUserId, {
    userId: created.userId,
    branchId: String(body?.branchId || '').trim() || DEFAULT_BRANCH_ID,
    employeeNo: body?.employeeNo,
    jobTitle: body?.jobTitle,
    department: body?.department,
    employmentType: body?.employmentType || 'permanent',
    dateJoinedIso: body?.dateJoinedIso,
    baseSalaryNgn: body?.baseSalaryNgn ?? 0,
    housingAllowanceNgn: body?.housingAllowanceNgn ?? 0,
    transportAllowanceNgn: body?.transportAllowanceNgn ?? 0,
    minimumQualification: body?.minimumQualification,
    academicQualification: body?.academicQualification,
  });
  if (!up.ok) return up;
  return { ok: true, userId: created.userId, profile: up.profile };
}

/**
 * Seed default profiles so payroll and branch filters work on demo DBs.
 * @param {import('better-sqlite3').Database} db
 */
export function seedHrIfEmpty(db) {
  if (!hrTablesReady(db)) return;
  const c = db.prepare(`SELECT COUNT(*) AS c FROM hr_staff_profiles`).get().c;
  if (c > 0) return;
  const now = nowIso();
  const users = db.prepare(`SELECT id, username FROM app_users WHERE status = 'active'`).all();
  const ins = db.prepare(
    `INSERT INTO hr_staff_profiles (
      user_id, branch_id, employee_no, job_title, department, employment_type, date_joined_iso,
      base_salary_ngn, housing_allowance_ngn, transport_allowance_ngn, minimum_qualification, promotion_grade,
      updated_at_iso, updated_by_user_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  for (const u of users) {
    const branch = u.username === 'branch.manager' ? 'BR-YOL' : 'BR-KAD';
    const no = `EMP-${String(u.id).replace(/\W/g, '').slice(-6).toUpperCase()}`;
    ins.run(
      u.id,
      branch,
      no,
      'Team member',
      'Operations',
      'permanent',
      '2024-01-15',
      250_000,
      40_000,
      20_000,
      'Role-aligned minimum (see HR manual)',
      'Grade TBD',
      now,
      null
    );
  }
  const leaveDemo = JSON.stringify({
    leaveRecord: {
      periodYear: new Date().getFullYear().toString(),
      annualEntitlementDays: 21,
      daysUsedApproved: 4,
      personnelFileRef: 'HR-PF-DEMO (sample — HR replaces with your file ref)',
    },
  });
  db.prepare(`UPDATE hr_staff_profiles SET profile_extra_json = ? WHERE profile_extra_json IS NULL`).run(leaveDemo);
}
