#!/usr/bin/env node
/**
 * 50 linked “live” scenarios: customer → quotation → receipt → (refund) → PO → GRN → cutting list
 * → production job → conversion (normal / multi-coil / extreme yield) → expense → payment request
 * → approve → pay. Then optional hammer bootstrap/concurrent reads.
 *
 * Prerequisites: API server running (e.g. npm run server on STRESS_API_URL).
 *
 * Usage:
 *   node scripts/fifty-lifecycle-stress.mjs
 *   STRESS_API_URL=http://127.0.0.1:8787 STRESS_UI_URL=http://127.0.0.1:5173 node scripts/fifty-lifecycle-stress.mjs
 *   STRESS_FROM=0 STRESS_TO=9 node scripts/fifty-lifecycle-stress.mjs   # first 10 only
 *   STRESS_SKIP_PHASE2=1 node scripts/fifty-lifecycle-stress.mjs         # no bootstrap hammer
 *
 * Login: admin / Admin@123 (full permissions for finance + production).
 *
 * Each run generates a unique `RUN_KEY` prefix so reruns don't collide on primary keys.
 * You can override it via `STRESS_RUN_KEY`.
 *
 * Avoid launching two script instances against the same server at the same time (session races).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allScenarios, FIFTY_LIFECYCLE_SCENARIO_COUNT } from './data/fiftyLifecycleScenarios.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_BASE = (process.env.STRESS_API_URL || process.env.STRESS_BASE_URL || 'http://127.0.0.1:8787').replace(
  /\/$/,
  ''
);
const UI_BASE = (process.env.STRESS_UI_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const FROM = Math.max(0, Math.min(FIFTY_LIFECYCLE_SCENARIO_COUNT - 1, Number(process.env.STRESS_FROM) || 0));
const STRESS_TO_RAW = process.env.STRESS_TO;
const TO = Math.max(
  FROM,
  Math.min(
    FIFTY_LIFECYCLE_SCENARIO_COUNT - 1,
    STRESS_TO_RAW !== undefined && STRESS_TO_RAW !== ''
      ? Number(STRESS_TO_RAW)
      : FIFTY_LIFECYCLE_SCENARIO_COUNT - 1
  )
);
const SKIP_PHASE2 = process.env.STRESS_SKIP_PHASE2 === '1' || process.env.STRESS_SKIP_PHASE2 === 'true';
const BOOT_CONC = Math.min(400, Math.max(20, Number(process.env.STRESS_BOOTSTRAP_CONCURRENT) || 120));

function hashToInt(value) {
  let h = 0;
  const s = String(value);
  for (let i = 0; i < s.length; i += 1) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const RUN_KEY_RAW = process.env.STRESS_RUN_KEY || `ST50RUN-${Date.now().toString(36)}`;
const RUN_KEY = String(RUN_KEY_RAW).replace(/[^A-Za-z0-9_-]/g, '');
const RUN_PHONE_SUFFIX = String(hashToInt(RUN_KEY) % 100000).padStart(5, '0');

const SUPPLIER_KG_PER_M_REF = 3000 / 1327;

function statsFromTimes(ms) {
  if (!ms.length) return { n: 0 };
  const s = [...ms].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, p50_ms: pct(0.5), p95_ms: pct(0.95), max_ms: s[s.length - 1] };
}

async function login() {
  const r = await fetch(`${API_BASE}/api/session/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: process.env.STRESS_USERNAME || 'admin',
      password: process.env.STRESS_PASSWORD || 'Admin@123',
    }),
  });
  if (!r.ok) throw new Error(`login ${r.status} ${await r.text()}`);
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) throw new Error('no session cookie');
  return cookie;
}

async function api(path, { method = 'GET', sessionCookie, body } = {}) {
  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text };
  }
  return { ok: r.ok, status: r.status, data };
}

async function setWorkspace(sessionCookie, { currentBranchId, viewAllBranches } = {}) {
  if (currentBranchId == null && viewAllBranches === undefined) return;
  const r = await api('/api/session/workspace', {
    method: 'PATCH',
    sessionCookie,
    body: {
      ...(currentBranchId != null ? { currentBranchId } : {}),
      ...(viewAllBranches !== undefined ? { viewAllBranches: Boolean(viewAllBranches) } : {}),
    },
  });
  if (!r.ok || !r.data?.ok) {
    throw new Error(`workspace: ${r.status} ${JSON.stringify(r.data)}`);
  }
  return r.data;
}

function linksForReport(row) {
  const { ids } = row;
  return {
    ui: {
      customer: `${UI_BASE}/customers/${encodeURIComponent(ids.customerID)}`,
      salesWorkspace: `${UI_BASE}/sales`,
      /** Quotation / receipt ids in report `ids` — open from Sales workspace search or API bootstrap snapshot. */
      quotationId: ids.quotationId,
      cuttingListId: ids.cuttingListId,
      supplier: `${UI_BASE}/procurement/suppliers/${encodeURIComponent(ids.supplierID)}`,
      coilA: `${UI_BASE}/operations/coils/${encodeURIComponent(ids.coilA)}`,
      coilB: ids.coilB ? `${UI_BASE}/operations/coils/${encodeURIComponent(ids.coilB)}` : null,
      operations: `${UI_BASE}/operations`,
      finance: `${UI_BASE}/accounts`,
    },
    api: {
      customer: `${API_BASE}/api/customers/${encodeURIComponent(ids.customerID)}`,
      quotation: `${API_BASE}/api/quotations/${encodeURIComponent(ids.quotationId)}`,
      productionJob: `${API_BASE}/api/production-jobs/${encodeURIComponent(ids.jobId)}/coil-allocations`,
      purchaseOrderSnapshot: `${API_BASE}/api/bootstrap`,
    },
  };
}

