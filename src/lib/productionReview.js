/** Completed production job still needs manager action (conversion sign-off not recorded). */
export function productionJobNeedsManagerReviewAttention(job) {
  if (!job || job.status !== 'Completed') return false;
  if (job.managerReviewSignedAtISO) return false;
  return (
    Boolean(job.managerReviewRequired) ||
    job.conversionAlertState === 'High' ||
    job.conversionAlertState === 'Low'
  );
}
