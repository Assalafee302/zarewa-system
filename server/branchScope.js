import { canUseAllBranchesRollup } from './auth.js';
import { DEFAULT_BRANCH_ID } from './branches.js';

/**
 * @param {{ workspaceBranchId?: string; workspaceViewAll?: boolean; user?: object | null }} req
 * @returns {'ALL' | string}
 */
export function resolveBootstrapBranchScope(req) {
  if (req.workspaceViewAll && canUseAllBranchesRollup(req.user)) {
    return 'ALL';
  }
  return String(req.workspaceBranchId || '').trim() || DEFAULT_BRANCH_ID;
}
