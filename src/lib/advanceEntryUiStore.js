/**
 * UI-only: hide ADVANCE_IN rows from Sales sidebar after user links/applies them (demo).
 * Ledger rows remain; list is filtered for clarity.
 */
const KEY = 'zarewa.advanceInDismissedIds.v1';

export function loadDismissedAdvanceIds() {
  try {
    const raw = localStorage.getItem(KEY);
    const p = JSON.parse(raw || '[]');
    return Array.isArray(p) ? new Set(p.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function dismissAdvanceEntryId(entryId) {
  const id = String(entryId);
  const set = loadDismissedAdvanceIds();
  set.add(id);
  localStorage.setItem(KEY, JSON.stringify([...set]));
}

export function clearDismissedAdvanceIds() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
