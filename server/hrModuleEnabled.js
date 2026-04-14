/**
 * Product HR features (requests, reviews, discipline queue items, scheduled HR ticks,
 * bootstrap `hrPerformanceReviews`, AI "hr" mode) are off unless opted in.
 *
 * Staff tables such as `hr_staff_profiles` may still be used for office scoping and imports;
 * set `ZAREWA_HR_ENABLED=1` to restore legacy HR behaviour.
 */
export function isHrProductModuleEnabled() {
  return String(process.env.ZAREWA_HR_ENABLED || '').trim() === '1';
}
