/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/apiBase';
import { useWorkspace } from './WorkspaceContext';

const HrWorkspaceContext = createContext(null);

const DEFAULT_CAPS = {
  canViewDirectory: false,
  canPayroll: false,
  canManageStaff: false,
  canUploadAttendance: false,
  canMarkDailyRoll: false,
  canLoanMaint: false,
  canViewSensitiveHr: false,
  canCompliance: false,
};

/** Mirrors server `hrCapsForUser` so bootstrap permissions still apply if /api/hr/caps fails. */
function hrCapsFromSessionPermissions(hasPermission) {
  const has = (p) => hasPermission(p);
  const star = has('*');
  return {
    ok: true,
    canViewDirectory:
      star ||
      has('hr.directory.view') ||
      has('hr.view_directory') ||
      has('settings.view') ||
      has('audit.view'),
    canPayroll: star || has('hr.payroll.manage') || has('hr.payroll') || has('finance.pay'),
    canManageStaff: star || has('hr.staff.manage') || has('hr.manage') || has('settings.view'),
    canUploadAttendance:
      star || has('hr.attendance.upload') || has('hr.attendance') || has('operations.manage'),
    canMarkDailyRoll:
      star ||
      has('hr.attendance.upload') ||
      has('hr.daily_roll.mark') ||
      has('hr.payroll.manage'),
    canLoanMaint:
      star ||
      has('hr.staff.manage') ||
      has('hr.requests.final_approve') ||
      has('hr.loan_maintain') ||
      has('finance.approve'),
    canHrReview: star || has('hr.requests.hr_review') || has('hr.manage'),
    canFinalApprove:
      star || has('hr.requests.final_approve') || has('hr.requests.gm_approve') || has('finance.approve'),
    canGmHrApprove: star || has('hr.requests.gm_approve') || has('hr.requests.final_approve'),
    canBranchEndorse: star || has('hr.branch.endorse_staff'),
    canIssueLetters: star || has('hr.letters.generate') || has('hr.manage'),
    canViewSensitiveHr:
      star || has('hr.staff.manage') || has('hr.manage') || has('hr.payroll.manage'),
    canCompliance: star || has('hr.manage') || has('hr.staff.manage') || has('audit.view'),
  };
}

function mergeHrCaps(apiPayload, fromSession) {
  if (!apiPayload?.ok) return { ...fromSession, enabled: apiPayload?.enabled };
  return {
    ...apiPayload,
    canViewDirectory: apiPayload.canViewDirectory || fromSession.canViewDirectory,
    canPayroll: apiPayload.canPayroll || fromSession.canPayroll,
    canManageStaff: apiPayload.canManageStaff || fromSession.canManageStaff,
    canUploadAttendance: apiPayload.canUploadAttendance || fromSession.canUploadAttendance,
    canMarkDailyRoll: apiPayload.canMarkDailyRoll || fromSession.canMarkDailyRoll,
    canLoanMaint: apiPayload.canLoanMaint || fromSession.canLoanMaint,
    canHrReview: apiPayload.canHrReview || fromSession.canHrReview,
    canFinalApprove: apiPayload.canFinalApprove || fromSession.canFinalApprove,
    canGmHrApprove: apiPayload.canGmHrApprove || fromSession.canGmHrApprove,
    canBranchEndorse: apiPayload.canBranchEndorse || fromSession.canBranchEndorse,
    canIssueLetters: apiPayload.canIssueLetters || fromSession.canIssueLetters,
    canViewSensitiveHr: apiPayload.canViewSensitiveHr || fromSession.canViewSensitiveHr,
    canCompliance: apiPayload.canCompliance || fromSession.canCompliance,
  };
}

export function HrWorkspaceProvider({ children }) {
  const { hasPermission } = useWorkspace();
  const [caps, setCaps] = useState(null);
  const [capsError, setCapsError] = useState(null);

  const reloadCaps = useCallback(async () => {
    const fromSession = hrCapsFromSessionPermissions(hasPermission);
    const { ok, data } = await apiFetch('/api/hr/caps');
    if (ok && data?.ok) {
      setCaps(mergeHrCaps(data, fromSession));
      setCapsError(null);
    } else {
      setCaps({ ...fromSession, enabled: data?.enabled });
      setCapsError(data?.error || 'Could not load HR permissions.');
    }
  }, [hasPermission]);

   
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
