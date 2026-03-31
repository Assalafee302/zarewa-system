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

  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  app.use(
    cors({
      origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((s) => s.trim()),
      credentials: true,
    })
  );
  app.use(attachAuthContext(db));

  registerHttpApi(app, db);
  return app;
}
