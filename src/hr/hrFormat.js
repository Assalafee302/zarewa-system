/** Whole naira for tables and HR calculators (no kobo). */
export function formatNgn(n) {
  const x = Math.round(Number(n) || 0);
  return x.toLocaleString('en-NG');
}
