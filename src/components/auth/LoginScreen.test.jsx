import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginScreen from './LoginScreen.jsx';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockLogin = vi.fn();
const mockForgotPassword = vi.fn();
const mockResetPassword = vi.fn();
const mockWorkspace = {
  login: mockLogin,
  forgotPassword: mockForgotPassword,
  resetPassword: mockResetPassword,
  status: 'auth_required',
};

vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => mockWorkspace,
}));

describe('LoginScreen', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockForgotPassword.mockReset();
    mockResetPassword.mockReset();
    mockNavigate.mockReset();
    mockWorkspace.status = 'auth_required';
  });

  afterEach(() => {
    cleanup();
  });

  it('submits entered credentials', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue({
      ok: true,
      data: {
        user: { department: 'it' },
        permissions: ['*'],
      },
    });
    render(<LoginScreen />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'Admin@123');
    await user.click(screen.getByRole('button', { name: /enter workspace/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin', 'Admin@123');
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/settings', { replace: true });
    });
  });

  it('shows backend login errors', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue({ ok: false, error: 'Invalid username or password.' });
    render(<LoginScreen />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /enter workspace/i }));

    await expect(screen.getByText(/invalid username or password/i)).toBeVisible();
  });

  it('allows requesting and submitting password reset', async () => {
    const user = userEvent.setup();
    mockForgotPassword.mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        message: 'Reset code created.',
        devResetToken: 'DEV-123456',
      },
    });
    mockResetPassword.mockResolvedValue({
      ok: true,
      data: { ok: true, message: 'Password updated.' },
    });

    render(<LoginScreen />);

    await user.click(screen.getByRole('button', { name: /forgot password\?/i }));

    await user.type(screen.getByLabelText(/username or email/i), 'admin');
    await user.click(screen.getByRole('button', { name: /send reset code/i }));

    // Reset UI should appear.
    await waitFor(() => {
      expect(screen.getByLabelText(/reset code/i)).toBeVisible();
    });

    await user.type(screen.getByLabelText(/new password/i), 'NewPass@123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(mockForgotPassword).toHaveBeenCalledWith('admin');
      expect(mockResetPassword).toHaveBeenCalledWith('admin', 'DEV-123456', 'NewPass@123');
    });
  });
});
