import { expect } from '@playwright/test';
import { csrfHeader } from './auth.js';

/**
 * Customer + quotation (₦5,000 total) with ₦7,000 receipt → ₦2,000 overpayment for preview tests.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ customerID: string; quotationId: string }>}
 */
export async function seedOverpaidQuotation(page) {
  const headers = await csrfHeader(page);
  const customerName = `E2E Overpay ${Date.now()}`;
  const phone = `081${String(Date.now()).slice(-8)}`;

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
      projectName: 'E2E refund risk — overpay preview',
      dateISO: new Date().toISOString().slice(0, 10),
      lines: {
        products: [{ name: 'Roofing Sheet', qty: '1', unitPrice: '5000' }],
        accessories: [],
        services: [],
      },
    },
  });
  expect(qRes.status(), await qRes.text()).toBe(201);
  const { quotationId } = await qRes.json();
  expect(String(quotationId)).toMatch(/^QT-/);

  const rcRes = await page.request.post('/api/ledger/receipt', {
    headers,
    data: {
      customerID,
      quotationId,
      amountNgn: 7000,
      paymentMethod: 'Cash',
      dateISO: new Date().toISOString().slice(0, 10),
    },
  });
  expect(rcRes.status(), await rcRes.text()).toBe(201);

  return { customerID, quotationId, customerName };
}
