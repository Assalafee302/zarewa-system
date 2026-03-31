/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, apiUrl } from '../lib/apiBase';
import { replaceLedgerEntries } from '../lib/customerLedgerStore';

const WorkspaceContext = createContext(null);

const BOOTSTRAP_CACHE_KEY = 'zarewa.bootstrap.cache.v1';

function readBootstrapCache() {
  try {
    const raw = sessionStorage.getItem(BOOTSTRAP_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.ok) return null;
    if (!data.session?.user) return null;
    return data;
  } catch {
    return null;
  }
}

function writeBootstrapCache(data) {
  try {
    if (data?.ok && data?.session?.user) {
      sessionStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(data));
    }
  } catch {
    /* ignore */
  }
}

function clearBootstrapCache() {
  try {
    sessionStorage.removeItem(BOOTSTRAP_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function WorkspaceProvider({ children }) {
  const [status, setStatus] = useState('checking');
  const [snapshot, setSnapshot] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [refreshEpoch, setRefreshEpoch] = useState(0);

  const applySnapshot = useCallback((data, mode = 'ok') => {
    setSnapshot(data);
    setStatus(mode);
    setLastError(null);
    if (Array.isArray(data?.ledgerEntries)) {
      replaceLedgerEntries(data.ledgerEntries);
    }
    if (mode === 'ok') {
      writeBootstrapCache(data);
    }
    setRefreshEpoch((n) => n + 1);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { ok, status: httpStatus, data } = await apiFetch('/api/bootstrap');
      if (httpStatus === 401 || data?.code === 'AUTH_REQUIRED') {
        clearBootstrapCache();
        setStatus('auth_required');
        setSnapshot(null);
        setLastError(null);
        replaceLedgerEntries([]);
        return null;
      }
      if (!ok || !data?.ok) throw new Error(data?.error || 'Bootstrap failed');
      return applySnapshot(data, 'ok');
    } catch (e) {
      const cached = readBootstrapCache();
      if (cached) {
        setLastError(String(e.message || e));
        return applySnapshot(cached, 'degraded');
      }
      setStatus('offline');
      setSnapshot(null);
      setLastError(String(e.message || e));
      return null;
    }
  }, [applySnapshot]);

  const login = useCallback(
    async (username, password) => {
      try {
        const { ok, data } = await apiFetch('/api/session/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });
        if (!ok || !data?.ok) {
          return { ok: false, error: data?.error || 'Sign-in failed.' };
        }
        await refresh();
        return { ok: true, data };
      } catch (e) {
        setStatus('offline');
        setSnapshot(null);
        setLastError(String(e.message || e));
        replaceLedgerEntries([]);
        return {
          ok: false,
          error: 'API server is offline. Start the backend server, then sign in again.',
        };
      }
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/session/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    replaceLedgerEntries([]);
    clearBootstrapCache();
    setSnapshot(null);
    setLastError(null);
    setStatus('auth_required');
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const { ok, data } = await apiFetch('/api/session/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!ok || !data?.ok) {
      return { ok: false, error: data?.error || 'Could not change password.' };
    }
    await refresh();
    return { ok: true };
  }, [refresh]);

  /** @param {{ currentBranchId?: string; viewAllBranches?: boolean }} patch */
  const updateWorkspace = useCallback(
    async (patch) => {
      const { ok, data } = await apiFetch('/api/session/workspace', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (!ok || !data?.ok) {
        return { ok: false, error: data?.error || 'Could not update workspace.' };
      }
      await refresh();
      return { ok: true, data };
    },
    [refresh]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const session = snapshot?.session ?? null;
  const permissions = useMemo(
    () => snapshot?.permissions ?? session?.permissions ?? [],
    [snapshot?.permissions, session?.permissions]
  );

  const hasPermission = useCallback(
    (permission) => permissions.includes('*') || permissions.includes(permission),
    [permissions]
  );

  const canAccessModule = useCallback(
    (moduleKey) => {
      switch (moduleKey) {
        case 'sales':
          return (
            hasPermission('sales.view') ||
            hasPermission('sales.manage') ||
            hasPermission('quotations.manage') ||
            hasPermission('receipts.post')
          );
        case 'procurement':
          return hasPermission('procurement.view') || hasPermission('purchase_orders.manage');
        case 'operations':
          return hasPermission('operations.view') || hasPermission('production.manage');
        case 'finance':
          return hasPermission('finance.view') || hasPermission('finance.post') || hasPermission('finance.pay');
        case 'reports':
          return hasPermission('reports.view');
        case 'settings':
          return hasPermission('settings.view') || hasPermission('audit.view') || hasPermission('period.manage');
        default:
          return true;
      }
    },
    [hasPermission]
  );

  const canMutate = status === 'ok';
  const usingCachedData = status === 'degraded';
  const hasWorkspaceData = (status === 'ok' || status === 'degraded') && snapshot != null;

  const value = useMemo(
    () => ({
      status,
      snapshot,
      lastError,
      refresh,
      refreshEpoch,
      /** Live server reachable — reads and writes go to API. */
      apiOnline: status === 'ok',
      /** Bootstrap loaded (live or last cached sync in this tab). */
      hasWorkspaceData,
      /** Last successful bootstrap in this browser tab (read-only when server drops). */
      usingCachedData,
      /** POST/PATCH allowed (not read-only degraded mode). */
      canMutate,
      apiUrl,
      authRequired: status === 'auth_required',
      session,
      permissions,
      hasPermission,
      canAccessModule,
      login,
      logout,
      changePassword,
      updateWorkspace,
    }),
    [
      status,
      snapshot,
      lastError,
      refresh,
      refreshEpoch,
      hasWorkspaceData,
      usingCachedData,
      canMutate,
      session,
      permissions,
      hasPermission,
      canAccessModule,
      login,
      logout,
      changePassword,
      updateWorkspace,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
