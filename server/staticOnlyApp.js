import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDist = path.join(serverDir, '..', 'dist');

/**
 * Minimal Express app: Vite `dist/` only + stub `/api` routes.
 * No database, no full HTTP API — use to verify the SPA shell loads (blank-page debugging).
 *
 * Enable with `ZAREWA_STATIC_ONLY=1` (see `server/index.js`).
 */
export function createStaticOnlyApp() {
  const app = express();
  if (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') {
    app.set('trust proxy', 1);
  }

  const corsOrigin =
    process.env.CORS_ORIGIN ||
    'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174';
  const isProduction = process.env.NODE_ENV === 'production';
  const allowAllOrigins = corsOrigin === '*' && !isProduction;
  const allowedOrigins =
    corsOrigin === '*'
      ? []
      : corsOrigin.split(',').map((s) => s.trim()).filter(Boolean);

  app.disable('x-powered-by');
  const contentSecurityPolicy =
    process.env.ZAREWA_CSP ||
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'";
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', contentSecurityPolicy);
    next();
  });
  app.use(
    cors({
      origin: allowAllOrigins ? true : allowedOrigins.length > 0 ? allowedOrigins : false,
      credentials: true,
    })
  );

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'zarewa-api',
      mode: 'static-only',
      hint: 'No database or full API. SPA only — for debugging blank page vs backend.',
      time: new Date().toISOString(),
    });
  });

  app.get('/api/bootstrap', (_req, res) => {
    res.status(401).json({ ok: false, code: 'AUTH_REQUIRED' });
  });

  app.get('/api/session', (_req, res) => {
    res.status(401).json({ ok: false, code: 'AUTH_REQUIRED' });
  });

  app.use('/api', (_req, res) => {
    res.status(503).json({
      ok: false,
      error: 'Backend disconnected (ZAREWA_STATIC_ONLY).',
    });
  });

  const staticRoot = path.resolve(process.env.ZAREWA_STATIC_DIR || defaultDist);
  const spaIndex = path.join(staticRoot, 'index.html');
  if (!fs.existsSync(spaIndex)) {
    app.use((_req, res) => {
      res.status(503).type('html').send(
        `<!DOCTYPE html><html><body><p>Missing <code>dist/index.html</code>.</p><p>Run <code>npm run build</code> before start.</p></body></html>`
      );
    });
    return app;
  }

  app.use(
    express.static(staticRoot, {
      index: false,
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
      setHeaders(res, filePath) {
        if (/[/\\]assets[/\\]/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(spaIndex, (err) => (err ? next(err) : undefined));
  });

  return app;
}
