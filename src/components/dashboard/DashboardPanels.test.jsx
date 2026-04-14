import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardQuickActionsPanel } from './DashboardQuickActionsPanel';
import { TopMaterialPerformersPanel } from './TopMaterialPerformersPanel';

describe('dashboard modular panels', () => {
  it('fires quick action callbacks', async () => {
    const user = userEvent.setup();
    const onSalesAction = vi.fn();
    const onOpenProcurement = vi.fn();
    const onOpenOperations = vi.fn();
    const onExpenseRequest = vi.fn();
    render(
      <DashboardQuickActionsPanel
        onSalesAction={onSalesAction}
        onOpenProcurement={onOpenProcurement}
        onOpenOperations={onOpenOperations}
        onExpenseRequest={onExpenseRequest}
      />
    );

    await user.click(screen.getByRole('button', { name: /new quote/i }));
    await user.click(screen.getByRole('button', { name: /new purchase/i }));

    expect(onSalesAction).toHaveBeenCalledWith('quotation');
    expect(onOpenProcurement).toHaveBeenCalled();
  });

  it('renders performer rows and opens sales detail', async () => {
    const user = userEvent.setup();
    const onOpenSales = vi.fn();
    render(
      <TopMaterialPerformersPanel
        rows={[
          {
            rank: 1,
            colour: 'Blue',
            gaugeRaw: '0.45',
            materialType: 'Longspan',
            metresProduced: 1200,
            weightKg: 3200,
            revenueNgn: 450000,
          },
        ]}
        formatNgn={(n) => `₦${Number(n).toLocaleString()}`}
        formatPerformerGauge={() => '0.45 mm'}
        onOpenSales={onOpenSales}
      />
    );

    await user.click(screen.getByRole('button', { name: /sales detail/i }));
    expect(screen.getAllByText(/Longspan/i).length).toBeGreaterThan(0);
    expect(onOpenSales).toHaveBeenCalled();
  });
});

