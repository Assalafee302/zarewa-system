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
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
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
  return app;
}
