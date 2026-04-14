import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SalesRowMenu } from './SalesRowMenu';

describe('SalesRowMenu', () => {
  it('opens and executes View action', async () => {
    const user = userEvent.setup();
    const setOpenKey = vi.fn();
    const onView = vi.fn();
    render(
      <SalesRowMenu
        rowKey="q-1"
        openKey="q-1"
        setOpenKey={setOpenKey}
        onView={onView}
        onEdit={vi.fn()}
        editDisabled={false}
        editTitle=""
      />
    );

    await user.click(screen.getByRole('menuitem', { name: /view/i }));
    expect(onView).toHaveBeenCalled();
    expect(setOpenKey).toHaveBeenCalledWith(null);
  });
});

