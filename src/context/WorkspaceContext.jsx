/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, apiUrl } from '../lib/apiBase';
import { replaceLedgerEntries } from '../lib/customerLedgerStore';
import { canAccessModuleWithPermissions, hasPermissionInList } from '../lib/moduleAccess';
import { userCanApproveEditMutationsClient } from '../lib/editApprovalUi';

const WorkspaceContext = createContext(null);

const BOOTSTRAP_CACHE_KEY = 'zarewa.bootstrap.cache.v2';

/** First deploy: remote schema + seed often exceeds 2 minutes (was timing out login / bootstrap poll). */
const API_STARTUP_WAIT_MS = 600_000;

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
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [dashboardSummaryEtag, setDashboardSummaryEtag] = useState('');
  const [lastError, setLastError] = useState(null);
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [editApprovalsPendingCount, setEditApprovalsPendingCount] = useState(0);

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

  const refreshDashboardSummary = useCallback(async () => {
    try {
      const headers = dashboardSummaryEtag ? { 'If-None-Match': dashboardSummaryEtag } : {};
      const r = await fetch(apiUrl('/api/dashboard/summary'), {
        method: 'GET',
        credentials: 'include',
        headers,
      });
      if (r.status === 304) return dashboardSummary;
      const data = await r.json().catch(() => null);
      if (r.status === 401 || data?.code === 'AUTH_REQUIRED') {
        setDashboardSummary(null);
        setDashboardSummaryEtag('');
        return null;
      }
      if (!r.ok || !data?.ok) return dashboardSummary;
      const etag = r.headers.get('ETag') || '';
      setDashboardSummary(data);
      setDashboardSummaryEtag(etag);
      return data;
    } catch {
      return dashboardSummary;
    }
  }, [dashboardSummary, dashboardSummaryEtag]);

  const refresh = useCallback(async (opts = {}) => {
    try {
      const mode = String(opts?.mode ?? '').trim();
      const qs = mode ? `?mode=${encodeURIComponent(mode)}` : '';
      const path = `/api/bootstrap${qs}`;
      const maxWaitMs = API_STARTUP_WAIT_MS;
      const pollMs = 400;
      const deadline = Date.now() + maxWaitMs;
      let ok;
      let httpStatus;
      let data;
      while (Date.now() < deadline) {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 45_000);
        let pack;
        try {
          pack = await apiFetch(path, { signal: ctrl.signal });
        } finally {
          clearTimeout(tid);
        }
        ({ ok, status: httpStatus, data } = pack);
        if (httpStatus === 401 || data?.code === 'AUTH_REQUIRED') {
          clearBootstrapCache();
          setStatus('auth_required');
          setSnapshot(null);
          setLastError(null);
          replaceLedgerEntries([]);
          return null;
        }
        const bootstrapStillStarting =
          (httpStatus === 503 && data?.code === 'STARTING') ||
          (data?.ok && data?.bootstrapPhase === 'starting');
        if (bootstrapStillStarting) {
          // Let AuthGate render LoginScreen while we poll (otherwise status stays "checking" forever).
          setStatus('bootstrap_starting');
          await new Promise((r) => setTimeout(r, pollMs));
          continue;
        }
        break;
      }
      if (
        (httpStatus === 503 && data?.code === 'STARTING') ||
        (data?.ok && data?.bootstrapPhase === 'starting')
      ) {
        throw new Error(data?.error || 'Server is still starting (timed out waiting for bootstrap).');
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
        const maxWaitMs = API_STARTUP_WAIT_MS;
        const pollMs = 400;
        const deadline = Date.now() + maxWaitMs;
        let lastData = null;
        while (Date.now() < deadline) {
          const { ok, data } = await apiFetch('/api/session/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
          });
          lastData = data;
          if (ok && data?.ok) {
            // Fast initial render: dashboard summary + dashboard bootstrap first, then full snapshot.
            await refreshDashboardSummary();
            await refresh({ mode: 'dashboard' });
            setTimeout(() => {
              refreshDashboardSummary();
              refresh();
            }, 0);
            return { ok: true, data };
          }
          if (data?.code === 'STARTING') {
            await new Promise((r) => setTimeout(r, pollMs));
            continue;
          }
          if (data?.code === 'BOOTSTRAP_FAILED') {
            const parts = [data?.error, data?.detail].filter(Boolean);
            return { ok: false, error: parts.join(' — ') || 'Database setup failed.' };
          }
          const parts = [data?.error, data?.detail].filter(Boolean);
          return { ok: false, error: parts.join(' — ') || 'Sign-in failed.' };
        }
        if (lastData?.code === 'STARTING') {
          return {
            ok: false,
            error:
              'Server is still starting (timed out waiting for database setup). Check API logs and DATABASE_URL.',
          };
        }
        return { ok: false, error: 'Sign-in failed.' };
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
    [refresh, refreshDashboardSummary]
  );

  const forgotPassword = useCallback(
    async (identifier) => {
      try {
        const { ok, data } = await apiFetch('/api/session/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ identifier }),
        });
        if (!ok || !data?.ok) {
          return { ok: false, error: data?.error || 'Could not request password reset.' };
        }
        return { ok: true, data };
      } catch (e) {
        setStatus('offline');
        setSnapshot(null);
        setLastError(String(e.message || e));
        replaceLedgerEntries([]);
        return {
          ok: false,
          error: 'API server is offline. Start the backend server, then try again.',
        };
      }
    },
    []
  );

  const resetPassword = useCallback(
    async (identifier, token, newPassword) => {
      try {
        const { ok, data } = await apiFetch('/api/session/reset-password', {
          method: 'POST',
          body: JSON.stringify({ identifier, token, newPassword }),
        });
        if (!ok || !data?.ok) {
          return { ok: false, error: data?.error || 'Could not reset password.' };
        }
        return { ok: true, data };
      } catch (e) {
        setStatus('offline');
        setSnapshot(null);
        setLastError(String(e.message || e));
        replaceLedgerEntries([]);
        return {
          ok: false,
          error: 'API server is offline. Start the backend server, then try again.',
        };
      }
    },
    []
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
    setDashboardSummary(null);
    setDashboardSummaryEtag('');
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

  /** @param {{ displayName?: string; email?: string | null; avatarUrl?: string | null }} patch */
  const updateProfile = useCallback(async (patch) => {
    const { ok, data } = await apiFetch('/api/session/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch ?? {}),
    });
    if (!ok || !data?.ok) {
      return { ok: false, error: data?.error || 'Could not update profile.' };
    }
    await refresh();
    return { ok: true, user: data.user };
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

  const getUnifiedWorkItemById = useCallback(
    (workItemId) => {
      const items = Array.isArray(snapshot?.unifiedWorkItems) ? snapshot.unifiedWorkItems : [];
      return items.find((item) => item.id === workItemId || item.referenceNo === workItemId) ?? null;
    },
    [snapshot?.unifiedWorkItems]
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
    (permission) => hasPermissionInList(permissions, permission),
    [permissions]
  );

  const canAccessModule = useCallback(
    (moduleKey) => {
      if (moduleKey === 'edit_approvals') {
        return (
          canAccessModuleWithPermissions(permissions, 'edit_approvals') &&
          userCanApproveEditMutationsClient(session?.user?.roleKey, permissions)
        );
      }
      return canAccessModuleWithPermissions(permissions, moduleKey);
    },
    [permissions, session?.user?.roleKey]
  );

  const refreshEditApprovalsPending = useCallback(async () => {
    const roleKey = session?.user?.roleKey;
    if (
      !userCanApproveEditMutationsClient(roleKey, permissions) ||
      !canAccessModuleWithPermissions(permissions, 'edit_approvals')
    ) {
      setEditApprovalsPendingCount(0);
      return;
    }
    const { ok, data } = await apiFetch('/api/edit-approvals/pending');
    if (ok && data?.ok && Array.isArray(data.items)) {
      setEditApprovalsPendingCount(data.items.length);
    }
  }, [permissions, session?.user?.roleKey]);

  useEffect(() => {
    if (
      status === 'checking' ||
      status === 'auth_required' ||
      status === 'bootstrap_starting'
    ) {
      setEditApprovalsPendingCount(0);
      return;
    }
    void refreshEditApprovalsPending();
    const t = setInterval(() => void refreshEditApprovalsPending(), 45000);
    return () => clearInterval(t);
  }, [status, refreshEditApprovalsPending, refreshEpoch]);

  const canMutate = status === 'ok';
  const usingCachedData = status === 'degraded';
  const hasWorkspaceData = (status === 'ok' || status === 'degraded') && snapshot != null;

  const value = useMemo(
    () => ({
      status,
      snapshot,
      dashboardSummary,
      lastError,
      refresh,
      refreshDashboardSummary,
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
      editApprovalsPendingCount,
      refreshEditApprovalsPending,
      login,
      forgotPassword,
      resetPassword,
      logout,
      changePassword,
      updateProfile,
      updateWorkspace,
      getUnifiedWorkItemById,
    }),
    [
      status,
      snapshot,
      dashboardSummary,
      lastError,
      refresh,
      refreshDashboardSummary,
      refreshEpoch,
      hasWorkspaceData,
      usingCachedData,
      canMutate,
      session,
      permissions,
      hasPermission,
      canAccessModule,
      editApprovalsPendingCount,
      refreshEditApprovalsPending,
      login,
      forgotPassword,
      resetPassword,
      logout,
      changePassword,
      updateProfile,
      updateWorkspace,
      getUnifiedWorkItemById,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
