/**
 * Transport agents for coil purchases (demo persistence).
 */

const STORAGE_KEY = 'zarewa.procurement.agents';

const DEFAULT_AGENTS = [
  { id: 'AG-001', name: 'Kano Haulage Co.', region: 'Kano / North', phone: '0801 000 0001' },
  { id: 'AG-002', name: 'Lagos Freight Ltd.', region: 'Lagos / South-West', phone: '0802 000 0002' },
  { id: 'AG-003', name: 'Abuja Linehaul', region: 'Abuja / Central', phone: '0803 000 0003' },
];

export function loadProcurementAgents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p) && p.length > 0) return p;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_AGENTS.map((a) => ({ ...a }));
}

export function saveProcurementAgents(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
