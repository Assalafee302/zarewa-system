import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * Office Desk is consolidated into the workspace home (Dashboard).
 * Deep links and bookmarks to `/office` continue to work.
 */
export default function OfficeDesk() {
  const location = useLocation();
  return <Navigate to="/" replace state={location.state} />;
}
