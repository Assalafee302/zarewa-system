import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import { pathToModuleKey } from '../lib/departmentWorkspace';

/**
 * Redirects to dashboard when the signed-in user lacks module permissions.
 * Does not replace server-side checks; prevents confusing empty or error states from deep links.
 */
export default function ModuleRouteGuard({ moduleKey, children }) {
  const ws = useWorkspace();
  const location = useLocation();
  const key = moduleKey ?? pathToModuleKey(location.pathname);
  if (key && ws?.canAccessModule && !ws.canAccessModule(key)) {
    return <Navigate to="/" replace state={{ moduleDenied: key }} />;
  }
  return children;
}
