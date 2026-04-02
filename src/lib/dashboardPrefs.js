import { apiFetch } from './apiBase';

export const DEFAULT_DASHBOARD_PREFS = {
  showCharts: true,
  showReportsStrip: true,
  showAlertBanner: true,
};

/** Merge server (or saved) blob with defaults. */
export function mergeDashboardPrefs(serverPrefs) {
  const s = serverPrefs && typeof serverPrefs === 'object' ? serverPrefs : {};
  return {
    ...DEFAULT_DASHBOARD_PREFS,
    ...s,
  };
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
