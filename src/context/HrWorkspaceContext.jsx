/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/apiBase';

const HrWorkspaceContext = createContext(null);

const DEFAULT_CAPS = {
  canViewDirectory: false,
  canPayroll: false,
  canManageStaff: false,
  canUploadAttendance: false,
  canLoanMaint: false,
};

export function HrWorkspaceProvider({ children }) {
  const [caps, setCaps] = useState(null);
  const [capsError, setCapsError] = useState(null);

  const reloadCaps = useCallback(async () => {
    const { ok, data } = await apiFetch('/api/hr/caps');
    if (ok && data?.ok) {
      setCaps(data);
      setCapsError(null);
    } else {
      setCaps(DEFAULT_CAPS);
      setCapsError(data?.error || 'Could not load HR permissions.');
    }
  }, []);

  useEffect(() => {
    reloadCaps();
  }, [reloadCaps]);

  const value = useMemo(
    () => ({ caps, capsError, reloadCaps }),
    [caps, capsError, reloadCaps]
  );

  return <HrWorkspaceContext.Provider value={value}>{children}</HrWorkspaceContext.Provider>;
}

export function useHrWorkspace() {
  const ctx = useContext(HrWorkspaceContext);
  if (!ctx) {
    throw new Error('useHrWorkspace must be used within HrWorkspaceProvider');
  }
  return ctx;
}
