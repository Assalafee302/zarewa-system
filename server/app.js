import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { registerHttpApi } from './httpApi.js';
import { attachAuthContext } from './auth.js';

/**
 * @param {string} pathOnly Express `req.path` (pathname only).
 * @returns {boolean}
 */
function isPublicStaticAssetPath(pathOnly) {
  if (pathOnly.startsWith('/assets/')) return true;
  return /\.(js|mjs|cjs|css|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|json|webmanifest)$/i.test(
    pathOnly
  );
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{
 *   beforeRegisterHttpApi?: (app: import('express').Express) => void;
 *   bootState?: { apiReady: boolean; bootstrapFailed?: boolean };
 * }} [opts]
 */
export function createApp(db, opts = {}) {
  const app = express();
  // Platform probes (Railway, Render, etc.): must bypass CORS, auth, and the STARTING gate.
  // Use plain text so no middleware chain is required.
  app.get('/health', (_req, res) => {
    res.status(200).type('text/plain').send('ok');
  });
  app.use(express.json({ limit: '2mb' }));

  // Dev default: allow common Vite ports (5173/5174) on localhost + 127.0.0.1.
  const corsOrigin =
    process.env.CORS_ORIGIN ||
    'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174';
  // Disallow permissive CORS in production by default.
  const isProduction = process.env.NODE_ENV === 'production';
  const allowAllOrigins = corsOrigin === '*' && !isProduction;
  const allowedOrigins = (corsOrigin === '*'
    ? []
    : corsOrigin.split(',').map((s) => s.trim()).filter(Boolean)
  ).filter(Boolean);

  app.disable('x-powered-by');
  const contentSecurityPolicy =
    process.env.ZAREWA_CSP ||
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self';";
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', contentSecurityPolicy);
    next();
  });
  if (allowAllOrigins) {
    app.use(cors({ origin: true, credentials: true }));
  } else {
    // Per-request host so SPA+API on the same Railway hostname passes CORS when the browser sends Origin.
    app.use((req, res, next) => {
      const forwardedHost = String(req.get('x-forwarded-host') || req.get('host') || '')
        .split(',')[0]
        .trim();
      cors({
        origin(origin, callback) {
          if (!origin) return callback(null, true);
          if (allowedOrigins.includes(origin)) return callback(null, true);
          if (forwardedHost) {
            try {
              const u = new URL(origin);
              const reqHost = forwardedHost.split(':')[0];
              if (u.hostname === reqHost) return callback(null, true);
            } catch {
              /* ignore */
            }
          }
          return callback(new Error('CORS not allowed'));
        },
        credentials: true,
      })(req, res, next);
    });
  }
  app.use(attachAuthContext(db));
  if (typeof opts.beforeRegisterHttpApi === 'function') {
    opts.beforeRegisterHttpApi(app);
  }

  registerHttpApi(app, db, { bootState: opts.bootState });

  const staticRoot = path.resolve(
    process.env.ZAREWA_STATIC_DIR || path.join(process.cwd(), 'dist')
  );
  const spaIndex = path.join(staticRoot, 'index.html');
  if (fs.existsSync(spaIndex)) {
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
      // If a hashed asset is missing, do not send index.html (browser would execute HTML as JS → blank page).
      if (isPublicStaticAssetPath(req.path)) return next();
      res.sendFile(spaIndex, (err) => (err ? next(err) : undefined));
    });
  }

  return app;
}
