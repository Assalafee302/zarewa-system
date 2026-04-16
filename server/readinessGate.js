import { anonymousBootstrapStartingStub } from './bootstrapStartingStub.js';

/**
 * Paths that must respond while schema/seed runs in the bootstrap subprocess.
 * `GET /api/bootstrap` is handled below: a **no-DB JSON stub** (HTTP 200 + `bootstrapPhase: 'starting'`)
 * so clients are not blocked on migrations, while the real `buildBootstrap` still runs only after `apiReady`.
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
    const pathOnly = String(url.split('?')[0] || '').replace(/\/+$/, '') || '/';
    if (
      req.method === 'GET' &&
      pathOnly === '/api/bootstrap' &&
      !state.bootstrapFailed
    ) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(anonymousBootstrapStartingStub());
    }
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
