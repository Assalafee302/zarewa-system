/**
 * Paths that must respond while schema/seed runs in the bootstrap subprocess.
 * `GET /api/bootstrap` is NOT exempt: running `buildBootstrap` during migrations can block on DB
 * locks until the edge proxy times out (502). The SPA polls `503 STARTING` until `apiReady`.
 * @param {string} originalUrl
 */
export function readinessExemptApiPath(originalUrl) {
  const pathOnly = String(originalUrl || '').split('?')[0].replace(/\/+$/, '') || '/';
  return (
    pathOnly === '/api/health' ||
    pathOnly === '/api/bootstrap-status'
  );
}

/**
 * @param {import('express').Express} app
 * @param {{
 *   apiReady: boolean;
 *   bootstrapFailed?: boolean;
 *   bootstrapExitCode?: number | null;
 *   bootstrapSignal?: string | null;
 *   bootstrapSpawnError?: string | null;
 * }} state
 */
export function attachReadinessGate(app, state) {
  app.use((req, res, next) => {
    if (state.apiReady) return next();
    if (req.method === 'OPTIONS') return next();
    const url = req.originalUrl || '';
    if (readinessExemptApiPath(url)) return next();
    if (url.startsWith('/api/')) {
      res.setHeader('Retry-After', '2');
      if (state.bootstrapFailed) {
        return res.status(503).json({
          ok: false,
          code: 'BOOTSTRAP_FAILED',
          error:
            'Database setup failed on this server. Check API logs, DATABASE_URL, and run npm run db:migrate against this database.',
          detail: state.bootstrapSpawnError
            ? `spawn: ${state.bootstrapSpawnError}`
            : state.bootstrapExitCode != null
              ? `bootstrap exited with code ${state.bootstrapExitCode}`
              : state.bootstrapSignal
                ? `bootstrap killed by signal ${state.bootstrapSignal}`
                : undefined,
        });
      }
      return res.status(503).json({ ok: false, code: 'STARTING', error: 'Server is starting' });
    }
    return next();
  });
}
