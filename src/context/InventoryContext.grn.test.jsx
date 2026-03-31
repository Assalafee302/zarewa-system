import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryProvider, useInventory } from './InventoryContext.jsx';

/** Minimal harness: receive one line on first in-transit PO */
function ReceiveHarness() {
  const { purchaseOrders, products, confirmStoreReceipt } = useInventory();
  const po = purchaseOrders.find((p) => p.status === 'In Transit' || p.status === 'On loading');
  const line = po?.lines?.find((l) => l.qtyOrdered > l.qtyReceived);
  const before =
    products.find((p) => p.productID === line?.productID)?.stockLevel ?? null;

  return (
    <div>
      <span data-testid="before">{before != null ? String(before) : 'none'}</span>
      <span data-testid="po">{po?.poID ?? 'none'}</span>
      <button
        type="button"
        onClick={() => {
          if (!po || !line) return;
          const q = Math.min(100, line.qtyOrdered - line.qtyReceived);
          confirmStoreReceipt(po.poID, [
            {
              lineKey: line.lineKey,
              productID: line.productID,
              qtyReceived: q,
              coilNo: 'TEST-COIL-1',
              location: 'Bay test',
            },
          ]);
        }}
      >
        Receive 100kg
      </button>
    </div>
  );
}

describe('InventoryContext GRN', () => {
  it('confirmStoreReceipt increases product stockLevel', async () => {
    const user = userEvent.setup();
    render(
      <InventoryProvider>
        <ReceiveHarness />
      </InventoryProvider>
    );

    const beforeEl = screen.getByTestId('before');
    const before = Number(beforeEl.textContent);
    expect(Number.isFinite(before)).toBe(true);

    await user.click(screen.getByRole('button', { name: /receive 100kg/i }));

    await waitFor(() => {
      const next = Number(screen.getByTestId('before').textContent);
      expect(next).toBeGreaterThanOrEqual(before + 100);
    });
  });
});
