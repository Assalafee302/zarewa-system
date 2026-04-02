import { actorId, actorName } from './auth.js';

function nextControlId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function roundMoney(value) {
  return Math.round(Number(value) || 0);
}

function nowIso() {
  return new Date().toISOString();
}

function parseJsonValue(value) {
  try {
    return JSON.parse(value || 'null');
  } catch {
    return null;
  }
}

function quotedMetersFromQuotationLines(linesJson) {
  let payload = linesJson;
  if (typeof payload === 'string') {
    payload = parseJsonValue(payload);
  }
  const rows = payload?.products;
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum, line) => sum + (Number(line?.qty) || 0), 0);
}

function quotedAmountPerMeter(linesJson) {
  let payload = linesJson;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = null;
    }
  }
  const rows = payload?.products;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const productRows = rows.filter((line) => Number(line?.qty) > 0 && Number(line?.unitPrice) > 0);
  const totalMeters = productRows.reduce((sum, line) => sum + (Number(line?.qty) || 0), 0);
  if (totalMeters <= 0) return null;
  const totalValue = productRows.reduce(
    (sum, line) => sum + (Number(line?.qty) || 0) * (Number(line?.unitPrice) || 0),
    0
  );
  return totalValue > 0 ? totalValue / totalMeters : null;
}

export function periodKeyFromDate(dateISO) {
  const raw = String(dateISO || '').trim();
  const base = raw || nowIso().slice(0, 10);
  const [year, month] = base.split('-');
  return `${year}-${month || '01'}`;
}

export function appendAuditLog(db, payload) {
  const id = nextControlId('AUD');
  const occurredAtISO = payload.occurredAtISO || nowIso();
  db.prepare(
    `INSERT INTO audit_log (
      id, occurred_at_iso, actor_user_id, actor_name, action, entity_kind, entity_id, status, note, details_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    occurredAtISO,
    actorId(payload.actor),
    actorName(payload.actor),
    payload.action,
    payload.entityKind ?? null,
    payload.entityId ?? null,
    payload.status ?? 'success',
    payload.note ?? '',
    payload.details ? JSON.stringify(payload.details) : null
  );
  return id;
}

export function recordApprovalAction(db, payload) {
  const id = nextControlId('APR');
  const actedAtISO = payload.actedAtISO || nowIso();
  db.prepare(
    `INSERT INTO approval_actions (
      id, entity_kind, entity_id, action, status, note, acted_at_iso, acted_by_user_id, acted_by_name
    ) VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    payload.entityKind,
    payload.entityId,
    payload.action,
    payload.status,
    payload.note ?? '',
    actedAtISO,
    actorId(payload.actor),
    actorName(payload.actor)
  );
  return id;
}

export function assertPeriodOpen(db, dateISO, contextLabel = 'Posting date') {
  const periodKey = periodKeyFromDate(dateISO);
  const row = db.prepare(`SELECT * FROM accounting_period_locks WHERE period_key = ?`).get(periodKey);
  if (row) {
    const note = row.reason ? ` Reason: ${row.reason}` : '';
    throw new Error(`${contextLabel} falls in locked period ${periodKey}.${note}`);
  }
  return periodKey;
}

export function lockAccountingPeriod(db, payload, actor) {
  const periodKey = periodKeyFromDate(payload.periodKey || payload.dateISO);
  const existing = db.prepare(`SELECT period_key FROM accounting_period_locks WHERE period_key = ?`).get(periodKey);
  if (existing) return { ok: false, error: `Period ${periodKey} is already locked.` };
  const lockedAtISO = nowIso();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO accounting_period_locks (
        period_key, locked_from_iso, locked_at_iso, locked_by_user_id, locked_by_name, reason
      ) VALUES (?,?,?,?,?,?)`
    ).run(
      periodKey,
      `${periodKey}-01`,
      lockedAtISO,
      actorId(actor),
      actorName(actor),
      String(payload.reason ?? '').trim()
    );
    appendAuditLog(db, {
      actor,
      action: 'period.lock',
      entityKind: 'accounting_period',
      entityId: periodKey,
      note: String(payload.reason ?? '').trim() || 'Accounting period locked',
      details: { periodKey },
    });
  })();
  return { ok: true, periodKey };
}

export function unlockAccountingPeriod(db, periodKey, actor, reason = '') {
  const row = db.prepare(`SELECT * FROM accounting_period_locks WHERE period_key = ?`).get(periodKey);
  if (!row) return { ok: false, error: 'Period lock not found.' };
  db.transaction(() => {
    db.prepare(`DELETE FROM accounting_period_locks WHERE period_key = ?`).run(periodKey);
    appendAuditLog(db, {
      actor,
      action: 'period.unlock',
      entityKind: 'accounting_period',
      entityId: periodKey,
      note: String(reason || '').trim() || 'Accounting period unlocked',
      details: { previousReason: row.reason ?? '' },
    });
  })();
  return { ok: true };
}

function nextPaymentRequestId() {
  const year = new Date().getFullYear();
  const salt = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PREQ-${year}-${Date.now()}-${salt}`;
}

