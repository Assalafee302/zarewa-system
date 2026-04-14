/**
 * Resolve the Office thread id for a unified work item (memo / correspondence).
 * @param {Record<string, unknown>} item
 * @returns {string}
 */
export function officeThreadIdFromWorkItem(item) {
  if (!item) return '';
  const linked = String(item.linkedThreadId || '').trim();
  if (linked) return linked;
  if (String(item.sourceKind || '').trim() === 'office_thread') {
    return String(item.sourceId || '').trim();
  }
  const st = item.routeState && typeof item.routeState === 'object' ? item.routeState.selectedThreadId : '';
  if (String(st || '').trim()) return String(st).trim();
  const oid = item.data?.officeThreadId;
  if (oid) return String(oid).trim();
  return '';
}
