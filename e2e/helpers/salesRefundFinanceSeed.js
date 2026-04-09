import { expect } from '@playwright/test';
import { csrfHeader } from './auth.js';

/**
 * Creates a paid quotation and a pending refund via API (as the logged-in user).
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ refundID: string; customerName: string; quotationId: string }>}
 */
export async function seedPaidQuotationAndPendingRefund(page) {
  const headers = await csrfHeader(page);
  const customerName = `E2E RF ${Date.now()}`;
  const phone = `080${String(Date.now()).slice(-8)}`;

  const custRes = await page.request.post('/api/customers', {
    headers,
    data: { name: customerName, phone, tier: 'Standard' },
  });
  expect(custRes.status(), await custRes.text()).toBe(201);
  const custBody = await custRes.json();
  const customerID = custBody.customerID;
  expect(customerID).toBeTruthy();

  const qRes = await page.request.post('/api/quotations', {
    headers,
    data: {
      customerID,
      projectName: 'E2E sales–refund–finance checklist',
      dateISO: new Date().toISOString().slice(0, 10),
      lines: {
        products: [{ name: 'Roofing Sheet', qty: '1', unitPrice: '5000' }],
        accessories: [],
        services: [],
      },
    },
  });
  expect(qRes.status(), await qRes.text()).toBe(201);
  const qBody = await qRes.json();
  const quotationId = qBody.quotationId;
  expect(String(quotationId)).toMatch(/^QT-/);

  const rcRes = await page.request.post('/api/ledger/receipt', {
    headers,
    data: {
      customerID,
      quotationId,
      amountNgn: 5000,
      paymentMethod: 'Cash',
      dateISO: new Date().toISOString().slice(0, 10),
    },
  });
  expect(rcRes.status(), await rcRes.text()).toBe(201);

  const refundAmount = 500;
  const rfRes = await page.request.post('/api/refunds', {
    headers,
    data: {
      customerID,
      customerName,
      quotationRef: quotationId,
      amountNgn: refundAmount,
      reasonCategory: ['Order cancellation'],
      reason: 'E2E checklist refund',
      calculationLines: [{ label: 'Cancellation', amountNgn: refundAmount, category: 'Order cancellation' }],
    },
  });
  const rfText = await rfRes.text();
  expect(rfRes.status(), rfText).toBe(201);
  const rfBody = JSON.parse(rfText);
  expect(rfBody.ok).toBe(true);
  expect(String(rfBody.refundID)).toMatch(/^RF-/);

  return { refundID: rfBody.refundID, customerName, quotationId };
}