function nextRefundId() {
  const year = new Date().getFullYear();
  const salt = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RF-${year}-${Date.now()}-${salt}`;
}

export function insertPaymentRequest(db, payload, actor) {
  const expenseID = String(payload.expenseID ?? '').trim();
  const amountRequestedNgn = roundMoney(payload.amountRequestedNgn);
  if (!expenseID) return { ok: false, error: 'Expense ID is required.' };
  if (amountRequestedNgn <= 0) return { ok: false, error: 'Amount requested must be positive.' };
  const expense = db.prepare(`SELECT expense_id FROM expenses WHERE expense_id = ?`).get(expenseID);
  if (!expense) return { ok: false, error: 'Linked expense was not found.' };
  const providedRequestId = String(payload.requestID ?? '').trim();
  const requestDate = String(payload.requestDate ?? '').trim() || nowIso().slice(0, 10);
  const description = String(payload.description ?? '').trim() || '—';

  const maxAttempts = providedRequestId ? 1 : 3;
  let lastErr = null;
  for (let i = 0; i < maxAttempts; i += 1) {
    const requestID =
      providedRequestId ||
      (i === 0
        ? nextPaymentRequestId(db)
        : `${nextPaymentRequestId(db)}-${Math.random().toString(36).slice(2, 7)}`);
    try {
      assertPeriodOpen(db, requestDate, 'Payment request date');
      db.transaction(() => {
        db.prepare(
          `INSERT INTO payment_requests (
            request_id, expense_id, amount_requested_ngn, request_date, approval_status, description,
            approved_by, approved_at_iso, approval_note
          ) VALUES (?,?,?,?,?,?,?,?,?)`
        ).run(requestID, expenseID, amountRequestedNgn, requestDate, 'Pending', description, '', '', '');
        appendAuditLog(db, {
          actor,
          action: 'payment_request.create',
          entityKind: 'payment_request',
          entityId: requestID,
          note: `Payment request ${requestID} submitted`,
          details: { expenseID, amountRequestedNgn },
        });
      })();
      return { ok: true, requestID };
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      if (providedRequestId || !msg.includes('UNIQUE constraint failed: payment_requests.request_id')) {
        return { ok: false, error: msg };
      }
    }
  }
  return { ok: false, error: String(lastErr?.message || lastErr || 'Could not create payment request.') };
}

export function decidePaymentRequest(db, requestID, payload, actor) {
  const row = db.prepare(`SELECT * FROM payment_requests WHERE request_id = ?`).get(requestID);
  if (!row) return { ok: false, error: 'Payment request not found.' };
  if (!['Pending', 'Submitted', 'Awaiting approval', ''].includes(String(row.approval_status || 'Pending'))) {
    return { ok: false, error: 'Only pending requests can be reviewed.' };
  }
  const status = String(payload.status ?? '').trim();
  if (!['Approved', 'Rejected'].includes(status)) {
    return { ok: false, error: 'Decision status must be Approved or Rejected.' };
  }
  const note = String(payload.note ?? '').trim();
  const actedAtISO = String(payload.actedAtISO ?? '').trim() || nowIso().slice(0, 10);
  try {
    assertPeriodOpen(db, actedAtISO, 'Approval date');
    db.transaction(() => {
      db.prepare(
        `UPDATE payment_requests
         SET approval_status = ?, approved_by = ?, approved_at_iso = ?, approval_note = ?
         WHERE request_id = ?`
      ).run(status, actorName(actor), actedAtISO, note, requestID);
      recordApprovalAction(db, {
        actor,
        entityKind: 'payment_request',
        entityId: requestID,
        action: 'review',
        status: status.toLowerCase(),
        note,
        actedAtISO,
      });
      appendAuditLog(db, {
        actor,
        action: 'payment_request.review',
        entityKind: 'payment_request',
        entityId: requestID,
        note: note || `Payment request ${status.toLowerCase()}`,
        details: { status },
      });
    })();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export function insertRefundRequest(db, payload, actor, branchId = 'BR-KAD') {
  const customerID = String(payload.customerID ?? '').trim();
  const amountNgn = roundMoney(payload.amountNgn);
  if (!customerID) return { ok: false, error: 'Customer is required.' };
  if (amountNgn <= 0) return { ok: false, error: 'Refund amount must be positive.' };
  const refundID = String(payload.refundID ?? '').trim() || nextRefundId(db);
  const requestedAtISO = String(payload.requestedAtISO ?? '').trim() || nowIso();
  try {
    assertPeriodOpen(db, requestedAtISO, 'Refund request date');
    db.transaction(() => {
      db.prepare(
        `INSERT INTO customer_refunds (
          refund_id, customer_id, customer_name, quotation_ref, cutting_list_ref, product, reason_category, reason,
          amount_ngn, calculation_lines_json, suggested_lines_json, calculation_notes, status, requested_by, requested_at_iso,
          approval_date, approved_by, approved_amount_ngn, manager_comments, paid_amount_ngn, paid_at_iso, paid_by, payment_note, branch_id
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        refundID,
        customerID,
        String(payload.customer ?? '').trim(),
        String(payload.quotationRef ?? '').trim(),
        String(payload.cuttingListRef ?? '').trim(),
        String(payload.product ?? '').trim() || '—',
        String(payload.reasonCategory ?? '').trim(),
        String(payload.reason ?? '').trim(),
        amountNgn,
        JSON.stringify(payload.calculationLines || []),
        JSON.stringify(payload.suggestedLines || payload.calculationLines || []),
        String(payload.calculationNotes ?? '').trim(),
        'Pending',
        actorName(actor),
        requestedAtISO,
        '',
        '',
        0,
        '',
        0,
        '',
        '',
        '',
        String(branchId || 'BR-KAD').trim()
      );
      appendAuditLog(db, {
        actor,
        action: 'refund.create',
        entityKind: 'refund',
        entityId: refundID,
        note: `Refund request ${refundID} submitted`,
        details: { amountNgn, customerID },
      });
    })();
    return { ok: true, refundID };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export function decideRefundRequest(db, refundID, payload, actor) {
  const row = db.prepare(`SELECT * FROM customer_refunds WHERE refund_id = ?`).get(refundID);
  if (!row) return { ok: false, error: 'Refund request not found.' };
  if (String(row.status || 'Pending') !== 'Pending') {
    return { ok: false, error: 'Only pending refunds can be reviewed.' };
  }
  const status = String(payload.status ?? '').trim();
  if (!['Approved', 'Rejected'].includes(status)) {
    return { ok: false, error: 'Decision status must be Approved or Rejected.' };
  }
  const actedAtISO = String(payload.approvalDate ?? '').trim() || nowIso().slice(0, 10);
  const comment = String(payload.managerComments ?? payload.note ?? '').trim();
  const approvedAmountNgn =
    status === 'Approved'
      ? roundMoney(payload.approvedAmountNgn ?? row.amount_ngn)
      : 0;
  if (status === 'Approved' && approvedAmountNgn <= 0) {
    return { ok: false, error: 'Approved refund amount must be positive.' };
  }
  try {
    assertPeriodOpen(db, actedAtISO, 'Refund approval date');
    db.transaction(() => {
      const calcLinesRaw = payload.calculationLines;
      let calculationLinesJson = null;
      if (status === 'Approved' && Array.isArray(calcLinesRaw) && calcLinesRaw.length > 0) {
        const normalized = calcLinesRaw
          .map((line) => ({
            label: String(line?.label ?? '').trim(),
            amountNgn: roundMoney(line?.amountNgn),
          }))
          .filter((line) => line.label && line.amountNgn > 0);
        if (normalized.length) calculationLinesJson = JSON.stringify(normalized);
      }
      const calcNotes =
        status === 'Approved' && payload.calculationNotes !== undefined && payload.calculationNotes !== null
          ? String(payload.calculationNotes).trim()
          : null;
      const suggestedRaw = payload.suggestedLines;
      let suggestedLinesJson = null;
      if (status === 'Approved' && Array.isArray(suggestedRaw) && suggestedRaw.length > 0) {
        const normalized = suggestedRaw
          .map((line) => ({
            label: String(line?.label ?? '').trim(),
            amountNgn: roundMoney(line?.amountNgn),
          }))
          .filter((line) => line.label && line.amountNgn > 0);
        if (normalized.length) suggestedLinesJson = JSON.stringify(normalized);
      }
      if (calculationLinesJson != null || calcNotes != null || suggestedLinesJson != null) {
        db.prepare(
          `UPDATE customer_refunds
           SET status = ?, approval_date = ?, approved_by = ?, approved_amount_ngn = ?, manager_comments = ?,
               calculation_lines_json = COALESCE(?, calculation_lines_json),
               calculation_notes = COALESCE(?, calculation_notes),
               suggested_lines_json = COALESCE(?, suggested_lines_json)
           WHERE refund_id = ?`
        ).run(
          status,
          actedAtISO,
          actorName(actor),
          approvedAmountNgn,
          comment,
          calculationLinesJson,
          calcNotes,
          suggestedLinesJson,
          refundID
        );
      } else {
        db.prepare(
          `UPDATE customer_refunds
           SET status = ?, approval_date = ?, approved_by = ?, approved_amount_ngn = ?, manager_comments = ?
           WHERE refund_id = ?`
        ).run(status, actedAtISO, actorName(actor), approvedAmountNgn, comment, refundID);
      }
      recordApprovalAction(db, {
        actor,
        entityKind: 'refund',
        entityId: refundID,
        action: 'review',
        status: status.toLowerCase(),
        note: comment,
        actedAtISO,
      });
      appendAuditLog(db, {
        actor,
        action: 'refund.review',
        entityKind: 'refund',
        entityId: refundID,
        note: comment || `Refund ${status.toLowerCase()}`,
        details: { status, approvedAmountNgn },
      });
    })();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export function previewRefundRequest(db, payload) {
  const customerID = String(payload.customerID ?? '').trim();
  if (!customerID) return { ok: false, error: 'Customer is required.' };
  const quotationRef = String(payload.quotationRef ?? '').trim();
  const cuttingListRef = String(payload.cuttingListRef ?? '').trim();
  const product = String(payload.product ?? '').trim();
  const quote = quotationRef
    ? db.prepare(`SELECT * FROM quotations WHERE id = ?`).get(quotationRef)
    : null;
  const receipts = quotationRef
    ? db.prepare(`SELECT * FROM sales_receipts WHERE quotation_ref = ?`).all(quotationRef)
    : [];
  const cuttingList = cuttingListRef
    ? db.prepare(`SELECT * FROM cutting_lists WHERE id = ?`).get(cuttingListRef)
    : null;
  const paidOnQuoteNgn = receipts.reduce((sum, row) => sum + roundMoney(row.amount_ngn), 0);
  const quoteTotalNgn = roundMoney(quote?.total_ngn);
  const quotedMeters =
    positiveNumber(payload.quotedMeters) ||
    positiveNumber(cuttingList?.total_meters) ||
    quotedMetersFromQuotationLines(quote?.lines_json ?? '');
  const actualMeters =
    positiveNumber(payload.actualMeters) ||
    positiveNumber(cuttingList?.total_meters) ||
    null;
  const pricePerMeter = positiveNumber(payload.pricePerMeterNgn) || quotedAmountPerMeter(quote?.lines_json);
  const suggestedLines = [];
  if (paidOnQuoteNgn > quoteTotalNgn && quoteTotalNgn > 0) {
    suggestedLines.push({
      label: `Overpayment on ${quotationRef || 'quotation'}`,
      amountNgn: paidOnQuoteNgn - quoteTotalNgn,
    });
  }
  if (quotedMeters && actualMeters && quotedMeters > actualMeters && pricePerMeter) {
    const excessMeters = quotedMeters - actualMeters;
    suggestedLines.push({
      label: `Unused metres ${excessMeters.toFixed(2)}m × ₦${Math.round(pricePerMeter).toLocaleString()}`,
      amountNgn: Math.round(excessMeters * pricePerMeter),
    });
  }
  const transportRefundNgn = roundMoney(payload.transportRefundNgn);
  if (transportRefundNgn > 0) {
    suggestedLines.push({
      label: 'Transport refund',
      amountNgn: transportRefundNgn,
    });
  }
  const installationRefundNgn = roundMoney(payload.installationRefundNgn);
  if (installationRefundNgn > 0) {
    suggestedLines.push({
      label: 'Installation refund',
      amountNgn: installationRefundNgn,
    });
  }
  const substitutionMeters = positiveNumber(payload.substitutionMeters);
  const substitutionDiffPerMeterNgn = positiveNumber(payload.substitutionDiffPerMeterNgn);
  if (substitutionMeters && substitutionDiffPerMeterNgn) {
    suggestedLines.push({
      label: `Gauge / material substitution ${substitutionMeters.toFixed(2)}m`,
      amountNgn: Math.round(substitutionMeters * substitutionDiffPerMeterNgn),
    });
  }
  const manualAdjustmentNgn = roundMoney(payload.manualAdjustmentNgn);
  if (manualAdjustmentNgn > 0) {
    suggestedLines.push({
      label: 'Manual refund adjustment',
      amountNgn: manualAdjustmentNgn,
    });
  }
  const suggestedAmountNgn = suggestedLines.reduce((sum, line) => sum + roundMoney(line.amountNgn), 0);
  return {
    ok: true,
    preview: {
      customerID,
      quotationRef,
      cuttingListRef,
      product,
      quoteTotalNgn,
      paidOnQuoteNgn,
      quotedMeters,
      actualMeters,
      pricePerMeterNgn: pricePerMeter ? Math.round(pricePerMeter) : null,
      suggestedAmountNgn,
      suggestedLines,
    },
  };
}

function positiveNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : null;
}

export function upsertTreasuryAccount(db, payload, actor) {
  const name = String(payload.name ?? '').trim();
  if (!name) return { ok: false, error: 'Account name is required.' };
  const balance = roundMoney(payload.balance);
  let savedId = null;
  try {
    db.transaction(() => {
      if (payload.id) {
        db.prepare(
          `UPDATE treasury_accounts
           SET name = ?, bank_name = ?, balance = ?, type = ?, acc_no = ?
           WHERE id = ?`
        ).run(
          name,
          String(payload.bankName ?? '').trim(),
          balance,
          String(payload.type ?? 'Bank').trim() || 'Bank',
          String(payload.accNo ?? '').trim() || 'N/A',
          Number(payload.id)
        );
      } else {
        db.prepare(
          `INSERT INTO treasury_accounts (name, bank_name, balance, type, acc_no)
           VALUES (?,?,?,?,?)`
        ).run(
          name,
          String(payload.bankName ?? '').trim(),
          balance,
          String(payload.type ?? 'Bank').trim() || 'Bank',
          String(payload.accNo ?? '').trim() || 'N/A'
        );
      }
      const row = payload.id
        ? db.prepare(`SELECT * FROM treasury_accounts WHERE id = ?`).get(Number(payload.id))
        : db.prepare(`SELECT * FROM treasury_accounts ORDER BY id DESC LIMIT 1`).get();
      savedId = row?.id ?? null;
      appendAuditLog(db, {
        actor,
        action: payload.id ? 'treasury_account.update' : 'treasury_account.create',
        entityKind: 'treasury_account',
        entityId: String(row?.id ?? payload.id ?? ''),
        note: `${name} saved in treasury controls`,
        details: { balance },
      });
    })();
    return { ok: true, id: savedId };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
