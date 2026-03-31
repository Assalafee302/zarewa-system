export const DEFAULT_DASHBOARD_PREFS = {
  showCharts: true,
  showReportsStrip: true,
  showAlertBanner: true,
};

export function loadDashboardPrefs() {
  try {
    const raw = localStorage.getItem('zarewa.dashboard.prefs');
    if (!raw) return { ...DEFAULT_DASHBOARD_PREFS };
    return { ...DEFAULT_DASHBOARD_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_DASHBOARD_PREFS };
  }
}

export function saveDashboardPrefs(prefs) {
  localStorage.setItem(
    'zarewa.dashboard.prefs',
    JSON.stringify({ ...DEFAULT_DASHBOARD_PREFS, ...prefs })
  );
}
