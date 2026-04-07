import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { registerHttpApi } from './httpApi.js';
import { attachAuthContext } from './auth.js';

/**
 * @param {import('better-sqlite3').Database} db
 */
export function createApp(db) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Dev default: allow common Vite ports (5173/5174) on localhost + 127.0.0.1.
  const corsOrigin =
    process.env.CORS_ORIGIN ||
    'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174';
  // Disallow permissive CORS in production by default.
  const isProduction = process.env.NODE_ENV === 'production';
  const allowAllOrigins = corsOrigin === '*' && !isProduction;
  const allowedOrigins =
    corsOrigin === '*'
      ? []
      : corsOrigin.split(',').map((s) => s.trim()).filter(Boolean);

  app.disable('x-powered-by');
  const contentSecurityPolicy =
    process.env.ZAREWA_CSP ||
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'";
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
  app.use(attachAuthContext(db));

  registerHttpApi(app, db);

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
      res.sendFile(spaIndex, (err) => (err ? next(err) : undefined));
    });
  }

  return app;
}
