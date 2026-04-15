/**
 * Paths that must respond while schema/seed runs in the bootstrap subprocess.
 * Otherwise the SPA cannot sign in (or reset password) until apiReady flips.
 * @param {string} originalUrl
 */
export function readinessExemptApiPath(originalUrl) {
  const pathOnly = String(originalUrl || '').split('?')[0];
  return (
    pathOnly === '/api/health' ||
    pathOnly === '/api/session/login' ||
    pathOnly === '/api/session/forgot-password' ||
    pathOnly === '/api/session/reset-password' ||
    // Lets the SPA resolve auth (401) immediately while schema/seed runs; requireAuth runs before bootstrap body.
    pathOnly === '/api/bootstrap'
  );
}

/**
 * @param {import('express').Express} app
 * @param {{ apiReady: boolean }} state
 */
export function attachReadinessGate(app, state) {
  app.use((req, res, next) => {
    if (state.apiReady) return next();
    if (req.method === 'OPTIONS') return next();
    const url = req.originalUrl || '';
    if (readinessExemptApiPath(url)) return next();
    if (url.startsWith('/api/')) {
      res.setHeader('Retry-After', '2');
      return res.status(503).json({ ok: false, code: 'STARTING', error: 'Server is starting' });
    }
    return next();
  });
}
