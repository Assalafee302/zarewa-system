/** Whole naira for tables and HR calculators (no kobo). */
export function formatNgn(n) {
  const x = Math.round(Number(n) || 0);
  return x.toLocaleString('en-NG');
}

const HR_STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-700',
  hr_review: 'bg-amber-100 text-amber-950',
  manager_review: 'bg-sky-100 text-sky-900',
  approved: 'bg-emerald-100 text-emerald-900',
  rejected: 'bg-rose-100 text-rose-900',
  locked: 'bg-indigo-100 text-indigo-900',
  paid: 'bg-emerald-100 text-emerald-900',
  overdue: 'bg-rose-100 text-rose-900',
  on_track: 'bg-emerald-100 text-emerald-900',
};

/** Tailwind class for HR / payroll status chips (shared across HR pages). */
export function statusChipClass(status, fallback = 'bg-slate-100 text-slate-700') {
  return HR_STATUS_STYLES[String(status || '').trim().toLowerCase()] || fallback;
}
