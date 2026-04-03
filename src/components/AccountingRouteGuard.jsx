import React from 'react';
import { Navigate } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import { canAccessAccountingHq } from '../lib/accountingAccess';

/** Restricts HQ Accounting routes to finance-capable executive / finance-lead roles. */
export default function AccountingRouteGuard({ children }) {
  const ws = useWorkspace();
  const perms = ws?.session?.permissions ?? [];
  const user = ws?.session?.user;
  if (!canAccessAccountingHq(perms, user)) {
    return <Navigate to="/" replace state={{ moduleDenied: 'accounting_hq' }} />;
  }
  return children;
}
