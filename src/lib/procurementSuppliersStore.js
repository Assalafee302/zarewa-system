import { SUPPLIERS_MOCK } from '../Data/mockData';

const STORAGE_KEY = 'zarewa.procurement.suppliers';

export function loadProcurementSuppliers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p) && p.length > 0) return p;
    }
  } catch {
    /* ignore */
  }
  return SUPPLIERS_MOCK.map((s) => ({ ...s }));
}

export function saveProcurementSuppliers(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
