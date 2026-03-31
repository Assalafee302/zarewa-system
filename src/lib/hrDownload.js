import { apiUrl } from './apiBase';

/** Payroll treasury pack is CSV (not JSON) — download with session cookie. */
export async function downloadPayrollTreasuryPack(runId) {
  const path = `/api/hr/payroll-runs/${encodeURIComponent(runId)}/treasury-pack`;
  const r = await fetch(apiUrl(path), { credentials: 'include' });
  if (!r.ok) {
    let err = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      if (j?.error) err = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(err);
  }
  const cd = r.headers.get('Content-Disposition') || '';
  const m = /filename="([^"]+)"/.exec(cd);
  const filename = m ? m[1] : `payroll-treasury-${runId}.csv`;
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
