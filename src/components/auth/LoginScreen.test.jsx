import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginScreen from './LoginScreen.jsx';

const mockLogin = vi.fn();
const mockWorkspace = {
  login: mockLogin,
  status: 'auth_required',
};

vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => mockWorkspace,
}));

describe('LoginScreen', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockWorkspace.status = 'auth_required';
  });

  afterEach(() => {
    cleanup();
  });

  it('submits default seeded credentials', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue({ ok: true });
    render(<LoginScreen />);

    await user.click(screen.getAllByRole('button', { name: /enter workspace/i })[0]);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin', 'Admin@123');
    });
  });

  it('shows backend login errors', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue({ ok: false, error: 'Invalid username or password.' });
    render(<LoginScreen />);

    await user.clear(screen.getByLabelText(/password/i));
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getAllByRole('button', { name: /enter workspace/i })[0]);

    await expect(screen.getByText(/invalid username or password/i)).toBeVisible();
  });
});
