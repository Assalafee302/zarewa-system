import { apiFetch } from './apiBase.js';

/** Per-calendar-month baselines for Manager dashboard progress bars (scaled when period is multi-month). */
export const DEFAULT_MANAGER_TARGETS_PER_MONTH = {
  nairaTargetPerMonth: 50_000_000,
  meterTargetPerMonth: 250_000,
};

export const DEFAULT_DASHBOARD_PREFS = {
  showCharts: true,
  showReportsStrip: true,
  showAlertBanner: true,
  /** When true, personal managerTargets apply; when false, company org targets apply when set (see bootstrap orgManagerTargets). */
  managerTargetsPersonalOverride: false,
  managerTargets: { ...DEFAULT_MANAGER_TARGETS_PER_MONTH },
};

function mergeManagerTargets(raw) {
  const m = raw && typeof raw === 'object' ? raw : {};
  const n = Number(m.nairaTargetPerMonth);
  const met = Number(m.meterTargetPerMonth);
  return {
    nairaTargetPerMonth:
      Number.isFinite(n) && n > 0 ? n : DEFAULT_MANAGER_TARGETS_PER_MONTH.nairaTargetPerMonth,
    meterTargetPerMonth:
      Number.isFinite(met) && met > 0 ? met : DEFAULT_MANAGER_TARGETS_PER_MONTH.meterTargetPerMonth,
  };
}

/** Merge server (or saved) blob with defaults. */
export function mergeDashboardPrefs(serverPrefs) {
  const s = serverPrefs && typeof serverPrefs === 'object' ? serverPrefs : {};
  return {
    ...DEFAULT_DASHBOARD_PREFS,
    ...s,
    managerTargetsPersonalOverride: s.managerTargetsPersonalOverride === true,
    managerTargets: mergeManagerTargets(s.managerTargets),
  };
}

/**
 * Monthly ₦ / metres baselines for manager progress bars.
 * Company-wide values (bootstrap `orgManagerTargets`) win unless the user enabled a personal override.
 * @param {unknown} orgManagerTargets
 * @param {ReturnType<typeof mergeDashboardPrefs>} mergedPrefs
 */
export function effectiveManagerTargetsPerMonth(orgManagerTargets, mergedPrefs) {
  const org = orgManagerTargets && typeof orgManagerTargets === 'object' ? orgManagerTargets : {};
  const orgN = Number(org.nairaTargetPerMonth);
  const orgM = Number(org.meterTargetPerMonth);
  const p = mergedPrefs?.managerTargets || DEFAULT_MANAGER_TARGETS_PER_MONTH;
  const def = DEFAULT_MANAGER_TARGETS_PER_MONTH;

  if (mergedPrefs?.managerTargetsPersonalOverride) {
    return {
      nairaTargetPerMonth: Number(p.nairaTargetPerMonth) > 0 ? Number(p.nairaTargetPerMonth) : def.nairaTargetPerMonth,
      meterTargetPerMonth: Number(p.meterTargetPerMonth) > 0 ? Number(p.meterTargetPerMonth) : def.meterTargetPerMonth,
    };
  }

  return {
    nairaTargetPerMonth:
      Number.isFinite(orgN) && orgN > 0
        ? orgN
        : Number(p.nairaTargetPerMonth) > 0
          ? Number(p.nairaTargetPerMonth)
          : def.nairaTargetPerMonth,
    meterTargetPerMonth:
      Number.isFinite(orgM) && orgM > 0
        ? orgM
        : Number(p.meterTargetPerMonth) > 0
          ? Number(p.meterTargetPerMonth)
          : def.meterTargetPerMonth,
  };
}

/** Avoid setState loops when bootstrap re-fetches but prefs values are unchanged. */
export function dashboardPrefsShallowEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.showCharts === b.showCharts &&
    a.showReportsStrip === b.showReportsStrip &&
    a.showAlertBanner === b.showAlertBanner &&
    a.managerTargetsPersonalOverride === b.managerTargetsPersonalOverride &&
    a.managerTargets?.nairaTargetPerMonth === b.managerTargets?.nairaTargetPerMonth &&
    a.managerTargets?.meterTargetPerMonth === b.managerTargets?.meterTargetPerMonth
  );
}

export async function persistDashboardPrefsToServer(prefs) {
  const body = mergeDashboardPrefs(prefs);
  const { ok, data } = await apiFetch('/api/session/dashboard-prefs', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!ok || !data?.ok) {
    throw new Error(data?.error || 'Could not save dashboard preferences.');
  }
  return mergeDashboardPrefs(data.dashboardPrefs);
}