function normalCompletionRows(allocRows, totalMeters, mode) {
  const kgM = SUPPLIER_KG_PER_M_REF;
  if (mode === 'extreme' && allocRows.length === 1) {
    const a = allocRows[0];
    return [
      {
        allocationId: a.id,
        coilNo: a.coilNo,
        closingWeightKg: 120,
        metersProduced: 48,
      },
    ];
  }

  const parts = allocRows.length;
  const metersEach = totalMeters / parts;
  return allocRows.map((a) => {
    const opening = a.openingWeightKg;
    const consumed = kgM * metersEach;
    const closing = Math.max(0, opening - consumed);
    return {
      allocationId: a.id,
      coilNo: a.coilNo,
      closingWeightKg: closing,
      metersProduced: metersEach,
    };
  });
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows) {
  const header = [
    'slug',
    'ok',
    'coilMode',
    'customerID',
    'supplierID',
    'poId',
    'quotationId',
    'cuttingListId',
    'jobId',
    'refundId',
    'expenseId',
    'paymentRequestId',
    'conversionAlertState',
    'managerReviewRequired',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    const ids = r.ids || {};
    lines.push(
      [
        r.slug,
        r.ok ? 'true' : 'false',
        r.coilMode || '',
        ids.customerID || '',
        ids.supplierID || '',
        ids.poId || '',
        ids.quotationId || '',
        ids.cuttingListId || '',
        ids.jobId || '',
        ids.refundId || '',
        ids.expenseId || '',
        ids.paymentRequestId || '',
        r.production?.aggregatedAlertState || '',
        r.production?.managerReviewRequired ? 'true' : 'false',
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  return lines.join('\n') + '\n';
}

async function runScenario(sessionCookie, scenario) {
  const n = scenario.index;
  const slug = scenario.slug;
  const customerID = `${RUN_KEY}-C-${slug}`;
  // Identity dedupe uses normalized "last 10 digits", so embed the run key in those digits.
  const phoneDigits = `${RUN_PHONE_SUFFIX}${String(n).padStart(5, '0')}`; // 10 digits total
  const phoneNumber = `+234${phoneDigits}`;
  const email = `st50.${RUN_KEY}.${slug.toLowerCase()}@stress.zarewa.test`;

  const ids = {
    customerID,
    supplierID: `${RUN_KEY}-SUP-${slug}`,
    poId: null,
    coilA: `${RUN_KEY}-CL-${slug}-A`,
    coilB: scenario.coilMode === 'single' ? null : `${RUN_KEY}-CL-${slug}-B`,
    quotationId: null,
    cuttingListId: null,
    jobId: null,
    refundId: null,
    expenseId: `EXP-${RUN_KEY}-${slug}`,
    paymentRequestId: `PREQ-${RUN_KEY}-${slug}`,
  };

  const row = {
    scenario: scenario.label,
    slug,
    coilMode: scenario.coilMode,
    ok: true,
    errors: [],
    ids,
    production: null,
    links: null,
  };

  const fail = (step, err) => {
    row.ok = false;
    row.errors.push({ step, error: String(err?.message || err) });
  };

  try {
    let r = await api('/api/customers', {
      method: 'POST',
      sessionCookie,
      body: {
        customerID,
        name: scenario.customerName,
        phoneNumber,
        email,
        addressShipping: `${scenario.city} — ${scenario.project}`,
        addressBilling: scenario.city,
        status: 'Active',
        tier: n % 3 === 0 ? 'Wholesale' : 'Regular',
        paymentTerms: n % 2 === 0 ? 'Net 30' : 'Due on receipt',
        createdBy: 'Stress ST50',
        companyName: `${scenario.customerName} Ltd`,
        leadSource: 'Stress lifecycle',
        preferredContact: 'Phone',
        crmTags: ['st50', slug],
        crmProfileNotes: scenario.label,
      },
    });
    if (!r.ok) throw new Error(`customer: ${r.status} ${JSON.stringify(r.data).slice(0, 400)}`);

    r = await api('/api/suppliers', {
      method: 'POST',
      sessionCookie,
      body: {
        supplierID: ids.supplierID,
        name: scenario.supplierLabel,
        city: scenario.city,
        paymentTerms: 'Net 14',
        qualityScore: 75 + (n % 20),
        notes: `ST50 supplier ${slug}`,
      },
    });
    if (!r.ok) throw new Error(`supplier: ${r.status} ${JSON.stringify(r.data)}`);
    ids.supplierID = r.data.supplierID;

    const lineKey = `L-${RUN_KEY}-${slug}`;
    r = await api('/api/purchase-orders', {
      method: 'POST',
      sessionCookie,
      body: {
        poID: `${RUN_KEY}-PO-${slug}`,
        supplierID: ids.supplierID,
        supplierName: scenario.supplierLabel,
        orderDateISO: scenario.dateISO,
        expectedDeliveryISO: '',
        status: 'Approved',
        lines: [
          {
            lineKey,
            productID: 'COIL-ALU',
            productName: 'Aluminium coil (kg)',
            color: 'IV',
            gauge: '0.24',
            metersOffered: 1327,
            conversionKgPerM: SUPPLIER_KG_PER_M_REF,
            qtyOrdered: scenario.coilMode === 'single' ? 4000 : 8000,
            unitPricePerKgNgn: 100,
            unitPriceNgn: 100,
            qtyReceived: 0,
          },
        ],
      },
    });
    if (!r.ok) throw new Error(`po: ${r.status} ${JSON.stringify(r.data)}`);
    ids.poId = r.data.poID;

    // Optional coil ops: split/scrap/return-material for realism (some scenarios only).
    // Must happen after GRN creates the coil.
    if (scenario.poSupplierPay) {
      const bootPo = await api('/api/bootstrap', { sessionCookie });
      const tid = bootPo.data?.treasuryAccounts?.[0]?.id;
      if (tid) {
        await api(`/api/purchase-orders/${encodeURIComponent(ids.poId)}/supplier-payment`, {
          method: 'POST',
          sessionCookie,
          body: {
            amountNgn: 200_000 + n * 1000,
            note: `ST50 deposit ${slug}`,
            treasuryAccountId: tid,
            reference: `ST50-PO-${RUN_KEY}-${slug}`,
            dateISO: scenario.dateISO,
          },
        });
      }
    }

    const grnEntries =
      scenario.coilMode === 'single'
        ? [
            {
              lineKey,
              productID: 'COIL-ALU',
              qtyReceived: 3200,
              weightKg: 3200,
              coilNo: ids.coilA,
              location: 'Bay ST50',
              gaugeLabel: '0.24mm',
              materialTypeName: 'Aluminium',
              supplierExpectedMeters: 1327,
              supplierConversionKgPerM: SUPPLIER_KG_PER_M_REF,
            },
          ]
        : [
            {
              lineKey,
              productID: 'COIL-ALU',
              qtyReceived: 3200,
              weightKg: 3200,
              coilNo: ids.coilA,
              location: 'Bay ST50-A',
              gaugeLabel: '0.24mm',
              materialTypeName: 'Aluminium',
              supplierExpectedMeters: 1327,
              supplierConversionKgPerM: SUPPLIER_KG_PER_M_REF,
            },
            {
              lineKey,
              productID: 'COIL-ALU',
              qtyReceived: 3200,
              weightKg: 3200,
              coilNo: ids.coilB,
              location: 'Bay ST50-B',
              gaugeLabel: '0.24mm',
              materialTypeName: 'Aluminium',
              supplierExpectedMeters: 1327,
              supplierConversionKgPerM: SUPPLIER_KG_PER_M_REF,
            },
          ];

    r = await api(`/api/purchase-orders/${encodeURIComponent(ids.poId)}/grn`, {
      method: 'POST',
      sessionCookie,
      body: {
        entries: grnEntries,
        supplierID: ids.supplierID,
        supplierName: scenario.supplierLabel,
      },
    });
    if (!r.ok) throw new Error(`grn: ${r.status} ${JSON.stringify(r.data)}`);

    if (n % 10 === 0) {
      const split = await api(`/api/coil-lots/${encodeURIComponent(ids.coilA)}/split`, {
        method: 'POST',
        sessionCookie,
        body: { splitKg: 250, note: `ST50 split ${slug}`, dateISO: scenario.dateISO },
      });
      if (split.ok && split.data?.newCoilNo && !ids.coilB && scenario.coilMode !== 'single') {
        // keep existing dual coil; otherwise ignore
      }
    }
    if (n % 12 === 0) {
      await api(`/api/coil-lots/${encodeURIComponent(ids.coilA)}/scrap`, {
        method: 'POST',
        sessionCookie,
        body: {
          kg: 30,
          reason: 'Damage',
          note: `ST50 scrap ${slug}`,
          dateISO: scenario.dateISO,
          creditScrapInventory: true,
          scrapProductID: 'SCRAP-COIL',
        },
      });
    }
    if (n % 9 === 0) {
      await api(`/api/coil-lots/${encodeURIComponent(ids.coilA)}/return-material`, {
        method: 'POST',
        sessionCookie,
        body: { kg: 20, reason: 'Weighbridge correction', dateISO: scenario.dateISO },
      });
    }

    r = await api('/api/quotations', {
      method: 'POST',
      sessionCookie,
      body: {
        customerID,
        projectName: scenario.project,
        dateISO: scenario.dateISO,
        lines: {
          products: [{ name: 'Roofing Sheet', qty: String(scenario.sheets), unitPrice: String(scenario.unitPrice) }],
          accessories: [],
          services: [],
        },
      },
    });
    if (!r.ok) throw new Error(`quotation: ${r.status} ${JSON.stringify(r.data)}`);
    ids.quotationId = r.data.quotationId;
    const totalNgn = r.data.quotation.totalNgn;

    await api(`/api/quotations/${encodeURIComponent(ids.quotationId)}`, {
      method: 'PATCH',
      sessionCookie,
      body: { status: 'Approved', customerFeedback: `ST50 approved ${slug}` },
    });

    const boot = await api('/api/bootstrap', { sessionCookie });
    const treasuryAccountId = boot.data?.treasuryAccounts?.[0]?.id;
    const treasuryAltId = boot.data?.treasuryAccounts?.[1]?.id;
    if (!treasuryAccountId) throw new Error('no treasury account');

    const payAmount = Math.round(totalNgn * scenario.payFraction);
    if (payAmount > 0) {
      const receiptLines =
        treasuryAltId && n % 4 === 0
          ? (() => {
              const a = Math.floor(payAmount * 0.55);
              return [
                { treasuryAccountId, amountNgn: a, reference: `ST50-RCP-A-${RUN_KEY}-${slug}` },
                { treasuryAccountId: treasuryAltId, amountNgn: payAmount - a, reference: `ST50-RCP-B-${RUN_KEY}-${slug}` },
              ];
            })()
          : [{ treasuryAccountId, amountNgn: payAmount, reference: `ST50-RCP-${RUN_KEY}-${slug}` }];
      r = await api('/api/ledger/receipt', {
        method: 'POST',
        sessionCookie,
        body: {
          customerID,
          quotationId: ids.quotationId,
          amountNgn: payAmount,
          paymentMethod: n % 2 === 0 ? 'Transfer' : 'POS',
          dateISO: scenario.dateISO,
          bankReference: `ST50-RCP-${RUN_KEY}-${slug}`,
          paymentLines: receiptLines,
        },
      });
      if (!r.ok) throw new Error(`receipt: ${r.status} ${JSON.stringify(r.data)}`);
    }

    if (scenario.doRefund && payAmount === totalNgn) {
      const refundAmt = Math.min(totalNgn, Math.max(50_000, Math.floor(totalNgn * 0.12)));
      const refundID = `RF-${RUN_KEY}-${slug}`;
      r = await api('/api/refunds', {
        method: 'POST',
        sessionCookie,
        body: {
          customerID,
          customer: scenario.customerName,
          quotationRef: ids.quotationId,
          refundID,
          reasonCategory: 'Goodwill adjustment',
          reason: `ST50 partial reversal ${slug}`,
          amountNgn: refundAmt,
          calculationLines: [{ label: 'Stress reversal', amountNgn: refundAmt }],
        },
      });
      if (r.ok && r.data?.refundID) {
        ids.refundId = r.data.refundID;
        await api(`/api/refunds/${encodeURIComponent(ids.refundId)}/decision`, {
          method: 'POST',
          sessionCookie,
          body: {
            status: 'Approved',
            approvalDate: scenario.dateISO,
            managerComments: 'ST50 approved',
            approvedAmountNgn: refundAmt,
          },
        });
        // Staged split payout (when multiple accounts exist) for realism.
        if (treasuryAltId && n % 3 === 0) {
          const part1 = Math.floor(refundAmt * 0.6);
          const p1 = await api(`/api/refunds/${encodeURIComponent(ids.refundId)}/pay`, {
            method: 'POST',
            sessionCookie,
            body: {
              paymentNote: `ST50 staged payout 1 ${RUN_KEY}-${slug}`,
              paymentLines: [
                { treasuryAccountId, amountNgn: part1, reference: `ST50-RFD-1-${RUN_KEY}-${slug}` },
              ],
            },
          });
          if (!p1.ok) throw new Error(`refund-pay-1: ${p1.status} ${JSON.stringify(p1.data)}`);
          const p2 = await api(`/api/refunds/${encodeURIComponent(ids.refundId)}/pay`, {
            method: 'POST',
            sessionCookie,
            body: {
              paymentNote: `ST50 staged payout 2 ${RUN_KEY}-${slug}`,
              paymentLines: [
                { treasuryAccountId: treasuryAltId, amountNgn: refundAmt - part1, reference: `ST50-RFD-2-${RUN_KEY}-${slug}` },
              ],
            },
          });
          if (!p2.ok) throw new Error(`refund-pay-2: ${p2.status} ${JSON.stringify(p2.data)}`);
        } else {
          const pay = await api(`/api/refunds/${encodeURIComponent(ids.refundId)}/pay`, {
            method: 'POST',
            sessionCookie,
            body: { treasuryAccountId, reference: `ST50-RFD-${RUN_KEY}-${slug}` },
          });
          if (!pay.ok) throw new Error(`refund-pay: ${pay.status} ${JSON.stringify(pay.data)}`);
        }
      }
    }

    const plannedMeters = scenario.sheets * scenario.lengthM;
    r = await api('/api/cutting-lists', {
      method: 'POST',
      sessionCookie,
      body: {
        quotationRef: ids.quotationId,
        customerID,
        productID: 'FG-101',
        productName: 'Longspan thin',
        dateISO: scenario.dateISO,
        machineName: `Line-${(n % 3) + 1}`,
        operatorName: `Op ST50 ${slug}`,
        lines: [{ sheets: scenario.sheets, lengthM: scenario.lengthM }],
      },
    });
    if (!r.ok) throw new Error(`cutting-list: ${r.status} ${JSON.stringify(r.data)}`);
    ids.cuttingListId = r.data.id;

    r = await api('/api/production-jobs', {
      method: 'POST',
      sessionCookie,
      body: {
        cuttingListId: ids.cuttingListId,
        productID: 'FG-101',
        productName: 'Longspan thin',
        plannedMeters,
        plannedSheets: scenario.sheets,
        status: 'Planned',
      },
    });
    if (!r.ok) throw new Error(`production-job: ${r.status} ${JSON.stringify(r.data)}`);
    ids.jobId = r.data.jobID;

    const allocPayload =
      scenario.coilMode === 'single'
        ? [{ coilNo: ids.coilA, openingWeightKg: 2000 }]
        : scenario.coilMode === 'extreme'
          ? [{ coilNo: ids.coilA, openingWeightKg: 2800 }]
          : [
              { coilNo: ids.coilA, openingWeightKg: 2000 },
              { coilNo: ids.coilB, openingWeightKg: 2000 },
            ];

    r = await api(`/api/production-jobs/${encodeURIComponent(ids.jobId)}/allocations`, {
      method: 'POST',
      sessionCookie,
      body: { allocations: allocPayload },
    });
    if (!r.ok) throw new Error(`allocations: ${r.status} ${JSON.stringify(r.data)}`);

    r = await api(`/api/production-jobs/${encodeURIComponent(ids.jobId)}/start`, {
      method: 'POST',
      sessionCookie,
      body: { startedAtISO: scenario.dateISO },
    });
    if (!r.ok) throw new Error(`start: ${r.status} ${JSON.stringify(r.data)}`);

    const list = await api(`/api/production-jobs/${encodeURIComponent(ids.jobId)}/coil-allocations`, {
      sessionCookie,
    });
    const allocRows = list.data?.allocations || [];
    const completionPayload = normalCompletionRows(allocRows, plannedMeters, scenario.coilMode);

    r = await api(`/api/production-jobs/${encodeURIComponent(ids.jobId)}/conversion-preview`, {
      method: 'POST',
      sessionCookie,
      body: { allocations: completionPayload },
    });
    row.production = {
      previewOk: r.ok,
      managerReviewRequired: r.data?.managerReviewRequired,
      aggregatedAlertState: r.data?.aggregatedAlertState,
    };

    r = await api(`/api/production-jobs/${encodeURIComponent(ids.jobId)}/complete`, {
      method: 'POST',
      sessionCookie,
      body: { completedAtISO: `${scenario.dateISO}T16:00:00.000Z`, allocations: completionPayload },
    });
    if (!r.ok) throw new Error(`complete: ${r.status} ${JSON.stringify(r.data)}`);
    if (r.data?.managerReviewRequired) {
      const sign = await api(`/api/production-jobs/${encodeURIComponent(ids.jobId)}/manager-review-signoff`, {
        method: 'PATCH',
        sessionCookie,
        body: { remark: `ST50 stress sign-off ${slug} (${r.data?.alertState || 'alert'})` },
      });
      if (!sign.ok) {
        throw new Error(`manager-review-signoff: ${sign.status} ${JSON.stringify(sign.data)}`);
      }
    }

    // Deliveries: ship & confirm after production completion (some scenarios only).
    if (n % 2 === 0) {
      const del = await api('/api/deliveries', {
        method: 'POST',
        sessionCookie,
        body: {
          cuttingListId: ids.cuttingListId,
          destination: `${scenario.city} site — ${slug}`,
          method: n % 4 === 0 ? 'Company truck' : '3rd party',
          shipDate: scenario.dateISO,
          eta: scenario.dateISO,
        },
      });
      if (del.ok && del.data?.id) {
        await api(`/api/deliveries/${encodeURIComponent(del.data.id)}/confirm`, {
          method: 'PATCH',
          sessionCookie,
          body: { status: 'Delivered', deliveredDateISO: scenario.dateISO, customerSignedPod: true },
        });
      }
    }

    const expRef = `ST50-EXP-${RUN_KEY}-${slug}`;
    r = await api('/api/expenses', {
      method: 'POST',
      sessionCookie,
      body: {
        expenseID: ids.expenseId,
        expenseType: `Operations — ${scenario.city} (${slug})`,
        amountNgn: 8000 + n * 150,
        date: scenario.dateISO,
        category: n % 2 === 0 ? 'Diesel' : 'Maintenance',
        paymentMethod: 'Transfer',
        treasuryAccountId,
        reference: expRef,
      },
    });
    if (!r.ok) throw new Error(`expense: ${r.status} ${JSON.stringify(r.data)}`);
    ids.expenseId = r.data.expenseID || ids.expenseId;

    r = await api('/api/payment-requests', {
      method: 'POST',
      sessionCookie,
      body: {
        expenseID: ids.expenseId,
        requestID: ids.paymentRequestId,
        amountRequestedNgn: 8000 + n * 150,
        requestDate: scenario.dateISO,
        description: `ST50 payment request ${slug}`,
      },
    });
    if (!r.ok) throw new Error(`payment-request: ${r.status} ${JSON.stringify(r.data)}`);
    ids.paymentRequestId = r.data.requestID || ids.paymentRequestId;

    r = await api(`/api/payment-requests/${encodeURIComponent(ids.paymentRequestId)}/decision`, {
      method: 'POST',
      sessionCookie,
      body: { status: 'Approved', note: `ST50 ok ${slug}` },
    });
    if (!r.ok) throw new Error(`payment-decision: ${r.status} ${JSON.stringify(r.data)}`);

    const accounts = boot.data?.treasuryAccounts || [];
    const [a0, a1] = accounts;
    const reqAmt = 8000 + n * 150;
    const payLines = a1
      ? (() => {
          const p1 = Math.floor(reqAmt * 0.6);
          return [
            { treasuryAccountId: a0.id, amountNgn: p1, reference: `ST50-P1-${RUN_KEY}-${slug}` },
            { treasuryAccountId: a1.id, amountNgn: reqAmt - p1, reference: `ST50-P2-${RUN_KEY}-${slug}` },
          ];
        })()
      : [{ treasuryAccountId: a0.id, amountNgn: reqAmt, reference: `ST50-PAY-${RUN_KEY}-${slug}` }];

    r = await api(`/api/payment-requests/${encodeURIComponent(ids.paymentRequestId)}/pay`, {
      method: 'POST',
      sessionCookie,
      body: { note: `ST50 payout ${slug}`, paymentLines: payLines },
    });
    if (!r.ok) throw new Error(`payment-pay: ${r.status} ${JSON.stringify(r.data)}`);

    row.links = linksForReport(row);
  } catch (e) {
    fail('run', e);
  }

  return row;
}

async function main() {
  const t0 = Date.now();
  console.log(
    JSON.stringify(
      {
        phase: 'config',
        api: API_BASE,
        ui: UI_BASE,
        scenarios: `${FROM}..${TO} (${TO - FROM + 1} of ${FIFTY_LIFECYCLE_SCENARIO_COUNT})`,
      },
      null,
      2
    )
  );

  const sessionCookie = await login();
  const branch = process.env.STRESS_BRANCH_ID;
  const viewAllRaw = process.env.STRESS_VIEW_ALL_BRANCHES;
  const viewAllBranches =
    viewAllRaw === undefined
      ? undefined
      : viewAllRaw === '1' || viewAllRaw === 'true'
        ? true
        : false;
  if (branch || viewAllBranches !== undefined) {
    const ws = await setWorkspace(sessionCookie, { currentBranchId: branch, viewAllBranches });
    console.log(JSON.stringify({ phase: 'workspace', ...ws }, null, 2));
  }
  const scenarios = allScenarios().slice(FROM, TO + 1);
  const report = [];
  for (const sc of scenarios) {
    const row = await runScenario(sessionCookie, sc);
    report.push(row);
    const icon = row.ok ? 'ok' : 'FAIL';
    console.log(`${icon} ${sc.slug} ${row.errors.length ? row.errors.map((e) => e.error).join(' | ') : ''}`);
  }

  const failed = report.filter((r) => !r.ok);
  const outPath = join(__dirname, 'output', 'fifty-lifecycle-report.json');
  const outCsv = join(__dirname, 'output', 'fifty-lifecycle-report.csv');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        api: API_BASE,
        ui: UI_BASE,
        from: FROM,
        to: TO,
        passed: report.length - failed.length,
        failed: failed.length,
        rows: report,
      },
      null,
      2
    ),
    'utf8'
  );
  await writeFile(outCsv, rowsToCsv(report), 'utf8');

  console.log(
    JSON.stringify({ phase: 'lifecycle', ms: Date.now() - t0, reportPath: outPath, reportCsvPath: outCsv }, null, 2)
  );

  if (!SKIP_PHASE2) {
    const times = [];
    let fails = 0;
    const t1 = Date.now();
    await Promise.all(
      Array.from({ length: BOOT_CONC }, async () => {
        const t = Date.now();
        const r = await fetch(`${API_BASE}/api/bootstrap`, { headers: { Cookie: sessionCookie } });
        times.push(Date.now() - t);
        if (!r.ok) fails++;
      })
    );
    console.log(
      JSON.stringify(
        {
          phase: 'concurrent_bootstrap',
          concurrent: BOOT_CONC,
          fails,
          batch_ms: Date.now() - t1,
          timings_ms: statsFromTimes(times),
        },
        null,
        2
      )
    );
  }

  console.log(JSON.stringify({ phase: 'total', ms: Date.now() - t0 }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
